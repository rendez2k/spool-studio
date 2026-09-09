(function (root) {
 'use strict';
 const amazonTag='strata0b-21';
 const disclosure='As an Amazon Associate I earn from qualifying purchases.';
 const clean=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,80):'';
 const escape=value=>String(value).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
 function broadColour(hex){
  if(!/^#[\da-f]{6}$/i.test(hex||''))return '';
  const [red,green,blue]=[1,3,5].map(offset=>parseInt(hex.slice(offset,offset+2),16)/255);
  const maximum=Math.max(red,green,blue),minimum=Math.min(red,green,blue),range=maximum-minimum,lightness=(maximum+minimum)/2;
  if(lightness<0.10)return 'black';
  if(lightness>0.93)return 'white';
  if(range<0.10)return lightness>0.78?'light grey':lightness<0.3?'dark grey':'grey';
  let hue=(maximum===red?(green-blue)/range+(green<blue?6:0):maximum===green?(blue-red)/range+2:(red-green)/range+4)*60;
  if(hue<18||hue>=345)return lightness>0.65?'pink':'red';
  if(hue<48)return lightness<0.45?'brown':lightness>0.75?'beige':'orange';
  if(hue<70)return 'yellow';
  if(hue<165)return 'green';
  if(hue<195)return 'cyan';
  if(hue<265)return 'blue';
  if(hue<300)return 'purple';
  return 'pink';
 }
 function search(required,packaging='either'){
  const material=clean(required.material);
  if(!['PLA','PLA+','PETG','ABS','ASA','TPU','PA','PC','PVA','HIPS'].includes(material))return null;
  const brand=clean(required.brand);
  const colour=clean(required.colourName)||broadColour(required.hex);
  const finish={matte:'matte',standard:'standard',silk:'silk',marble:'marble',sparkle:'sparkle',wood:'wood',glow:'glow in the dark',satin:'satin',metal:'metallic'}[required.finish]||'';
  const terms=[!/^generic$|^unknown$/i.test(brand)?brand:'',material,finish,colour,'3D printer filament',packaging==='refill'?'refill':packaging==='spooled'?'with spool':''].filter(Boolean).join(' ');
  const url=new URL('https://www.amazon.co.uk/s');
  url.searchParams.set('k',terms);url.searchParams.set('tag',amazonTag);
  return {url:url.href,terms,estimated:!clean(required.colourName)};
 }
 function render(required,result){
  if(!required.included||result.exact.length)return '';
  const shopping=search(required);
  if(!shopping)return '';
  return '<div class="match-shopping"><a data-shop-link href="'+escape(shopping.url)+'" target="_blank" rel="sponsored noopener noreferrer">Search Amazon UK (paid link)</a><p>'+escape(shopping.terms)+'</p><p>'+(shopping.estimated?'Broad colour estimate, not an exact shade. ':'')+'Search results are not verified matches. Check material, finish, diameter and refill/spool options before buying.</p></div>';
 }
 const api={search,render,broadColour,disclosure};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.FilamentShopping=api;
})(typeof globalThis!=='undefined'?globalThis:this);
