(function(root){
 'use strict';
 const checkedAt='2026-09-10';
 const ranges=[
  {product:'PLA Basic',material:'PLA',finish:'standard',url:'https://bambulab-us.myshopify.com/products/pla-basic-filament',colours:{'Jade White':'FFFFFF','Beige':'F7E6DE','Gold':'E4BD68','Silver':'A6A9AA','Gray':'8E9089','Bronze':'847D48','Brown':'9D432C','Cocoa Brown':'6F5034','Maroon Red':'9D2235','Red':'C12E1F','Magenta':'EC008C','Pink':'F55A74','Hot Pink':'F5547C','Orange':'FF6A13','Pumpkin Orange':'FF9016','Sunflower Yellow':'FEC600','Yellow':'F4EE2A','Bright Green':'BECF00','Bambu Green':'00AE42','Mistletoe Green':'3F8E43','Turquoise':'00B1B7','Cyan':'0086D6','Blue':'0A2989','Cobalt Blue':'0056B8','Purple':'5E43B7','Indigo Purple':'482960','Blue Gray':'5B6579','Light Gray':'D1D3D5','Dark Gray':'545454','Black':'000000'}},
  {product:'PLA Matte',material:'PLA',finish:'matte',url:'https://bambulab-us.myshopify.com/products/pla-matte',colours:{'Ivory White':'FFFFFF','Bone White':'CBC6B8','Latte Brown':'D3B7A7','Caramel':'AE835B','Terracotta':'B15533','Desert Tan':'E8DBB7','Ash Gray':'9B9EA0','Nardo Gray':'757575','Lilac Purple':'AE96D4','Sakura Pink':'E8AFCF','Plum':'950051','Mandarin Orange':'F99963','Lemon Yellow':'F7D959','Scarlet Red':'DE4343','Dark Red':'BB3D43','Dark Brown':'7D6556','Dark Chocolate':'4D3324','Dark Green':'68724D','Apple Green':'C2E189','Grass Green':'61C680','Ice Blue':'A3D8E1','Sky Blue':'56B7E6','Marine Blue':'0078BF','Dark Blue':'042F56','Charcoal':'000000'}},
  {product:'PETG HF',material:'PETG',finish:'standard',url:'https://us.store.bambulab.com/collections/bambu-lab-3d-printer-filament/products/petg-hf',colours:{'Yellow':'FFD00B','Orange':'F75403','Green':'00AE42','Red':'EB3A3A','Blue':'002E96','Black':'000000','White':'FFFFFF','Cream':'F9DFB9','Lime Green':'6EE53C','Forest Green':'39541A','Lake Blue':'1F79E5','Peanut Brown':'875718','Gray':'ADB1B2','Dark Gray':'515151'}}
 ];
 const legacy={
  'PLA Basic':{'Gold':'BAA45F','Sunflower Yellow':'F2C431','Mistletoe Green':'41674D','Bambu Green':'22A664','Bright Green':'7CAD42','Red':'CE3634','Blue':'3975B6','Hot Pink':'E878A8','Pink':'E9A7BD','Light Gray':'C3C7C5','Black':'303332','Jade White':'EDECE2','Brown':'86583F','Turquoise':'57B5B9','Indigo Purple':'675E8F','Pumpkin Orange':'DC8240','Cocoa Brown':'805746','Bronze':'8D7951','Gray':'929998','Blue Gray':'8099A4','Cobalt Blue':'3E65AB','Purple':'8A6BA3'},
  'PLA Matte':{'Mandarin Orange':'E58C43','Scarlet Red':'BE4940','Ivory White':'F0EAD8','Apple Green':'ABD266','Dark Green':'426653','Dark Chocolate':'553D32','Caramel':'BF8E5D','Dark Red':'874747','Lilac Purple':'B09AC5','Terracotta':'B67155','Dark Brown':'694936','Charcoal':'3B3B39','Bone White':'DDD7C6','Sakura Pink':'E8B9BD','Lemon Yellow':'E9D96A','Latte Brown':'B49B83','Desert Tan':'C7B895','Ice Blue':'A7C5D5','Marine Blue':'426B87','Ash Gray':'A8AAA3'}
 };
 const normal=value=>String(value||'').trim().toLowerCase().replace(/\bgrey\b/g,'gray').replace(/\s+/g,' ');
 const validHex=value=>typeof value==='string'&&/^#[a-f0-9]{6}$/i.test(value);
 function range(row){
  if(!['bambu','bambu lab'].includes(normal(row.brand)))return null;
  let product=normal(row.product).replace(/^bambu(?: lab)? /,'');
  product=({'pla matt':'pla matte','matte pla':'pla matte','matt pla':'pla matte','pla standard':'pla basic','basic pla':'pla basic'})[product]||product;
  return ranges.find(entry=>normal(entry.product)===product&&normal(entry.material)===normal(row.material)&&(!row.finish||row.finish==='unknown'||row.finish===entry.finish))||null;
 }
 function shades(row){const entry=range(row);return entry?Object.keys(entry.colours):[]}
 function match(row){
  const entry=range(row);if(!entry)return null;
  const name=normal(row.colour).replace(entry.finish==='matte'?/^matte /:/^$/,'');
  const colour=Object.keys(entry.colours).find(value=>normal(value)===name);
  return colour?{brand:'Bambu Lab',product:entry.product,colour,hex:'#'+entry.colours[colour],url:entry.url,checkedAt,legacyHex:legacy[entry.product]?.[colour]?'#'+legacy[entry.product][colour]:null}:null;
 }
 function resolve(row){
  const found=match(row),hex=validHex(row.hex)?row.hex.toUpperCase():row.hex||'';
  const eligible=row.hexMode==='auto'||!validHex(hex)||found&&(hex===found.hex||hex===found.legacyHex&&row.retailer!=='Added manually');
  if(row.hexMode!=='manual'&&found&&eligible)return {...row,hex:found.hex,savedHex:row.savedHex||hex,hexMode:'auto',colourSource:{kind:'manufacturer',label:'Manufacturer colour',url:found.url,checkedAt}};
  return {...row,hex,colourSource:{kind:row.hexMode==='manual'?'manual':'estimated',label:row.hexMode==='manual'?'Custom colour':'Estimated colour'}};
 }
 function source(row){
  const members=row.members||[row],sources=members.map(member=>resolve(member).colourSource);
  const first=sources[0];return sources.every(value=>value.kind===first.kind&&value.url===first.url)?first:{kind:'mixed',label:'Mixed colour sources'};
 }
 const api={ranges,checkedAt,match,shades,resolve,source,validHex};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.FilamentColours=api;
})(typeof globalThis==='object'?globalThis:this);
