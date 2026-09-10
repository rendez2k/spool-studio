import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),code=readFileSync(new URL('../out/spool-assist.js',import.meta.url),'utf8');
const stock={id:'test',brand:'SUNLU',product:'PLA Matte',material:'PLA',finish:'matte',colour:'Orange',hex:'#EF8D34',packaging:'refill',weightGrams:1000,spools:4,barcode:'036000291452'};
function harness(){
 const elements=new Map(),events={},timers=new Map();let nextTimer=0,media=async()=>{throw Object.assign(Error('denied'),{name:'NotAllowedError'})},lookup=async()=>Response.json({accountKey:'alice',product:{title:'PLA Matte 1kg',brand:'Bambu Lab',url:'https://uk.store.bambulab.com/products/pla-matte',warning:'Check the variant.'}});
 function make(){return {value:'',hidden:false,disabled:false,children:[],open:true,dataset:{},textContent:'',
  get options(){return this.children},append(...children){this.children.push(...children)},replaceChildren(...children){this.children=children},remove(){},focus(){},setAttribute(key,value){this[key]=value},addEventListener(name,handler){this['on'+name]=handler},querySelectorAll(){return this.children.filter(child=>child.type==='button')}
 }}
 const get=id=>{if(!elements.has(id))elements.set(id,make());return elements.get(id)};
 const buttons=['manual','link','barcode'].map(value=>Object.assign(make(),{dataset:{entryMethod:value}}));
 get('spool-assist').querySelectorAll=selector=>selector==='[data-entry-method]'?buttons:[...buttons,...['assist-code','assist-url','assist-scan','assist-find-code','assist-lookup'].map(get)];
 get('spool-form').querySelectorAll=()=>[...elements].filter(([id])=>/^spool-(brand|product|material|finish|colour|hex|count|weight|date|packaging|notes|sample)(-choice)?$/.test(id)).map(([,value])=>value);
 const document={getElementById:get,createElement:make,head:make(),hidden:false,addEventListener(name,handler){events[name]=handler}};
 const window={isSecureContext:true,addEventListener(name,handler){events[name]=handler},SpoolBarcodeDecoder:{createReader:()=>({decodeFromStream:async()=>({stop(){}})})}};
 const context=vm.createContext({document,window,navigator:{mediaDevices:{getUserMedia:options=>media(options)}},SpoolCatalog:require('../out/spool-catalog.js'),FilamentImport:require('../out/import-parser.js'),FilamentMatcher:require('../out/matcher.js'),packaging:row=>row.packaging,libraryBusy:false,dataset:{accountKey:'alice'},items:[{...stock}],AbortController,
  setTimeout(handler,ms){const id=++nextTimer;timers.set(id,{handler,ms});return id},clearTimeout(id){timers.delete(id)},fetch:(url,options)=>{assert.equal(url,'/api/product-lookup');assert.equal(options.credentials,'same-origin');return lookup(options)},lostLibrarySession(){context.dataset.accountKey='';window.SpoolAssist.clear()}
 });
 vm.runInContext(code,context);
 for(const key of ['brand','product'])get('spool-'+key).value='';get('spool-count').value='1';window.SpoolAssist.reset();
 return {get,buttons,document,window,context,events,timers,media:fn=>{media=fn},lookup:fn=>{lookup=fn},choose(key,value){get('spool-'+key+'-choice').value=value;get('spool-'+key+'-choice').onchange()}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('common and custom fields work without conflating finishes or changing edited data',()=>{
 const app=harness();app.choose('brand','SUNLU');app.choose('product','PLA Matte');
 assert.equal(app.get('spool-brand').value,'SUNLU');assert(app.get('spool-brand').hidden);assert(app.get('spool-brand').disabled);
 assert.equal(app.get('spool-material').value,'PLA');assert.equal(app.get('spool-finish').value,'matte');
 app.choose('product','PLA+');assert.equal(app.get('spool-material').value,'PLA+');
 app.choose('brand','__custom__');assert(!app.get('spool-brand').hidden);assert(!app.get('spool-brand').disabled);
 app.get('spool-brand').value='Small manufacturer';app.get('spool-product').value='Special blend';app.get('spool-finish').value='satin';app.window.SpoolAssist.reset({barcode:stock.barcode});
 assert.equal(app.get('spool-brand-choice').value,'__custom__');assert.equal(app.get('spool-product').value,'Special blend');assert.equal(app.get('spool-finish').value,'satin');assert.match(app.get('assist-status').textContent,/Saved barcode/);
});

test('barcode lookup only produces explicit templates and remembers unknown codes',()=>{
 const app=harness();app.get('assist-code').value='0036000291452';app.get('assist-find-code').onclick();
 assert.equal(app.get('spool-brand').value,'');assert.equal(app.get('assist-results').children.length,1);
 app.get('assist-results').children[0].onclick();assert.equal(app.get('spool-brand').value,'SUNLU');assert.equal(app.get('spool-count').value,'1');assert.equal(app.get('spool-packaging').value,'refill');
 assert.equal(app.window.SpoolAssist.fields().barcode,stock.barcode);
 app.get('assist-code').value='UNKNOWN-SKU';app.get('assist-find-code').onclick();assert.equal(app.get('assist-results').children.length,0);assert.match(app.get('assist-status').textContent,/New code/);assert.equal(app.window.SpoolAssist.fields().barcode,'UNKNOWN-SKU');
 app.get('assist-code').value='036000291453';app.get('assist-find-code').onclick();assert.match(app.get('assist-status').textContent,/check digit/);
 app.get('assist-code').value=stock.barcode;app.get('assist-find-code').onclick();const stale=app.get('assist-results').children[0];app.context.dataset.accountKey='bob';app.get('spool-brand').value='';stale.onclick();assert.equal(app.get('spool-brand').value,'');
});

test('product lookup leaves form unchanged until draft choice and does not infer exact colour',async()=>{
 const app=harness();app.get('assist-code').value=stock.barcode;app.get('spool-brand').value='Previous';
 await app.get('assist-lookup').onclick();assert.equal(app.get('spool-brand').value,'Previous');
 app.get('assist-results').children.find(child=>child.type==='button').onclick();
 assert.equal(app.get('spool-brand').value,'Bambu Lab');assert.equal(app.get('spool-finish').value,'matte');assert.equal(app.get('spool-colour').value,'');assert.equal(app.get('spool-hex').value,'');assert.equal(app.get('spool-packaging').value,'unknown');assert.equal(app.window.SpoolAssist.fields().barcode,'');assert.match(app.window.SpoolAssist.fields().sourceUrl,/bambulab/);
});

test('drafts preserve entered and unknown quantities, and barcode choices distinguish variants',async()=>{
 const app=harness();app.context.items.push({...stock,id:'second',weightGrams:500,packaging:'spooled',finish:'standard'});
 app.get('assist-code').value=stock.barcode;app.get('assist-find-code').onclick();
 const choices=app.get('assist-results').children;
 assert.match(choices[0].textContent,/matte.*1000 g.*refill/);assert.match(choices[1].textContent,/standard.*500 g.*supplied on spool/);
 app.get('spool-count').value='4';choices[0].onclick();assert.equal(app.get('spool-count').value,'4');
 app.get('spool-count').value='';await app.get('assist-lookup').onclick();app.get('assist-results').children.find(child=>child.type==='button').onclick();assert.equal(app.get('spool-count').value,'');
 app.window.SpoolAssist.clear();assert.equal(app.get('spool-brand-choice').options.length,0);assert.equal(app.get('spool-product-choice').options.length,0);assert.equal(app.window.SpoolAssist.fields().sourceUrl,'');
});

test('cancel, account change and close discard delayed product responses',async()=>{
 for(const interrupt of ['cancel','account','close']){
  const app=harness();let resolve;app.lookup(()=>new Promise(done=>{resolve=done}));
  const running=app.get('assist-lookup').onclick();assert(app.get('save-spool').disabled);
  if(interrupt==='cancel')app.get('assist-cancel').onclick();
  if(interrupt==='account'){app.context.dataset.accountKey='bob';app.window.SpoolAssist.clear()}
  if(interrupt==='close'){app.get('spool-dialog').open=false;app.get('spool-dialog').onclose()}
  resolve(Response.json({accountKey:'alice',product:{title:'Never insert'}}));await running;
  assert.equal(app.get('assist-results').children.length,0);assert(!app.window.SpoolAssist.busy());assert(!app.get('save-spool').disabled);
 }
});

test('camera stops delayed streams after cancellation and active streams on background or result',async()=>{
 const app=harness();let resolve,stopped=0;const stream={getTracks:()=>[{stop(){stopped++}}]};
 app.media(()=>new Promise(done=>{resolve=done}));const pending=app.get('assist-scan').onclick();await flush();app.get('assist-cancel').onclick();resolve(stream);await pending;assert.equal(stopped,1);assert.equal(app.get('assist-camera').srcObject,null);
 let callback,controlStops=0;const control={stop(){controlStops++}};
 app.media(async options=>{assert.equal(options.audio,false);return stream});app.window.SpoolBarcodeDecoder.createReader=()=>({decodeFromStream:async(input,video,handler)=>{callback=handler;return control}});
 await app.get('assist-scan').onclick();assert(app.window.SpoolAssist.busy());app.document.hidden=true;app.events.visibilitychange();assert(!app.window.SpoolAssist.busy());assert.equal(stopped,2);assert(controlStops>0);
 app.document.hidden=false;await app.get('assist-scan').onclick();callback({getText:()=>stock.barcode},null,control);assert(!app.window.SpoolAssist.busy());assert.equal(app.get('assist-code').value,stock.barcode);assert.equal(app.get('assist-results').children.length,1);assert.equal(stopped,3);
});

test('camera denial and timeout retain typed fallback and never keep a stream running',async()=>{
 const app=harness();await app.get('assist-scan').onclick();assert.match(app.get('assist-status').textContent,/permission/);assert(!app.window.SpoolAssist.busy());
 app.window.isSecureContext=false;await app.get('assist-scan').onclick();assert.match(app.get('assist-status').textContent,/type the barcode/);
 app.window.isSecureContext=true;let resolve,stopped=0;app.media(()=>new Promise(done=>{resolve=done}));const running=app.get('assist-scan').onclick();await flush();[...app.timers.values()].find(timer=>timer.ms===45000).handler();resolve({getTracks:()=>[{stop(){stopped++}}]});await running;assert.equal(stopped,1);assert.match(app.get('assist-status').textContent,/45 seconds/);
});
