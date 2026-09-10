import test from 'node:test';
import assert from 'node:assert/strict';
import {productUrl,publicAddress,extractProduct,lookupProduct,handleProductLookup} from '../server/product-lookup.mjs';

const address='https://uk.store.bambulab.com/products/pla-matte';
const page=Buffer.from('<html><script type="application/ld+json">{"@type":"Product","name":"PLA Matte 1kg","brand":{"name":"Bambu Lab"}}</script></html>');
test('product URL allowlist strips tracking and rejects unapproved destinations',()=>{
 assert.equal(productUrl(address+'?variant=123&token=secret#red').href,address+'?variant=123');
 assert.equal(productUrl('https://amazon.co.uk/title/dp/B0BX382KZZ?ref=tracking').href,'https://www.amazon.co.uk/dp/B0BX382KZZ');
 for(const url of ['http://uk.store.bambulab.com/products/x','https://uk.store.bambulab.com:444/products/x','https://me:secret@uk.store.bambulab.com/products/x','https://uk.store.bambulab.com.evil.test/products/x','https://127.0.0.1/products/x','https://www.sunlu.com/cart','https://www.amazon.co.uk/s?k=filament','https://link.amazon/short','https://www.sunlu.com/products/../admin'])assert.throws(()=>productUrl(url));
 for(const ip of ['127.0.0.1','10.0.0.1','192.168.1.26','169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1','invalid'])assert.equal(publicAddress(ip),false,ip);
 for(const ip of ['8.8.8.8','2606:4700:4700::1111'])assert.equal(publicAddress(ip),true);
});

test('product parsing handles structured data, rejects variants and treats page text as data',()=>{
 const result=extractProduct(page,new URL(address));assert.equal(result.brand,'Bambu Lab');assert.equal(result.title,'PLA Matte 1kg');assert.match(result.warning,/verify/);
 assert.equal(extractProduct(Buffer.from('<meta property="og:title" content="SUNLU TPU 95A 1KG">'),new URL('https://www.sunlu.com/products/267')).brand,'SUNLU');
 const escaped=extractProduct(Buffer.from('<meta property="og:title" content="PLA &lt;img src=x onerror=alert(1)&gt;">'),new URL(address));assert.match(escaped.title,/<img/);
 for(const html of ['<meta property="og:title" content="Robot check">','<meta property="og:title" content="Keyboard">','<script type="application/ld+json">[{"@type":"Product","name":"PLA white"},{"@type":"Product","name":"PLA red"}]</script>'])assert.throws(()=>extractProduct(Buffer.from(html),new URL(address)));
 assert.throws(()=>extractProduct(Buffer.alloc(2_000_001),new URL(address)),/too large/);
});

test('redirects are revalidated and bounded before the next fetch',async()=>{
 let calls=0;
 await assert.rejects(lookupProduct(address,async()=>{calls++;return {redirect:'https://127.0.0.1/private'}}));assert.equal(calls,1);
 calls=0;await assert.rejects(lookupProduct(address,async()=>{calls++;return {redirect:address}}),/Too many redirects/);assert.equal(calls,3);
 calls=0;const result=await lookupProduct(address,async(url,signal)=>{assert(signal instanceof AbortSignal);calls++;return calls===1?{redirect:address+'?variant=2'}:{body:page}});assert.equal(result.url,address+'?variant=2');
});

test('lookup API requires identity, same origin, bounded JSON and per-user quota',async()=>{
 const user='lookup-'+crypto.randomUUID(),origin='https://test.example';
 const req=(headers={},body={url:address})=>new Request(origin+'/api/product-lookup',{method:'POST',headers:{'oai-authenticated-user-id':user,origin,'content-type':'application/json',...headers},body:JSON.stringify(body)});
 let calls=0;const perform=async()=>{calls++;return extractProduct(page,new URL(address))};
 assert.equal((await handleProductLookup(new Request(origin+'/api/product-lookup'),perform)).status,401);
 assert.equal((await handleProductLookup(req({origin:'https://evil.test'}),perform)).status,403);
 assert.equal((await handleProductLookup(req({'sec-fetch-site':'cross-site'}),perform)).status,403);
 assert.equal((await handleProductLookup(req({'content-type':'text/plain'}),perform)).status,415);
 assert.equal((await handleProductLookup(req({}, {url:'x'.repeat(6000)}),perform)).status,400);assert.equal(calls,0);
 for(let count=0;count<10;count++){const response=await handleProductLookup(req(),perform);assert.equal(response.status,200);assert.equal((await response.json()).accountKey,user);assert.equal(response.headers.get('cache-control'),'private, no-store')}
 assert.equal((await handleProductLookup(req(),perform)).status,429);assert.equal(calls,10);
 assert.equal((await handleProductLookup(req({'oai-authenticated-user-id':'another-'+user}),perform)).status,200);
});
