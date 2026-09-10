import test from 'node:test';
import assert from 'node:assert/strict';
import {localDatabase} from '../scripts/local-db.mjs';
import {handlePrinter,handlePrinterBridge} from '../server/printer.mjs';
import {configuration,inspectPrinter,executeJob,bridgeOnce} from '../scripts/printer-bridge.mjs';
import Core from '../out/printer-core.js';
import {handleAccountExport} from '../server/account-export.mjs';
const origin='https://studio.example',user='user_alice';
const item={id:'purchase-one',brand:'Example',product:'PLA Matte',material:'PLA',finish:'matte',colour:'Orange',hex:'#FF8000',hexMode:'manual',spools:1,weightGrams:1000,used:false};
const before={vendor:'Generic',material:'PLA',subtype:'Basic',rgba:'FFFFFFFF',spoolmanId:0,present:true};
const snapshot=()=>({ready:true,supported:true,canLink:true,tools:Array.from({length:4},()=>({...before}))});
async function setup(){
 const DB=localDatabase();await DB.prepare('INSERT INTO libraries (user_id,revision,payload,request_id,updated_at) VALUES (?,1,?,?,?)').bind(user,JSON.stringify({items:[item]}),'initial','2026-09-10').run();
 const ui=(body,account=user)=>handlePrinter(new Request(origin+'/api/printer',{method:body?'POST':'GET',headers:{'oai-authenticated-user-id':account,origin,'Content-Type':'application/json'},body:body?JSON.stringify({expectedAccountKey:account,baseRevision:0,requestId:crypto.randomUUID(),...body}):undefined}),{DB});
 const created=await (await ui({kind:'create'})).json();
 const bridge=body=>handlePrinterBridge(new Request(origin+'/api/printer-bridge',{method:'POST',headers:{Authorization:'Bearer '+created.token,'Content-Type':'application/json'},body:JSON.stringify(body)}),{DB});
 await bridge({kind:'poll',status:snapshot()});
 const command=async(extra={})=>{const current=await (await ui()).json();return {kind:'send',reviewed:true,channel:0,itemId:item.id,reelId:null,linkSpoolman:false,spoolmanId:0,profile:Core.profile(item),before,seenAt:current.seenAt,...extra}};
 return {DB,ui,bridge,command,token:created.token};
}
test('printer requests are isolated, reviewed, claimed once and verified without changing inventory',async()=>{
 const app=await setup();try{
  const request=await app.command({requestId:crypto.randomUUID()});assert.equal((await app.ui({...request,reviewed:false})).status,400);
  assert.equal((await app.ui({...request,expectedAccountKey:'user_bob'})).status,409);
  assert.equal((await app.ui(request,'user_bob')).status,400);
  assert.equal((await app.ui(request)).status,200);assert.equal((await app.ui(request)).status,200);
  const responses=await Promise.all([app.bridge({kind:'poll',status:snapshot()}),app.bridge({kind:'poll',status:snapshot()})]);
  const jobs=(await Promise.all(responses.map(response=>response.json()))).filter(value=>value.job);assert.equal(jobs.length,1);assert.equal(jobs[0].job.id,request.requestId);
  assert.equal((await (await app.bridge({kind:'poll',status:snapshot()})).json()).job,null);
  const readback=snapshot();readback.tools[0]={...before,vendor:'Generic',material:'PLA',subtype:'Matte',rgba:'FF8000FF'};
  assert.equal((await app.bridge({kind:'result',id:request.requestId,state:'verified',status:snapshot()})).status,400);
  assert.equal((await app.bridge({kind:'result',id:request.requestId,state:'verified',status:readback})).status,200);
  assert.equal((await (await app.ui()).json()).request.state,'verified');
  const inventory=await app.DB.prepare('SELECT revision,payload FROM libraries WHERE user_id = ?').bind(user).first();assert.equal(inventory.revision,1);assert.deepEqual(JSON.parse(inventory.payload).items,[item]);
  assert(!JSON.stringify(await (await app.ui()).json()).includes(app.token));
 }finally{app.DB.close()}
});
test('busy, changed, unsupported, expired, foreign and revoked requests fail closed',async()=>{
 const app=await setup();try{
  const command=await app.command();assert.equal((await app.ui({...command,seenAt:Date.now()-21000})).status,400);
  assert.equal((await app.ui({...command,channel:4})).status,400);assert.equal((await app.ui({...command,itemId:'foreign'})).status,400);
  assert.equal((await app.ui({...command,linkSpoolman:true})).status,400);assert.equal((await app.ui({...command,profile:{...command.profile,vendor:"Generic'\nG28"}})).status,400);
  await app.ui(command);const busy={...snapshot(),ready:false};await app.bridge({kind:'poll',status:busy});assert.equal((await (await app.ui()).json()).request.state,'blocked');
  assert.equal((await app.ui(await app.command())).status,400);
  const state=await (await app.ui()).json();await app.ui({kind:'revoke',baseRevision:state.revision});assert.equal((await app.bridge({kind:'poll',status:snapshot()})).status,401);
  assert.equal((await app.ui({kind:'create',baseRevision:0})).status,400);
 }finally{app.DB.close()}
});
function mockPrinter(options={}){
 const state=snapshot(),writes=[];let reads=0;
 if(options.spoolmanId)state.tools[0].spoolmanId=options.spoolmanId;
 const transport=async(url,init={})=>{
  if(url.endsWith('/server/info'))return Response.json({result:{klippy_state:'ready',components:['spoollink']}});
  if(url.includes('/printer/objects/query')){
   reads++;if(options.otherToolAt&&reads>=options.otherToolAt)state.tools[1].spoolmanId=5;const idle=options.busyAt&&reads>=options.busyAt?false:state.ready;
   return Response.json({result:{status:{print_stats:{state:idle?'complete':'paused'},idle_timeout:{state:idle?'Idle':'Printing'},gcode:{commands:options.unsupported?{}:{SET_PRINT_FILAMENT_CONFIG:{},SET_SPOOL_ID:{}}},print_task_config:{filament_vendor:state.tools.map(tool=>tool.vendor),filament_type:state.tools.map(tool=>tool.material),filament_sub_type:state.tools.map(tool=>tool.subtype),filament_color_rgba:state.tools.map(tool=>tool.rgba),filament_spool_id:state.tools.map(tool=>tool.spoolmanId),filament_exist:state.tools.map(tool=>tool.present)}}}});
  }
  if(url.endsWith('/server/config'))return Response.json({result:{config:{spoolman:{server:'http://127.0.0.1:7912'}}}});
  if(url.endsWith('/server/spoolman/status'))return Response.json({result:{spoolman_connected:true}});
  if(url.endsWith('/api/v1/spool/5'))return Response.json({id:5,remaining_weight:500,filament:{material:options.wrongMaterial?'ABS':'PLA',color_hex:'FF8000'}});
  if(url.endsWith('/printer/gcode/script')){
   assert.equal(init.method,'POST');assert.equal(init.redirect,'error');const script=JSON.parse(init.body).script;writes.push(script);
   if(options.lostReply)throw Error('Network result unknown');
   if(script.startsWith('SET_SPOOL_ID'))state.tools[0].spoolmanId=Number(/SPOOL_ID=(\d+)/.exec(script)[1]);
   else if(!options.mismatch)Object.assign(state.tools[0],{vendor:'Generic',material:'PLA',subtype:'Matte',rgba:'FF8000FF'});
   return Response.json({result:'ok'});
  }
  throw Error('Unexpected URL '+url);
 };
 return {transport,writes,state};
}
const config={printerUrl:'http://192.168.1.26',spoolmanUrl:'http://127.0.0.1:7912'};
const job=(extra={})=>({id:crypto.randomUUID(),channel:0,before:{...before},profile:Core.profile(item),spoolmanId:0,expiresAt:Date.now()+15000,...extra});
test('local bridge uses only fixed metadata commands, checks immediately before writes and verifies readback',async()=>{
 const printer=mockPrinter();const result=await executeJob(config,job(),printer.transport);assert.equal(result.state,'verified');assert.deepEqual(printer.writes,["SET_PRINT_FILAMENT_CONFIG CONFIG_EXTRUDER=0 VENDOR='Generic' FILAMENT_TYPE='PLA' FILAMENT_SUBTYPE='Matte' FILAMENT_COLOR_RGBA=FF8000FF"]);
 for(const options of [{busyAt:1},{busyAt:2},{unsupported:true}]){const blocked=mockPrinter(options);assert.equal((await executeJob(config,job(),blocked.transport)).state,'blocked');assert.equal(blocked.writes.length,0)}
 for(const options of [{lostReply:true},{mismatch:true}]){const uncertain=mockPrinter(options);assert.equal((await executeJob(config,job(),uncertain.transport)).state,'uncertain');assert.equal(uncertain.writes.length,1)}
 const invalid=mockPrinter();assert.equal((await executeJob(config,job({profile:{vendor:"bad'\nG28"}}),invalid.transport)).state,'blocked');assert.equal(invalid.writes.length,0);
});
test('Spoolman assignment is explicit, validated and cleared for colour-only changes',async()=>{
 const linked=mockPrinter();assert.equal((await executeJob(config,job({spoolmanId:5}),linked.transport)).state,'verified');assert.equal(linked.writes[0],'SET_SPOOL_ID CHANNEL=0 SPOOL_ID=5');
 const wrong=mockPrinter({wrongMaterial:true});assert.equal((await executeJob(config,job({spoolmanId:5}),wrong.transport)).state,'blocked');assert.equal(wrong.writes.length,0);
 const race=mockPrinter({otherToolAt:2});assert.equal((await executeJob(config,job({spoolmanId:5}),race.transport)).state,'blocked');assert.equal(race.writes.length,0);
 const old=mockPrinter({spoolmanId:3});assert.equal((await executeJob(config,job({before:{...before,spoolmanId:3}}),old.transport)).state,'verified');assert.equal(old.writes[0],'SET_SPOOL_ID CHANNEL=0 SPOOL_ID=0');
 const interrupted=mockPrinter({spoolmanId:3,busyAt:4});assert.equal((await executeJob(config,job({before:{...before,spoolmanId:3}}),interrupted.transport)).state,'uncertain');assert.equal(interrupted.writes.length,1);
});
test('bridge configuration is explicit, outbound only, and does not silently enable writes',()=>{
 const value={origin,printerUrl:'http://192.168.1.26',token:btoa(user)+'.'+crypto.randomUUID()+crypto.randomUUID(),allowPrinterWrites:true};assert.equal(configuration(value).printerUrl,value.printerUrl);
 for(const change of [{allowPrinterWrites:false},{printerUrl:'https://example.com'},{printerUrl:'http://169.254.169.254'},{printerUrl:'http://192.168.1.26/path'},{origin:'http://studio.example'},{token:'invalid'}])assert.throws(()=>configuration({...value,...change}));
 assert.throws(()=>Core.profile({...item,material:'PLA+'}));assert.throws(()=>Core.profile({...item,finish:'unknown'}));
});

