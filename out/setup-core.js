(function(root){
 'use strict';
 const steps=[
  {id:'library',title:'Add your first spools',intro:'Start here. Your library works without a printer, mailbox or NFC tag.',links:[['Add spools','/?setup=add'],['Import a list or image','/import.html']],help:'Enter a reel manually, import a CSV, or review text from an order email or photo. Check counts, matte versus standard, refill packaging and cost per roll. To enrich purchases you already own, choose Update existing costs only in Import instead of adding them again.',guide:'/guide.html#quick-add'},
  {id:'match',title:'Try matching a print',intro:'See which project colours you own before you buy anything.',links:[['Match a 3MF','/?setup=match']],help:'Load a Bambu Studio or OrcaSlicer project and review its colour slots. Choose stock you actually have. Similar colours are estimates, not proof of the exact filament. Enter sliced grams if you want a cost estimate.',guide:'/guide.html',confirmation:'I’ve tried matching a print'},
  {id:'phone',title:'Set up your phone',intro:'Use the same account on desktop and mobile—no repeated QR codes.',links:[['App & device','/app.html'],['Saved phone page','/nfc.html']],help:'Open spool-studio.uk on your phone and sign in with the same account. Use App & device or the browser’s install / Add to Home Screen option. Desktop selections appear on the saved programmer page after you sync them. The library also works on iPhone.',guide:'/guide.html#nfc',confirmation:'I’ve opened my library on my phone'},
  {id:'labels',title:'Number your reels and print labels',intro:'Give the spool and its box the same permanent identity.',links:[['Physical spools','/reels.html'],['Colour shelf & labels','/?setup=shelf']],help:'Assign permanent IDs, then print from Colour shelf. Choose your actual label size, such as 60 × 30 or 76 × 50 mm. Print one at 100% scale and test the QR before a batch. Shelf positions can change; SP numbers stay with the physical reel.',guide:'/guide.html#labels',confirmation:'I’ve printed and checked a label'},
  {id:'nfc',title:'Program NFC tags · Android',intro:'Optional for a compatible Snapmaker U1 setup—not needed to manage stock.',links:[['NFC setup guide','/guide.html#nfc'],['Open programmer','/nfc.html']],help:'Use Android Chrome with NFC enabled, compatible NTAG215/216 tags, and supported paxx12 extended firmware configured for your tag format. Read the guide first. This web app cannot write NFC on iPhone or iPad. Test one tag at the printer; a successful phone write alone is not a printer-read test.',guide:'/guide.html#nfc',confirmation:'I’ve written a tag and checked it on the printer'},
  {id:'tracking',title:'Connect Spoolman and test usage',intro:'An advanced, optional setup for remaining-filament estimates.',links:[['Spoolman connection','/reels.html#bridge-panel'],['Connection walkthrough','/guide.html#u1-spoollink']],help:'You need a local Spoolman instance, physical spool records, the correct reel assigned to each printer tool, and a working consumption integration. Link the IDs and run the local bridge. Confirm partly used reel weights—do not initialise them as full. Test a supervised print and check that the right reel’s weight falls. Sync to phone is separate; it does not track consumption.',guide:'/guide.html#spoolman-bridge',confirmation:'I’ve checked usage after a supervised print'}
 ];
 function preferences(value){
  const progress={};for(const step of steps.slice(1))if(['done','skipped'].includes(value?.steps?.[step.id]))progress[step.id]=value.steps[step.id];
  return {dismissed:value?.dismissed===true,steps:progress};
 }
 function status(library){
  const saved=preferences(library.setup);
  return steps.map(step=>({...step,state:step.id==='library'?(library.items?.length?'done':'pending'):saved.steps[step.id]||'pending'}));
 }
 function update(data,input){
  const current=preferences(data.setup);
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Choose a checklist action.');
  const keys=Object.keys(input);
  if(keys.length===1&&keys[0]==='dismissed'&&typeof input.dismissed==='boolean')current.dismissed=input.dismissed;
  else if(keys.length===2&&keys.includes('step')&&keys.includes('state')&&steps.slice(1).some(step=>step.id===input.step)&&['done','skipped','pending'].includes(input.state)){
   if(input.state==='pending')delete current.steps[input.step];else current.steps[input.step]=input.state;
  }else throw Error('Choose a supported checklist step and status.');
  data.setup=current;
 }
 const api={steps,preferences,status,update};if(typeof module==='object'&&module.exports)module.exports=api;else root.SpoolSetup=api;
})(typeof globalThis==='object'?globalThis:this);
