import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../out/spool-catalog.js';
import {handleLibrary} from '../server/library.mjs';
import {localDatabase} from '../scripts/local-db.mjs';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {BitArray, BarcodeFormat, DecodeHintType} from '@zxing/library';

test('the shipped lazy scanner bundle actually decodes a UPC-A fixture',()=>{
 const context=vm.createContext({});vm.runInContext(readFileSync('out/vendor/barcode/decoder.js','utf8'),context);
 const scanner=context.SpoolBarcodeDecoder.createReader();
 assert(!scanner.hints.get(DecodeHintType.POSSIBLE_FORMATS).includes(BarcodeFormat.UPC_E));
 const patterns=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
 const digits='036000291452';
 const bits='0000000000'+'101'+[...digits.slice(0,6)].map(digit=>patterns[Number(digit)]).join('')+'01010'+[...digits.slice(6)].map(digit=>[...patterns[Number(digit)]].map(bit=>bit==='0'?'1':'0').join('')).join('')+'101'+'0000000000';
 const row=new BitArray(bits.length);[...bits].forEach((bit,index)=>{if(bit==='1')row.set(index)});
 assert.equal(scanner.reader.decodeRow(0,row,scanner.hints).getText(),digits);
});

test('catalogue keeps finishes separate and validates GTINs without inventing stock',()=>{
 assert(catalog.brands.includes('Bambu Lab'));assert(catalog.brands.includes('Polymaker'));
 assert.equal(catalog.profiles.find(row=>row.product==='PLA Matte').finish,'matte');
 assert.equal(catalog.profiles.find(row=>row.product==='PLA Basic').finish,'standard');
 assert.equal(catalog.profiles.find(row=>row.product==='PLA+').material,'PLA+');
 assert.equal(catalog.barcode(' sku-blue/12 '),'SKU-BLUE/12');
 assert.equal(catalog.barcodeKey('036000291452'),catalog.barcodeKey('0036000291452'));
 assert.equal(catalog.barcode('96385074'),'96385074');
 for(const bad of ['036000291453','https://example.com', '<script>', 'a'.repeat(65),null])assert.throws(()=>catalog.barcode(bad));
 assert.equal(catalog.matches('036000291452',[{barcode:'0036000291452'},{barcode:'bad:code'},{}]).length,1);
 assert.equal(catalog.sourceUrl('https://example.com/product#fragment'),'https://example.com/product');
 for(const bad of ['javascript:alert(1)','http://example.com','https://user:password@example.com'])assert.throws(()=>catalog.sourceUrl(bad));
});

test('barcode/source metadata survive edits, can be cleared, and are account scoped',async()=>{
 const DB=localDatabase();
 const spool={brand:'SUNLU',product:'PLA Matte',material:'PLA',finish:'matte',colour:'Orange',hex:'#EF8D34',spools:1,weightGrams:1000,packaging:'spooled',date:'2026-09-10',notes:''};
 const act=(user,body)=>handleLibrary(new Request('https://test.example/api/library',{method:body?'POST':'GET',headers:{'oai-authenticated-user-id':user,origin:'https://test.example','content-type':'application/json'},body:body?JSON.stringify(body):undefined}),{DB});
 const command=(baseRevision,extra={})=>({kind:'add',baseRevision,requestId:crypto.randomUUID(),spool,...extra});
 try{
  let state=await(await act('alice',command(1,{spool:{...spool,barcode:'036000291452',sourceUrl:'https://www.sunlu.com/products/pla'}}))).json();
  const id=state.items[0].id;
  state=await(await act('alice',command(state.revision,{kind:'edit',id}))).json();
  assert.equal(state.items[0].barcode,'036000291452');assert.equal(state.items[0].sourceUrl,'https://www.sunlu.com/products/pla');
  assert.equal(catalog.matches('036000291452',(await(await act('bob')).json()).items).length,0);
  assert.equal((await act('alice',command(state.revision,{spool:{...spool,barcode:'036000291453'}}))).status,400);
  state=await(await act('alice',command(state.revision,{kind:'edit',id,spool:{...spool,barcode:'',sourceUrl:''}}))).json();
  assert.equal(state.items[0].barcode,'');assert.equal(state.items[0].sourceUrl,'');
 }finally{DB.close()}
});
