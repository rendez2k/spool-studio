import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),stock=require('../out/strata-stock.js'),reels=require('../out/reels-core.js');
const token='0123456789abcdef0123456789abcdef',sender='https://strata3mf.uk';
const row={id:'private-id',brand:'Bambu Lab',product:'PLA Basic',colour:'Black',material:'PLA',finish:'standard',hex:'#000000',spools:2,costPerRoll:14,order:'PRIVATE',email:'PRIVATE',accountKey:'PRIVATE',notes:'PRIVATE',used:false};
function fixture(options={}){
 const listeners=new Map(),intervals=new Map(),timeouts=new Map(),messages=[],updates=[];
 let sequence=0,clears=0,context=options.context||{ready:true,accountKey:'private-account',revision:1},rows=options.rows||[row];
 const opener={closed:false,postMessage:(data,origin)=>messages.push({data:structuredClone(data),origin})};
 const host={location:{href:options.href||'https://spool-studio.uk/?view=cards#strata-stock='+token+'&sender='+encodeURIComponent(sender)},opener:options.noOpener?null:opener,
  addEventListener:(name,callback)=>listeners.set(name,callback),removeEventListener:name=>listeners.delete(name),
  setInterval:callback=>{intervals.set(++sequence,callback);return sequence},clearInterval:id=>intervals.delete(id),
  setTimeout:(callback,delay)=>{timeouts.set(++sequence,{callback,delay});return sequence},clearTimeout:id=>timeouts.delete(id),
 };
 const offer=stock.offer({host,context:()=>context,snapshot:()=>stock.palette(rows),update:(phase,message,review)=>updates.push({phase,message,review}),clearFragment:()=>clears++});
 const request={type:'strata-spool:stock-request',version:1,token};
 return {offer,opener,host,messages,updates,listeners,intervals,timeouts,request,
  send:(data=request,source=opener,origin=sender)=>listeners.get('message')?.({data,source,origin}),
  setContext:value=>context=value,setRows:value=>rows=value,get clears(){return clears},
 };
}
test('stock payload explicitly whitelists metadata and aggregates exact available colours',()=>{
 const result=stock.palette([row,{...row,id:'other-private',spools:3},{...row,used:true},{...row,spools:null},{...row,spools:0},{...row,hex:'bad'},{...row,colour:'Rainbow'},{...row,colour:'Black/White'}]);
 assert.deepEqual(result.colours,[{brand:'Bambu Lab',product:'PLA Basic',colour:'Black',material:'PLA',finish:'standard',hex:'#000000',availableRolls:5}]);
 assert.equal(result.omitted,3);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE|private-id|costPerRoll|accountKey|order|email|notes/);
 assert.equal(row.spools,2);
});
test('physical reel flags determine available counts without modifying reels',()=>{
 const physical=[{id:'a',itemId:row.id,used:false},{id:'b',itemId:row.id,used:true}];
 assert.equal(stock.palette(reels.rows([row],physical)).colours[0].availableRolls,1);
 assert.deepEqual(physical,[{id:'a',itemId:row.id,used:false},{id:'b',itemId:row.id,used:true}]);
});
test('palette normalises hex, respects explicit unknown finish, rejects unsafe sizes and keeps variants separate',()=>{
 const result=stock.palette([{...row,hex:'#abcdefFF',finish:'unknown'},{...row,hex:'#abcdef',finish:undefined},{...row,material:'PETG'},{...row,brand:'x'.repeat(81)}],()=> 'standard');
 assert.equal(result.colours.length,3);assert.equal(result.omitted,1);
 assert(result.colours.some(colour=>colour.hex==='#ABCDEF'&&colour.finish==='unknown'));
 assert(result.colours.some(colour=>colour.hex==='#ABCDEF'&&colour.finish==='standard'));
 assert.throws(()=>stock.palette([{...row,spools:500000},{...row,spools:1}]),/Too many/);
 assert.throws(()=>stock.palette(Array.from({length:1001},(_,index)=>({...row,colour:'Shade '+index}))),/Too many/);
});
test('request and ready disclose no stock; only explicit Share emits one metadata snapshot',()=>{
 const state=fixture();assert.equal(state.offer.share(),false);
 state.send();assert.equal(state.offer.phase,'review');
 assert(state.messages.every(message=>message.data.type==='strata-spool:stock-ready'));
 assert.doesNotMatch(JSON.stringify(state.messages),/Bambu|private-account|availableRolls|PRIVATE/);
 assert.equal(state.offer.share(),true);assert.equal(state.offer.share(),false);state.send();
 const data=state.messages.filter(message=>message.data.type==='strata-spool:stock-data');
 assert.equal(data.length,1);assert.equal(data[0].origin,sender);
 assert.deepEqual(Object.keys(data[0].data).sort(),['colours','token','type','version']);
 state.send({...state.request,type:'strata-spool:stock-received'});
 assert.equal(state.offer.phase,'received');assert.equal(state.clears,1);
 assert.equal(state.listeners.size,0);assert.equal(state.intervals.size,0);assert.equal(state.timeouts.size,0);
});
test('foreign origin/source/token/version and file messages cannot open approval or share data',()=>{
 const state=fixture();
 state.send(state.request,{},sender);state.send(state.request,state.opener,'https://evil.test');
 for(const patch of [{token:'wrong'},{version:2},{type:'strata-spool:file'},{type:'strata-spool:stock-received'}])state.send({...state.request,...patch});
 assert.equal(state.offer.phase,'ready');assert.equal(state.offer.share(),false);
 state.send();assert.equal(state.offer.phase,'review');
});
test('stock changes require fresh review and another Share click',()=>{
 const state=fixture();state.send();
 state.setRows([{...row,spools:5}]);state.setContext({ready:true,accountKey:'private-account',revision:2});
 assert.equal(state.offer.share(),false);
 assert.match(state.updates.at(-1).message,/stock changed/);
 assert.equal(state.messages.filter(message=>message.data.colours).length,0);
 assert.equal(state.offer.share(),true);assert.equal(state.messages.at(-1).data.colours[0].availableRolls,5);
});
test('account change aborts consent and busy refresh cannot transmit',()=>{
 const state=fixture();state.send();state.setContext({ready:false,accountKey:'private-account',revision:1});
 assert.equal(state.offer.share(),false);assert.equal(state.offer.phase,'review');
 state.setContext({ready:true,accountKey:'different-account',revision:1});
 assert.equal(state.offer.share(),false);assert.equal(state.offer.phase,'error');
 assert(state.messages.every(message=>!message.data.colours));assert.equal(state.listeners.size,0);
});
test('cancel, timeout and sender closure clear listeners and never send unapproved colours',()=>{
 for(const action of ['cancel','timeout','closed']){
  const state=fixture();state.send();
  if(action==='cancel')state.offer.cancel();
  if(action==='timeout'){assert.equal([...state.timeouts.values()][0].delay,120000);[...state.timeouts.values()][0].callback()}
  if(action==='closed'){state.opener.closed=true;state.offer.resume()}
  assert(state.messages.every(message=>!message.data.colours));assert.equal(state.listeners.size,0);assert.equal(state.intervals.size,0);assert.equal(state.timeouts.size,0);
 }
});
test('empty stock still requires explicit consent and login gates readiness',()=>{
 const state=fixture({rows:[],context:{ready:false,accountKey:'',revision:0}});
 assert.equal(state.messages.length,0);assert.equal(state.timeouts.size,0);state.send();assert.equal(state.offer.phase,'waiting');
 state.setContext({ready:true,accountKey:'private-account',revision:1});state.offer.resume();state.send();
 assert.equal(state.offer.share(),true);assert.deepEqual(state.messages.at(-1).data.colours,[]);
});
test('oversize UTF-8 snapshots fail closed and missing opener installs no hooks',()=>{
 const rows=Array.from({length:1000},(_,index)=>({...row,brand:'界'.repeat(80),product:'界'.repeat(120),colour:'界'.repeat(70)+index}));
 const state=fixture({rows});state.send();assert.equal(state.offer.share(),false);
 assert.equal(state.offer.phase,'error');assert.match(state.updates.at(-1).message,/too large/);
 assert(state.messages.every(message=>!message.data.colours));
 const missing=fixture({noOpener:true});assert.equal(missing.offer,null);assert.equal(missing.listeners.size,0);
});
test('stock reuses exact production/paired-loopback allowlist and rejects ambiguous fragments',()=>{
 for(const href of ['https://spool-studio.uk/#strata-stock='+token+'&sender=https://evil.test','https://spool-studio.uk/#strata-stock='+token+'&strata-transfer='+token+'&sender='+sender]){
  const state=fixture({href});assert.equal(state.offer,null);assert.equal(state.listeners.size,0);
 }
 const local=fixture({href:'http://127.0.0.1:18769/#strata-stock='+token+'&sender=http://localhost:8000'});
 assert.equal(local.offer.phase,'ready');assert.equal(local.messages[0].origin,'http://localhost:8000');
});
