import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'parse5';

const read=name=>readFileSync(new URL('../out/'+name,import.meta.url),'utf8');
const walk=node=>[node,...(node.childNodes||[]).flatMap(walk)];
const attribute=(node,name)=>node.attrs?.find(attribute=>attribute.name===name)?.value;

test('every workspace and guide uses the shared studio shell once',()=>{
 for(const name of ['index','import','reels','printer','welcome','app','nfc','guide','privacy','contact','email-import','colour-sources','whats-new']){
  const nodes=walk(parse(read(name+'.html'))),body=nodes.find(node=>node.tagName==='body');
  assert.match(attribute(body,'class'),/studio-ui/);
  assert.equal(nodes.filter(node=>node.tagName==='script'&&attribute(node,'src')==='/studio.js').length,1);
  assert.equal(nodes.filter(node=>node.tagName==='link'&&attribute(node,'href')==='/studio.css').length,1);
  const ids=nodes.map(node=>attribute(node,'id')).filter(Boolean);assert.equal(ids.length,new Set(ids).size,name+' duplicate ids');
 }
});

test('filter disclosure contains its five controls, leaving search and reset outside',()=>{
 const nodes=walk(parse(read('index.html'))),filters=nodes.find(node=>attribute(node,'id')==='studio-filters');
 const contained=walk(filters).map(node=>attribute(node,'id'));
 for(const id of ['brand','material','colour','from','to'])assert(contained.includes(id),id);
 for(const id of ['search','reset'])assert(!contained.includes(id),id);
 assert(nodes.find(node=>attribute(node,'id')==='studio-filter-count'));
});

test('workflow navigation exposes all root views and does not write inventory',()=>{
 const script=read('studio.js');
 for(const view of ['cards','table','shelf','wheel','match'])assert(script.includes('/?view='+view));
 for(const route of ['import','reels','printer','nfc','welcome','app','guide'])assert(script.includes('/'+route+'.html'));
 assert.match(script,/aria-current/);assert.match(script,/aria-haspopup/);assert.match(script,/menu\.showModal\(\)/);
 assert.match(script,/filament-theme/);assert.match(script,/event\.key==='Escape'/);
 assert.doesNotMatch(script,/fetch\(|XMLHttpRequest|\/api\//);
});

test('shared visual overrides are screen-only and retain touch and reduced-motion rules',()=>{
 const style=read('studio.css');
 assert(style.startsWith('@media screen {'));
 assert.match(style,/@media print.*studio-rail/);
 assert.match(style,/prefers-reduced-motion:reduce/);
 assert.match(style,/min-height:44px/);
 assert.match(style,/env\(safe-area-inset-bottom\)/);
});

test('onboarding and printer readiness stage the next action without relaxing approval',()=>{
 assert.match(read('welcome.js'),/detail\.name='setup-checklist'/);
 const printer=read('printer.js');
 assert.match(printer,/node\('printer-work'\)\.hidden=!state\.enabled/);
 assert.match(printer,/!node\('printer-approve'\)\.checked/);
 assert.match(printer,/state\.status\?\.ready/);
 assert.match(read('index.html'),/studio-awaiting-model/);
});
