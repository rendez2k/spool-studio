import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {validateSpool,handleLibrary} from '../server/library.mjs';
import {localDatabase} from '../scripts/local-db.mjs';
const require=createRequire(import.meta.url),cost=require('../out/cost-core.js'),csv=require('../out/import-csv.js'),parser=require('../out/import-parser.js');
const spool={brand:'Test',product:'PLA Basic',material:'PLA',finish:'standard',colour:'White',hex:'#FFFFFF',spools:4,weightGrams:1000,packaging:'spooled',date:'2026-09-10',notes:''};

test('spool costs validate separately from quantities and preserve unknown versus zero',()=>{
 const html=readFileSync(new URL('../out/index.html',import.meta.url),'utf8');
 assert(html.includes("if(!combined&&!familyMode&&mode!=='shelf')cols.push('costPerRoll','costCurrency')"));
 assert(html.slice(html.indexOf('<form id="spool-form"'),html.indexOf('</form></dialog>',html.indexOf('<form id="spool-form"'))).includes('Cost is for one physical'));
 for(const amount of [-1,100001,1.001,Infinity,'12'])assert.throws(()=>validateSpool({...spool,costPerRoll:amount,costCurrency:'GBP'}));
 assert.throws(()=>validateSpool({...spool,costPerRoll:12,costCurrency:''}));
 assert.throws(()=>validateSpool({...spool,costPerRoll:12,costCurrency:'XYZ'}));
 assert.equal(validateSpool({...spool,costPerRoll:0,costCurrency:'GBP'}).costPerRoll,0);
 assert.equal(validateSpool(spool).costPerRoll,undefined);
 assert.equal(cost.purchase({...spool,lineTotal:40,currency:'GBP'}).amount,10);
 assert.equal(cost.purchase({...spool,lineTotal:40,currency:'GBP',costPerRoll:null,costCurrency:'GBP'}),null);
 assert.equal(cost.purchase({...spool,costPerRoll:undefined}),null);
});

test('cost imports accept optional decimal CSV fields and only explicit per-roll text',()=>{
 const header=csv.columns.join(',')+',costPerRoll,costCurrency';
 const line='Bambu Lab,PLA Basic,PLA,standard,White,#FFFFFF,2,1000,spooled,2026-09-10,,12.99,GBP';
 assert.equal(csv.parse(header+'\n'+line)[0].spool.costPerRoll,12.99);
 assert.throws(()=>csv.parse(header+'\n'+line.replace('12.99','12,99')));
 assert.throws(()=>csv.parse(header+'\n'+line.replace('12.99','£12.99')));
 assert.throws(()=>csv.parse(header+'\n'+line.replace(',GBP',',')));
 assert.equal(parser.parse('Bambu Lab PLA White 1kg\nCost per roll: GBP 12.99')[0].spool.costPerRoll,12.99);
 assert.equal(parser.parse('Bambu Lab PLA White 1kg\nOrder total: £30')[0].spool.costPerRoll,undefined);
 assert.deepEqual(cost.fromText('Cost per roll: GBP 12\nCost per roll: GBP 14'),{});
 assert.equal(cost.fromText('Price per spool: £0').costPerRoll,0);
});

