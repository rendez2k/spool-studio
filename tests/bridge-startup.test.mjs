import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {configuration} from '../scripts/printer-bridge.mjs';
const require=createRequire(import.meta.url);
const {windowsStartup}=require('../bridge-desktop/src/startup.cjs');
const {BridgeController}=require('../bridge-desktop/src/controller.cjs');
const config={origin:'https://spool-studio.uk',printerUrl:'http://127.0.0.1:9',token:'fixture.'+'a'.repeat(72),allowPrinterWrites:true};

test('uninstall removes only this startup item and preserves it during app upgrades',async()=>{
 const script=await readFile('bridge-desktop/installer.nsh','utf8');
 assert(script.includes('${ifNot} ${isUpdated}'));
 assert.equal((script.match(/DeleteRegValue HKCU/g)||[]).length,2);
 assert.equal((script.match(/"Spool Studio Bridge"/g)||[]).length,2);
 assert(!script.includes('DeleteRegKey'));
});

test('Windows startup is opt-in, packaged-only and registers no credentials',()=>{
 let settings={openAtLogin:false,executableWillLaunchAtLogin:false,launchItems:[]},written;
 const app={isPackaged:true,getLoginItemSettings:options=>{assert.deepEqual(options.args,['--startup']);assert.equal(options.path,'"C:\\Programs\\Spool Studio Bridge.exe"');return settings},setLoginItemSettings:options=>{written=options;settings={openAtLogin:false,executableWillLaunchAtLogin:options.enabled,launchItems:options.openAtLogin?[{name:options.name,scope:'user',enabled:options.enabled}]:[]}}};
 const startup=windowsStartup(app,'win32','C:\\Programs\\Spool Studio Bridge.exe');
 assert.equal(startup.status().enabled,false);assert.equal(written,undefined);
 assert.equal(startup.set(true).enabled,true);assert.equal(written.name,'Spool Studio Bridge');assert.deepEqual(written.args,['--startup']);assert(!JSON.stringify(written).includes(config.token));
 assert.equal(startup.set(false).enabled,false);
 for(const variant of [windowsStartup(app,'darwin','/app'),windowsStartup({...app,isPackaged:false},'win32','dev.exe')]){
  assert.equal(variant.status().supported,false);assert.throws(()=>variant.set(true));
 }
 assert.throws(()=>startup.set('true'));
 settings={openAtLogin:true,executableWillLaunchAtLogin:true,launchItems:[{name:'Spool Studio Bridge',scope:'user',enabled:false}]};
 assert.equal(startup.status().enabled,false);assert.match(startup.status().message,/Windows has disabled/);
 settings={openAtLogin:true,executableWillLaunchAtLogin:true,launchItems:[{name:'Another app',scope:'user',enabled:true},{name:'Spool Studio Bridge',scope:'machine',enabled:true}]};
 assert.equal(startup.status().registered,false);assert.equal(startup.status().enabled,false);
});

test('startup API failures cannot report a successful registration',()=>{
 const app={isPackaged:true,getLoginItemSettings:()=>({openAtLogin:false,executableWillLaunchAtLogin:false}),setLoginItemSettings:()=>{}};
 assert.throws(()=>windowsStartup(app,'win32','app.exe').set(true),/did not confirm/);
 app.getLoginItemSettings=()=>{throw Error('Unavailable')};
 assert.equal(windowsStartup(app,'win32','app.exe').status().enabled,false);
});

test('automatic reconnect checks first, retries offline and stops without bypassing checks',async()=>{
 let checks=0,polls=0,retry;const cancelled=[];
 const controller=new BridgeController({configuration,inspectPrinter:async()=>{checks++;if(checks===1)throw Error('Offline');return {supported:true,ready:false}},bridgeOnce:async()=>{polls++;return 'Waiting'}},{schedule:(callback,delay)=>{retry={callback,delay};return delay},cancel:timer=>cancelled.push(timer)});
 await controller.connectAutomatically();assert.equal(checks,0);
 controller.configure(config);await controller.connectAutomatically();
 assert.equal(checks,1);assert.equal(polls,0);assert.equal(controller.reconnecting,true);assert.equal(retry.delay,30000);
 assert.throws(()=>controller.configure(config),/Stop/);
 await retry.callback();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(checks,2);assert.equal(polls,1);assert.equal(controller.running,true);assert.equal(controller.reconnecting,false);
 controller.stop();assert.equal(controller.running,false);assert(cancelled.includes(5000));
});

test('Stop and disabling startup cancel retries, including an in-flight connection check',async()=>{
 for(const action of ['stop','cancelReconnect']){
  let complete,polls=0;const timers=[];
  const controller=new BridgeController({configuration,inspectPrinter:()=>new Promise(resolve=>{complete=resolve}),bridgeOnce:async()=>{polls++;return 'Should not run'}},{schedule:callback=>{timers.push(callback);return 1}});
  controller.configure(config);const connecting=controller.connectAutomatically();controller[action]();complete({supported:true,ready:true});await connecting;
  assert.equal(polls,0);assert.equal(timers.length,0);assert.equal(controller.running,false);assert.equal(controller.reconnecting,false);
 }
 let retry,polls=0,cancelled=0;
 const controller=new BridgeController({configuration,inspectPrinter:async()=>{throw Error('Offline')},bridgeOnce:async()=>{polls++}},{schedule:callback=>{retry=callback;return 1},cancel:()=>cancelled++});
 controller.configure(config);await controller.connectAutomatically();controller.stop();await retry();
 assert.equal(cancelled,1);assert.equal(polls,0);assert.equal(controller.reconnecting,false);
});

test('unsupported firmware stops automatic reconnect without claiming printer requests',async()=>{
 let polls=0,timers=0;
 const controller=new BridgeController({configuration,inspectPrinter:async()=>({supported:false,ready:true}),bridgeOnce:async()=>{polls++}},{schedule:()=>timers++});
 controller.configure(config);await controller.connectAutomatically();
 assert.equal(controller.checkState,'unsupported');assert.equal(controller.reconnecting,false);assert.equal(polls,0);assert.equal(timers,0);
});
