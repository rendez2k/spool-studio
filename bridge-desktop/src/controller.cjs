'use strict';
class BridgeController {
 constructor(core,options={}){
  this.core=core;this.delay=options.delay||5000;this.notify=options.notify||(()=>{});this.schedule=options.schedule||setTimeout;this.cancel=options.cancel||clearTimeout;
  this.config=null;this.running=false;this.busy=false;this.checked=false;this.timer=null;this.lastContact=null;this.checkState='idle';this.checkMessage='';this.message='Import your private printer configuration to begin.';
  this.reconnecting=false;this.reconnectTimer=null;this.reconnectEpoch=0;
 }
 status(){
  return {configured:Boolean(this.config),origin:this.config?.origin||'',printerUrl:this.config?.printerUrl||'',spoolmanUrl:this.config?.spoolmanUrl||'',running:this.running,busy:this.busy,reconnecting:this.reconnecting,checked:this.checked,lastContact:this.lastContact,checkState:this.checkState,checkMessage:this.checkMessage,message:this.message};
 }
 emit(){this.notify(this.status());return this.status()}
 configure(value){
  if(this.running||this.busy||this.reconnecting)throw Error('Stop the bridge before changing its configuration.');
  const config=this.core.configuration(value);
  if(config.origin!=='https://spool-studio.uk')throw Error('This desktop build connects only to https://spool-studio.uk.');
  this.config=config;this.checked=false;this.lastContact=null;this.checkState='idle';this.checkMessage='';this.message='Configuration loaded. Check the connection before starting.';return this.emit();
 }
 forget(){
  if(this.running||this.busy||this.reconnecting)throw Error('Stop the bridge before removing its configuration.');
  this.config=null;this.checked=false;this.lastContact=null;this.checkState='idle';this.checkMessage='';this.message='Configuration removed from this app. Revoke the key on the website to disable other copies.';return this.emit();
 }
 async check(){
  if(!this.config||this.busy||this.running)throw Error('Import a configuration and stop the bridge before checking.');
  this.busy=true;this.checked=false;this.checkState='checking';this.checkMessage='Checking your printer… No settings are being changed.';this.message=this.checkMessage;this.emit();
  try{
   const status=await this.core.inspectPrinter(this.config);
   this.checked=status.supported;this.lastContact=new Date().toISOString();
   this.checkState=!status.supported?'unsupported':status.ready?'ready':'busy';
   this.message=!status.supported?'Printer reached, but not supported. The required U1 firmware command is unavailable.':status.ready?'Check passed — printer connected and idle. You can start the bridge.':'Check passed — printer connected, but not idle. Settings changes stay blocked.';
  }catch{this.checkState='error';this.message='Connection failed — could not check the printer. Check its IP, Moonraker port, network and API key, then try again.'}
  finally{this.checkMessage=this.message;this.busy=false;this.emit()}
  return this.status();
 }
 async start(){
  if(!this.config||!this.checked||this.busy||this.running)throw Error('Run a successful connection check before starting.');
  this.running=true;this.message='Starting the bridge…';this.emit();await this.cycle();return this.status();
 }
 stop(){
  this.cancelAutomatic();
  this.running=false;if(this.timer!==null){this.cancel(this.timer);this.timer=null}
  this.message=this.busy?'Stopping after the current request finishes. Already-sent commands cannot be recalled.':'Stopped. No new requests will be taken.';return this.emit();
 }
 cancelAutomatic(){
  const pending=this.reconnecting;
  this.reconnecting=false;this.reconnectEpoch++;
  if(this.reconnectTimer!==null){this.cancel(this.reconnectTimer);this.reconnectTimer=null}
  return pending;
 }
 cancelReconnect(){
  if(this.cancelAutomatic())this.message='Automatic reconnect cancelled. Start manually when ready.';
  return this.emit();
 }
 async connectAutomatically(){
  if(!this.config||this.running||this.busy||this.reconnecting)return this.status();
  this.reconnecting=true;const epoch=++this.reconnectEpoch;this.emit();
  return this.attemptReconnect(epoch);
 }
 async attemptReconnect(epoch){
  if(!this.reconnecting||epoch!==this.reconnectEpoch)return this.status();
  await this.check();
  if(!this.reconnecting||epoch!==this.reconnectEpoch)return this.status();
  if(this.checked){this.reconnecting=false;return this.start()}
  if(this.checkState==='unsupported'){this.reconnecting=false;return this.emit()}
  this.message='Waiting for the printer or network. Retrying automatically in 30 seconds; Stop cancels reconnecting.';
  this.reconnectTimer=this.schedule(()=>{this.reconnectTimer=null;void this.attemptReconnect(epoch)},30000);
  return this.emit();
 }
 async cycle(){
  if(!this.running||this.busy)return;
  this.busy=true;this.emit();
  try{const message=await this.core.bridgeOnce(this.config);this.lastContact=new Date().toISOString();if(this.running)this.message=message}
  catch{if(this.running)this.message='Connection unavailable. Retrying safely; check the printer, internet connection and bridge key.'}
  finally{
   this.busy=false;
   if(this.running)this.timer=this.schedule(()=>{this.timer=null;void this.cycle()},this.delay);
   else this.message='Stopped. No new requests will be taken. Check the website for the result of any in-flight request.';
   this.emit();
  }
 }
}
module.exports={BridgeController};
