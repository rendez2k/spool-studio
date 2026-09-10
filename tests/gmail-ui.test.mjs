import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const core=createRequire(import.meta.url)('../out/gmail-core.js');
function harness(){
 const elements=new Map(),events={},calls=[];let clientConfig,resolveSlow,resolveSetup,slowSetup=false,messageCount=1,requests=0,slow=false,currentAccount='user_alice',enabled=true,scopeGranted=true;
 function element(){return {children:[],value:'',textContent:'',disabled:false,hidden:false,checked:false,append(...values){this.children.push(...values)},replaceChildren(...values){this.children=values},focus(){},remove(){},querySelectorAll(selector){return this.children.flatMap(child=>[...(child.type==='checkbox'&&(selector!=='input:checked'||child.checked)?[child]:[]),...child.querySelectorAll(selector)])}}}
 const node=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
 node('gmail-connect').hidden=true;
 const oauth2={initTokenClient(config){clientConfig=config;return {requestAccessToken(){requests++}}},hasGrantedAllScopes(){return scopeGranted},revoke(token,callback){assert.equal(token,'test-token');callback({successful:true})}};
 const context=vm.createContext({library:{accountKey:'user_alice'},saving:false,reading:false,rows:[],api:async()=>({accountKey:currentAccount}),changed(){},extract(){context.rows=[{source:node('source-text').value}];node('source-panel').open=false},loseAccount(){context.library=null;context.window.GmailImport.clear()},SpoolGmail:core,SpoolGmailHtml:{text:()=>{throw Error("Unexpected HTML body")}},
  window:{google:{accounts:{oauth2}},addEventListener(name,callback){events[name]=callback}},document:{getElementById:node,createElement:element,head:element()},Date,Uint8Array,TextDecoder,AbortController,AbortSignal,setTimeout,clearTimeout,
  fetch:async(url,options)=>{
   calls.push({url,options});
   if(url==='/api/gmail-config'){const reply={enabled,clientId:'123-test.apps.googleusercontent.com',testing:true};if(slowSetup)await new Promise(resolve=>resolveSetup=resolve);return Response.json(reply)}
   assert(url.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/'));assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer test-token');
   if(url.includes('messages?'))return Response.json({messages:Array.from({length:messageCount},(_,index)=>({id:(2748+index).toString(16)}))});
   if(url.includes('format=metadata'))return Response.json({payload:{headers:[{name:'Subject',value:'Synthetic filament order'}]}});
   if(slow)await new Promise(resolve=>{resolveSlow=resolve});
   return Response.json({payload:{mimeType:'text/plain',body:{data:Buffer.from('SUNLU PLA Orange 1 kg\nQuantity: 1').toString('base64url')}}});
  }});
 vm.runInContext(readFileSync(new URL('../out/gmail-import.js',import.meta.url),'utf8'),context);
 return {node,context,calls,events,setMessageCount(value){messageCount=value},get requests(){return requests},delaySetup(){slowSetup=true},finishSetup(){slowSetup=false;resolveSetup?.()},delayGoogle(){context.window.google=undefined},finishGoogle(){context.window.google={accounts:{oauth2}};context.document.head.children.at(-1).onload()},consent(){clientConfig.callback({access_token:'test-token',expires_in:3600})},get config(){return clientConfig},setEnabled(value){enabled=value},setGranted(value){scopeGranted=value},setAccount(value){currentAccount=value},slow(){slow=true},finishSlow(){resolveSlow?.()}};
}
test('Gmail is opt-in, requests read-only access and reviews only selected plain text without a save',async()=>{
 const app=harness();assert.equal(app.calls.length,0);
 await app.node('gmail-prepare').onclick();assert.equal(app.config.scope,'https://www.googleapis.com/auth/gmail.readonly');assert.equal(app.config.include_granted_scopes,false);
 app.node('gmail-connect').onclick();assert.equal(app.calls.length,1);app.consent();
 await app.node('gmail-search').onclick();assert.equal(app.node('gmail-results').children.length,1);assert(!app.calls.some(call=>call.url.includes('format=full')));
 const query=new URL(app.calls.find(call=>call.url.includes('messages?')).url).searchParams.get('q');
 assert.match(query,/subject:confirmed/);assert.match(query,/-subject:shipment/);assert.match(query,/-subject:setup/);
 app.node('gmail-results').children[0].children[0].checked=true;
 await app.node('gmail-read').onclick();assert.match(app.node('source-text').value,/SUNLU PLA Orange/);assert.equal(app.context.rows.length,1);assert.equal(app.node('source-panel').open,false);assert.match(app.node('gmail-status').textContent,/Review the detected/);
 assert(!app.calls.some(call=>call.options.method==='POST'));app.node('gmail-disconnect').onclick();assert.match(app.node('gmail-status').textContent,/revoked/);
 assert.match(app.node('source-text').value,/SUNLU/);assert.equal(app.node('gmail-results').children.length,0);
});

