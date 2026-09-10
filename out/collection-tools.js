'use strict';
{
 const node=id=>document.getElementById(id);
 let selected=new Set(),selecting=false,account=dataset.accountKey,review=null;
 const toolbar=node('collection-toolbar');
 toolbar.innerHTML='<label>Sort by<select id="collection-sort"><option value="default">Default order</option><option value="purchased-desc">Purchased · newest first</option><option value="purchased-asc">Purchased · oldest first</option><option value="added-desc">Added / imported · newest first</option><option value="added-asc">Added / imported · oldest first</option></select></label><button id="collection-select-toggle" type="button" aria-pressed="false">Select entries</button>';
 const bar=document.createElement('section');bar.id='collection-selection';bar.className='collection-selection';bar.hidden=true;bar.setAttribute('aria-label','Selected entries');
 bar.innerHTML='<strong id="collection-selected-count" role="status"></strong><button id="collection-select-all" type="button">Select all results</button><button id="collection-clear" type="button">Clear selection</button><button id="collection-edit" type="button">Bulk edit</button><button id="collection-labels" type="button">Print selected labels</button><p>Grouped cards select every purchase entry inside them. Selection includes other pages; changing filters removes entries no longer shown.</p>';
 toolbar.after(bar);
 const editor=document.createElement('section');editor.id='bulk-editor';editor.className='bulk-editor';editor.hidden=true;
 editor.innerHTML='<h3 id="bulk-title" tabindex="-1">Edit selected entries</h3><p>Only filled fields change. Roll counts, weights, usage and permanent IDs stay untouched. A grouped selection edits all its purchase entries.</p><form id="bulk-form"><div class="bulk-fields"></div><details><summary>Review selected entries</summary><ul id="bulk-review"></ul></details><p id="bulk-status" role="status"></p><div class="actions"><button type="submit" id="bulk-save" class="primary">Save changes</button><button type="button" id="bulk-cancel">Cancel</button></div></form>';
 bar.after(editor);
 const fields=[['brand','Brand'],['product','Product / type'],['material','Material'],['finish','Finish'],['packaging','Packaging'],['date','Purchased date'],['notes','Replace notes']];
 for(const [key,title] of fields){
  const label=document.createElement('label');label.textContent=title;
  const original=node('spool-'+key),input=original.tagName==='SELECT'?original.cloneNode(true):document.createElement('input');
  input.id='bulk-'+key;input.name=key;input.removeAttribute('required');
  if(input.tagName==='SELECT'){const unchanged=document.createElement('option');unchanged.value='';unchanged.textContent='Leave unchanged';input.prepend(unchanged);input.value=''}
  else {input.type=key==='date'?'date':'text';input.placeholder='Leave unchanged';input.maxLength=key==='notes'?500:key==='product'?100:80}
  label.append(input);editor.querySelector('.bulk-fields').append(label);
 }
 function closeEditor(){editor.hidden=true;review=null}
 function selectedRows(){return items.filter(row=>selected.has(row.id))}
 function update(){
  const rows=selectedRows();node('collection-selected-count').textContent=rows.length+' purchase '+(rows.length===1?'entry':'entries')+' selected';
  const disabled=libraryBusy||libraryRefreshing||dataset.status!=='complete';
  for(const id of ['collection-edit','collection-labels'])node(id).disabled=disabled||!rows.length;
  for(const id of ['collection-select-toggle','collection-select-all','collection-clear'])node(id).disabled=disabled;
  for(const input of document.querySelectorAll('.collection-select input'))input.disabled=disabled;
  node('bulk-save').disabled=disabled;node('bulk-cancel').disabled=libraryBusy;
 }
 function decorate(){
  const enabled=mode==='cards'||mode==='table';toolbar.hidden=!enabled;bar.hidden=!enabled||!selecting;
  if(account!==dataset.accountKey){account=dataset.accountKey;selected.clear();selecting=false;closeEditor();bar.hidden=true}
  if(!enabled){selected.clear();selecting=false;closeEditor();bar.hidden=true;update();return}
  const retained=SpoolCollection.reconcile(selected,filtered);
  if(retained.size!==selected.size)closeEditor();selected=retained;
  node('collection-select-toggle').setAttribute('aria-pressed',String(selecting));
  node('collection-select-toggle').textContent=selecting?'Done selecting':'Select entries';
  const visible=displayed.slice((page-1)*pageSize,page*pageSize);
  const elements=[...node('results').querySelectorAll(mode==='cards'?':scope > .card':':scope > table > tbody > tr')];
  elements.forEach((element,index)=>{
   const row=visible[index];if(!row)return;
   element.querySelectorAll('.collection-select,.collection-date').forEach(child=>child.remove());
   const ids=SpoolCollection.members(row).map(member=>member.id),count=ids.filter(id=>selected.has(id)).length;
   element.classList.toggle('collection-selected',count>0);
   if(selecting){
    const label=document.createElement('label');label.className='collection-select';
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=count===ids.length;checkbox.indeterminate=count>0&&count<ids.length;
    checkbox.setAttribute('aria-label','Select '+row.colour+' · '+row.brand+' · '+ids.length+' purchase '+(ids.length===1?'entry':'entries'));
    checkbox.onchange=()=>{ids.forEach(id=>checkbox.checked?selected.add(id):selected.delete(id));closeEditor();decorate();element.querySelector('.collection-select input')?.focus({preventScroll:true})};
    label.append(checkbox,document.createTextNode(ids.length>1?'Select '+ids.length+' entries':'Select entry'));
    if(mode==='cards')element.prepend(label);else element.firstElementChild.prepend(label);
   }
   const order=node('collection-sort').value;
   if(order!=='default'){
    const stamp=SpoolCollection.timestamp(row,order),caption=document.createElement('p');caption.className='collection-date';
    caption.textContent=(order.startsWith('added')?'Added / imported':'Purchased')+(ids.length>1?(order.endsWith('asc')?' · earliest':' · latest'):'')+': '+(stamp===null?'not recorded':new Date(stamp).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}));
    if(mode==='cards')element.querySelector('.card-body').insertBefore(caption,element.querySelector('.card-foot,.family-details'));else element.firstElementChild.append(caption);
   }
  });update();window.dispatchEvent(new Event('collection-selection-change'));
 }
 node('collection-sort').onchange=()=>render();
 node('collection-select-toggle').onclick=()=>{selecting=!selecting;if(!selecting){selected.clear();closeEditor()}decorate()};
 node('collection-clear').onclick=()=>{selected.clear();closeEditor();decorate()};
 node('collection-select-all').onclick=()=>{selected=new Set(filtered.map(row=>row.id));closeEditor();decorate()};
 node('collection-edit').onclick=()=>{
  review={ids:[...selected],revision:dataset.revision,accountKey:dataset.accountKey};node('bulk-form').reset();node('bulk-status').textContent='';
  node('bulk-review').replaceChildren(...selectedRows().map(row=>{const entry=document.createElement('li');entry.textContent=[row.brand,row.product,row.colour,row.date].join(' · ');return entry}));
  node('bulk-save').textContent='Save changes to '+review.ids.length+' '+(review.ids.length===1?'entry':'entries');editor.hidden=false;node('bulk-title').focus();
 };
 node('bulk-cancel').onclick=()=>{closeEditor();node('collection-edit').focus()};
 node('bulk-form').onsubmit=async event=>{
  event.preventDefault();if(!review||libraryBusy)return;
  if(review.revision!==dataset.revision||review.accountKey!==dataset.accountKey){node('bulk-status').textContent='Your library changed. Cancel and reopen Bulk edit to review the latest entries.';return}
  const patch=Object.fromEntries(fields.map(([key])=>[key,node('bulk-'+key).value.trim()]).filter(([,value])=>value!==''));
  if(!Object.keys(patch).length){node('bulk-status').textContent='Fill at least one field to change.';return}
  const count=review.ids.length;
  if(await saveLibraryAction({kind:'bulk-edit',ids:review.ids,patch,reviewed:true,expectedAccountKey:review.accountKey})){closeEditor();selected.clear();decorate();node('library-status').textContent='Updated '+count+' purchase '+(count===1?'entry.':'entries.')}
  else node('bulk-status').textContent=node('library-status').textContent;
 };
 window.getSelectedLabelSnapshot=()=>{
  const shelf=arrangeShelf(stockRows().filter(row=>!isUsed(row)));
  return {accountKey:dataset.accountKey||'',revision:dataset.revision,slots:shelf.filter(row=>row.slotId&&selected.has(row.id)),uncounted:shelf.filter(row=>!row.slotId&&selected.has(row.id)).length};
 };
 node('collection-labels').onclick=()=>window.openSelectedLabels();
 const observer=new MutationObserver(()=>{observer.disconnect();decorate();observer.observe(node('results'),{childList:true})});observer.observe(node('results'),{childList:true});
 window.CollectionTools={controls:update};decorate();
}
