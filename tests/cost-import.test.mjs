import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {handleLibrary} from '../server/library.mjs';
import {localDatabase} from '../scripts/local-db.mjs';
const require=createRequire(import.meta.url),costImport=require('../out/cost-import-core.js'),costing=require('../out/cost-core.js'),csv=require('../out/import-csv.js');
const spool={id:'purchase-one',brand:'Bambu Lab',product:'PLA Basic',colour:'Jade White',material:'PLA',finish:'standard',packaging:'spooled',weightGrams:1000,spools:2,hex:'#FFFFFF',date:'2026-09-01',order:'order-123',retailer:'Bambu Store',used:true};
const price={costPerRoll:12.99,costCurrency:'GBP'};
const command=(revision,changes)=>({kind:'cost-update',expectedAccountKey:'alice',baseRevision:revision,requestId:crypto.randomUUID(),reviewed:true,changes});
const change=(id=spool.id)=>({id,...price,replaceExisting:false});
const request=(user,body,origin='https://test.example')=>new Request('https://test.example/api/library',{method:body?'POST':'GET',headers:{...(user?{'oai-authenticated-user-id':user}:{}),origin,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});

test('cost matching needs purchase evidence, preserves ambiguity and never guesses from date or colour',()=>{
 const items=[spool,{...spool,id:'second',order:'order-456'}];
 assert.equal(costImport.match({...spool,entryId:'purchase-one'},items).strong,true);
 assert.equal(costImport.match({...spool,entryId:'another-account'},items).strong,false);
 assert.equal(costImport.match(spool,items).strong,true);
 assert.equal(costImport.match({...spool,order:''},items).strong,false);
 assert.equal(costImport.match({...spool,retailer:''},items).strong,false);
 assert.equal(costImport.match(spool,[spool,{...spool,id:'split-line'}]).strong,false);
 for(const patch of [{finish:'matte'},{product:'PLA Matte'},{packaging:'refill'},{weightGrams:500},{colour:'Ivory White'}])assert.equal(costImport.match({...spool,...patch},items).strong,false);
 assert.equal(costImport.prepare({spool:{...spool,...price}},items).selected,true);
 assert.equal(costImport.prepare({spool:{...spool,...price}},[{...spool,lineTotal:0,currency:'GBP'}]).selected,false);
 assert.equal(costImport.prepare({spool:{...spool,costPerRoll:null}},items).selected,false);
 assert.equal(costImport.prepare({spool:{...spool,...price,order:''}},items).costTarget,'');
 assert.deepEqual(costImport.fromText('Bambu PLA Basic\nOrder: 123\nRetailer: Shop\nEntry ID: saved-1'),{entryId:'saved-1',order:'123',retailer:'Shop'});
 assert.equal(costImport.fromText('Order: 123\nOrder: 456').order,'');
});

test('cost updates validate the whole batch before touching prices and protect known and free costs',()=>{
 const original={items:[spool,{...spool,id:'known',lineTotal:20,currency:'GBP'}],reels:[{id:'SP-1',itemId:spool.id,remainingGrams:140,used:true}],importHashes:['a'.repeat(64)],setup:{steps:{match:'done'}},nextReelNumber:99,bridgeHash:'synthetic-secret'};
 for(const changes of [[change(),change('missing')],[change(),change()],[change('known')],[{...change(),spools:9}],[{...change(),costPerRoll:null}],[{...change(),costCurrency:''}],[{...change(),costPerRoll:12.999}]]){
  const data=structuredClone(original);assert.throws(()=>costImport.apply(data,{reviewed:true,changes}));assert.deepEqual(data,original);
 }
 const data=structuredClone(original);costImport.apply(data,{reviewed:true,changes:[change(),{...change('known'),replaceExisting:true,costPerRoll:0}]});
 const expected=structuredClone(original);Object.assign(expected.items[0],price);Object.assign(expected.items[1],{costPerRoll:0,costCurrency:'GBP'});assert.deepEqual(data,expected);
 assert.equal(costing.purchase(data.items[1]).amount,0);
 assert.throws(()=>costImport.apply(data,{reviewed:true,changes:[change('known')]}),/already has a cost/);
 const row={spool:price,costTarget:spool.id,selected:true};assert.throws(()=>costImport.changes([row,row],[spool]),/more than once/);
});

test('cost-only API is account-bound, atomic, retry-safe, revision-guarded and leaves imports and reels unchanged',async()=>{
 const DB=localDatabase(),original={items:[spool],reels:[{id:'reel-one',number:1,itemId:spool.id,remainingGrams:300,used:true}],importHashes:['a'.repeat(64)],nextReelNumber:2};
 try{
  await DB.prepare("INSERT INTO libraries (user_id,revision,payload,request_id,updated_at) VALUES (?,1,?,'',?)").bind('alice',JSON.stringify(original),'2026-09-10').run();
  const act=body=>handleLibrary(request('alice',body),{DB}),body=command(1,[change()]);
  assert.equal((await handleLibrary(request(null,body),{DB})).status,401);
  assert.equal((await handleLibrary(request('bob',body),{DB})).status,409);
  assert.equal((await handleLibrary(request('alice',body,'https://evil.example'),{DB})).status,403);
  assert.equal((await act({...body,reviewed:false})).status,400);
  assert.equal((await act(command(1,[change(),change('missing')]))).status,400);
  assert.equal((await act({...body,sourceHash:'a'.repeat(64)})).status,200);
  assert.equal((await(await act(body)).json()).revision,2);
  assert.equal((await act(command(1,[change()]))).status,409);
  assert.equal((await act(command(2,[change()]))).status,400);
  const saved=JSON.parse((await DB.prepare('SELECT payload FROM libraries WHERE user_id=?').bind('alice').first()).payload);
  const expected=structuredClone(original);Object.assign(expected.items[0],price);assert.deepEqual(saved,expected);
 }finally{DB.close()}
});

test('CSV supports optional purchase references while old cost templates still parse',()=>{
 const headers=[...csv.columns,'costPerRoll','costCurrency','entryId','order','retailer'];
 const input=headers.join(',')+'\n'+headers.map(key=>({...spool,...price,entryId:'purchase-one'})[key]??'').join(',');
 const parsed=csv.parse(input)[0].spool;assert.equal(parsed.entryId,'purchase-one');assert.equal(parsed.order,'order-123');assert.equal(parsed.costPerRoll,12.99);
 assert.equal(csv.parse(readFileSync(new URL('../out/filament-cost-import-template.csv',import.meta.url),'utf8')).length,0);
});

function element(tag='div'){
 return {tag,children:[],dataset:{},style:{},value:'',textContent:'',hidden:false,disabled:false,checked:false,append(...nodes){for(const node of nodes)node.parent=this;this.children.push(...nodes)},replaceChildren(...nodes){this.children=[];this.append(...nodes)},setAttribute(){},removeAttribute(){},addEventListener(name,fn){this['on'+name]=fn},focus(){},scrollIntoView(){},reportValidity(){return true},
 querySelector(selector){if(selector==='legend input[type="checkbox"]')return this.children.find(child=>child.tag==='legend')?.querySelectorAll('input[type="checkbox"]')[0]},closest(tag){return this.tag===tag?this:this.parent?.closest(tag)},
 querySelectorAll(selector){const all=this.children.flatMap(child=>[child,...child.querySelectorAll('*')]);return selector==='*'?all:selector==='.entry'?all.filter(child=>child.tag==='fieldset'):selector==='input[type="checkbox"]'?all.filter(child=>child.type==='checkbox'):[]}
 };
}
test('import screen switches modes without saving, clears approvals and posts only selected cost fields',async()=>{
 const DB=localDatabase(),nodes=new Map(),posts=[];
 await DB.prepare("INSERT INTO libraries (user_id,revision,payload,request_id,updated_at) VALUES (?,1,?,'',?)").bind('alice',JSON.stringify({items:[spool]}),'2026-09-10').run();
 const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};
 get('import-mode').value='add';get('source-format').value='text';
 let drop=false;
 const context=vm.createContext({document:{getElementById:get,createElement:element,querySelectorAll:()=>[],createTextNode:text=>({...element(),textContent:text})},CostImport:costImport,SpoolCost:costing,FilamentCsv:csv,FilamentImport:require('../out/import-parser.js'),FilamentColours:require('../out/colour-catalog.js'),URL,AbortSignal,crypto,TextEncoder,Uint8Array,setTimeout,clearTimeout,addEventListener(){},
 fetch:async(url,options)=>{assert.equal(url,'/api/library');const body=options.body?JSON.parse(options.body):null;if(body)posts.push(body);const response=await handleLibrary(request('alice',body),{DB});if(body&&drop){drop=false;throw Error('Reply lost')}return response}
 });context.window=context;
 try{
  vm.runInContext(readFileSync(new URL('../out/cost-import-review.js',import.meta.url),'utf8'),context);
  vm.runInContext(readFileSync(new URL('../out/import-review.js',import.meta.url),'utf8'),context);
  vm.runInContext(readFileSync(new URL('../out/import.js',import.meta.url),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  get('source-text').value='Bambu Lab PLA Basic Jade White 1kg with spool\nQuantity: 2\nCost per roll: GBP 12.99\nEntry ID: purchase-one';
  get('import-mode').value='costs';get('import-mode').onchange();assert.equal(posts.length,0);
  get('extract').onclick();assert.equal(vm.runInContext('rows[0].spool.date',context),'');assert.equal(vm.runInContext('rows[0].selected',context),true);
  assert.match(get('save-import').textContent,/Update 1/);assert.equal(get('review-form').noValidate,true);get('review-form').reportValidity=()=>false;vm.runInContext("rows.push({selected:false,spool:{costPerRoll:-1,costCurrency:'GBP'}})",context);
  get('approve-import').checked=true;get('approve-import').onchange();drop=true;
  await get('review-form').onsubmit({preventDefault(){}});
  assert.match(get('import-message').textContent,/Reply lost/);
  await get('review-form').onsubmit({preventDefault(){}});
  assert.equal(posts.length,2);assert.equal(posts[0].requestId,posts[1].requestId);assert.equal(posts[0].kind,'cost-update');assert.equal(posts[0].spools,undefined);assert.equal(posts[0].sourceHash,undefined);
  assert.deepEqual(posts[0].changes,[change()]);assert.match(get('import-message').textContent,/Updated 1 costs/);
  get('source-text').value='Bambu Lab PLA Basic Jade White 1kg with spool\nCost per roll: GBP 15.00\nEntry ID: purchase-one';get('extract').onclick();assert.equal(vm.runInContext('rows[0].selected',context),false);
  get('approve-import').checked=true;get('import-mode').value='add';get('import-mode').onchange();assert.equal(vm.runInContext('rows.length',context),1);assert.equal(get('approve-import').checked,false);assert.equal(posts.length,2);
 }finally{DB.close()}
});
