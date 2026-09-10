const {app}=require('electron');
const assert=require('node:assert/strict');
const {windowsStartup}=require('../bridge-desktop/src/startup.cjs');
app.setPath('userData',require('path').join(app.getPath('temp'),'spool-studio-startup-qa-'+process.pid));
app.whenReady().then(()=>{
 const name='Spool Studio Bridge QA '+process.pid;
 const executable='C:\\Program Files\\Spool Studio QA\\Spool Studio Bridge.exe';
 const native={isPackaged:true,getLoginItemSettings:options=>{const result=app.getLoginItemSettings(options);return {...result,launchItems:result.launchItems.filter(entry=>entry.name===name).map(entry=>({...entry,name:'Spool Studio Bridge'}))}},setLoginItemSettings:options=>app.setLoginItemSettings({...options,name})};
 const startup=windowsStartup(native,'win32',executable);
 let failure;
 try{
  assert.equal(startup.status().enabled,false);
  assert.equal(startup.set(true).enabled,true);
  app.setLoginItemSettings({path:executable,args:['--startup'],name,openAtLogin:true,enabled:false});
  assert.equal(startup.status().registered,true);assert.equal(startup.status().enabled,false);
  assert.equal(startup.set(true).enabled,true);
  assert.equal(startup.set(false).registered,false);
  console.log('Real Windows registry: spaced path, named entry, enable, OS-disable, re-enable and removal passed.');
 }catch(error){failure=error}
 finally{app.setLoginItemSettings({name,openAtLogin:false})}
 if(failure){console.error(failure);app.exit(1)}else app.quit();
});
