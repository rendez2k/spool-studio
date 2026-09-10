'use strict';
const get=id=>document.getElementById(id);
let library=null,rows=[],sourceSnapshot='',imageFile=null,imageUrl='',worker=null,reading=false,saving=false,runId=0,accountCheck=0,scriptPromise=null,pendingSave=null;
let snapshotFormat='text';
let reviewPage=0;
const reviewPageSize=20;
const materialOptions=['PLA','PLA+','PETG','ABS','ASA','TPU','PA','PC','PVA','HIPS','Other'];
const finishOptions=['unknown','standard','matte','silk','marble','sparkle','wood','glow','satin','metal'];
const fields=[['brand','Brand'],['product','Product / type'],['material','Material'],['finish','Finish'],['colour','Colour name'],['hex','Colour hex (estimate unless printed)'],['spools','Number of rolls'],['weightGrams','Grams per roll'],['packaging','Packaging'],['date','Purchase / added date'],['notes','Notes / uncertainties']];
function today(){const date=new Date();return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')}
function message(text){get('import-message').textContent=text}
function changed(){get('approve-import').checked=false;pendingSave=null;controls()}
function controls(){
 const ready=Boolean(library)&&!saving;
 get('read-image').disabled=!ready||reading||!imageFile||get('source-format').value==='csv';
 get('source-csv').disabled=!ready||reading;get('source-format').disabled=!ready||reading;
 get('cancel-read').hidden=!reading;get('source-image').disabled=!ready||reading;
 for(const id of ['extract','add-blank','clear-import'])get(id).disabled=!ready||reading;
 get('source-text').disabled=!ready||reading;
 get('source-text').maxLength=get('source-format').value==='csv'?FilamentCsv.maxCharacters:60000;
 const lastPage=Math.max(0,Math.ceil(rows.length/reviewPageSize)-1);
 get('review-pagination').hidden=get('review-pagination-bottom').hidden=rows.length<=reviewPageSize;
 for(const suffix of ['','-bottom']){get('review-prev'+suffix).disabled=!ready||reading||reviewPage===0;get('review-next'+suffix).disabled=!ready||reading||reviewPage===lastPage}
 get('review-page').disabled=!ready||reading;
 get('review-footer').hidden=!rows.length;
 const selected=rows.filter(row=>row.selected).length;
 get('save-import').textContent=saving?'Saving…':'Add '+selected+' selected entr'+(selected===1?'y':'ies');
 get('save-import').disabled=!ready||reading||!selected||!get('approve-import').checked||get('source-text').value!==sourceSnapshot||(get('source-format').value||'text')!==snapshotFormat;
 get('approve-import').disabled=!ready||reading;
 get('review-list').querySelectorAll('.entry').forEach(entry=>entry.disabled=saving||reading);
 get('review-list').querySelectorAll('input[type="checkbox"]').forEach(input=>input.disabled=saving||reading);
}
async function api(method='GET',body){
 const response=await fetch('/api/library',{method,credentials:'same-origin',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 const value=await response.json();
 if(!response.ok){const error=Error(value.error||'Library unavailable.');error.status=response.status;error.entryIndex=value.entryIndex;throw error}
 return value;
}
function releaseImage(){if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl='';imageFile=null;get('image-preview').hidden=true;get('image-preview').removeAttribute('src');get('source-image').value=''}
function cancelRead(text='Reading cancelled. No changes saved.'){
 runId++;reading=false;
 if(worker){worker.terminate().catch(()=>{});worker=null}
 get('ocr-status').textContent=text;controls();
}
function clearDraft(){
 cancelRead('');releaseImage();get('source-text').value='';rows=[];sourceSnapshot='';pendingSave=null;reviewPage=0;
 snapshotFormat='text';get('source-format').value='text';get('source-csv').value='';
 get('review-list').replaceChildren();get('approve-import').checked=false;
 get('review-status').textContent='Your detected entries will appear here. Nothing is saved automatically.';message('');controls();
}
function loseAccount(text){
 window.GmailImport?.clear();
 accountCheck++;
 clearDraft();library=null;get('import-workspace').hidden=true;get('account-status').textContent=text;
 const link=document.createElement('a');link.href='/signin-with-chatgpt?return_to=%2Fimport.html';link.target='_top';link.textContent=' Sign in again';get('account-status').append(link);
 controls();
}
async function refreshAccount(){
 if(saving)return;
 const check=++accountCheck;
 try{
  const current=await api();
  if(check!==accountCheck||saving)return;
  if(library&&library.accountKey!==current.accountKey){loseAccount('The account changed. Your unsaved import was cleared.');return}
  const modified=library&&library.revision!==current.revision;
  library=current;get('import-workspace').hidden=false;get('account-status').textContent='Importing into your private library.';
  window.GmailImport?.controls?.();
  if(modified&&rows.length){markDuplicates();renderRows();get('approve-import').checked=false;message('Your library changed elsewhere. Check the duplicate warnings and approve again.')}
 }catch(error){if(error.status===401)loseAccount('Sign in to import into your library.');else message(error.message)}
 controls();
}
function markDuplicates(){
 const previous=[];
 for(const row of rows){
  row.duplicate=FilamentImport.duplicates(row.spool,library.items.concat(previous)).length>0;
  if(row.duplicate)row.selected=false;
  previous.push(row.spool);
 }
}
function renderRows(){
 const list=get('review-list');list.replaceChildren();
 reviewPage=Math.min(reviewPage,Math.max(0,Math.ceil(rows.length/reviewPageSize)-1));
 get('review-page').replaceChildren();
 for(let index=0;index<Math.ceil(rows.length/reviewPageSize);index++){const option=document.createElement('option');option.value=String(index);option.textContent=(index+1)+' of '+Math.ceil(rows.length/reviewPageSize);get('review-page').append(option)}
 get('review-page').value=String(reviewPage);
 rows.slice(reviewPage*reviewPageSize,(reviewPage+1)*reviewPageSize).forEach((row,offset)=>{
  const index=reviewPage*reviewPageSize+offset;
  const entry=document.createElement('fieldset');entry.className='entry';
  const legend=document.createElement('legend'),choice=document.createElement('label');choice.className='check';
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=row.selected;
  const title=document.createElement('span');title.textContent='Entry '+(index+1);
  choice.append(checkbox,title);legend.append(choice);entry.append(legend);
  const duplicate=document.createElement('p');duplicate.className='duplicate';duplicate.hidden=!row.duplicate;duplicate.textContent='Possible duplicate — already in your library or this batch. Starts unselected.';entry.append(duplicate);
  const warning=document.createElement('p');warning.className='warning';warning.textContent=row.warnings.join(' ');entry.append(warning);
  const grid=document.createElement('div');grid.className='fields';const inputs=[];
  for(const [key,labelText] of fields){
   const label=document.createElement('label');label.textContent=labelText;
   const options=key==='material'?materialOptions:key==='finish'?finishOptions:key==='packaging'?['unknown','spooled','refill']:null;
   const input=document.createElement(options?'select':'input');
   if(options){for(const value of ['',...options]){const option=document.createElement('option');option.value=value;option.textContent=value||'Choose…';input.append(option)}}
   else if(['spools','weightGrams'].includes(key)){input.type='number';input.min='1';input.max=key==='spools'?'500':'10000';input.step='1';input.placeholder='Unknown'}
   else if(key==='date')input.type='date';
   else {input.type='text';input.maxLength=key==='notes'?500:key==='product'?100:key==='hex'?7:80;if(key==='hex'){input.pattern='#[A-Fa-f0-9]{6}';input.placeholder='#RRGGBB'}}
   input.required=!['spools','weightGrams','notes'].includes(key);input.value=row.spool[key]??'';input.disabled=!row.selected;
   input.addEventListener('input',()=>{row.spool[key]=['spools','weightGrams'].includes(key)?input.value===''?null:Number(input.value):input.value;row.duplicate=FilamentImport.duplicates(row.spool,library.items.concat(rows.filter(other=>other!==row).map(other=>other.spool))).length>0;duplicate.hidden=!row.duplicate;duplicate.textContent='Possible duplicate — select only if this is additional stock.';changed()});
   inputs.push(input);label.append(input);grid.append(label);
  }
  checkbox.onchange=()=>{row.selected=checkbox.checked;for(const input of inputs)input.disabled=!row.selected;changed()};
  entry.append(grid);
  const details=document.createElement('details'),summary=document.createElement('summary'),source=document.createElement('pre');
  summary.textContent='Show source text';source.textContent=row.source||'Manually entered';details.append(summary,source);entry.append(details);list.append(entry);
 });
 get('review-status').textContent=rows.length+' candidate entr'+(rows.length===1?'y':'ies')+'. '+(rows.length?'Showing '+(reviewPage*reviewPageSize+1)+'–'+Math.min(rows.length,(reviewPage+1)*reviewPageSize)+'. ':'')+'Correct missing or uncertain fields before adding.';
 controls();
}
function extract(){
 try{
  const format=get('source-format').value||'text';
  rows=(format==='csv'?FilamentCsv:FilamentImport).parse(get('source-text').value).map(row=>({...row,selected:true,spool:{...row.spool,date:row.spool.date||today()}}));snapshotFormat=format;
  sourceSnapshot=get('source-text').value;reviewPage=0;markDuplicates();changed();renderRows();
  message(rows.length?'Review your entries. Nothing has been saved.':'No clear filament product lines found. Edit the text or add a blank entry.');
 }catch(error){message(error.message)}
}
function loadOcr(){
 if(window.Tesseract)return Promise.resolve(window.Tesseract);
 if(!scriptPromise)scriptPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='/vendor/ocr/tesseract.min.js';
  script.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(Error('Text reader unavailable.'));
  script.onerror=()=>{script.remove();scriptPromise=null;reject(Error('Could not load the text reader. Retry, or paste the text instead.'))};
  document.head.append(script);
 });
 return scriptPromise;
}
async function readImage(){
 if(reading||!imageFile||!library||get('source-format').value==='csv')return;
 const file=imageFile,token=++runId;reading=true;controls();get('ocr-status').textContent='Loading the on-device English text reader…';
 const timeout=setTimeout(()=>{if(token===runId)cancelRead('Reading timed out. Try a clearer, cropped screenshot or paste the text.')},90000);
 let currentWorker=null,bitmap=null;
 try{
  bitmap=await createImageBitmap(file);
  if(bitmap.width*bitmap.height>20000000)throw Error('Image is over 20 megapixels. Crop or resize it before importing.');
  const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();bitmap=null;
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(token!==runId)return;
  const engine=await loadOcr();if(token!==runId)return;
  currentWorker=await engine.createWorker('eng',1,{workerPath:'/vendor/ocr/worker.min.js',corePath:'/vendor/ocr',langPath:'/vendor/ocr',workerBlobURL:false,cacheMethod:'none',legacyCore:false,legacyLang:false,logger:update=>{if(token===runId)get('ocr-status').textContent='Reading text on this device… '+Math.round((update.progress||0)*100)+'%'}});
  if(token!==runId)return;worker=currentWorker;
  const result=await currentWorker.recognize(blob);
  if(token!==runId)return;
  const text=result.data.text.trim();
  if(!text)throw Error('No readable text found. Try a sharper crop or paste the label text.');
  if(get('source-text').value.length+text.length>60000)throw Error('Too much text. Crop to the product details or use a smaller batch.');
  get('source-text').value=[get('source-text').value.trim(),text].filter(Boolean).join('\n\n');changed();
  get('ocr-status').textContent='Text added below. Correct any recognition mistakes, then choose Find filament entries.';
 }catch(error){if(token===runId)get('ocr-status').textContent=error.message||'Could not read this image. Try a screenshot or paste the text.'}
 finally{clearTimeout(timeout);if(bitmap)bitmap.close();if(currentWorker)await currentWorker.terminate().catch(()=>{});if(token===runId){worker=null;reading=false;controls()}}
}
async function save(event){
 event.preventDefault();if(saving||get('save-import').disabled||!get('review-form').reportValidity())return;
 saving=true;controls();
 try{
  const selected=rows.filter(row=>row.selected).map(row=>({...row.spool}));
  const fingerprint=JSON.stringify({account:library.accountKey,revision:library.revision,source:sourceSnapshot,selected});
  if(!pendingSave||pendingSave.fingerprint!==fingerprint){
   const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode((sourceSnapshot.trim()||JSON.stringify(selected)).replace(/\s+/g,' ')));
   const sourceHash=Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
   pendingSave={fingerprint,body:{kind:'import',reviewed:true,spools:selected,sourceHash,expectedAccountKey:library.accountKey,baseRevision:library.revision,requestId:crypto.randomUUID()}};
  }
  const current=await api('POST',pendingSave.body);
  if(current.accountKey!==library.accountKey){loseAccount('The account changed. Reopen the importer.');return}
  library=current;clearDraft();message('Added '+selected.length+' entries to your private library.');
  const link=document.createElement('a');link.href='/';link.textContent=' View your library';get('import-message').append(link);
 }catch(error){
  if(error.status===401)loseAccount('Your sign-in expired. Reopen the importer.');
  else if(Number.isInteger(error.entryIndex)&&error.entryIndex>=0&&error.entryIndex<rows.filter(row=>row.selected).length){
   const row=rows.filter(row=>row.selected)[error.entryIndex],index=rows.indexOf(row);
   reviewPage=Math.floor(index/reviewPageSize);saving=false;changed();renderRows();
   message('Entry '+(index+1)+': '+error.message+' Nothing was saved.');get('review-heading').focus();get('review-heading').scrollIntoView({block:'start'});get('review-form').reportValidity();
  }
  else {message(error.message);if(error.status===409){pendingSave=null;saving=false;await refreshAccount()}}
 }finally{saving=false;controls()}
}
get('source-image').onchange=()=>{
 const file=get('source-image').files?.[0];releaseImage();
 if(!file){controls();return}
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024){message('Choose a JPG, PNG or WebP no larger than 10 MB.');controls();return}
 imageFile=file;imageUrl=URL.createObjectURL(file);get('image-preview').src=imageUrl;get('image-preview').hidden=false;get('ocr-status').textContent='Ready. Select Read image text to process it on this device.';controls();
};
get('source-csv').onchange=async()=>{
 const file=get('source-csv').files?.[0];get('source-csv').value='';if(!file||reading||saving||!library)return;
 if(get('source-text').value.trim()||rows.length){message('Clear the current draft before loading a CSV. Nothing was replaced.');return;}
 if(!/\.csv$/i.test(file.name)||file.size>FilamentCsv.maxBytes){message('Choose a UTF-8 .csv up to 1 MB and 500 entries. Save Excel workbooks as CSV first.');return;}
 const token=++runId;reading=true;changed();get('ocr-status').textContent='Reading CSV on this device…';
 try{
  const text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());
  if(token!==runId)return;
  if(text.length>FilamentCsv.maxCharacters)throw Error('Use at most 1,000,000 characters per CSV.');
  get('source-format').value='csv';get('source-text').value=text;extract();get('ocr-status').textContent='CSV loaded for review. Nothing saved.';
 }catch(error){if(token===runId)message(error.message||'Could not read CSV. Save it as UTF-8 and try again.');}
 finally{if(token===runId){reading=false;controls();}}
};
get('source-format').onchange=changed;get('source-text').oninput=changed;get('read-image').onclick=readImage;get('cancel-read').onclick=()=>cancelRead();
get('extract').onclick=extract;get('clear-import').onclick=clearDraft;
get('add-blank').onclick=()=>{
 if(rows.length>=FilamentCsv.maxEntries){message('Use at most 500 entries per batch.');return}
 rows.push({source:'',warnings:['Enter the details from your label.'],selected:true,spool:{brand:'',product:'',material:'',finish:'unknown',colour:'',hex:'',spools:null,weightGrams:null,packaging:'unknown',date:today(),notes:''}});
 sourceSnapshot=get('source-text').value;snapshotFormat=get('source-format').value||'text';reviewPage=Math.floor((rows.length-1)/reviewPageSize);changed();renderRows();
};
function turnReviewPage(page){
 if(saving||reading||!library)return;
 reviewPage=Math.max(0,Math.min(page,Math.ceil(rows.length/reviewPageSize)-1));renderRows();get('review-heading').focus();get('review-heading').scrollIntoView({block:'start'});
}
for(const suffix of ['','-bottom']){get('review-prev'+suffix).onclick=()=>turnReviewPage(reviewPage-1);get('review-next'+suffix).onclick=()=>turnReviewPage(reviewPage+1)}
get('review-page').onchange=()=>turnReviewPage(Number(get('review-page').value));
get('approve-import').onchange=controls;get('review-form').onsubmit=save;
window.addEventListener('focus',refreshAccount);
window.addEventListener('pagehide',()=>{cancelRead('');releaseImage()});
refreshAccount();
