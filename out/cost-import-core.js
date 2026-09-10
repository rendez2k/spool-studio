(function(root){
 'use strict';
 const costing=typeof module==='object'&&module.exports?require('./cost-core.js'):root.SpoolCost;
 const normal=value=>String(value??'').trim().toLowerCase().replace(/\s+/g,' ');
 function references(input){
  const result={};
  for(const [key,limit] of [['entryId',160],['order',120],['retailer',100]]){
   const value=input[key]??'';
   if(typeof value!=='string'||value.length>limit||/[\u0000-\u001f]/.test(value))throw Error('Check the '+key+' purchase reference.');
   result[key]=value.trim();
  }
  return result;
 }
 function fromText(source){
  const result={};
  for(const [key,label] of [['entryId','Entry ID'],['order','Order(?: number| ID)?'],['retailer','Retailer']]){
   const matches=[...source.matchAll(new RegExp('^\\s*'+label+'\\s*:\\s*([^\\n]+)$','gim'))];
   if(matches.length===1)result[key]=matches[0][1].trim();
  }
  return references(result);
 }
 function match(spool,items){
  const reference=references(spool);
  if(reference.entryId){
   const found=items.filter(item=>item.id===reference.entryId);
   return {candidates:found,strong:found.length===1,reason:found.length?'Exact saved entry ID. Review its purchase details.':'Entry ID not found in this account. Choose a purchase manually or leave unselected.'};
  }
  const variants=items.filter(item=>['brand','product','material','finish','colour'].every(key=>normal(spool[key])&&normal(spool[key])===normal(item[key])));
  const orders=reference.order&&reference.retailer?variants.filter(item=>normal(item.order)===normal(reference.order)&&normal(item.retailer)===normal(reference.retailer)&&spool.weightGrams>0&&spool.weightGrams===item.weightGrams&&['spooled','refill'].includes(spool.packaging)&&spool.packaging===item.packaging):[];
  if(orders.length)return {candidates:orders,strong:orders.length===1,reason:orders.length===1?'Order, retailer and exact variant match. Review before saving.':'More than one entry matches this order and variant. Choose the original purchase.'};
  return {candidates:variants,strong:false,reason:variants.length?'Similar filament is not proof of the same purchase. Choose the original entry using its order and date.':'No purchase match found. Choose an existing entry manually or leave unselected. Nothing will be added.'};
 }
 function price(spool){try{const value=costing.fields(spool);return value.costPerRoll==null?null:value}catch{return null}}
 function prepare(row,items){
  const found=match(row.spool,items),target=found.strong?found.candidates[0]:null;
  row.costTarget=target?.id||'';row.replaceExisting=false;row.selected=Boolean(target&&!costing.purchase(target)&&price(row.spool));return row;
 }
 function change(row,items){
  const target=items.find(item=>item.id===row.costTarget);
  if(!target)throw Error('Choose an existing purchase for every selected cost update.');
  const cost=price(row.spool);if(!cost)throw Error('Enter a cost per roll and currency for every selected update. Blank costs are not saved.');
  if(costing.purchase(target)&&row.replaceExisting!==true)throw Error('This purchase already has a cost. Confirm replacement for this entry or leave it unselected.');
  return {id:target.id,...cost,replaceExisting:row.replaceExisting===true};
 }
 function changes(rows,items){
  const selected=rows.filter(row=>row.selected).map((row,index)=>{try{return change(row,items)}catch(error){error.entryIndex=index;throw error}});
  if(new Set(selected.map(row=>row.id)).size!==selected.length)throw Error('The same purchase is selected more than once. Keep only one cost update for each entry.');
  return selected;
 }
 function apply(data,input){
  if(input.reviewed!==true||!Array.isArray(input.changes)||!input.changes.length||input.changes.length>500)throw Error('Review 1–500 cost updates before saving.');
  const seen=new Set();
  const updates=input.changes.map((change,index)=>{
   try{
    if(!change||typeof change.id!=='string'||Object.keys(change).some(key=>!['id','costPerRoll','costCurrency','replaceExisting'].includes(key))||typeof change.replaceExisting!=='boolean')throw Error('Only reviewed cost fields can be updated.');
    if(seen.has(change.id))throw Error('Select each purchase only once.');seen.add(change.id);
    const target=data.items.find(item=>item.id===change.id);if(!target)throw Error('Purchase not found in your library. No new stock can be added in costs-only mode.');
    const cost=costing.fields(change);if(cost.costPerRoll==null)throw Error('A blank price cannot erase a saved cost.');
    if(costing.purchase(target)&&!change.replaceExisting)throw Error('This purchase already has a cost. Review and explicitly confirm replacement.');
    return {target,cost};
   }catch(error){error.entryIndex=index;throw error}
  });
  for(const {target,cost} of updates)Object.assign(target,cost);
 }
 const api={references,fromText,match,price,prepare,change,changes,apply};if(typeof module==='object'&&module.exports)module.exports=api;else root.CostImport=api;
})(typeof globalThis==='object'?globalThis:this);
