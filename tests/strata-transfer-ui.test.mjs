import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {File} from 'node:buffer';
const source=readFileSync(new URL('../out/strata-transfer-ui.js',import.meta.url),'utf8');
function fixture(){
 const elements=new Map();
 const element=()=>({hidden:false,disabled:false,textContent:'',children:[],setAttribute(){},append(...children){this.children.push(...children)},before(node){this.previous=node}});
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
 const existing={name:'Existing model',slots:[],previews:[]};
 let options,controls=0,renders=0;
 const context=vm.createContext({
  location:{href:'https://spool-studio.uk/?view=match#strata-transfer=0123456789abcdef0123456789abcdef&sender=https%3A%2F%2Fstrata3mf.uk',hash:'#strata-transfer=0123456789abcdef0123456789abcdef&sender=https%3A%2F%2Fstrata3mf.uk'},
  document:{getElementById:get,createElement:element},window:{},history:{state:null,replaceState(){}},
  URL,URLSearchParams,File,StrataTransfer:{receive:value=>{options=value;return {resume(){},cancel(){}}}},
  matchLoading:false,libraryBusy:false,matchProjects:[existing],matchSyncEnabled:true,activeMatchProject:0,activeMatchPlate:2,dataset:{status:'complete',accountKey:'fixture'},
  FilamentMatcher:{readProject:async()=>({name:'Transferred.3mf',slots:[{slot:1}],previews:[{name:'Plate 1',bytes:new Uint8Array([1,2,3])}]})},
  prepareMatchProject:project=>project,releaseMatchPreviews(){throw Error('Existing previews must not be released')},
  libraryControls:()=>{controls++;get('match-files').disabled=context.matchLoading},
  setMode:()=>{renders++},
 });
 vm.runInContext(source,context);
 return {context,options,get,existing,get controls(){return controls},get renders(){return renders}};
}
test('transfer adapter appends without changing prior projects and retains complete original file',async()=>{
 const state=fixture(),buffer=new Uint8Array([80,75,...Array(30).fill(9)]).buffer;
 const before=state.context.matchProjects;
 await state.options.importFile({name:'robot.3mf',buffer},()=>true);
 assert.equal(state.context.matchProjects,before);
 assert.equal(state.context.matchProjects.length,2);assert.equal(state.context.matchProjects[0],state.existing);
 const project=state.context.matchProjects[1];
 assert.equal(project.sourceFile.name,'robot.3mf');
 assert.deepEqual(new Uint8Array(await project.sourceFile.arrayBuffer()),new Uint8Array(buffer));
 assert.equal(project.previews.length,1);assert.equal(state.context.activeMatchProject,1);assert.equal(state.context.activeMatchPlate,0);
 assert.equal(state.context.matchSyncEnabled,false);assert.equal(state.context.matchLoading,false);assert.equal(state.get('match-files').disabled,false);
});
test('parse failure and cancellation keep old projects and restore import controls',async()=>{
 const failure=fixture();
 failure.context.FilamentMatcher.readProject=async()=>{throw Error('Bad archive')};
 await assert.rejects(()=>failure.options.importFile({name:'robot.3mf',buffer:new ArrayBuffer(22)},()=>true),/Bad archive/);
 assert.equal(failure.context.matchProjects.length,1);assert.equal(failure.context.matchLoading,false);
 const cancelled=fixture();
 await cancelled.options.importFile({name:'robot.3mf',buffer:new ArrayBuffer(22)},()=>false);
 assert.equal(cancelled.context.matchProjects.length,1);assert.equal(cancelled.context.matchSyncEnabled,true);
 assert.equal(cancelled.context.matchLoading,false);assert.equal(cancelled.get('match-files').disabled,false);
});
test('busy or full matcher rejects a transfer without replacing comparisons',async()=>{
 for(const kind of ['busy','full']){
  const state=fixture();
  if(kind==='busy')state.context.matchLoading=true;
  else state.context.matchProjects=Array(8).fill(state.existing);
  const previous=state.context.matchProjects;
  await assert.rejects(()=>state.options.importFile({name:'robot.3mf',buffer:new ArrayBuffer(22)},()=>true),/busy or full/);
  assert.equal(state.context.matchProjects,previous);
 }
});