test('Gmail defaults to purchase subjects with a deliberate unfiltered fallback and invalidates old selections',async()=>{
 const query=core.searchQuery(core.defaultQuery);
 for(const subject of ['confirmed','confirmation','receipt','invoice','ordered'])assert(query.includes('subject:'+subject));
 for(const subject of ['shipment','delivery','delivered','tracking','welcome','account','password','newsletter','setup','return','returned','refund','refunded','cancelled','canceled','cancellation'])assert(query.includes('-subject:'+subject));
 assert.equal(core.searchQuery('from:shop.example after:2026/09/01','all'),'from:shop.example after:2026/09/01');
 assert.throws(()=>core.searchQuery('  '),/Enter a brand/);
 const app=harness();await app.node('gmail-prepare').onclick();app.node('gmail-connect').onclick();app.consent();
 await app.node('gmail-search').onclick();assert.equal(app.node('gmail-results').children.length,1);
 app.node('gmail-search-kind').value='all';app.node('gmail-search-kind').onchange();assert.equal(app.node('gmail-results').children.length,0);
 await app.node('gmail-search').onclick();
 const latest=app.calls.filter(call=>call.url.includes('messages?')).at(-1);
 assert.equal(new URL(latest.url).searchParams.get('q'),core.defaultQuery);
 app.node('gmail-query').value='from:another.example';app.node('gmail-query').oninput();assert.equal(app.node('gmail-results').children.length,0);
 app.node('gmail-disconnect').onclick();
});
test('Gmail selection count prevents over-selection and can clear without losing results or a draft',async()=>{
 const app=harness();app.setMessageCount(12);await app.node('gmail-prepare').onclick();app.node('gmail-connect').onclick();app.consent();await app.node('gmail-search').onclick();
 const boxes=app.node('gmail-results').children.map(label=>label.children[0]);
 assert.equal(app.node('gmail-read').disabled,true);assert.equal(app.node('gmail-clear-selection').disabled,true);assert.equal(app.node('gmail-selection').textContent,'0 of 10 emails selected');
 for(const box of boxes.slice(0,10)){box.checked=true;box.onchange()}
 assert.equal(app.node('gmail-read').disabled,false);assert.match(app.node('gmail-selection').textContent,/10 of 10/);assert(boxes.slice(10).every(box=>box.disabled));assert(boxes.slice(0,10).every(box=>!box.disabled));
 boxes[0].checked=false;boxes[0].onchange();assert.equal(boxes[10].disabled,false);assert.match(app.node('gmail-selection').textContent,/9 of 10/);
 app.node('source-text').value='keep my draft';app.node('gmail-clear-selection').onclick();assert.equal(app.node('source-text').value,'keep my draft');assert.equal(app.node('gmail-results').children.length,12);assert(boxes.every(box=>!box.checked&&!box.disabled));assert.equal(app.node('gmail-read').disabled,true);
 boxes[0].checked=true;boxes[0].onchange();app.node('gmail-query').oninput();assert.equal(app.node('gmail-selection').textContent,'0 of 10 emails selected');assert.equal(app.node('gmail-read').disabled,true);
 app.node('gmail-disconnect').onclick();
});

