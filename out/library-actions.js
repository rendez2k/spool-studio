'use strict';
{
 const disclosure=document.getElementById('library-more');
 const trigger=disclosure.querySelector('summary');
 document.addEventListener('click',event=>{
  if(!disclosure.contains(event.target))disclosure.open=false;
  else if(event.target.closest('button,a')){disclosure.open=false;if(event.target.closest('button'))trigger.focus()}
 });
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&disclosure.open){disclosure.open=false;trigger.focus();event.preventDefault()}
 });
 disclosure.addEventListener('focusout',event=>{if(event.relatedTarget&&!disclosure.contains(event.relatedTarget))disclosure.open=false});
}
