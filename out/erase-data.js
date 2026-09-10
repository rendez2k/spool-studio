'use strict';
{
 const node=id=>document.getElementById(id),review=node('erase-review'),form=node('erase-form'),status=node('erase-status');
 let snapshot=null,busy=false,leaving=false;
 function account(){try{return JSON.parse(node('auth-account')?.textContent||'{}').userId||''}catch{return ''}}
 function controls(){review.disabled=busy;node('erase-confirmation').disabled=busy;node('erase-cancel').disabled=busy;node('erase-submit').disabled=busy||!snapshot||node('erase-confirmation').value!=='ERASE MY SAVED DATA'}
 function reset(){snapshot=null;form.hidden=true;node('erase-confirmation').value='';controls()}
 async function result(response){if(response.status===401)throw Error('Sign in again before erasing saved data.');const value=await response.json();if(!response.ok)throw Error(value.error||'Erasure was not confirmed. Refresh and check your data.');return value}
 if(review){
  review.onclick=async()=>{
   if(busy)return;reset();const owner=account();if(!owner){status.textContent='Sign in before reviewing data erasure.';return}
   busy=true;leaving=false;controls();status.textContent='Checking your saved records…';
   try{
    const value=await result(await fetch('/api/account-export',{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)}));
    if(leaving)return;
    if(value.accountKey!==owner||account()!==owner||value.origin!==location.origin||value.format!=='spool-studio-account-export-v1')throw Error('The account or site changed. Refresh before continuing.');
    snapshot={expectedAccountKey:owner,libraryRevision:value.library.revision,phoneRevision:value.phoneBatch?.revision??0,requestId:crypto.randomUUID()};
    node('erase-summary').textContent=value.library.items.length+' saved entries and '+(value.library.reels?.length||0)+' physical spool records, plus '+(value.phoneBatch?'the saved phone batch':'no saved phone batch')+'.';
    form.hidden=false;status.textContent='Review the scope, then type the confirmation. Nothing has been erased.';
   }catch(error){if(!leaving)status.textContent=error.message}finally{busy=false;controls();if(!leaving&&!form.hidden)node('erase-confirmation').focus()}
  };
  node('erase-confirmation').oninput=controls;
  node('erase-cancel').onclick=()=>{if(busy)return;reset();status.textContent='Cancelled. Your saved data is unchanged.';review.focus()};
  form.onsubmit=async event=>{
   event.preventDefault();if(busy||!snapshot||node('erase-confirmation').value!=='ERASE MY SAVED DATA')return;
   if(account()!==snapshot.expectedAccountKey){reset();status.textContent='Your account changed. Review again before continuing.';return}
   busy=true;controls();status.textContent='Erasing saved application data…';
   try{
    const response=await fetch('/api/account-data/erase',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json'},body:JSON.stringify({...snapshot,confirmation:node('erase-confirmation').value})});
    if(response.status===409){reset();throw Error('Your account or saved data changed. Review again before erasing.');}
    const value=await result(response);if(leaving)return;
    if(value.accountKey!==snapshot.expectedAccountKey||account()!==snapshot.expectedAccountKey||value.cleared!==true)throw Error('Erasure was not confirmed for this account. Refresh and check your data.');
    reset();status.textContent='Saved library and phone batch erased; bridge access revoked. Your login remains. Close old app tabs and clear local phone selections separately. Downloads, NFC tags and provider backups are not erased by this action.';review.focus();
   }catch(error){if(!leaving)status.textContent=error.message}finally{busy=false;controls();if(!leaving&&form.hidden)review.focus()}
  };
  window.addEventListener('pagehide',()=>{leaving=true;snapshot=null});controls();
 }
}
