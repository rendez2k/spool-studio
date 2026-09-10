'use strict';
(function(root){
 const presets=Object.freeze({'60x30':[60,30],'50x30':[50,30],'40x30':[40,30],'76x50':[76,50],'100x50':[100,50],'105x145':[105,145],'4x6':[101.6,152.4]});
 function dimensions(preset,width,height){
  const values=presets[preset]||[Number(width),Number(height)];
  if(!values.every(Number.isFinite)||values[0]<40||values[0]>210||values[1]<25||values[1]>297)throw Error('Use a width of 40–210 mm and a height of 25–297 mm.');
  return values.map(value=>Math.round(value*10)/10);
 }
 function plan(snapshot,{start,end,copies}){
  if(!snapshot.accountKey)throw Error('Sign in and load your library before printing.');
  if(!snapshot.slots.length)throw Error('There are no counted, available rolls in this shelf view.');
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start||end>snapshot.slots.length)throw Error('Choose a valid first and last position from this shelf view.');
  if(![1,2].includes(copies))throw Error('Choose one label or two matching labels per roll.');
  if((end-start+1)*copies>500)throw Error('Print up to 500 labels at a time. Choose a smaller range.');
  return snapshot.slots.slice(start-1,end).flatMap(row=>Array.from({length:copies},()=>({position:row.position,shelf:row.shelf,shelfSlot:row.shelfSlot,reelId:row.reelId,reelNumber:row.reelNumber,colour:String(row.colour||'Unknown colour'),brand:String(row.brand||'Unknown brand'),product:String(row.product||''),material:String(row.material||'Unknown material'),finish:String(row.finish||'unknown'),weightGrams:row.weightGrams,packaging:row.packaging})));
 }
 function signature(snapshot){return JSON.stringify(snapshot)}
 function fitFont(fits){
  let lower=8,upper=48;
  if(!fits(lower))return lower;
  for(let attempt=0;attempt<8;attempt++){const size=(lower+upper)/2;if(fits(size))lower=size;else upper=size}
  return Math.floor(lower*4)/4;
 }
 function qrSvg(code){return code.createSvgTag({cellSize:4,margin:16,scalable:true}).replace('<svg ','<svg shape-rendering="crispEdges" ')}
 const api={presets,dimensions,plan,signature,qrSvg,fitFont};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.SpoolLabels=api;
})(typeof globalThis==='object'?globalThis:this);
