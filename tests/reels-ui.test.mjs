import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const core=createRequire(import.meta.url)('../out/reels-core.js');
function harness(){
 const nodes=new Map(),events={};let focused='',fail=false,pauseSave=null,releaseSave;
 const id='8c9ba219-5fc1-4b50-9ea7-9100cf322c47';
 let state={accountKey:'user_alice',revision:2,items:[{id:'one',colour:'White',brand:'Example',product:'PLA'}],reels:[{id,number:1,itemId:'one',location:'',remainingGrams:null,used:false,spoolmanId:null}],bridge:{enabled:false}};
 const element=name=>({textContent:'',value:'',hidden:false,disabled:false,children:[],checked:false,reset(){},removeAttribute(key){delete this[key]},querySelectorAll(){return []},append(...values){this.children.push(...values)},replaceChildren(...values){this.children=values},setAttribute(){},focus(){focused=name},reportValidity(){return true}});
 const node=name=>{if(!nodes.has(name))nodes.set(name,element(name));return nodes.get(name)};
 const context={SpoolReels:core,SpoolmanTransfer:createRequire(import.meta.url)('../out/spoolman-transfer.js'),document:{getElementById:node,createElement:()=>element('created')},window:{addEventListener(name,callback){events[name]=callback}},location:{origin:'https://test.example',hash:''},AbortSignal,crypto,Date,URL,Blob,setTimeout,
 fetch:async(url,options)=>{
  assert.equal(url,'/api/library');
  if(options.body){if(pauseSave)await pauseSave;if(fail)return Response.json({error:'Refresh before saving.'},{status:409});
   const body=JSON.parse(options.body);assert.equal(body.expectedAccountKey,'user_alice');assert(['reel','spoolman-mappings'].includes(body.kind));state={...state,revision:state.revision+1,reels:[{...state.reels[0],...(body.kind==='reel'?body.reel:{spoolmanId:body.mappings[0].spoolmanId})}]};
  }return Response.json(state);
 }};
 vm.runInNewContext(readFileSync(new URL('../out/reels.js',import.meta.url),'utf8'),context);
 return {node,context,events,id,get focused(){return focused},fail(){fail=true},pause(){pauseSave=new Promise(resolve=>{releaseSave=resolve})},release(){releaseSave()}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('mapping file stages links without saving, rejects foreign accounts and saves only after confirmation',async()=>{
 const app=harness();await tick();
 const file={format:'spool-studio-mappings-v1',origin:'https://test.example',accountKey:'user_bob',mappings:[{id:app.id,spoolmanId:42}]};
 app.node('transfer-file').files=[{size:500,text:async()=>JSON.stringify(file)}];await app.node('transfer-file').onchange();
 assert.equal(app.node('transfer-apply').hidden,true);assert.match(app.node('transfer-status').textContent,/signed-in account/);
 file.accountKey='user_alice';await app.node('transfer-file').onchange();assert.equal(app.node('transfer-apply').hidden,false);assert.match(app.node('transfer-status').textContent,/1 physical spool links ready/);
 app.node('reel-list').children[0].onclick();assert.equal(app.node('reel-spoolman').value,'');
 await app.node('transfer-apply').onclick();assert.equal(app.node('reel-spoolman').value,42);assert.equal(app.node('transfer-apply').hidden,true);assert.match(app.node('transfer-status').textContent,/links saved/);
});
test('reel page aligns its shell and keeps help text and touch targets usable',()=>{
 const css=readFileSync(new URL('../out/reels.css',import.meta.url),'utf8');
 assert.match(css,/header, main, footer\s*\{[^}]*width: 100%;[^}]*max-width: 1100px/);
 assert.match(css,/header\s*\{[^}]*flex-wrap: wrap/);
 assert.match(css,/main > p, #reel-init-help\s*\{[^}]*max-width: 70ch/);
 assert.match(css,/label:has\(input\[type=checkbox\]\)\s*\{[^}]*min-height: 44px/);
 assert.match(css,/summary\s*\{[^}]*min-height: 44px/);
});
test('reel save feedback remains beside the form and does not move focus; errors preserve drafts',async()=>{
 const app=harness();await tick();app.node('reel-list').children[0].onclick();assert.equal(app.focused,'reel-title');
 app.node('reel-location').value='Dryer';app.node('reel-weight').value='620';app.node('reel-save').focus();
 app.pause();app.node('reel-form').onsubmit({preventDefault(){}});assert.equal(app.node('reel-save-status').textContent,'Saving…');
 app.release();await tick();assert.equal(app.focused,'reel-save');assert.equal(app.node('reel-save-status').textContent,'Saved to your private library.');assert.equal(app.node('reel-location').value,'Dryer');
 app.fail();app.node('reel-location').value='New location';app.node('reel-form').onsubmit({preventDefault(){}});await tick();assert.equal(app.node('reel-save-status').textContent,'Refresh before saving.');assert.equal(app.node('reel-location').value,'New location');
});
test('reel secondary text uses theme tokens with accessible light and dark contrast',()=>{
 const css=readFileSync(new URL('../out/reels.css',import.meta.url),'utf8'),tokens=readFileSync(new URL('../out/legal.css',import.meta.url),'utf8');
 assert.match(css,/input::placeholder\s*\{\s*color:\s*var\(--muted\)/);assert.match(css,/\.meta\s*\{[^}]*color:\s*var\(--muted\)/);
 const luminance=hex=>{const channels=[0,2,4].map(offset=>parseInt(hex.slice(offset,offset+2),16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722};
 for(const[foreground,background]of [['596579','f5f6f8'],['acb8cc','141a24'],['acb8cc','1d2634']]){assert(tokens.includes('#'+foreground));assert(tokens.includes('#'+background));const values=[luminance(foreground),luminance(background)].sort((first,second)=>second-first);assert((values[0]+.05)/(values[1]+.05)>=4.5)}
});
