'use strict';
{
 const count=document.getElementById('community-rolls'),status=document.getElementById('community-status'),retry=document.getElementById('community-retry');
 let busy=false,closed=false;
 async function load(){
  if(busy||closed)return;busy=true;retry.hidden=true;count.textContent='—';status.textContent='Counting the community’s available rolls…';
  try{
   const response=await fetch('/api/community-stats',{credentials:'same-origin',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(response.status===401)throw Error('Sign in to see the community total.');
   if(!response.ok)throw Error('The community total is temporarily unavailable.');
   const value=await response.json();
   if(!Number.isSafeInteger(value.availableRolls)||value.availableRolls<0||!Number.isFinite(Date.parse(value.asOf)))throw Error('The community total is temporarily unavailable.');
   if(closed)return;
   count.textContent=new Intl.NumberFormat('en-GB').format(value.availableRolls);
   status.textContent='Across all Spool Studio accounts · checked '+new Date(value.asOf).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'});
  }catch(error){if(!closed){status.textContent=error.message;retry.hidden=false}}
  finally{busy=false}
 }
 if(count&&status&&retry){retry.onclick=load;window.addEventListener('pagehide',()=>{closed=true});load()}
}
