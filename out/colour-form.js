'use strict';
{
 const node=id=>document.getElementById(id);
 let hexMode='auto',savedHex='';
 function row(){return Object.fromEntries(['brand','product','material','finish','colour','hex'].map(key=>[key,node('spool-'+key).value]))}
 function update(){
  const current=row(),found=FilamentColours.match(current);
  node('spool-shades').replaceChildren();
  for(const shade of FilamentColours.shades(current)){const option=document.createElement('option');option.value=shade;node('spool-shades').append(option)}
  if(hexMode==='auto'&&found){node('spool-hex').value=found.hex;node('spool-sample').value=found.hex}
  node('spool-colour-source').textContent=hexMode==='manual'?'Custom colour — kept when the catalogue updates.':found?'Manufacturer colour · '+found.hex+' · screen previews still vary from real prints.':'Estimated colour — no verified exact shade in the catalogue yet.';
  const link=node('spool-colour-reference');link.hidden=!found;if(found)link.href=found.url;
  node('spool-auto-colour').hidden=hexMode==='auto';
  node('spool-saved-colour').hidden=!FilamentColours.validHex(savedHex)||savedHex.toUpperCase()===node('spool-hex').value.toUpperCase();
 }
 function reset(value){
  const resolved=value?FilamentColours.resolve(value):null;
  hexMode=resolved?.hexMode||(value&&FilamentColours.validHex(value.hex)?'manual':'auto');savedHex=value?.savedHex||value?.hex||'';update();
 }
 for(const key of ['brand','product','material','finish','colour'])node('spool-'+key).addEventListener('input',update);
 for(const key of ['hex','sample'])node('spool-'+key).addEventListener('input',()=>{hexMode='manual';update()});
 node('spool-auto-colour').onclick=()=>{hexMode='auto';update()};
 node('spool-saved-colour').onclick=()=>{hexMode='manual';node('spool-hex').value=savedHex.toUpperCase();node('spool-sample').value=savedHex;update()};
 window.ColourForm={reset,update,mode:()=>hexMode};
}
