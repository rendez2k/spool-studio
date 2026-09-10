import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import Core from '../out/printer-core.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function harness(enabled){
 const nodes=new Map(),events={},posts=[];let poll,focused='',failure=false;
 let state={accountKey:'ui-test-account',revision:1,enabled,seenAt:null,status:null,request:null};
 const library={accountKey:state.accountKey,items:[],reels:[]};
 const element=name=>({
  value:'',textContent:'',open:false,hidden:false,disabled:false,checked:false,children:[],style:{setProperty(){}},
  get options(){return this.children},
  append(...children){this.children.push(...children)},replaceChildren(...children){this.children=children},
  querySelectorAll(){return this.children},setAttribute(){},focus(){focused=name}
 });
 const node=name=>{if(!nodes.has(name))nodes.set(name,element(name));return nodes.get(name)};
 vm.runInNewContext(readFileSync(new URL('../out/printer.js',import.meta.url),'utf8'),{
  PrinterCore:Core,document:{hidden:false,getElementById:node,createElement:()=>element('created')},
  window:{addEventListener(name,handler){events[name]=handler}},location:{search:'',origin:'https://test.example'},
  URL,URLSearchParams,AbortSignal,crypto,Date,Blob,setTimeout,
  setInterval(handler,interval){assert.equal(interval,5000);poll=handler;return 1},clearInterval(){},
  fetch:async(path,options)=>{
   if(failure)return Response.json({error:'Temporary failure'},{status:503});
   if(path==='/api/library')return Response.json(library);
   assert.equal(path,'/api/printer');
   if(options.body){
    const body=JSON.parse(options.body);posts.push(body);assert.equal(body.kind,'create');
    state={...state,enabled:true,revision:state.revision+1};
    return Response.json({...state,token:'synthetic-test-token'});
   }
   return Response.json(state);
  }
 });
 await tick();
 return {node,posts,events,get focused(){return focused},poll:async()=>{poll();await tick()},fail:()=>{failure=true},recover:()=>{failure=false}};
}

test('configured printer setup stays open while polling, refocusing and refreshing',async()=>{
 const app=await harness(true);assert.equal(app.node('printer-setup').open,false);
 app.node('printer-setup').open=true;
 app.node('printer-address').value='http://192.168.1.26';app.node('printer-address').focus();
 app.node('printer-spoolman-address').value='http://192.168.1.99:7912';
 for(let iteration=0;iteration<4;iteration++)await app.poll();
 app.events.focus();await tick();await app.node('printer-refresh').onclick();
 assert.equal(app.node('printer-setup').open,true);
 assert.equal(app.node('printer-address').value,'http://192.168.1.26');
 assert.equal(app.node('printer-spoolman-address').value,'http://192.168.1.99:7912');
 assert.equal(app.focused,'printer-address');assert.equal(app.posts.length,0);
 app.node('printer-setup').open=false;await app.poll();assert.equal(app.node('printer-setup').open,false);
});

test('unconfigured setup opens initially but respects a manual collapse',async()=>{
 const app=await harness(false);assert.equal(app.node('printer-setup').open,true);
 app.node('printer-setup').open=false;await app.poll();app.events.focus();await tick();
 assert.equal(app.node('printer-setup').open,false);assert.equal(app.posts.length,0);
});

test('creating a printer key reveals its download and refreshes do not collapse it',async()=>{
 const app=await harness(false);
 await app.node('printer-create').onclick();
 assert.equal(app.node('printer-setup').open,true);
 assert.equal(app.node('printer-download').hidden,false);
 await app.poll();app.events.focus();await tick();
 assert.equal(app.node('printer-setup').open,true);
 assert.equal(app.node('printer-download').hidden,false);
 assert.equal(app.node('printer-send').disabled,true);
 assert.equal(app.posts.length,1);assert.equal(app.posts[0].kind,'create');
});

test('temporary refresh failures do not reset an expanded setup panel',async()=>{
 const app=await harness(true);app.node('printer-setup').open=true;
 app.fail();await app.poll();assert.equal(app.node('printer-setup').open,true);
 app.recover();await app.poll();assert.equal(app.node('printer-setup').open,true);
 assert.equal(app.posts.length,0);
});
