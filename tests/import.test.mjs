import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {handleLibrary} from '../server/library.mjs';
import {localDatabase} from '../scripts/local-db.mjs';
import worker from '../dist/server/index.js';
const require=createRequire(import.meta.url),parser=require('../out/import-parser.js');
const spool={brand:'Example',product:'PLA Matte',material:'PLA',finish:'matte',colour:'Orange',hex:'#EF8D34',spools:2,weightGrams:1000,packaging:'refill',date:'2026-09-09',notes:''};
const request=(user,body)=>new Request('https://test.example/api/library',{method:body?'POST':'GET',headers:{...(user?{'oai-authenticated-user-id':user}:{}),origin:'https://test.example','content-type':'application/json'},body:body?JSON.stringify(body):undefined});
const batch=(revision=1)=>({kind:'import',expectedAccountKey:'alice',baseRevision:revision,requestId:crypto.randomUUID(),reviewed:true,sourceHash:'a'.repeat(64),spools:[spool,{...spool,colour:'White',hex:'#FFFFFF'}]});
test('parser extracts reviewable fields without inventing quantities, finish or exact swatches',()=>{
 const rows=parser.parse('SUNLU PLA Matte Orange 1 kg refill\nQuantity: 2\nELEGOO PETG Blue 500g with spool\nQty: 1');
 assert.equal(rows.length,2);assert.equal(rows[0].spool.spools,2);assert.equal(rows[0].spool.material,'PLA');assert.equal(rows[0].spool.finish,'matte');assert.equal(rows[0].spool.packaging,'refill');assert.equal(rows[0].spool.weightGrams,1000);
 assert.equal(rows[1].spool.material,'PETG');assert.equal(rows[1].spool.finish,'unknown');assert.equal(rows[1].spool.packaging,'spooled');assert.equal(rows[1].spool.weightGrams,500);
 const bundle=parser.parse('SUNLU TPU black white blue red bundle 1KG')[0];
 assert.equal(bundle.spool.spools,null);assert.equal(bundle.spool.weightGrams,null);assert.equal(bundle.spool.colour,'');assert(bundle.warnings.some(value=>value.includes('Multiple colours')));
 const pack=parser.parse('SUNLU PLA+ Orange 4 x 250g\nQty: 2')[0];assert.equal(pack.spool.spools,8);assert.equal(pack.spool.weightGrams,250);assert.equal(pack.spool.material,'PLA+');
 assert.equal(parser.parse('Bambu Lab\nPLA Basic\nColour: Jade White\nRefill\nQuantity: 3')[0].spool.colour,'Jade White');
 assert.deepEqual(parser.parse('Shipping confirmation\nAddress only\nNothing relevant'),[]);
 assert.throws(()=>parser.parse('x'.repeat(60001)));
 assert.equal(parser.duplicates(spool,[spool,{...spool,finish:'standard'}]).length,1);
});
test('reviewed batch is atomic, retry-safe, duplicate-aware and bound to the original account',async()=>{
 const DB=localDatabase();const act=(user,body)=>handleLibrary(request(user,body),{DB});
 try{
  assert.equal((await act(null,batch())).status,401);
  assert.equal((await act('bob',batch())).status,409);assert.deepEqual((await (await act('bob')).json()).items,[]);
  assert.equal((await act('alice',{...batch(),reviewed:false})).status,400);
  assert.equal((await act('alice',{...batch(),spools:[spool,{...spool,hex:'wrong'}]})).status,400);
  assert.equal((await (await act('alice')).json()).items.length,0);
  const command=batch();let response=await act('alice',command);assert.equal(response.status,200);
  let state=await response.json();assert.equal(state.items.length,2);assert.equal(state.items[0].retailer,'Reviewed import');
  state=await (await act('alice',command)).json();assert.equal(state.items.length,2);
  response=await act('alice',batch(state.revision));assert.equal(response.status,409);assert.match((await response.json()).error,/already imported/);
  assert.equal((await act('alice',{...batch(1),sourceHash:'b'.repeat(64)})).status,409);
  assert.equal((await act('alice',{...batch(2),sourceHash:'b'.repeat(64),spools:Array(501).fill(spool)})).status,400);
  assert.equal((await (await act('alice')).json()).items.length,2);
 }finally{DB.close()}
});
test('500-entry imports support long Unicode fields, remain atomic, and respect the library ceiling',async()=>{
 const DB=localDatabase(),act=body=>handleLibrary(request('alice',body),{DB});
 try{
  const large={...spool,brand:'材'.repeat(80),product:'材'.repeat(100),colour:'材'.repeat(80),notes:'材'.repeat(500)};
  const command={...batch(),spools:Array(500).fill(large)};
  const invalid={...command,spools:[...command.spools.slice(0,499),{...large,hex:'bad'}]};
  const rejected=await act(invalid);assert.equal(rejected.status,400);assert.equal((await rejected.json()).entryIndex,499);
  assert.equal((await (await act()).json()).items.length,0);
  let response=await act(command);assert.equal(response.status,200);assert.equal((await response.json()).items.length,500);
  response=await act(command);assert.equal(response.status,200);assert.equal((await response.json()).items.length,500);
  response=await act({...batch(2),sourceHash:'b'.repeat(64),spools:Array(500).fill(large)});assert.equal(response.status,200);assert.equal((await response.json()).items.length,1000);
  response=await act({...batch(3),sourceHash:'c'.repeat(64),spools:[spool]});assert.equal(response.status,400);assert.match((await response.json()).error,/1000-entry/);
 }finally{DB.close()}
});

test('import route is protected and all on-device OCR assets are built locally',async()=>{
 const response=await worker.fetch(new Request('https://test.example/import.html'),{});
 assert.equal(response.status,302);assert.equal(response.headers.get('location'),'/signin-with-chatgpt?return_to=%2Fimport.html');
 for(const name of ['tesseract.min.js','worker.min.js','tesseract-core-lstm.wasm.js','tesseract-core-simd-lstm.wasm.js','tesseract-core-relaxedsimd-lstm.wasm.js','eng.traineddata.gz']){
  const response=await worker.fetch(new Request('https://test.example/vendor/ocr/'+name),{});
  assert.equal(response.status,200);if(name.endsWith('.js'))assert.match(response.headers.get('content-type'),/javascript/);
  else {assert.equal(response.headers.get('content-type'),'application/octet-stream');const bytes=new Uint8Array(await response.arrayBuffer());assert.equal(bytes[0],31);assert.equal(bytes[1],139)}
 }
 const source=readFileSync(new URL('../out/import.js',import.meta.url),'utf8');
 assert(!source.includes('https://'));assert(source.includes("cacheMethod:'none'"));
 assert(!source.includes('localStorage'));assert(!source.includes('innerHTML'));
 const bytes=readFileSync(new URL('../dist/server/index.js',import.meta.url));
 assert(gzipSync(bytes).length<10*1024*1024,'Worker compressed bundle must fit the platform upload budget');
});
