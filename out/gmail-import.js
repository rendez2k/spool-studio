'use strict';
{
 const node=id=>document.getElementById(id),scope='https://www.googleapis.com/auth/gmail.readonly';
 let token='',expires=0,config=null,tokenClient=null,preparedOwner='',sequence=0,busy=false,owner='',controller=null,readyPromise=null,consentTimer=null;
 const status=text=>node('gmail-status').textContent=text;
 function controls(){
  const ready=Boolean(library)&&!saving&&!reading&&!busy;
  node('gmail-prepare').disabled=!ready;node('gmail-connect').disabled=!ready||!tokenClient||preparedOwner!==library?.accountKey;
  node('gmail-search').disabled=node('gmail-query').disabled=node('gmail-search-kind').disabled=!ready||!token;
  node('gmail-read').disabled=!ready||!token;node('gmail-disconnect').disabled=!token;
  node('gmail-cancel').hidden=!busy;node('gmail-results').querySelectorAll('input').forEach(input=>input.disabled=!ready);
 }
 function clear(resetConfiguration=false){
  sequence++;controller?.abort();controller=null;clearTimeout(consentTimer);token='';expires=0;owner='';busy=false;
  if(resetConfiguration){config=null;tokenClient=null;preparedOwner='';node('gmail-connect').hidden=true}
  node('gmail-results').replaceChildren();node('gmail-query').value=SpoolGmail.defaultQuery;node('gmail-search-kind').value='orders';controls();
 }
 function valid(current){return current===sequence&&library?.accountKey===owner}
 async function account(){
  const current=await api();if(!library||current.accountKey!==library.accountKey){loseAccount('The account changed. Reopen the importer.');throw Error('Sign in again before reading mail.')}
  return current.accountKey;
 }
 async function googleRequest(path,current){
  if(!valid(current)||!token||Date.now()>=expires)throw Error('Gmail permission expired. Choose Connect Gmail again.');
  const response=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/'+path,{credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]),headers:{Authorization:'Bearer '+token}});
  if(!response.ok)throw Error(response.status===401?'Gmail permission expired. Reconnect Gmail.':'Gmail could not return those messages. Check the connection and try again.');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000000)throw Error('Email response is too large. Paste the product text instead.');chunks.push(value)}}finally{await reader.cancel()}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  if(!valid(current))throw Error('Mail request cancelled.');
  return JSON.parse(new TextDecoder().decode(bytes));
 }
 function loadGoogle(){
  if(window.google?.accounts?.oauth2)return Promise.resolve();
  if(!readyPromise)readyPromise=new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
   const timer=setTimeout(fail,15000);
   function fail(){clearTimeout(timer);script.remove();readyPromise=null;reject(Error('Google connection could not load. Try again.'))}
   script.onerror=fail;script.onload=()=>{clearTimeout(timer);if(window.google?.accounts?.oauth2)resolve();else fail()};document.head.append(script);
  });
  return readyPromise;
 }
 node('gmail-prepare').onclick=async()=>{
  if(busy||!library||saving||reading)return;
  clear(true);const current=sequence,accountKey=library.accountKey,isCurrent=()=>current===sequence&&library?.accountKey===accountKey;
  busy=true;controller=new AbortController();controls();
  try{
   await account();if(!isCurrent())return;
   const response=await fetch('/api/gmail-config',{credentials:'same-origin',redirect:'error',cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
   if(!response.ok)throw Error('Gmail setup is unavailable. Try again after signing in.');
   const available=await response.json();if(!isCurrent())return;
   if(!available.enabled){status('Direct Gmail import is not enabled for this account yet. Google consent setup and verification are still required. Use pasted text, CSV or images meanwhile.');return}
   await loadGoogle();
   if(!isCurrent())return;await account();if(!isCurrent())return;
   config=available;preparedOwner=accountKey;
   tokenClient=window.google.accounts.oauth2.initTokenClient({client_id:config.clientId,scope,include_granted_scopes:false,callback:()=>{}});
   node('gmail-connect').hidden=false;status(config.testing?'Gmail test access is ready. Connect and approve read-only access in Google.':'Ready. Connect Gmail to request separate read-only permission.');
  }catch(error){if(isCurrent())status(error.message)}finally{if(isCurrent()){busy=false;controls()}}
 };
 node('gmail-connect').onclick=()=>{
  if(!tokenClient||busy||!library||saving||reading)return;
  if(preparedOwner!==library.accountKey){clear(true);status('The account changed. Check Gmail availability again.');return}
  clear();owner=library.accountKey;const current=sequence;busy=true;controls();status('Waiting for Google permission…');
  consentTimer=setTimeout(()=>{if(valid(current)){clear();status('Google permission timed out. Try connecting again.')}},120000);
  tokenClient=window.google.accounts.oauth2.initTokenClient({client_id:config.clientId,scope,include_granted_scopes:false,callback:value=>{
   if(!valid(current))return;clearTimeout(consentTimer);busy=false;
   if(value.error||!value.access_token||!window.google.accounts.oauth2.hasGrantedAllScopes(value,scope)){status('Read-only Gmail access was not granted. No messages were loaded.');controls();return}
   token=value.access_token;expires=Date.now()+Math.min(Number(value.expires_in)||0,3600)*1000;status('Connected for this page session. Search, select orders, then copy their text for review.');controls();
  },error_callback:()=>{if(valid(current)){clear();status('Google sign-in was closed or blocked. Try again when ready.')}}});
  tokenClient.requestAccessToken({prompt:'consent'});
 };
 node('gmail-search').onclick=async()=>{
  if(busy||!token||!library||saving||reading)return;const current=++sequence;busy=true;controller=new AbortController();controls();node('gmail-results').replaceChildren();status('Finding up to 20 email subjects…');
  try{
   await account();if(!valid(current))return;
   const query=SpoolGmail.searchQuery(node('gmail-query').value,node('gmail-search-kind').value);
   const listing=await googleRequest('messages?maxResults=20&q='+encodeURIComponent(query),current);
   for(const message of (listing.messages||[]).slice(0,20)){
    if(!/^[a-f0-9]+$/i.test(message.id))continue;
    const result=await googleRequest('messages/'+message.id+'?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date',current);
    const headers=result.payload?.headers||[],header=name=>headers.find(header=>header.name.toLowerCase()===name)?.value||'';
    const label=document.createElement('label'),checkbox=document.createElement('input'),title=document.createElement('span');checkbox.type='checkbox';checkbox.value=message.id;title.textContent=[header('subject')||'No subject',header('from'),header('date')].join(' · ');label.append(checkbox,title);node('gmail-results').append(label);
   }
   status(node('gmail-results').children.length?'Select up to 10 order emails. Pick one confirmation per order, not a receipt as well. Bodies load only when you choose Copy selected order text.'+(listing.nextPageToken?' More matches exist: narrow by shop or date to find older orders.':''):'No matching emails. Try another brand or date, or choose All matching emails if the shop uses a different subject.');
  }catch(error){if(valid(current))status(error.message)}finally{if(valid(current)){busy=false;controls()}}
 };
 node('gmail-read').onclick=async()=>{
  if(busy||!token||!library||saving||reading)return;
  if(node('source-text').value||rows.length){status('Clear your current import draft before loading email text. Nothing has been replaced.');return}
  const selected=[...node('gmail-results').querySelectorAll('input:checked')].map(input=>input.value);
  if(!selected.length||selected.length>10){status('Select 1–10 order emails.');return}
  const current=++sequence;busy=true;controller=new AbortController();controls();status('Reading selected order text on this device…');
  try{
   await account();if(!valid(current))return;
   const parts=[];for(const id of selected){const result=await googleRequest('messages/'+id+'?format=full',current);parts.push(SpoolGmail.text(result.payload));if(parts.join('\n\n').length>60000)throw Error('Selected emails exceed 60000 characters. Select fewer orders.')}
   if(!valid(current))return;
   if(saving||reading||node('source-text').value||rows.length)throw Error('Your import draft changed. Clear it before copying email text.');
   node('source-format').value='text';node('source-text').value=parts.join('\n\n');changed();node('source-text').focus();status('Order text copied below. Remove addresses and unrelated lines, then choose Find filament entries. Nothing has been saved.');
  }catch(error){if(valid(current))status(error.message)}finally{if(valid(current)){busy=false;controls()}}
 };
 node('gmail-cancel').onclick=()=>{sequence++;controller?.abort();clearTimeout(consentTimer);busy=false;controls();status('Cancelled. No import was saved.')};
 node('gmail-search-kind').onchange=node('gmail-query').oninput=()=>{node('gmail-results').replaceChildren();status('Search changed. Choose Find up to 20 emails to load fresh results.')};
 node('gmail-disconnect').onclick=()=>{const previous=token;clear(true);const current=sequence,accountKey=library?.accountKey;status('Disconnected on this page. Revoking Gmail permission…');window.google?.accounts?.oauth2.revoke(previous,result=>{if(current===sequence&&library?.accountKey===accountKey)status(result.successful?'Gmail permission revoked. Copied import text remains until you clear it.':'Page disconnected. You can remove access in your Google Account permissions.')})};
 window.GmailImport={controls,clear:()=>{clear(true);status('Gmail session cleared.')}};
 window.addEventListener('pagehide',()=>clear(true));window.addEventListener('focus',controls);controls();
}
