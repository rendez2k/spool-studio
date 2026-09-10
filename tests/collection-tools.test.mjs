import test from 'node:test';
import assert from 'node:assert/strict';
import core from '../out/collection-core.js';
import labels from '../out/labels-core.js';
import {handleLibrary} from '../server/library.mjs';
import {localDatabase} from '../scripts/local-db.mjs';

const spool={brand:'Example',product:'PLA',material:'PLA',finish:'standard',colour:'White',hex:'#FFFFFF',spools:2,weightGrams:1000,packaging:'spooled',date:'2026-09-01',notes:''};
test('date sorts use group extrema, stable ties and keep unknown historical imports last',()=>{
 const rows=[{id:'unknown',date:'2026-01-01'},{id:'group',members:[{id:'a',date:'2026-01-01',addedAt:'2026-09-09T12:00:00Z'},{id:'b',date:'2026-09-09',addedAt:'2026-09-10T12:00:00Z'}]},{id:'middle',date:'2026-05-01',addedAt:'2026-09-09T16:00:00Z'}];
 assert.deepEqual(core.sort(rows,'purchased-desc').map(row=>row.id),['group','middle','unknown']);
 assert.equal(core.sort(rows,'purchased-asc')[0].id,'group');
 assert.deepEqual(core.sort(rows,'added-asc').map(row=>row.id),['group','middle','unknown']);
 assert.deepEqual(core.sort(rows,'added-desc').map(row=>row.id),['group','middle','unknown']);
 assert.equal(core.sort(rows,'default'),rows);
 assert.equal(core.timestamp(rows[0],'added-desc'),null);
 assert.deepEqual([...core.reconcile(new Set(['a','b','absent']),[rows[1]])],['a','b']);
});

test('bulk changes are atomic, account scoped, revision guarded and preserve physical reels and import dates',async()=>{
 const DB=localDatabase();
 const act=async(body,user='alice')=>handleLibrary(new Request('https://test.example/api/library',{method:body?'POST':'GET',headers:{'oai-authenticated-user-id':user,origin:'https://test.example','content-type':'application/json'},body:body?JSON.stringify(body):undefined}),{DB});
 const command=(state,kind,extra={})=>({kind,expectedAccountKey:'alice',baseRevision:state.revision,requestId:crypto.randomUUID(),...extra});
 try{
  let state=await(await act(command({revision:1},'add',{spool}))).json();
  assert(Number.isFinite(Date.parse(state.items[0].addedAt)));
  state=await(await act(command(state,'import',{spools:[spool],reviewed:true,sourceHash:'a'.repeat(64)}))).json();
  assert(Number.isFinite(Date.parse(state.items[1].addedAt)));
  state=await(await act(command(state,'initialise-reels'))).json();
  const original=structuredClone(state),ids=state.items.map(row=>row.id);
  for(const extra of [{ids:[ids[0],'missing']},{patch:{date:'2026-02-30'}},{patch:{spools:1}},{ids:[ids[0],ids[0]]},{expectedAccountKey:'bob'},{reviewed:false}]){
   const response=await act(command(state,'bulk-edit',{ids,patch:{packaging:'refill'},reviewed:true,...extra}));
   assert([400,409].includes(response.status));
   assert.deepEqual((await(await act()).json()).items,original.items);
  }
  assert.equal((await act(command(state,'bulk-edit',{ids,patch:{notes:'private'},reviewed:true,expectedAccountKey:'bob'}),'bob')).status,409);
  const body=command(state,'bulk-edit',{ids,patch:{packaging:'refill',date:'2026-08-01',brand:'Updated'},reviewed:true});
  state=await(await act(body)).json();
  assert(state.items.every(row=>row.packaging==='refill'&&row.date==='2026-08-01'&&row.brand==='Updated'));
  assert.deepEqual(state.reels,original.reels);
  assert.deepEqual(state.items.map(row=>[row.id,row.spools,row.addedAt,row.used]),original.items.map(row=>[row.id,row.spools,row.addedAt,row.used]));
  assert.equal((await(await act(body)).json()).revision,state.revision);
  assert.equal((await act({...body,requestId:crypto.randomUUID()})).status,409);
 }finally{DB.close()}
});

test('selected label subsets retain shelf positions and permanent QR IDs, with two matching copies',()=>{
 const slots=[{position:4,shelf:1,shelfSlot:4,reelId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',reelNumber:9,colour:'White'}, {position:19,shelf:3,shelfSlot:3,reelId:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',reelNumber:12,colour:'Blue'}];
 const planned=labels.plan({accountKey:'alice',slots},{start:1,end:2,copies:2});
 assert.deepEqual(planned.map(row=>row.position),[4,4,19,19]);
 assert.deepEqual(planned.map(row=>row.reelId),[slots[0].reelId,slots[0].reelId,slots[1].reelId,slots[1].reelId]);
});
