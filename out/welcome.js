'use strict';
{
 const node=id=>document.getElementById(id);
 let library=null,busy=false,sequence=0,closed=false,pending=null;
 function controls(){node('setup-work').querySelectorAll('button,input').forEach(control=>control.disabled=busy);node('setup-retry').disabled=busy}
 async function request(body){
  const response=await fetch('/api/library',{method:body?'POST':'GET',credentials:'same-origin',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const value=await response.json();if(!response.ok)throw Object.assign(Error(value.error||'Could not load setup.'),{status:response.status});return value;
 }
 function clear(){library=null;pending=null;node('setup-work').hidden=true;node('setup-steps').replaceChildren()}
 function render(){
  const opened=new Set(Array.from(node('setup-steps').querySelectorAll('details[open]')).map(detail=>detail.dataset.step));
  const steps=SpoolSetup.status(library),returnStep=steps.find(step=>step.id===new URL(location.href).searchParams.get('step')),first=returnStep||steps.find(step=>step.state==='pending');
  const list=node('setup-steps');list.replaceChildren();
  for(const step of steps){
   const detail=document.createElement('details');detail.className='setup-step';detail.name='setup-checklist';detail.dataset.step=step.id;detail.id='setup-'+step.id;detail.open=opened.has(step.id)||(!opened.size&&first?.id===step.id);
   const summary=document.createElement('summary'),title=document.createElement('span'),state=document.createElement('span');title.className='step-title';title.textContent=step.title;state.className='step-state';state.textContent=step.state==='done'?(step.id==='library'?'Stock added':'Done · you confirmed'):step.state==='skipped'?'Skipped':step.id==='library'?'Start here':'Optional';summary.append(title,state);detail.append(summary);
   const body=document.createElement('div');body.className='step-body';const intro=document.createElement('p'),help=document.createElement('p');intro.textContent=step.intro;help.textContent=step.help;help.className='step-help';body.append(intro,help);
   if(step.id==='tracking'){
    const facts=document.createElement('p');facts.className='connection-facts';const mapped=(library.reels||[]).filter(reel=>Number.isSafeInteger(reel.spoolmanId)).length;
    facts.textContent=(library.bridge?.enabled?'Bridge key configured':'No bridge key configured')+' · '+mapped+' linked reels. '+(library.bridge?.lastSync?'A bridge sync has been received; this does not prove print consumption.':'No bridge sync received yet.');body.append(facts);
   }
   const actions=document.createElement('div');actions.className='setup-actions';
   step.links.forEach(([label,href],index)=>{const link=document.createElement('a');link.textContent=label;const destination=new URL(href,location.href);destination.searchParams.set('setupStep',step.id);link.href=destination.pathname+destination.search+destination.hash;link.className=index?'setup-secondary':'setup-primary';actions.append(link)});body.append(actions);
   if(step.id!=='library'){
    const confirmations=document.createElement('div');confirmations.className='setup-confirmation';
    for(const [label,value] of step.state==='pending'?[[step.confirmation,'done'],['Skip for now','skipped']]:[['Revisit this step','pending']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>save({step:step.id,state:value});confirmations.append(button)}body.append(confirmations);
   }
   detail.append(body);list.append(detail);
  }
  const done=steps.filter(step=>step.state==='done').length,skipped=steps.filter(step=>step.state==='skipped').length;
  node('setup-progress').textContent=done+' of '+steps.length+' done'+(skipped?' · '+skipped+' skipped':'')+(done+skipped===steps.length?' · You’re ready to explore.':'');
  node('setup-dismiss').checked=SpoolSetup.preferences(library.setup).dismissed;node('setup-work').hidden=false;
 }
 async function load(){
  if(busy||closed)return;const token=++sequence;busy=true;controls();node('setup-status').textContent='Checking your setup…';
  try{const value=await request();if(closed||token!==sequence)return;if(library?.accountKey!==value.accountKey){clear()}library=value;render();node('setup-login').hidden=true;node('setup-retry').hidden=true;node('setup-status').textContent='Your checklist is up to date.'}
  catch(error){if(closed||token!==sequence)return;clear();node('setup-status').textContent=error.status===401?'Sign in to start your own checklist.':error.message;node('setup-login').hidden=error.status!==401;node('setup-retry').hidden=error.status===401}
  finally{if(!closed&&token===sequence){busy=false;controls()}}
 }
 async function save(change){
  if(busy||!library||closed)return;busy=true;controls();const account=library.accountKey,token=++sequence;
  const signature=JSON.stringify({change,account,revision:library.revision});
  if(pending?.signature!==signature)pending={signature,body:{kind:'setup',expectedAccountKey:account,baseRevision:library.revision,requestId:crypto.randomUUID(),setup:change}};
  node('setup-status').textContent='Saving checklist…';
  try{const value=await request(pending.body);if(closed||token!==sequence)return;if(value.accountKey!==account)throw Object.assign(Error('The account changed. Reload your checklist.'),{status:401});library=value;pending=null;render();if(change.step)node('setup-steps').querySelector('[data-step="'+change.step+'"] summary')?.focus();node('setup-status').textContent='Checklist saved. No stock or connections changed.';node('setup-retry').hidden=true}
  catch(error){if(closed||token!==sequence)return;if(error.status===401){clear();node('setup-login').hidden=false}else if(error.status===409){pending=null;clear();node('setup-retry').hidden=false}else{node('setup-dismiss').checked=SpoolSetup.preferences(library.setup).dismissed}node('setup-status').textContent=error.message}
  finally{if(!closed&&token===sequence){busy=false;controls()}}
 }
 node('setup-refresh').onclick=load;node('setup-retry').onclick=load;node('setup-dismiss').onchange=()=>save({dismissed:node('setup-dismiss').checked});
 window.addEventListener('focus',load);window.addEventListener('pagehide',()=>{closed=true;sequence++});window.addEventListener('pageshow',()=>{if(closed){closed=false;busy=false;load()}});load();
}
