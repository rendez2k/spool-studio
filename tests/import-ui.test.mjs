import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {handleLibrary} from '../server/library.mjs';
import {localDatabase} from '../scripts/local-db.mjs';
const require=createRequire(import.meta.url),code=readFileSync(new URL('../out/import.js',import.meta.url),'utf8');
function node(tag='div'){
 return {tag,children:[],dataset:{},style:{},classList:{add(){}},value:'',checked:false,disabled:false,hidden:false,textContent:'',files:[],className:'',
  append(...children){for(const child of children)if(child&&typeof child==='object')child.parent=this;this.children.push(...children)},replaceChildren(...children){this.children=[];this.append(...children)},setAttribute(name,value){this[name]=value},removeAttribute(name){delete this[name]},remove(){},focus(){},scrollIntoView(){},
  addEventListener(name,handler){this['on'+name]=handler},reportValidity(){return true},
  querySelectorAll(selector){return this.children.flatMap(child=>[...(selector==='.'+child.className||selector==='input,select,textarea'&&['input','select','textarea'].includes(child.tag)||selector==='input[type="checkbox"],button'&&(child.type==='checkbox'||child.tag==='button')||selector==='input[type="checkbox"]'&&child.type==='checkbox'?[child]:[]),...(child.querySelectorAll?child.querySelectorAll(selector):[])])},
  querySelector(selector){if(selector==='legend input[type="checkbox"]')return this.children.find(child=>child.tag==='legend')?.querySelectorAll('input[type="checkbox"]')[0];return this.querySelectorAll(selector)[0]},closest(tag){return this.tag===tag?this:this.parent?.closest(tag)},
  getContext(){return {drawImage(){}}},toBlob(callback){callback(new Blob(['image'],{type:'image/png'}))}
 };
}
async function harness(){
 const DB=localDatabase(),elements=new Map(),posts=[],events={};let user='alice',drop=false;
 const get=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id)};
 const window={addEventListener(name,handler){events[name]=handler}};
 class TestURL extends URL{static createObjectURL(){return 'blob:test'}static revokeObjectURL(){}}
 const context=vm.createContext({window,document:{getElementById:get,createElement:node,createTextNode:text=>({...node(),textContent:text}),querySelectorAll:()=>[],head:node()},SpoolCost:require('../out/cost-core.js'),CostImport:require('../out/cost-import-core.js'),FilamentImport:require('../out/import-parser.js'),FilamentCsv:require('../out/import-csv.js'),FilamentColours:require('../out/colour-catalog.js'),URL:TestURL,Blob,AbortSignal,TextEncoder,TextDecoder,crypto,setTimeout,clearTimeout,createImageBitmap:async()=>({width:800,height:400,close(){}}),
  fetch:async(url,options)=>{
   assert.equal(url,'/api/library');
   if(options.body)posts.push(JSON.parse(options.body));
   const response=await handleLibrary(new Request('https://test.example/api/library',{method:options.method,headers:{'oai-authenticated-user-id':user,origin:'https://test.example','content-type':'application/json'},body:options.body}),{DB});
   if(drop&&options.method==='POST'){drop=false;throw Error('Response lost')}
   return response;
  }});
 vm.runInContext(readFileSync(new URL('../out/import-review.js',import.meta.url),'utf8'),context);
 vm.runInContext(readFileSync(new URL('../out/cost-import-review.js',import.meta.url),'utf8'),context);context.CostImportReview=window.CostImportReview;
 vm.runInContext(code,context);const run=text=>vm.runInContext(text,context);
 await new Promise(resolve=>setImmediate(resolve));
 return {DB,get,window,events,posts,run,setUser(value){user=value},loseNextReply(){drop=true}};
}
function ready(app){
 app.get('source-text').value='SUNLU PLA Matte Orange 1 kg refill\nQuantity: 2';
 app.get('extract').onclick();assert.equal(app.get('save-import').disabled,true);
 app.get('approve-import').checked=true;app.get('approve-import').onchange();
}
test('import UI requires review, preserves retries, and clears private drafts on account changes',async()=>{
 const app=await harness();
 try{
  ready(app);assert.equal(app.posts.length,0);assert.equal(app.get('save-import').disabled,false);
  app.loseNextReply();await app.get('review-form').onsubmit({preventDefault(){}});
  assert.match(app.get('import-message').textContent,/Response lost/);
  await app.get('review-form').onsubmit({preventDefault(){}});
  assert.equal(app.posts.length,2);assert.equal(app.posts[0].requestId,app.posts[1].requestId);
  assert.equal(app.run('library.items.length'),1);assert.equal(app.get('source-text').value,'');
  ready(app);assert.equal(app.run('rows[0].duplicate'),true);assert.equal(app.run('rows[0].selected'),false);
  app.setUser('bob');await app.events.focus();
  assert.equal(app.get('source-text').value,'');assert.equal(app.run('rows.length'),0);assert.equal(app.get('import-workspace').hidden,true);
  assert.equal(app.get('save-import').disabled,true);
 }finally{app.DB.close()}
});
test('late OCR results are discarded after cancel, and bad image types are rejected',async()=>{
 const app=await harness();let resolveWorker,terminated=0;
 try{
  app.get('source-image').files=[{type:'image/heic',size:100}];app.get('source-image').onchange();assert.equal(app.get('read-image').disabled,true);
  app.get('source-image').files=[{type:'image/png',size:100}];app.get('source-image').onchange();assert.equal(app.get('read-image').disabled,false);
  app.window.Tesseract={createWorker:()=>new Promise(resolve=>{resolveWorker=resolve})};
  const running=app.get('read-image').onclick();await new Promise(resolve=>setImmediate(resolve));
  app.get('cancel-read').onclick();
  resolveWorker({recognize:async()=>({data:{text:'Do not insert this'}}),terminate:async()=>{terminated++}});
  await running;
  assert.equal(terminated,1);assert.equal(app.get('source-text').value,'');assert.equal(app.run('reading'),false);assert.equal(app.posts.length,0);
 }finally{app.DB.close()}
});

