'use strict';
window.CostImportReview={
 render(row,index,items,onChange){
  const entry=document.createElement('fieldset');entry.className='entry cost-entry';
  const legend=document.createElement('legend'),choice=document.createElement('label');choice.className='check';
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=row.selected;
  const title=document.createElement('span');title.textContent='Cost update '+(index+1);choice.append(checkbox,title);legend.append(choice);entry.append(legend);
  const identity=document.createElement('p');identity.className='cost-identity';identity.textContent=[row.spool.brand,row.spool.product,row.spool.colour].filter(Boolean).join(' · ')||'Manual cost update';entry.append(identity);
  const found=CostImport.match(row.spool,items),hint=document.createElement('p');hint.className='hint';hint.textContent=found.reason;entry.append(hint);
  const incoming=document.createElement('p');incoming.className='hint';incoming.textContent='Source: '+[row.spool.retailer,row.spool.order?'order '+row.spool.order:'',row.spool.date||'Purchase date not supplied'].filter(Boolean).join(' · ');entry.append(incoming);
  const targetLabel=document.createElement('label');targetLabel.textContent='Update this existing purchase';
  const target=document.createElement('select');target.setAttribute('aria-label','Existing purchase for cost update '+(index+1));
  const empty=document.createElement('option');empty.value='';empty.textContent='Choose the original purchase…';target.append(empty);
  const suggested=new Set(found.candidates.map(item=>item.id));
  for(const [caption,choices] of [['Suggested purchases',items.filter(item=>suggested.has(item.id))],['Other purchases — select only after checking',items.filter(item=>!suggested.has(item.id))]]){
   if(!choices.length)continue;const group=document.createElement('optgroup');group.label=caption;
   for(const item of choices){const option=document.createElement('option');option.value=item.id;option.textContent=[item.brand,item.product,item.colour,item.date||'No date',item.order?'Order '+item.order:'No order reference',item.packaging,item.weightGrams?item.weightGrams+' g':'Unknown weight',item.spools==null?'Unknown rolls':item.spools+' original rolls'].join(' · ');group.append(option)}target.append(group);
  }
  target.value=row.costTarget||'';targetLabel.append(target);entry.append(targetLabel);
  const purchase=document.createElement('p');purchase.className='hint';entry.append(purchase);
  const current=document.createElement('p');current.className='cost-current';entry.append(current);
  const grid=document.createElement('div');grid.className='fields';
  const amountLabel=document.createElement('label');amountLabel.textContent='New cost per roll';const amount=document.createElement('input');amount.type='number';amount.min='0';amount.max='100000';amount.step='0.01';amount.placeholder='Not found — enter from receipt';amount.value=row.spool.costPerRoll??'';amountLabel.append(amount);
  const currencyLabel=document.createElement('label');currencyLabel.textContent='Currency';const currency=document.createElement('select');
  for(const value of ['',...SpoolCost.currencies]){const option=document.createElement('option');option.value=value;option.textContent=value||'Choose…';currency.append(option)}currency.value=row.spool.costCurrency||'';currencyLabel.append(currency);grid.append(amountLabel,currencyLabel);entry.append(grid);
  const replacement=document.createElement('label');replacement.className='check';const replace=document.createElement('input');replace.type='checkbox';replace.checked=row.replaceExisting;replacement.append(replace,document.createTextNode('Replace the existing price for this purchase'));entry.append(replacement);
  const feedback=document.createElement('p');feedback.className='hint';feedback.setAttribute('role','status');entry.append(feedback);
  function update(){
   const item=items.find(item=>item.id===row.costTarget),saved=SpoolCost.purchase(item);
   purchase.textContent=item?[item.brand,item.product,item.colour,item.date||'No purchase date',item.order?'Order '+item.order:'No order reference',item.packaging,item.weightGrams?item.weightGrams+' g':'Unknown weight',item.spools==null?'Unknown roll count':item.spools+' original rolls'].join(' · '):'';
   current.textContent=item?'Current cost: '+(saved?saved.currency+' '+saved.amount.toFixed(2)+' per roll · '+saved.source:'Unknown')+' · '+(item.retailer||'No retailer')+' · Entry '+item.id:'No purchase selected. This entry will not create stock.';
   replacement.hidden=!saved;replace.checked=row.replaceExisting;checkbox.checked=row.selected;amount.required=currency.required=target.required=row.selected;
   try{CostImport.change(row,items);feedback.textContent=row.selected?'Selected: only price and currency will change.':'Ready for review. Select this cost update to include it.'}catch(error){feedback.textContent=error.message}
  }
  target.onchange=()=>{row.costTarget=target.value;row.replaceExisting=false;row.selected=false;update();onChange()};
  amount.oninput=()=>{row.spool.costPerRoll=amount.value===''?null:Number(amount.value);update();onChange()};
  currency.onchange=()=>{row.spool.costCurrency=currency.value;update();onChange()};
  replace.onchange=()=>{row.replaceExisting=replace.checked;update();onChange()};
  checkbox.onchange=()=>{row.selected=checkbox.checked;update();onChange()};
  const details=document.createElement('details'),summary=document.createElement('summary'),source=document.createElement('pre');summary.textContent='Show source text';source.textContent=row.source||'Manually entered';details.append(summary,source);entry.append(details);
  update();return entry;
 }
};
