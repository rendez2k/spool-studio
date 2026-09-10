import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {handleLibrary} from '../server/library.mjs';
import {handleAccountExport} from '../server/account-export.mjs';
import {serveNetlify,returnPath} from '../server/netlify-app.mjs';
import {localDatabase} from '../scripts/local-db.mjs';
const require=createRequire(import.meta.url),setup=require('../out/setup-core.js');
const request=(user,body,origin='https://test.example')=>new Request('https://test.example/api/library',{method:body?'POST':'GET',headers:{...(user?{'oai-authenticated-user-id':user}:{}),origin,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
const command=(revision,change)=>({kind:'setup',expectedAccountKey:'alice',baseRevision:revision,requestId:crypto.randomUUID(),setup:change});

test('checklist derives stock only; optional completion is explicit and skips never enable integrations',()=>{
 assert.equal(setup.steps.length,6);assert.equal(setup.status({items:[]})[0].state,'pending');
 const data={items:[{id:'one'}],bridge:{enabled:true,lastSync:'2026-09-10'},reels:[{spoolmanId:1}]};
 assert.equal(setup.status(data)[0].state,'done');assert.equal(setup.status(data).at(-1).state,'pending');
 setup.update(data,{step:'tracking',state:'skipped'});assert.equal(setup.status(data).at(-1).state,'skipped');assert.equal(data.bridge.enabled,true);
 setup.update(data,{dismissed:true});setup.update(data,{step:'tracking',state:'done'});assert.equal(data.setup.dismissed,true);
 setup.update(data,{step:'tracking',state:'pending'});assert.equal(data.setup.steps.tracking,undefined);
 for(const input of [{step:'library',state:'done'},{step:'made-up',state:'done'},{step:'nfc',state:'enabled'},{dismissed:'yes'},{dismissed:true,items:[]},null])assert.throws(()=>setup.update(data,input));
 assert.deepEqual(setup.preferences({dismissed:1,steps:{tracking:'evil',secret:'done',nfc:'done'}}),{dismissed:false,steps:{nfc:'done'}});
});

test('setup writes are private, revision guarded and idempotent, and cannot change stock or credentials',async()=>{
 const DB=localDatabase(),original={items:[{id:'one',brand:'Example',hex:'#123456',spools:3,used:false}],reels:[{id:'reel',remainingGrams:200,spoolmanId:4}],bridgeHash:'SECRET_BRIDGE_HASH_DO_NOT_EXPORT',nextReelNumber:2};
 try{
  await DB.prepare("INSERT INTO libraries (user_id, revision, payload, request_id, updated_at) VALUES (?, 1, ?, '', ?)").bind('alice',JSON.stringify(original),'2026-09-10').run();
  const act=body=>handleLibrary(request('alice',body),{DB});const change=command(1,{step:'phone',state:'done'});
  assert.equal((await handleLibrary(request(null,change),{DB})).status,401);
  assert.equal((await handleLibrary(request('bob',change),{DB})).status,409);
  assert.equal((await handleLibrary(request('alice',change,'https://other.example'),{DB})).status,403);
  let value=await(await act(change)).json();assert.equal(value.setup.steps.phone,'done');assert.equal(value.revision,2);
  assert.equal((await(await act(change)).json()).revision,2);
  assert.equal((await act(command(1,{step:'nfc',state:'done'}))).status,409);
  assert.equal((await act(command(2,{step:'library',state:'done'}))).status,400);
  value=await(await act(command(2,{dismissed:true}))).json();assert.equal(value.setup.dismissed,true);
  const stored=JSON.parse((await DB.prepare('SELECT payload FROM libraries WHERE user_id = ?').bind('alice').first()).payload);delete stored.setup;assert.deepEqual(stored,original);
  const exported=await(await handleAccountExport(new Request('https://test.example/api/account-export',{headers:{'oai-authenticated-user-id':'alice'}}),{DB})).json();assert.equal(exported.library.setup.steps.phone,'done');assert(!JSON.stringify(exported).includes('SECRET_BRIDGE_HASH_DO_NOT_EXPORT'));
  assert.deepEqual((await(await handleLibrary(request('bob'),{DB})).json()).setup,{dismissed:false,steps:{}});
 }finally{DB.close()}
});

function element(tag='div'){
 return {tag,children:[],dataset:{},hidden:false,disabled:false,checked:false,open:false,textContent:'',append(...children){this.children.push(...children)},replaceChildren(...children){this.children=children},focus(){this.focused=true},
  querySelectorAll(selector){const all=this.children.flatMap(child=>[child,...child.querySelectorAll('*')]);if(selector==='*')return all;if(selector==='button,input')return all.filter(child=>['button','input'].includes(child.tag));if(selector==='details[open]')return all.filter(child=>child.tag==='details'&&child.open);return []},
  querySelector(selector){const id=selector.match(/data-step="([^"]+)"/)?.[1];return this.children.find(child=>child.dataset.step===id)?.children[0]}
 };
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function harness(href='https://test.example/welcome.html'){
 const nodes=new Map(),events={},posts=[],DB=localDatabase();let user='alice',drop=false,fail=false,defer=null;
 const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};
 get('setup-dismiss').tag='input';get('setup-refresh').tag='button';get('setup-work').append(get('setup-steps'),get('setup-dismiss'),get('setup-refresh'));
 const context={location:{href},SpoolSetup:setup,document:{getElementById:get,createElement:element},window:{addEventListener:(name,fn)=>events[name]=fn},AbortSignal,crypto,URL,
  fetch:async(url,options)=>{assert.equal(url,'/api/library');assert.equal(options.credentials,'same-origin');const body=options.body?JSON.parse(options.body):null;if(body)posts.push(body);if(defer)await new Promise(resolve=>defer(resolve));if(fail)return Response.json({error:'Offline'},{status:503});const result=await handleLibrary(request(user,body),{DB});if(body&&drop){drop=false;throw Error('Reply lost')}return result}
 };
 vm.runInNewContext(readFileSync(new URL('../out/welcome.js',import.meta.url),'utf8'),context);await flush();
 return {get,events,posts,DB,setUser:value=>user=value,loseReply:()=>drop=true,setFailure:value=>fail=value,setDelay:fn=>defer=fn,button:text=>get('setup-steps').querySelectorAll('*').find(child=>child.tag==='button'&&child.textContent===text)};
}

test('welcome remembers confirmed choices, retries uncertain saves and clears state on changed accounts',async()=>{
 const app=await harness();try{
  assert.equal(app.get('setup-work').hidden,false);assert.match(app.get('setup-progress').textContent,/0 of 6 done/);assert.equal(app.posts.length,0);
  app.loseReply();await app.button('I’ve tried matching a print').onclick();assert.match(app.get('setup-status').textContent,/Reply lost/);
  await app.button('I’ve tried matching a print').onclick();assert.equal(app.posts.length,2);assert.equal(app.posts[0].requestId,app.posts[1].requestId);assert.match(app.get('setup-progress').textContent,/1 of 6 done/);
  assert(app.get('setup-steps').querySelector('[data-step="match"] summary').focused);
  app.get('setup-dismiss').checked=true;await app.get('setup-dismiss').onchange();assert.equal(app.get('setup-dismiss').checked,true);
  app.setUser('bob');await app.events.focus();assert.match(app.get('setup-progress').textContent,/0 of 6 done/);assert.equal(app.get('setup-dismiss').checked,false);
  app.setFailure(true);await app.events.focus();assert.equal(app.get('setup-work').hidden,true);assert.equal(app.get('setup-retry').hidden,false);assert.match(app.get('setup-status').textContent,/Offline/);
 }finally{app.DB.close()}
});

test('welcome ignores results after leaving and cannot save after an account mismatch',async()=>{
 const app=await harness();try{
  app.setUser('bob');await app.button('I’ve tried matching a print').onclick();assert.equal(app.get('setup-work').hidden,true);assert.equal(app.get('setup-retry').hidden,false);
  await app.get('setup-retry').onclick();assert.equal(app.get('setup-work').hidden,false);
  let release;app.setDelay(resolve=>release=resolve);const loading=app.events.focus();app.events.pagehide();release();await loading;assert.match(app.get('setup-status').textContent,/Checking/);app.setDelay(null);app.events.pageshow();await flush();assert.match(app.get('setup-status').textContent,/up to date/);
 }finally{app.DB.close()}
});

test('welcome routing is private and all checklist links point at supported local pages',async()=>{
 assert.equal(returnPath('/welcome.html'),'/welcome.html');assert.equal(returnPath('//evil.example'),'/');
 assert(!existsSync(new URL('../dist/netlify-public/welcome.html',import.meta.url)));assert(existsSync(new URL('../dist/netlify-pages/welcome.html',import.meta.url)));
 const response=await serveNetlify(new Request('https://test.example/welcome.html'),{publishableKey:'pk_test_'+Buffer.from('clerk.example$').toString('base64').replaceAll('=',''),origins:['https://test.example'],authenticate:async()=>({isAuthenticated:false,headers:new Headers()}),database:()=>{throw Error('No account should load')},readPage:async()=>'<html><!-- CLERK --><h1>Welcome</h1></html>'});
 assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert((await response.text()).includes('auth-account'));
 for(const step of setup.steps)for(const [,href] of step.links){const url=new URL(href,'https://test.example');assert.equal(url.origin,'https://test.example');const path=url.pathname==='/'?'index.html':url.pathname.slice(1);const content=readFileSync(new URL('../out/'+path,import.meta.url),'utf8');if(url.hash)assert(content.includes('id="'+url.hash.slice(1)+'"'))}
 assert.match(readFileSync(new URL('../hosting/netlify/auth-client.js',import.meta.url),'utf8'),/'\/welcome.html'/);
});

test('library welcome reminder is optional and setup links open views without creating stock',()=>{
 for(const action of ['add','match','shelf','bad']){
  const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,textContent:'',click(){this.clicked=true}});return nodes.get(id)},writes=[],history=[];
  const context={window:{},document:{getElementById:get},dataset:{status:'complete',accountKey:'alice',setup:{}},items:[],SpoolSetup:setup,libraryBusy:false,libraryRefreshing:false,location:{href:'https://test.example/?setup='+action},URL,history:{replaceState:(...args)=>history.push(args)},saveLibraryAction:body=>writes.push(body),openSpoolForm:()=>get('form').opened=true};
  vm.runInNewContext(readFileSync(new URL('../out/setup-nudge.js',import.meta.url),'utf8'),context);
  assert.equal(writes.length,0);assert.equal(get('setup-reminder').hidden,false);
  if(action==='add')assert(get('form').opened);else if(action!=='bad')assert(get(action+'-tab').clicked);
  assert.equal(history.length,action==='bad'?0:1);
  get('setup-hide').onclick();assert.equal(writes[0].kind,'setup');assert.equal(writes[0].expectedAccountKey,'alice');
  context.dataset.setup={dismissed:true};context.window.SetupReminder.update();assert.equal(get('setup-reminder').hidden,true);
  context.dataset.status='signedout';context.window.SetupReminder.update();assert.equal(get('setup-reminder').hidden,true);
 }
});
test('setup feature links retain context and the return opens the original step without marking it done',async()=>{
 const app=await harness('https://test.example/welcome.html?step=match#setup-match');
 try{
  const details=app.get('setup-steps').children,match=details.find(detail=>detail.dataset.step==='match');
  assert.equal(match.open,true);assert.equal(details.find(detail=>detail.dataset.step==='library').open,false);
  const link=match.querySelectorAll('*').find(child=>child.tag==='a');
  assert.equal(link.href,'/?setup=match&setupStep=match');assert.equal(app.posts.length,0);
  assert.match(app.get('setup-progress').textContent,/0 of 6 done/);
 }finally{app.DB.close()}
});

test('feature setup bar returns to the exact step, exits without saving, and rejects unknown context',()=>{
 for(const step of ['match','nfc','not-valid']){
  const main=element('main'),history=[];main.prepend=node=>main.children.unshift(node);
  const create=tag=>{const node=element(tag);node.setAttribute=()=>{};node.remove=()=>main.children.splice(main.children.indexOf(node),1);return node};
  vm.runInNewContext(readFileSync(new URL('../out/setup-flow.js',import.meta.url),'utf8'),{SpoolSetup:setup,URL,location:{href:'https://test.example/?setupStep='+step},history:{replaceState:(...args)=>history.push(args)},document:{createElement:create,querySelector:()=>main}});
  if(step==='not-valid'){assert.equal(main.children.length,0);continue}
  const banner=main.children[0];assert.equal(banner.children[1].href,'/welcome.html?step='+step+'#setup-'+step);banner.children[2].onclick();assert.equal(main.children.length,0);assert.equal(history[0][2],'/');
 }
});
