'use strict';
{
 const icons={
  add:'<path d="M12 5v14M5 12h14"/>',
  barcode:'<path d="M4 7V4h4m8 0h4v3M4 17v3h4m8 0h4v-3M7 8v8m3-8v8m4-8v8m3-8v8"/>',
  library:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  import:'<path d="M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5"/>',
  reels:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="m5.5 5.5 4.3 4.3m4.4 4.4 4.3 4.3m0-13-4.3 4.3m-4.4 4.4-4.3 4.3"/>',
  printer:'<path d="M6 8V3h12v5M6 17H3V8h18v9h-3M6 14h12v7H6zM17 11h1"/>',
  nfc:'<path d="M5 4a13 13 0 0 1 0 16M9 7a8 8 0 0 1 0 10M13 10a3 3 0 0 1 0 4"/><rect x="17" y="4" width="4" height="16" rx="1"/>',
  setup:'<path d="m3 6 2 2 4-4m-6 9 2 2 4-4m-6 9 2 2 4-4M13 6h8m-8 7h8m-8 7h8"/>',
  settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01"/>'
 };
 icons.shelf='<path d="M3 11h18M3 21h18M5 3h4v8M13 5h5v6M5 15h6v6M15 15h4v6"/>';
 icons.wheel='<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v5m9 4h-5m-4 9v-5m-9-4h5"/>';
 icons.match='<path d="M4 3h10l5 5v13H4zM14 3v6h5M8 15l2 2 5-5"/>';
 icons.list='<path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01"/>';
 const groups=[
  ['Your library',[['library','Collection','/?view=cards'],['list','List','/?view=table'],['import','Import stock','/import.html'],['shelf','Shelf & labels','/?view=shelf'],['wheel','Colour wheel','/?view=wheel']]],
  ['Prepare a print',[['match','Match a print','/?view=match']]],
  ['Print & track',[['printer','Send to printer','/printer.html'],['nfc','NFC tags','/nfc.html'],['reels','Spools & usage','/reels.html']]],
  ['Support',[['setup','Setup checklist','/welcome.html'],['settings','App & settings','/app.html'],['help','Help & guides','/guide.html']]]
 ];
 const paths=groups.flatMap(group=>group[1]);
 const current=location.pathname==='/'||location.pathname==='/index.html'?'/':location.pathname;
 const svg=name=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[name]+'</svg>';
 function navigation(entries,className,label){
  const nav=document.createElement('nav');nav.className=className;nav.setAttribute('aria-label',label);
  for(const [icon,title,href] of entries){const link=document.createElement('a');link.href=href;link.innerHTML=svg(icon);const text=document.createElement('span');text.textContent=title;link.append(text);nav.append(link)}
  return nav;
 }
 function workflow(){
  const container=document.createElement('div');container.className='studio-workflow';
  for(const [label,entries] of groups){const section=document.createElement('section'),heading=document.createElement('h2');heading.textContent=label;section.append(heading,navigation(entries,'studio-nav',label));container.append(section)}
  return container;
 }
 const sidebar=document.querySelector('.sidebar');
 if(sidebar){sidebar.querySelector('.tabs').hidden=true;sidebar.insertBefore(workflow(),sidebar.querySelector('.sidebar-bottom'))}
 else if(document.body.classList.contains('studio-secondary')){
  const rail=document.createElement('aside');rail.className='studio-rail';rail.setAttribute('aria-label','Spool Studio navigation');
  const brand=document.createElement('a');brand.className='studio-brand';brand.href='/';brand.innerHTML='<img src="/icons/filament.svg" width="32" height="32" alt=""><span>Spool Studio</span>';rail.append(brand);
  rail.append(workflow());
  const bottom=document.createElement('div');bottom.className='studio-rail-bottom';
  const toggle=document.createElement('button');toggle.type='button';toggle.setAttribute('aria-label','Switch colour theme');
  const preference=matchMedia('(prefers-color-scheme: dark)');
  let saved;try{saved=localStorage.getItem('filament-theme')}catch{}
  function theme(dark){document.body.classList.toggle('dark',dark);toggle.textContent=dark?'Light mode':'Dark mode'}
  theme(saved?saved==='dark':preference.matches);
  toggle.onclick=()=>{const dark=!document.body.classList.contains('dark');theme(dark);try{localStorage.setItem('filament-theme',dark?'dark':'light')}catch{}};
  bottom.append(toggle);rail.append(bottom);document.body.prepend(rail);
 }
 const mobile=navigation([paths[0],['add','Add spools','/?add=manual'],['barcode','Scan barcode','/?add=barcode'],['nfc','NFC tags','/nfc.html']],'studio-mobile-nav','Quick navigation');
 const menu=document.createElement('dialog');menu.className='studio-menu';menu.setAttribute('aria-label','Workspaces and settings');
 const close=document.createElement('button');close.type='button';close.textContent='Close navigation';close.onclick=()=>menu.close();
 const mobileTheme=document.createElement('button');mobileTheme.type='button';mobileTheme.textContent='Switch colour theme';mobileTheme.onclick=()=>document.querySelector('.sidebar-bottom button,.studio-rail-bottom button')?.click();
 menu.append(close,workflow(),mobileTheme);document.body.append(menu);
 const menuButton=document.createElement('button');menuButton.type='button';menuButton.innerHTML=svg('settings')+'<span>Menu</span>';menuButton.setAttribute('aria-haspopup','dialog');menuButton.onclick=()=>menu.showModal();mobile.append(menuButton);document.body.append(mobile);
 function syncNavigation(){
  const view=document.querySelector('.tabs [aria-selected=true]')?.id.replace('-tab','')||new URL(location.href).searchParams.get('view')||'cards';
  for(const link of document.querySelectorAll('.studio-nav a,.studio-mobile-nav a')){
   const destination=new URL(link.href),active=current==='/'?destination.pathname==='/'&&destination.searchParams.get('view')===view:destination.pathname===current;
   if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  }
 }
 document.addEventListener('click',event=>{
  const link=event.target.closest('.studio-nav a,.studio-mobile-nav a');if(!link)return;
  const destination=new URL(link.href),view=destination.searchParams.get('view'),tab=document.getElementById(view+'-tab');
  if(current==='/'&&destination.pathname==='/'&&tab&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey&&event.button===0){
   event.preventDefault();tab.click();const url=new URL(location.href);url.searchParams.set('view',view);history.replaceState(null,'',url);menu.close();syncNavigation();document.getElementById('view-title')?.scrollIntoView({block:'nearest'});
  }
 });
 const requested=new URL(location.href).searchParams.get('view');if(current==='/'&&['cards','table','shelf','wheel','match'].includes(requested))document.getElementById(requested+'-tab')?.click();
 document.querySelector('.tabs')?.addEventListener('click',syncNavigation);syncNavigation();
 const filters=document.getElementById('studio-filters');
 if(filters){
  const count=document.getElementById('studio-filter-count');
  const update=()=>{const active=['brand','material','colour','from','to'].filter(id=>document.getElementById(id).value).length;count.textContent=active?String(active):'';count.setAttribute('aria-label',active+' active filters')};
  filters.addEventListener('input',update);filters.addEventListener('change',update);
  document.getElementById('reset').addEventListener('click',update);
  filters.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();filters.open=false;filters.querySelector('summary').focus()}});
  document.addEventListener('click',event=>{if(filters.open&&!filters.contains(event.target))filters.open=false});
  update();
 }
}
