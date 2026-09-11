'use strict';
{
 const node=id=>document.getElementById(id);
 const panel=node('label-panel'),trigger=node('open-labels');
 let snapshot=null,planned=[],previewIndex=0,selectionSource=false,assigning=false;
 const sourceSnapshot=()=>selectionSource?window.getSelectedLabelSnapshot():window.getShelfLabelSnapshot();
 panel.innerHTML=`<div class="label-heading"><h3 id="label-heading" tabindex="-1">Labels for your shelf</h3><button id="close-labels" type="button">Close labels</button></div>
 <p class="label-hint">Print matching labels for each spool and its box. SP numbers stay with the reel; shelf positions can change. <a href="/reels.html">Assign permanent IDs or manage individual spools</a> before printing QR labels.</p>
 <div class="label-workspace"><form id="label-settings"><div class="label-fields">
 <label>Label size<select id="label-size"><option value="60x30">60 × 30 mm · spool &amp; box</option><option value="50x30">50 × 30 mm</option><option value="40x30">40 × 30 mm</option><option value="76x50">76 × 50 mm · MUNBYN</option><option value="100x50">100 × 50 mm</option><option value="105x145">105 × 145 mm</option><option value="4x6">4 × 6 in · shipping</option><option value="custom">Custom size</option></select></label>
 <label>Copies per roll<select id="label-copies"><option value="2">Two · spool + box</option><option value="1">One · spool or box</option></select></label>
 </div><div id="label-custom" class="label-fields" hidden><label>Width (mm)<input id="label-width" type="number" min="40" max="210" step="0.1" value="60"></label><label>Height (mm)<input id="label-height" type="number" min="25" max="297" step="0.1" value="30"></label></div>
 <div class="label-fields"><label>First shelf position<input id="label-first" type="number" min="1" step="1" value="1"></label><label>Last shelf position<input id="label-last" type="number" min="1" step="1" value="1"></label></div>
 <label class="label-qr-toggle"><input id="label-qr" type="checkbox" checked> Include private spool QR link (60 × 30 mm or larger)</label>
 <div class="label-fields"><label>QR appearance<select id="label-qr-style"><option value="square">Classic · crisp thermal print</option><option value="rounded">Soft corners</option></select></label><label>Location on label<select id="label-location"><option value="shelf">Shelf position</option><option value="none">No location</option><option value="saved">Saved reel location</option><option value="custom">Custom · box, drawer, dry box…</option></select></label></div>
 <div id="label-custom-location" class="label-fields" hidden><label>Location for this batch<input id="label-location-text" maxlength="60" placeholder="e.g. Dry box A"></label></div>
 <details class="label-content"><summary>Label details</summary><div class="label-content-options"><label class="label-qr-toggle"><input id="label-show-brand" type="checkbox" checked> Brand</label><label class="label-qr-toggle"><input id="label-show-material" type="checkbox" checked> Material &amp; finish</label><label class="label-qr-toggle"><input id="label-show-stock" type="checkbox" checked> Weight</label><label class="label-qr-toggle"><input id="label-show-packaging" type="checkbox" checked> With spool / refill</label></div><p class="label-hint">Spool/refill describes how it was purchased, not whether you have since mounted a refill. Change Packaging in Edit entries if needed. Colour and spool number always stay visible. Custom locations apply to these labels only; they do not change your library.</p></details>
 <p class="label-print-settings"><strong id="label-paper-size"></strong><span>Margins: None · Scale: 100% · Headers and footers: Off</span><span>Match the loaded labels. A larger driver paper size leaves empty space; the app cannot change these printer settings.</span></p>
 <p id="label-status" class="label-hint" role="status"></p><div id="label-id-action" hidden><button id="label-assign-ids" type="button" aria-describedby="label-id-help">Assign permanent IDs to my rolls</button><p id="label-id-help" class="label-hint">Applies to all counted rolls in your library, not just this selection. Quantities and used marks stay unchanged. Your label settings stay here; QR previews refresh automatically.</p></div><div class="actions"><button id="label-print" class="primary" type="submit">Print labels</button><button id="label-refresh" type="button">Use current shelf</button></div>
 <p class="label-hint">Choose the same paper size in your printer settings, 100% / actual size, no margins, and headers and footers off. Test one position first. MUNBYN uses your usual printer driver or print service—not a direct Bluetooth connection from this page. <a href="/guide.html#labels">Printing help</a></p>
 </form><div class="label-preview-column"><h4>Label preview</h4><div id="label-preview" class="label-preview"></div><div class="actions"><button id="label-prev" type="button" aria-label="Previous label preview">Previous</button><span id="label-page"></span><button id="label-next" type="button" aria-label="Next label preview">Next</button></div><p class="label-hint">Black text for thermal printing. Screen size may differ from the actual label.</p></div></div>`;
 const printRoot=document.createElement('div');printRoot.id='spool-label-print';printRoot.hidden=true;document.body.append(printRoot);
 const pageStyle=document.createElement('style');document.head.append(pageStyle);
 function label(row){
  const element=document.createElement('article');element.className='spool-print-label';
  const add=(tag,className,text)=>{const child=document.createElement(tag);child.className=className;child.textContent=text;element.append(child)};
  add('div','label-position',row.reelId?SpoolReels.label(row.reelNumber):'Position #'+row.position);
  add('strong','label-colour',row.colour);
  if(node('label-show-brand').checked)add('div','label-brand',row.brand);
  if(node('label-show-material').checked)add('div','label-material',[row.product,!row.product.toLowerCase().includes(row.material.toLowerCase())?row.material:'',row.finish!=='unknown'&&!(row.finish==='standard'&&/basic/i.test(row.product))&&!row.product.toLowerCase().includes(row.finish.toLowerCase())?row.finish:''].filter(Boolean).join(' · '));
  if(node('label-show-stock').checked)add('div','label-stock',row.weightGrams?row.weightGrams+' g':'');
  if(node('label-show-packaging').checked)add('div','label-packaging',row.packaging==='refill'?'Refill — no spool':row.packaging==='spooled'?'With spool':'Spool not stated');
  const location=node('label-location').value;
  const locationText=location==='shelf'?'Shelf '+row.shelf+' / '+row.shelfSlot:location==='saved'?row.reelLocation:location==='custom'?node('label-location-text').value.trim():'';
  if(locationText)add('div','label-shelf',locationText);
  if(row.reelId){
   if(node('label-qr').checked){
    element.classList.add('has-reel-qr');
    const code=qrcode(0,'M');code.addData(SpoolReels.url(window.location.origin,row.reelId));code.make();
    const holder=document.createElement('div');holder.className='label-code';holder.setAttribute('aria-label','Open '+SpoolReels.label(row.reelNumber)+' in your signed-in library');holder.innerHTML=SpoolLabels.qrSvg(code,node('label-qr-style').value);element.append(holder);
   }
  }
  return element;
 }
 function stale(){return !snapshot||SpoolLabels.signature(snapshot)!==SpoolLabels.signature(sourceSnapshot())}
 function settings(){const [width,height]=SpoolLabels.dimensions(node('label-size').value,node('label-width').value,node('label-height').value);return {width,height,start:Number(node('label-first').value),end:Number(node('label-last').value),copies:Number(node('label-copies').value)}}
 function sizeElements(width,height){
  for(const element of [printRoot,node('label-preview')]){element.style.setProperty('--label-width',width+'mm');element.style.setProperty('--label-height',height+'mm');element.style.setProperty('--label-code-size',Math.max(20,Math.min(32,width*.34,height-8))+'mm')}
 }
 function overflow(element){return element.scrollHeight>element.clientHeight+1||element.scrollWidth>element.clientWidth+1}
 function fitLabel(element){
  const size=SpoolLabels.fitFont(value=>{element.style.setProperty('--label-font',value+'pt');return !overflow(element)});
  element.style.setProperty('--label-font',size+'pt');
 }
 function render(){
  node('label-assign-ids').disabled=assigning;
  if(assigning){node('label-print').disabled=true;node('label-status').textContent='Assigning permanent IDs…';return}
  node('label-id-action').hidden=true;
  node('label-custom').hidden=node('label-size').value!=='custom';
  node('label-qr-style').disabled=!node('label-qr').checked;
  node('label-custom-location').hidden=node('label-location').value!=='custom';
  node('label-location-text').disabled=node('label-custom-location').hidden;
  node('label-width').disabled=node('label-height').disabled=node('label-custom').hidden;node('label-print').disabled=true;
  planned=[];node('label-preview').replaceChildren();node('label-page').textContent='';node('label-prev').disabled=node('label-next').disabled=true;
  try{
   if(stale())throw Error('The library, selection or shelf changed. Refresh the label selection before printing.');
   const options=settings();planned=SpoolLabels.plan(snapshot,options);node('label-paper-size').textContent='Printer paper: '+options.width+' × '+options.height+' mm';
   if(node('label-qr').checked&&(options.width<60||options.height<30))throw Error('QR labels need at least 60 × 30 mm. Choose a larger size or untick QR links.');
   if(node('label-location').value==='custom'&&!node('label-location-text').value.trim())throw Error('Enter a location for this batch, or choose No location.');
   sizeElements(options.width,options.height);
   previewIndex=Math.min(previewIndex,planned.length-1);const preview=label(planned[previewIndex]);node('label-preview').append(preview);fitLabel(preview);
   node('label-page').textContent=(previewIndex+1)+' / '+planned.length;node('label-prev').disabled=previewIndex===0;node('label-next').disabled=previewIndex===planned.length-1;
   const missing=planned.filter(row=>!row.reelId).length/options.copies;
   if(node('label-qr').checked&&missing){node('label-id-action').hidden=false;throw Error(missing+' roll'+(missing===1?' has':'s have')+' no permanent ID. Assign IDs below, or untick QR links to print text-only labels.')}
   node('label-status').textContent=planned.length+' labels · '+(options.end-options.start+1)+' rolls · '+options.width+' × '+options.height+' mm.'+(missing?' Position numbers are not permanent spool IDs.':node('label-qr').checked?' QR links require the owner to sign in.':' Text-only labels.')+(node('label-location').value==='saved'&&planned.some(row=>!row.reelLocation)?' Reels without a saved location leave it blank.':'')+(node('label-qr').checked&&node('label-qr-style').value==='rounded'?' Test a printed Soft corners code on your phone before a full batch.':'')+(snapshot.uncounted?' '+snapshot.uncounted+' uncounted bundle'+(snapshot.uncounted===1?'':'s')+' excluded.':'');
   node('label-print').disabled=false;
  }catch(error){node('label-status').textContent=error.message}
 }
 function current(){
  snapshot=structuredClone(sourceSnapshot());previewIndex=0;
  let scope=node('label-scope');if(!scope){scope=document.createElement('p');scope.id='label-scope';scope.className='label-hint';node('label-settings').prepend(scope)}
  scope.textContent=selectionSource?'Available rolls from selected entries only. Used-up rolls are excluded. Shelf positions come from your entire available library using the Colour shelf order and shelf size, not the Collection filters or date sort.':'Shelf positions follow the current filtered Colour shelf.';
  node('label-heading').textContent=selectionSource?'Labels for selected entries':'Labels for your shelf';
  node('label-refresh').textContent=selectionSource?'Use current selection':'Use current shelf';
  node('label-first').parentElement.firstChild.textContent=selectionSource?'First selected roll':'First shelf position';
  node('label-last').parentElement.firstChild.textContent=selectionSource?'Last selected roll':'Last shelf position';
  node('label-first').value='1';node('label-last').value=String(Math.min(snapshot.slots.length,Math.floor(500/Number(node('label-copies').value))));
  node('label-first').max=node('label-last').max=String(snapshot.slots.length);render();
 }
 trigger.onclick=()=>{selectionSource=false;panel.hidden=!panel.hidden;trigger.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){current();node('label-heading').focus()}};
 window.openSelectedLabels=()=>{selectionSource=true;panel.hidden=false;trigger.setAttribute('aria-expanded','true');current();node('label-heading').focus()};
 node('close-labels').onclick=()=>{panel.hidden=true;trigger.setAttribute('aria-expanded','false');(selectionSource?node('collection-labels'):trigger).focus()};
 node('label-refresh').onclick=current;
 node('label-assign-ids').onclick=async()=>{
  if(assigning||node('label-id-action').hidden)return;
  if(stale()){render();return}
  const expected={accountKey:snapshot.accountKey,revision:snapshot.revision};
  assigning=true;render();
  let failure='';
  try{
   if(!window.assignPermanentLabelIds)throw Error('Reload the app before assigning IDs.');
   await window.assignPermanentLabelIds(expected);
   const latest=sourceSnapshot();
   if(latest.accountKey!==expected.accountKey)throw Error('The signed-in account changed. Refresh your label selection.');
   snapshot=structuredClone(latest);
  }catch(error){failure=error.message||'Could not assign IDs. Try again.'}
  finally{assigning=false;render();if(failure)node('label-status').textContent=failure;else if(!node('label-print').disabled){node('label-status').textContent='Permanent IDs assigned. '+node('label-status').textContent;node('label-print').focus()}}
 };
 node('label-settings').addEventListener('input',()=>{previewIndex=0;render()});
 node('label-prev').onclick=()=>{previewIndex--;render()};node('label-next').onclick=()=>{previewIndex++;render()};
 function cleanup(){printRoot.replaceChildren();printRoot.hidden=true;printRoot.classList.remove('label-measuring');document.body.classList.remove('printing-spool-labels');pageStyle.textContent=''}
 node('label-settings').onsubmit=event=>{
  event.preventDefault();render();if(node('label-print').disabled)return;
  try{
   const {width,height}=settings();printRoot.replaceChildren(...planned.map(label));printRoot.hidden=false;printRoot.classList.add('label-measuring');
   for(const element of printRoot.children)fitLabel(element);
   const tooLarge=[...printRoot.children].find(overflow);
   if(tooLarge)throw Error('Text on '+tooLarge.firstChild.textContent+' will not fit. Choose a larger label before printing.');
   printRoot.classList.remove('label-measuring');pageStyle.textContent='@media print { @page { size: '+width+'mm '+height+'mm; margin: 0; } }';document.body.classList.add('printing-spool-labels');
   window.print();
  }catch(error){cleanup();node('label-status').textContent=error.message}
 };
 window.addEventListener('afterprint',cleanup);window.addEventListener('pagehide',cleanup);
 window.addEventListener('collection-selection-change',()=>{if(!panel.hidden&&stale())render()});
 const observer=new MutationObserver(()=>{if(!panel.hidden&&stale())render()});observer.observe(node('results'),{childList:true});
}
