'use strict';
function windowsStartup(app,platform=process.platform,executable=process.execPath){
 const supported=platform==='win32'&&app.isPackaged;
 const options={path:executable,args:['--startup'],name:'Spool Studio Bridge'};
 function status(){
  if(!supported)return {supported:false,enabled:false,registered:false,message:'Windows startup is available in the installed Windows app.'};
  try{
   const settings=app.getLoginItemSettings({...options,path:'"'+executable+'"'});
   const entry=settings.launchItems?.find(item=>item.name===options.name&&item.scope==='user');
   const registered=Boolean(entry);
   const enabled=registered&&entry.enabled===true;
   return {supported:true,enabled,registered,message:registered&&!enabled?'Windows has disabled this startup item. Enable Spool Studio Bridge in Windows Startup apps.':enabled?'Starts in the tray when you sign in to Windows and reconnects automatically.':'Off — start the bridge manually.'};
  }catch{return {supported:false,enabled:false,registered:false,message:'Could not read Windows startup settings. No setting was changed.'}}
 }
 function set(enabled){
  if(typeof enabled!=='boolean'||!supported)throw Error('Windows startup is unavailable.');
  app.setLoginItemSettings({...options,openAtLogin:enabled,enabled});
  const result=status();
  if(!result.supported||result.enabled!==enabled||result.registered!==enabled)throw Error('Windows did not confirm the startup change.');
  return result;
 }
 return {status,set};
}
module.exports={windowsStartup};
