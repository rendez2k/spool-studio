import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {handleLibrary} from '../server/library.mjs';
import {handleSpoolmanSync} from '../server/spoolman-sync.mjs';
import {localDatabase} from '../scripts/local-db.mjs';
import {syncOnce, configuration} from '../scripts/spoolman-bridge.mjs';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {Resvg} from '@resvg/resvg-js';
import {RGBLuminanceSource, BinaryBitmap, HybridBinarizer, QRCodeReader, DecodeHintType} from '@zxing/library';
import {createHash} from 'node:crypto';
import jsQR from 'jsqr';
const require = createRequire(import.meta.url), core = require('../out/reels-core.js'), labels = require('../out/labels-core.js');
const spool = {brand:'Example',product:'PLA',material:'PLA',finish:'standard',colour:'White',hex:'#FFFFFF',spools:2,weightGrams:1000,packaging:'spooled',date:'2026-09-10',notes:''};
const request = (user, body) => new Request('https://test.example/api/library', {method:body?'POST':'GET', headers:{'oai-authenticated-user-id':user,Origin:'https://test.example','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
const command = (revision,kind,extra={}) => ({baseRevision:revision,requestId:crypto.randomUUID(),expectedAccountKey:'user_alice',kind,...extra});

test('permanent IDs initialise once, skip unknown quantities, survive edits and track partial use', async () => {
 const DB=localDatabase(), act=body=>handleLibrary(request('user_alice',body),{DB});
 try {
  let state=await (await act(command(1,'add',{spool}))).json();
  state=await (await act(command(state.revision,'add',{spool:{...spool,spools:null}}))).json();
  state=await (await act(command(state.revision,'initialise-reels'))).json();
  assert.equal(state.reels.length,2); const ids=state.reels.map(reel=>reel.id);
  state=await (await act(command(state.revision,'initialise-reels'))).json();assert.deepEqual(state.reels.map(reel=>reel.id),ids);
  state=await (await act(command(state.revision,'reel',{reel:{...state.reels[0],used:true}}))).json();
  assert.equal(state.items[0].used,false);assert.equal(core.rows(state.items,state.reels)[0].spools,1);
  const original=state.reels.map(({id,used})=>({id,used}));
  state=await (await act(command(state.revision,'usage',{changes:[{id:state.items[0].id,used:true}]}))).json();
  state=await (await act(command(state.revision,'usage',{changes:[{id:state.items[0].id,used:false,reelStates:original}]}))).json();
  assert.deepEqual(state.reels.map(({id,used})=>({id,used})),original);
  assert.equal((await act(command(state.revision,'edit',{id:state.items[0].id,spool:{...spool,spools:1}}))).status,400);
  state=await (await act(command(state.revision,'usage',{changes:[{id:state.items[0].id,used:true}]}))).json();
  state=await (await act(command(state.revision,'edit',{id:state.items[0].id,spool:{...spool,spools:3}}))).json();
  assert.deepEqual(state.reels.slice(0,2).map(reel=>reel.id),ids);assert.equal(state.reels[2].used,false);assert.equal(state.reels[2].number,3);assert.equal(state.items[0].used,false);
  assert.equal((await handleLibrary(request('user_bob',command(1,'reel',{expectedAccountKey:'user_bob',reel:state.reels[0]})),{DB})).status,400);
  assert.equal((await act(command(state.revision,'bridge-create',{expectedAccountKey:'user_bob'}))).status,409);
 } finally {DB.close();}
});

test('bridge credentials are scoped, hashed, revocable and only apply linked absolute weights',async()=>{
 const DB=localDatabase(),act=body=>handleLibrary(request('user_alice',body),{DB});
 try {
  let state=await (await act(command(1,'add',{spool}))).json();
  state=await (await act(command(state.revision,'initialise-reels'))).json();
  state=await (await act(command(state.revision,'reel',{reel:{...state.reels[0],spoolmanId:17}}))).json();
  assert.equal((await act(command(state.revision,'reel',{reel:{...state.reels[1],spoolmanId:17}}))).status,400);
  state=await (await act(command(state.revision,'bridge-create'))).json();
  const token=state.bridgeToken,seq=Date.now();
  assert(token);assert.equal((await (await act()).json()).bridgeToken,undefined);
  const persisted=await DB.prepare('SELECT payload FROM libraries WHERE user_id = ?').bind('user_alice').first();assert(!persisted.payload.includes(token));
  const sync=(sequence,weight,credential=token)=>handleSpoolmanSync(new Request('https://test.example/api/spoolman-sync',{method:'POST',headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json'},body:JSON.stringify({sequence,spools:[{id:17,remainingGrams:weight},{id:99,remainingGrams:0}]})}),{DB});
  assert.equal((await sync(seq,450,token.slice(0,-1)+'x')).status,401);
  assert.equal((await sync(seq,-1)).status,400);
  assert.equal((await sync(seq,450)).status,200);
  assert.equal((await (await sync(seq,400)).json()).ignored,true);
  state=await (await act()).json();assert.equal(state.reels[0].remainingGrams,450);assert.equal(state.reels[1].remainingGrams,null);
  assert.equal((await act(command(state.revision,'reel',{reel:{...state.reels[0],remainingGrams:100}}))).status,400);
  await sync(seq+1,0);state=await (await act()).json();assert(state.reels[0].used);assert(!state.items[0].used);
  await sync(seq+2,300);state=await (await act()).json();assert(state.reels[0].used);
  state=await (await act(command(state.revision,'bridge-revoke'))).json();assert(!state.bridge.enabled);assert.equal((await sync(seq+3,100)).status,401);
 }finally{DB.close()}
});

test('paired QR labels retain UUID when shelf positions change and contain no inventory or credential',()=>{
 const id=crypto.randomUUID(),row={reelId:id,reelNumber:7,position:2,shelf:1,shelfSlot:2,colour:'White',brand:'Example',material:'PLA'};
 const first=labels.plan({accountKey:'user_alice',slots:[row]},{start:1,end:1,copies:2});
 assert.deepEqual(first[0],first[1]);assert.equal(core.label(first[0].reelNumber),'SP-00007');
 const second=labels.plan({accountKey:'user_alice',slots:[{...row,position:99}]},{start:1,end:1,copies:1});
 assert.equal(first[0].reelId,second[0].reelId);assert.equal(core.url('https://test.example',id),'https://test.example/reels.html#r='+id);
 assert.throws(()=>core.url('https://test.example','<script>'));
});

test('local bridge never controls printer, forwards only IDs and absolute weights, and protects credential redirects',async()=>{
 const config={origin:'https://test.example',spoolmanUrl:'http://localhost:7912',token:btoa('user_alice')+'.'+crypto.randomUUID()+crypto.randomUUID()};
 const calls=[];const transport=async(url,options)=>{calls.push({url,options});return calls.length===1?Response.json([{id:17,remaining_weight:321,comment:'private source data',filament:{name:'private'}}]):Response.json({updated:1})};
 assert.deepEqual(await syncOnce(config,transport,()=>100),{updated:1,ignored:false,empty:false});
 assert.equal(calls[0].options.headers.Authorization,undefined);assert.equal(calls[0].options.redirect,'error');assert.equal(calls[1].options.redirect,'error');
 assert.deepEqual(JSON.parse(calls[1].options.body),{sequence:100,spools:[{id:17,remainingGrams:321}]});
 assert.throws(()=>configuration({...config,origin:'http://test.example'}));
 assert.throws(()=>configuration({...config,spoolmanUrl:'http://localhost:7912/api'}));
 await assert.rejects(syncOnce(config,async()=>Response.json([{id:1,remaining_weight:-1}])) ,/invalid weight/);
});

test('classic and rounded printed QR images decode at 203 and 300 dpi, including thresholded thermal output',()=>{
 const context=vm.createContext({});vm.runInContext(readFileSync(new URL('../out/vendor/qrcode.js',import.meta.url),'utf8'),context);
 const ids=['f69dadc1-c430-46f8-9306-6a308110a94c','b5f5c5d6-201f-4824-8ae2-15d76580b7ab','56829fdb-0799-4e3d-a80d-b03f1aad4cb7',...Array.from({length:20},(_,index)=>{
  const hex=createHash('sha256').update('spool-label-fixture-'+index).digest('hex');
  return hex.slice(0,8)+'-'+hex.slice(8,12)+'-4'+hex.slice(13,16)+'-a'+hex.slice(17,20)+'-'+hex.slice(20,32);
 })];
 for(const id of ids){
  const url=core.url('https://spool-studio.uk',id),code=context.qrcode(0,'M');code.addData(url);code.make();
  for(const style of ['square','rounded']){
  const svg=labels.qrSvg(code,style);
  if(style==='square')assert.match(svg,/shape-rendering="crispEdges"/);
  else assert.match(svg,/viewBox="0 0/);
  for(const width of [160,236]){
   const rendered=new Resvg(svg,{background:'#ffffff',fitTo:{mode:'width',value:width}}).render();
   const pixels=rendered.pixels,grey=new Uint8ClampedArray(rendered.width*rendered.height);
   for(let index=0;index<grey.length;index++)grey[index]=pixels[index*4+3]===0?255:pixels[index*4];
   const margin=Math.floor(width*4/(code.getModuleCount()+8));
   for(let row=0;row<rendered.height;row++)for(let column=0;column<rendered.width;column++){
    if(row<margin||column<margin||row>=rendered.height-margin||column>=rendered.width-margin)assert.equal(grey[row*rendered.width+column],255);
   }
   for(const threshold of [false,true]){
   const image=new Uint8ClampedArray(pixels),luminance=new Uint8ClampedArray(grey);
   if(threshold)for(let index=0;index<luminance.length;index++){
    luminance[index]=luminance[index]<128?0:255;
    image[index*4]=image[index*4+1]=image[index*4+2]=luminance[index];image[index*4+3]=255;
   }
   const bitmap=new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance,rendered.width,rendered.height)));
   try{
    assert.equal(jsQR(image,rendered.width,rendered.height)?.data,url);
    assert.equal(new QRCodeReader().decode(bitmap,new Map([[DecodeHintType.PURE_BARCODE,true]])).getText(),url);
   }catch(error){throw Error('QR fixture '+id+' / '+style+' / threshold '+threshold+' failed at '+width+' pixels',{cause:error})}
   }
  }
  }
 }
 assert.match(readFileSync(new URL('../out/labels.js',import.meta.url),'utf8'),/holder.innerHTML=SpoolLabels.qrSvg\(code,node\('label-qr-style'\).value\)/);
});
