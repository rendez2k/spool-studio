import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('bridge downloads are public, versioned and explain pairing without repository access',async()=>{
 const html=await readFile('dist/netlify-public/bridge.html','utf8');
 const configuration=JSON.parse(await readFile('bridge-desktop/package.json','utf8'));
 assert(html.includes('No GitHub')||html.includes('do not need a GitHub'));
 for(const platform of ['windows-x64-setup.exe','mac-arm64.zip','mac-x64.zip']){
  assert(html.includes('/releases/download/bridge-v'+configuration.version+'/Spool-Studio-Bridge-'+configuration.version+'-'+platform));
 }
 for(const phrase of ['not Windows-signed','Apple-notarised','Check connection','in-flight','not the weight-sync bridge','Remove configuration','Do not disable security protections']){
  assert(html.includes(phrase),phrase);
 }
 const compose=await readFile('bridge-desktop/compose.yaml','utf8');
 const service=compose.match(/^  ([a-z-]+):/m)[1];
 assert(html.includes('docker compose run --rm '+service+' --check'));
 assert(!compose.includes('ports:'));
 assert(compose.includes(':ro'));
 assert(!html.includes('<!-- CLERK -->'));
});

test('printer setup and guide lead with desktop install and explain local credential retention',async()=>{
 const printer=await readFile('dist/netlify-pages/printer.html','utf8');
 assert(printer.indexOf('href="/bridge.html"')<printer.indexOf('node scripts/printer-bridge.mjs'));
 assert(printer.includes('Advanced: run from source instead'));
 const guide=await readFile('dist/netlify-public/guide.html','utf8');
 assert(guide.includes('Spool Studio Bridge (desktop beta)'));
 const privacy=await readFile('dist/netlify-public/privacy.html','utf8');
 assert(privacy.includes('operating system’s secure storage'));
 assert(privacy.includes('Uninstalling the app may leave its stored configuration behind'));
});
