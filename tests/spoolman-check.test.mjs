import test from 'node:test';
import assert from 'node:assert/strict';
import {checkSpoolman} from '../scripts/spoolman-check.mjs';
test('connection diagnostics are read-only, recognise native SpoolLink and do not expose raw config',async()=>{
 const calls=[];
 const transport=async(url,options)=>{
  calls.push(options);assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.body,undefined);
  const route=new URL(url).pathname;
  return Response.json(route==='/server/info'?{result:{components:['spoolman','spoollink'],klippy_state:'ready'}}:route==='/server/config'?{result:{config:{spoolman:{server:'http://spoolman.local:7912'},private:{token:'NEVER_RETURN'}}}}:route==='/server/spoolman/status'?{result:{spoolman_connected:true,spool_id:null,pending_reports:[]}}:[]);
 };
 const result=await checkSpoolman('http://printer.local','http://spoolman.local:7912',transport);
 assert.equal(calls.length,4);assert.equal(result.nativeSpoolLink,true);assert.equal(result.exactServerAddressMatch,true);assert.equal(result.availableSpoolRecords,0);assert(!JSON.stringify(result).includes('NEVER_RETURN'));assert.match(result.nextStep,/Create or transfer/);
 await assert.rejects(checkSpoolman('http://user:secret@printer.local','http://spoolman.local:7912',transport));assert.equal(calls.length,4);
});
