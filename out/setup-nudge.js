'use strict';
{
 const reminder=document.getElementById('setup-reminder'),dismiss=document.getElementById('setup-hide');
 function update(){
  reminder.hidden=dataset.status!=='complete'||SpoolSetup.preferences(dataset.setup).dismissed||SpoolSetup.steps.some(step=>step.id===new URL(location.href).searchParams.get('setupStep'));
  document.getElementById('setup-reminder-title').textContent=items.length?'Your library is ready. Make it yours.':'Welcome to Spool Studio';
  document.getElementById('setup-reminder-copy').textContent=items.length?'Try print matching, labels and optional connections at your own pace.':'Start with a few spools. The setup checklist will guide you through the rest.';
  dismiss.disabled=libraryBusy||libraryRefreshing;
 }
 dismiss.onclick=()=>saveLibraryAction({kind:'setup',expectedAccountKey:dataset.accountKey,setup:{dismissed:true}});
 window.SetupReminder={update};update();
 const action=new URL(location.href).searchParams.get('setup');
 if(dataset.status==='complete'&&['add','match','shelf'].includes(action)){
  if(action==='add')openSpoolForm();else document.getElementById(action+'-tab').click();
  const url=new URL(location.href);url.searchParams.delete('setup');history.replaceState(null,'',url.pathname+url.search+url.hash);
 }
}
