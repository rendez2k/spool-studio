'use strict';
const OFFLINE_PAGE='<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#2856c7"><title>Offline · Filament Library</title><style>:root{color-scheme:light dark;font:16px/1.5 system-ui,sans-serif}body{margin:0;padding:48px 24px;background:#f5f6f8;color:#202735}main{max-width:440px;margin:10vh auto}h1{font-size:1.75rem;line-height:1.2}p{color:#596579}a{display:inline-block;padding:12px 18px;border-radius:8px;background:#2856c7;color:white;text-decoration:none}a:focus-visible{outline:3px solid currentColor;outline-offset:4px}@media(prefers-color-scheme:dark){body{background:#151a23;color:#edf1f8}p{color:#adb8ca}}</style></head><body><main><h1>Reconnect to your filaments</h1><p>Your latest batch needs an internet connection. No saved selection will be written while offline.</p><a href="/nfc.html">Try again</a></main></body></html>';
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||event.request.mode!=='navigate'||url.origin!==self.location.origin||!['/','/index.html','/nfc.html'].includes(url.pathname))return;
 event.respondWith(fetch(event.request).catch(()=>new Response(OFFLINE_PAGE,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})));
});