test('large imports render only one page, preserve edits and choices, and locate off-page errors',async()=>{
 const app=await harness(),csv=require('../out/import-csv.js');
 try{
  app.get('source-format').value='csv';
  app.get('source-text').value=csv.columns.join(',')+'\n'+Array.from({length:500},(_,index)=>'SUNLU,PLA Matte,PLA,matte,Orange '+index+',#EF8D34,2,1000,refill,2026-09-10,Check label').join('\n');
  app.get('extract').onclick();assert.equal(app.run('rows.length'),500);assert.equal(app.get('review-list').children[0].children[2].children.length,40);assert.equal(app.get('review-page').children.length,25);
  app.run("rows[0].spool.notes='Edited on first page';rows[0].selected=false;rows[42].spool.hex='wrong'");
  app.get('review-next').onclick();assert.equal(app.run('reviewPage'),1);assert.match(app.get('review-status').textContent,/21–40/);
  app.get('review-prev-bottom').onclick();assert.equal(app.run('reviewPage'),0);assert.equal(app.run('rows[0].selected'),false);assert.equal(app.run('rows[0].spool.notes'),'Edited on first page');
  app.get('approve-import').checked=true;app.get('approve-import').onchange();await app.get('review-form').onsubmit({preventDefault(){}});
  assert.equal(app.run('reviewPage'),2);assert.match(app.get('import-message').textContent,/Entry 43.*Nothing was saved/);assert.equal(app.run('library.items.length'),0);assert.equal(app.get('approve-import').checked,false);
  app.run("rows[42].spool.hex='#EF8D34'");app.get('approve-import').checked=true;app.get('approve-import').onchange();await app.get('review-form').onsubmit({preventDefault(){}});
  assert.equal(app.run('library.items.length'),499);assert.equal(app.run('rows.length'),0);assert.equal(app.get('review-pagination').hidden,true);
 }finally{app.DB.close()}
});

test('CSV upload uses explicit review, preserves drafts and drops account-stale reads',async()=>{
 const app=await harness();
 const csv='brand,product,material,finish,colour,hex,spools,weightGrams,packaging,date,notes\nSUNLU,PLA Matte,PLA,matte,Orange,#EF8D34,2,1000,refill,2026-09-10,Check label';
 const file={name:'filament.csv',size:csv.length,arrayBuffer:async()=>new TextEncoder().encode(csv).buffer};
 try{
  app.get('source-csv').files=[{...file,name:'sheet.xlsx'}];await app.get('source-csv').onchange();assert.match(app.get('import-message').textContent,/CSV first/);
  app.get('source-csv').files=[file];await app.get('source-csv').onchange();assert.equal(app.run('rows.length'),1);assert.equal(app.posts.length,0);assert(app.get('save-import').disabled);
  app.get('source-csv').files=[file];await app.get('source-csv').onchange();assert.match(app.get('import-message').textContent,/Nothing was replaced/);
  app.get('approve-import').checked=true;app.get('approve-import').onchange();assert(!app.get('save-import').disabled);
  await app.get('review-form').onsubmit({preventDefault(){}});assert.equal(app.posts.length,1);assert.equal(app.posts[0].spools[0].notes,'Check label');assert(!JSON.stringify(app.posts[0]).includes('weightGrams,packaging,date'));
  let resolveRead;app.get('source-csv').files=[{...file,arrayBuffer:()=>new Promise(resolve=>{resolveRead=resolve})}];
  const running=app.get('source-csv').onchange();app.setUser('bob');await app.events.focus();resolveRead(new TextEncoder().encode(csv).buffer);await running;
  assert.equal(app.get('source-text').value,'');assert.equal(app.run('rows.length'),0);assert.equal(app.posts.length,1);
 }finally{app.DB.close()}
});

