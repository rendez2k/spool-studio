import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const matcher=createRequire(import.meta.url)('../out/matcher.js');

test('quick finish changes only included unknown slots, clearing only their choices',()=>{
 const slots=[
  {slot:1,included:true,finish:'unknown',nfcChoice:'old',hex:'#474847'},
  {slot:2,included:true,finish:'matte',nfcChoice:'keep'},
  {slot:3,included:false,finish:'unknown',nfcChoice:'excluded'},
  {slot:4,included:true},
 ];
 assert.equal(matcher.setUnknownFinishes(slots,'standard'),2);
 assert.deepEqual(slots,[
  {slot:1,included:true,finish:'standard',nfcChoice:null,hex:'#474847'},
  {slot:2,included:true,finish:'matte',nfcChoice:'keep'},
  {slot:3,included:false,finish:'unknown',nfcChoice:'excluded'},
  {slot:4,included:true,finish:'standard',nfcChoice:null},
 ]);
 assert.equal(matcher.setUnknownFinishes(slots,'silk'),0);
});

test('quick finish validates before mutation and supports every selectable finish',()=>{
 for(const finish of ['standard','matte','silk','marble','sparkle','wood','glow','satin','metal']){
  const slots=[{included:true,finish:'unknown'}];
  assert.equal(matcher.setUnknownFinishes(slots,finish),1);
  assert.equal(slots[0].finish,finish);
 }
 for(const finish of ['unknown','',null,'PLA','<script>']){
  const slots=[{included:true,finish:'unknown'}];
  assert.throws(()=>matcher.setUnknownFinishes(slots,finish),/known finish/);
  assert.equal(slots[0].finish,'unknown');
 }
});
