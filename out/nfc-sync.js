'use strict';
const FilamentSync=(()=>{
 async function request(method='GET',value){
  const response=await fetch('/api/phone-batch',{method,credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000),headers:value?{'Content-Type':'application/json'}:{},body:value?JSON.stringify(value):undefined});
  let data;try{data=await response.json()}catch{throw Error('Sync unavailable. Sign in on this page and try again.')}
  if(!response.ok){const error=Error(data.error||'Sync unavailable.');error.status=response.status;throw error}
  return data;
 }
 function publisher(status){
  let revision=null,pending=null,inFlight=false,timer=null,conflict=false,lastSaved='',retry=null;
  let initializing=request().then(state=>{revision=state.revision;lastSaved=JSON.stringify(state.batch)}).catch(()=>{});
  async function flush(){
   if(inFlight||!pending||conflict)return;
   inFlight=true;
   const batch=pending;
   try{
    await initializing;
    if(revision===null){const state=await request();revision=state.revision;lastSaved=JSON.stringify(state.batch)}
    if(JSON.stringify(batch)===lastSaved){if(pending===batch)pending=null;status('Synced to your saved phone page.');return}
    status('Syncing phone colours…');
    const body=retry&&JSON.stringify(retry.batch)===JSON.stringify(batch)?retry:{baseRevision:revision,requestId:crypto.randomUUID(),batch};
    retry=body;
    const saved=await request('PUT',body);
    revision=saved.revision;lastSaved=JSON.stringify(saved.batch);retry=null;
    if(pending===batch)pending=null;
    status(batch.state==='ready'?'Synced · open your saved phone page.':'Synced · finish choosing filaments on desktop.');
   }catch(error){
    if(error.status===409){conflict=true;retry=null;status(error.message+' Use Sync to phone.')}
    else status('Not synced. '+error.message+' Click Sync to phone to retry.');
   }finally{
    inFlight=false;
    if(pending&&pending!==batch&&!conflict)void flush();
   }
  }
  return {
   queue(batch){pending=batch;clearTimeout(timer);timer=setTimeout(flush,400)},
   async publish(batch){
    if(inFlight){pending=batch;return}
    clearTimeout(timer);
    if(conflict){try{const state=await request();revision=state.revision;lastSaved=JSON.stringify(state.batch);conflict=false}catch(error){status(error.message);return}}
    pending=batch;await flush();
   },
  };
 }
 return {request,publisher};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=FilamentSync;
