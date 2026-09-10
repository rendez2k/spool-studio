import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {prepareTransfer, importSpools} from '../scripts/spoolman-import.mjs';
import {linkSpoolman} from '../server/spoolman-mapping.mjs';
import {handleLibrary} from '../server/library.mjs';
import {localDatabase} from '../scripts/local-db.mjs';
const transfer = createRequire(import.meta.url)('../out/spoolman-transfer.js');
function fixture() {
  const item = {id:'white',brand:'Example',product:'PLA Basic',material:'PLA',finish:'standard',colour:'White',hex:'#FFFFFF',weightGrams:1000,notes:'Never exported',messageId:'private-mail',order:'private-order'};
  const reels = [1,2].map(number=>({id:crypto.randomUUID(),number,itemId:'white',remainingGrams:600,spoolmanId:null,used:false,location:'Private location'}));
  return {accountKey:'user_alice',items:[item],reels,bridge:{token:'Never exported'}};
}
function exported(library=fixture()) {const value=transfer.manifest(library,'https://test.example');value.materials.PLA={density:1.24,diameter:1.75};return value;}
function spoolman() {
  const data={spool:[],filament:[],vendor:[]}, calls=[];
  return {data,calls,transport:async(url,options)=>{
    assert.equal(new URL(url).origin,'http://localhost:7912');assert.equal(options.redirect,'error');
    const kind=new URL(url).pathname.split('/').at(-1);assert(Object.hasOwn(data,kind));calls.push({kind,method:options.method});
    if(options.method==='POST'){const body=JSON.parse(options.body),record={...body,id:data[kind].length+1};data[kind].push(record);return Response.json(record)}
    assert.equal(options.method,'GET');return Response.json(data[kind]);
  }};
}
test('Spoolman transfer is minimal, skips used reels, and requires explicit dimensions and weights',()=>{
  const library=fixture();library.reels[1].used=true;
  const value=transfer.manifest(library,'https://test.example');assert.equal(value.spools.length,1);assert.deepEqual(value.materials.PLA,{density:null,diameter:null});
  for(const secret of ['Never exported','private-mail','private-order','Private location'])assert(!JSON.stringify(value).includes(secret));
  assert.throws(()=>prepareTransfer(value),/density/);value.materials.PLA={density:1.24,diameter:1.75};
  value.spools[0].remainingGrams=null;assert.throws(()=>prepareTransfer(value),/remaining grams/);assert.equal(prepareTransfer(value,true).spools[0].spool.remaining_weight,1000);
  value.spools[0].remainingGrams=1200;assert.throws(()=>prepareTransfer(value,true));
});
test('dry run is read-only, apply creates one reel each, retry reuses records without resetting usage',async()=>{
  const fake=spoolman(),value=exported();
  assert.deepEqual(await importSpools(value,{transport:fake.transport}),{dryRun:true,create:2,reuse:0,total:2});assert(fake.calls.every(call=>call.method==='GET'));
  const first=await importSpools(value,{apply:true,transport:fake.transport});assert.equal(first.mappings.length,2);assert.equal(fake.data.filament.length,1);assert.equal(fake.data.vendor.length,1);
  fake.data.spool[0].remaining_weight=400;const before=fake.calls.length;
  assert.deepEqual(await importSpools(value,{apply:true,transport:fake.transport}),first);assert.equal(fake.data.spool.length,2);assert.equal(fake.data.spool[0].remaining_weight,400);assert(fake.calls.slice(before).every(call=>call.method==='GET'));
});
test('unknown linked IDs and duplicate markers stop before creating any Spoolman records',async()=>{
  const fake=spoolman(),value=exported();value.spools[1].spoolmanId=99;
  await assert.rejects(importSpools(value,{apply:true,transport:fake.transport}),/missing or conflicts/);assert(fake.calls.every(call=>call.method==='GET'));
  value.spools[1].spoolmanId=null;fake.data.spool=[{id:1,comment:'Spool Studio reel '+value.spools[0].reelId},{id:2,comment:'Spool Studio reel '+value.spools[0].reelId}];
  await assert.rejects(importSpools(value,{apply:true,transport:fake.transport}),/Duplicate/);assert.equal(fake.data.filament.length,0);
});
test('mapping import validates whole batch before mutation, preserves quantities and checks owner and site',()=>{
  const library=fixture(),before=structuredClone(library),mappings=library.reels.map((reel,index)=>({id:reel.id,spoolmanId:index+1}));
  assert.throws(()=>linkSpoolman(library,[mappings[0],{id:crypto.randomUUID(),spoolmanId:3}]));assert.deepEqual(library,before);
  assert.throws(()=>linkSpoolman(library,[mappings[0],{...mappings[1],spoolmanId:1}]));assert.deepEqual(library,before);
  const result={format:'spool-studio-mappings-v1',origin:'https://test.example',accountKey:'user_alice',mappings};
  assert.throws(()=>transfer.mappings({...result,accountKey:'user_bob'},library,result.origin));assert.throws(()=>transfer.mappings(result,library,'https://other.example'));
  linkSpoolman(library,transfer.mappings(result,library,result.origin));assert.deepEqual(library.items,before.items);assert.deepEqual(library.reels.map(reel=>reel.remainingGrams),[600,600]);
  assert.throws(()=>linkSpoolman(library,[{...mappings[0],spoolmanId:9}]),/existing/);
  linkSpoolman(library,mappings);
});
test('mapping API requires explicit review, matching account, and current library revision',async()=>{
 const DB=localDatabase();try{
  const library=fixture();await DB.prepare("INSERT INTO libraries (user_id, revision, payload, request_id, updated_at) VALUES (?, 1, ?, '', ?)").bind(library.accountKey,JSON.stringify(library),new Date().toISOString()).run();
  const body={kind:'spoolman-mappings',expectedAccountKey:library.accountKey,baseRevision:1,requestId:crypto.randomUUID(),mappings:library.reels.map((reel,index)=>({id:reel.id,spoolmanId:index+1}))};
  const act=value=>handleLibrary(new Request('https://test.example/api/library',{method:'POST',headers:{origin:'https://test.example','content-type':'application/json','oai-authenticated-user-id':library.accountKey},body:JSON.stringify(value)}),{DB});
  assert.equal((await act(body)).status,400);assert.equal((await act({...body,reviewed:true,expectedAccountKey:'user_bob'})).status,409);
  assert.equal((await act({...body,reviewed:true})).status,200);assert.equal((await act({...body,reviewed:true,requestId:crypto.randomUUID()})).status,409);
 }finally{DB.close()}
});
