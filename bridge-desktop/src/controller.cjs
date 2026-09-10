'use strict';
class BridgeController {
 constructor(core,options={}){
  this.core=core;this.delay=options.delay||5000;this.notify=options.notify||(()=>{});this.schedule=options.schedule||setTimeout;this.cancel=options.cancel||clearTimeout;
  this.config=null;this.running=false;this.busy=false;this.checked=false;this.timer=null;this.lastContact=null;this.message='Import your private printer configuration to begin.';
 }
 status(){
  return {configured:Boolean(this.config),origin:this.config?.origin||'',printerUrl:this.config?.printerUrl||'',spoolmanUrl:this.config?.spoolmanUrl||'',running:this.running,busy:this.busy,checked:this.checked,lastContact:this.lastContact,message:this.message};
 }
 emit(){this.notify(this.status());return this.status()}
 configure(value){
  if(this.running||this.busy)throw Error('Stop the bridge before changing its configuration.');
  const config=this.core.configuration(value);
  if(config.origin!=='https://spool-studio.uk')throw Error('This desktop build connects only to https://spool-studio.uk.');
  this.config=config;this.checked=false;this.lastContact=null;this.message='Configuration loaded. Check the connection before starting.';return this.emit();
 }
 forget(){
  if(this.running||this.busy)throw Error('Stop the bridge before removing its configuration.');
  this.config=null;this.checked=false;this.lastContact=null;this.message='Configuration removed from this app. Revoke the key on the website to disable other copies.';return this.emit();
 }
 async check(){
  if(!this.config||this.busy||this.running)throw Error('Import a configuration and stop the bridge before checking.');
  this.busy=true;this.checked=false;this.message='Checking the printer without changing its settings…';this.emit();
  try{
   const status=await this.core.inspectPrinter(this.config);
   this.checked=status.supported;this.lastContact=new Date().toISOString();
   this.message=!status.supported?'Printer reached, but the required U1 firmware command is unavailable.':status.ready?'Printer reached and idle. You can start the bridge.':'Printer reached. You can start, but changes stay blocked while the printer is busy.';
  }catch{this.message='Could not reach the printer. Check its IP, Moonraker port, network and API key.'}
  finally{this.busy=false;this.emit()}
  return this.status();
 }
 async start(){
  if(!this.config||!this.checked||this.busy||this.running)throw Error('Run a successful connection check before starting.');
  this.running=true;this.message='Starting the bridge…';this.emit();await this.cycle();return this.status();
 }
 stop(){
  this.running=false;if(this.timer!==null){this.cancel(this.timer);this.timer=null}
  this.message=this.busy?'Stopping after the current request finishes. Already-sent commands cannot be recalled.':'Stopped. No new requests will be taken.';return this.emit();
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
