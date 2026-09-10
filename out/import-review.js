(function(root){
 'use strict';
 function inspect(row,rows,items,costMode){
  const spool=row.spool;
  if(costMode){
   const target=items.find(item=>item.id===row.costTarget),price=root.CostImport.price(spool),saved=root.SpoolCost.purchase(target);
   const label=!target?'Choose purchase':!price?'Price missing':saved&&!row.replaceExisting?'Price already saved':'Ready to update';
   return {label,kind:label==='Ready to update'?'new':'review',matches:target?[target]:[],detail:target?'Only the selected purchase price will change.':root.CostImport.match(spool,items).reason};
  }
  const matches=root.FilamentImport.duplicates(spool,items);
  const repeated=root.FilamentImport.duplicates(spool,rows.filter(other=>other!==row).map(other=>other.spool)).length>0;
  const missing=['brand','product','material','colour','hex'].filter(key=>!String(spool[key]||'').trim());
  if(spool.hex&&!/^#[a-f0-9]{6}$/i.test(spool.hex))missing.push('valid hex');
  const unknown=['finish','packaging'].filter(key=>!spool[key]||spool[key]==='unknown');
  if(spool.spools==null)unknown.push('roll count');
  if(spool.weightGrams==null)unknown.push('weight');
  return {label:matches.length?'Similar stock in library':repeated?'Repeated in this import':missing.length||unknown.length?'Needs details':'New to library',kind:matches.length||repeated?'existing':missing.length||unknown.length?'review':'new',matches,detail:matches.length?'Possible duplicate, not proof of the same order. Check the purchases below before adding more.':repeated?'Another row describes similar filament. Keep only the entries you actually bought.':missing.length||unknown.length?'Check '+[...missing,...unknown].join(', ')+'.':'No similar saved entry found. Review the extracted values before saving.'};
 }
 function table(list,rows,items,page,pageSize,costMode,editor,onChange){
  const document=root.document,make=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element};
  const table=make('table');table.className='import-table';table.setAttribute('role','table');
  const caption=make('caption','Detected filament — review before saving');caption.className='sr-only';table.append(caption);
  const head=make('thead'),heading=make('tr');for(const title of ['Use','Filament','Rolls / weight','Cost per roll','Library check','Details']){const cell=make('th',title);cell.scope='col';heading.append(cell)}head.append(heading);table.append(head);
  const body=make('tbody');table.append(body);list.append(table);
  const refreshers=[],validators=[],openers=new Map();
  rows.slice(page*pageSize,(page+1)*pageSize).forEach((row,offset)=>{
   const index=page*pageSize+offset,summary=make('tr'),detailRow=make('tr'),detailCell=make('td');
   summary.className='import-summary';detailRow.className='import-detail';detailRow.hidden=true;detailCell.colSpan=6;detailRow.append(detailCell);
   const choice=make('input');choice.type='checkbox';choice.setAttribute('aria-label','Include entry '+(index+1));
   const selectCell=make('td');selectCell.className='import-choice';selectCell.append(choice);summary.append(selectCell);
   const identity=make('td'),swatch=make('span'),name=make('strong'),description=make('span');identity.dataset.label='Filament';swatch.className='import-swatch';swatch.setAttribute('aria-hidden','true');description.className='import-secondary';identity.append(swatch,name,description);summary.append(identity);
   const amount=make('td'),cost=make('td'),status=make('td'),action=make('td');amount.dataset.label='Rolls / weight';cost.dataset.label='Cost per roll';status.dataset.label='Library check';
   const badge=make('span'),note=make('span');note.className='import-secondary';status.append(badge,note);
   const toggle=make('button','Review');toggle.type='button';toggle.setAttribute('aria-label','Review entry '+(index+1));toggle.setAttribute('aria-controls','import-detail-'+index);detailCell.id='import-detail-'+index;action.append(toggle);summary.append(amount,cost,status,action);
   const matchInfo=make('div');matchInfo.className='import-match-info';
   const entry=editor(row,index,()=>{refreshAll();onChange()});detailCell.append(matchInfo,entry);
   const entryChoice=entry.querySelector('legend input[type="checkbox"]');
   if(entryChoice)entryChoice.closest('legend').hidden=true;entry.setAttribute('aria-label','Details for entry '+(index+1));
   function open(value){detailRow.hidden=!value;toggle.textContent=value?'Done':'Review';toggle.setAttribute('aria-expanded',String(value))}
   open(false);toggle.onclick=()=>open(detailRow.hidden);
   openers.set(index,()=>open(true));
   validators.push(()=>!row.selected||[...entry.querySelectorAll('input,select,textarea')].every(input=>input.reportValidity()));
   entry.addEventListener('invalid',()=>open(true),true);
   choice.onchange=()=>{if(entryChoice){entryChoice.checked=choice.checked;entryChoice.onchange()}else{row.selected=choice.checked;onChange()}refreshAll()};
   function refresh(){
    const check=inspect(row,rows,items,costMode),spool=row.spool;choice.checked=row.selected;
    name.textContent=spool.colour||'Colour needed';description.textContent=[spool.brand||'Brand needed',spool.product||spool.material||'Type needed',spool.finish||'Unknown finish'].join(' · ');
    const hex=/^#[a-f0-9]{6}$/i.test(spool.hex||'')?spool.hex:'transparent';swatch.style.backgroundColor=hex;
    amount.textContent=(spool.spools==null?'Unknown rolls':spool.spools+' roll'+(spool.spools===1?'':'s'))+' · '+(spool.weightGrams==null?'Unknown weight':spool.weightGrams+' g');
    const price=root.CostImport.price(spool);cost.textContent=price?price.costCurrency+' '+price.costPerRoll.toFixed(2):'Not found';
    badge.textContent=check.label;badge.className='import-badge '+check.kind;
    note.textContent=check.matches.length?check.matches.length+' matching purchase'+(check.matches.length===1?'':'s'):check.kind==='review'?'Open to check missing details':'';
    matchInfo.replaceChildren(make('p',check.detail));
    if(!costMode&&check.matches.length){
     const purchases=make('ul');for(const item of check.matches){purchases.append(make('li',[item.brand,item.product,item.colour,item.date||'No purchase date',item.order?'Order '+item.order:'No order reference',item.spools==null?'Unknown original quantity':item.spools+' original rolls',item.packaging].filter(Boolean).join(' · ')))}matchInfo.append(purchases);
    }
   }
   refreshers.push(refresh);body.append(summary,detailRow);
  });
  function refreshAll(){for(const refresh of refreshers)refresh()}
  refreshAll();return {refresh:refreshAll,validate:()=>validators.every(validate=>validate()),reveal:index=>openers.get(index)?.()};
 }
 const api={inspect,table};if(typeof module==='object'&&module.exports)module.exports=api;else root.ImportReview=api;
})(typeof globalThis==='object'?globalThis:this);
