'use strict';
(function(root){
 const defaultQuery='newer_than:1y (filament OR "Bambu Lab" OR SUNLU OR ELEGOO)';
 function searchQuery(query,kind='orders'){
  const terms=String(query||'').trim();
  if(!terms)throw Error('Enter a brand, shop or filament to search for.');
  if(kind==='all')return terms;
  return '('+terms+') {subject:confirmed subject:confirmation subject:receipt subject:invoice subject:ordered subject:"thank you for your order" subject:"order placed" subject:"order received"} -subject:shipment -subject:shipped -subject:dispatch -subject:dispatched -subject:delivery -subject:delivered -subject:tracking -subject:"on the way" -subject:welcome -subject:account -subject:password -subject:verification -subject:newsletter -subject:"set up" -subject:setup -subject:return -subject:returned -subject:refund -subject:refunded -subject:cancelled -subject:canceled -subject:cancellation';
 }
 function text(payload,htmlToText){
  let size=0,parts=0;const plain=[],html=[];
  function visit(part,depth){
   if(depth>12||++parts>200)throw Error('Email structure is too large. Paste the relevant product text instead.');
   if(part.filename)return;
   if(['text/plain','text/html'].includes(part.mimeType)&&part.body?.data){
    if(part.body.data.length>200000)throw Error('Email text is too large. Paste only the product lines.');
    const binary=atob(part.body.data.replace(/-/g,'+').replace(/_/g,'/'));
    const decoded=new TextDecoder().decode(Uint8Array.from(binary,value=>value.charCodeAt(0)));
    size+=decoded.length;if(size>300000)throw Error('Email body is too large. Paste only the product lines.');
    (part.mimeType==='text/plain'?plain:html).push(decoded);
    return;
   }
   for(const child of part.parts||[])visit(child,depth+1);
  }
  visit(payload||{},0);
  let result=plain.join('\n\n').trim();
  if(!result&&html.length&&typeof htmlToText==='function')result=html.map(htmlToText).filter(Boolean).join('\n\n').trim();
  if(!result)throw Error('No readable email text was available. Paste the order text or import a screenshot instead.');
  if(result.length>60000)throw Error('Email text exceeds 60000 characters.');
  return result;
 }
 const api={text,defaultQuery,searchQuery};if(typeof module==='object'&&module.exports)module.exports=api;else root.SpoolGmail=api;
})(typeof globalThis==='object'?globalThis:this);
