import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../out/release.js',import.meta.url),'utf8'),key='spool-studio-release-seen';
function harness({version='1.5.1',seen='',notes=false,hidden=false,below=false,blocked=false,latest='1.5.1',offline=false}={}){
 const storage=new Map(seen?[[key,seen]]:[]),events={},classes=new Set(),attributes={},calls=[];let observer,clock=100000,rect={top:below?1000:10,bottom:below?1040:50};
 const link={classList:{toggle(name,value){value?classes.add(name):classes.delete(name)}},setAttribute(name,value){attributes[name]=value}};
 const heading={getBoundingClientRect:()=>rect};
 const document={visibilityState:hidden?'hidden':'visible',querySelector:()=>({content:version}),querySelectorAll:()=>notes?[]:[link],getElementById:()=>notes?{querySelector:()=>heading}:null,addEventListener(name,callback){events[name]=callback}};
 const context={document,window:{innerHeight:800,addEventListener(name,callback){events[name]=callback}},IntersectionObserver:class{constructor(callback){observer=callback}observe(){}},localStorage:{getItem(name){if(blocked)throw Error('Storage blocked');return storage.get(name)||null},setItem(name,value){if(blocked)throw Error('Storage blocked');storage.set(name,value)}},Date:{now:()=>clock},AbortSignal,fetch:async(url,options)=>{calls.push({url,options});if(offline)throw Error('Offline');return {ok:true,json:async()=>({displayVersion:latest})}}};
 vm.runInNewContext(source,context);
 return {storage,events,classes,attributes,link,calls,document,view(){rect={top:10,bottom:50};observer?.()},advance(){clock+=60001},flush:()=>new Promise(resolve=>setImmediate(resolve))};
}
test('unread releases highlight the icon and clear across tabs only after notes are viewed',async()=>{
 const app=harness();await app.flush();assert(app.classes.has('release-unread'));assert.match(app.attributes['aria-label'],/New updates available/);assert.equal(app.storage.size,0);
 app.storage.set(key,'1.5.1');app.events.storage({key});assert(!app.classes.has('release-unread'));assert(!app.attributes['aria-label'].includes('New updates'));
 app.storage.delete(key);app.events.storage({key:null});assert(app.classes.has('release-unread'));
});
test('background and offscreen release notes do not count as read, and old pages cannot downgrade seen version',()=>{
 const hidden=harness({notes:true,hidden:true});assert.equal(hidden.storage.size,0);hidden.document.visibilityState='visible';hidden.events.visibilitychange();assert.equal(hidden.storage.get(key),'1.5.1');
 const below=harness({notes:true,below:true});assert.equal(below.storage.size,0);below.view();assert.equal(below.storage.get(key),'1.5.1');
 const old=harness({notes:true,seen:'1.10.0'});assert.equal(old.storage.get(key),'1.10.0');assert.equal(old.calls.length,0);
});
test('a newer public release updates the destination without replacing the running version or reloading',async()=>{
 const app=harness({seen:'1.5.1',latest:'1.6.0'});await app.flush();assert(app.classes.has('release-unread'));assert.equal(app.link.href,'/whats-new.html#v1.6.0');assert.match(app.attributes['aria-label'],/^Version 1.5.1\. New updates available: 1.6.0/);
 app.events.focus();await app.flush();assert.equal(app.calls.length,1);app.advance();app.events.focus();await app.flush();assert.equal(app.calls.length,2);assert.equal(app.calls[0].options.credentials,'omit');
});
test('unavailable storage, offline checks and malformed releases do not break the app',async()=>{
 const blocked=harness({notes:true,blocked:true});blocked.events.focus();
 for(const latest of ['<script>','1.2','999999999999999999999.0.0',null]){const app=harness({latest});await app.flush();assert.equal(app.link.href,'/whats-new.html#v1.5.1')}
 const offline=harness({offline:true});await offline.flush();assert(offline.classes.has('release-unread'));
 const future=harness({seen:'1.10.0',latest:'1.9.0'});await future.flush();assert(!future.classes.has('release-unread'));
});
