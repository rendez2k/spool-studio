'use strict';
let libraryBusy=false,libraryRefreshing=false,editingSpoolId=null,editingRevision=null,pendingLibraryRequest=null;
function libraryControls(){
 const signedIn=Boolean(dataset.accountKey);
 $('account-link').textContent=signedIn?'Sign out':'Sign in with ChatGPT';
 $('account-link').href=signedIn?'/signout-with-chatgpt?return_to=%2F':'/signin-with-chatgpt?return_to=%2F';
 $('account-label').textContent=signedIn?'Your private library':'Sign in for your own library';
 $('add-spool').disabled=libraryBusy||dataset.status!=='complete';
 $('match-files').disabled=libraryBusy||dataset.status!=='complete';
 $('nfc-sync').disabled=libraryBusy||dataset.status!=='complete';
 $('save-spool').disabled=libraryBusy||Boolean(window.SpoolAssist?.busy());
 $('close-spool').disabled=libraryBusy;
 $('refresh-library').hidden=!signedIn;
 $('refresh-library').disabled=libraryBusy||libraryRefreshing;
 document.querySelectorAll('[data-use],[data-edit]').forEach(button=>button.disabled=libraryBusy);
 window.SpoolAssist?.controls();
 window.CollectionTools?.controls();
 window.SetupReminder?.update();
 window.MobileEntry?.resume();
}
function applyLibrary(value){
 if(value.accountKey!==dataset.accountKey){
  window.SpoolAssist?.clear();
  releaseMatchPreviews(matchProjects);matchProjects=null;matchReport=[];matchSyncEnabled=false;lastUsageChange=null;pendingLibraryRequest=null;
  $('nfc-transfer').classList.add('hidden');$('nfc-share-link').value='';$('nfc-qr').replaceChildren();$('spool-dialog').close();$('spool-form').reset();editingSpoolId=null;
 }
 const incoming=value.items||[];items.splice(0,items.length,...incoming);
 Object.assign(dataset,value,{items});
 used=Object.fromEntries(items.filter(row=>row.used).map(row=>[row.id,true]));
 for(const key of ['brand','material','colour']){
  const selected=$(key).value;$(key).replaceChildren();
  const all=document.createElement('option');all.value='';all.textContent='All '+(key==='colour'?'colours':key+'s');$(key).append(all);
  [...new Set(items.map(row=>row[key]||'Unknown'))].sort().forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=value;$(key).append(option)});
  $(key).value=[...$(key).options].some(option=>option.value===selected)?selected:'';
 }
 render(false);libraryControls();
}
async function libraryRequest(method='GET',body){
 const response=await fetch('/api/library',{method,credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 let value;try{value=await response.json()}catch{throw Error('Could not read your library. Refresh this signed-in page.')}
 if(!response.ok){const error=Error(value.error||'Library unavailable.');error.status=response.status;throw error}
 return value;
}
function lostLibrarySession(){
 applyLibrary({status:'signedout',items:[],accountKey:'',revision:0,notice:'',coverage:''});
 $('library-status').textContent='Please sign in again to see your private library.';
}
async function refreshLibrary(){
 if(libraryBusy||libraryRefreshing||!dataset.accountKey)return;
 libraryRefreshing=true;libraryControls();
 try{applyLibrary(await libraryRequest());$('library-status').textContent='Library up to date.'}
 catch(error){if(error.status===401)lostLibrarySession();else $('library-status').textContent=error.message}
 finally{libraryRefreshing=false;libraryControls()}
}
async function saveLibraryAction(command){
 if(libraryBusy||dataset.status!=='complete')return false;
 libraryBusy=true;libraryControls();$('spool-error').textContent='';
 const baseRevision=command.kind==='edit'?editingRevision:dataset.revision;
 const fingerprint=JSON.stringify({command,baseRevision});
 const body=pendingLibraryRequest?.fingerprint===fingerprint?pendingLibraryRequest.body:{...command,baseRevision,requestId:crypto.randomUUID()};
 pendingLibraryRequest={fingerprint,body};
 $('library-status').textContent='Saving to your library…';
 try{
  applyLibrary(await libraryRequest('POST',body));pendingLibraryRequest=null;
  $('library-status').textContent='Saved to your private library.';return true;
 }catch(error){
  const message=error.status===409&&command.kind==='edit'?'This entry changed elsewhere. Your form is kept; close and reopen it to review the latest details.':error.message;
  if(error.status===401)lostLibrarySession();else {$('library-status').textContent=message;$('spool-error').textContent=message}
  if(error.status===409)pendingLibraryRequest=null;
  return false;
 }finally{libraryBusy=false;libraryControls()}
}
function fillSpoolForm(row){
 editingSpoolId=row?.id||null;editingRevision=dataset.revision;
 $('spool-form').reset();$('spool-form').hidden=false;$('spool-entry-picker').hidden=true;
 $('spool-dialog-title').textContent=row?'Edit filament':'Add spools';
 for(const key of ['brand','product','colour','notes'])$('spool-'+key).value=row?.[key]||'';
 $('spool-material').value=row?.material||'PLA';
 $('spool-finish').value=row?.finish||FilamentMatcher.finish(row?.product||'standard');
 $('spool-hex').value=row?.hex||'#EF8D34';$('spool-sample').value=$('spool-hex').value;
 $('spool-count').value=row?(row.spools??''):1;$('spool-weight').value=row?(row.weightGrams??''):1000;
 const price=typeof SpoolCost!=='undefined'?SpoolCost.purchase(row):null;
 $('spool-cost').value=price?Math.round(price.amount*100)/100:'';$('spool-currency').value=price?.currency||row?.costCurrency||'GBP';
 $('spool-date').value=row?.date||new Date().toLocaleDateString('en-CA');
 $('spool-packaging').value=row?packaging(row):'spooled';$('spool-error').textContent='';
 $('save-spool').textContent=row?'Save changes':'Add to library';
 window.SpoolAssist?.reset(row);
 window.ColourForm?.reset(row);
}
function openSpoolForm(id){
 if(libraryBusy||dataset.status!=='complete')return;
 const entry=displayed.concat(displayed.flatMap(row=>row.variants||[])).find(row=>row.id===id);
 if(entry?.members?.length>1){
  $('spool-dialog-title').textContent='Choose an entry to edit';$('spool-form').hidden=true;$('spool-entry-picker').hidden=false;$('spool-entry-picker').replaceChildren();
  for(const row of entry.members){const button=document.createElement('button');button.type='button';button.textContent=row.brand+' · '+row.colour+' · '+rollText(row)+' · '+date(row.date);button.onclick=()=>fillSpoolForm(row);$('spool-entry-picker').append(button)}
 }else fillSpoolForm(items.find(row=>row.id===id));
 $('spool-dialog').showModal();
}
$('add-spool').onclick=()=>openSpoolForm();
$('close-spool').onclick=()=>{if(!libraryBusy)$('spool-dialog').close()};
$('spool-dialog').addEventListener('cancel',event=>{if(libraryBusy)event.preventDefault()});
$('spool-sample').oninput=()=>{$('spool-hex').value=$('spool-sample').value.toUpperCase()};
$('spool-hex').oninput=()=>{if(/^#[\da-f]{6}$/i.test($('spool-hex').value))$('spool-sample').value=$('spool-hex').value};
$('spool-form').onsubmit=async event=>{
 event.preventDefault();if(window.SpoolAssist?.busy()||!$('spool-form').reportValidity())return;
 const spool={};for(const key of ['brand','product','material','finish','colour','hex','packaging','date','notes'])spool[key]=$('spool-'+key).value;
 if(window.ColourForm)spool.hexMode=window.ColourForm.mode();
 if(window.SpoolAssist){try{Object.assign(spool,window.SpoolAssist.fields())}catch(error){$('spool-error').textContent=error.message;return}}
 spool.spools=$('spool-count').value===''?null:Number($('spool-count').value);
 spool.weightGrams=$('spool-weight').value===''?null:Number($('spool-weight').value);
 spool.costPerRoll=$('spool-cost').value===''?null:Number($('spool-cost').value);spool.costCurrency=$('spool-currency').value;
 if(await saveLibraryAction({kind:editingSpoolId?'edit':'add',id:editingSpoolId,spool})){$('spool-dialog').close();if(!editingSpoolId)reset()}
};
$('refresh-library').onclick=refreshLibrary;
window.assignPermanentLabelIds=async expected=>{
 if(libraryBusy||dataset.status!=='complete'||!expected.accountKey||expected.accountKey!==dataset.accountKey||expected.revision!==dataset.revision)throw Error('The library changed or is busy. Refresh your label selection before assigning IDs.');
 if(!await saveLibraryAction({kind:'initialise-reels',expectedAccountKey:expected.accountKey}))throw Error($('library-status').textContent||'Could not assign IDs. Try again.');
};
window.addEventListener('focus',refreshLibrary);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshLibrary()});
libraryControls();
