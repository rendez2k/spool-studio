'use strict';
(function(root){
 function rows(items,reels){if(!Array.isArray(reels))return items;return items.map(item=>{const owned=reels.filter(reel=>reel.itemId===item.id);return owned.length?{...item,reels:owned,spools:item.used?owned.length:owned.filter(reel=>!reel.used).length}:item})}
 function label(number){return 'SP-'+String(number).padStart(5,'0')}
 function url(origin,id){if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid spool ID.');return new URL('/reels.html#r='+id,origin).href}
 const api={rows,label,url};if(typeof module==='object'&&module.exports)module.exports=api;else root.SpoolReels=api;
})(typeof globalThis==='object'?globalThis:this);
