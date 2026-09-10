import {boundedJson} from './api.mjs';
import {tokenHash} from './reels.mjs';
import Core from '../out/printer-core.js';
import Colours from '../out/colour-catalog.js';
const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','Netlify-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
const load=(DB,user)=>DB.prepare('SELECT revision, payload FROM printer_connections WHERE user_id = ?').bind(user).first();
export function printerView(data,now=Date.now()){
 const request=data.request?{id:data.request.id,state:data.request.state,tool:data.request.channel+1,profile:data.request.profile,spoolmanId:data.request.spoolmanId,createdAt:data.request.createdAt,message:data.request.message||'',finishedAt:data.request.finishedAt||null}:null;
 return {enabled:Boolean(data.hash),online:Boolean(data.seenAt&&now-data.seenAt<20000),seenAt:data.seenAt||null,status:data.status||null,request};
}
async function store(DB,user,row,data){
 const changed=await DB.prepare('UPDATE printer_connections SET revision = revision + 1, payload = ? WHERE user_id = ? AND revision = ?').bind(JSON.stringify(data),user,row.revision).run();
 if(changed.meta.changes!==1)throw Error('Connection changed. Refresh and review again.');
}
async function chosen(DB,user,input){
 const library=await DB.prepare('SELECT payload FROM libraries WHERE user_id = ?').bind(user).first();
 const data=library?JSON.parse(library.payload):{items:[]};
 const reel=input.reelId?data.reels?.find(reel=>reel.id===input.reelId):null;
 const item=data.items.find(item=>item.id===(reel?.itemId||input.itemId));
 if(!item||item.used||input.reelId&&!reel||reel?.used||reel?.remainingGrams===0)throw Error('Choose an available spool in your own library.');
 if(data.reels?.filter(reel=>reel.itemId===item.id).length&&!data.reels.some(reel=>reel.itemId===item.id&&!reel.used&&reel.remainingGrams!==0))throw Error('No available physical reels remain for this entry.');
 const profile=Core.profile(Colours.resolve(item));
 if(typeof input.linkSpoolman!=='boolean')throw Error('Choose whether to link this physical reel.');
 if(input.linkSpoolman&&(!reel||!Number.isSafeInteger(reel.spoolmanId)||reel.spoolmanId<1))throw Error('Select an already-linked physical reel for Spoolman tracking.');
 return {profile,spoolmanId:input.linkSpoolman?reel.spoolmanId:0};
}
export async function handlePrinter(request,{DB}){
 const user=request.headers.get('oai-authenticated-user-id');if(!user)return reply({error:'Sign in to use your printer connection.'},401);
 if(!['GET','POST'].includes(request.method))return reply({error:'Use GET or POST.'},405);
 if(request.method==='POST'&&(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site'))return reply({error:'Use this app’s printer controls.'},403);
 try{
  let row=await load(DB,user),data=row?JSON.parse(row.payload):{};
  if(request.method==='GET')return reply({accountKey:user,revision:row?.revision||0,...printerView(data)});
  if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'JSON required.'},415);
  const input=await boundedJson(request,6000);
  if(input.expectedAccountKey!==user)return reply({error:'The signed-in account changed. Review again.'},409);
  if(!uuid(input.requestId))throw Error('Invalid request identifier.');
  if(['create','revoke','cancel'].includes(input.kind)&&input.baseRevision!==(row?.revision||0))throw Error('Connection changed. Refresh before changing its setup.');
  if(input.kind==='create'){
   if(data.keyRequest===input.requestId)return reply({accountKey:user,...printerView(data),keyLost:true});
   const token=btoa(user)+'.'+crypto.randomUUID()+crypto.randomUUID();
   if(!row){await DB.prepare('INSERT INTO printer_connections (user_id,revision,payload) VALUES (?,1,?) ON CONFLICT(user_id) DO NOTHING').bind(user,'{}').run();row=await load(DB,user);if(row.revision!==1||row.payload!=='{}')throw Error('Connection changed. Refresh setup.')}
   data={hash:await tokenHash(token),keyRequest:input.requestId};await store(DB,user,row,data);return reply({accountKey:user,...printerView(data),token});
  }
  if(input.kind==='revoke'){if(row)await store(DB,user,row,{});return reply({accountKey:user,...printerView({})})}
  if(input.kind==='cancel'){
   if(data.request?.id!==input.id||data.request.state!=='queued')throw Error('Only a waiting request can be cancelled. An executing request cannot be recalled.');
   data.request.state='cancelled';data.request.finishedAt=Date.now();await store(DB,user,row,data);return reply({accountKey:user,...printerView(data)});
  }
  if(input.kind!=='send'||input.reviewed!==true||!Number.isInteger(input.channel)||input.channel<0||input.channel>3)throw Error('Review one tool and filament before sending.');
  if(data.request?.id===input.requestId)return reply({accountKey:user,...printerView(data)});
  if(!data.hash||!printerView(data).online||!data.status?.ready||!data.status.supported)throw Error('The local bridge must report a supported, idle printer before sending.');
  if(data.request&&['queued','executing'].includes(data.request.state))throw Error('Wait for the current request, or cancel it before the bridge picks it up.');
  if(!Number.isSafeInteger(input.seenAt)||Date.now()-input.seenAt>20000||input.seenAt>Date.now()||!Core.same(input.before,data.status.tools[input.channel]))throw Error('Printer status changed or the review expired. Refresh and review again.');
  const selection=await chosen(DB,user,input);if(input.spoolmanId!==selection.spoolmanId)throw Error('The reel’s Spoolman assignment changed. Refresh and review again.');
  if(JSON.stringify(input.profile)!==JSON.stringify(selection.profile))throw Error('The library filament changed. Refresh and review again.');
  if((selection.spoolmanId||input.before.spoolmanId)&&!data.status.canLink)throw Error('This firmware cannot safely change or clear the tool’s Spoolman assignment.');
  data.request={id:input.requestId,state:'queued',channel:input.channel,before:Core.tool(input.before),...selection,itemId:input.itemId,reelId:input.reelId||null,linkSpoolman:input.linkSpoolman,createdAt:Date.now()};
  await store(DB,user,row,data);return reply({accountKey:user,...printerView(data)});
 }catch(error){return reply({error:error.message||'Printer request was not confirmed.'},400)}
}
export async function handlePrinterBridge(request,{DB}){
 if(request.method!=='POST')return reply({error:'Use POST.'},405);
 try{
  const token=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9+/=]+\.[a-f0-9-]{72})$/)?.[1];
  if(!token)return reply({error:'Invalid printer bridge credential.'},401);
  const user=atob(token.split('.')[0]);if(!/^user_[A-Za-z0-9]{1,80}$/.test(user))return reply({error:'Invalid printer bridge owner.'},401);
  const row=await load(DB,user),data=row?JSON.parse(row.payload):{};
  if(!data.hash||await tokenHash(token)!==data.hash)return reply({error:'Printer bridge key revoked or replaced.'},401);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'JSON required.'},415);
  const input=await boundedJson(request,8000),now=Date.now();let job=null;
  if(input.kind==='result'){
   if(!data.request||input.id!==data.request.id||!['verified','blocked','uncertain'].includes(input.state))throw Error('Invalid printer result.');
   if(data.request.state!=='executing')return reply({accepted:true});
   const status=Core.snapshot(input.status);
   if(input.state==='verified'&&!Core.matches(status.tools[data.request.channel],data.request.profile,data.request.spoolmanId))throw Error('Read-back does not match the requested settings.');
   data.status=status;data.seenAt=now;data.request.state=input.state;data.request.finishedAt=now;
   data.request.message={verified:'Printer read-back matches the requested material, colour and Spoolman assignment.',blocked:'No settings were sent: printer busy, changed, unsupported or spool mapping did not match. Refresh and review.',uncertain:'A write may have occurred, but full verification failed. Check the printer before trying again.'}[input.state];
  }else if(input.kind==='poll'){
   data.status=Core.snapshot(input.status);data.seenAt=now;
   if(data.request?.state==='executing'&&now-data.request.claimedAt>90000){data.request.state='uncertain';data.request.message='Bridge result was not received. Do not assume the settings changed. Check the printer before another request.'}
   if(data.request?.state==='queued'){
    if(now-data.request.createdAt>30000){data.request.state='expired';data.request.message='Request expired without being sent. Refresh and review again.'}
    else{
     const selection=await chosen(DB,user,data.request).catch(()=>null);
     if(!selection||JSON.stringify(selection.profile)!==JSON.stringify(data.request.profile)||selection.spoolmanId!==data.request.spoolmanId||!data.status.ready||!data.status.supported||!Core.same(data.status.tools[data.request.channel],data.request.before)){data.request.state='blocked';data.request.message='Printer or library changed. Nothing was sent; refresh and review again.'}
     else{data.request.state='executing';data.request.claimedAt=now;job={id:data.request.id,channel:data.request.channel,before:data.request.before,profile:data.request.profile,spoolmanId:data.request.spoolmanId,expiresAt:now+15000}}
    }
   }
  }else throw Error('Invalid bridge action.');
  await store(DB,user,row,data);return reply({accepted:true,job});
 }catch{return reply({error:'Printer bridge update not accepted. Do not resend a printer command.'},400)}
}
