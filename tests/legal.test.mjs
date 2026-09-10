import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../dist/server/index.js';

test('privacy and contact are readable without signing in and use local assets',async()=>{
 for(const page of ['privacy.html','contact.html']){
  const response=await worker.fetch(new Request('https://test.example/'+page),{});
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type'),/text\/html/);
  const html=await response.text();
  assert.match(html,/mailto:hello@productkit\.digital/);
  assert.match(html,/href="https:\/\/productkit\.digital"/);
  assert.match(html,/<main id="main">/);
  assert.doesNotMatch(html,/<script|<iframe|<form|\b(?:src|href)="javascript:/i);
  for(const [,asset] of html.matchAll(/(?:src|href)="(\/(?:legal\.css|icons\/[^"\s]+))"/g)){
   assert.equal((await worker.fetch(new Request('https://test.example'+asset),{})).status,200);
  }
  const head=await worker.fetch(new Request('https://test.example/'+page,{method:'HEAD'}),{});
  assert.equal(head.status,200);assert.equal(await head.text(),'');
 }
});

test('every app entrypoint exposes privacy and contact without weakening private APIs',async()=>{
 for(const page of ['index.html','nfc.html','import.html']){
  const html=readFileSync(new URL('../out/'+page,import.meta.url),'utf8');
  assert.match(html,/href="\/privacy\.html"/);assert.match(html,/href="\/contact\.html"/);
 }
 for(const path of ['/api/library','/api/phone-batch']){
  assert.equal((await worker.fetch(new Request('https://test.example'+path),{})).status,401);
 }
 const notice=await (await worker.fetch(new Request('https://test.example/privacy.html'),{})).text();
 assert.match(notice,/SHA-256/);assert.match(notice,/project name/);
 assert.match(notice,/no automatic expiry or self-service account deletion/);
 assert.match(notice,/does not delete your server-side library/);
 assert.match(notice,/legitimate interests/);assert.match(notice,/ico.org.uk\/make-a-complaint/);
});
