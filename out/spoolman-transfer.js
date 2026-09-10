'use strict';
(function(root){
 function manifest(library,origin){
  if(!library?.accountKey||!Array.isArray(library.reels)||!library.reels.length)throw Error('Assign permanent IDs before exporting to Spoolman.');
  const materials={};
  const spools=library.reels.filter(reel=>!reel.used).map(reel=>{
   const item=library.items.find(item=>item.id===reel.itemId);
   if(!item)throw Error('A spool has no matching filament entry. Refresh the library.');
   materials[item.material]={density:null,diameter:null};
   return {reelId:reel.id,number:reel.number,brand:item.brand,product:item.product,material:item.material,finish:item.finish||'unknown',colour:item.colour,hex:item.hex,weightGrams:item.weightGrams??null,remainingGrams:reel.remainingGrams,spoolmanId:reel.spoolmanId};
  });
  return {format:'spool-studio-spoolman-v1',origin,accountKey:library.accountKey,spoolmanUrl:'http://localhost:7912',materials,spools};
 }
 function mappings(value,library,origin){
  if(value?.format!=='spool-studio-mappings-v1'||value.origin!==origin||value.accountKey!==library.accountKey)throw Error('Use a mapping file exported for this site and signed-in account.');
  if(!Array.isArray(value.mappings)||!value.mappings.length||value.mappings.length>5000)throw Error('The file must contain 1–5000 mappings.');
  const ids=new Set(),numbers=new Set();
  return value.mappings.map(mapping=>{
   const reel=library.reels?.find(reel=>reel.id===mapping.id);
   if(!reel||!Number.isSafeInteger(mapping.spoolmanId)||mapping.spoolmanId<1||ids.has(mapping.id)||numbers.has(mapping.spoolmanId))throw Error('The mapping file contains missing, invalid or duplicate spool IDs.');
   ids.add(mapping.id);numbers.add(mapping.spoolmanId);return {id:mapping.id,spoolmanId:mapping.spoolmanId};
  });
 }
 const api={manifest,mappings};if(typeof module==='object'&&module.exports)module.exports=api;else root.SpoolmanTransfer=api;
})(typeof globalThis==='object'?globalThis:this);