test('compact table exposes matches, edits unselected rows, syncs selection and reveals invalid details',async()=>{
 const app=await harness();
 try{
  ready(app);await app.get('review-form').onsubmit({preventDefault(){}});ready(app);
  const body=app.get('review-list').children[0].children[2],summary=body.children[0],detail=body.children[1];
  assert.equal(detail.hidden,true);assert.equal(summary.children[4].children[0].textContent,'Similar stock in library');
  const button=summary.children[5].children[0];button.onclick();assert.equal(detail.hidden,false);assert.equal(button['aria-expanded'],'true');
  const entry=detail.children[0].children[1],fields=entry.children.find(child=>child.className==='fields');
  const colour=fields.children[4].children[0];assert.equal(colour.disabled,false);colour.value='Blue';colour.oninput();
  assert.equal(app.run('rows[0].selected'),false);assert.equal(summary.children[1].children[1].textContent,'Blue');assert.equal(summary.children[4].children[0].textContent,'New to library');
  app.get('select-new').onclick();assert.equal(app.run('rows[0].selected'),true);assert.equal(app.get('approve-import').checked,false);
  const updated=app.get('review-list').children[0].children[2];assert.equal(updated.children[1].hidden,true);
  updated.children[1].children[0].children[1].oninvalid();assert.equal(updated.children[1].hidden,false);
  const checkbox=updated.children[0].children[0].children[0];checkbox.checked=false;checkbox.onchange();assert.equal(app.run('rows[0].selected'),false);
  app.get('select-none').onclick();assert.equal(app.get('save-import').disabled,true);
 }finally{app.DB.close()}
});

test('table costs-only mode preserves edits and never auto-selects an ambiguous purchase',async()=>{
 const app=await harness();
 try{
  ready(app);await app.get('review-form').onsubmit({preventDefault(){}});ready(app);
  app.run("rows[0].spool.notes='Keep this edit';rows[0].spool.costPerRoll=12.99;rows[0].spool.costCurrency='GBP'");
  app.get('import-mode').value='costs';app.get('import-mode').onchange();
  assert.equal(app.run('rows[0].spool.notes'),'Keep this edit');assert.equal(app.run('rows[0].selected'),false);assert.equal(app.get('select-new').hidden,true);
  const summary=app.get('review-list').children[0].children[2].children[0];assert.equal(summary.children[4].children[0].textContent,'Choose purchase');assert.equal(summary.children[3].textContent,'GBP 12.99');
  app.get('import-mode').value='add';app.get('import-mode').onchange();assert.equal(app.run('rows[0].selected'),false);assert.equal(app.run('rows[0].spool.notes'),'Keep this edit');
 }finally{app.DB.close()}
});

test('unchecked invalid fields stay editable without blocking a valid selected import',async()=>{
 const app=await harness();
 try{
  ready(app);app.get('add-blank').onclick();
  const body=app.get('review-list').children[0].children[2],second=body.children[3].children[0].children[1];
  const input=second.querySelectorAll('input,select,textarea').find(input=>input.type==='number');
  input.value='-1';input.oninput();let validations=0;input.reportValidity=()=>{validations++;return false};
  const choice=body.children[2].children[0].children[0];choice.checked=false;choice.onchange();
  assert.equal(app.get('review-form').noValidate,true);app.get('approve-import').checked=true;app.get('approve-import').onchange();
  await app.get('review-form').onsubmit({preventDefault(){}});assert.equal(validations,0);assert.equal(app.posts.length,1);assert.equal(app.posts[0].spools.length,1);
 }finally{app.DB.close()}
});
