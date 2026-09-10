import {boundedJson} from './api.mjs';
const reply = (body,status=200) => Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
let nextLookup = 0;
export function gtin(value) {
 if(typeof value!=='string'||!/^([0-9]{8}|[0-9]{12,14})$/.test(value))throw Error('Catalogue lookup needs an EAN, UPC-A or GTIN number, not a manufacturer SKU.');
 let sum=0;
 for(let index=value.length-2,position=0;index>=0;index--,position++)sum+=Number(value[index])*(position%2?1:3);
 if((10-sum%10)%10!==Number(value.at(-1)))throw Error('That barcode has an invalid check digit. Check the printed number.');
 return value;
}
export async function lookupBarcode(code, transport=fetch) {
 const response=await transport('https://api.upcitemdb.com/prod/trial/lookup?upc='+gtin(code),{redirect:'error',signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}});
 if(response.status===429)throw Error('The shared catalogue allowance is busy or exhausted. Try later, or enter the product manually.');
 if(!response.ok)throw Error('The catalogue is unavailable. Enter the details manually.');
 const body=await boundedJson(response,200000);
 if(body.code!=='OK'||!Array.isArray(body.items))throw Error('The catalogue could not identify this barcode.');
 const clean=(value,length)=>typeof value==='string'?value.replace(/[\u0000-\u001f]/g,' ').slice(0,length).trim():'';
 return body.items.filter(item=>[item.ean,item.upc,item.gtin].some(value=>typeof value==='string'&&value.padStart(14,'0')===code.padStart(14,'0'))).slice(0,5).map(item=>({title:clean(item.title,300),brand:clean(item.brand,80),colour:clean(item.color,80)})).filter(item=>item.title);
}
export async function handleBarcodeLookup(request, perform=lookupBarcode) {
 const user=request.headers.get('oai-authenticated-user-id');
 if(!user)return reply({error:'Sign in to look up a barcode.'},401);
 if(request.method!=='POST')return reply({error:'Use POST.'},405);
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')return reply({error:'Use the catalogue button in this app.'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'JSON required.'},415);
 try {
  const input=await boundedJson(request,1000),code=gtin(input.code);
  if(input.consent!==true)return reply({error:'Confirm sending this barcode to UPCitemdb.'},400);
  if(Date.now()<nextLookup)return reply({error:'Please wait 10 seconds before another catalogue lookup.'},429);
  nextLookup=Date.now()+10000;
  return reply({accountKey:user,code,products:await perform(code),provider:'UPCitemdb'});
 }catch(error){return reply({error:error.message?.startsWith('The ')||error.message?.startsWith('That ')||error.message?.startsWith('Catalogue ')?error.message:'Lookup failed. Check the code or enter the details manually.'},400)}
}
