import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import Core from '../out/printer-core.js';
import {configuration} from '../scripts/printer-bridge.mjs';
const require=createRequire(import.meta.url),{BridgeController}=require('../bridge-desktop/src/controller.cjs'),{vault}=require('../bridge-desktop/src/vault.cjs');
const config={origin:'https://spool-studio.uk',printerUrl:'http://192.168.1.26',allowPrinterWrites:true,token:btoa('test-user')+'.'+crypto.randomUUID()+crypto.randomUUID()};
const snapshot=Core.snapshot({ready:true,supported:true,canLink:false,tools:Array.from({length:4},()=>({vendor:'Generic',material:'PLA',subtype:'Basic',rgba:'FFFFFFFF',spoolmanId:0,present:true}))});

test('normalized printer configurations can be imported, restored and polled again',()=>{
 for(const input of [config,{...config,printerApiKey:''},{...config,printerApiKey:'valid-local-key'}]){
  const normalized=configuration(input);
  assert.deepEqual(configuration(normalized),normalized);
  const controller=new BridgeController({configuration});
  controller.configure(normalized);assert.equal(controller.status().configured,true);
 }
 for(const printerApiKey of [null,42,'bad key','x'.repeat(201)])assert.throws(()=>configuration({...config,printerApiKey}));
});

test('desktop import and read-only check cannot send printer jobs or expose credentials',async()=>{
 let writes=0,checks=0;
 const controller=new BridgeController({configuration,inspectPrinter:async()=>{checks++;return snapshot},bridgeOnce:async()=>{writes++}});
 controller.configure(config);assert.equal(writes,0);
 assert(!JSON.stringify(controller.status()).includes(config.token));
 await assert.rejects(controller.start(),/successful connection check/);
 await controller.check();assert.equal(checks,1);assert.equal(writes,0);assert.equal(controller.status().checked,true);
 assert.throws(()=>controller.configure({...config,origin:'https://other.example'}),/only/);
 assert.throws(()=>controller.configure({...config,printerUrl:'http://example.com'}),/private/);
 assert.equal(controller.config.origin,'https://spool-studio.uk');
});

test('desktop loop is serial and stop waits for an in-flight request without retrying it',async()=>{
 let release,calls=0;const scheduled=[];
 const controller=new BridgeController({configuration,inspectPrinter:async()=>snapshot,bridgeOnce:()=>{calls++;return new Promise(resolve=>{release=resolve})}},{schedule:callback=>{scheduled.push(callback);return 1},cancel:()=>{}});
 controller.configure(config);await controller.check();const started=controller.start();
 assert.equal(calls,1);assert.equal(controller.status().busy,true);
 await assert.rejects(controller.start());assert.throws(()=>controller.configure(config));assert.throws(()=>controller.forget());
 controller.stop();assert.match(controller.status().message,/Stopping after/);
 release('Verified');await started;
 assert.equal(calls,1);assert.equal(scheduled.length,0);assert.equal(controller.running,false);assert.equal(controller.busy,false);
});

test('desktop reconnection schedules only one cycle and stop cancels the next poll',async()=>{
 let scheduled,cancelled=0,attempts=0;
 const controller=new BridgeController({configuration,inspectPrinter:async()=>snapshot,bridgeOnce:async()=>{attempts++;throw Error('secret '+config.token)}},{schedule:callback=>{scheduled=callback;return 7},cancel:timer=>{assert.equal(timer,7);cancelled++}});
 controller.configure(config);await controller.check();await controller.start();
 assert.equal(attempts,1);assert(scheduled);assert(!controller.status().message.includes(config.token));
 controller.stop();assert.equal(cancelled,1);await scheduled();assert.equal(attempts,1);
});

test('unsupported and unreachable printers cannot enable start',async()=>{
 for(const inspectPrinter of [async()=>({...snapshot,supported:false}),async()=>{throw Error('Unavailable')}]){
  const controller=new BridgeController({configuration,inspectPrinter});controller.configure(config);await controller.check();
  assert.equal(controller.checked,false);await assert.rejects(controller.start());assert.equal(controller.busy,false);
 }
});

test('connection feedback covers progress, ready, busy, unsupported and failure without stale success',async()=>{
 let resolveCheck;
 const controller=new BridgeController({configuration,inspectPrinter:()=>new Promise(resolve=>{resolveCheck=resolve})});
 controller.configure(config);
 const pending=controller.check();
 assert.equal(controller.status().checkState,'checking');assert.match(controller.status().checkMessage,/Checking/);
 resolveCheck(snapshot);await pending;
 assert.equal(controller.status().checkState,'ready');assert.match(controller.status().checkMessage,/Check passed/);
 controller.stop();assert.equal(controller.status().checkState,'ready');
 controller.core.inspectPrinter=async()=>({...snapshot,ready:false});
 await controller.check();assert.equal(controller.status().checkState,'busy');assert.equal(controller.checked,true);
 controller.core.inspectPrinter=async()=>({...snapshot,supported:false});
 await controller.check();assert.equal(controller.status().checkState,'unsupported');assert.equal(controller.checked,false);
 controller.core.inspectPrinter=async()=>{throw Error('Secret '+config.token)};
 await controller.check();assert.equal(controller.status().checkState,'error');assert.match(controller.status().checkMessage,/Connection failed/);
 assert(!controller.status().checkMessage.includes(config.token));assert.equal(controller.checked,false);
 controller.configure(config);assert.equal(controller.status().checkState,'idle');assert.equal(controller.status().checkMessage,'');
 controller.forget();assert.equal(controller.status().checkMessage,'');
});

test('credential vault refuses plaintext fallback and removes its own encrypted file',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'studio-vault-'));
 try{
  const filename=path.join(directory,'config.enc');
  const insecure={isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=>'basic_text'};
  await assert.rejects(vault(filename,insecure).save(config),/Secure operating-system storage/);
  const encrypted={isEncryptionAvailable:()=>true,encryptString:text=>Buffer.from(text).map(byte=>byte^170),decryptString:bytes=>Buffer.from(bytes).map(byte=>byte^170).toString()};
  const store=vault(filename,encrypted);assert.equal(await store.load(),null);await store.save(config);
  assert(!(await readFile(filename)).includes(Buffer.from(config.token)));assert.deepEqual(await store.load(),config);
  await store.remove();assert.equal(await store.load(),null);
 }finally{assert.equal(path.dirname(directory),path.resolve(tmpdir()));await rm(directory,{recursive:true,force:true})}
});

test('desktop renderer has no network or Node access and IPC validates the main frame',async()=>{
 const source=await readFile(new URL('../bridge-desktop/src/main.cjs',import.meta.url),'utf8');
 for(const guard of ['contextIsolation:true','sandbox:true','nodeIntegration:false','webSecurity:true','event.senderFrame!==window.webContents.mainFrame','event.senderFrame.url!==page',"setWindowOpenHandler(()=>({action:'deny'}))"])assert(source.includes(guard),guard);
 assert(source.includes("shell.openExternal('https://spool-studio.uk/printer.html')"));
 assert(!source.includes('shell.openExternal(action'));
 const html=await readFile(new URL('../bridge-desktop/src/index.html',import.meta.url),'utf8');
 assert(html.includes("connect-src 'none'"));assert(html.includes("script-src 'self'"));assert(!html.includes('https://'));
 const preload=await readFile(new URL('../bridge-desktop/src/preload.cjs',import.meta.url),'utf8');
 assert(!preload.includes('callback(event'));assert(!preload.includes("contextBridge.exposeInMainWorld('ipcRenderer'"));
});
