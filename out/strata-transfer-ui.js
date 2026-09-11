'use strict';
{
 const parameters=new URLSearchParams(location.hash.slice(1));
 if(parameters.has('strata-transfer')){
  const panel=document.createElement('section');panel.className='strata-transfer';panel.setAttribute('aria-label','Strata transfer');
  const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel transfer';
  panel.append(status,cancel);document.getElementById('match-status').before(panel);
  let receiver;
  function clearFragment(){
   const url=new URL(location.href),fragment=new URLSearchParams(url.hash.slice(1));
   fragment.delete('strata-transfer');fragment.delete('sender');url.hash=fragment.toString();
   history.replaceState(history.state,'',url);
  }
  async function importFile({name,buffer},isCurrent){
   if(matchLoading||libraryBusy||(matchProjects||[]).length>=8)throw Error('The matcher is busy or full.');
   matchLoading=true;document.getElementById('match-files').disabled=true;
   let prepared=null,attached=false;
   try{
    const sourceFile=new File([buffer],name,{type:'model/3mf'});
    const project=await FilamentMatcher.readProject(buffer,name);
    if(!isCurrent())return;
    if((matchProjects||[]).length>=8)throw Error('Too many projects.');
    prepared=prepareMatchProject(project);prepared.sourceFile=sourceFile;
    matchProjects=matchProjects||[];matchProjects.push(prepared);attached=true;
    activeMatchProject=matchProjects.length-1;activeMatchPlate=0;matchSyncEnabled=false;
    setMode('match');
   }finally{
    if(prepared&&!attached)releaseMatchPreviews([prepared]);
    matchLoading=false;libraryControls();
   }
  }
  receiver=StrataTransfer.receive({
   host:window,
   context:()=>({ready:dataset.status==='complete'&&!libraryBusy&&!matchLoading,accountKey:dataset.accountKey||''}),
   importFile,
   update:(phase,message)=>{status.textContent=message;cancel.hidden=!['waiting','ready','receiving'].includes(phase)},
   clearFragment,
  });
  cancel.onclick=()=>receiver?.cancel();
  window.StrataTransferUi={resume:()=>receiver?.resume()};
  setMode('match');
 }
}
