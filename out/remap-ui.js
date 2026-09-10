const FilamentRemapUi=(()=>{
 let busy=false,review=null,generation=0;
 const byId=id=>document.getElementById(id);
 function state(){
  const current=matchReport[activeMatchProject];
  if(!current)return null;
  const mappings=current.slots.filter(({required})=>required.included).map(({required,result})=>({slot:required.slot,required,candidate:selectedNfcCandidate(required,result)}));
  const signature=JSON.stringify({account:dataset.accountKey,project:activeMatchProject,slots:current.slots.map(({required,result})=>({slot:required.slot,included:required.included,finish:required.finish,candidate:selectedNfcCandidate(required,result)}))});
  return {project:current.project,mappings,signature};
 }
 function reset(){generation++;review=null;byId('remap-dialog').close();byId('remap-review').replaceChildren();byId('remap-status').textContent='';}
 function render(){
  const current=state(),chosen=current?.mappings.filter(mapping=>mapping.candidate).length||0;
  if(review&&(!current||review.project!==current.project||review.signature!==current.signature))reset();
  byId('remap-suggest').disabled=busy||!current;
  byId('remap-open').disabled=busy||!current?.project.sourceFile||!chosen||chosen!==current.mappings.length;
  byId('remap-count').textContent=!current?'Load a 3MF project to export replacements.':!current.project.sourceFile?'Reload the original 3MF to enable export.':chosen+' / '+current.mappings.length+' included slots chosen. Excluded slots stay unchanged.';
 }
 function suggest(){
  const current=state();if(!current||busy)return;
  for(const {required,candidate} of current.mappings){
   if(candidate)continue;
   const result=matchReport[activeMatchProject].slots.find(slot=>slot.required===required).result;
   const closest=result.same.find(option=>option.exact||(option.distance!==null&&option.distance<=15));
   if(closest)required.nfcChoice=closest.row.id;
  }
  renderMatcher();byId('remap-status').textContent='Suggested close same-finish stock only; existing choices kept. Review each colour. Any gaps need your choice.';
 }
 function open(){
  const current=state();if(busy||!current?.project.sourceFile||!current.mappings.length||current.mappings.some(mapping=>!mapping.candidate))return;
  review=current;byId('remap-review').replaceChildren();
  byId('remap-project').textContent=current.project.name;
  for(const {slot,required,candidate} of current.mappings){
   const item=document.createElement('li');
   item.textContent='Slot '+slot+': '+(required.colourName||required.hex||'Unknown colour')+' → '+[candidate.row.brand,candidate.row.product,candidate.row.colour,candidate.row.hex].join(' · ')+' — '+(candidate.sameFinish?'same finish':candidate.finish==='unknown'?'UNKNOWN FINISH — review slicer profile':'DIFFERENT FINISH — review slicer profile');
   byId('remap-review').append(item);
  }
  byId('remap-error').textContent='';byId('remap-download').disabled=false;byId('remap-dialog').showModal();
 }
 async function download(){
  if(busy||!review)return;
  const snapshot=review,current=state();
  if(!current||current.project!==snapshot.project||current.signature!==snapshot.signature){reset();return;}
  busy=true;const token=++generation;byId('remap-download').disabled=true;byId('remap-error').textContent='Preparing a new project…';render();
  try{
   const buffer=await snapshot.project.sourceFile.arrayBuffer();
   const result=await FilamentRemapper.exportProject(buffer,snapshot.mappings.map(({slot,candidate})=>({slot,row:candidate.row,finish:candidate.finish})));
   const latest=state();
   if(token!==generation||!latest||latest.project!==snapshot.project||latest.signature!==snapshot.signature)return;
   const url=URL.createObjectURL(result.blob),anchor=document.createElement('a');
   anchor.href=url;anchor.download=snapshot.project.name.replace(/\.3mf$/i,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,120)+'-my-filaments.3mf';
   document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
   byId('remap-dialog').close();review=null;
   byId('remap-status').textContent='New 3MF downloaded. Original model and painted regions kept; slot colours and labels replaced. Saved thumbnails and calibration are still from the source. Open as a project, review profiles and purge volumes, then re-slice.';
  }catch(error){if(token===generation)byId('remap-error').textContent=error.message||'Could not export this project.';}
  finally{busy=false;byId('remap-download').disabled=false;render();}
 }
 byId('remap-suggest').onclick=suggest;byId('remap-open').onclick=open;byId('remap-download').onclick=download;
 byId('remap-close').onclick=reset;byId('remap-dialog').addEventListener('cancel',reset);
 return {render,reset};
})();
