'use strict';
{
 if(new URLSearchParams(location.hash.slice(1)).has('strata-stock')){
  const panel=document.createElement('section');panel.className='strata-transfer';panel.setAttribute('aria-label','Share colours with Strata');
  const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel sharing';
  panel.append(status,cancel);document.getElementById('main').prepend(panel);
  const dialog=document.createElement('dialog');dialog.className='strata-stock-dialog';dialog.setAttribute('aria-labelledby','strata-stock-title');
  dialog.innerHTML='<h2 id="strata-stock-title">Share available colours with Strata?</h2><p id="strata-stock-destination"></p><p>This shares colour swatches, material, finish, brand/product/shade names and available roll counts only. No prices, purchases, emails, stock IDs or account credentials.</p><p id="strata-stock-summary"></p><div class="strata-stock-preview"><table><caption>Colours included in this snapshot</caption><thead><tr><th scope="col">Colour</th><th scope="col">Material / finish</th><th scope="col">Rolls</th></tr></thead><tbody id="strata-stock-colours"></tbody></table></div><p>Counts include refills. Stock is not reserved and enough remaining filament is not guaranteed. Swatches are approximate; these are not calibrated slicer profiles.</p><p>One-time sharing only. Strata will not get ongoing access to your library. A shared snapshot cannot be recalled.</p><p id="strata-stock-review-status" role="status" aria-live="polite"></p><div class="actions"><button type="button" id="strata-stock-cancel">Cancel</button><button type="button" class="primary" id="strata-stock-share">Share available colours with Strata</button></div>';
  document.body.append(dialog);
  const get=id=>document.getElementById(id);
  let offer;
  function update(phase,message,review){
   status.textContent=message;cancel.hidden=['received','error','cancelled'].includes(phase);
   cancel.textContent=phase==='sent'?'Close sharing':'Cancel sharing';
   get('strata-stock-share').disabled=phase!=='review';
   if(phase==='review'&&review){
    get('strata-stock-destination').textContent='Destination: '+review.sender;
    get('strata-stock-summary').textContent=review.colours.length+' available colour options · '+review.colours.reduce((total,colour)=>total+colour.availableRolls,0)+' rolls'+(review.omitted?' · '+review.omitted+' unsupported entries omitted':'')+'. Used-up and unknown-count entries are not shared.';
    const body=get('strata-stock-colours');body.replaceChildren();
    for(const colour of review.colours){
     const row=document.createElement('tr'),name=document.createElement('td'),material=document.createElement('td'),count=document.createElement('td');
     const swatch=document.createElement('span');swatch.className='match-colour';swatch.style.setProperty('--swatch',colour.hex);swatch.setAttribute('aria-hidden','true');
     const label=document.createElement('strong');label.textContent=colour.colour;
     const details=document.createElement('small');details.textContent=colour.brand+' · '+colour.product+' · '+colour.hex;
     name.append(swatch,label,details);material.textContent=colour.material+' · '+finishLabel(colour.finish);count.textContent=String(colour.availableRolls);
     row.append(name,material,count);body.append(row);
    }
    get('strata-stock-review-status').textContent=message;
    if(!dialog.open){dialog.showModal();get('strata-stock-cancel').focus({preventScroll:true});dialog.scrollTop=0}
   }else if(dialog.open)dialog.close();
  }
  offer=StrataStock.offer({
   host:window,
   context:()=>({ready:dataset.status==='complete'&&!libraryBusy&&!libraryRefreshing,accountKey:dataset.accountKey||'',revision:dataset.revision}),
   snapshot:()=>StrataStock.palette(stockRows().filter(row=>!isUsed(row)),FilamentMatcher.finish),
   update,
   clearFragment:()=>{const url=new URL(location.href),fragment=new URLSearchParams(url.hash.slice(1));fragment.delete('strata-stock');fragment.delete('sender');url.hash=fragment.toString();history.replaceState(history.state,'',url)},
  });
  cancel.onclick=()=>offer?.cancel();get('strata-stock-cancel').onclick=()=>offer?.cancel();get('strata-stock-share').onclick=()=>offer?.share();
  dialog.addEventListener('cancel',event=>{event.preventDefault();offer?.cancel()});
  window.StrataStockUi={resume:()=>offer?.resume()};
 }
}
