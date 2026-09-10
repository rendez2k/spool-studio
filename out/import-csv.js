(function(root){
 'use strict';
 const costing=typeof module==='object'&&module.exports?require('./cost-core.js'):root.SpoolCost;
 const colours=typeof module==='object'&&module.exports?require('./colour-catalog.js'):root.FilamentColours;
 const columns=['brand','product','material','finish','colour','hex','spools','weightGrams','packaging','date','notes'];
 const maxEntries=500,maxCharacters=1000000,maxBytes=1000000;
 function parse(input){
  if(typeof input!=='string'||input.length>maxCharacters)throw Error('Use at most 1,000,000 characters and 500 entries per CSV.');
  const text=input.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  if(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFD]/.test(text))throw Error('Save the sheet as UTF-8 CSV, not an Excel workbook or UTF-16 text.');
  const first=text.split('\n')[0],delimiter=first.includes(';')&&!first.includes(',')?';':',';
  const records=[];let record=[],cell='',quoted=false,closed=false;
  const endCell=()=>{record.push(cell.trim());cell='';closed=false;};
  const endRecord=()=>{endCell();if(record.some(value=>value!==''))records.push(record);record=[];if(records.length>maxEntries+1)throw Error('Split the CSV into files of at most 500 entries, each with the same header.');};
  for(let index=0;index<text.length;index++){
   const character=text[index];
   if(quoted){if(character==='"'){if(text[index+1]==='"'){cell+='"';index++;}else{quoted=false;closed=true;}}else cell+=character;continue;}
   if(character===delimiter){endCell();continue;}
   if(character==='\n'){endRecord();continue;}
   if(closed){if(character===' '||character==='\t')continue;throw Error('Unexpected text after a quoted CSV field.');}
   if(character==='"'){if(cell.trim())throw Error('Quotes must surround the entire CSV field.');cell='';quoted=true;continue;}
   cell+=character;
  }
  if(quoted)throw Error('A quoted CSV field is not closed.');
  endRecord();
  const header=records.shift();
  if(!header||new Set(header).size!==header.length||header.some(key=>![...columns,'costPerRoll','costCurrency'].includes(key))||columns.slice(0,-1).some(key=>!header.includes(key)))throw Error('Use the CSV template headers exactly: '+columns.join(',')+'. Optional: costPerRoll,costCurrency.');
  return records.map((record,index)=>{
   if(record.length!==header.length)throw Error('CSV entry '+(index+1)+' has the wrong number of columns. Quote values containing commas.');
   if(record.some(value=>/^[=+@-]/.test(value)))throw Error('CSV entry '+(index+1)+' contains a formula-like value. Export plain values, not spreadsheet formulas.');
   const spool=Object.fromEntries(header.map((key,column)=>[key,record[column]]));
   spool.notes=spool.notes||'';spool.finish=spool.finish||'unknown';spool.packaging=spool.packaging||'unknown';
   if(header.includes('costPerRoll')||header.includes('costCurrency')){
    if(spool.costPerRoll&&!/^\d+(?:\.\d{1,2})?$/.test(spool.costPerRoll))throw Error('Entry '+(index+1)+': use a plain decimal cost per roll, not a currency symbol or line total.');
    Object.assign(spool,costing.fields({costPerRoll:spool.costPerRoll?Number(spool.costPerRoll):null,costCurrency:spool.costCurrency||''}));
   }
   const limits={brand:80,product:100,colour:80,notes:500};
   for(const [key,max] of Object.entries(limits))if(spool[key].length>max)throw Error('Entry '+(index+1)+': '+key+' exceeds '+max+' characters.');
   for(const [key,max] of [['spools',500],['weightGrams',10000]]){
    if(spool[key]!==''&&(!/^\d+$/.test(spool[key])||Number(spool[key])<1||Number(spool[key])>max))throw Error('Entry '+(index+1)+': '+key+' must be a whole number from 1 to '+max+', or blank.');
    spool[key]=spool[key]===''?null:Number(spool[key]);
   }
   if(spool.hex&&!/^#[a-f\d]{6}$/i.test(spool.hex))throw Error('Entry '+(index+1)+': hex must be #RRGGBB or blank.');
   if(spool.date&&(!/^\d{4}-\d{2}-\d{2}$/.test(spool.date)||!Number.isFinite(Date.parse(spool.date+'T00:00:00Z'))||new Date(spool.date+'T00:00:00Z').toISOString().slice(0,10)!==spool.date))throw Error('Entry '+(index+1)+': use a valid YYYY-MM-DD date or leave it blank.');
   const warnings=['Check the source email: CSV contents are not verified purchase or stock records.'];
   spool.hexMode=spool.hex?'manual':'auto';
   Object.assign(spool,colours.resolve(spool));
   if(!spool.hex)warnings.push('No verified exact shade found; enter and review a swatch before saving.');
   if(!spool.date)warnings.push('No purchase date supplied; today is used as the added date.');
   return {source:header.map(key=>key+': '+(record[header.indexOf(key)]||'')).join('\n'),spool,warnings};
  });
 }
 const api={parse,columns,maxEntries,maxCharacters,maxBytes};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FilamentCsv=api;
})(typeof globalThis!=='undefined'?globalThis:this);
