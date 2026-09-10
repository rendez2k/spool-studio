import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {handleLibrary,libraryView} from '../server/library.mjs';
import {localDatabase} from '../scripts/local-db.mjs';
const require=createRequire(import.meta.url),colours=require('../out/colour-catalog.js'),csv=require('../out/import-csv.js'),parser=require('../out/import-parser.js');
const spool={brand:'Bambu Lab',product:'PLA Matte',material:'PLA',finish:'matte',colour:'Ivory White',hex:'#F0EAD8',spools:2,weightGrams:1000,packaging:'refill',date:'2026-09-10',notes:''};

test('69 verified shades use exact brand, range, material and shade without cross-finish guesses',()=>{
 assert.equal(colours.ranges.reduce((total,range)=>total+Object.keys(range.colours).length,0),69);
 for(const range of colours.ranges)for(const [colour,hex] of Object.entries(range.colours)){
  const found=colours.match({brand:'Bambu Lab',product:range.product,material:range.material,finish:range.finish,colour});
  assert.equal(found.hex,'#'+hex);assert(colours.validHex(found.hex));assert(found.url.startsWith('https://'));assert.equal(found.checkedAt,'2026-09-10');
 }
 assert.equal(colours.match({...spool,brand:'bambu',product:'Matte PLA',colour:'Ash Grey'}).hex,'#9B9EA0');
 for(const patch of [{brand:'SUNLU'},{product:'PLA Basic'},{material:'PETG'},{finish:'silk'},{colour:'White'},{colour:'Ivory White + Red'},{product:'PLA Matte Gradient'}])assert.equal(colours.match({...spool,...patch}),null);
 assert.equal(colours.match({...spool,product:'PETG Basic',material:'PETG',finish:'standard',colour:'Black'}),null);
});

test('legacy estimates refresh non-destructively while custom and unrecognised saved colours survive',()=>{
 const original={...spool,id:'old',reels:[{id:'untouched'}]};
 const resolved=colours.resolve(original);
 assert.equal(resolved.hex,'#FFFFFF');assert.equal(resolved.savedHex,'#F0EAD8');assert.equal(original.hex,'#F0EAD8');assert.equal(resolved.colourSource.kind,'manufacturer');
 assert.equal(colours.resolve({...spool,hexMode:'manual'}).hex,'#F0EAD8');
 assert.equal(colours.resolve({...spool,hex:'#123456'}).hex,'#123456');
 assert.equal(colours.resolve({...spool,retailer:'Added manually'}).hex,'#F0EAD8');
 assert.equal(colours.resolve({...spool,hex:'#123456',hexMode:'auto'}).hex,'#FFFFFF');
 assert.equal(colours.resolve({...spool,brand:'Unknown',hexMode:'auto'}).colourSource.kind,'estimated');
 const stored={payload:JSON.stringify({items:[original],reels:[{id:'reel-1'}]}),revision:7};
 const before=stored.payload,view=libraryView(stored,'alice');assert.equal(view.items[0].hex,'#FFFFFF');assert.equal(view.revision,7);assert.equal(stored.payload,before);assert.equal(view.reels[0].id,'reel-1');
 assert.equal(colours.source({members:[resolved,{...spool,hexMode:'manual'}]}).kind,'mixed');
});

