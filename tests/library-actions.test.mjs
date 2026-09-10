import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

test('header keeps one primary action and groups export and account links in a disclosure',()=>{
 const html=readFileSync(new URL('../out/index.html',import.meta.url),'utf8');
 const header=html.match(/<header class="topbar">[\s\S]*?<\/header>/)[0];
 assert.equal((header.match(/class="primary"/g)||[]).length,1);
 assert.match(header,/class="import-action"/);
 const disclosure=header.split('<details id="library-more"')[1];
 for(const id of ['export','account-label','account-link'])assert(disclosure.includes('id="'+id+'"'));
 const listeners={},events={};let focused=0;
 const trigger={focus(){focused++}},panel={open:true,querySelector(){return trigger},contains(target){return target.inside===true},addEventListener(name,handler){events[name]=handler}};
 vm.runInNewContext(readFileSync(new URL('../out/library-actions.js',import.meta.url),'utf8'),{document:{getElementById(){return panel},addEventListener(name,handler){listeners[name]=handler}}});
 listeners.click({target:{inside:false}});assert.equal(panel.open,false);
 panel.open=true;let prevented=false;listeners.keydown({key:'Escape',preventDefault(){prevented=true}});assert.equal(panel.open,false);assert.equal(focused,1);assert(prevented);
 panel.open=true;listeners.click({target:{inside:true,closest(){return true}}});assert.equal(panel.open,false);assert.equal(focused,2);
 panel.open=true;events.focusout({relatedTarget:{inside:false}});assert.equal(panel.open,false);
});
