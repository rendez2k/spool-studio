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
  return snapshot.slots.slice(start-1,end).flatMap(row=>Array.from({length:copies},()=>({position:row.position,shelf:row.shelf,shelfSlot:row.shelfSlot,reelId:row.reelId,reelNumber:row.reelNumber,reelLocation:String(row.reelLocation||''),colour:String(row.colour||'Unknown colour'),brand:String(row.brand||'Unknown brand'),product:String(row.product||''),material:String(row.material||'Unknown material'),finish:String(row.finish||'unknown'),weightGrams:row.weightGrams,packaging:row.packaging})));
 }
 function signature(snapshot){return JSON.stringify(snapshot)}
 function fitFont(fits){
  let lower=8,upper=48;
  if(!fits(lower))return lower;
  for(let attempt=0;attempt<8;attempt++){const size=(lower+upper)/2;if(fits(size))lower=size;else upper=size}
  return Math.floor(lower*4)/4;
 }
 function qrSvg(code,style='square'){
  if(style!=='rounded')return code.createSvgTag({cellSize:4,margin:16,scalable:true}).replace('<svg ','<svg shape-rendering="crispEdges" ');
  const count=code.getModuleCount(),size=(count+8)*4,paths=[],fixedPaths=[];
  const dark=(row,column)=>row>=0&&column>=0&&row<count&&column<count&&code.isDark(row,column);
  for(let row=0;row<count;row++)for(let column=0;column<count;column++){
   if(!dark(row,column))continue;
   const left=(column+4)*4,top=(row+4)*4,right=left+4,bottom=top+4;
   const fixed=(row<9&&column<9)||(row<9&&column>=count-8)||(row>=count-8&&column<9)||row===6||column===6||row===0||column===0||row===count-1||column===count-1;
   const north=!dark(row-1,column),south=!dark(row+1,column),west=!dark(row,column-1),east=!dark(row,column+1);
   const upperLeft=!fixed&&north&&west ? 1.2 : 0,upperRight=!fixed&&north&&east ? 1.2 : 0,lowerRight=!fixed&&south&&east ? 1.2 : 0,lowerLeft=!fixed&&south&&west ? 1.2 : 0;
   (fixed?fixedPaths:paths).push('M'+(left+upperLeft)+' '+top+'H'+(right-upperRight)+'Q'+right+' '+top+' '+right+' '+(top+upperRight)+'V'+(bottom-lowerRight)+'Q'+right+' '+bottom+' '+(right-lowerRight)+' '+bottom+'H'+(left+lowerLeft)+'Q'+left+' '+bottom+' '+left+' '+(bottom-lowerLeft)+'V'+(top+upperLeft)+'Q'+left+' '+top+' '+(left+upperLeft)+' '+top+'Z');
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" data-style="rounded" viewBox="0 0 '+size+' '+size+'" preserveAspectRatio="xMinYMin meet"><rect width="100%" height="100%" fill="#fff"/><path d="'+paths.join('')+'" fill="#000"/><path d="'+fixedPaths.join('')+'" fill="#000" shape-rendering="crispEdges"/></svg>';
 }
 const api={presets,dimensions,plan,signature,qrSvg,fitFont};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.SpoolLabels=api;
})(typeof globalThis==='object'?globalThis:this);
