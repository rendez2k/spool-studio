'use strict';
{
 const methods=new Set(['manual','barcode']);
 let requested=new URL(location.href).searchParams.get('add');
 function open(method){
  if(!methods.has(method)||libraryBusy||dataset.status!=='complete'||!dataset.accountKey||!window.SpoolAssist)return false;
  const dialog=document.getElementById('spool-dialog');
  if(dialog.open)return false;
  openSpoolForm();
  window.dispatchEvent(new CustomEvent('spool-entry-method',{detail:method}));
  dialog.scrollTop=0;
  document.getElementById(method==='barcode'?'assist-scan':'spool-brand-choice').focus({preventScroll:true});
  return true;
 }
 function resume(){
  if(!methods.has(requested)||!open(requested))return;
  requested=null;
  const url=new URL(location.href);url.searchParams.delete('add');history.replaceState(null,'',url);
 }
 document.addEventListener('click',event=>{
  const link=event.target.closest('a[href]');
  if(!link||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  const url=new URL(link.href);
  if(url.origin!==location.origin||url.pathname!=='/'||!methods.has(url.searchParams.get('add')))return;
  event.preventDefault();
  if(open(url.searchParams.get('add')))document.querySelector('.studio-menu')?.close();
 });
 window.MobileEntry={resume};
 resume();
}
