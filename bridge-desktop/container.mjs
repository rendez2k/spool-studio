import {readFile} from 'node:fs/promises';
import {setTimeout as pause} from 'node:timers/promises';
import {createRequire} from 'node:module';
const {configuration,inspectPrinter,bridgeOnce}=createRequire(import.meta.url)('./bridge.cjs');
const filename=process.env.BRIDGE_CONFIG||'/config/printer.private.json';
let config;
try{config=configuration(JSON.parse(await readFile(filename,'utf8')))}catch{console.error('Could not load a valid private printer configuration. Check the file and its read permissions.');process.exit(1)}
if(config.origin!=='https://spool-studio.uk')throw Error('This image connects only to https://spool-studio.uk.');
let running=true;
process.on('SIGTERM',()=>{running=false});process.on('SIGINT',()=>{running=false});
if(process.argv.includes('--check')){
 try{const status=await inspectPrinter(config);console.log(JSON.stringify(status,null,2));if(!status.supported)process.exitCode=1}
 catch{console.error('Could not check the printer. Check its address, API key and local network.');process.exitCode=1}
}
else{
 while(running){
  try{console.log(await bridgeOnce(config))}catch{console.error('Connection unavailable. Check the local servers and private key; no success assumed.')}
  if(running)await pause(5000);
 }
}
