'use strict';
{
 const node=id=>document.getElementById(id);let library=null,state=null,channel=null,review=null,busy=false,secret='',pending=null,sequence=0,renderedTools='';
 const message=text=>node('printer-message').textContent=text;
 function invalidate(){review=null;pending=null;node('printer-confirm').hidden=true;node('printer-approve').checked=false;controls()}
 function selection(){
  const item=library?.items.find(item=>item.id===node('printer-item').value);if(!item)throw Error('Choose a library filament.');
  const reel=library.reels?.find(reel=>reel.id===node('printer-reel').value);
  return {itemId:item.id,reelId:reel?.id||null,linkSpoolman:node('printer-link').checked,spoolmanId:node('printer-link').checked?reel?.spoolmanId:0,profile:PrinterCore.profile(item)};
 }
 function controls(){
  const online=state?.enabled&&state?.seenAt&&Date.now()-state.seenAt<20000,active=['queued','executing'].includes(state?.request?.state);
  node('printer-status').textContent=!state?'Checking your connection…':!state.enabled?'Set up your local printer bridge to begin.':!online?'Bridge offline or status expired. Keep the bridge running on your local computer.':!state.status?.supported?'Connected, but the supported U1 metadata command is unavailable.':!state.status?.ready?'Connected. Changes are blocked while printing, paused, busy or in an unknown state.':'Bridge connected · printer idle';
  for(const id of ['printer-search','printer-item','printer-reel','printer-create','printer-revoke','printer-refresh'])node(id).disabled=busy||!library;
  const reel=library?.reels?.find(reel=>reel.id===node('printer-reel').value);
  node('printer-link').disabled=busy||!reel?.spoolmanId||!state?.status?.canLink;
  node('printer-review').disabled=busy||!online||!state.status?.ready||!state.status?.supported||channel===null||active||!node('printer-item').value;
  node('printer-send').disabled=node('printer-review').disabled||!review||Date.now()-review.seenAt>20000||!node('printer-approve').checked;
  node('printer-cancel').hidden=state?.request?.state!=='queued';node('printer-cancel').disabled=busy;
  node('printer-revoke').disabled=busy||!state?.enabled;node('printer-tools').querySelectorAll('button').forEach(button=>button.disabled=busy);
  node('printer-result').textContent=state?.request?'Tool '+state.request.tool+' · '+state.request.state+' — '+(state.request.message||({queued:'Waiting for the local bridge.',executing:'Sending and reading back. Do not repeat this request.'}[state.request.state]||'')):'Nothing sent yet.';
 }
 function populate(){
  const previous=node('printer-item').value,query=node('printer-search').value.trim().toLowerCase();node('printer-item').replaceChildren();
  for(const item of library?.items||[]){if(item.used||![item.brand,item.product,item.colour].join(' ').toLowerCase().includes(query))continue;const option=document.createElement('option');option.value=item.id;option.textContent=[item.colour,item.brand,item.product,item.date].join(' · ');node('printer-item').append(option)}
  if([...node('printer-item').options].some(option=>option.value===previous))node('printer-item').value=previous;
  reels();
 }
 function reels(){
  const previous=node('printer-reel').value;node('printer-reel').replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent='Material and colour only';node('printer-reel').append(empty);
  for(const reel of library?.reels||[]){if(reel.itemId!==node('printer-item').value||reel.used||reel.remainingGrams===0)continue;const option=document.createElement('option');option.value=reel.id;option.textContent='Spool #'+reel.number+(reel.spoolmanId?' · Spoolman '+reel.spoolmanId:' · not linked');node('printer-reel').append(option)}
  if([...node('printer-reel').options].some(option=>option.value===previous))node('printer-reel').value=previous;
  node('printer-link').checked=false;invalidate();try{const profile=selection().profile;node('printer-profile').style.setProperty('--filament','#'+profile.rgba.slice(0,6));node('printer-profile').textContent=[profile.vendor,profile.material,profile.subtype,'#'+profile.rgba.slice(0,6)].join(' · ')}catch(error){node('printer-profile').textContent=error.message}
 }
 async function api(path,body){
  const response=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const value=await response.json();if(!response.ok){if(response.status===401)clear();throw Error(value.error||'Could not confirm the printer request.')}return value;
 }
 function clear(){sequence++;renderedTools='';channel=null;library=null;state=null;secret='';review=null;pending=null;node('printer-work').hidden=true;node('printer-download').hidden=true;node('printer-tools').replaceChildren();node('printer-item').replaceChildren();node('printer-reel').replaceChildren();node('printer-profile').textContent='';node('printer-result').textContent='';node('printer-confirm').hidden=true;controls()}
 function renderStatus(){
  if(review&&(!state.status?.tools[channel]||!PrinterCore.same(review.before,state.status.tools[channel]))){invalidate();message('The tool changed. Review the new settings before sending.')}
  const signature=JSON.stringify([state.status?.tools,channel]);if(signature===renderedTools){controls();return}renderedTools=signature;node('printer-tools').replaceChildren();
  for(let index=0;index<4;index++){const tool=state.status?.tools[index],button=document.createElement('button');button.type='button';button.setAttribute('aria-pressed',String(index===channel));const title=document.createElement('strong');title.textContent='Tool '+(index+1);const text=document.createElement('span');text.textContent=tool?[tool.vendor,tool.material,tool.subtype,'#'+tool.rgba.slice(0,6),tool.spoolmanId?'Spoolman '+tool.spoolmanId:'No tracking assignment'].filter(Boolean).join(' · '):'Awaiting printer status';if(tool){const swatch=document.createElement('span');swatch.className='printer-tool-swatch';swatch.style.backgroundColor='#'+tool.rgba.slice(0,6);swatch.setAttribute('aria-hidden','true');button.append(swatch)}button.append(title,text);button.disabled=busy;button.onclick=()=>{channel=index;invalidate();renderStatus()};node('printer-tools').append(button)}controls();
 }
 async function refresh(full=false){
  if(busy||document.hidden)return;const current=++sequence;
  try{
   const next=await api('/api/printer');if(current!==sequence)return;
   if(library&&library.accountKey!==next.accountKey){clear();message('Account changed. Reload this page to choose from the new library.');return}
   if(!library||full){const selectedId=node('printer-item').value;const updated=await api('/api/library');if(current!==sequence)return;if(updated.accountKey!==next.accountKey){clear();throw Error('Account changed. Reload the page.')};library=updated;populate();const initial=new URLSearchParams(location.search).get('item');if(!selectedId&&initial&&library.items.some(item=>item.id===initial)){node('printer-item').value=initial;reels();const reelId=new URLSearchParams(location.search).get('reel');if(library.reels?.some(reel=>reel.id===reelId&&reel.itemId===initial&&!reel.used))node('printer-reel').value=reelId}}
   state=next;node('printer-work').hidden=false;node('printer-setup').open=!state.enabled;renderStatus();
  }catch(error){message(error.message);controls()}
 }
 async function action(body){
  if(busy||!library)return;const account=library.accountKey;busy=true;controls();
  try{
   const result=await api('/api/printer',{...body,expectedAccountKey:account,baseRevision:state?.revision||0,requestId:body.requestId||crypto.randomUUID()});
   if(result.accountKey!==account){clear();throw Error('Account changed. Nothing will be resubmitted.')}
   if(result.token){secret=result.token;node('printer-download').hidden=false;message('Key created. Download the private configuration on the bridge computer.')}else if(body.kind==='create')message('Key created, but its download was lost. Replace it to get a new configuration.');
   if(body.kind==='revoke'){secret='';node('printer-download').hidden=true;message('Printer key revoked. Already-sent commands cannot be recalled.')}
   if(body.kind==='send'){message('Request accepted. See Latest request for the result.');invalidate()}
   state=result;
  }catch(error){message(error.message+' Refresh status before taking further action.')}finally{busy=false;controls();await refresh()}
 }
 node('printer-search').oninput=populate;node('printer-item').onchange=reels;node('printer-reel').onchange=()=>{node('printer-link').checked=false;invalidate()};node('printer-link').onchange=invalidate;
 node('printer-refresh').onclick=()=>refresh(true);
 node('printer-review').onclick=()=>{
  if(node('printer-review').disabled)return;try{const chosen=selection(),before=state.status.tools[channel];if(chosen.linkSpoolman&&!library.reels.find(reel=>reel.id===chosen.reelId)?.spoolmanId)throw Error('Choose a linked physical reel.');review={...chosen,channel,before,seenAt:state.seenAt};pending=null;node('printer-before').textContent='Tool '+(channel+1)+' now: '+[before.vendor,before.material,before.subtype,'#'+before.rgba.slice(0,6)].join(' · ');node('printer-after').textContent='Change to: '+[chosen.profile.vendor,chosen.profile.material,chosen.profile.subtype,'#'+chosen.profile.rgba.slice(0,6)].join(' · ');node('printer-assignment').textContent=chosen.linkSpoolman?'Assign Spoolman '+library.reels.find(reel=>reel.id===chosen.reelId).spoolmanId+'. Check that this is the physical reel loaded in this tool.':before.spoolmanId?'Clear the current Spoolman '+before.spoolmanId+' assignment so consumption is not charged to the wrong reel.':'No Spoolman tracking assignment. Colour alone does not enable consumption tracking.';node('printer-confirm').hidden=false;node('printer-approve').checked=false;node('confirm-heading').focus();controls()}catch(error){message(error.message)}
 };
 node('printer-approve').onchange=controls;
 node('printer-send').onclick=()=>{if(node('printer-send').disabled)return;pending=pending||{kind:'send',...review,reviewed:true,requestId:crypto.randomUUID()};action(pending)};
 node('printer-create').onclick=()=>action({kind:'create'});node('printer-revoke').onclick=()=>action({kind:'revoke'});node('printer-cancel').onclick=()=>action({kind:'cancel',id:state.request.id});
 node('printer-download-button').onclick=()=>{
  if(!secret)return;try{const printer=new URL(node('printer-address').value);if(!['http:','https:'].includes(printer.protocol)||printer.origin!==node('printer-address').value)throw Error('Enter a local printer origin, without a path.');const config={origin:location.origin,token:secret,printerUrl:printer.origin,allowPrinterWrites:true};if(node('printer-spoolman-address').value)config.spoolmanUrl=node('printer-spoolman-address').value;const url=URL.createObjectURL(new Blob([JSON.stringify(config,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='spool-studio-printer.private.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('Private configuration downloaded. Run the read-only check before starting the bridge.')}catch(error){message(error.message)}
 };
 const timer=setInterval(()=>{controls();refresh()},5000);window.addEventListener('pagehide',()=>{clearInterval(timer);clear()});window.addEventListener('focus',()=>refresh());refresh(true);
}
