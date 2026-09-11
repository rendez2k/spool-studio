'use strict';
const StrataStock=(()=>{
 const protocol=typeof module!=='undefined'&&module.exports?require('./strata-transfer.js'):StrataTransfer;
 const MAX_BYTES=512*1024,MAX_COLOURS=1000;
 const finishes=new Set(['standard','matte','silk','marble','sparkle','wood','glow','satin','metal','unknown']);
 const clean=(value,fallback)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').trim()||fallback:fallback;
 function palette(rows,inferFinish=()=> 'unknown'){
  const groups=new Map();let omitted=0;
  for(const row of rows){
   if(row.used===true||!Number.isInteger(row.spools)||row.spools<=0)continue;
   const brand=clean(row.brand,'Unknown brand'),product=clean(row.product,'Unknown product'),colour=clean(row.colour,'Unnamed colour'),material=clean(row.material,'UNKNOWN').toUpperCase();
   const hex=typeof row.hex==='string'&&/^#[a-f0-9]{6}(?:ff)?$/i.test(row.hex)?row.hex.slice(0,7).toUpperCase():null;
   if(!hex||row.spools>500000||brand.length>80||product.length>120||colour.length>80||material.length>32||/bundle|dual|gradient|rainbow|multi.colou?r|transition/i.test(product+' '+colour)||/[\/＋+]/.test(colour)){omitted++;continue}
   const candidate=row.finish===undefined?inferFinish(product):row.finish,finish=finishes.has(candidate)?candidate:'unknown';
   const key=JSON.stringify([brand,product,colour,material,finish,hex]);
   if(!groups.has(key))groups.set(key,{brand,product,colour,material,finish,hex,availableRolls:0});
   const entry=groups.get(key);entry.availableRolls+=row.spools;
   if(entry.availableRolls>500000||groups.size>MAX_COLOURS)throw Error('Too many available colours to share.');
  }
  return {colours:[...groups.values()].sort((left,right)=>left.brand.localeCompare(right.brand)||left.product.localeCompare(right.product)||left.colour.localeCompare(right.colour)||left.hex.localeCompare(right.hex)),omitted};
 }
 function offer({host,context,snapshot,update,clearFragment}){
  let config;try{config=protocol.configuration(host.location.href,'strata-stock')}catch(error){update('error',error.message);clearFragment();return null}
  if(!config)return null;
  const opener=host.opener;
  if(!opener||opener.closed){update('error','Reopen stock sharing from Strata and keep both tabs open.');clearFragment();return null}
  let phase='waiting',account=null,review=null,interval=null,timeout=null;
  const terminal=()=>['received','error','cancelled'].includes(phase);
  function post(type,extra={}){opener.postMessage({type:'strata-spool:stock-'+type,version:1,token:config.token,...extra},config.sender)}
  function finish(next,message){
   if(terminal())return;
   phase=next;host.clearInterval(interval);host.clearTimeout(timeout);
   host.removeEventListener('message',messageReceived);host.removeEventListener('pagehide',pageHidden);
   review=null;clearFragment();update(next,message);
   if(next!=='received')try{post('error',{message})}catch{}
  }
  function prepare(message='Review the available colours below. Nothing is shared until you click Share.'){
   try{
    const status=context();
    if(!status.ready||status.accountKey!==account)return false;
    const result=snapshot();review={...result,revision:status.revision};
    phase='review';update('review',message,{...result,sender:config.sender});return true;
   }catch{finish('error','Your available colours could not be prepared. Refresh Spool Studio and try again.');return false}
  }
  function messageReceived(event){
   const data=event.data;
   if(terminal()||phase==='waiting'||event.source!==opener||event.origin!==config.sender||!data||data.version!==1||data.token!==config.token)return;
   if(context().accountKey!==account){finish('error','Your account changed. Start stock sharing again from Strata.');return}
   if(data.type==='strata-spool:stock-request'&&phase==='ready')prepare();
   else if(data.type==='strata-spool:stock-received'&&phase==='sent')finish('received','Available colours shared with Strata. This was a one-time snapshot, not ongoing access.');
   else if(data.type==='strata-spool:stock-error')finish('cancelled','Strata closed or cancelled this request. Start again from Strata when ready.');
  }
  function share(){
   if(phase!=='review'||!review)return false;
   const status=context();
   if(status.accountKey!==account){finish('error','Your account changed. Start stock sharing again from Strata.');return false}
   if(!status.ready){update('review','Wait for your library to finish updating, then try Share again.',{...review,sender:config.sender});return false}
   if(status.revision!==review.revision){prepare('Your stock changed. Review the updated colours, then click Share again.');return false}
   if(opener.closed){finish('error','The Strata tab closed. Nothing more can be shared.');return false}
   const message={type:'strata-spool:stock-data',version:1,token:config.token,colours:review.colours};
   if(new TextEncoder().encode(JSON.stringify(message)).length>MAX_BYTES){finish('error','The colour snapshot is too large to share.');return false}
   phase='sent';
   try{opener.postMessage(message,config.sender)}catch{finish('error','The colours could not be sent. Start stock sharing again from Strata.');return false}
   review=null;update('sent','Snapshot sent. Waiting for Strata to confirm receipt.');return true;
  }
  function resume(){
   if(terminal())return;
   if(opener.closed){finish('error','The Strata tab closed. Start stock sharing again when ready.');return}
   const status=context();
   if(account&&status.accountKey!==account){finish('error','Your account changed. Start stock sharing again from Strata.');return}
   if(phase==='waiting'&&status.ready&&status.accountKey){
    account=status.accountKey;phase='ready';update('ready','Waiting for Strata to request your available colours. Nothing has been shared.');
    timeout=host.setTimeout(()=>finish('error','Stock sharing timed out. Start again from Strata.'),120000);
   }
   if(phase==='ready')try{post('ready')}catch{finish('error','Strata could not be reached. Start stock sharing again.')}
  }
  function pageHidden(){finish('cancelled','Stock sharing closed. No ongoing access was granted.')}
  host.addEventListener('message',messageReceived);host.addEventListener('pagehide',pageHidden);
  update('waiting','Sign in and wait for your library to load. You will choose whether to share your available colours.');
  interval=host.setInterval(resume,1000);resume();
  return {resume,share,cancel:()=>finish('cancelled',phase==='sent'?'Sharing closed. The already-sent snapshot cannot be recalled.':'Stock sharing cancelled. No colours were shared.'),get phase(){return phase}};
 }
 return {palette,offer,MAX_BYTES,MAX_COLOURS};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=StrataStock;
