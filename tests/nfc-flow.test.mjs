import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url),__dirname=fileURLToPath(new URL('.',import.meta.url));
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const codec=require('../out/nfc-codec.js'),qrcode=require('../out/vendor/qrcode.js');
const selection={v:1,p:'Sample print 🧩',s:[{n:1,m:'PLA',c:'EF8D34',f:'matte',l:'Example · Orange'}]};
assert.deepEqual(codec.decode(codec.encode(selection)),selection);
for(const invalid of ['', '%%%','a'.repeat(2001)])assert.throws(()=>codec.decode(invalid));
for(const override of [{m:'PLA+'},{c:'red'},{n:0},{f:'invented'},{l:'bad\nlabel'}])assert.throws(()=>codec.validate({...selection,s:[{...selection.s[0],...override}]}));
assert.throws(()=>codec.validate({...selection,s:[selection.s[0],selection.s[0]]}));
assert.throws(()=>codec.validate({...selection,s:Array.from({length:5},(_,index)=>({...selection.s[0],n:index+1}))}));
const expected=codec.payload(selection.s[0]);
assert.deepEqual(expected,{protocol:'openspool',version:'1.0',brand:'Generic',type:'PLA',subtype:'Basic',color_hex:'EF8D34'});
assert.equal(codec.payload(selection.s[0],'#ffffff',{min:'190',max:'220'}).max_temp,220);
for(const range of [{min:190},{min:240,max:200},{min:149,max:200},{min:200,max:301}])assert.throws(()=>codec.payload(selection.s[0],undefined,range));
assert(codec.matches(codec.message(expected),expected));
assert(codec.matches(codec.message(Object.fromEntries(Object.entries(expected).reverse())),expected));
assert(!codec.matches(codec.message({...expected,color_hex:'000000'}),expected));
assert(!codec.matches({records:[{recordType:'text',data:new TextEncoder().encode('{}')}]},expected));
const qr=qrcode(0,'M');qr.addData('https://test.example/nfc.html#queue='+codec.encode(selection),'Byte');qr.make();assert(qr.createSvgTag({cellSize:5,margin:20,scalable:true}).startsWith('<svg'));
function node(){
 const classes=new Set();
 return {value:'',textContent:'',innerHTML:'',checked:false,disabled:false,hidden:false,children:[],attrs:{},style:{setProperty(){}},dataset:{},append(...children){this.children.push(...children)},replaceChildren(){this.children=[]},querySelectorAll(){return this.children},setAttribute(key,value){this.attrs[key]=value},addEventListener(){},focus(){},scrollIntoView(){},reportValidity(){return true},classList:{add(value){classes.add(value)},remove(value){classes.delete(value)},contains(value){return classes.has(value)},toggle(value,force){if(force??!classes.has(value))classes.add(value);else classes.delete(value)}}};
}
function phone(supported=true,live=null){
 const elements=new Map(),storage=new Map([['filament-used-v1','preserve']]),events={},readers=[],writes=[];
 const get=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id)};
 let writeError=null,holdWrite=false;
 class Reader{
  constructor(){readers.push(this)}
  write(message,options){writes.push({message,options});if(writeError)return Promise.reject(writeError);if(holdWrite)return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));return Promise.resolve()}
  scan(){return Promise.resolve()}
 }
 const window={isSecureContext:true,addEventListener(name,handler){events[name]=handler}};window.top=window;window.self=window;if(supported)window.NDEFReader=Reader;
 const context=vm.createContext({window,document:{getElementById:get,createElement:node,addEventListener(name,handler){events[name]=handler}},FilamentNfc:codec,FilamentSync:live?{request:live}:undefined,localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},location:{hash:live?'':'#queue='+codec.encode(selection),pathname:'/nfc.html',search:'',origin:'https://test.example'},history:{replaceState(){}},URL,AbortController,DOMException,setTimeout,clearTimeout,setInterval(){}});
 vm.runInContext(fs.readFileSync(__dirname+'/../out/nfc-writer.js','utf8'),context);
 return {get,storage,readers,writes,events,run:code=>vm.runInContext(code,context),fail(error){writeError=error},hold(){holdWrite=true}};
}
async function main(){
 const app=phone();assert.equal(app.writes.length,0);assert(app.get('write-tag').disabled);
 assert(app.get('nfc-spinner').hidden);
 await app.run('performNfc(true)');assert.equal(app.writes.length,0);
 app.get('confirm-tag').checked=true;app.get('confirm-tag').onchange();const writeAndVerify=app.run('performNfc(true)');assert.equal(app.writes.length,1);assert(codec.matches(app.writes[0].message,expected));assert.equal(app.writes[0].options.overwrite,true);
 assert(!app.get('nfc-spinner').hidden);
 app.readers.at(-1).onreading({message:codec.message(expected)});assert.notEqual(app.run('outcomes.get(0)'),'Verified');
 await new Promise(resolve=>setImmediate(resolve));assert.equal(app.run('outcomes.get(0)'),'Written');assert.equal(app.run('operationPhase'),'verifying');assert(app.get('tag-colour').disabled);
 app.readers.at(-1).onreading({message:codec.message(expected)});await writeAndVerify;assert.equal(app.run('outcomes.get(0)'),'Verified');assert.equal(app.get('confirm-tag').checked,true);
 assert(app.get('nfc-spinner').hidden);
 const verifying=app.run('performNfc(false)');assert(app.get('tag-colour').disabled);app.readers.at(-1).onreading({message:codec.message(expected)});await verifying;assert.equal(app.run('outcomes.get(0)'),'Verified');assert.equal(app.writes.length,1);
 const mismatch=app.run('performNfc(false)');app.readers.at(-1).onreading({message:codec.message({...expected,color_hex:'000000'})});await mismatch;assert.equal(app.run('outcomes.get(0)'),'Check tag');
 app.get('tag-colour').value='#000000';app.get('tag-colour').oninput();assert.equal(app.run('outcomes.size'),0);assert(app.get('confirm-tag').checked);
 app.get('confirm-tag').checked=true;app.get('confirm-tag').onchange();app.fail(new DOMException('Denied','NotAllowedError'));await app.run('performNfc(true)');assert.match(app.get('nfc-status').textContent,/not confirmed.*Allow NFC/);
 app.fail(null);app.hold();app.get('confirm-tag').checked=true;app.get('confirm-tag').onchange();const pending=app.run('performNfc(true)'),before=app.writes.length;await app.run('performNfc(true)');assert.equal(app.writes.length,before);app.get('cancel-nfc').onclick();await pending;assert.match(app.get('nfc-status').textContent,/Cancelled/);assert(!app.get('tag-colour').disabled);
 assert(app.get('nfc-spinner').hidden);
 const checking=app.run('performNfc(false)');assert(!app.get('nfc-spinner').hidden);app.readers.at(-1).onreading({message:codec.message(expected)});await checking;assert(app.get('nfc-spinner').hidden);
 app.get('clear-queue').onclick();assert.equal(app.storage.get('filament-used-v1'),'preserve');assert(!app.storage.has('filament-nfc-queue-v1'));assert(app.get('writer').hidden);
 app.get('transfer-link').value='https://evil.example/nfc.html#queue='+codec.encode(selection);app.get('load-link').onclick();assert.match(app.get('link-status').textContent,/this Filament Library/);
 const unsupported=phone(false);assert(unsupported.get('write-tag').disabled);unsupported.get('confirm-tag').checked=true;unsupported.get('confirm-tag').onchange();await unsupported.run('performNfc(true)');assert.equal(unsupported.writes.length,0);
 const html=fs.readFileSync(__dirname+'/../out/index.html','utf8'),elements=new Map();
 for(const match of html.matchAll(/\bid="([^"]+)"/g))elements.set(match[1],node());
 const get=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id)};
 get('dataset').textContent=JSON.stringify({status:'complete',items:require('./fixtures/inventory.cjs')});get('from').value='2026-03-08';get('to').value='2026-09-08';
 const context=vm.createContext({testSeeds:require('./fixtures/matcher-projects.json'),FilamentNfc:codec,qrcode,FilamentMatcher:require('../out/matcher.js'),document:{getElementById:get,querySelector:node,querySelectorAll:()=>[],body:node(),createElement:node},localStorage:{getItem:()=>null,setItem(){}},matchMedia:()=>({matches:false}),Blob,URL,location:{protocol:'https:',href:'https://test.example/'},setTimeout(){}});
 const run=code=>vm.runInContext(code,context);run(html.match(/<script>\s*('use strict';[\s\S]*?)<\/script>/)[1]);run('matchProjects=testSeeds.map(seed=>FilamentMatcher.parseSettings(seed.settings,seed.name));renderMatcher()');assert(get('nfc-send').disabled);
 run('matchReport[0].slots.forEach(({required,result})=>{required.nfcChoice=result.same[0]?.row.id});renderMatcher();sendNfcToPhone()');
 assert(!get('nfc-send').disabled);assert(!get('nfc-transfer').classList.contains('hidden'));
 const transferred=codec.decode(new URL(get('nfc-share-link').value).hash.slice(7));assert.equal(transferred.s.length,4);assert.equal(transferred.s[0].c,run('FilamentNfc.hex(matchReport[0].slots[0].result.same[0].row.hex)'));assert.notEqual(transferred.s[0].c,run('FilamentNfc.hex(matchReport[0].slots[0].required.hex)'));
 run('matchProjects[0].slots[0].included=false;sendNfcToPhone()');assert.equal(codec.decode(new URL(get('nfc-share-link').value).hash.slice(7)).s.length,3);
 run("matchProjects[0].slots[1].nfcChoice='no-longer-available';sendNfcToPhone()");assert(get('nfc-send').disabled);assert(get('nfc-transfer').classList.contains('hidden'));assert.match(get('match-status').textContent,/currently available/);
 run('activeMatchProject=1;renderMatcher()');assert(get('nfc-send').disabled);
 const flow=phone();flow.run('installQueue('+JSON.stringify({...selection,s:[selection.s[0],{...selection.s[0],n:2,c:'FFFFFF'}]})+')');flow.get('confirm-tag').checked=true;flow.get('confirm-tag').onchange();
 const first=flow.run('performNfc(true)');await new Promise(resolve=>setImmediate(resolve));flow.readers.at(-1).onreading({message:codec.message(expected)});await first;assert(!flow.get('next-tag').hidden);assert(flow.get('write-tag').hidden);
 flow.get('next-tag').onclick();assert.equal(flow.run('selectedTag'),1);assert.equal(flow.writes.length,1);assert(flow.get('confirm-tag').checked);assert(!flow.get('write-tag').disabled);
 flow.get('confirm-tag').checked=true;flow.get('confirm-tag').onchange();const interrupted=flow.run('performNfc(true)');await new Promise(resolve=>setImmediate(resolve));flow.get('cancel-nfc').onclick();await interrupted;assert.match(flow.get('nfc-status').textContent,/Written, but not verified/);assert.equal(flow.run('outcomes.get(1)'),'Check tag');

 const tick=()=>new Promise(resolve=>setImmediate(resolve));
 let liveState={revision:1,batch:{p:selection.p,state:'ready',total:1,chosen:1,selection},updatedAt:'first'};
 let disconnected=false;
 const live=phone(true,async()=>{if(disconnected)throw Error('Offline');return structuredClone(liveState)});
 await tick();assert.equal(live.run('phoneQueue.p'),selection.p);assert(!live.run('batchApproved'));
 live.get('confirm-tag').checked=true;live.get('confirm-tag').onchange();
 await live.run('refreshLive()');assert(live.run('batchApproved'));
 const liveWrite=live.run('performNfc(true)');await tick();
 const nextQueue={...selection,p:'Next project',s:[{...selection.s[0],c:'FFFFFF'}]};
 liveState={revision:2,batch:{p:nextQueue.p,state:'ready',total:1,chosen:1,selection:nextQueue},updatedAt:'second'};
 await live.run('refreshLive()');
 assert.equal(live.run('phoneQueue.p'),selection.p);assert(live.run('pendingLiveState'));assert(live.get('load-latest').disabled);assert(live.run('nfcOperation'));
 live.readers.at(-1).onreading({message:codec.message(expected)});await liveWrite;
 assert(live.get('write-tag').disabled);assert(!live.get('load-latest').disabled);
 live.get('load-latest').onclick();assert.equal(live.run('phoneQueue.p'),'Next project');assert(!live.run('batchApproved'));assert.equal(live.run('outcomes.size'),0);
 live.get('confirm-tag').checked=true;live.get('confirm-tag').onchange();assert(!live.get('write-tag').disabled);
 disconnected=true;await live.run('refreshLive()');assert(live.get('write-tag').disabled);
 disconnected=false;await live.run('refreshLive()');assert(!live.get('write-tag').disabled);assert(live.run('batchApproved'));
 liveState={revision:3,batch:{p:'Third project',state:'choosing',total:4,chosen:0,selection:null},updatedAt:'third'};
 await live.run('refreshLive()');live.get('load-latest').onclick();assert.equal(live.run('phoneQueue'),null);assert(!live.run('batchApproved'));assert.match(live.get('sync-status').textContent,/4 more/);
 assert.equal(live.storage.get('filament-used-v1'),'preserve');

 const markup=fs.readFileSync(__dirname+'/../out/nfc.html','utf8'),ids=[...markup.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);assert.equal(new Set(ids).size,ids.length);assert(!markup.includes('<details'));assert(markup.includes('form="tag-form"'));assert(markup.includes('id="form-error"'));
 console.log('PASS: NFC codec, QR handoff, automatic fresh read-back, stale-read rejection, next colour, confirmation, mismatch, permission, cancellation and storage safeguards (simulated NFC; no hardware test).');
}
main().catch(error=>{console.error(error);process.exit(1)});
