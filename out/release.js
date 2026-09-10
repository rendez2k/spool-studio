'use strict';
(()=>{
 const current=document.querySelector('meta[name="app-display-version"]')?.content;
 const parts=value=>typeof value==='string'&&/^\d+\.\d+\.\d+$/.test(value)&&value.split('.').every(part=>Number.isSafeInteger(Number(part)))?value.split('.').map(Number):null;
 if(!parts(current))return;
 const newer=(left,right)=>{const first=parts(left),second=parts(right);if(!first)return false;if(!second)return true;const index=first.findIndex((value,position)=>value!==second[position]);return index>=0&&first[index]>second[index]};
 const key='spool-studio-release-seen',links=[...document.querySelectorAll('.release-link')];
 let latest=current,seen='',lastCheck=0,checking=false;
 function stored(){try{return localStorage.getItem(key)||''}catch{return seen}}
 function update(){
  seen=stored();const unread=newer(latest,seen);
  for(const link of links){link.classList.toggle('release-unread',unread);link.href='/whats-new.html#v'+latest;link.setAttribute('aria-label','Version '+current+'. '+(unread?'New updates available: '+latest+'. ':'')+'What’s new (opens in a new tab)');link.title=unread?'New updates · v'+latest+' — opens in a new tab':'What’s new — opens in a new tab'}
 }
 const entry=document.getElementById('v'+current),heading=entry?.querySelector('h2');
 function markVisible(){
  if(!heading||document.visibilityState!=='visible')return;
  const box=heading.getBoundingClientRect();if(box.bottom<=0||box.top>=window.innerHeight)return;
  const saved=stored();if(newer(current,saved)){seen=current;try{localStorage.setItem(key,current)}catch{}}update();
 }
 async function check(){
  if(!links.length||checking||document.visibilityState!=='visible'||Date.now()-lastCheck<60000)return;
  checking=true;lastCheck=Date.now();
  try{const response=await fetch('/app-release.json',{cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(8000)});if(response.ok){const value=await response.json();if(newer(value.displayVersion,latest)){latest=value.displayVersion;update()}}}catch{}finally{checking=false}
 }
 window.addEventListener('storage',event=>{if(event.key===key||event.key===null)update()});
 window.addEventListener('focus',()=>{update();markVisible();check()});
 document.addEventListener('visibilitychange',()=>{update();markVisible();check()});
 if(heading){
  if(typeof IntersectionObserver!=='undefined'){const observer=new IntersectionObserver(markVisible);observer.observe(heading)}else window.addEventListener('scroll',markVisible,{passive:true});
 }
 update();markVisible();check();
})();
