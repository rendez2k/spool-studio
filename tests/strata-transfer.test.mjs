import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const transfer=createRequire(import.meta.url)('../out/strata-transfer.js');
const token='0123456789abcdef0123456789abcdef',sender='https://strata3mf.uk';
const link=(source=sender,receiver='https://spool-studio.uk')=>receiver+'/?view=match#strata-transfer='+token+'&sender='+encodeURIComponent(source);
function fixture(options={}){
 const listeners=new Map(),intervals=new Map(),timeouts=new Map(),messages=[],updates=[],imports=[];
 let sequence=0,clears=0,status=options.status||{ready:true,accountKey:'user-a'};
 const opener={closed:false,postMessage:(data,origin)=>messages.push({data,origin})};
 const host={location:{href:options.href||link()},opener:options.noOpener?null:opener,
  addEventListener:(name,callback)=>listeners.set(name,callback),removeEventListener:name=>listeners.delete(name),
  setInterval:callback=>{intervals.set(++sequence,callback);return sequence},clearInterval:id=>intervals.delete(id),
  setTimeout:(callback,delay)=>{timeouts.set(++sequence,{callback,delay});return sequence},clearTimeout:id=>timeouts.delete(id),
 };
 const receiver=transfer.receive({host,context:()=>status,importFile:options.importFile|| (async(file,current)=>{assert(current());imports.push(file)}),
  update:(phase,message)=>updates.push({phase,message}),clearFragment:()=>clears++});
 const message={type:'strata-spool:file',version:1,token,name:'robot.3mf',buffer:new ArrayBuffer(22)};
 return {receiver,host,opener,messages,updates,imports,listeners,intervals,timeouts,
  setStatus:value=>{status=value},get clears(){return clears},
  send:(data=message,source=opener,origin=sender)=>listeners.get('message')?.({data,source,origin}),message,
 };
}
test('origin policy accepts canonical senders and only paired HTTP loopback origins',()=>{
 for(const origin of [sender,'https://rendez2k.github.io'])assert.equal(transfer.configuration(link(origin)).sender,origin);
 assert.equal(transfer.configuration(link('http://localhost:8000','http://127.0.0.1:18769')).sender,'http://localhost:8000');
 for(const origin of ['https://strata3mf.uk.evil.test','https://strata3mf.uk/','https://user@strata3mf.uk','http://strata3mf.uk','null','http://127.0.0.1:8000','https://rendez2k.github.io/path'])assert.throws(()=>transfer.configuration(link(origin)));
 for(const origin of [sender,'http://192.168.1.2:8000','https://localhost:8000'])assert.throws(()=>transfer.configuration(link(origin,'http://localhost:18769')));
 assert.equal(transfer.configuration('https://spool-studio.uk/?view=match'),null);
 assert.throws(()=>transfer.configuration(link().replace(token,token.toUpperCase())));
 assert.throws(()=>transfer.configuration(link()+'&sender='+encodeURIComponent(sender)));
 assert.throws(()=>transfer.configuration(link()+'&strata-transfer='+token));
});
test('valid transfer imports once, acknowledges exact origin, and clears all lifecycle hooks',async()=>{
 const state=fixture();
 assert.equal(state.messages[0].data.type,'strata-spool:ready');
 await state.send();await state.send();
 assert.equal(state.imports.length,1);assert.equal(state.receiver.phase,'received');
 assert.equal(state.messages.at(-1).data.type,'strata-spool:received');
 assert(state.messages.every(message=>message.origin===sender&&message.data.token===token&&message.data.version===1));
 assert.equal(state.clears,1);assert.equal(state.listeners.size,0);assert.equal(state.intervals.size,0);assert.equal(state.timeouts.size,0);
});
test('wrong source, origin, token, version and message types cannot trigger import',async()=>{
 const state=fixture();
 await state.send(state.message,{},sender);
 await state.send(state.message,state.opener,'https://attacker.test');
 for(const patch of [{token:'wrong'},{version:2},{type:'strata-spool:ready'}])await state.send({...state.message,...patch});
 await state.send(null);
 assert.equal(state.imports.length,0);assert.equal(state.receiver.phase,'ready');
 await state.send();assert.equal(state.imports.length,1);
});
test('invalid names and buffers fail closed without importing',async()=>{
 for(const patch of [{name:'../robot.3mf'},{name:'robot.exe'},{name:'robot\n.3mf'},{name:' x.3mf'},{name:'x'.repeat(181)+'.3mf'},{buffer:{}},{buffer:new ArrayBuffer(0)},{buffer:new ArrayBuffer(transfer.MAX_BYTES+1)}]){
  const state=fixture();await state.send({...state.message,...patch});
  assert.equal(state.imports.length,0);assert.equal(state.receiver.phase,'error');
  assert.equal(state.messages.at(-1).data.type,'strata-spool:error');assert.equal(state.listeners.size,0);
 }
});
test('duplicate messages during asynchronous parse are ignored',async()=>{
 let resolve,called=0;
 const state=fixture({importFile:()=>{called++;return new Promise(done=>{resolve=done})}});
 const first=state.send();await state.send();
 assert.equal(called,1);assert.equal(state.receiver.phase,'receiving');
 resolve();await first;assert.equal(state.receiver.phase,'received');
});
test('parse errors return a safe message, not arbitrary parser details',async()=>{
 const state=fixture({importFile:async()=>{throw Error('secret /private/path attacker content')}});
 await state.send();
 assert.equal(state.receiver.phase,'error');
 assert.doesNotMatch(state.messages.at(-1).data.message,/secret|private|attacker/);
 assert.match(state.messages.at(-1).data.message,/Load 3MF projects/);
 assert.equal(state.intervals.size,0);
});
test('cancel and account changes invalidate an in-flight import before it can attach',async()=>{
 for(const action of ['cancel','account']){
  let resolve,current;
  const state=fixture({importFile:async(file,isCurrent)=>{current=isCurrent;await new Promise(done=>{resolve=done});assert.equal(current(),false)}});
  const pending=state.send();
  if(action==='cancel')state.receiver.cancel();else state.setStatus({ready:true,accountKey:'user-b'});
  resolve();await pending;
  assert.notEqual(state.receiver.phase,'received');assert.equal(state.listeners.size,0);
  assert.equal(state.messages.at(-1).data.type,'strata-spool:error');
 }
});
test('receiver waits for login readiness, repeats ready and times out after two minutes',()=>{
 const state=fixture({status:{ready:false,accountKey:''}});
 assert.equal(state.messages.length,0);assert.equal(state.timeouts.size,0);
 state.setStatus({ready:false,accountKey:'user-a'});state.receiver.resume();
 assert.equal(state.messages.length,0);
 state.setStatus({ready:true,accountKey:'user-a'});state.receiver.resume();
 assert.equal([...state.timeouts.values()][0].delay,120000);
 state.receiver.resume();assert.equal(state.messages.length,2);
 [...state.timeouts.values()][0].callback();
 assert.equal(state.receiver.phase,'error');assert.equal(state.listeners.size,0);assert.equal(state.intervals.size,0);
});
test('missing opener and invalid links do not install listeners or timers',()=>{
 for(const options of [{noOpener:true},{href:link('https://attacker.test')}]){
  const state=fixture(options);
  assert.equal(state.receiver,null);assert.equal(state.listeners.size,0);assert.equal(state.intervals.size,0);
  assert.equal(state.updates.at(-1).phase,'error');
 }
});
test('sender closure cleans pending receiver state',()=>{
 const state=fixture();state.opener.closed=true;state.receiver.resume();
 assert.equal(state.receiver.phase,'error');assert.equal(state.listeners.size,0);
});
