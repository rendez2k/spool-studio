import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {deflateRawSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import worker from '../dist/server/index.js';
const require=createRequire(import.meta.url),remap=require('../out/remapper.js'),matcher=require('../out/matcher.js');
const encoder=new TextEncoder();
const crc32=bytes=>{let result=0xffffffff;for(const byte of bytes){result^=byte;for(let bit=0;bit<8;bit++)result=result&1?0xedb88320^(result>>>1):result>>>1;}return (result^0xffffffff)>>>0;};
const settings={filament_colour:['#FFFFFF','#FF0000'],filament_type:['PLA','PLA'],filament_settings_id:['Source PLA Basic','Source PLA Matte'],filament_vendor:['Source','Source'],filament_ids:['ID1','ID2'],inherits_group:['Process','Parent1','Parent2','Printer'],different_settings_to_system:['process','flow_ratio','','printer'],nozzle_temperature:['210','215'],filament_flow_ratio:['0.97','0.98'],filament_multi_colour:['#FFFFFF','#FF0000'],filament_colour_type:['1','1'],flush_volumes_matrix:['0','200','300','0'],printer_settings_id:'Original printer'};
const row={brand:'Example',product:'PLA Matte',material:'PLA',finish:'matte',colour:'Orange',hex:'#E07020',spools:2};
function zip(extra=[],options={}){
 const files=[['[Content_Types].xml','<Types/>'],['_rels/.rels','<Relationships/>'],['3D/3dmodel.model','<model><triangle paint_color="3" p1="2"/></model>'],['Metadata/model_settings.config','<config><metadata key="extruder" value="2"/></config>'],['Metadata/project_settings.config',JSON.stringify(settings)],['Metadata/plate_1.png','original preview'],...extra];
 const parts=[],directory=[];let offset=0;
 for(const [name,text] of files){
  const nameBytes=encoder.encode(name),raw=encoder.encode(text),data=options.deflate?deflateRawSync(raw):raw,method=options.deflate?8:0,flags=0x800|(options.descriptor?8:0),crc=crc32(raw);
  const header=new Uint8Array(30+nameBytes.length),view=new DataView(header.buffer);
  view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint16(6,flags,true);view.setUint16(8,method,true);view.setUint16(26,nameBytes.length,true);header.set(nameBytes,30);
  if(!options.descriptor){view.setUint32(14,crc,true);view.setUint32(18,data.length,true);view.setUint32(22,raw.length,true);}
  const record=new Uint8Array(46+nameBytes.length),central=new DataView(record.buffer);
  central.setUint32(0,0x02014b50,true);central.setUint16(6,20,true);central.setUint16(8,flags,true);central.setUint16(10,method,true);central.setUint32(16,crc,true);central.setUint32(20,data.length,true);central.setUint32(24,raw.length,true);central.setUint16(28,nameBytes.length,true);central.setUint32(42,offset,true);record.set(nameBytes,46);
  parts.push(header,data);offset+=header.length+data.length;
  if(options.descriptor){const descriptor=new Uint8Array(16),fields=new DataView(descriptor.buffer);fields.setUint32(0,0x08074b50,true);fields.setUint32(4,crc,true);fields.setUint32(8,data.length,true);fields.setUint32(12,raw.length,true);parts.push(descriptor);offset+=16;}
  directory.push(record);
 }
 const end=new Uint8Array(22),view=new DataView(end.buffer);view.setUint32(0,0x06054b50,true);view.setUint16(8,files.length,true);view.setUint16(10,files.length,true);view.setUint32(12,directory.reduce((total,entry)=>total+entry.length,0),true);view.setUint32(16,offset,true);
 return new Blob([...parts,...directory,end]).arrayBuffer();
}

test('remap preserves slot indices, paint, geometry and every non-settings compressed entry',async()=>{
 for(const options of [{},{deflate:true},{deflate:true,descriptor:true}]){
  const buffer=await zip([],options),original=Buffer.from(buffer).toString('base64'),source=remap.archive(buffer);
  const result=await remap.exportProject(buffer,[{slot:2,row}]);
  const exported=await result.blob.arrayBuffer(),output=remap.archive(exported);
  assert.equal(Buffer.from(buffer).toString('base64'),original);
  assert.equal(output.entries.length,source.entries.length);
  for(const entry of source.entries.filter(entry=>entry!==source.settings)){
   const changed=output.entries.find(candidate=>candidate.name===entry.name);
   assert.deepEqual(output.bytes.slice(changed.offset,changed.end),source.bytes.slice(entry.offset,entry.end));
  }
  const parsed=JSON.parse(new TextDecoder().decode(await remap.unpack(output.settings)));
  assert.deepEqual(parsed.filament_colour,['#FFFFFF','#E07020']);assert.equal(parsed.filament_settings_id[0],settings.filament_settings_id[0]);
  assert.match(parsed.filament_settings_id[1],/Example PLA Matte Orange.*review profile/);
  assert.deepEqual(parsed.inherits_group,['Process','Parent1','','Printer']);
  assert.deepEqual(parsed.filament_ids,['ID1','']);assert.equal(parsed.filament_vendor[1],'Example');
  for(const key of ['nozzle_temperature','filament_flow_ratio','flush_volumes_matrix','printer_settings_id'])assert.deepEqual(parsed[key],settings[key]);
  const loaded=await matcher.readProject(exported,'new.3mf');assert.equal(loaded.slots.length,2);assert.equal(loaded.slots[1].hex,'#E07020');assert.equal(loaded.slots[1].finish,'matte');
 }
 const repeated=remap.rewriteSettings(settings,[{slot:1,row},{slot:2,row}]);assert.equal(repeated.settings.filament_colour.length,2);assert.notEqual(repeated.settings.filament_settings_id[0],repeated.settings.filament_settings_id[1]);
});

test('remap rejects unsupported, sliced, corrupt and conflicting projects without a download',async()=>{
 for(const name of ['Metadata/plate_1.gcode','Metadata/plate_1.gcode.md5','Metadata/plate_1.bgcode','Metadata/filament_settings_1.config','_xmlsignatures/signature.xml','../bad','Metadata/PROJECT_SETTINGS.config']){
  const input=await zip([[name,'{}']]);await assert.rejects(()=>remap.exportProject(input,[{slot:1,row}]));
 }
 const input=await zip(),source=remap.archive(input),mutated=input.slice(0);new Uint8Array(mutated)[source.settings.offset+30+source.settings.nameBytes.length]^=1;
 await assert.rejects(()=>remap.exportProject(mutated,[{slot:1,row}]),/integrity/);
 for(const mapping of [{slot:0,row},{slot:3,row},{slot:1,row:{...row,material:'PETG'}},{slot:1,row:{...row,spools:0}},{slot:1,row:{...row,hex:'invalid'}},{slot:1,row:{...row,used:true}}])assert.throws(()=>remap.rewriteSettings(settings,[mapping]));
 assert.throws(()=>remap.rewriteSettings(settings,[{slot:1,row},{slot:1,row}]));
 assert.throws(()=>remap.rewriteSettings({...settings,filament_is_mixed:[true,false]},[{slot:1,row}]),/Mixed/);
 assert.throws(()=>remap.rewriteSettings({...settings,filament_type:['PLA']},[{slot:1,row}]),/arrays/);
});

test('remap assets are served and the dashboard keeps review and profile limitations visible',async()=>{
 for(const path of ['/remapper.js','/remap-ui.js','/remap.css'])assert.equal((await worker.fetch(new Request('https://test.example'+path),{})).status,200);
 const html=readFileSync(new URL('../out/index.html',import.meta.url),'utf8');
 assert.match(html,/project.sourceFile=file/);assert.match(html,/FilamentRemapUi.render/);assert.match(html,/Download project for slicer review/);assert.match(html,/original.*temperatures/i);
});