test('estimates use original full-roll grams, show ranges and never combine currencies or unknown costs',()=>{
 const first={...spool,costPerRoll:20,costCurrency:'GBP'};
 assert.deepEqual(cost.estimate(50,[first]),{currency:'GBP',min:1,max:1});
 assert.deepEqual(cost.estimate(50,[first,{...first,costPerRoll:30}]),{currency:'GBP',min:1,max:1.5});
 assert(cost.estimate(null,[first]).error);assert(cost.estimate(-1,[first]).error);assert(cost.estimate(50,[]).error);
 assert(cost.estimate(50,[first,{...spool}]).error);assert(cost.estimate(50,[{...first,weightGrams:null}]).error);
 assert(cost.estimate(50,[first,{...first,costCurrency:'EUR'}]).error);
 assert.deepEqual(cost.estimate(0,[]),{zero:true});
 const total=cost.total([cost.estimate(50,[first]),cost.estimate(50,[{...first,costCurrency:'EUR'}]),cost.estimate(null,[])]);
 assert.equal(total.missing,1);assert.deepEqual(Object.keys(total.currencies),['GBP','EUR']);
 assert.deepEqual(cost.estimate(100,[spool],{perKg:15,currency:'GBP'}),{currency:'GBP',min:1.5,max:1.5,assumed:true});
 assert.equal(cost.estimate(100,[first],{perKg:15,currency:'GBP'}).min,2);
 assert(cost.estimate(100,[spool],{perKg:NaN,currency:'GBP'}).error);
 assert(cost.estimate(100,[spool,{...first,costCurrency:'EUR'}],{perKg:15,currency:'GBP'}).error);
});

test('costs persist on add/import and edits without cost fields do not erase existing prices',async()=>{
 const DB=localDatabase();
 const call=async(user,body)=>handleLibrary(new Request('https://test.example/api/library',{method:body?'POST':'GET',headers:{'oai-authenticated-user-id':user,origin:'https://test.example','content-type':'application/json'},body:body?JSON.stringify(body):undefined}),{DB});
 try{
  let state=await(await call('alice')).json();
  state=await(await call('alice',{kind:'add',baseRevision:state.revision,requestId:crypto.randomUUID(),spool:{...spool,costPerRoll:12.99,costCurrency:'GBP'}})).json();
  assert.equal(state.items[0].costPerRoll,12.99);
  state=await(await call('alice',{kind:'edit',id:state.items[0].id,baseRevision:state.revision,requestId:crypto.randomUUID(),spool})).json();
  assert.equal(state.items[0].costPerRoll,12.99);
  state=await(await call('alice',{kind:'import',expectedAccountKey:'alice',reviewed:true,sourceHash:'f'.repeat(64),baseRevision:state.revision,requestId:crypto.randomUUID(),spools:[{...spool,costPerRoll:0,costCurrency:'GBP'}]})).json();
  assert.equal(state.items[1].costPerRoll,0);assert.equal(state.items[1].costCurrency,'GBP');
  assert.deepEqual((await(await call('bob')).json()).items,[]);
 }finally{DB.close()}
});

test('model cost UI uses original purchase counts, updates grams and excludes unchecked colours',()=>{
 let panel;
 const node=()=>({children:[],value:'',textContent:'',append(...children){this.children.push(...children)},setAttribute(){},before(){}});
 const originals=[{...spool,id:'one',lineTotal:40,currency:'GBP'}];
 const candidate={row:{...originals[0],spools:1,members:[{...originals[0],spools:1}]}};
 const context=vm.createContext({SpoolCost:cost,items:originals,selectedNfcCandidate:()=>null,Intl,document:{createElement:node,createTextNode:text=>({textContent:text}),querySelector:()=>({querySelector:()=>({after(value){panel=value}})})}});
 vm.runInContext(readFileSync(new URL('../out/cost-ui.js',import.meta.url),'utf8'),context);
 context.project={};context.slots=[{required:{slot:1,included:true},result:{same:[candidate]}},{required:{slot:2,included:false},result:{same:[]}}];
 vm.runInContext('SpoolCostUi.render(project,slots)',context);
 assert.equal(panel.children[2].children.length,1);
 const input=panel.children[2].children[0].children[0].children[0];input.value='100';input.oninput();
 assert.equal(panel.children[2].children[0].children[1].textContent,'£1.00');
 assert.match(panel.children[3].textContent,/Estimated filament cost: £1.00/);
 vm.runInContext('SpoolCostUi.render(project,slots)',context);
 assert.equal(panel.children[2].children[0].children[0].children[0].value,'100');
});
