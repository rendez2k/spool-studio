'use strict';
const StrataTransfer=(()=>{
 const MAX_BYTES=100*1024*1024;
 const senders=new Set(['https://strata3mf.uk','https://rendez2k.github.io']);
 const loopback=url=>url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname);
 function configuration(href,parameter='strata-transfer'){
  const receiver=new URL(href),fragment=new URLSearchParams(receiver.hash.slice(1));
  if(!fragment.has(parameter))return null;
  const token=fragment.get(parameter),sender=fragment.get('sender');
  if((fragment.has('strata-stock')&&fragment.has('strata-transfer'))||fragment.getAll(parameter).length!==1||fragment.getAll('sender').length!==1||!(/^[a-f0-9]{32}$/).test(token||''))throw Error('Invalid Strata transfer link. Start again from Strata.');
  let source;try{source=new URL(sender)}catch{throw Error('Invalid Strata sender. Load the 3MF manually.')}
  if(source.origin!==sender||source.username||source.password||!((receiver.origin==='https://spool-studio.uk'&&senders.has(sender))||(loopback(receiver)&&loopback(source))))throw Error('This Strata sender is not supported. Load the 3MF manually.');
  return {token,sender};
 }
 function validateFile(data){
  if(typeof data.name!=='string'||data.name.length>180||!/^.+\.3mf$/i.test(data.name)||/[\u0000-\u001f\u007f-\u009f\\/:*?"<>|]/.test(data.name)||data.name.trim()!==data.name)throw Error('Strata must send a valid .3mf filename.');
  if(!(data.buffer instanceof ArrayBuffer)||data.buffer.byteLength<22||data.buffer.byteLength>MAX_BYTES)throw Error('Choose a valid 3MF file under 100 MB.');
  return {name:data.name,buffer:data.buffer};
 }
 function receive({host,context,importFile,update,clearFragment}){
  let config;
  try{config=configuration(host.location.href)}catch(error){update('error',error.message);clearFragment();return null}
  if(!config)return null;
  const opener=host.opener;
  if(!opener||opener.closed){update('error','The Strata tab is unavailable. Reopen this from Strata, or download and load the 3MF manually.');clearFragment();return null}
  let phase='waiting',account=null,interval=null,timeout=null;
  function post(type,extra={}){
   try{opener.postMessage({type:'strata-spool:'+type,version:1,token:config.token,...extra},config.sender)}catch{}
  }
  function finish(next,message){
   if(['received','error','cancelled'].includes(phase))return;
   phase=next;host.clearInterval(interval);host.clearTimeout(timeout);
   host.removeEventListener('message',messageReceived);host.removeEventListener('pagehide',pageHidden);
   clearFragment();update(next,message);
   post(next==='received'?'received':'error',next==='received'?{}:{message});
  }
  function current(){return phase==='receiving'&&context().accountKey===account}
  async function messageReceived(event){
   const data=event.data;
   if(phase!=='ready'||event.source!==opener||event.origin!==config.sender||!data||data.type!=='strata-spool:file'||data.version!==1||data.token!==config.token)return;
   if(context().accountKey!==account){finish('error','Your account changed. Send the project again.');return}
   phase='receiving';update('receiving','Reading the Strata project. Your existing comparisons will be kept.');
   try{
    const file=validateFile(data);
    await importFile(file,current);
    if(current())finish('received','Project received from Strata. Review its colours and choose your library filaments. Nothing has been sent to your printer.');
    else if(phase==='receiving')finish('error','Your account changed. Send the project again.');
   }catch{finish('error','The project could not be imported. Download it from Strata and try Load 3MF projects for details. Existing comparisons are kept.')}
  }
  function pageHidden(){finish('cancelled','Transfer closed. Send the project again from Strata.')}
  function resume(){
   if(!['waiting','ready','receiving'].includes(phase))return;
   if(opener.closed){finish('error','The Strata tab closed. Load the downloaded 3MF manually.');return}
   const status=context();
   if(account&&status.accountKey!==account){finish('error','Your account changed. Send the project again.');return}
   if(phase==='waiting'&&status.ready&&status.accountKey){
    account=status.accountKey;phase='ready';
    update('ready','Waiting for Strata to send your model. Keep both tabs open.');
    timeout=host.setTimeout(()=>finish('error','The Strata transfer timed out. Send it again, or load the downloaded 3MF manually.'),120000);
   }
   if(phase==='ready')post('ready');
  }
  host.addEventListener('message',messageReceived);host.addEventListener('pagehide',pageHidden);
  update('waiting','Sign in and let your library finish loading, then keep both tabs open. You can also download the 3MF from Strata and load it manually.');
  interval=host.setInterval(resume,1000);resume();
  return {resume,cancel:()=>finish('cancelled','Strata transfer cancelled. Existing comparisons are kept.'),get phase(){return phase}};
 }
 return {configuration,validateFile,receive,MAX_BYTES};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=StrataTransfer;
