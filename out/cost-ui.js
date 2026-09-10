'use strict';
const SpoolCostUi=(()=>{
 const drafts=new WeakMap();
 const money=(amount,currency)=>new Intl.NumberFormat('en-GB',{style:'currency',currency}).format(amount);
 const range=value=>money(value.min,value.currency)+(Math.abs(value.max-value.min)>0.000001?'–'+money(value.max,value.currency):'');
 function render(project,slots){
  const host=document.querySelector('.match-project');if(!host)return;
  const panel=document.createElement('section');panel.className='cost-panel';panel.setAttribute('aria-label','Filament cost estimate');
  const heading=document.createElement('h4');heading.textContent='Filament cost estimate';
  const help=document.createElement('p');help.textContent='Enter sliced grams per colour, including supports and purge/waste. Use totals for the whole project or one plate consistently. These are manual estimates, not grams extracted from the 3MF; changing the preview does not change them.';
  const list=document.createElement('div');list.className='cost-slots';
  const summary=document.createElement('p');summary.className='cost-total';summary.setAttribute('role','status');summary.setAttribute('aria-live','polite');
  const note=document.createElement('p');note.className='cost-note';note.textContent='Uses your chosen filament, otherwise the top same-finish match. Different purchase prices produce a range; currencies are never converted. Filament only—not electricity, labour, failed prints or selling price. Grams stay in this tab until you reload.';
  panel.append(heading,help,list,summary,note);host.querySelector('.match-summary').after(panel);
  let draft=drafts.get(project);if(!draft){draft=new Map();drafts.set(project,draft)}
  const budget=document.createElement('div');budget.className='cost-budget';
  const toggleLabel=document.createElement('label'),toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=draft.get('useFallback')||false;toggleLabel.append(toggle,document.createTextNode(' Use an assumed price where purchase cost is unknown'));
  const rateLabel=document.createElement('label'),rate=document.createElement('input');rateLabel.textContent='Assumed price per kg (GBP)';rate.type='number';rate.min='0';rate.max='100000';rate.step='0.01';rate.value=draft.get('fallbackRate')??'15';rate.disabled=!toggle.checked;rateLabel.append(rate);budget.append(toggleLabel,rateLabel);list.before(budget);
  toggle.onchange=()=>{draft.set('useFallback',toggle.checked);rate.disabled=!toggle.checked;update()};
  rate.oninput=()=>{draft.set('fallbackRate',rate.value);update()};
  const entries=[];
  for(const {required,result} of slots.filter(slot=>slot.required.included)){
   const candidate=selectedNfcCandidate(required,result)||result.same[0];
   const originals=candidate?(candidate.row.members||[candidate.row]).map(row=>items.find(item=>item.id===row.id)).filter(Boolean):[];
   const row=document.createElement('div');row.className='cost-slot';
   const label=document.createElement('label');label.textContent='Colour '+required.slot+' · '+(candidate?candidate.row.colour:'No match');
   const input=document.createElement('input');input.type='number';input.min='0';input.max='100000';input.step='0.01';input.placeholder='Slicer grams';input.value=draft.get(required.slot)??'';label.append(input);
   const output=document.createElement('span');output.className='cost-value';
   row.append(label,output);list.append(row);
   const entry={input,output,originals};entries.push(entry);
   input.oninput=()=>{draft.set(required.slot,input.value);update()};
  }
  function update(){
   const estimates=entries.map(entry=>{
    const fallback=toggle.checked?{perKg:rate.value===''||rate.validity?.badInput?NaN:Number(rate.value),currency:'GBP'}:null;
    const estimate=SpoolCost.estimate(entry.input.validity?.badInput?NaN:entry.input.value===''?null:Number(entry.input.value),entry.originals,fallback);
    entry.output.textContent=estimate.error||(estimate.zero?'No filament used':range(estimate)+(estimate.assumed?' · assumed price':''));return estimate;
   });
   const total=SpoolCost.total(estimates);
   const amounts=Object.entries(total.currencies).map(([currency,value])=>range({...value,currency}));
   summary.textContent=!entries.length?'Select colours to estimate.':(total.missing?'Partial subtotal: ':'Estimated filament cost: ')+(amounts.length?amounts.join(' + '):total.missing?'not yet available':'0 (no filament used)')+(total.missing?' · '+total.missing+' colour(s) need grams, price or weight.':'');
   if(estimates.some(estimate=>estimate.assumed))summary.textContent+=' Includes assumed prices, not recorded spending.';
  }
  update();
 }
 return {render};
})();
