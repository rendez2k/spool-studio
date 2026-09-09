'use strict';
const FilamentNfc=(()=>{
 const materials=['PLA','PETG','ABS','TPU'];
 const finishes=['matte','standard','unknown','silk','marble','sparkle','wood','glow','satin','metal'];
 const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
 function label(value,limit){if(typeof value!=='string'||value.length>limit||/[\u0000-\u001f\u007f]/.test(value))throw Error('Invalid text in phone selection.');return value.trim()}
 function hex(value){if(typeof value!=='string'||!/^#?[0-9a-f]{6}$/i.test(value))throw Error('Enter a six-digit colour, such as #EF8D34.');return value.replace('#','').toUpperCase()}
 function validate(value){
  if(!value||value.v!==1||!Array.isArray(value.s)||value.s.length<1||value.s.length>4)throw Error('Choose between one and four colours for a phone transfer.');
  const seen=new Set();
  const slots=value.s.map(slot=>{
   if(!slot||!Number.isInteger(slot.n)||slot.n<1||slot.n>64||seen.has(slot.n))throw Error('Invalid or duplicate colour slot.');
   seen.add(slot.n);
   if(!materials.includes(slot.m))throw Error('This writer supports Generic PLA, PETG, ABS and TPU. PLA+ is not silently changed to PLA.');
   if(!finishes.includes(slot.f))throw Error('Invalid filament finish.');
   return {n:slot.n,m:slot.m,c:hex(slot.c),f:slot.f,l:label(slot.l,100)};
  });
  return {v:1,p:label(value.p,80),s:slots};
 }
 function encode(value){
  const bytes=encoder.encode(JSON.stringify(validate(value)));if(bytes.length>1500)throw Error('Selection is too large for a readable QR code. Send fewer colours.');
  return btoa(Array.from(bytes,byte=>String.fromCharCode(byte)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 }
 function decode(value){
  if(typeof value!=='string'||!value.length||value.length>2000||!/^[A-Za-z0-9_-]+$/.test(value))throw Error('Invalid phone transfer. Scan a fresh QR code from the library.');
  try{return validate(JSON.parse(decoder.decode(Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),character=>character.charCodeAt(0)))))}catch(error){throw Error('Cannot read this phone selection. '+error.message)}
 }
 function payload(slot,colour=slot.c,temperatures={}){
  const clean=validate({v:1,p:'NFC',s:[slot]}).s[0];
  const result={protocol:'openspool',version:'1.0',brand:'Generic',type:clean.m,subtype:'Basic',color_hex:hex(colour)};
  const minimum=temperatures.min,maximum=temperatures.max;
  if((minimum!==''&&minimum!==undefined)||(maximum!==''&&maximum!==undefined)){
   const low=Number(minimum),high=Number(maximum);
   if(minimum===''||minimum===undefined||maximum===''||maximum===undefined||!Number.isInteger(low)||!Number.isInteger(high)||low<150||high>300||low>high)throw Error('Supply both recommended nozzle temperatures, 150–300 °C, with minimum no higher than maximum.');
   result.min_temp=low;result.max_temp=high;
  }
  return result;
 }
 function message(value){
  const bytes=encoder.encode(JSON.stringify(value));
  if(bytes.length+32>480)throw Error('Tag data is too large for this writer.');
  return {records:[{recordType:'mime',mediaType:'application/json',data:bytes}]};
 }
 function matches(message,expected){
  if(!message||message.records?.length!==1)return false;
  const record=message.records[0];if(record.recordType!=='mime'||record.mediaType!=='application/json'||record.data?.byteLength>1024)return false;
  try{const actual=JSON.parse(decoder.decode(record.data));return actual&&Object.keys(actual).length===Object.keys(expected).length&&Object.entries(expected).every(([key,value])=>actual[key]===value)}catch{return false}
 }
 return {materials,validate,encode,decode,hex,payload,message,matches};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=FilamentNfc;
