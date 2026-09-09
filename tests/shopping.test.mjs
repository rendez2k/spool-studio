import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const shopping=require('../out/shopping.js');
const slot={included:true,material:'PLA',finish:'matte',brand:'Example',colourName:'Orange',hex:'#EF8D34'};
test('Amazon UK search retains material, finish and the supplied affiliate tag',()=>{
 const result=shopping.search(slot,'refill'),url=new URL(result.url);
 assert.equal(url.origin,'https://www.amazon.co.uk');
 assert.equal(url.pathname,'/s');
 assert.equal(url.searchParams.get('tag'),'strata0b-21');
 assert.match(url.searchParams.get('k'),/Example PLA matte Orange 3D printer filament refill/);
 assert.equal(result.estimated,false);
 assert.match(shopping.search({...slot,finish:'standard'},'spooled').terms,/standard.*with spool/);
 assert.match(shopping.search({...slot,material:'PLA+'}).terms,/PLA\+/);
 assert.equal(shopping.search({...slot,material:'Unknown'}),null);
});
test('unnamed colours use explicitly approximate families, never another library shade',()=>{
 for(const [hex,name] of [['#FFFFFF','white'],['#000000','black'],['#FF0000','red'],['#FFFF00','yellow'],['#A6A8A0','grey']])assert.equal(shopping.broadColour(hex),name);
 const result=shopping.search({...slot,colourName:'',hex:'#FF0000'});
 assert.equal(result.estimated,true);assert.match(result.terms,/red/);
 assert(!result.terms.includes('Orange'));assert(!result.terms.includes('#'));
});
test('only non-exact included slots get disclosed links, and rendering is inert and escaped',()=>{
 assert.equal(shopping.render(slot,{exact:[{}]}),'');
 assert.equal(shopping.render({...slot,included:false},{exact:[]}),'');
 const html=shopping.render({...slot,colourName:'<script>alert(1)</script>&tag=other',profile:'private-project.3mf',order:'private-order'},{exact:[]});
 assert(html.includes('Search Amazon UK (paid link)'));
 assert(html.includes('rel="sponsored noopener noreferrer"'));
 assert(html.includes('Check material, finish, diameter and refill/spool options'));
 assert(!html.includes('<script>'));assert(!html.includes('private-project'));assert(!html.includes('private-order'));
 const link=new URL(shopping.search({...slot,colourName:'red&tag=other'}).url);
 assert.equal(link.searchParams.get('tag'),'strata0b-21');
 assert.equal(link.searchParams.getAll('tag').length,1);
 assert.match(shopping.render({...slot,colourName:''},{exact:[]}),/Broad colour estimate, not an exact shade/);
});
test('matcher wires shopping separately from matching and shows the required disclosure',()=>{
 const html=readFileSync(new URL('../out/index.html',import.meta.url),'utf8');
 assert.match(html,/<script src="shopping.js"><\/script>/);
 assert.match(html,/FilamentShopping.render\(required,result\)/);
 assert.match(html,/class="affiliate-disclosure"/);
 assert.equal(shopping.disclosure,'As an Amazon Associate I earn from qualifying purchases.');
 const matcher=readFileSync(new URL('../out/matcher.js',import.meta.url),'utf8');
 assert(!matcher.includes('FilamentShopping'));assert(!matcher.includes('strata0b-21'));
});