test('unconfigured Gmail and rejected scope never load messages',async()=>{
 const app=harness();app.setEnabled(false);await app.node('gmail-prepare').onclick();assert.equal(app.node('gmail-connect').hidden,true);
 assert.match(app.node('gmail-status').textContent,/not enabled/);assert.equal(app.config,undefined);
 app.setEnabled(true);await app.node('gmail-prepare').onclick();app.node('gmail-connect').onclick();app.setGranted(false);app.consent();assert.match(app.node('gmail-status').textContent,/not granted/);
 assert(!app.calls.some(call=>call.url.startsWith('https:')));
});
test('Gmail account changes and cancelled body requests cannot overwrite a draft',async()=>{
 const app=harness();await app.node('gmail-prepare').onclick();app.node('gmail-connect').onclick();app.consent();await app.node('gmail-search').onclick();app.node('gmail-results').children[0].children[0].checked=true;
 app.node('source-text').value='existing draft';await app.node('gmail-read').onclick();assert.equal(app.node('source-text').value,'existing draft');
 app.node('source-text').value='';app.slow();const read=app.node('gmail-read').onclick();await new Promise(resolve=>setImmediate(resolve));app.node('gmail-cancel').onclick();app.finishSlow();await read;assert.equal(app.node('source-text').value,'');
 app.setAccount('user_bob');await app.node('gmail-search').onclick();assert.equal(app.node('gmail-results').children.length,0);assert.equal(app.context.library,null);
 app.events.pagehide();
});
test('cancelled or departed Gmail preparation cannot revive a stale connection',async()=>{
 for(const action of ['cancel','pagehide','account']){
  const app=harness();app.delaySetup();const preparing=app.node('gmail-prepare').onclick();await new Promise(resolve=>setImmediate(resolve));
  if(action==='cancel')app.node('gmail-cancel').onclick();
  if(action==='pagehide')app.events.pagehide();
  if(action==='account'){app.context.library={accountKey:'user_bob'};app.setAccount('user_bob');app.context.window.GmailImport.clear()}
  const message=app.node('gmail-status').textContent;app.finishSetup();await preparing;
  assert.equal(app.node('gmail-connect').hidden,true);assert.equal(app.node('gmail-connect').disabled,true);assert.equal(app.config,undefined);assert.equal(app.requests,0);assert.equal(app.node('gmail-status').textContent,message);
 }
});

test('late Google library loading and old consent callbacks cannot cross an account boundary',async()=>{
 const app=harness();app.delayGoogle();const preparing=app.node('gmail-prepare').onclick();await new Promise(resolve=>setImmediate(resolve));
 app.context.library={accountKey:'user_bob'};app.setAccount('user_bob');app.context.window.GmailImport.clear();app.finishGoogle();await preparing;
 assert.equal(app.node('gmail-connect').hidden,true);assert.equal(app.config,undefined);
 await app.node('gmail-prepare').onclick();app.node('gmail-connect').onclick();const stale=app.config;
 app.context.window.GmailImport.clear();app.context.library={accountKey:'user_charlie'};app.setAccount('user_charlie');
 stale.callback({access_token:'test-token',expires_in:3600});assert.equal(app.node('gmail-search').disabled,true);assert(!app.calls.some(call=>call.url.startsWith('https:')));
});

test('a revoked private-test gate removes earlier preparation and requires fresh account-bound setup',async()=>{
 const app=harness();await app.node('gmail-prepare').onclick();assert.equal(app.node('gmail-connect').hidden,false);
 app.setEnabled(false);await app.node('gmail-prepare').onclick();app.node('gmail-connect').onclick();assert.equal(app.requests,0);assert.equal(app.node('gmail-connect').hidden,true);assert.match(app.node('gmail-status').textContent,/not enabled/);
 app.setEnabled(true);await app.node('gmail-prepare').onclick();app.context.library={accountKey:'user_bob'};app.setAccount('user_bob');app.node('gmail-connect').onclick();assert.equal(app.requests,0);assert.equal(app.node('gmail-connect').hidden,true);assert.match(app.node('gmail-status').textContent,/account changed/);
});
