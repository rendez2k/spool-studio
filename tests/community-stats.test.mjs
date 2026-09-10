import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {postgresDatabase} from '../server/postgres.mjs';
import {handleCommunityStats} from '../server/community-stats.mjs';
import {serveNetlify} from '../server/netlify-app.mjs';

test('database returns only an aggregate, counts refills and avoids double counting mapped or used reels',async()=>{
 const pg=new PGlite();
 try{
  await pg.exec('CREATE TABLE libraries (user_id TEXT PRIMARY KEY, payload TEXT NOT NULL)');
  const DB=postgresDatabase(pg);
  assert.equal(await DB.communityRollCount(),0);
  const save=(user,payload)=>pg.query('INSERT INTO libraries VALUES ($1,$2)',[user,JSON.stringify(payload)]);
  await save('alice',{items:[{id:'shared',spools:4,used:false,packaging:'refill',costPerRoll:20},{id:'used',spools:8,used:true},{id:'unknown',spools:null},{id:'bad',spools:'5'},{id:'negative',spools:-2}]});
  await save('bob',{items:[{id:'shared',spools:10,used:false},{id:'unmapped',spools:2,used:false},{id:'used-parent',spools:1,used:true}],reels:[{itemId:'shared',used:false},{itemId:'shared',used:true},{itemId:'shared',used:false},{itemId:'used-parent',used:false},{itemId:'orphan',used:false}]});
  await save('empty',{items:[],reels:[]});
  assert.equal(await DB.communityRollCount(),8);
  const request=new Request('https://test.example/api/community-stats',{headers:{'oai-authenticated-user-id':'bob'}});
  const response=await handleCommunityStats(request,{DB}),body=await response.json();
  assert.equal(body.availableRolls,8);assert.deepEqual(Object.keys(body).sort(),['asOf','availableRolls']);
  assert.match(response.headers.get('cache-control'),/private, no-store/);
  await pg.query('UPDATE libraries SET payload=$1 WHERE user_id=$2',[JSON.stringify({items:[]}),'alice']);
  assert.equal(await DB.communityRollCount(),4);
 }finally{await pg.close()}
});

test('community API requires real authentication and rejects filters, writes and failed counts without revealing data',async()=>{
 let reads=0;
 const DB={async communityRollCount(){reads++;return 123}};
 const options={origins:['https://test.example'],database:()=>DB,authenticate:async request=>({isAuthenticated:request.headers.get('authorization')==='Bearer fixture',tokenType:'session_token',headers:new Headers(),toAuth:()=>({userId:'alice'})})};
 const url='https://test.example/api/community-stats';
 assert.equal((await serveNetlify(new Request(url,{headers:{'oai-authenticated-user-id':'alice'}}),options)).status,401);assert.equal(reads,0);
 const headers={authorization:'Bearer fixture'};
 assert.equal((await serveNetlify(new Request(url+'?user=alice',{headers}),options)).status,400);
 assert.equal((await serveNetlify(new Request(url,{method:'POST',headers}),options)).status,405);assert.equal(reads,0);
 const success=await serveNetlify(new Request(url,{headers}),options);assert.equal((await success.json()).availableRolls,123);assert.equal(reads,1);
 assert.equal(success.headers.get('netlify-cdn-cache-control'),'no-store');
 for(const count of [null,NaN,-1,Number.MAX_SAFE_INTEGER+1]){
  const response=await handleCommunityStats(new Request(url,{headers:{'oai-authenticated-user-id':'alice'}}),{DB:{communityRollCount:async()=>count}});
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'The community total is temporarily unavailable.'});
 }
});

test('community UI shows real zero, formats counts and offers retry without fabricating a zero on failure',async()=>{
 const nodes=Object.fromEntries(['community-rolls','community-status','community-retry'].map(id=>[id,{textContent:'',hidden:false}]));
 let response=Response.json({availableRolls:12345,asOf:'2026-09-10T12:00:00Z'});
 const handlers={};
 const context=vm.createContext({Intl,Date,AbortSignal,Number,document:{getElementById:id=>nodes[id]},window:{addEventListener:(name,handler)=>handlers[name]=handler},fetch:async(url,options)=>{assert.equal(url,'/api/community-stats');assert.equal(options.credentials,'same-origin');return response}});
 vm.runInContext(readFileSync(new URL('../out/community-stats.js',import.meta.url),'utf8'),context);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(nodes['community-rolls'].textContent,'12,345');
 response=Response.json({availableRolls:0,asOf:'2026-09-10T12:00:00Z'});await nodes['community-retry'].onclick();assert.equal(nodes['community-rolls'].textContent,'0');
 response=new Response('Unavailable',{status:503});await nodes['community-retry'].onclick();assert.equal(nodes['community-rolls'].textContent,'—');assert.equal(nodes['community-retry'].hidden,false);
 response=new Response('',{status:401});await nodes['community-retry'].onclick();assert.match(nodes['community-status'].textContent,/Sign in/);
 handlers.pagehide();response=Response.json({availableRolls:99,asOf:'2026-09-10T12:00:00Z'});await nodes['community-retry'].onclick();assert.equal(nodes['community-rolls'].textContent,'—');
});
