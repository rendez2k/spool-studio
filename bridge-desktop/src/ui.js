'use strict';
let pending=false;
const node=id=>document.getElementById(id);
function render(state){
 node('origin').textContent=state.origin||'Not connected';node('printer').textContent=state.printerUrl||'Not configured';node('spoolman').textContent=state.spoolmanUrl||'Not linked';
 node('badge').textContent=state.running?'Running':state.busy?'Working…':state.checked?'Ready · not running':'Not running';
 node('check-result').textContent=state.checkMessage||'';node('check-result').hidden=!state.checkMessage;
 node('check-result').dataset.state=state.checkState||'idle';
 node('check').textContent=state.checkState==='checking'?'Checking printer…':'Check connection · read-only';
 node('check').setAttribute('aria-busy',String(state.checkState==='checking'));
 node('message').textContent=state.message;node('last-contact').textContent=state.lastContact?'Last contact: '+new Date(state.lastContact).toLocaleTimeString():'';
 node('import').disabled=pending||state.running||state.busy;node('forget').disabled=pending||!state.configured||state.running||state.busy;
 node('check').disabled=pending||!state.configured||state.running||state.busy;
 node('start').disabled=pending||!state.checked||state.running||state.busy;
 node('stop').disabled=!state.running;node('website').disabled=pending;
}
for(const id of ['import','check','start','stop','forget','website','help','quit']){
 node(id).onclick=async()=>{
  pending=true;node('error').textContent='';
  try{const result=await window.bridge.action(id);pending=false;if(result.state)render(result.state);if(!result.ok)node('error').textContent=result.error}
  catch{pending=false;node('error').textContent='The desktop bridge could not complete the action. Close and reopen it if this continues.'}
 };
}
window.bridge.subscribe(render);
window.bridge.action('status').then(result=>render(result.state)).catch(()=>node('message').textContent='Could not load bridge status.');
