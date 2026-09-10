'use strict';
(function(root){
 const brands=['Bambu Lab','SUNLU','ELEGOO','eSUN','Polymaker','Prusament','OVERTURE','Anycubic','Creality','ERYONE','JAYO','AMOLEN','HATCHBOX','Fiberlogy','Fillamentum','colorFabb','FormFutura','Flashforge','QIDI','Snapmaker','ZIRO','Voxelab','3DJake','Recreus'];
 const profiles=[
  ['PLA','PLA','standard'],['PLA Basic','PLA','standard'],['PLA Matte','PLA','matte'],['PLA Silk','PLA','silk'],['PLA Marble','PLA','marble'],['PLA Sparkle','PLA','sparkle'],['PLA Wood','PLA','wood'],['PLA Glow','PLA','glow'],['PLA+','PLA+','standard'],['High Speed PLA','PLA','unknown'],['PLA-CF','PLA','unknown'],
  ['PETG','PETG','standard'],['PETG HF','PETG','standard'],['PETG-CF','PETG','unknown'],['ABS','ABS','standard'],['ASA','ASA','standard'],['TPU','TPU','standard'],['TPU 95A','TPU','standard'],['PA / Nylon','PA','standard'],['PA6-CF','PA','unknown'],['PA12-CF','PA','unknown'],['PC','PC','standard'],['PVA','PVA','standard'],['HIPS','HIPS','standard'],
 ].map(([product,material,finish])=>({product,material,finish}));
 function barcode(value){
  if(typeof value!=='string')throw Error('Enter a barcode or manufacturer SKU.');
  const code=value.trim().toUpperCase();
  if(!code)return '';
  if(!/^[A-Z0-9][A-Z0-9 ._/-]{0,63}$/.test(code))throw Error('Use a barcode or SKU of up to 64 letters, numbers, spaces, dots, dashes or slashes—not a URL.');
  if(/^\d+$/.test(code)&&[8,12,13,14].includes(code.length)){
   const digits=[...code].map(Number);const check=digits.pop();let total=0;
   digits.reverse().forEach((digit,index)=>{total+=digit*(index%2===0?3:1)});
   if((10-total%10)%10!==check)throw Error('That barcode’s check digit does not match. Check the printed numbers or scan again.');
  }
  return code;
 }
 function barcodeKey(value){const code=barcode(value);return /^\d+$/.test(code)&&[8,12,13,14].includes(code.length)?code.padStart(14,'0'):code}
 function matches(value,items){
  const key=barcodeKey(value);if(!key)return [];
  return items.filter(item=>{try{return item.barcode&&barcodeKey(item.barcode)===key}catch{return false}});
 }
 function sourceUrl(value){
  if(typeof value!=='string'||value.length>2000)throw Error('Use a product source link up to 2000 characters.');
  if(!value.trim())return '';
  let parsed;try{parsed=new URL(value)}catch{throw Error('Use a valid HTTPS source link.')}
  if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw Error('Use an HTTPS source link without sign-in details.');
  parsed.hash='';return parsed.href;
 }
 const api={brands,profiles,barcode,barcodeKey,matches,sourceUrl};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.SpoolCatalog=api;
})(typeof globalThis==='object'?globalThis:this);
