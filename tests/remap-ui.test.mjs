import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

test('remap UI keeps explicit choices, reviews export and discards stale account results',async()=>{
 const nodes=new Map(),downloads=[];let resolveExport,exportCalls=0;
 const node=()=>({textContent:'',disabled:false,open:false,children:[],handlers:{},replaceChildren(){this.children=[];},append(child){this.children.push(child);},showModal(){this.open=true;},close(){this.open=false;},addEventListener(name,handler){this.handlers[name]=handler;},click(){downloads.push(this.download);},remove(){}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
 const candidate=(id,distance=3)=>({row:{id,brand:'Example',product:'PLA',colour:'Blue',hex:'#336699',spools:1,material:'PLA'},finish:'standard',sameFinish:true,exact:false,distance});
 const close=candidate('close'),explicit=candidate('explicit'),far=candidate('far',20);
 const project={name:'example.3mf',sourceFile:{arrayBuffer:async()=>new ArrayBuffer(1)}};
 const slots=[{required:{slot:1,included:true,finish:'standard',hex:'#0000FF',nfcChoice:'explicit'},result:{same:[close,explicit],alternatives:[]}},{required:{slot:2,included:true,finish:'standard',hex:'#0000FF'},result:{same:[close],alternatives:[]}},{required:{slot:3,included:false,hex:'#000000'},result:{same:[far],alternatives:[]}}];
 const context=vm.createContext({document:{getElementById:get,createElement:node,body:node()},dataset:{accountKey:'alice'},activeMatchProject:0,matchReport:[{project,slots}],selectedNfcCandidate:(required,result)=>result.same.find(option=>option.row.id===required.nfcChoice),URL:{createObjectURL:()=> 'blob:export',revokeObjectURL(){}},setTimeout:callback=>callback(),FilamentRemapper:{exportProject:async()=>{exportCalls++;return new Promise(resolve=>{resolveExport=resolve;});}}});
 context.renderMatcher=()=>vm.runInContext('FilamentRemapUi.render()',context);
 vm.runInContext(readFileSync(new URL('../out/remap-ui.js',import.meta.url),'utf8'),context);
 context.renderMatcher();assert(get('remap-open').disabled);
 get('remap-suggest').onclick();assert.equal(slots[0].required.nfcChoice,'explicit');assert.equal(slots[1].required.nfcChoice,'close');assert.equal(slots[2].required.nfcChoice,undefined);assert(!get('remap-open').disabled);assert.equal(exportCalls,0);
 get('remap-open').onclick();assert(get('remap-dialog').open);assert.equal(get('remap-review').children.length,2);assert.equal(exportCalls,0);
 const stale=get('remap-download').onclick();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(exportCalls,1);assert(get('remap-download').disabled);
 await get('remap-download').onclick();assert.equal(exportCalls,1);
 context.dataset.accountKey='bob';context.renderMatcher();assert(!get('remap-dialog').open);assert.equal(get('remap-review').children.length,0);
 resolveExport({blob:{}});await stale;assert.equal(downloads.length,0);
 get('remap-open').onclick();const valid=get('remap-download').onclick();await new Promise(resolve=>setImmediate(resolve));resolveExport({blob:{}});await valid;assert.deepEqual(downloads,['example-my-filaments.3mf']);assert.match(get('remap-status').textContent,/re-slice/);
 slots[0].required.nfcChoice='not-in-stock';context.renderMatcher();assert(get('remap-open').disabled);
 slots[0].required.included=false;slots[1].result.same=[far];slots[1].required.nfcChoice=null;get('remap-suggest').onclick();assert.equal(slots[1].required.nfcChoice,null);
});
