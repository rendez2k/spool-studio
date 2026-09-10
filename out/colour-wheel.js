'use strict';
{
 let playing=!matchMedia('(prefers-reduced-motion: reduce)').matches;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 function renderColourWheel(rows){
  const result=$('results');result.className='colour-wheel-view';
  const model=SpoolColourWheel.build(rows.map(row=>typeof FilamentColours==='undefined'?row:FilamentColours.resolve(row)));
  const count=model.groups.length;
  displayed=model.groups.map(group=>({...group,spools:group.rolls}));
  $('view-title').textContent='Your colour wheel';$('count').textContent=count+' plotted '+(count===1?'shade':'shades');
  $('group-note').textContent='Your available stock, in colour. Ordered by hue; slice size shows roll count within each ring. Whites, greys and blacks stay on the inner ring. Filters above apply.';
  $('paging').classList.add('hidden');$('insights').classList.add('hidden');
  result.innerHTML='<div class="wheel-layout"><div><div class="wheel-art"><svg viewBox="0 0 500 500" aria-label="Filament colour wheel. Use arrow keys to explore slices, or choose a shade from the list." role="group"><circle class="wheel-guide" cx="250" cy="250" r="231"/><circle class="wheel-guide" cx="250" cy="250" r="148"/><circle class="wheel-guide" cx="250" cy="250" r="109"/><g class="wheel-rotor"></g></svg><div class="wheel-centre"><strong>'+model.total+'</strong><span>rolls plotted</span></div></div><div class="wheel-key"><span>Outer ring · '+model.coloured+' colour rolls</span><span>Inner ring · '+model.neutral+' neutral rolls</span></div></div><div class="wheel-detail"><label for="wheel-shade">Explore a shade</label><select id="wheel-shade"><option value="">All colours</option></select><div id="wheel-inspect" aria-live="polite"></div><div class="wheel-actions"><button id="wheel-motion" type="button"></button><button id="wheel-reset" type="button">Show all colours</button></div><p class="wheel-help">Tap a slice to hold it still. Hover pauses the wheel. Swatches use your library’s colour data—not measured filament or calibrated screen colours.</p></div></div>';
  const art=result.querySelector('.wheel-art'),rotor=result.querySelector('.wheel-rotor'),select=$('wheel-shade'),inspect=$('wheel-inspect'),motion=$('wheel-motion');
  const paths=[];
  function syncMotion(){motion.disabled=reduced.matches||!count;motion.textContent=reduced.matches?'Reduced motion enabled':playing?'Pause animation':'Play animation';motion.setAttribute('aria-pressed',String(playing&&!reduced.matches));art.classList.toggle('is-running',playing&&!reduced.matches&&count>0)}
  function choose(index,focus=false){
   const group=model.groups[index];
   if(group){playing=false;select.value=String(index)}else select.value='';
   art.classList.toggle('has-selection',Boolean(group));
   paths.forEach((path,position)=>{path.setAttribute('aria-pressed',String(position===index));path.setAttribute('tabindex',position===(group?index:0)?'0':'-1')});
   inspect.replaceChildren();
   if(group){
    const preview=document.createElement('div');preview.className='wheel-preview';preview.style.setProperty('--swatch',group.hex);preview.setAttribute('aria-hidden','true');
    const heading=document.createElement('h3');heading.textContent=group.colour;
    const description=document.createElement('p');description.textContent=group.brand+' · '+group.product;
    const details=document.createElement('dl');
    for(const [name,value] of [['Available rolls',group.rolls],['Material / finish',group.material+' · '+group.finish],['Colour value',group.hex],['Source',group.source]]){const term=document.createElement('dt'),definition=document.createElement('dd');term.textContent=name;definition.textContent=value;details.append(term,definition)}
    const open=document.createElement('button');open.type='button';open.textContent='View matching stock';open.onclick=()=>{$('brand').value=group.members[0].brand||'';$('material').value=group.members[0].material||'';$('colour').value=group.members[0].colour||'';$('search').value=group.members[0].product||'';setMode('cards');$('results').scrollIntoView({block:'start'})};
    inspect.append(preview,heading,description,details,open);
   }else{
    const heading=document.createElement('h3');heading.textContent=count?'A palette you already own':'No single-colour rolls to plot';
    const description=document.createElement('p');description.textContent=count?'Explore '+count+' shades across your available rolls and refills. Choose a slice or use the shade list to see its filament and colour source.':'Try clearing filters, or add a roll with a known quantity and colour. Uncounted and multicolour entries are listed separately.';inspect.append(heading,description);
   }
   $('wheel-reset').disabled=!group;syncMotion();if(focus&&group)paths[index].focus();
  }
  model.groups.forEach((group,index)=>{
   const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',SpoolColourWheel.arc(group.start,group.end,group.neutral?113:155,group.neutral?143:227));path.setAttribute('fill',group.hex);path.setAttribute('class','wheel-slice');path.setAttribute('role','button');path.setAttribute('aria-label',group.colour+' · '+group.brand+' · '+group.product+' · '+group.rolls+' rolls');
   path.onclick=()=>choose(index);
   path.onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();choose(index)}else if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();choose(event.key==='Home'?0:event.key==='End'?count-1:(index+(['ArrowRight','ArrowDown'].includes(event.key)?1:count-1))%count,true)}};
   const title=document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent=group.colour+' · '+group.rolls+' rolls';path.append(title);rotor.append(path);paths.push(path);
   const option=document.createElement('option');option.value=String(index);option.textContent=group.colour+' · '+group.brand+' · '+group.product+' · '+group.rolls+' rolls';select.append(option);
  });
  select.disabled=!count;select.onchange=()=>choose(select.value===''?-1:Number(select.value));
  motion.onclick=()=>{playing=!playing;syncMotion()};$('wheel-reset').onclick=()=>choose(-1);
  if(model.excluded.length){
   const details=document.createElement('details');details.className='wheel-excluded';const summary=document.createElement('summary');summary.textContent=model.excluded.length+' '+(model.excluded.length===1?'entry':'entries')+' kept off the wheel';const list=document.createElement('ul');
   for(const {row,reason} of model.excluded){const item=document.createElement('li');item.textContent=(row.colour||'Unknown colour')+' · '+(row.brand||'Unknown brand')+' · '+reason+(Number.isInteger(row.spools)?' · '+row.spools+' rolls':'');list.append(item)}
   details.append(summary,list);result.append(details);
  }
  choose(-1);
 }
 window.renderColourWheel=renderColourWheel;
 reduced.addEventListener('change',()=>{if(reduced.matches)playing=false;if(mode==='wheel')render()});
}
