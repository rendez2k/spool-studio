(function(root){
 'use strict';
 const costing=typeof module==='object'&&module.exports?require('./cost-core.js'):root.SpoolCost;
 const catalogue=typeof module==='object'&&module.exports?require('./colour-catalog.js'):root.FilamentColours;
 const materials=/\bPLA\s*\+|\b(PLA\s+Plus|PETG|PLA|ABS|ASA|TPU|PA|PC|PVA|HIPS)\b/i;
 const brands=/\b(Bambu(?:\s+Lab)?|SUNLU|ELEGOO|eSUN|Polymaker|Prusament|Overture|Anycubic|Creality|Eryone|JAYO|AMOLEN)\b/i;
 const finishes=/\b(matte|matt|basic|standard|silk|marble|sparkle|wood|glow|satin|metallic)\b/i;
 const colours={black:'#202020',white:'#F5F5F0',grey:'#9FA3A5',gray:'#9FA3A5',red:'#D63D35',orange:'#EF8D34',yellow:'#EEDB45',green:'#5B9E55',blue:'#347AC0',purple:'#8855A3',pink:'#E7A1BC',brown:'#926B50',beige:'#D3BC98',cream:'#E9DFC3',silver:'#A9ACAF',gold:'#C5A34D',clear:'#E8ECEC'};
 const material=text=>{
  const found=text.match(materials)?.[0]||'';
  return /^PLA\s*(\+|Plus)$/i.test(found)?'PLA+':found.toUpperCase();
 };
 const normal=value=>String(value||'').toLowerCase().replace(/\s+/g,' ').trim();
 function parse(text){
  if(typeof text!=='string'||text.length>60000)throw Error('Use at most 60,000 characters per import.');
  const lines=text.replace(/\r\n?/g,'\n').split('\n').map(line=>line.trim()).filter(Boolean);
  const blocks=[];let active=[],previous='';
  for(const line of lines){
   const starts=Boolean(material(line))&&(brands.test(line)||/\bfilament\b/i.test(line)||(!active.length&&/^(PLA|PETG|ABS|ASA|TPU|PA|PC|PVA|HIPS)(?:\b|\+)/i.test(line)));
   if(starts&&active.length){blocks.push(active.join('\n'));active=[]}
   if(starts&&!active.length&&brands.test(previous)&&!material(previous))active.push(previous);
   if(starts||active.length)active.push(line);
   previous=line;
  }
  if(active.length)blocks.push(active.join('\n'));
  if(blocks.length>500)throw Error('Split this into batches of at most 500 product entries.');
  return blocks.map(source=>{
   const foundMaterial=material(source),foundFinish=source.match(finishes)?.[1]?.toLowerCase()||'unknown';
   const finish=({matt:'matte',basic:'standard',metallic:'metal'})[foundFinish]||foundFinish;
   const brand=source.match(brands)?.[0]||'';
   const named=source.match(/(?:colou?r|shade)\s*:\s*([^\n;|]{1,80})/i)?.[1]?.trim();
   const detected=Object.keys(colours).filter(colour=>new RegExp('\\b'+colour+'\\b','i').test(source));
   let colour=named||(detected.length===1?detected[0][0].toUpperCase()+detected[0].slice(1):'');
   const hex=source.match(/#[a-f0-9]{6}\b/i)?.[0]||colours[Object.keys(colours).find(value=>new RegExp('\\b'+value+'\\b','i').test(colour))]||'';
   const quantity=source.match(/\b(?:qty|quantity)\s*[:x]?\s*(\d{1,3})\b/i);
   const pack=source.match(/\b(\d{1,3})\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g)\b/i);
   const rolls=source.match(/\b(\d{1,3})\s*(?:rolls|spools)\b/i)||source.match(/\bpack\s+of\s+(\d{1,3})\b/i);
   const bundle=/\b(bundle|multipack|multi.?pack|pack of)\b/i.test(source)||detected.length>1;
   const count=pack?Number(pack[1]):rolls?Number(rolls[1]):null;
   const spools=count!==null?count*(quantity?Number(quantity[1]):1):bundle?null:quantity?Number(quantity[1]):null;
   const weight=pack?pack.slice(2):source.match(/\b(\d+(?:\.\d+)?)\s*(kg|g)\b/i)?.slice(1);
   const weightGrams=weight&&(!bundle||pack)?Math.round(Number(weight[0])*(weight[1].toLowerCase()==='kg'?1000:1)):null;
   const packaging=/\b(refill|without (?:a )?spool|no spool)\b/i.test(source)?'refill':/\b(with (?:a )?spool|on (?:a )?spool|spooled|spool included)\b/i.test(source)?'spooled':'unknown';
   const date=source.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0]||'';
   let profile=[foundMaterial,finish==='unknown'?'':finish==='standard'?'Basic':finish[0].toUpperCase()+finish.slice(1),source.match(/\b\d{2}A\b/i)?.[0]||''].filter(Boolean).join(' ');
   const finishWords=new Set((source.match(/\b(?:matte|matt|basic|standard|silk|marble|sparkle|wood|glow|satin|metallic)\b/gi)||[]).map(value=>({matt:'matte',basic:'standard'})[value.toLowerCase()]||value.toLowerCase()));
   const uncertainRange=/^bambu(?: lab)?$/i.test(brand)&&(/\b(?:gradient|silk|sparkle|marble|metal|metallic|wood|glow|aero|translucent|transparent|tough|lite|pro|plus|hf|cf|gf|pure|support|rapid|high speed|hs)\b/i.test(source)||finishWords.size>1);
   if(uncertainRange)profile+=' · verify range';
   const identity={brand,product:profile,material:foundMaterial,finish};
   if(!named){
    const text=' '+normal(source).replace(/\bgrey\b/g,'gray')+' ';
    const matches=catalogue.shades(identity).filter(shade=>text.includes(' '+normal(shade)+' '));
    const exact=matches.filter(shade=>!matches.some(other=>other!==shade&&normal(other).includes(normal(shade))));
    if(exact.length===1)colour=exact[0];
   }
   const warnings=['Text recognition can be wrong. Check each field before adding.'];
   if(uncertainRange)warnings.push('Product range has extra or conflicting qualifiers. Confirm the exact range before manufacturer colour lookup.');
   if(!named&&detected.length>1)warnings.push('Multiple colours detected: split this bundle into individual shades yourself.');
   const resolved=catalogue.resolve({...identity,colour,hex,hexMode:source.match(/#[a-f0-9]{6}\b/i)?'manual':'auto'});
   if(resolved.colourSource.kind==='estimated')warnings.push(hex?'Swatch is a broad colour estimate, not a manufacturer shade.':'Colour and swatch need entering.');
   if(spools===null)warnings.push('Roll count is not reliably stated; blank stays unknown.');
   if(!date)warnings.push('No purchase date found; today is used as the added date.');
   const costs=costing.fromText(source);
   if(costs.costPerRoll===undefined)warnings.push('Cost not inferred from totals or bundle prices. Enter cost per roll and currency if known.');
   return {source,warnings,spool:{...resolved,brand:/^bambu$/i.test(brand)?'Bambu Lab':brand,spools,weightGrams,packaging,date,notes:'',...costs}};
  });
 }
 function duplicates(spool,inventory){
  return inventory.filter(row=>['brand','material','colour'].every(key=>normal(row[key])===normal(spool[key]))&&normal(row.finish||'unknown')===normal(spool.finish)&&row.weightGrams===spool.weightGrams&&(!row.packaging||row.packaging===spool.packaging));
 }
 const api={parse,duplicates};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.FilamentImport=api;
})(typeof globalThis!=='undefined'?globalThis:this);
