'use strict';
const byId=id=>document.getElementById(id);
const queueKey='filament-nfc-queue-v1';
let phoneQueue=null,selectedTag=0,nfcOperation=null,operationPhase='ready',batchApproved=false;
let liveMode=typeof FilamentSync!=='undefined',liveOnline=false,liveSignature='',pendingLiveState=null,liveFetching=false;
const drafts=new Map(),outcomes=new Map();
function deviceSupport(){
 if(!window.isSecureContext)return 'NFC needs HTTPS. Open the published Filament Library link in Android Chrome.';
 if(window.top!==window.self)return 'Open this page directly in Android Chrome, not inside another app’s embedded browser.';
 if(!('NDEFReader' in window))return 'NFC writing is not available here. Open this link in Android Chrome on an NFC-enabled phone.';
 return '';
}
function currentPayload(){
 if(!phoneQueue)throw Error('Load a phone selection first.');
 return FilamentNfc.payload(phoneQueue.s[selectedTag],byId('tag-colour').value.trim(),{min:byId('temp-min').value,max:byId('temp-max').value});
}
function nextUnverified(){return phoneQueue?.s.findIndex((slot,index)=>index!==selectedTag&&outcomes.get(index)!=='Verified')??-1}
function setPhase(phase){
 operationPhase=phase;
 byId('operation-title').textContent=({ready:'Ready to program',writing:'Writing your tag',verifying:'Checking tag contents',verified:'Tag verified',error:'Check this tag'})[phase];
 byId('operation-step').textContent=({ready:'Check · Write · Verify',writing:'1 / 2 · Write',verifying:'2 / 2 · Verify',verified:'Write + read-back complete',error:'Not verified'})[phase];
 refreshControls();
}
function refreshControls(){
 const busy=Boolean(nfcOperation),supported=!deviceSupport();let valid=false;
 byId('nfc-spinner').hidden=!busy||!['writing','verifying'].includes(operationPhase);
 try{const payload=currentPayload();byId('tag-json').textContent=JSON.stringify(payload,null,2);byId('tag-swatch').style.setProperty('--swatch','#'+payload.color_hex);byId('form-error').textContent='';valid=true}catch(error){byId('tag-json').textContent=error.message;byId('form-error').textContent=error.message}
 for(const id of ['tag-colour','temp-min','temp-max','confirm-tag','clear-queue'])byId(id).disabled=busy;
 const canAdvance=!busy&&outcomes.get(selectedTag)==='Verified'&&nextUnverified()>=0;
 byId('next-tag').hidden=!canAdvance;
 byId('next-tag').disabled=busy;
 byId('confirmation-row').hidden=busy||canAdvance||batchApproved;
 byId('load-latest').disabled=busy;
 const syncBlocked=liveMode&&(!liveOnline||Boolean(pendingLiveState));
 byId('write-tag').hidden=busy||canAdvance;
 byId('write-tag').textContent=outcomes.get(selectedTag)==='Verified'?'Write & verify again':'Write & verify';
 byId('write-tag').disabled=busy||!supported||!valid||!batchApproved||syncBlocked;
 byId('verify-tag').disabled=busy||!supported||!valid||syncBlocked;
 byId('verify-tag').hidden=busy;
 byId('cancel-nfc').hidden=!busy;
 byId('queue').querySelectorAll('button').forEach(button=>button.disabled=busy);
}
function renderQueue(){
 byId('queue').replaceChildren();
 if(!phoneQueue)return;
 byId('queue-progress').textContent=Array.from(outcomes.values()).filter(value=>value==='Verified').length+' / '+phoneQueue.s.length+' verified';
 phoneQueue.s.forEach((slot,index)=>{
  const button=document.createElement('button'),sample=document.createElement('span'),caption=document.createElement('span');
  sample.className='small-swatch';sample.style.setProperty('--swatch',drafts.get(index)?.colour||'#'+slot.c);sample.setAttribute('aria-hidden','true');
  caption.textContent='Colour '+slot.n+' · '+(outcomes.get(index)||'Ready');button.append(sample,caption);button.type='button';button.setAttribute('aria-pressed',String(index===selectedTag));
  button.onclick=()=>{if(nfcOperation)return;selectedTag=index;renderSelection()};byId('queue').append(button);
 });
}
function renderSelection(){
 byId('writer').hidden=!phoneQueue;byId('empty-state').hidden=Boolean(phoneQueue);
 if(!phoneQueue)return;
 const slot=phoneQueue.s[selectedTag],draft=drafts.get(selectedTag)||{colour:'#'+slot.c,min:'',max:''};
 byId('project-name').textContent=phoneQueue.p||'Selected print';byId('spool-name').textContent=slot.l||'Selected filament';
 byId('spool-finish').textContent='Library finish: '+slot.f+' · colour '+slot.n;
 byId('profile-name').textContent='Generic '+slot.m+' · Basic';
 byId('tag-colour').value=draft.colour;byId('temp-min').value=draft.min;byId('temp-max').value=draft.max;
 byId('confirm-tag').checked=batchApproved;byId('nfc-status').textContent=outcomes.get(selectedTag)==='Verified'?'This selection’s tag contents were verified during this visit.':'Hold your chosen tag against the phone when ready.';
 renderQueue();setPhase(outcomes.get(selectedTag)==='Verified'?'verified':'ready');
}
function installQueue(value){
 if(nfcOperation)nfcOperation.abort();
 phoneQueue=FilamentNfc.validate(value);selectedTag=0;batchApproved=false;drafts.clear();outcomes.clear();
 try{if(!liveMode)localStorage.setItem(queueKey,JSON.stringify(phoneQueue))}catch{byId('link-status').textContent='Selection loaded for this visit; this browser could not save it.'}
 renderSelection();
}
function loadHash(){
 if(!location.hash.startsWith('#queue='))return false;
 try{const selection=FilamentNfc.decode(location.hash.slice(7));liveMode=false;pendingLiveState=null;installQueue(selection);showSnapshotStatus();history.replaceState(null,'',location.pathname+location.search)}catch(error){phoneQueue=null;renderSelection();byId('link-status').textContent=error.message}
 return true;
}
function saveDraft(){
 if(!phoneQueue||nfcOperation)return;
 drafts.set(selectedTag,{colour:byId('tag-colour').value,min:byId('temp-min').value,max:byId('temp-max').value});
 outcomes.delete(selectedTag);byId('nfc-status').textContent='Tag data updated.';renderQueue();setPhase('ready');
}
function operationError(error,writing){
 const prefix=writing?'Write not confirmed. Use Check an existing tag before retrying. ':'Verification not completed. ';
 if(error.name==='AbortError')return prefix+'Cancelled or timed out; hold the tag steady and try again.';
 if(error.name==='NotAllowedError'||error.name==='SecurityError')return prefix+'Allow NFC access in Android Chrome and keep this page in the foreground.';
 if(error.name==='NotSupportedError')return prefix+'Use a writable NTAG215/216 tag with NFC enabled. Locked or incompatible tags cannot be written.';
 if(error.name==='NotReadableError'||error.name==='NetworkError')return prefix+'Check NFC is enabled and hold only one compatible tag against the phone.';
 return prefix+(error.message||'Check your phone and tag, then retry.');
}
async function performNfc(writing){
 if(nfcOperation||!phoneQueue)return;
 if(liveMode&&(!liveOnline||pendingLiveState)){byId('nfc-status').textContent='Load the latest synced batch before writing.';return}
 if(deviceSupport()){byId('nfc-status').textContent=deviceSupport();return}
 if(writing&&!batchApproved){byId('nfc-status').textContent='Approve this batch once before writing its tags.';return}
 let expected;try{expected=currentPayload()}catch(error){byId('form-error').textContent=error.message;return}
 const controller=new AbortController(),slotIndex=selectedTag;let reader,writeCompleted=false,readyToVerify=!writing;
 nfcOperation=controller;setPhase(writing?'writing':'verifying');
 byId('nfc-status').textContent=writing?'Hold one tag against your phone. We’ll write once, then check it.':'Hold the tag against your phone to check its contents.';
 const timeout=setTimeout(()=>controller.abort(),60000);
 try{
  reader=new window.NDEFReader();
  const readBack=new Promise((resolve,reject)=>{
   controller.signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true});
   reader.onreading=event=>{if(readyToVerify)resolve(FilamentNfc.matches(event.message,expected))};
   reader.onreadingerror=()=>{if(readyToVerify)reject(new Error('Could not read this tag. Lift it and try Check an existing tag.'))};
  });
  readBack.catch(()=>{});
  const scanReady=reader.scan({signal:controller.signal}).then(()=>null,error=>error);
  if(writing){
   await reader.write(FilamentNfc.message(expected),{signal:controller.signal,overwrite:true});
   if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
   writeCompleted=true;readyToVerify=true;outcomes.set(slotIndex,'Written');setPhase('verifying');
   byId('nfc-status').textContent='Written. Lift and tap this same tag again to finish the automatic check.';
  }
  const scanError=await scanReady;if(scanError)throw scanError;
  const matched=await readBack;
  if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
  if(matched){
   outcomes.set(slotIndex,'Verified');setPhase('verified');
   byId('nfc-status').textContent='Matches '+expected.type+' · #'+expected.color_hex+'. Remove this tag. Ready for the next colour.';
  }else{
   outcomes.set(slotIndex,'Check tag');setPhase('error');
   byId('nfc-status').textContent=(writeCompleted?'Written, but this read-back does not match. ':'This tag does not match. ')+'Check the selected colour and tag. No automatic rewrite.';
  }
 }catch(error){
  outcomes.set(slotIndex,'Check tag');setPhase('error');
  byId('nfc-status').textContent=(writeCompleted?'Written, but not verified. ':'')+operationError(error,writing&&!writeCompleted);
 }finally{
  clearTimeout(timeout);if(reader){reader.onreading=null;reader.onreadingerror=null}controller.abort();
  if(nfcOperation===controller)nfcOperation=null;
  renderQueue();refreshControls();
 }
}
function showSnapshotStatus(){
 byId('sync-status').textContent='QR snapshot · not live. Use Live page for automatic updates.';
 byId('load-latest').hidden=true;byId('live-page').hidden=false;byId('refresh-sync').hidden=true;
}
function applyLive(state){
 pendingLiveState=null;liveSignature=JSON.stringify(state);
 byId('load-latest').hidden=true;byId('link-status').textContent='';
 if(state.batch?.state==='ready'){
  installQueue(state.batch.selection);
  byId('sync-status').textContent='Live · latest desktop colours loaded.';
 }else{
  phoneQueue=null;batchApproved=false;drafts.clear();outcomes.clear();renderSelection();
  const batch=state.batch;
  byId('sync-status').textContent=!batch?'Live · waiting for a project from desktop.':batch.state==='choosing'?batch.p+' · choose '+(batch.total-batch.chosen)+' more filament'+(batch.total-batch.chosen===1?'':'s')+' on desktop.':batch.state==='unsupported'?batch.p+' · use up to four colours with supported Generic PLA, PETG, ABS or TPU tags.':batch.p+' · no colours selected on desktop.';
 }
 refreshControls();
}
async function refreshLive(){
 if(!liveMode||liveFetching)return;
 liveFetching=true;
 try{
  const state=await FilamentSync.request();
  if(!liveMode)return;
  liveOnline=true;
  if(JSON.stringify(state)!==liveSignature){
   if(nfcOperation||batchApproved||drafts.size||outcomes.size){
    pendingLiveState=state;byId('sync-status').textContent='Updated desktop batch ready. Load it when this tag is finished.';
    byId('load-latest').hidden=false;
   }else applyLive(state);
  }else if(!pendingLiveState){if(phoneQueue)byId('sync-status').textContent='Live · up to date.';else applyLive(state)}
 }catch(error){
  if(liveMode){
   liveOnline=false;
   if(error.status===401){nfcOperation?.abort();phoneQueue=null;batchApproved=false;pendingLiveState=null;liveSignature='';drafts.clear();outcomes.clear();renderSelection()}
   byId('sync-status').textContent='Not connected. '+error.message+' Reopen this page after signing in.';
  }
 }finally{liveFetching=false;refreshControls()}
}
byId('load-latest').onclick=()=>{if(!nfcOperation&&pendingLiveState&&liveOnline)applyLive(pendingLiveState)};
byId('live-page').onclick=()=>{
 if(nfcOperation)return;
 liveMode=true;liveOnline=false;liveSignature='';pendingLiveState=null;phoneQueue=null;batchApproved=false;drafts.clear();outcomes.clear();
 byId('live-page').hidden=true;byId('refresh-sync').hidden=false;byId('link-status').textContent='';byId('sync-status').textContent='Checking latest desktop colours…';renderSelection();refreshLive();
};
byId('refresh-sync').onclick=refreshLive;
byId('tag-form').onsubmit=event=>{event.preventDefault();if(byId('tag-form').reportValidity())performNfc(true)};
byId('verify-tag').onclick=()=>performNfc(false);
byId('next-tag').onclick=()=>{if(nfcOperation)return;const next=nextUnverified();if(next<0)return;selectedTag=next;renderSelection();byId('tag-colour').focus({preventScroll:true})};
byId('show-help').onclick=()=>byId('help-dialog').showModal();
byId('close-help').onclick=()=>byId('help-dialog').close();
byId('cancel-nfc').onclick=()=>nfcOperation?.abort();
byId('confirm-tag').onchange=()=>{batchApproved=byId('confirm-tag').checked;refreshControls()};
for(const id of ['tag-colour','temp-min','temp-max'])byId(id).oninput=saveDraft;
byId('clear-queue').onclick=()=>{if(nfcOperation)return;try{localStorage.removeItem(queueKey)}catch{}phoneQueue=null;batchApproved=false;liveMode=false;pendingLiveState=null;drafts.clear();outcomes.clear();renderSelection();showSnapshotStatus();byId('link-status').textContent='Selection cleared on this phone. Use Live page to reload the latest batch.'};
byId('load-link').onclick=()=>{
 try{const url=new URL(byId('transfer-link').value.trim());if(url.origin!==location.origin||!url.pathname.endsWith('/nfc.html')||!url.hash.startsWith('#queue='))throw Error('Paste a transfer link from this Filament Library.');const selection=FilamentNfc.decode(url.hash.slice(7));liveMode=false;pendingLiveState=null;installQueue(selection);showSnapshotStatus();byId('transfer-link').value='';byId('link-status').textContent=''}catch(error){byId('link-status').textContent=error.message}
};
document.addEventListener('visibilitychange',()=>{if(document.hidden)nfcOperation?.abort()});
window.addEventListener('pagehide',()=>nfcOperation?.abort());
window.addEventListener('hashchange',()=>{if(!nfcOperation)loadHash()});
byId('device-help').textContent=deviceSupport();
if(!loadHash()&&liveMode)refreshLive();
if(typeof FilamentSync!=='undefined'){
 setInterval(()=>{if(!document.hidden)refreshLive()},5000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshLive()});
 window.addEventListener('online',refreshLive);
 window.addEventListener('offline',()=>{if(liveMode){liveOnline=false;byId('sync-status').textContent='Offline · reconnect to check for the latest batch.';refreshControls()}});
}
renderSelection();
