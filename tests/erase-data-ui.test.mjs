import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function harness(){
 const nodes=new Map(),events={},calls=[];let responseStatus=200,owner='user_alice';
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false,value:'',textContent:id==='auth-account'?'""':'',focus(){}});return nodes.get(id)};
 node('auth-account').textContent='{"userId":"user_alice"}';node('erase-form').hidden=true;
 const context={document:{getElementById:node},window:{addEventListener:(name,fn)=>events[name]=fn},location:{origin:'https://test.example'},AbortSignal,crypto,fetch:async(url,options)=>{
  calls.push({url,options});return url==='/api/account-export'?Response.json({format:'spool-studio-account-export-v1',origin:'https://test.example',accountKey:owner,library:{revision:5,items:[{},{}],reels:[{}]},phoneBatch:{revision:4}}):Response.json(responseStatus===200?{accountKey:owner,cleared:true}:{error:'Synthetic failure'},{status:responseStatus});
 }};
 vm.runInNewContext(readFileSync(new URL('../out/erase-data.js',import.meta.url),'utf8'),context);
 return {node,calls,events,status:value=>responseStatus=value,owner:value=>owner=value};
}
test('erasure UI separates review and typed confirmation; cancel and changed accounts never erase',async()=>{
 const app=harness();await app.node('erase-review').onclick();assert.equal(app.calls.length,1);assert.equal(app.calls[0].url,'/api/account-export');assert.equal(app.node('erase-submit').disabled,true);
 await app.node('erase-form').onsubmit({preventDefault(){}});assert.equal(app.calls.length,1);
 app.node('erase-confirmation').value='ERASE MY SAVED DATA';app.node('erase-confirmation').oninput();assert.equal(app.node('erase-submit').disabled,false);
 app.node('erase-cancel').onclick();assert.equal(app.node('erase-form').hidden,true);assert.equal(app.calls.length,1);
 await app.node('erase-review').onclick();app.node('erase-confirmation').value='ERASE MY SAVED DATA';app.node('auth-account').textContent='{"userId":"user_bob"}';await app.node('erase-form').onsubmit({preventDefault(){}});assert.equal(app.calls.length,2);assert.match(app.node('erase-status').textContent,/account changed/);
});
test('uncertain erasure retries preserve request ID; conflicts force fresh review; success does not claim full account deletion',async()=>{
 const app=harness();await app.node('erase-review').onclick();app.node('erase-confirmation').value='ERASE MY SAVED DATA';app.status(503);
 await app.node('erase-form').onsubmit({preventDefault(){}});const first=JSON.parse(app.calls[1].options.body);assert.equal(first.libraryRevision,5);assert.equal(first.phoneRevision,4);assert.equal(app.node('erase-form').hidden,false);
 app.status(200);await app.node('erase-form').onsubmit({preventDefault(){}});assert.equal(JSON.parse(app.calls[2].options.body).requestId,first.requestId);assert.equal(app.node('erase-form').hidden,true);assert.match(app.node('erase-status').textContent,/Your login remains/);
 await app.node('erase-review').onclick();app.node('erase-confirmation').value='ERASE MY SAVED DATA';app.status(409);await app.node('erase-form').onsubmit({preventDefault(){}});assert.equal(app.node('erase-form').hidden,true);assert.match(app.node('erase-status').textContent,/Review again/);
});
