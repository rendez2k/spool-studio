'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('bridge',{
 action:action=>ipcRenderer.invoke('bridge-action',action),
 subscribe:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('bridge-status',listener);return ()=>ipcRenderer.removeListener('bridge-status',listener)}
});
