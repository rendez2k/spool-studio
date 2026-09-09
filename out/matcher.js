'use strict';
const FilamentMatcher=(()=>{
 const MAX_FILE=100*1024*1024;
 const MAX_METADATA=2*1024*1024;
 const text=value=>typeof value==='string'?value.trim().slice(0,400):'';
 const normalize=value=>text(value).toLowerCase().replace(/grey/g,'gray').replace(/[^a-z0-9+]+/g,' ').trim().replace(/\s+/g,' ');
 const validHex=value=>/^#[0-9a-f]{6}(?:ff)?$/i.test(text(value))?text(value).slice(0,7).toUpperCase():null;
 function finish(value){
  const label=normalize(value);
  if(/\bmatt(?:e)?\b/.test(label))return 'matte';
  for(const kind of ['silk','marble','sparkle','wood','glow','satin','metal'])if(new RegExp('\\b'+kind+'\\b').test(label))return kind;
  if(/\b(?:basic|standard|normal)\b/.test(label))return 'standard';
  return 'unknown';
 }
 function material(value,profile=''){
  const explicit=text(value).toUpperCase().replace(/\s+/g,'');
  if(explicit)return explicit;
  return text(profile).toUpperCase().match(/\b(?:PLA\+|PLA-CF|PETG-CF|PLA|PETG|ABS|ASA|TPU|PA|PC)(?=$|[^A-Z0-9+_-])/)?.[0]||'UNKNOWN';
 }
 function brand(value){const label=normalize(value);return label==='bambu'?'bambu lab':label}
 function product(value,vendor){
  let label=normalize(text(value).split('@')[0]);
  const vendorName=brand(vendor);
  for(const prefix of [vendorName,vendorName==='bambu lab'?'bambu':''])if(prefix&&label.startsWith(prefix+' ')){label=label.slice(prefix.length+1);break}
  return label.split(' ').filter(Boolean).sort().join(' ');
 }
 function parseSettings(settings,name){
  if(!settings||typeof settings!=='object'||Array.isArray(settings))throw Error('Invalid project settings.');
  const list=key=>Array.isArray(settings[key])?settings[key]:typeof settings[key]==='string'?[settings[key]]:[];
  const colours=list('filament_colour'),profiles=list('filament_settings_id'),types=list('filament_type'),vendors=list('filament_vendor'),names=list('filament_colour_name');
  const count=Math.max(colours.length,profiles.length,types.length);
  if(!count)throw Error('No saved filament slots found. Save the model as a Bambu Studio or OrcaSlicer project, not geometry only.');
  if(count>64)throw Error('This project has more than 64 filament slots and is not supported.');
  return {name:text(name)||'3MF project',slots:Array.from({length:count},(_,index)=>{
   const profile=text(profiles[index]);return {slot:index+1,hex:validHex(colours[index]),profile,material:material(types[index],profile),brand:text(vendors[index]),finish:finish(profile),colourName:text(names[index]),included:true};
  })};
 }
 const crcTable=Array.from({length:256},(_,value)=>{let result=value;for(let bit=0;bit<8;bit++)result=result&1?0xedb88320^(result>>>1):result>>>1;return result>>>0});
 function crc32(bytes){let result=0xffffffff;for(const byte of bytes)result=crcTable[(result^byte)&255]^(result>>>8);return (result^0xffffffff)>>>0}
 async function readProject(buffer,name){
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<22||buffer.byteLength>MAX_FILE)throw Error('Choose a valid 3MF file under 100 MB.');
  const view=new DataView(buffer),bytes=new Uint8Array(buffer);
  const within=(offset,length)=>{if(offset<0||length<0||offset+length>buffer.byteLength)throw Error('The 3MF archive is truncated or corrupt.')};
  let end=-1;
  for(let offset=bytes.length-22;offset>=Math.max(0,bytes.length-65557);offset--)if(view.getUint32(offset,true)===0x06054b50&&offset+22+view.getUint16(offset+20,true)===bytes.length){end=offset;break}
  if(end<0)throw Error('This is not a supported ZIP-based 3MF file.');
  const count=view.getUint16(end+10,true),directorySize=view.getUint32(end+12,true),directoryOffset=view.getUint32(end+16,true);
  if(view.getUint16(end+4,true)||view.getUint16(end+6,true)||view.getUint16(end+8,true)!==count||count===65535||count>10000||directoryOffset===0xffffffff||directorySize>4*1024*1024)throw Error('Multi-part or ZIP64 archives are not supported. Re-save a normal 3MF project.');
  within(directoryOffset,directorySize);
  if(directoryOffset+directorySize>end)throw Error('Invalid 3MF directory.');
  const decoder=new TextDecoder('utf-8',{fatal:true});let offset=directoryOffset;let entry=null;const previewEntries=[];
  for(let index=0;index<count;index++){
   within(offset,46);if(view.getUint32(offset,true)!==0x02014b50)throw Error('Invalid 3MF directory entry.');
   const nameLength=view.getUint16(offset+28,true),extraLength=view.getUint16(offset+30,true),commentLength=view.getUint16(offset+32,true);
   const length=46+nameLength+extraLength+commentLength;within(offset,length);
   if(offset+length>directoryOffset+directorySize)throw Error('Invalid 3MF directory size.');
   const entryName=decoder.decode(bytes.subarray(offset+46,offset+46+nameLength)).replace(/\\/g,'/').toLowerCase();
   const candidate={name:entryName,flags:view.getUint16(offset+8,true),method:view.getUint16(offset+10,true),crc:view.getUint32(offset+16,true),packed:view.getUint32(offset+20,true),size:view.getUint32(offset+24,true),offset:view.getUint32(offset+42,true)};
   if(/^metadata\/plate_\d+\.png$/.test(entryName)||entryName==='auxiliaries/.thumbnails/thumbnail_3mf.png')previewEntries.push(candidate);
   if(entryName==='metadata/project_settings.config'){
    if(entry)throw Error('The archive contains duplicate project settings.');
    entry=candidate;
   }
   offset+=length;
  }
  if(!entry)throw Error('No Bambu/Orca project settings found. Export as a 3MF project with filament presets, rather than a generic model.');
  async function unpack(entry){
  if(entry.flags&1)throw Error('Encrypted 3MF files are not supported.');
  if(![0,8].includes(entry.method)||entry.size>MAX_METADATA||entry.packed>MAX_METADATA)throw Error('Project settings are too large or use unsupported compression.');
  within(entry.offset,30);
  if(view.getUint32(entry.offset,true)!==0x04034b50||view.getUint16(entry.offset+8,true)!==entry.method)throw Error('Invalid project settings header.');
  const start=entry.offset+30+view.getUint16(entry.offset+26,true)+view.getUint16(entry.offset+28,true);
  within(start,entry.packed);if(start+entry.packed>directoryOffset)throw Error('Invalid project settings location.');
  const packed=bytes.subarray(start,start+entry.packed);let unpacked=packed;
  if(entry.method===8){
   let decompressor;try{decompressor=new DecompressionStream('deflate-raw')}catch{throw Error('This browser cannot open compressed projects. Use a current version of Chrome, Edge, Firefox or Safari.')}
   const reader=new Blob([packed]).stream().pipeThrough(decompressor).getReader();const chunks=[];let total=0;
   try{while(true){const chunk=await reader.read();if(chunk.done)break;total+=chunk.value.length;if(total>MAX_METADATA||total>entry.size){await reader.cancel();throw Error('Project settings exceed the safe size limit.')}chunks.push(chunk.value)}}finally{reader.releaseLock()}
   unpacked=new Uint8Array(total);let cursor=0;for(const chunk of chunks){unpacked.set(chunk,cursor);cursor+=chunk.length}
  }
  if(unpacked.length!==entry.size||crc32(unpacked)!==entry.crc)throw Error('Project settings failed the integrity check. Please export the file again.');
  return unpacked;
  }
  const unpacked=await unpack(entry);
  let settings;try{settings=JSON.parse(decoder.decode(unpacked).replace(/^\uFEFF/,''))}catch{throw Error('Project settings are not valid JSON. Please export a Bambu/Orca 3MF project.')}
  const project=parseSettings(settings,name);project.previews=[];let previewBytes=0;
  const plates=previewEntries.filter(candidate=>candidate.name.startsWith('metadata/')).sort((left,right)=>left.name.localeCompare(right.name,undefined,{numeric:true}));
  const candidates=plates.length?plates:previewEntries;
  for(const candidate of candidates.slice(0,12)){
   try{
    if(previewBytes+candidate.size>8*1024*1024)continue;
    const content=await unpack(candidate);
    if(!validPreview(content))continue;
    project.previews.push({name:candidate.name.startsWith('metadata/')?'Plate '+candidate.name.match(/plate_(\d+)/)[1]:'Project preview',bytes:content});previewBytes+=content.length;
   }catch{}
  }
  return project;
 }
 function validPreview(bytes){
  if(bytes.length<33||![137,80,78,71,13,10,26,10].every((byte,index)=>bytes[index]===byte))return false;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(view.getUint32(8)!==13||view.getUint32(12)!==0x49484452)return false;
  const width=view.getUint32(16),height=view.getUint32(20);
  return width>0&&height>0&&width<=4096&&height<=4096&&width*height<=16*1024*1024;
 }
 function lab(hex){
  const channels=[1,3,5].map(offset=>parseInt(hex.slice(offset,offset+2),16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  const [red,green,blue]=channels;
  const xyz=[(red*.4124564+green*.3575761+blue*.1804375)/.95047,red*.2126729+green*.7151522+blue*.072175, (red*.0193339+green*.119192+blue*.9503041)/1.08883].map(value=>value>216/24389?Math.cbrt(value):(24389/27*value+16)/116);
  return [116*xyz[1]-16,500*(xyz[0]-xyz[1]),200*(xyz[1]-xyz[2])];
 }
 function deltaE2000(first,second){
  const [lightFirst,axisFirst,blueFirst]=first,[lightSecond,axisSecond,blueSecond]=second;
  const radians=degrees=>degrees*Math.PI/180;
  const averageChroma=(Math.hypot(axisFirst,blueFirst)+Math.hypot(axisSecond,blueSecond))/2;
  const correction=.5*(1-Math.sqrt(averageChroma**7/(averageChroma**7+25**7)));
  const adjustedFirst=(1+correction)*axisFirst,adjustedSecond=(1+correction)*axisSecond;
  const chromaFirst=Math.hypot(adjustedFirst,blueFirst),chromaSecond=Math.hypot(adjustedSecond,blueSecond);
  const hue=(axis,blue)=>{const angle=Math.atan2(blue,axis)*180/Math.PI;return angle<0?angle+360:angle};
  const hueFirst=chromaFirst===0?0:hue(adjustedFirst,blueFirst),hueSecond=chromaSecond===0?0:hue(adjustedSecond,blueSecond);
  const noChroma=chromaFirst*chromaSecond===0;
  let hueDifference=hueSecond-hueFirst;
  if(noChroma)hueDifference=0;else if(hueDifference>180)hueDifference-=360;else if(hueDifference< -180)hueDifference+=360;
  const deltaHue=2*Math.sqrt(chromaFirst*chromaSecond)*Math.sin(radians(hueDifference/2));
  const averageLight=(lightFirst+lightSecond)/2,adjustedChroma=(chromaFirst+chromaSecond)/2;
  let averageHue=hueFirst+hueSecond;
  if(!noChroma){if(Math.abs(hueFirst-hueSecond)>180)averageHue+=averageHue<360?360:-360;averageHue/=2}
  const hueWeight=1-.17*Math.cos(radians(averageHue-30))+.24*Math.cos(radians(2*averageHue))+.32*Math.cos(radians(3*averageHue+6))-.20*Math.cos(radians(4*averageHue-63));
  const rotationAngle=30*Math.exp(-(((averageHue-275)/25)**2));
  const rotation=-2*Math.sqrt(adjustedChroma**7/(adjustedChroma**7+25**7))*Math.sin(radians(2*rotationAngle));
  const lightTerm=(lightSecond-lightFirst)/(1+.015*(averageLight-50)**2/Math.sqrt(20+(averageLight-50)**2));
  const chromaTerm=(chromaSecond-chromaFirst)/(1+.045*adjustedChroma);
  const hueTerm=deltaHue/(1+.015*adjustedChroma*hueWeight);
  return Math.sqrt(Math.max(0,lightTerm**2+chromaTerm**2+hueTerm**2+rotation*chromaTerm*hueTerm));
 }
 function distance(left,right){if(!validHex(left)||!validHex(right))return null;return deltaE2000(lab(validHex(left)),lab(validHex(right)))}
 function namedIdentity(required,candidate){
  const named=normalize(required.colourName);
  if(named)return named===normalize(candidate.colour);
  const raw=normalize(text(required.profile).split('@')[0]);
  const expected=normalize([candidate.brand,candidate.product,candidate.colour].join(' '));
  return raw===expected||raw===expected.replace(/^bambu lab /,'bambu ');
 }
 function matches(required,inventory){
  const available=inventory.filter(row=>Number.isFinite(row.spools)&&row.spools>0&&!/bundle|dual|gradient|rainbow|multi.colou?r/i.test(row.product+' '+row.colour)&&!/[\/＋]/.test(row.colour));
  const ranked=available.filter(row=>material(row.material)===required.material&&required.material!=='UNKNOWN').map(row=>{
   const rowFinish=row.finish||(finish(row.product)==='unknown'?finish(row.sourceProduct):finish(row.product)),sameFinish=required.finish!=='unknown'&&rowFinish===required.finish;
   const exact=sameFinish&&brand(required.brand)!==''&&brand(required.brand)===brand(row.brand)&&namedIdentity(required,row)&&product(required.profile,required.brand)===product(row.product+' '+(required.colourName?'':row.colour),row.brand);
   return {row,finish:rowFinish,sameFinish,exact,distance:distance(required.hex,row.hex)};
  }).sort((left,right)=>Number(right.exact)-Number(left.exact)||(left.distance??Infinity)-(right.distance??Infinity)||Number(brand(right.row.brand)===brand(required.brand))-Number(brand(left.row.brand)===brand(required.brand))||left.row.brand.localeCompare(right.row.brand)||left.row.colour.localeCompare(right.row.colour));
  const same=ranked.filter(candidate=>candidate.sameFinish);
  const alternatives=ranked.filter(candidate=>!candidate.sameFinish);
  const exact=same.filter(candidate=>candidate.exact);
  const close=same.filter(candidate=>candidate.distance!==null&&candidate.distance<=15);
  return {same,alternatives,exact,close,status:exact.length?'Exact in stock':close.length?'Close option in stock':same.length?'No close colour match':'No matching material / finish'};
 }
 return {readProject,parseSettings,finish,material,distance,deltaE2000,matches,validHex,MAX_FILE};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=FilamentMatcher;
