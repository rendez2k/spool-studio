import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),wheel=require('../out/colour-wheel-core.js'),reels=require('../out/reels-core.js'),colours=require('../out/colour-catalog.js');
const row=(id,colour,hex,spools=1,extra={})=>({id,colour,hex,spools,brand:'Example',product:'PLA Basic',material:'PLA',finish:'standard',...extra});

test('wheel groups identical swatches, orders hue and weights each ring by available rolls',()=>{
 const result=wheel.build([row('red','Red','#FF0000',2),row('blue','Blue','#0000FF'),row('red-again','Red','#ff0000'),row('green','Green','#00FF00'),row('white','Ivory White','#FFFDF0',2),row('grey','Ash Grey','#A8AAA3'),row('black','Black','#000000')]);
 assert.deepEqual(result.groups.map(group=>group.colour),['Red','Green','Blue','Ivory White','Ash Grey','Black']);
 assert.equal(result.total,9);assert.equal(result.coloured,5);assert.equal(result.neutral,4);assert.equal(result.groups[0].rolls,3);assert.equal(result.groups[0].end,216);assert.equal(result.groups.at(-1).end,360);
});
test('wheel preserves custom colours, brand and finish differences, never invents bundle quantities',()=>{
 const input=[row('a','Red','#FF0000'),row('b','Red','#FF0011'),row('c','Red','#FF0000',1,{finish:'matte'}),row('d','Red','#FF0000',1,{brand:'Another'}),row('unknown','Blue','#0000FF',null),row('multi','Red + Blue','#FF0000',2),row('missing','Mystery','not-a-hex'),row('used','Green','#00FF00',5,{used:true}),row('empty','Grey','#888888',0)];
 const before=JSON.stringify(input),result=wheel.build(input);assert.equal(result.groups.length,4);assert.equal(result.total,4);assert.equal(result.excluded.length,3);assert.equal(JSON.stringify(input),before);assert.equal(wheel.build([]).total,0);
});
test('wheel excludes individually depleted physical reels and uses resolved manufacturer colours',()=>{
 const item=row('white','Jade White','#EDECE2',3,{brand:'Bambu Lab',weightGrams:1000});
 const actual=reels.rows([item],[{itemId:'white',used:false},{itemId:'white',used:true},{itemId:'white',used:true}]).map(colours.resolve);
 const result=wheel.build(actual);assert.equal(result.total,1);assert.equal(result.groups[0].hex,'#FFFFFF');assert.equal(result.groups[0].source,'Manufacturer colour');
 const custom=wheel.build([colours.resolve({...item,hex:'#FFF4CC',hexMode:'manual'})]);assert.equal(custom.groups[0].hex,'#FFF4CC');assert.equal(custom.groups[0].source,'Custom colour');
});
test('wheel arc geometry remains finite for a single shade and tiny weighted slices',()=>{
 for(const [start,end] of [[0,360],[0,.001],[179,181],[220,359]]){const path=wheel.arc(start,end,155,227);assert(!/NaN|Infinity/.test(path));assert.match(path,/^M .* A 227 227 .* L .* A 155 155 .* Z$/)}
 assert.equal(wheel.values('missing'),null);
 const page=readFileSync(new URL('../out/index.html',import.meta.url),'utf8');assert.match(page,/id="wheel-tab"/);assert.equal((page.match(/\['cards','table','shelf','wheel','match'\]/g)||[]).length,2);
});
