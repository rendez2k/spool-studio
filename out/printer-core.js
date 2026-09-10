(function(root){
 'use strict';
 const materials=['PLA','PETG','ABS','ASA','TPU','PA','PC','PVA','HIPS'];
 function profile(item){
  let finish=item?.finish;
  if(!finish){
   const product=String(item?.product||'').trim().toLowerCase().replace(/^bambu(?: lab)?\s+/,'').replace(/\s+/g,' ');
   const material=String(item?.material||'').toLowerCase();
   for(const [label,kind] of Object.entries({basic:'standard',standard:'standard',normal:'standard',matt:'matte',matte:'matte',silk:'silk'}))if(product===material+' '+label||product===label+' '+material)finish=kind;
  }
  const subtype={standard:'Basic',matte:'Matte',silk:'Silk'}[finish];
  if(!materials.includes(item?.material)||!subtype||!/^#[a-f0-9]{6}$/i.test(item?.hex||''))throw Error('This filament needs a supported material, standard/matte/silk finish and a valid colour before sending. PLA+ and unknown blends are not silently substituted.');
  return {vendor:'Generic',material:item.material,subtype,rgba:item.hex.slice(1).toUpperCase()+'FF'};
 }
 function tool(value){
  if(!value||typeof value.vendor!=='string'||value.vendor.length>80||typeof value.material!=='string'||value.material.length>40||typeof value.subtype!=='string'||value.subtype.length>80||!/^([A-F0-9]{8})$/.test(value.rgba||'')||!Number.isSafeInteger(value.spoolmanId)||value.spoolmanId<0||typeof value.present!=='boolean')throw Error('Unreadable printer tool metadata.');
  return {vendor:value.vendor,material:value.material,subtype:value.subtype,rgba:value.rgba,spoolmanId:value.spoolmanId,present:value.present};
 }
 function snapshot(value){
  if(!value||typeof value.ready!=='boolean'||typeof value.supported!=='boolean'||typeof value.canLink!=='boolean'||!Array.isArray(value.tools)||value.tools.length!==4)throw Error('Unreadable printer status.');
  return {ready:value.ready,supported:value.supported,canLink:value.canLink,tools:value.tools.map(tool)};
 }
 function same(left,right){return JSON.stringify(tool(left))===JSON.stringify(tool(right))}
 function matches(current,expected,spoolmanId){return current.vendor===expected.vendor&&current.material===expected.material&&current.subtype===expected.subtype&&current.rgba===expected.rgba&&current.spoolmanId===spoolmanId}
 const api={profile,tool,snapshot,same,matches};if(typeof module==='object'&&module.exports)module.exports=api;else root.PrinterCore=api;
})(typeof globalThis==='object'?globalThis:this);
