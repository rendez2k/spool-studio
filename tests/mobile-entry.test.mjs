import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../out/mobile-entry.js',import.meta.url),'utf8');
function harness(search='?add=barcode',status='complete'){
 const nodes=new Map(),events={},selected=[];let opened=0,replaced;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{open:false,focus(){this.focused=true},close(){this.open=false}});return nodes.get(id)};
 const context={URL,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}},location:{href:'https://test.example/'+search,origin:'https://test.example'},history:{replaceState(_state,_unused,url){replaced=String(url)}},libraryBusy:false,dataset:{status,accountKey:'alice'},openSpoolForm(){opened++;node('spool-dialog').open=true},document:{getElementById:node,addEventListener(type,callback){events[type]=callback},querySelector(){return null}},window:{SpoolAssist:{},dispatchEvent(event){selected.push(event.detail)}}};
 vm.runInNewContext(source,context);
 return {context,node,events,selected,opened:()=>opened,replaced:()=>replaced};
}
test('barcode deep link opens a reviewed draft once without starting a camera or lookup',()=>{
 const app=harness('?view=cards&add=barcode#keep');
 assert.equal(app.opened(),1);assert.deepEqual(app.selected,['barcode']);assert.equal(app.node('assist-scan').focused,true);
 assert.equal(app.replaced(),'https://test.example/?view=cards#keep');
 app.node('spool-dialog').open=false;app.context.window.MobileEntry.resume();assert.equal(app.opened(),1);
 assert.doesNotMatch(source,/getUserMedia|fetch\(|\.click\(/);
});
test('entry waits for a loaded signed-in library and ignores unknown methods',()=>{
 const app=harness('?add=manual','loading');assert.equal(app.opened(),0);
 app.context.dataset.status='complete';app.context.dataset.accountKey='';app.context.window.MobileEntry.resume();assert.equal(app.opened(),0);
 app.context.dataset.accountKey='alice';app.context.window.MobileEntry.resume();assert.equal(app.opened(),1);assert.equal(app.node('spool-brand-choice').focused,true);
 assert.equal(harness('?add=delete').opened(),0);
});
test('same-page shortcuts preserve an existing draft and respect modified clicks',()=>{
 const app=harness('');let prevented=false;
 const event={target:{closest:()=>({href:'https://test.example/?add=barcode'})},button:0,preventDefault(){prevented=true}};
 app.events.click({...event,ctrlKey:true});assert.equal(prevented,false);assert.equal(app.opened(),0);
 app.events.click(event);assert.equal(prevented,true);assert.equal(app.opened(),1);
 app.events.click(event);assert.equal(app.opened(),1);
});
test('NFC landing page and installed shortcuts expose adding without replacing NFC start',()=>{
 const html=readFileSync(new URL('../out/nfc.html',import.meta.url),'utf8');
 assert.match(html,/href="\/\?add=barcode"/);assert.match(html,/href="\/\?add=manual"/);
 const manifest=JSON.parse(readFileSync(new URL('../out/app.webmanifest',import.meta.url),'utf8'));
 assert.equal(manifest.start_url,'/nfc.html');
 for(const method of ['barcode','manual'])assert(manifest.shortcuts.some(shortcut=>shortcut.url==='/?add='+method));
});
