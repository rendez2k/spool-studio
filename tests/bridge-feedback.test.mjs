import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('startup failures stay beside the checkbox after background status updates',async()=>{
 const nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',dataset:{},setAttribute(){}});return nodes.get(id)};
 const state={configured:true,checked:true,running:true,busy:false,startup:{supported:true,enabled:false,message:'Off'}};
 let render;
 vm.runInNewContext(await readFile('bridge-desktop/src/ui.js','utf8'),{document:{getElementById:node},window:{bridge:{subscribe:callback=>{render=callback},action:async action=>action==='status'?{ok:true,state}:{ok:false,state,error:'Windows could not confirm the startup setting.'}}},Date});
 await new Promise(resolve=>setImmediate(resolve));
 node('startup').checked=true;await node('startup').onchange();
 assert.equal(node('startup').checked,false);assert.equal(node('startup').disabled,false);
 assert.match(node('startup-status').textContent,/Windows could not confirm/);
 render(state);assert.match(node('startup-status').textContent,/Windows could not confirm/);
});

test('desktop renderer places feedback beside Check and distinguishes checked from running',async()=>{
 const nodes=new Map();
 const node=id=>{
  if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:false,disabled:false,dataset:{},attributes:{},setAttribute(key,value){this.attributes[key]=value}});
  return nodes.get(id);
 };
 let render;
 const initial={configured:true,checked:false,running:false,busy:false,checkState:'idle',checkMessage:''};
 vm.runInNewContext(await readFile('bridge-desktop/src/ui.js','utf8'),{document:{getElementById:node},window:{bridge:{subscribe:callback=>{render=callback},action:async()=>({state:initial})}},Date});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(node('check-result').hidden,true);
 render({...initial,busy:true,checkState:'checking',checkMessage:'Checking your printer…'});
 assert.equal(node('check').textContent,'Checking printer…');assert.equal(node('check').attributes['aria-busy'],'true');assert.equal(node('check').disabled,true);
 render({...initial,checked:true,checkState:'ready',checkMessage:'Check passed — printer connected and idle.'});
 assert.equal(node('check-result').hidden,false);assert.match(node('check-result').textContent,/Check passed/);
 assert.equal(node('check-result').dataset.state,'ready');assert.equal(node('badge').textContent,'Ready · not running');assert.equal(node('start').disabled,false);
 render({...initial,checkState:'error',checkMessage:'Connection failed'});
 assert.equal(node('check-result').dataset.state,'error');assert.equal(node('start').disabled,true);assert.equal(node('check').disabled,false);
 render({...initial,reconnecting:true,startup:{supported:true,enabled:true,message:'Starts after sign-in'}});
 assert.equal(node('startup-option').hidden,false);assert.equal(node('startup').checked,true);
 assert.equal(node('badge').textContent,'Reconnecting…');assert.equal(node('stop').disabled,false);assert.equal(node('check').disabled,true);
 const html=await readFile('bridge-desktop/src/index.html','utf8');
 assert.match(html,/<button id="check"[^>]*>[^<]*<\/button><p id="check-result"[^>]*role="status"/);
 assert.equal((html.match(/id="error"/g)||[]).length,1);
});
