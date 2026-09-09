'use strict';
(()=>{
 const panel=document.getElementById('app-install'),button=document.getElementById('install-app'),status=document.getElementById('install-status');
 const standalone=window.matchMedia('(display-mode: standalone)');
 let installPrompt=null,installing=false,installationAccepted=false;
 const installed=()=>installationAccepted||standalone.matches||window.navigator.standalone===true;
 function update(){if(panel)panel.hidden=installed();if(button)button.disabled=installing}
 window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();installPrompt=event;
  if(status)status.textContent='Open straight to your phone programmer.';
  update();
 });
 window.addEventListener('appinstalled',()=>{installPrompt=null;installationAccepted=true;update()});
 standalone.addEventListener('change',update);
 if(button)button.onclick=async()=>{
  if(installing)return;
  if(!installPrompt){
   status.textContent='In Android Chrome, open ⋮ → Add to home screen → Install. If you only see a shortcut, refresh this signed-in page and try again.';
   return;
  }
  installing=true;update();
  const prompt=installPrompt;installPrompt=null;
  try{
   await prompt.prompt();
   const choice=await prompt.userChoice;
   status.textContent=choice.outcome==='accepted'?'Installation requested. Look for Filaments on your home screen.':'Not installed. You can install later from Chrome’s menu.';
  }catch{status.textContent='Installation did not complete. Try Chrome’s Add to home screen menu.'}
  finally{installing=false;update()}
 };
 if('serviceWorker' in navigator&&window.isSecureContext){
  navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(()=>{
   if(status)status.textContent='App setup could not finish. Reconnect and refresh this signed-in page before installing.';
  });
 }
 update();
})();
