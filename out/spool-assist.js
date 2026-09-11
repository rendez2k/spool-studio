'use strict';
{
 const node=id=>document.getElementById(id),assist=node('spool-assist');
 assist.innerHTML=`<div class="assist-methods" aria-label="Entry method"><button type="button" data-entry-method="manual" aria-pressed="true">Manual</button><button type="button" data-entry-method="link" aria-pressed="false">Product link</button><button type="button" data-entry-method="barcode" aria-pressed="false">Barcode</button></div>
 <div id="assist-link" hidden><div class="assist-input-row"><label>Product-page link<input id="assist-url" type="text" inputmode="url" maxlength="2000" placeholder="https://…" autocomplete="off"></label><button id="assist-lookup" type="button">Read product</button></div><p class="meta">Bambu Lab, SUNLU, ELEGOO or full Amazon UK product links. Sends the link to our server to read the public page; shops may block lookup. <a href="/import.html">Paste product text instead</a>.</p></div>
 <div id="assist-barcode" hidden><p class="meta">Add a new reel using its box or spool barcode. Review the match and quantity before saving.</p><button id="assist-scan" class="primary" type="button">Scan barcode with camera</button><video id="assist-camera" playsinline muted hidden aria-label="Barcode camera preview"></video><div class="assist-input-row"><label>Barcode / manufacturer SKU<input id="assist-code" type="text" maxlength="64" placeholder="Scan or type the printed code" autocomplete="off" autocapitalize="characters"></label><button id="assist-find-code" type="button">Find in library</button></div><p class="meta">Looks in your own saved library—not a universal product catalogue. For a new code, enter the details below and save; next time it can fill a draft. Codes may identify a pack, not a single roll.</p><p class="meta">For an unknown EAN / UPC, you can send just its code to UPCitemdb. Limited free catalogue coverage; verify the result against your reel. <a href="https://devs.upcitemdb.com/privacypolicy" target="_blank" rel="noopener noreferrer">Provider privacy</a></p><button id="assist-catalogue" type="button">Search UPCitemdb with this code</button></div>
 <button id="assist-cancel" type="button" hidden>Cancel</button><p id="assist-status" class="meta" role="status" aria-live="polite"></p><div id="assist-results" class="assist-result"></div><p id="assist-source" class="assist-source" hidden></p>`;
 let sequence=0,loading=false,scanning=false,requestController=null,cameraStream=null,scanControls=null,scanTimer=null,decoderPromise=null,method='manual',source='';
 const stopTracks=stream=>stream?.getTracks().forEach(track=>track.stop());
 function controls(){
  const blocked=libraryBusy||loading||scanning;
  assist.querySelectorAll('input,[data-entry-method],#assist-lookup,#assist-find-code,#assist-scan,#assist-catalogue').forEach(element=>element.disabled=blocked);
  node('assist-cancel').hidden=!(loading||scanning);node('save-spool').disabled=libraryBusy||loading||scanning;
  node('spool-form').querySelectorAll('.spool-fields input,.spool-fields select,#spool-notes').forEach(element=>element.disabled=blocked||element.hidden);
  node('assist-results').querySelectorAll('button').forEach(button=>button.disabled=blocked);
 }
 function stop(){
  sequence++;requestController?.abort();requestController=null;scanControls?.stop();scanControls=null;stopTracks(cameraStream);cameraStream=null;
  clearTimeout(scanTimer);scanTimer=null;node('assist-camera').srcObject=null;node('assist-camera').hidden=true;loading=false;scanning=false;controls();
 }
 function message(text){node('assist-status').textContent=text}
 function selectMethod(value){stop();method=value;node('assist-link').hidden=value!=='link';node('assist-barcode').hidden=value!=='barcode';assist.querySelectorAll('[data-entry-method]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.entryMethod===value)));node('assist-results').replaceChildren();message('')}
 function options(key,values){
  const select=node('spool-'+key+'-choice');select.replaceChildren();select.hidden=false;
  for(const [value,label] of [['','Choose a common '+(key==='brand'?'brand':'type')],...values.map(value=>[value,value]),['__custom__','Custom / other…']]){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option)}
 }
 function syncChoice(key){
  const input=node('spool-'+key),select=node('spool-'+key+'-choice');
  const found=[...select.options].find(option=>option.value&&option.value!=='__custom__'&&option.value.toLowerCase()===input.value.toLowerCase());
  select.value=found?found.value:input.value?'__custom__':'';input.hidden=select.value!=='__custom__';input.disabled=input.hidden;
 }
 function showSource(){node('assist-source').hidden=!source;node('assist-source').textContent=source?'Source: '+source:''}
 function reset(row){
  stop();selectMethod('manual');source=row?.sourceUrl||'';node('assist-url').value=source;node('assist-code').value=row?.barcode||'';showSource();
  const brands=[...new Set([...SpoolCatalog.brands,...items.map(item=>item.brand).filter(Boolean)])];
  const products=[...new Set([...SpoolCatalog.profiles.map(profile=>profile.product),...items.map(item=>item.product).filter(Boolean)])];
  options('brand',brands);options('product',products);syncChoice('brand');syncChoice('product');
  if(row?.barcode)message('Saved barcode: '+row.barcode+'. Open Barcode to change it.');controls();
 }
 for(const key of ['brand','product'])node('spool-'+key+'-choice').onchange=()=>{
  const value=node('spool-'+key+'-choice').value,input=node('spool-'+key);input.hidden=value!=='__custom__';input.disabled=input.hidden;
  if(value!=='__custom__')input.value=value;else {input.value='';input.focus()}
  if(key==='product'){
   const profile=SpoolCatalog.profiles.find(profile=>profile.product===value);
   if(profile){node('spool-material').value=profile.material;node('spool-finish').value=profile.finish}
  }
  window.ColourForm?.update();
 };
 function useDraft(draft){
  if(libraryBusy||loading||scanning)return;
  for(const key of ['brand','product','material','finish','colour','hex','packaging'])node('spool-'+key).value=draft[key]||({material:'Other',finish:'unknown',packaging:'unknown'}[key]||'');
  node('spool-sample').value=/^#[a-f\d]{6}$/i.test(draft.hex||'')?draft.hex:'#FFFFFF';node('spool-weight').value=draft.weightGrams??'';
  source=draft.sourceUrl||'';node('assist-code').value=draft.barcode||'';showSource();syncChoice('brand');syncChoice('product');
  node('assist-results').replaceChildren();message('Draft filled. Check the exact colour, finish, packaging, grams per roll and how many rolls you own before saving.');
  window.ColourForm?.reset(draft);
 }
 function addDraftButton(label,draft,account){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>{if(account!==dataset.accountKey){stop();node('assist-results').replaceChildren();return}useDraft(draft)};node('assist-results').append(button)}
 node('assist-lookup').onclick=async()=>{
  if(libraryBusy||loading||scanning||!dataset.accountKey)return;
  stop();const current=sequence,account=dataset.accountKey;loading=true;requestController=new AbortController();controls();message('Reading the public product page…');node('assist-results').replaceChildren();
  const controller=requestController,timeout=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetch('/api/product-lookup',{method:'POST',credentials:'same-origin',redirect:'error',cache:'no-store',signal:requestController.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({url:node('assist-url').value.trim()})});
   const value=await response.json();
   if(current!==sequence||account!==dataset.accountKey||!node('spool-dialog').open)return;
   if(response.status===401){lostLibrarySession();return}
   if(!response.ok)throw Error(value.error||'Product lookup is unavailable. Paste product text in Import instead.');
   if(value.accountKey!==account){lostLibrarySession();return}
   const product=value.product,parsed=FilamentImport.parse((product.brand?product.brand+' ':'')+product.title)[0]?.spool;
   const title=document.createElement('strong');title.textContent=product.title;node('assist-results').append(title);
   message(product.warning+' Your current form is unchanged until you choose the draft.');
   addDraftButton('Replace form with this draft',{brand:product.brand||parsed?.brand||'',product:parsed?.product||product.title.slice(0,100),material:parsed?.material||'Other',finish:parsed?.finish||'unknown',colour:'',hex:'',packaging:'unknown',weightGrams:parsed?.weightGrams??null,sourceUrl:product.url},account);
  }catch(error){if(current===sequence)message(error.name==='AbortError'?'Lookup cancelled or timed out. Your form is unchanged.':error.message)}
  finally{clearTimeout(timeout);if(current===sequence){loading=false;requestController=null;controls()}}
 };
 function findCode(){
  if(libraryBusy||loading||scanning||!dataset.accountKey)return;
  node('assist-results').replaceChildren();
  try{
   const code=SpoolCatalog.barcode(node('assist-code').value);if(!code)throw Error('Scan or type a barcode first.');node('assist-code').value=code;
   const found=SpoolCatalog.matches(code,items);
   if(!found.length){message('New code in your library. Fill in the filament details below; saving the entry will remember this code for next time.');return}
   message('Found '+found.length+' saved entr'+(found.length===1?'y':'ies')+'. Choose a template only if it is the exact same filament. Saving adds or edits only the form you opened.');
   const seen=new Set();
   for(const row of found){
    const key=JSON.stringify([row.brand,row.product,row.material,row.colour,row.hex,row.finish,row.weightGrams,row.packaging]);if(seen.has(key))continue;seen.add(key);
    const finish=row.finish||FilamentMatcher.finish(row.product),pack=packaging(row);
    const detail=[row.material,finish==='standard'?'standard / basic':finish==='unknown'?'finish unknown':finish,row.hex||'swatch unknown',row.weightGrams?row.weightGrams+' g / roll':'weight unknown',({refill:'refill — no spool',spooled:'supplied on spool',unknown:'packaging unknown'})[pack]].join(' · ');
    addDraftButton('Use '+row.brand+' · '+row.product+' · '+row.colour+' — '+detail+(row.used?' (used-up entry)':''),{...row,packaging:pack,finish},dataset.accountKey);
   }
  }catch(error){message(error.message)}
 }
 node('assist-find-code').onclick=findCode;
 node('assist-catalogue').onclick=async()=>{
  if(libraryBusy||loading||scanning||!dataset.accountKey)return;
  stop();const current=sequence,account=dataset.accountKey,code=node('assist-code').value.trim();loading=true;requestController=new AbortController();controls();message('Looking up this barcode in UPCitemdb…');node('assist-results').replaceChildren();
  const timeout=setTimeout(()=>requestController?.abort(),15000);
  try{
   const response=await fetch('/api/barcode-lookup',{method:'POST',credentials:'same-origin',redirect:'error',cache:'no-store',signal:requestController.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({code,consent:true})});
   const value=await response.json();if(current!==sequence||account!==dataset.accountKey||!node('spool-dialog').open)return;
   if(response.status===401){lostLibrarySession();return}if(!response.ok)throw Error(value.error||'Catalogue unavailable.');
   if(value.accountKey!==account){lostLibrarySession();return}
   message(value.products.length?'UPCitemdb results are unverified drafts. Confirm the actual material, finish, colour, weight and pack contents.':'No exact barcode result. Enter the details manually; absence does not mean the product is invalid.');
   for(const product of value.products){const parsed=FilamentImport.parse(product.brand+' '+product.title)[0]?.spool;addDraftButton('Review '+product.title,{brand:product.brand||parsed?.brand||'',product:parsed?.product||product.title.slice(0,100),material:parsed?.material||'Other',finish:parsed?.finish||'unknown',colour:product.colour||'',hex:'',packaging:'unknown',weightGrams:parsed?.weightGrams??null,barcode:code},account)}
  }catch(error){if(current===sequence)message(error.name==='AbortError'?'Catalogue request timed out or was cancelled.':error.message)}
  finally{clearTimeout(timeout);if(current===sequence){loading=false;requestController=null;controls()}}
 };
 function loadDecoder(){
  if(window.SpoolBarcodeDecoder)return Promise.resolve(window.SpoolBarcodeDecoder);
  if(!decoderPromise)decoderPromise=new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src='/vendor/barcode/decoder.js';
   const fail=()=>{clearTimeout(timeout);decoderPromise=null;script.remove();reject(Error('Camera scanner could not load. Type the barcode instead.'))};
   const timeout=setTimeout(fail,15000);script.onload=()=>{clearTimeout(timeout);if(window.SpoolBarcodeDecoder)resolve(window.SpoolBarcodeDecoder);else fail()};script.onerror=fail;document.head.append(script);
  });
  return decoderPromise;
 }
 node('assist-scan').onclick=async()=>{
  if(libraryBusy||loading||scanning||!dataset.accountKey)return;
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){message('Camera scanning is unavailable here. Use HTTPS in a camera-capable browser, or type the barcode.');return}
  stop();const current=sequence,account=dataset.accountKey;scanning=true;node('assist-camera').hidden=false;controls();message('Allow camera access, then hold one barcode steady in view.');
  scanTimer=setTimeout(()=>{if(current===sequence){stop();message('Scanning stopped after 45 seconds. Try again or type the code.')}},45000);
  try{
   const decoder=await loadDecoder();if(current!==sequence)return;
   const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280}},audio:false});
   if(current!==sequence||account!==dataset.accountKey){stopTracks(stream);return}cameraStream=stream;
   const reader=decoder.createReader();
   const control=await reader.decodeFromStream(stream,node('assist-camera'),(result,error,control)=>{
    if(current!==sequence){control?.stop();return}
    if(result){const value=result.getText();control?.stop();stop();node('assist-code').value=value;findCode()}
   });
   if(current!==sequence)control.stop();else scanControls=control;
  }catch(error){if(current===sequence){stop();message(error.name==='NotAllowedError'?'Camera permission was not granted. Type the barcode or enable camera access for this site.':'Camera scanning failed. Try again or type the printed code.')}}
 };
 node('assist-cancel').onclick=()=>{stop();message('Cancelled. Your form is unchanged.')};
 node('assist-code').addEventListener('input',()=>{node('assist-results').replaceChildren();message('')});
 node('assist-url').addEventListener('input',()=>{node('assist-results').replaceChildren();message('')});
 assist.querySelectorAll('[data-entry-method]').forEach(button=>button.onclick=()=>selectMethod(button.dataset.entryMethod));
 node('spool-dialog').addEventListener('close',()=>{stop();node('assist-results').replaceChildren()});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&(loading||scanning)){stop();message('Paused because the app went into the background. Try again when ready.')}});
 window.addEventListener('pagehide',stop);
 window.addEventListener('spool-entry-method',event=>{if(['manual','barcode'].includes(event.detail))selectMethod(event.detail)});
 window.SpoolAssist={reset,stop,clear:()=>{stop();source='';node('assist-url').value='';node('assist-code').value='';node('assist-results').replaceChildren();for(const key of ['brand','product']){const select=node('spool-'+key+'-choice');select.replaceChildren();select.hidden=true;select.disabled=true;node('spool-'+key).value='';node('spool-'+key).hidden=false}showSource();message('')},controls,busy:()=>loading||scanning,fields:()=>({barcode:SpoolCatalog.barcode(node('assist-code').value),sourceUrl:SpoolCatalog.sourceUrl(source)})};
}