test('CSV and text imports automatically fill exact shades but keep explicit hex values',()=>{
 const header=csv.columns.join(','),line='Bambu Lab,PLA Matte,PLA,matte,Ivory White,,2,1000,refill,2026-09-10,';
 const automatic=csv.parse(header+'\n'+line)[0].spool;assert.equal(automatic.hex,'#FFFFFF');assert.equal(automatic.hexMode,'auto');
 const custom=csv.parse(header+'\n'+line.replace('White,,','White,#FAFAF0,'))[0].spool;assert.equal(custom.hex,'#FAFAF0');assert.equal(custom.hexMode,'manual');
 const text=parser.parse('Bambu Lab PLA Matte Ivory White 1 kg refill\nQty: 2')[0].spool;
 assert.equal(text.colour,'Ivory White');assert.equal(text.hex,'#FFFFFF');assert.equal(text.spools,2);
 const printed=parser.parse('Bambu Lab PLA Matte\nColour: Ivory White\n#FAFAF0')[0].spool;assert.equal(printed.hex,'#FAFAF0');assert.equal(printed.hexMode,'manual');
 const unknown=csv.parse(header+'\n'+line.replace('Bambu Lab','Other brand'))[0].spool;assert.equal(unknown.hex,'');
 for(const title of ['Bambu Lab PLA Matte Gradient Ivory White 1kg','Bambu Lab PLA Basic Silk Jade White 1kg','Bambu Lab PLA Basic Matte Jade White 1kg','Bambu Lab PLA Basic CF Jade White 1kg']){
  const draft=parser.parse(title)[0];assert.notEqual(draft.spool.colourSource.kind,'manufacturer');assert.match(draft.spool.product,/verify range/);
 }
});

test('API persists colour preference and prevents forged provenance, with old-client edits preserved',async()=>{
 const DB=localDatabase();
 const request=(body,user='alice')=>new Request('https://test.example/api/library',{method:body?'POST':'GET',headers:{'oai-authenticated-user-id':user,origin:'https://test.example','content-type':'application/json'},body:body?JSON.stringify(body):undefined});
 const act=body=>handleLibrary(request(body),{DB});
 try{
  await act();let state=await(await act({kind:'add',baseRevision:1,requestId:crypto.randomUUID(),spool:{...spool,hex:'',hexMode:'auto',colourSource:{url:'https://evil.example'}}})).json();
  assert.equal(state.items[0].hex,'#FFFFFF');assert(!JSON.stringify(state).includes('evil.example'));
  const id=state.items[0].id;
  state=await(await act({kind:'edit',id,baseRevision:state.revision,requestId:crypto.randomUUID(),spool:{...spool,hex:'#EAEAEA'}})).json();
  assert.equal(state.items[0].hex,'#EAEAEA');assert.equal(state.items[0].hexMode,'manual');
  state=await(await act({kind:'edit',id,baseRevision:state.revision,requestId:crypto.randomUUID(),spool:{...spool,hexMode:'auto'}})).json();assert.equal(state.items[0].hex,'#FFFFFF');
  assert.equal((await act({kind:'edit',id,baseRevision:state.revision,requestId:crypto.randomUUID(),spool:{...spool,hexMode:'bad'}})).status,400);
  assert.deepEqual((await(await handleLibrary(request(null,'bob'),{DB})).json()).items,[]);
 }finally{DB.close()}
});

test('manual form auto-fills, suggests shades and preserves custom input until explicitly reset',()=>{
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,textContent:'',children:[],append(child){this.children.push(child)},replaceChildren(){this.children=[]},addEventListener(name,callback){this['on'+name]=callback}});return nodes.get(id)};
 const context=vm.createContext({window:{},FilamentColours:colours,document:{getElementById:get,createElement:()=>({})}});
 vm.runInContext(readFileSync(new URL('../out/colour-form.js',import.meta.url),'utf8'),context);
 for(const key of ['brand','product','material','finish','colour','hex'])get('spool-'+key).value=spool[key];
 context.window.ColourForm.reset();assert.equal(get('spool-hex').value,'#FFFFFF');assert.equal(get('spool-shades').children.length,25);
 get('spool-hex').value='#FAFAF0';get('spool-hex').oninput();assert.equal(context.window.ColourForm.mode(),'manual');
 get('spool-colour').value='Bone White';get('spool-colour').oninput();assert.equal(get('spool-hex').value,'#FAFAF0');
 get('spool-auto-colour').onclick();assert.equal(get('spool-hex').value,'#CBC6B8');
 get('spool-colour').value='Ivory White';context.window.ColourForm.reset(colours.resolve(spool));assert.equal(get('spool-saved-colour').hidden,false);
 get('spool-saved-colour').onclick();assert.equal(get('spool-hex').value,'#F0EAD8');assert.equal(context.window.ColourForm.mode(),'manual');
});
