'use strict';
let pending=false;
const node=id=>document.getElementById(id);
function render(state){
 node('origin').textContent=state.origin||'Not connected';node('printer').textContent=state.printerUrl||'Not configured';node('spoolman').textContent=state.spoolmanUrl||'Not linked';
 node('badge').textContent=state.running?'Running':state.reconnecting?'Reconnecting…':state.busy?'Working…':state.checked?'Ready · not running':'Not running';
 node('check-result').textContent=state.checkMessage||'';node('check-result').hidden=!state.checkMessage;
 node('check-result').dataset.state=state.checkState||'idle';
 node('check').textContent=state.checkState==='checking'?'Checking printer…':'Check connection · read-only';
 node('check').setAttribute('aria-busy',String(state.checkState==='checking'));
 node('message').textContent=state.message;node('last-contact').textContent=state.lastContact?'Last contact: '+new Date(state.lastContact).toLocaleTimeString():'';
 node('import').disabled=pending||state.running||state.busy||Boolean(state.reconnecting);node('forget').disabled=pending||!state.configured||state.running||state.busy||state.reconnecting;
 node('check').disabled=pending||!state.configured||state.running||state.busy||Boolean(state.reconnecting);
 node('start').disabled=pending||!state.checked||state.running||state.busy||Boolean(state.reconnecting);
 node('stop').disabled=!state.running&&!state.reconnecting;node('website').disabled=pending;
 node('startup-option').hidden=!state.startup?.supported;
 node('startup').checked=Boolean(state.startup?.enabled);node('startup').disabled=pending;
 node('startup-status').textContent=state.startup?.message||'';
}
async function act(action){
 pending=true;node('error').textContent='';
 try{const result=await window.bridge.action(action);pending=false;if(result.state)render(result.state);if(!result.ok)node('error').textContent=result.error}
 catch{pending=false;node('error').textContent='The desktop bridge could not complete the action. Close and reopen it if this continues.'}
}
for(const id of ['import','check','start','stop','forget','website','help','quit']){
 node(id).onclick=()=>act(id);
}
node('startup').onchange=()=>act(node('startup').checked?'startup-enable':'startup-disable');
window.bridge.subscribe(render);
window.bridge.action('status').then(result=>render(result.state)).catch(()=>node('message').textContent='Could not load bridge status.');
