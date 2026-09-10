import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import worker from '../dist/server/index.js';
const csv=createRequire(import.meta.url)('../out/import-csv.js'),header=csv.columns.join(',');
const line='SUNLU,PLA Matte,PLA,matte,Orange,#EF8D34,2,1000,refill,2026-09-10,Check label';
test('CSV preserves explicit fields and unknowns, quoted commas/newlines, BOM and Excel separators',()=>{
 const result=csv.parse('\uFEFF'+header+'\r\n'+line+'\r\n');assert.equal(result[0].spool.spools,2);assert.equal(result[0].spool.finish,'matte');assert.equal(result[0].spool.weightGrams,1000);
 assert.equal(csv.parse(header.replaceAll(',',';')+'\n'+line.replaceAll(',',';'))[0].spool.colour,'Orange');
 const quoted=line.replace('Check label','"Check, then say ""yes""\nNext line"');assert.equal(csv.parse(header+'\n'+quoted)[0].spool.notes,'Check, then say "yes"\nNext line');
 const unknown=csv.parse(header+'\nSUNLU,PLA,PLA,,Orange,,,,,,')[0];assert.equal(unknown.spool.spools,null);assert.equal(unknown.spool.hex,'');assert.equal(unknown.spool.finish,'unknown');assert.match(unknown.warnings.join(' '),/No purchase date/);
 assert.deepEqual(csv.parse(header),[]);assert.equal(csv.parse(header+'\n'+Array(500).fill(line).join('\n')).length,500);
});
test('CSV rejects malformed, oversize, formula-like and invalid numeric/date records atomically',()=>{
 for(const input of [header+'\n'+Array(501).fill(line).join('\n'),'x'.repeat(1000001),header+'\n'+line+',extra',header+'\n'+line.replace('Check label','"unfinished'),header+'\n'+line.replace('Check label','"done"bad'),header.replace('brand','__proto__')+'\n'+line,header.replace('notes','brand')+'\n'+line,header+'\n'+line.replace(',2,',',2.5,'),header+'\n'+line.replace(',1000,',',0,'),header+'\n'+line.replace('2026-09-10','2026-02-30'),header+'\n'+line.replace('#EF8D34','orange'),header+'\n'+line+'\0'])assert.throws(()=>csv.parse(input));
 for(const formula of ['=HYPERLINK("bad")','+123','@SUM(1)','-123'])assert.throws(()=>csv.parse(header+'\n'+line.replace('Check label',formula)),/formula|Quotes/);
});
test('email guide, template and CSV reader are served, with prompt copy fallback',async()=>{
 const guide=await worker.fetch(new Request('https://test.example/email-import.html'),{});assert.equal(guide.status,200);const html=await guide.text();assert.match(html,/not a terminal command/);assert.match(html,/Do not send, delete/);assert(html.includes(header));
 const template=await worker.fetch(new Request('https://test.example/filament-import-template.csv'),{});assert.match(template.headers.get('content-type'),/text\/csv/);assert.deepEqual(csv.parse(await template.text()),[]);
 assert.equal((await worker.fetch(new Request('https://test.example/import-csv.js'),{})).status,200);
 let copied='',focused=false,selected=false;const elements={'email-prompt':{value:'prompt',focus(){focused=true},select(){selected=true}},'copy-prompt-status':{},'copy-email-prompt':{}};
 const navigator={clipboard:{writeText:async value=>{copied=value}}};vm.runInNewContext(readFileSync(new URL('../out/email-import.js',import.meta.url),'utf8'),{document:{getElementById:id=>elements[id]},navigator});
 await elements['copy-email-prompt'].onclick();assert.equal(copied,'prompt');navigator.clipboard.writeText=async()=>{throw Error('denied')};await elements['copy-email-prompt'].onclick();assert(focused&&selected);assert.match(elements['copy-prompt-status'].textContent,/manually/);
});
