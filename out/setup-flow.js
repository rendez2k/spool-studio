'use strict';
{
 const step=SpoolSetup.steps.find(step=>step.id===new URL(location.href).searchParams.get('setupStep'));
 if(step){
  const banner=document.createElement('nav');banner.className='setup-flow';banner.setAttribute('aria-label','Setup progress');
  const copy=document.createElement('span');copy.textContent='Setup · '+step.title;
  const back=document.createElement('a');back.href='/welcome.html?step='+step.id+'#setup-'+step.id;back.textContent='Return to checklist';
  const leave=document.createElement('button');leave.type='button';leave.textContent='Exit setup';leave.onclick=()=>{banner.remove();const url=new URL(location.href);url.searchParams.delete('setupStep');history.replaceState(null,'',url.pathname+url.search+url.hash);globalThis.SetupReminder?.update?.()};
  banner.append(copy,back,leave);document.querySelector('main')?.prepend(banner);
 }
}
