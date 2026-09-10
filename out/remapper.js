(function(root){
 'use strict';
 const MAX_FILE=100*1024*1024,MAX_METADATA=2*1024*1024;
 const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
 const crcTable=Array.from({length:256},(_,value)=>{let result=value;for(let bit=0;bit<8;bit++)result=result&1?0xedb88320^(result>>>1):result>>>1;return result>>>0});
 function crc32(bytes){let result=0xffffffff;for(const byte of bytes)result=crcTable[(result^byte)&255]^(result>>>8);return (result^0xffffffff)>>>0}
 function archive(buffer){
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<22||buffer.byteLength>MAX_FILE)throw Error('Choose a normal 3MF project under 100 MB.');
  const bytes=new Uint8Array(buffer),view=new DataView(buffer);
  const within=(offset,size)=>{if(offset<0||size<0||offset+size>bytes.length)throw Error('Truncated 3MF archive.');};
  let end=-1;
  for(let offset=bytes.length-22;offset>=Math.max(0,bytes.length-65557);offset--){if(view.getUint32(offset,true)===0x06054b50&&offset+22+view.getUint16(offset+20,true)===bytes.length){end=offset;break}}
  if(end<0)throw Error('Not a supported ZIP-based 3MF.');
  const count=view.getUint16(end+10,true),directory=view.getUint32(end+16,true),directorySize=view.getUint32(end+12,true);
  if(view.getUint16(end+4,true)||view.getUint16(end+6,true)||view.getUint16(end+8,true)!==count||count===65535||count>10000||directory===0xffffffff||directorySize>4*1024*1024||directory+directorySize!==end)throw Error('Split, signed or ZIP64 archives cannot be remapped. Re-save a normal project.');
  within(directory,directorySize);
  const entries=[],names=new Set();let offset=directory;
  for(let index=0;index<count;index++){
   within(offset,46);if(view.getUint32(offset,true)!==0x02014b50)throw Error('Invalid ZIP directory.');
   const nameSize=view.getUint16(offset+28,true),extraSize=view.getUint16(offset+30,true),commentSize=view.getUint16(offset+32,true),length=46+nameSize+extraSize+commentSize;
   within(offset,length);if(offset+length>directory+directorySize)throw Error('Invalid ZIP directory size.');
   const nameBytes=bytes.subarray(offset+46,offset+46+nameSize),name=decoder.decode(nameBytes),key=name.replace(/\\/g,'/').toLowerCase();
   if(!name||key.startsWith('/')||key.includes(':')||key.split('/').some(part=>part==='..'||part==='.')||name.includes('\0')||names.has(key))throw Error('Ambiguous or unsafe archive paths. Re-save the project.');
   names.add(key);
   const entry={name,key,nameBytes,flags:view.getUint16(offset+8,true),method:view.getUint16(offset+10,true),crc:view.getUint32(offset+16,true),packed:view.getUint32(offset+20,true),size:view.getUint32(offset+24,true),offset:view.getUint32(offset+42,true),central:bytes.subarray(offset,offset+length)};
   if((entry.flags&~0x080e)||entry.flags&1||![0,8].includes(entry.method)||view.getUint16(offset+34,true)||[entry.packed,entry.size,entry.offset].includes(0xffffffff))throw Error('Encrypted or unsupported ZIP entry. Re-save the project.');
   if(key.startsWith('_xmlsignatures/')||/\.(?:gcode|bgcode)(?:\.|$)/.test(key))throw Error('Export an unsliced project first. Signed or pre-sliced files cannot safely be remapped.');
   if(/^metadata\/filament.*\.(?:config|json)$/.test(key)&&key!=='metadata/filament_sequence.json')throw Error('Embedded filament presets are not supported by this exporter yet. Re-save as a project without embedded presets.');
   within(entry.offset,30);
   if(view.getUint32(entry.offset,true)!==0x04034b50||view.getUint16(entry.offset+6,true)!==entry.flags||view.getUint16(entry.offset+8,true)!==entry.method)throw Error('Inconsistent ZIP entry headers.');
   const localNameSize=view.getUint16(entry.offset+26,true),localExtra=view.getUint16(entry.offset+28,true),start=entry.offset+30+localNameSize+localExtra;
   within(start,entry.packed);
   if(start+entry.packed>directory||decoder.decode(bytes.subarray(entry.offset+30,entry.offset+30+localNameSize))!==name)throw Error('Invalid archive entry location or name.');
   entry.data=bytes.subarray(start,start+entry.packed);entry.end=start+entry.packed;
   if(entry.flags&8){
    within(entry.end,12);const signed=view.getUint32(entry.end,true)===0x08074b50,descriptor=entry.end+(signed?4:0);within(descriptor,12);
    if(view.getUint32(descriptor,true)!==entry.crc||view.getUint32(descriptor+4,true)!==entry.packed||view.getUint32(descriptor+8,true)!==entry.size)throw Error('Invalid ZIP data descriptor.');
    entry.end=descriptor+12;
   }else if(view.getUint32(entry.offset+14,true)!==entry.crc||view.getUint32(entry.offset+18,true)!==entry.packed||view.getUint32(entry.offset+22,true)!==entry.size)throw Error('Inconsistent ZIP entry sizes.');
   if(entry.end>directory)throw Error('Archive entry overlaps its directory.');
   entries.push(entry);offset+=length;
  }
  if(offset!==directory+directorySize)throw Error('Invalid directory length.');
  let previousEnd=0;
  for(const entry of [...entries].sort((left,right)=>left.offset-right.offset)){if(entry.offset<previousEnd)throw Error('Overlapping ZIP entries.');previousEnd=entry.end;}
  if(!names.has('3d/3dmodel.model')||!names.has('[content_types].xml')||!names.has('_rels/.rels'))throw Error('This is not a complete 3MF project.');
  const settings=entries.find(entry=>entry.key==='metadata/project_settings.config');
  if(!settings)throw Error('No Bambu/Orca project settings found. Geometry-only files cannot be remapped.');
  return {entries,settings,bytes};
 }
 async function unpack(entry){
  if(entry.size>MAX_METADATA||entry.packed>MAX_METADATA)throw Error('Project settings exceed the safe size limit.');
  let result=entry.data;
  if(entry.method===8){
   let stream;try{stream=new DecompressionStream('deflate-raw')}catch{throw Error('Use a current browser with compressed-project support.');}
   const reader=new Blob([entry.data]).stream().pipeThrough(stream).getReader(),chunks=[];let total=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>entry.size||total>MAX_METADATA){await reader.cancel();throw Error('Project settings exceed the safe size limit.');}chunks.push(value);}}finally{reader.releaseLock()}
   result=new Uint8Array(total);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}
  }
  if(result.length!==entry.size||crc32(result)!==entry.crc)throw Error('Project settings failed their integrity check.');
  return result;
 }
 const clean=value=>typeof value==='string'?value.trim().replace(/[\x00-\x1f\x7f]/g,' ').slice(0,120):'';
 function rewriteSettings(original,mappings){
  if(!original||typeof original!=='object'||Array.isArray(original))throw Error('Invalid project settings.');
  const settings=JSON.parse(JSON.stringify(original)),count=settings.filament_colour?.length;
  if(!Array.isArray(settings.filament_colour)||!count||count>64||!Array.isArray(settings.filament_type)||settings.filament_type.length!==count||!Array.isArray(settings.filament_settings_id)||settings.filament_settings_id.length!==count)throw Error('Unsupported or incomplete filament slot arrays. Re-save the project in its slicer.');
  if(!Array.isArray(mappings)||!mappings.length||mappings.length>count)throw Error('Choose at least one replacement.');
  const array=(key,size=count)=>{
   if(settings[key]===undefined)settings[key]=Array(size).fill('');
   if(!Array.isArray(settings[key])||settings[key].length!==size)throw Error('Unsupported '+key+' layout. Re-save this project.');
   return settings[key];
  };
  const used=new Set(),report=[];
  for(const mapping of mappings){
   const index=mapping.slot-1,row=mapping.row;
   if(!Number.isInteger(index)||index<0||index>=count||used.has(index)||!row)throw Error('Invalid or duplicate filament slot.');
   used.add(index);
   const material=clean(row.material).toUpperCase().replace(/\s+/g,''),sourceMaterial=clean(settings.filament_type[index]).toUpperCase().replace(/\s+/g,'');
   if(!material||material!==sourceMaterial)throw Error('Slot '+mapping.slot+': replacements must use the original material.');
   if(!Number.isFinite(row.spools)||row.spools<=0||row.used===true)throw Error('Slot '+mapping.slot+': the selected filament is no longer available.');
   if(!/^#[a-f\d]{6}$/i.test(row.hex||''))throw Error('Slot '+mapping.slot+': choose a filament with a valid colour hex.');
   if(settings.filament_is_mixed&&![false,0,'0',undefined].includes(settings.filament_is_mixed[index]))throw Error('Mixed-colour virtual filaments cannot be remapped.');
   const label=[clean(row.brand)||'Generic',clean(row.product)||material,clean(row.colour)||row.hex].join(' '),profile=label+' [library slot '+mapping.slot+' - review profile]';
   report.push({slot:mapping.slot,originalColour:settings.filament_colour[index],originalProfile:settings.filament_settings_id[index],colour:row.hex.toUpperCase(),brand:clean(row.brand),product:clean(row.product),shade:clean(row.colour),material,finish:clean(mapping.finish||row.finish)||'unknown',profile});
   settings.filament_colour[index]=row.hex.toUpperCase();settings.filament_settings_id[index]=profile;
   array('filament_vendor')[index]=clean(row.brand)||'Generic';array('filament_colour_name')[index]=clean(row.colour);array('filament_ids')[index]='';
   array('inherits_group',count+2)[index+1]='';
   const differences=array('different_settings_to_system',count+2);
   differences[index+1]=[differences[index+1], 'filament_vendor;filament_settings_id'].filter(Boolean).join(';');
   if(settings.filament_multi_colour)array('filament_multi_colour')[index]=row.hex.toUpperCase();
   if(settings.filament_colour_type)array('filament_colour_type')[index]='1';
  }
  return {settings,report};
 }
 function pack(source,replacement){
  const parts=[],central=[];let cursor=0;
  for(const entry of source.entries){
   const record=new Uint8Array(entry.central),recordView=new DataView(record.buffer);recordView.setUint32(42,cursor,true);
   if(entry===source.settings){
    const header=new Uint8Array(30+entry.nameBytes.length),view=new DataView(header.buffer),crc=crc32(replacement);
    view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint16(6,0x800,true);view.setUint32(14,crc,true);view.setUint32(18,replacement.length,true);view.setUint32(22,replacement.length,true);view.setUint16(26,entry.nameBytes.length,true);header.set(entry.nameBytes,30);
    recordView.setUint16(6,20,true);recordView.setUint16(8,0x800,true);recordView.setUint16(10,0,true);recordView.setUint32(16,crc,true);recordView.setUint32(20,replacement.length,true);recordView.setUint32(24,replacement.length,true);
    parts.push(header,replacement);cursor+=header.length+replacement.length;
   }else{const raw=source.bytes.subarray(entry.offset,entry.end);parts.push(raw);cursor+=raw.length;}
   central.push(record);
  }
  const size=central.reduce((total,record)=>total+record.length,0),end=new Uint8Array(22),view=new DataView(end.buffer);
  view.setUint32(0,0x06054b50,true);view.setUint16(8,central.length,true);view.setUint16(10,central.length,true);view.setUint32(12,size,true);view.setUint32(16,cursor,true);
  if(cursor+size+22>MAX_FILE)throw Error('Remapped project exceeds 100 MB.');
  return new Blob([...parts,...central,end],{type:'model/3mf'});
 }
 async function exportProject(buffer,mappings){
  const source=archive(buffer);let original;
  try{original=JSON.parse(decoder.decode(await unpack(source.settings)).replace(/^\uFEFF/,''));}catch(error){throw Error('Cannot read project settings: '+error.message);}
  const {settings,report}=rewriteSettings(original,mappings),replacement=encoder.encode(JSON.stringify(settings,null,2));
  if(replacement.length>MAX_METADATA)throw Error('Remapped settings exceed the safe size limit.');
  return {blob:pack(source,replacement),report};
 }
 const api={archive,unpack,rewriteSettings,exportProject};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FilamentRemapper=api;
})(typeof globalThis!=='undefined'?globalThis:this);
