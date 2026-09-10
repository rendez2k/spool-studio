import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const labels=createRequire(import.meta.url)('../out/labels-core.js');
const snapshot={accountKey:'test-owner',uncounted:1,slots:[{position:1,shelf:1,shelfSlot:1,colour:'Jade White',brand:'Bambu Lab',product:'PLA Basic',material:'PLA',finish:'standard',weightGrams:1000,packaging:'refill'},{position:2,shelf:1,shelfSlot:2,colour:'Orange',brand:'SUNLU',product:'PLA Matte',material:'PLA',finish:'matte'}]};

test('label presets use exact mm sizes and custom dimensions reject CSS injection and invalid bounds',()=>{
 assert.deepEqual(labels.dimensions('60x30'),[60,30]);
 assert.deepEqual(labels.dimensions('4x6'),[101.6,152.4]);
 assert.deepEqual(labels.dimensions('custom','60.5','30'),[60.5,30]);
 for(const pair of [['NaN',30],['60; color:red',30],[39,30],[211,30],[60,24],[60,298],[Infinity,30],['',30]])assert.throws(()=>labels.dimensions('custom',...pair));
});

test('paired labels preserve the shelf order, exact finish and identical box/spool numbering without inventing bundle rolls',()=>{
 const before=JSON.stringify(snapshot);
 const result=labels.plan(snapshot,{start:1,end:2,copies:2});
 assert.equal(result.length,4);assert.deepEqual(result[0],result[1]);assert.deepEqual(result[2],result[3]);
 assert.deepEqual(result.map(row=>row.position),[1,1,2,2]);assert.equal(result[2].finish,'matte');assert.equal(result[0].packaging,'refill');
 assert.equal(JSON.stringify(snapshot),before);assert.notEqual(result[0],result[1]);
 assert.deepEqual(labels.plan(snapshot,{start:2,end:2,copies:1}).map(row=>row.position),[2]);
});

test('printing requires a loaded account, counted rolls, valid range and at most 500 labels including copies',()=>{
 assert.throws(()=>labels.plan({...snapshot,accountKey:''},{start:1,end:1,copies:1}),/Sign in/);
 assert.throws(()=>labels.plan({...snapshot,slots:[]},{start:1,end:1,copies:1}),/no counted/);
 for(const options of [{start:0,end:1,copies:1},{start:2,end:1,copies:1},{start:1.1,end:2,copies:1},{start:1,end:3,copies:1},{start:1,end:2,copies:3}])assert.throws(()=>labels.plan(snapshot,options));
 const big={...snapshot,slots:Array.from({length:251},(_,index)=>({...snapshot.slots[0],position:index+1}))};
 assert.equal(labels.plan(big,{start:1,end:250,copies:2}).length,500);
 assert.throws(()=>labels.plan(big,{start:1,end:251,copies:2}),/500/);
});

test('snapshot comparison notices account, order, stock and metadata changes',()=>{
 for(const updated of [{...snapshot,accountKey:'another-owner'},{...snapshot,slots:snapshot.slots.toReversed()},{...snapshot,slots:snapshot.slots.slice(1)},{...snapshot,uncounted:2},{...snapshot,slots:[{...snapshot.slots[0],colour:'Ivory'},snapshot.slots[1]]}])assert.notEqual(labels.signature(snapshot),labels.signature(updated));
 assert.equal(labels.signature(snapshot),labels.signature(structuredClone(snapshot)));
});

