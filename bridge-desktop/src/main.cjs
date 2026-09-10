'use strict';
const {app,BrowserWindow,ipcMain,dialog,shell,Tray,Menu,nativeImage,safeStorage,protocol,net,session}=require('electron');
const path=require('node:path'),fs=require('node:fs/promises'),{pathToFileURL}=require('node:url');
const {BridgeController}=require('./controller.cjs'),{vault}=require('./vault.cjs'),core=require('./bridge.cjs');
const {windowsStartup}=require('./startup.cjs');
const page='bridge://app/index.html';
protocol.registerSchemesAsPrivileged([{scheme:'bridge',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
let window,tray,controller,storage,quitting=false,importing=false;
if(!app.requestSingleInstanceLock())app.quit();
else{
 app.on('second-instance',()=>{window?.show();window?.focus()});
 app.on('activate',()=>window?.show());
 app.on('window-all-closed',()=>{});
 app.on('before-quit',event=>{
  quitting=true;
  if(controller?.busy){event.preventDefault();quitting=true;controller.stop();window?.show()}
 });
 app.whenReady().then(async()=>{
  if(process.argv.includes('--smoke-test')){console.log(JSON.stringify({app:app.getName(),version:app.getVersion(),packaged:app.isPackaged}));app.quit();return}
  protocol.handle('bridge',request=>{
   const url=new URL(request.url),allowed=['/index.html','/ui.css','/ui.js','/icon.png'];
   if(url.hostname!=='app'||!allowed.includes(url.pathname)||request.method!=='GET')return new Response('Not found',{status:404});
   return net.fetch(pathToFileURL(path.join(__dirname,url.pathname.slice(1))).href);
  });
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  const icon=nativeImage.createFromPath(path.join(__dirname,'icon.png'));
  window=new BrowserWindow({width:720,height:760,minWidth:540,minHeight:560,show:false,title:'Spool Studio Bridge',icon,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true}});
  window.removeMenu();window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  window.on('close',event=>{if(!quitting&&tray){event.preventDefault();window.hide()}});
  tray=new Tray(icon.resize({width:20,height:20}));tray.setToolTip('Spool Studio Bridge — stopped');
  tray.on('click',()=>{window.show();window.focus()});
  const startup=windowsStartup(app);
  const snapshot=()=>({...controller.status(),startup:startup.status()});
  controller=new BridgeController(core,{notify:state=>{
   if(!window.isDestroyed())window.webContents.send('bridge-status',{...state,startup:startup.status()});
   tray.setToolTip('Spool Studio Bridge — '+(state.running?'running':state.reconnecting?'reconnecting':state.busy?'working':'stopped'));
   if(quitting&&!state.busy)app.quit();
  }});
  tray.setContextMenu(Menu.buildFromTemplate([{label:'Open Spool Studio Bridge',click:()=>window.show()},{label:'Stop bridge',click:()=>controller.stop()},{type:'separator'},{label:'Quit',click:()=>{quitting=true;controller.stop();app.quit()}}]));
  await fs.mkdir(app.getPath('userData'),{recursive:true});
  storage=vault(path.join(app.getPath('userData'),'printer-config.enc'),safeStorage);
  try{const saved=await storage.load();if(saved)controller.configure(saved)}catch{controller.message='Saved configuration could not be unlocked. Import it again on this device.'}
  function trusted(event){
   if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||event.senderFrame.url!==page)throw Error('Untrusted request.');
  }
  ipcMain.handle('bridge-action',async(event,action)=>{
   trusted(event);
   try{
    if(action==='status')return {ok:true,state:snapshot()};
    if(importing)throw Error('Finish choosing your configuration first.');
    if(action==='import'){
     if(controller.running||controller.busy||controller.reconnecting)throw Error('Stop the bridge before importing a configuration.');
     importing=true;
     try{
      const chosen=await dialog.showOpenDialog(window,{title:'Import private printer configuration',properties:['openFile'],filters:[{name:'Spool Studio configuration',extensions:['json']}]});
      if(!chosen.canceled){
       const filename=chosen.filePaths[0],stat=await fs.stat(filename);
       if(!stat.isFile()||stat.size>16384)throw Error('Choose a printer configuration JSON file under 16 KB.');
       const candidate=JSON.parse(await fs.readFile(filename,'utf8'));
       const validated=core.configuration(candidate);
       if(validated.origin!=='https://spool-studio.uk')throw Error('Choose a configuration downloaded from https://spool-studio.uk.');
       await storage.save(validated);controller.configure(validated);
      }
     }finally{importing=false}
    }else if(action==='check'){if(controller.reconnecting)throw Error('Stop automatic reconnect first.');await controller.check()}
    else if(action==='start'){if(controller.reconnecting)throw Error('Stop automatic reconnect first.');await controller.start()}
    else if(action==='stop')controller.stop();
    else if(action==='startup-enable'){startup.set(true);void controller.connectAutomatically()}
    else if(action==='startup-disable'){startup.set(false);controller.cancelReconnect()}
    else if(action==='forget'){
     if(controller.running||controller.busy||controller.reconnecting)throw Error('Stop the bridge first.');
     const choice=await dialog.showMessageBox(window,{type:'question',buttons:['Cancel','Remove configuration'],defaultId:0,cancelId:0,message:'Remove the saved configuration from this app?',detail:'This does not revoke the website key or delete your downloaded JSON file.'});
     if(choice.response===1){await storage.remove();controller.forget()}
    }else if(action==='website')await shell.openExternal('https://spool-studio.uk/printer.html');
    else if(action==='help')await shell.openExternal('https://spool-studio.uk/bridge.html');
    else if(action==='quit'){quitting=true;controller.stop();app.quit()}
    else throw Error('Unknown action.');
    return {ok:true,state:snapshot()};
   }catch{return {ok:false,error:action==='startup-enable'||action==='startup-disable'?'Windows could not confirm the startup setting. Try again or check Spool Studio Bridge in Windows Settings → Apps → Startup.':'Could not complete that action. Check the configuration, stop any active request, and try again.',state:snapshot()}}
  });
  await window.loadURL(page);
  const automatic=startup.status().enabled&&Boolean(controller.config);
  if(!automatic||!process.argv.includes('--startup'))window.show();
  if(automatic)void controller.connectAutomatically();
 });
}