test('a changed Spoolman mapping cannot replace the ID approved in the review',async()=>{
 const app=await setup();try{
  const reel={id:crypto.randomUUID(),itemId:item.id,number:1,spoolmanId:5};
  const save=()=>app.DB.prepare('UPDATE libraries SET payload = ? WHERE user_id = ?').bind(JSON.stringify({items:[item],reels:[reel]}),user).run();
  await save();const request=await app.command({reelId:reel.id,linkSpoolman:true,spoolmanId:5});
  reel.spoolmanId=6;await save();assert.equal((await app.ui(request)).status,400);
  assert.equal((await (await app.ui()).json()).request,null);
  reel.spoolmanId=5;await save();assert.equal((await app.ui(request)).status,200);
  reel.spoolmanId=6;await save();assert.equal((await (await app.bridge({kind:'poll',status:snapshot()})).json()).job,null);
  assert.equal((await (await app.ui()).json()).request.state,'blocked');
 }finally{app.DB.close()}
});

test('expired queues and missing results never deliver a second command; exports omit credentials',async()=>{
 const app=await setup();try{
  const alter=async(change)=>{const row=await app.DB.prepare('SELECT payload FROM printer_connections WHERE user_id = ?').bind(user).first();const value=JSON.parse(row.payload);change(value);await app.DB.prepare('UPDATE printer_connections SET payload = ? WHERE user_id = ?').bind(JSON.stringify(value),user).run()};
  await app.ui(await app.command());await alter(value=>value.request.createdAt=Date.now()-31000);
  assert.equal((await (await app.bridge({kind:'poll',status:snapshot()})).json()).job,null);
  assert.equal((await (await app.ui()).json()).request.state,'expired');
  await app.ui(await app.command());assert.ok((await (await app.bridge({kind:'poll',status:snapshot()})).json()).job);
  await alter(value=>value.request.claimedAt=Date.now()-91000);
  assert.equal((await (await app.bridge({kind:'poll',status:snapshot()})).json()).job,null);
  assert.equal((await (await app.ui()).json()).request.state,'uncertain');
  const exported=await (await handleAccountExport(new Request(origin+'/api/account-data',{headers:{'oai-authenticated-user-id':user}}),{DB:app.DB})).json();
  assert.equal(exported.printer.request.state,'uncertain');assert.equal(exported.printer.enabled,true);
  assert(!JSON.stringify(exported).includes(app.token));assert(!Object.hasOwn(exported.printer,'hash'));assert(!Object.hasOwn(exported.printer,'keyRequest'));
 }finally{app.DB.close()}
});

test('lost result acknowledgements retry reporting, never printer writes',async()=>{
 const printer=mockPrinter(),request=job();let reports=0,polls=0;
 const transport=async(url,init)=>{
  if(!url.startsWith(origin))return printer.transport(url,init);
  const body=JSON.parse(init.body);
  if(body.kind==='poll'){polls++;return Response.json({job:request})}
  reports++;assert.equal(body.state,'verified');if(reports<3)throw Error('Lost result acknowledgement');return Response.json({accepted:true});
 };
 const result=await bridgeOnce({...config,origin,token:btoa(user)+'.'+crypto.randomUUID()+crypto.randomUUID(),allowPrinterWrites:true},transport);
 assert.equal(result,'Printer request verified.');assert.equal(polls,1);assert.equal(reports,3);assert.equal(printer.writes.length,1);
});
