import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
import ipaddr from 'ipaddr.js';
import Core from '../out/printer-core.js';
import {jsonResponse} from './spoolman-bridge.mjs';

function localOrigin(value){
 const url=new URL(value);
 if(!['http:','https:'].includes(url.protocol)||url.origin!==value||url.username||url.password)throw Error('Use a local server origin only, without a path or credentials.');
 if(url.hostname!=='localhost'&&(!ipaddr.isValid(url.hostname)||!['private','loopback'].includes(ipaddr.parse(url.hostname).range())))throw Error('Use a private IPv4 address or localhost for the printer and Spoolman.');
 return url.origin;
}
export function configuration(value){
 const origin=new URL(value.origin);
 if(origin.protocol!=='https:'||origin.origin!==value.origin||origin.username||origin.password)throw Error('Use your HTTPS Spool Studio origin.');
 if(value.allowPrinterWrites!==true||typeof value.token!=='string'||!/^[A-Za-z0-9+/=]+\.[a-f0-9-]{72}$/.test(value.token))throw Error('Use a private printer bridge configuration and explicitly enable allowPrinterWrites.');
 if(value.printerApiKey!==undefined&&value.printerApiKey!==''&&(typeof value.printerApiKey!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(value.printerApiKey)))throw Error('Invalid local printer API key.');
 return {origin:origin.origin,token:value.token,printerUrl:localOrigin(value.printerUrl),spoolmanUrl:value.spoolmanUrl?localOrigin(value.spoolmanUrl):null,printerApiKey:value.printerApiKey||'',allowPrinterWrites:true};
}
async function get(config,route,transport){
 return jsonResponse(await transport(config.printerUrl+route,{method:'GET',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Accept:'application/json',...(config.printerApiKey?{'X-Api-Key':config.printerApiKey}:{})}}),500000);
}
export async function inspectPrinter(config,transport=fetch){
 const info=await get(config,'/server/info',transport);
 const result=await get(config,'/printer/objects/query?gcode=commands&print_stats=state&idle_timeout=state&print_task_config=filament_vendor,filament_type,filament_sub_type,filament_color_rgba,filament_spool_id,filament_exist',transport);
 const status=result.result?.status,fields=status?.print_task_config,commands=status?.gcode?.commands;
 if(!fields||!commands)throw Error('Printer metadata is unavailable.');
 const tools=Array.from({length:4},(_,channel)=>Core.tool({vendor:fields.filament_vendor?.[channel],material:fields.filament_type?.[channel],subtype:fields.filament_sub_type?.[channel],rgba:fields.filament_color_rgba?.[channel]?.toUpperCase(),spoolmanId:fields.filament_spool_id?.[channel]??(info.result?.components?.includes('spoollink')?null:0),present:fields.filament_exist?.[channel]}));
 return Core.snapshot({ready:info.result?.klippy_state==='ready'&&['standby','complete','cancelled'].includes(status.print_stats?.state)&&status.idle_timeout?.state==='Idle',supported:Object.hasOwn(commands,'SET_PRINT_FILAMENT_CONFIG'),canLink:Object.hasOwn(commands,'SET_SPOOL_ID'),tools});
}
function validateJob(job){
 if(!job||!/^[a-f0-9-]{36}$/.test(job.id||'')||!Number.isInteger(job.channel)||job.channel<0||job.channel>3||!Number.isSafeInteger(job.spoolmanId)||job.spoolmanId<0||!Number.isSafeInteger(job.expiresAt))throw Error('Invalid printer request.');
 Core.tool(job.before);
 const profile=Core.profile({material:job.profile?.material,finish:{Basic:'standard',Matte:'matte',Silk:'silk'}[job.profile?.subtype],hex:'#'+String(job.profile?.rgba||'').slice(0,6)});
 if(JSON.stringify(profile)!==JSON.stringify(job.profile))throw Error('Unsupported filament profile.');
}
export async function executeJob(config,job,transport=fetch,now=Date.now){
 let written=false,status=null;
 try{
  validateJob(job);if(job.expiresAt-now()>15000)throw Error('Invalid request expiry.');status=await inspectPrinter(config,transport);
  const safe=state=>state.ready&&state.supported&&now()<job.expiresAt;
  if(!safe(status)||!Core.same(status.tools[job.channel],job.before))throw Error('Printer changed or request expired.');
  if((job.spoolmanId||job.before.spoolmanId)&&!status.canLink)throw Error('SpoolLink command unavailable.');
  if(job.spoolmanId){
   if(!config.spoolmanUrl||status.tools.some((tool,index)=>index!==job.channel&&tool.spoolmanId===job.spoolmanId))throw Error('Spoolman mapping is missing or already in use.');
   const configured=await get(config,'/server/config',transport),connected=await get(config,'/server/spoolman/status',transport);
   if(configured.result?.config?.spoolman?.server?.replace(/\/$/,'')!==config.spoolmanUrl||connected.result?.spoolman_connected!==true)throw Error('Spoolman server does not match the printer configuration.');
   const spool=await jsonResponse(await transport(config.spoolmanUrl+'/api/v1/spool/'+job.spoolmanId,{method:'GET',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Accept:'application/json'}}),50000);
   if(spool.id!==job.spoolmanId||spool.archived||spool.remaining_weight===0||spool.filament?.material!==job.profile.material||String(spool.filament?.color_hex||'').replace(/^#/,'').toUpperCase()!==job.profile.rgba.slice(0,6))throw Error('Spoolman material or colour does not match the selected reel.');
  }
  async function send(script){
   const fresh=await inspectPrinter(config,transport);
   if(!safe(fresh)||!Core.same(fresh.tools[job.channel],status.tools[job.channel]))throw Error('Printer changed immediately before send.');
   if(job.spoolmanId&&fresh.tools.some((tool,index)=>index!==job.channel&&tool.spoolmanId===job.spoolmanId))throw Error('Spool was assigned to another tool.');
   written=true;
   const result=await jsonResponse(await transport(config.printerUrl+'/printer/gcode/script',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/json',...(config.printerApiKey?{'X-Api-Key':config.printerApiKey}:{})},body:JSON.stringify({script})}),10000);
   if(result.result!=='ok')throw Error('Printer did not acknowledge settings.');
   status=await inspectPrinter(config,transport);
  }
  if(job.spoolmanId!==job.before.spoolmanId){await send('SET_SPOOL_ID CHANNEL='+job.channel+' SPOOL_ID='+job.spoolmanId);if(status.tools[job.channel].spoolmanId!==job.spoolmanId)throw Error('Assignment verification failed.')}
  await send("SET_PRINT_FILAMENT_CONFIG CONFIG_EXTRUDER="+job.channel+" VENDOR='Generic' FILAMENT_TYPE='"+job.profile.material+"' FILAMENT_SUBTYPE='"+job.profile.subtype+"' FILAMENT_COLOR_RGBA="+job.profile.rgba);
  if(!Core.matches(status.tools[job.channel],job.profile,job.spoolmanId))throw Error('Settings verification failed.');
  return {kind:'result',id:job.id,state:'verified',status};
 }catch{
  if(!status)status=await inspectPrinter(config,transport).catch(()=>null);
  return {kind:'result',id:job?.id,state:written?'uncertain':'blocked',status};
 }
}
export async function bridgeOnce(value,transport=fetch){
 const config=configuration(value);
 const exchange=body=>transport(config.origin+'/api/printer-bridge',{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.token},body:JSON.stringify(body)}).then(response=>jsonResponse(response,12000));
 const response=await exchange({kind:'poll',status:await inspectPrinter(config,transport)});
 if(!response.job)return 'Printer status updated. Waiting for a reviewed request.';
 const result=await executeJob(config,response.job,transport);
 if(!result.status)throw Error('Printer unavailable after claim. Request will not be executed again automatically.');
 for(let attempt=0;attempt<3;attempt++)try{await exchange(result);return 'Printer request '+result.state+'.'}catch{if(attempt===2)throw Error('Result not acknowledged. Do not repeat the printer command; check the printer.');await pause(1000)}
}
async function main(){
 const [filename,option]=process.argv.slice(2);
 if(!filename||process.argv.length>4||option&&!['--once','--check'].includes(option))throw Error('Usage: node scripts/printer-bridge.mjs private-config.json [--check|--once]');
 const config=configuration(JSON.parse(await readFile(filename,'utf8')));
 if(option==='--check'){console.log(JSON.stringify(await inspectPrinter(config),null,2));return}
 do{try{console.log(await bridgeOnce(config))}catch{console.error('Printer bridge unavailable. Check local servers and the private key; no success assumed.');if(option==='--once'){process.exitCode=1;return}}if(option==='--once')return;await pause(5000)}while(true);
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)main().catch(error=>{console.error(error.message);process.exitCode=1});
