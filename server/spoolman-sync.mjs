import {boundedJson} from './api.mjs';
import {tokenHash, updateItemStatus} from './reels.mjs';
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Netlify-CDN-Cache-Control':'no-store'}});
export async function handleSpoolmanSync(request,{DB}) {
  if(request.method!=='POST')return reply({error:'Use POST.'},405);
  try {
    const token=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9+/=]+\.[a-f0-9-]{72})$/)?.[1];
    if(!token)return reply({error:'Invalid bridge credential.'},401);
    let user;try{user=atob(token.split('.')[0])}catch{return reply({error:'Invalid bridge credential.'},401)}
    if(!/^user_[A-Za-z0-9]{1,80}$/.test(user))return reply({error:'Invalid bridge credential.'},401);
    const row=await DB.prepare('SELECT revision, payload FROM libraries WHERE user_id = ?').bind(user).first();
    const data=row?JSON.parse(row.payload):null;
    if(!data?.bridgeHash || await tokenHash(token)!==data.bridgeHash)return reply({error:'Bridge credential expired or revoked.'},401);
    if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'JSON required.'},415);
    const input=await boundedJson(request,200000);
    if(!Number.isSafeInteger(input.sequence)||Math.abs(Date.now()-input.sequence)>300000||!Array.isArray(input.spools)||input.spools.length>5000)throw Error('Invalid or expired Spoolman snapshot.');
    if(input.sequence<=(data.bridgeLastSequence||0))return reply({ignored:true});
    const seen=new Set();
    for(const spool of input.spools){
      if(!Number.isSafeInteger(spool.id)||spool.id<1||seen.has(spool.id)||spool.remainingGrams!==null&&(!Number.isFinite(spool.remainingGrams)||spool.remainingGrams<0||spool.remainingGrams>10000))throw Error('Invalid spool weights.');seen.add(spool.id);
    }
    let updated=0;const now=new Date().toISOString();
    for(const reel of data.reels||[]){
      const spool=input.spools.find(spool=>spool.id===reel.spoolmanId);if(!spool||spool.remainingGrams===null)continue;
      reel.remainingGrams=Math.round(spool.remainingGrams*10)/10;reel.weightSource='spoolman-estimate';reel.syncedAt=now;
      if(reel.remainingGrams===0)reel.used=true;
      updateItemStatus(data,reel.itemId);updated++;
    }
    data.bridgeLastSequence=input.sequence;data.bridgeLastSync=now;
    const payload=JSON.stringify(data);if(new TextEncoder().encode(payload).length>8000000)throw Error('Library storage limit reached.');
    const result=await DB.prepare('UPDATE libraries SET revision = revision + 1, payload = ?, request_id = ?, updated_at = ? WHERE user_id = ? AND revision = ?').bind(payload,'bridge-'+input.sequence,now,user,row.revision).run();
    return result.meta.changes===1?reply({updated,syncedAt:now}):reply({error:'Library changed. Send a fresh snapshot.'},409);
  }catch{return reply({error:'Spoolman sync failed. No updates confirmed.'},400)}
}
