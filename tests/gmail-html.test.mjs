import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {text} from '../browser/gmail-html.mjs';
const gmail=createRequire(import.meta.url)('../out/gmail-core.js');
const part=(mimeType,value,extra={})=>({mimeType,body:{data:Buffer.from(value).toString('base64url')},...extra});

test('HTML-only order text retains rows and entities without scripts, images, URLs or hidden content',()=>{
 const html='<html><head><style>body{color:red}</style></head><body><script>throw Error("executed")</script><img src="https://tracker.invalid/pixel"><iframe src="https://tracker.invalid"></iframe><div hidden>hidden price</div><div style="display: none">preview</div><h2>Bambu Lab PLA Basic</h2><table><tr><td>Jade White &amp; Black</td><td>Quantity: 2</td></tr><tr><td>Cost per roll: GBP&nbsp;12.99</td></tr></table><a href="https://tracker.invalid/click">Order confirmed</a></body></html>';
 const result=gmail.text(part('text/html',html),text);
 assert.match(result,/Bambu Lab PLA Basic\n/);assert.match(result,/Jade White & Black Quantity: 2/);assert.match(result,/Cost per roll: GBP 12.99/);assert.match(result,/Order confirmed/);assert(!/tracker|executed|hidden price|preview|color:red/.test(result));
});
test('multipart alternatives use plain text once and HTML attachments never become order text',()=>{
 let converted=0;
 assert.equal(gmail.text({parts:[part('text/plain','SUNLU PLA'),part('text/html','<p>SUNLU PLA</p>')]},()=>{converted++;return 'duplicate'}),'SUNLU PLA');assert.equal(converted,0);
 assert.equal(gmail.text({parts:[part('text/plain','   '),part('text/html','<p>Actual order</p>'),part('text/html','<p>Attachment</p>',{filename:'invoice.html'})]},text),'Actual order');
 assert.throws(()=>gmail.text(part('text/html','<img src="https://tracker.invalid">'),text),/No readable/);
});
test('HTML extraction bounds size, depth and final text even for malformed markup',()=>{
 assert.throws(()=>text('x'.repeat(150001)),/too large/);assert.throws(()=>text('x'.repeat(60001)),/60000/);
 assert.throws(()=>text('<div>'.repeat(82)+'item'+'</div>'.repeat(82)),/structure/);
 assert.equal(text('<p>Orange <b>PLA</p><p>Quantity: 1'),'Orange PLA\n\nQuantity: 1');
 assert.throws(()=>gmail.text(part('text/html','<p>'+'x'.repeat(60001)+'</p>'),text),/60000/);
});
