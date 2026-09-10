'use strict';
(function(root){
 function values(hex){
  if(typeof hex!=='string'||!/^#[a-f\d]{6}$/i.test(hex))return null;
  const [red,green,blue]=[1,3,5].map(offset=>parseInt(hex.slice(offset,offset+2),16)/255);
  const high=Math.max(red,green,blue),low=Math.min(red,green,blue),delta=high-low,lightness=(high+low)/2;
  const saturation=delta?delta/(1-Math.abs(2*lightness-1)):0;
  let hue=delta?(high===red?(green-blue)/delta:high===green?(blue-red)/delta+2:(red-green)/delta+4)*60:0;
  hue=(hue+360)%360;
  return {hue,lightness,saturation,delta};
 }
 function build(rows){
  const groups=new Map(),excluded=[];
  for(const row of rows){
   if(row.used||row.spools===0)continue;
   const colour=values(row.hex);
   const reason=!Number.isInteger(row.spools)||row.spools<0?'Roll count unknown':!colour?'Colour value missing':/bundle|rainbow|dual|gradient|multi|transition|\//i.test((row.colour||'')+' '+(row.product||''))||/[＋+]/.test(row.colour||'')?'More than one colour':null;
   if(reason){excluded.push({row,reason});continue}
   const hex=row.hex.toUpperCase(),source=row.colourSource?.label||(row.hexMode==='manual'?'Custom colour':'Estimated colour');
   const key=JSON.stringify([row.brand,row.product,row.material,row.finish,row.colour,hex,source]);
   if(!groups.has(key))groups.set(key,{key,hex,source,colour:row.colour||'Unnamed shade',brand:row.brand||'Unknown brand',product:row.product||row.material||'Unknown type',material:row.material||'Unknown',finish:row.finish||'unknown',rolls:0,members:[],...colour,neutral:colour.delta<0.10||colour.saturation<0.12||/\b(white|ivory|black|charcoal|gr[ae]y|silver)\b/i.test(row.colour||'')});
   const group=groups.get(key);group.rolls+=row.spools;group.members.push(row);
  }
  const ordered=[...groups.values()].sort((left,right)=>Number(left.neutral)-Number(right.neutral)||(left.neutral?right.lightness-left.lightness:left.hue-right.hue)||right.lightness-left.lightness||left.key.localeCompare(right.key));
  const rings=[false,true].map(neutral=>{
   const members=ordered.filter(group=>group.neutral===neutral),total=members.reduce((sum,group)=>sum+group.rolls,0);let start=0;
   return members.map(group=>{const segment={...group,start,end:start+group.rolls/total*360};start=segment.end;return segment});
  });
  return {groups:rings.flat(),excluded,total:ordered.reduce((sum,group)=>sum+group.rolls,0),coloured:rings[0].reduce((sum,group)=>sum+group.rolls,0),neutral:rings[1].reduce((sum,group)=>sum+group.rolls,0)};
 }
 function arc(start,end,inner,outer){
  const gap=Math.min(0.8,(end-start)*0.1),from=start+gap/2,to=end-gap/2;
  const point=(radius,angle)=>[250+radius*Math.cos((angle-90)*Math.PI/180),250+radius*Math.sin((angle-90)*Math.PI/180)].map(value=>value.toFixed(3)).join(' ');
  const large=to-from>180?1:0;
  return 'M '+point(outer,from)+' A '+outer+' '+outer+' 0 '+large+' 1 '+point(outer,to)+' L '+point(inner,to)+' A '+inner+' '+inner+' 0 '+large+' 0 '+point(inner,from)+' Z';
 }
 const api={values,build,arc};if(typeof module==='object'&&module.exports)module.exports=api;else root.SpoolColourWheel=api;
})(typeof globalThis==='object'?globalThis:this);
