'use strict';
(()=>{
 const panel=document.getElementById('app-install'),button=document.getElementById('install-app'),status=document.getElementById('install-status');
 const mode=document.getElementById('app-mode'),installedStatus=document.getElementById('installed-status');
 const check=document.getElementById('check-app-update'),updateStatus=document.getElementById('update-status'),reload=document.getElementById('reload-app');
 const release=document.querySelector?.('meta[name="app-release"]')?.content||'development';
 const version=document.getElementById('app-version'),origin=document.getElementById('app-origin');
 const standalone=window.matchMedia('(display-mode: standalone)');
 let installPrompt=null,installing=false,installationAccepted=false;
 const installed=()=>installationAccepted||standalone.matches||window.navigator.standalone===true;
 function update(){
  if(panel)panel.hidden=installed();
  if(button)button.disabled=installing;
  if(installedStatus)installedStatus.hidden=!installed();
  if(mode)mode.textContent=standalone.matches||window.navigator.standalone===true?'Running as an installed app':installationAccepted?'Installed — open from your app launcher':'Running in a browser';
 }
 if(version)version.textContent=release;
 if(origin)origin.textContent=window.location.host;
 window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();installPrompt=event;
  if(status)status.textContent='Install Spool Studio. Opens straight to your phone programmer.';
  update();
 });
 window.addEventListener('appinstalled',()=>{installPrompt=null;installationAccepted=true;update()});
 standalone.addEventListener('change',update);
 if(button)button.onclick=async()=>{
  if(installing)return;
  if(!installPrompt){
   if(status)status.textContent='In Android Chrome, open ⋮ → Add to home screen → Install. On iPhone, use Safari → Share → Add to Home Screen (NFC writing needs Android). If already installed, open it from your app launcher.';
   return;
  }
  installing=true;update();
  const prompt=installPrompt;installPrompt=null;
  try{
   await prompt.prompt();
   const choice=await prompt.userChoice;
   if(status)status.textContent=choice.outcome==='accepted'?'Installation requested. Look for Spool Studio on your home screen.':'Not installed. You can install later from Chrome’s menu.';
  }catch{if(status)status.textContent='Installation did not complete. Try Chrome’s Add to home screen menu.'}
  finally{installing=false;update()}
 };
 const registration='serviceWorker' in navigator&&window.isSecureContext
  ?navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(()=>{
   if(status)status.textContent='App setup could not finish. Reconnect and refresh before installing.';
   return null;
  }):Promise.resolve(null);
 if(check)check.onclick=async()=>{
  if(check.disabled)return;
  check.disabled=true;reload.hidden=true;updateStatus.textContent='Checking for updates…';
  try{
   const response=await fetch('/app-release.json',{cache:'no-store',credentials:'same-origin'});
   if(!response.ok)throw Error('Update check failed.');
   const latest=await response.json();
   if(!/^[a-f0-9]{12}$/.test(latest.version))throw Error('Invalid release.');
   const worker=await registration;
   if(worker)await worker.update();
   const newer=latest.version!==release;
   reload.hidden=!newer;
   updateStatus.textContent=(newer?'A newer build is available. Refresh this page when ready.':'You’re on the latest app build.')+(worker?.waiting||worker?.installing?' An app service update is also pending. Finish any scans, then close all Spool Studio windows and reopen.':'');
  }catch{updateStatus.textContent='Could not check for updates. Reconnect and try again; nothing has been changed.'}
  finally{check.disabled=false}
 };
 if(reload)reload.onclick=()=>window.location.reload();
 update();
})();
