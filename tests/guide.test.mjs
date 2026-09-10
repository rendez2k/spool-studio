import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import worker from '../dist/server/index.js';
const read=filename=>readFileSync(new URL('../out/'+filename,import.meta.url),'utf8');
const parser=createRequire(import.meta.url)('../out/import-parser.js');

test('guide is public, its local routes and anchors resolve, and it adds no permission gate',async()=>{
 const response=await worker.fetch(new Request('https://test.example/guide.html'),{});
 assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/);
 const html=await response.text();
 assert.doesNotMatch(html.replace('<script src="/setup-core.js"></script>','').replace('<script src="/setup-flow.js"></script>','').replace('<script src="/studio.js" defer></script>',''),/<script|<form|type="checkbox"/i);
 for(const [,anchor] of html.matchAll(/href="#([^"]+)"/g))assert(html.includes('id="'+anchor+'"'));
 for(const [,path] of html.matchAll(/(?:href|src)="(\/[^"#]+)(?:#[^"]*)?"/g)){
  const result=await worker.fetch(new Request('https://test.example'+path),{});
  assert([200,302].includes(result.status),path+' did not resolve');
 }
 for(const file of ['index.html','nfc.html','import.html']){
  for(const [,anchor] of read(file).matchAll(/href="\/guide.html(?:#([^"]+))?"/g)){
   if(anchor)assert(html.includes('id="'+anchor+'"'));
  }
  assert.match(read(file),/href="\/guide.html/);
 }
 const phone=read('nfc.html');
 assert(phone.indexOf('class="setup-guide"')<phone.indexOf('id="writer" hidden'));
 assert.match(phone,/NTAG215\/216/);
 assert.match(html,/Filament Detection/);assert.match(html,/Advanced Mode/);
 assert.match(html,/Snapmaker<\/strong>/);assert.match(html,/External mode disables/);
});

test('the visible import example produces the promised two separate spools',()=>{
 const example=read('guide.html').match(/<pre id="import-example">([^]*?)<\/pre>/)[1];
 const entries=parser.parse(example);
 assert.equal(entries.length,2);
 assert.equal(entries[0].spool.spools,2);assert.equal(entries[0].spool.finish,'matte');
 assert.equal(entries[0].spool.packaging,'refill');assert.equal(entries[0].spool.weightGrams,1000);
 assert.equal(entries[1].spool.spools,1);assert.equal(entries[1].spool.finish,'standard');
 assert.equal(entries[1].spool.colour,'Jade White');assert.equal(entries[1].spool.packaging,'spooled');
});

test('U1 setup distinguishes connection, physical mappings and consumption proof',()=>{
 const html=read('guide.html');
 assert.match(html,/id="u1-spoollink"/);
 assert.match(html,/built-in <strong>SpoolLink<\/strong>/);
 assert.match(html,/Tools 1–4 correspond to channels 0–3/);
 assert.match(html,/node scripts\/spoolman-check.mjs/);
 assert.match(html,/successful connection check is not a consumption test/);
 assert.match(html,/without changing printer settings or revealing tag UIDs/);
 assert.match(html,/Leave an unknown physical reel unassigned/);
});
