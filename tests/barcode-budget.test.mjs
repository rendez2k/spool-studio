import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {claimBarcodeBudget} from '../server/barcode-budget.mjs';
import {handleBarcodeLookup} from '../server/barcode-lookup.mjs';
import {postgresDatabase} from '../server/postgres.mjs';
import {localDatabase} from '../scripts/local-db.mjs';
const origin='https://test.example';
const request=user=>new Request(origin+'/api/barcode-lookup',{method:'POST',headers:{'oai-authenticated-user-id':user,origin,'Content-Type':'application/json'},body:JSON.stringify({code:'4002293401102',consent:true})});

test('one shared budget enforces spacing and a rolling 24-hour cap, including after a new handler instance',async()=>{
 const DB=localDatabase();let now=2000000000000;DB.currentMilliseconds=async()=>now;
 try{
  assert.equal((await claimBarcodeBudget(DB)).allowed,true);
  const denied=await claimBarcodeBudget({...DB});assert.equal(denied.allowed,false);assert.equal(denied.retryAfter,15);
  for(let index=1;index<100;index++){now+=15000;assert.equal((await claimBarcodeBudget({...DB})).allowed,true)}
  now+=15000;const limit=await claimBarcodeBudget({...DB});assert.equal(limit.allowed,false);assert.equal(limit.daily,true);
  now=2000000000000+86400000;assert.equal((await claimBarcodeBudget(DB)).allowed,true);
  const row=await DB.prepare('SELECT revision, payload FROM service_limits WHERE name = ?').bind('upcitemdb-trial').first();
  assert.equal(JSON.parse(row.payload).length,100);assert(!row.payload.includes('user'));assert(!row.payload.includes('4002293401102'));
  assert.equal((await DB.prepare('SELECT user_id FROM libraries WHERE user_id = ?').bind('alice').first()),null);
 }finally{DB.close()}
});

test('separate PostgreSQL adapters share an atomic limit and the database clock',async()=>{
 const engine=new PGlite();
 try{
  await engine.exec(await readFile('netlify/database/migrations/002_barcode-budget/migration.sql','utf8'));
  const client={async query(sql,parameters){const result=await engine.query(sql,parameters);return {rows:result.rows,rowCount:result.affectedRows}}};
  const first=postgresDatabase(client),second=postgresDatabase(client);
  assert(Math.abs(await first.currentMilliseconds()-Date.now())<5000);
  const claims=await Promise.all(Array.from({length:20},(_,index)=>claimBarcodeBudget(index%2?first:second)));
  assert.equal(claims.filter(value=>value.allowed).length,1);assert(claims.filter(value=>!value.allowed).every(value=>value.retryAfter>=1&&value.retryAfter<=15));
  const saved=await client.query('SELECT payload FROM service_limits');assert.equal(JSON.parse(saved.rows[0].payload).length,1);
 }finally{await engine.close()}
});

test('unavailable or corrupt budgets fail closed without querying the external provider',async()=>{
 let called=0;const perform=async()=>{called++;return []};
 assert.equal((await handleBarcodeLookup(request('alice'),{},perform)).status,503);assert.equal(called,0);
 const DB=localDatabase();try{
  await DB.prepare('INSERT INTO service_limits (name, revision, payload) VALUES (?, 1, ?)').bind('upcitemdb-trial','{"not":"timestamps"}').run();
  assert.equal((await handleBarcodeLookup(request('alice'),{DB},perform)).status,503);assert.equal(called,0);
 }finally{DB.close()}
});

test('provider failures consume reserved attempts and denied users never contact the provider',async()=>{
 const DB=localDatabase();let called=0,now=2000000000000;DB.currentMilliseconds=async()=>now;
 try{
  const failing=async()=>{called++;throw Object.assign(Error('The shared catalogue allowance is busy.'),{status:429})};
  assert.equal((await handleBarcodeLookup(request('alice'),{DB},failing)).status,429);
  const denied=await handleBarcodeLookup(request('bob'),{DB},failing);assert.equal(denied.status,429);assert.equal(denied.headers.get('Retry-After'),'15');assert.equal(called,1);
  now+=15000;
  const result=await handleBarcodeLookup(request('bob'),{DB},async()=>{called++;return []});assert.equal(result.status,200);assert.equal((await result.json()).accountKey,'bob');assert.equal(called,2);
 }finally{DB.close()}
});
