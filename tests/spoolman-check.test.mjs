import test from 'node:test';
import assert from 'node:assert/strict';
import {checkSpoolman, toolMapping} from '../scripts/spoolman-check.mjs';
test('connection diagnostics are read-only, recognise native SpoolLink and do not expose raw config',async()=>{
 const calls=[];
 const transport=async(url,options)=>{
  calls.push(options);assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.body,undefined);
  const route=new URL(url).pathname;
  return Response.json(route==='/server/info'?{result:{components:['spoolman','spoollink'],klippy_state:'ready'}}:route==='/server/config'?{result:{config:{spoolman:{server:'http://spoolman.local:7912'},private:{token:'NEVER_RETURN'}}}}:route==='/server/spoolman/status'?{result:{spoolman_connected:true,spool_id:null,pending_reports:[]}}:[]);
 };
 const result=await checkSpoolman('http://printer.local','http://spoolman.local:7912',transport);
 assert.equal(calls.length,5);assert.equal(result.nativeSpoolLink,true);assert.equal(result.exactServerAddressMatch,true);assert.equal(result.availableSpoolRecords,0);assert(!JSON.stringify(result).includes('NEVER_RETURN'));assert.match(result.nextStep,/Create or transfer/);
 assert.equal(result.toolMapping.available,false);assert.deepEqual(result.toolMapping.tools,[]);
 await assert.rejects(checkSpoolman('http://user:secret@printer.local','http://spoolman.local:7912',transport));assert.equal(calls.length,5);
});

test('per-tool diagnosis distinguishes unknown, unmapped, missing and duplicate records without exposing tags',()=>{
 const result=toolMapping({
  print_task_config:{filament_spool_id:[17,0,99,17],filament_exist:[true,true,false,true]},
  filament_detect:{info:[{CARD_UID:[83,59,22,163,19,0,1]},{CARD_UID:[]},{},{}]}
 },[{id:17,remaining_weight:612.5,comment:'PRIVATE_NOTE',filament:{name:'PRIVATE_NAME'}}]);
 assert.deepEqual(result.tools.map(tool=>tool.spoolmanId),[17,null,99,17]);
 assert.deepEqual(result.tools.map(tool=>tool.recordFound),[true,null,false,true]);
 assert.deepEqual(result.tools.map(tool=>tool.tagDetected),[true,false,null,null]);
 assert.equal(result.tools[0].tool,1);assert.equal(result.tools[0].channel,0);
 assert.equal(result.tools[0].remainingGrams,612.5);
 assert.equal(result.warnings.length,3);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE_|CARD_UID|83,59/);
 assert.throws(()=>toolMapping({print_task_config:{filament_spool_id:[0,0]}},[]));
 assert.throws(()=>toolMapping({print_task_config:{filament_spool_id:[0,'1',0,0]}},[]));
 assert.throws(()=>toolMapping({print_task_config:{filament_spool_id:[0,-1,0,0]}},[]));
});

test('native diagnosis reads all four tools using only GET while unsupported firmware remains unknown',async()=>{
 const calls=[];
 const transport=async(url,options)=>{
  calls.push({url,options});
  assert.equal(options.method,'GET');assert.equal(options.body,undefined);
  const route=new URL(url).pathname;
  if(route==='/server/info')return Response.json({result:{components:['spoollink'],klippy_state:'ready'}});
  if(route==='/server/config')return Response.json({result:{config:{spoolman:{server:'http://spoolman.local:7912'}}}});
  if(route==='/server/spoolman/status')return Response.json({result:{spoolman_connected:true}});
  if(route==='/printer/objects/query')return Response.json({result:{status:{print_task_config:{filament_spool_id:[0,0,0,0],filament_exist:[true,false,false,false]}}}});
  return Response.json([]);
 };
 const result=await checkSpoolman('http://printer.local','http://spoolman.local:7912',transport);
 assert.equal(result.toolMapping.available,true);assert.equal(result.toolMapping.tools.length,4);
 assert.match(result.toolMapping.warnings[0],/Tool 1 reports filament/);
 assert.match(calls.at(-1).url,/print_task_config=filament_spool_id,filament_exist&filament_detect=info$/);
 const unsupported=await checkSpoolman('http://printer.local','http://spoolman.local:7912',(url,options)=>new URL(url).pathname==='/server/info'?Response.json({result:{components:['spoolman']}}):transport(url,options));
 assert.equal(unsupported.toolMapping.available,false);
 const failed=await checkSpoolman('http://printer.local','http://spoolman.local:7912',(url,options)=>new URL(url).pathname==='/printer/objects/query'?Promise.reject(Error('OFFLINE_SECRET')):transport(url,options));
 assert.equal(failed.toolMapping.available,false);assert.doesNotMatch(JSON.stringify(failed),/OFFLINE_SECRET/);
});
