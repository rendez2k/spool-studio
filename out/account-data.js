'use strict';
{
 const button=document.getElementById('account-export'),status=document.getElementById('account-export-status');
 let pending=false,cancelled=false;
 function account(){try{return JSON.parse(document.getElementById('auth-account')?.textContent||'{}').userId||''}catch{return ''}}
 window.addEventListener('pagehide',()=>{cancelled=true});
 if(button)button.onclick=async()=>{
  if(pending)return;
  const owner=account();
  if(!owner){status.textContent='Sign in to download your saved Spool Studio data.';return}
  pending=true;cancelled=false;button.disabled=true;status.textContent='Preparing your private data copy…';
  try{
   const response=await fetch('/api/account-export',{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
   if(response.status===401)throw Error('Your session expired. Sign in again before exporting.');
   if(!response.ok)throw Error('Could not prepare your export. Nothing changed; try again.');
   const value=await response.json();
   if(cancelled)return;
   if(value.accountKey!==owner||account()!==owner||value.format!=='spool-studio-account-export-v1'||value.origin!==location.origin)throw Error('The account or site changed. Refresh before exporting.');
   const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),link=document.createElement('a');
   link.href=url;link.download='spool-studio-data-'+new Date().toISOString().slice(0,10)+'.private.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   status.textContent='Private JSON download prepared. It includes all saved entries, used reels and the latest phone batch. Keep it somewhere safe.';
  }catch(error){if(!cancelled)status.textContent=error.message}finally{pending=false;button.disabled=false}
 };
}
