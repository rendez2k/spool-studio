import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {gtin,lookupBarcode,handleBarcodeLookup} from '../server/barcode-lookup.mjs';
import {gmailConfig} from '../server/gmail-config.mjs';
import {localDatabase} from '../scripts/local-db.mjs';
const gmail=createRequire(import.meta.url)('../out/gmail-core.js');
test('external barcode lookup validates check digits and rejects unrelated catalogue results',async()=>{
 assert.equal(gtin('4002293401102'),'4002293401102');
 for(const value of ['4002293401103','SKU-123','https://example.com','123','<script>'])assert.throws(()=>gtin(value));
 const result=await lookupBarcode('4002293401102',async(url,options)=>{
  assert.equal(url,'https://api.upcitemdb.com/prod/trial/lookup?upc=4002293401102');assert.equal(options.redirect,'error');assert(!options.headers.Authorization);
  return Response.json({code:'OK',items:[{ean:'4002293401102',title:'Example PLA',brand:'Example',color:'White',images:['https://tracker.example/image']},{ean:'1234567890123',title:'Wrong barcode'}]});
 });
 assert.deepEqual(result,[{title:'Example PLA',brand:'Example',colour:'White'}]);
 await assert.rejects(lookupBarcode('4002293401102',async()=>new Response('',{status:429})),/allowance/);
});
test('external barcode API requires sign-in, same origin and explicit consent before contacting provider',async(context)=>{
 const env={DB:localDatabase()};context.after(()=>env.DB.close());
 let called=0;const perform=async()=>{called++;return []};
 const make=(user,origin,consent)=>new Request('https://test.example/api/barcode-lookup',{method:'POST',headers:{...(user?{'oai-authenticated-user-id':user}:{}),origin,'Content-Type':'application/json'},body:JSON.stringify({code:'4002293401102',consent})});
 assert.equal((await handleBarcodeLookup(make(null,'https://test.example',true),env,perform)).status,401);
 assert.equal((await handleBarcodeLookup(make('user_alice','https://other.example',true),env,perform)).status,403);
 assert.equal((await handleBarcodeLookup(make('user_alice','https://test.example',false),env,perform)).status,400);
 assert.equal(called,0);
 const response=await handleBarcodeLookup(make('user_alice','https://test.example',true),env,perform);
 assert.equal(response.status,200);assert.equal((await response.json()).accountKey,'user_alice');assert.equal(called,1);
 assert.equal((await handleBarcodeLookup(make('user_alice','https://test.example',true),env,perform)).status,429);
});
test('Gmail configuration is disabled by default and separately gated by account or explicit public switch',()=>{
 const clientId='123456-test.apps.googleusercontent.com';
 assert.equal(gmailConfig('user_alice').enabled,false);
 assert.equal(gmailConfig('user_alice',{clientId}).enabled,false);
 assert.equal(gmailConfig('user_alice',{clientId,testUsers:'user_bob'}).clientId,'');
 assert.equal(gmailConfig('user_alice',{clientId,testUsers:'user_alice'}).testing,true);
 assert.equal(gmailConfig('user_bob',{clientId,publicEnabled:true}).enabled,true);
 assert.equal(gmailConfig('user_bob',{clientId:'123456-testXappsXgoogleusercontentXcom',publicEnabled:true}).enabled,false);
});
test('Gmail reader prefers plain text, skips attachments and rejects excess input',()=>{
 const plain=value=>({mimeType:'text/plain',body:{data:Buffer.from(value).toString('base64url')}});
 assert.equal(gmail.text({parts:[{mimeType:'text/html',body:{data:Buffer.from('<img src="https://tracker">').toString('base64url')}},plain('SUNLU PLA\nQuantity: 2'),{...plain('secret attachment'),filename:'file.txt'}]}),'SUNLU PLA\nQuantity: 2');
 assert.equal(gmail.text(plain('Blå PLA')),'Blå PLA');
 assert.throws(()=>gmail.text({mimeType:'text/html'}),/No readable/);
 assert.throws(()=>gmail.text(plain('x'.repeat(60001))),/60000/);
 assert.throws(()=>gmail.text({parts:Array.from({length:201},()=>plain('item'))}),/structure/);
});
