'use strict';
(function(root){
 function text(payload){
  let size=0,parts=0;
  function visit(part,depth){
   if(depth>12||++parts>200)throw Error('Email structure is too large. Paste the relevant product text instead.');
   if(part.filename)return '';
   if(part.mimeType==='text/plain'&&part.body?.data){
    if(part.body.data.length>100000)throw Error('Email text is too large. Paste only the product lines.');
    const binary=atob(part.body.data.replace(/-/g,'+').replace(/_/g,'/'));
    const decoded=new TextDecoder().decode(Uint8Array.from(binary,value=>value.charCodeAt(0)));
    size+=decoded.length;if(size>60000)throw Error('Email text exceeds 60000 characters.');
    return decoded;
   }
   return (part.parts||[]).map(child=>visit(child,depth+1)).filter(Boolean).join('\n\n');
  }
  const result=visit(payload||{},0).trim();
  if(!result)throw Error('No plain-text email body was available. Paste the order text or import a screenshot instead.');
  return result;
 }
 const api={text};if(typeof module==='object'&&module.exports)module.exports=api;else root.SpoolGmail=api;
})(typeof globalThis==='object'?globalThis:this);
