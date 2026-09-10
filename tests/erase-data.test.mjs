import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {eraseSavedData, handleEraseData, EraseConflict} from '../server/erase-data.mjs';
import {postgresDatabase} from '../server/postgres.mjs';
import {handleLibrary} from '../server/library.mjs';
import {handleBatch} from '../server/api.mjs';
async function fixture() {
 const database=new PGlite();await database.exec(await readFile(new URL('../netlify/database/migrations/001_create-inventory/migration.sql',import.meta.url),'utf8'));await database.exec(await readFile(new URL('../netlify/database/migrations/003_printer-connections/migration.sql',import.meta.url),'utf8'));
 const client={async query(sql,params){const result=await database.query(sql,params);return {rows:result.rows,rowCount:result.affectedRows}},release(){},async connect(){return this}};
 for(const account of ['user_alice','user_bob']){
  await client.query("INSERT INTO libraries VALUES ($1, 5, $2, 'old-request', '2026-09-10')",[account,JSON.stringify({items:[{id:account,spools:1}],reels:[{id:crypto.randomUUID(),number:18}],nextReelNumber:19,importHashes:['private'],bridgeHash:'revocable-key'})]);
  await client.query("INSERT INTO phone_batches VALUES ($1, 4, $2, 'old-request', '2026-09-10')",[account,JSON.stringify({p:'old project',state:'empty',total:0,chosen:0,selection:null})]);
  await client.query('INSERT INTO printer_connections VALUES ($1, 7, $2)',[account,JSON.stringify({hash:'printer-key-hash',request:{state:'queued'}})]);
 }
 return {database,client,DB:postgresDatabase(client),input:{accountKey:'user_alice',libraryRevision:5,phoneRevision:4,requestId:crypto.randomUUID()}};
}
test('erasure atomically removes saved content and bridge credentials, retains counter and blocks stale writes',async()=>{
 const app=await fixture();try{
  const first=await eraseSavedData(app.client,app.input);assert.deepEqual(first,{cleared:true,libraryRevision:6,phoneRevision:5});
  assert.deepEqual(await eraseSavedData(app.client,app.input),first);
  const library=(await app.client.query('SELECT payload FROM libraries WHERE user_id=$1',['user_alice'])).rows[0];assert.deepEqual(JSON.parse(library.payload),{items:[],nextReelNumber:19});
  assert.equal(JSON.parse((await app.client.query('SELECT payload FROM libraries WHERE user_id=$1',['user_bob'])).rows[0].payload).items.length,1);
  const printer=(await app.client.query('SELECT revision,payload FROM printer_connections WHERE user_id=$1',['user_alice'])).rows[0];assert.equal(printer.revision,8);assert.deepEqual(JSON.parse(printer.payload),{});
  assert.equal(JSON.parse((await app.client.query('SELECT payload FROM printer_connections WHERE user_id=$1',['user_bob'])).rows[0].payload).hash,'printer-key-hash');
  const headers={'oai-authenticated-user-id':'user_alice',origin:'https://test.example','content-type':'application/json'};
  const stale=await handleLibrary(new Request('https://test.example/api/library',{method:'POST',headers,body:JSON.stringify({kind:'initialise-reels',expectedAccountKey:'user_alice',baseRevision:5,requestId:crypto.randomUUID()})}),{DB:app.DB});assert.equal(stale.status,409);
  const staleBatch=await handleBatch(new Request('https://test.example/api/phone-batch',{method:'PUT',headers,body:JSON.stringify({baseRevision:4,requestId:crypto.randomUUID(),batch:{p:'resurrect',state:'empty',total:0,chosen:0,selection:null}})}),{DB:app.DB});assert.equal(staleBatch.status,409);
  const init=await handleLibrary(new Request('https://test.example/api/library',{method:'POST',headers,body:JSON.stringify({kind:'initialise-reels',expectedAccountKey:'user_alice',baseRevision:6,requestId:crypto.randomUUID()})}),{DB:app.DB});assert.equal(init.status,200);assert.equal(JSON.parse((await app.client.query('SELECT payload FROM libraries WHERE user_id=$1',['user_alice'])).rows[0].payload).nextReelNumber,19);
 }finally{await app.database.close()}
});
test('changed revisions and partial database failures roll back both records',async()=>{
 const app=await fixture();try{
  await assert.rejects(eraseSavedData(app.client,{...app.input,phoneRevision:3}),EraseConflict);
  const broken={query:async(sql,params)=>{if(sql.startsWith('UPDATE phone_batches'))throw Error('Synthetic failure');return app.client.query(sql,params)}};
  await assert.rejects(eraseSavedData(broken,app.input),/Synthetic failure/);
  assert.equal((await app.client.query('SELECT revision FROM libraries WHERE user_id=$1',['user_alice'])).rows[0].revision,5);assert.equal((await app.client.query('SELECT revision FROM phone_batches WHERE user_id=$1',['user_alice'])).rows[0].revision,4);
 }finally{await app.database.close()}
});
test('erasing an empty account establishes revision barriers against delayed first writes',async()=>{
 const app=await fixture();try{
  const value=await eraseSavedData(app.client,{...app.input,accountKey:'user_new',libraryRevision:0,phoneRevision:0});assert.equal(value.libraryRevision,2);assert.equal(value.phoneRevision,2);
  await assert.rejects(eraseSavedData(app.client,{...app.input,accountKey:'user_new',libraryRevision:0,phoneRevision:0,requestId:crypto.randomUUID()}),EraseConflict);
 }finally{await app.database.close()}
});
test('erasure endpoint requires sign-in, same origin, explicit phrase and matching owner',async()=>{
 let called=0;const env={DB:{eraseSavedData:async()=>{called++;return {cleared:true}}}};
 const input={expectedAccountKey:'user_alice',libraryRevision:1,phoneRevision:0,requestId:crypto.randomUUID(),confirmation:'ERASE MY SAVED DATA'};
 const request=(body=input,headers={})=>new Request('https://test.example/api/account-data/erase',{method:'POST',headers:{'oai-authenticated-user-id':'user_alice','content-type':'application/json',origin:'https://test.example',...headers},body:JSON.stringify(body)});
 assert.equal((await handleEraseData(request(input,{'oai-authenticated-user-id':''}),env)).status,401);
 assert.equal((await handleEraseData(request(input,{origin:'https://other.example'}),env)).status,403);
 assert.equal((await handleEraseData(request({...input,confirmation:'yes'}),env)).status,400);
 assert.equal((await handleEraseData(request({...input,expectedAccountKey:'user_bob'}),env)).status,409);assert.equal(called,0);
 assert.equal((await handleEraseData(request(),env)).status,200);assert.equal(called,1);
});