test('label UI is linked to available shelf slots, has isolated print CSS and no storage or inventory writes',()=>{
 const read=file=>readFileSync(new URL('../out/'+file,import.meta.url),'utf8');
 const html=read('index.html'),script=read('labels.js'),css=read('labels.css');
 assert.match(html,/id="open-labels"/);assert.match(html,/displayed.filter\(row=>row.slotId&&!isUsed\(row\)\)/);
 for(const file of ['labels.css','labels-core.js','labels.js'])assert(html.includes('/'+file));
 assert.match(script,/child.textContent=text/);assert.match(script,/find\(overflow\)/);assert.match(script,/window.print\(\)/);
 assert.match(script,/afterprint/);assert.match(script,/pagehide/);assert.doesNotMatch(script,/fetch\(|localStorage|sessionStorage|\.innerHTML\s*=.*row/);
 assert.match(css,/size|label-width/);assert.match(css,/body.printing-spool-labels > :not\(#spool-label-print\)/);assert.match(css,/break-after: page/);
 assert.match(read('guide.html'),/id="labels"/);
});

test('label interactions print paired copies, clear print staging, block stale stock and reject overflow',()=>{
 let current=structuredClone(snapshot),overflowing=false,printCount=0,observe;
 const elements=new Map(),events={};
 function element(){
  const classes=new Set();
  return {value:'',hidden:false,disabled:false,children:[],textContent:'',style:{setProperty(){}},classList:{add:value=>classes.add(value),remove:value=>classes.delete(value),contains:value=>classes.has(value)},
   clientHeight:100,clientWidth:200,scrollHeight:overflowing?200:50,scrollWidth:180,
   get firstChild(){return this.children[0]},append(...children){this.children.push(...children)},replaceChildren(...children){this.children=children},setAttribute(){},focus(){},addEventListener(name,handler){this[name]=handler}};
 }
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
 const body=element(),head=element();
 get('label-panel').hidden=true;get('label-size').value='60x30';get('label-copies').value='2';
 const context={document:{getElementById:get,createElement:element,body,head},window:{getShelfLabelSnapshot:()=>current,print:()=>{printCount++},addEventListener:(name,handler)=>{events[name]=handler}},structuredClone,SpoolLabels:labels,MutationObserver:class{constructor(handler){observe=handler}observe(){}}};
 vm.runInNewContext(readFileSync(new URL('../out/labels.js',import.meta.url),'utf8'),context);
 get('open-labels').onclick();assert.equal(get('label-panel').hidden,false);assert.equal(get('label-print').disabled,false);
 get('label-settings').onsubmit({preventDefault(){}});assert.equal(printCount,1);assert.equal(body.children[0].children.length,4);
 assert.match(head.children[0].textContent,/size: 60mm 30mm; margin: 0/);assert(body.classList.contains('printing-spool-labels'));
 assert.equal(body.children[0].children[0].children[0].textContent,body.children[0].children[1].children[0].textContent);
 events.afterprint();assert.equal(body.children[0].children.length,0);assert(!body.classList.contains('printing-spool-labels'));assert.equal(head.children[0].textContent,'');
 current={...current,accountKey:'different-account'};observe();assert.equal(get('label-print').disabled,true);get('label-settings').onsubmit({preventDefault(){}});assert.equal(printCount,1);
 get('label-refresh').onclick();assert.equal(get('label-print').disabled,false);
 overflowing=true;get('label-settings').onsubmit({preventDefault(){}});assert.equal(printCount,1);assert.match(get('label-status').textContent,/will not fit/);assert.equal(body.children[0].children.length,0);
 overflowing=false;get('label-size').value='custom';get('label-width').value='50';get('label-height').value='30';get('label-settings').input();get('label-settings').onsubmit({preventDefault(){}});assert.equal(printCount,2);assert.match(head.children[0].textContent,/size: 50mm 30mm/);
 events.pagehide();assert.equal(body.children[0].children.length,0);
 get('label-width').value='1';get('label-settings').input();assert.equal(get('label-print').disabled,true);assert.equal(get('label-width').disabled,false);
 get('label-size').value='60x30';get('label-settings').input();assert.equal(get('label-print').disabled,false);assert.equal(get('label-width').disabled,true);assert.equal(get('label-height').disabled,true);
 get('label-settings').onsubmit({preventDefault(){}});assert.equal(printCount,3);events.afterprint();
});
