import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAccountExport} from '../server/account-export.mjs';
import {localDatabase} from '../scripts/local-db.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('full account export is private, read-only, unfiltered and excludes credentials',async()=>{
 const DB=localDatabase();try{
  const payload={items:[{id:'white',used:false},{id:'black',used:true}],reels:[{id:'reel-one',used:true,remainingGrams:0}],importHashes:['fingerprint'],nextReelNumber:9,bridgeHash:'DO_NOT_EXPORT_SECRET_HASH',bridgeLastSync:'2026-09-10'};
  await DB.prepare("INSERT INTO libraries (user_id, revision, payload, request_id, updated_at) VALUES (?, 3, ?, '', ?)").bind('user_alice',JSON.stringify(payload),'2026-09-10').run();
  await DB.prepare("INSERT INTO phone_batches (user_id, revision, payload, request_id, updated_at) VALUES (?, 2, ?, '', ?)").bind('user_alice',JSON.stringify({p:'Private project'}),'2026-09-10').run();
  const request=(owner,method='GET')=>new Request('https://test.example/api/account-export',{method,headers:owner?{'oai-authenticated-user-id':owner}:{}});
  assert.equal((await handleAccountExport(request(null),{DB})).status,401);assert.equal((await handleAccountExport(request('user_alice','POST'),{DB})).status,405);
  const response=await handleAccountExport(request('user_alice'),{DB});assert.equal(response.headers.get('cache-control'),'private, no-store');const data=await response.json();
  assert.equal(data.library.items.length,2);assert.equal(data.library.reels[0].used,true);assert.equal(data.phoneBatch.batch.p,'Private project');assert.deepEqual(data.library.importFingerprints,['fingerprint']);assert(!JSON.stringify(data).includes('DO_NOT_EXPORT_SECRET_HASH'));
  const other=await(await handleAccountExport(request('user_bob'),{DB})).json();assert.deepEqual(other.library.items,[]);assert.equal(other.phoneBatch,null);
  assert.equal(await DB.prepare('SELECT payload FROM libraries WHERE user_id = ?').bind('user_bob').first(),null);
  assert.equal((await DB.prepare('SELECT revision FROM libraries WHERE user_id = ?').bind('user_alice').first()).revision,3);
 }finally{DB.close()}
});
test('account download requires matching owner, handles errors and ignores results after leaving',async()=>{
 const node={button:{disabled:false},status:{textContent:''},account:{textContent:'{"userId":"user_alice"}'}},events={},downloads=[];
 let responseOwner='user_alice',failure=false,leave=false;
 const context={document:{getElementById:id=>({'account-export':node.button,'account-export-status':node.status,'auth-account':node.account})[id],createElement:()=>({click(){downloads.push(this.download)}})},window:{addEventListener:(name,fn)=>events[name]=fn},location:{origin:'https://test.example'},AbortSignal,Blob,Date,setTimeout:fn=>fn(),URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},fetch:async()=>{if(leave)events.pagehide();return Response.json({accountKey:responseOwner,origin:'https://test.example',format:'spool-studio-account-export-v1'},{status:failure?503:200})}};
 vm.runInNewContext(readFileSync(new URL('../out/account-data.js',import.meta.url),'utf8'),context);
 responseOwner='user_bob';await node.button.onclick();assert.equal(downloads.length,0);assert.match(node.status.textContent,/account or site changed/);
 responseOwner='user_alice';failure=true;await node.button.onclick();assert.equal(downloads.length,0);assert.equal(node.button.disabled,false);
 failure=false;await node.button.onclick();assert.equal(downloads.length,1);assert.match(downloads[0],/\.private\.json$/);
 leave=true;await node.button.onclick();assert.equal(downloads.length,1);
});
