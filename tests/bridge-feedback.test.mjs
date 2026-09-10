import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

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
 const html=await readFile('bridge-desktop/src/index.html','utf8');
 assert.match(html,/<button id="check"[^>]*>[^<]*<\/button><p id="check-result"[^>]*role="status"/);
 assert.equal((html.match(/id="error"/g)||[]).length,1);
});
