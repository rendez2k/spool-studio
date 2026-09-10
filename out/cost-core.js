(function(root){
 'use strict';
 const currencies=['GBP','EUR','USD','CAD','AUD','NZD','CHF','JPY'];
 function fields(input){
  if(input.costPerRoll===undefined&&input.costCurrency===undefined)return {};
  const cost=input.costPerRoll??null,currency=input.costCurrency||'';
  if(cost!==null&&(typeof cost!=='number'||!Number.isFinite(cost)||cost<0||cost>100000||Math.abs(cost*100-Math.round(cost*100))>0.000001))throw Error('Cost per roll must be 0–100000 with at most two decimal places, or blank.');
  if(currency&&!currencies.includes(currency))throw Error('Choose a supported cost currency.');
  if(cost!==null&&!currency)throw Error('Choose a currency for the spool cost.');
  return {costPerRoll:cost,costCurrency:currency};
 }
 function purchase(row){
  if(!row)return null;
  if(Object.hasOwn(row,'costPerRoll')){
   let saved;try{saved=fields(row)}catch{return null}
   return saved.costPerRoll==null?null:{amount:saved.costPerRoll,currency:saved.costCurrency,source:'Saved cost per roll'};
  }
  if(typeof row.lineTotal==='number'&&Number.isFinite(row.lineTotal)&&row.lineTotal>=0&&Number.isInteger(row.spools)&&row.spools>0&&currencies.includes(row.currency))return {amount:row.lineTotal/row.spools,currency:row.currency,source:'Imported line total ÷ original roll count'};
  return null;
 }
 function estimate(grams,rows,fallback){
  if(grams===null||grams===''||grams===undefined)return {error:'Enter slicer grams'};
  if(typeof grams!=='number'||!Number.isFinite(grams)||grams<0||grams>100000)return {error:'Use 0–100000 grams'};
  if(grams===0)return {zero:true};
  if(!rows.length)return {error:'Choose an available filament'};
  const rates=[];let assumed=false;
  for(const row of rows){
   const price=purchase(row);
   if(!price){
    if(!fallback||!Number.isFinite(fallback.perKg)||fallback.perKg<0||fallback.perKg>100000||!currencies.includes(fallback.currency))return {error:'Add a cost and currency to every matching purchase'};
    rates.push({amount:grams*fallback.perKg/1000,currency:fallback.currency});assumed=true;continue;
   }
   if(!Number.isFinite(row.weightGrams)||row.weightGrams<=0)return {error:'Add the original grams per roll'};
   rates.push({amount:grams*price.amount/row.weightGrams,currency:price.currency});
  }
  if(new Set(rates.map(rate=>rate.currency)).size!==1)return {error:'Matching purchases use different currencies'};
  return {currency:rates[0].currency,min:Math.min(...rates.map(rate=>rate.amount)),max:Math.max(...rates.map(rate=>rate.amount)),...(assumed?{assumed:true}:{})};
 }
 function total(estimates){
  const currencies={};let missing=0;
  for(const estimate of estimates){if(estimate.error){missing++;continue}if(estimate.zero)continue;const sum=currencies[estimate.currency]||(currencies[estimate.currency]={min:0,max:0});sum.min+=estimate.min;sum.max+=estimate.max}
  return {currencies,missing};
 }
 function fromText(source){
  const matches=[...source.matchAll(/^\s*(?:cost|price) per (?:roll|spool)\s*:\s*(GBP|EUR|USD|CAD|AUD|NZD|CHF|JPY|£|€)\s*(\d+(?:\.\d{1,2})?)\s*$/gim)];
  if(matches.length!==1)return {};
  const currency=({ '£':'GBP','€':'EUR' })[matches[0][1]]||matches[0][1].toUpperCase();
  return fields({costPerRoll:Number(matches[0][2]),costCurrency:currency});
 }
 const api={currencies,fields,purchase,estimate,total,fromText};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.SpoolCost=api;
})(typeof globalThis==='object'?globalThis:this);
