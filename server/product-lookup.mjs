import { request as httpsRequest } from 'node:https';
import { lookup } from 'node:dns';
import ipaddr from 'ipaddr.js';
import { loadBuffer } from 'cheerio';
import { boundedJson } from './api.mjs';

const shops = new Map([
  ['uk.store.bambulab.com', 'Bambu Lab'], ['eu.store.bambulab.com', 'Bambu Lab'], ['us.store.bambulab.com', 'Bambu Lab'], ['store.bambulab.com', 'Bambu Lab'],
  ['www.sunlu.com', 'SUNLU'], ['sunlu.com', 'SUNLU'],
  ['www.elegoo.com', 'ELEGOO'], ['elegoo.com', 'ELEGOO'], ['uk.elegoo.com', 'ELEGOO'], ['eu.elegoo.com', 'ELEGOO'], ['us.elegoo.com', 'ELEGOO'],
  ['www.amazon.co.uk', ''], ['amazon.co.uk', ''],
]);
const recent = new Map();
const maxBytes = 2_000_000;
const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });

export function productUrl(value) {
  if (typeof value !== 'string' || value.length > 2000) throw Error('Paste a full product-page link, up to 2000 characters.');
  let url;
  try { url = new URL(value); } catch { throw Error('Paste a valid HTTPS product link.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !shops.has(url.hostname)) throw Error('Use a full HTTPS product link from Bambu Lab, SUNLU, ELEGOO or Amazon UK. Short links and other shops are not supported yet.');
  if (url.hostname.endsWith('amazon.co.uk')) {
    const asin = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1];
    if (!asin) throw Error('Use the full Amazon UK product link containing /dp/ or /gp/product/.');
    url = new URL('https://www.amazon.co.uk/dp/' + asin.toUpperCase());
  } else {
    if (!/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?products\/[^/]+\/?$/i.test(url.pathname)) throw Error('Use an individual product page, not a search, collection or basket.');
    const variant = url.searchParams.get('variant'), identifier = url.searchParams.get('id');
    url.search = '';
    if (/^\d{1,24}$/.test(variant || '')) url.searchParams.set('variant', variant);
    if (/^\d{1,24}$/.test(identifier || '')) url.searchParams.set('id', identifier);
  }
  url.hash = '';
  return url;
}

export function publicAddress(address) {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}

export function safeLookup(hostname, options, callback) {
  lookup(hostname, { all: true }, (error, addresses) => {
    if (error) { callback(error); return; }
    if (!addresses.length || addresses.some(entry => !publicAddress(entry.address))) { callback(Error('Shop address is not publicly reachable.')); return; }
    const candidates = options.family ? addresses.filter(entry => entry.family === options.family) : addresses;
    if (!candidates.length) { callback(Error('Shop address is unavailable.')); return; }
    if (options.all) callback(null, candidates);
    else callback(null, candidates[0].address, candidates[0].family);
  });
}

export function downloadPage(url, signal) {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, { method: 'GET', agent: false, lookup: safeLookup, signal, headers: { 'User-Agent': 'SpoolStudio-ProductLookup/1.0 (+https://spool-studio.uk/contact.html)', Accept: 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity' } }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) { resolve({ redirect: response.headers.location }); response.destroy(); return; }
      if (response.statusCode !== 200) { reject(Error('This shop blocked the lookup or the product is unavailable. Paste its product text in Import instead.')); response.destroy(); return; }
      if (!/^(text\/html|application\/xhtml\+xml)(?:;|$)/i.test(response.headers['content-type'] || '') || (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity')) { reject(Error('The shop did not return a readable product page. Use Import with copied product text.')); response.destroy(); return; }
      if (Number(response.headers['content-length'] || 0) > maxBytes) { reject(Error('This product page is too large. Use copied product text instead.')); response.destroy(); return; }
      const chunks = []; let bytes = 0;
      response.on('error', reject);
      response.on('aborted', () => reject(Error('The shop connection ended early. Try again.')));
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > maxBytes) { reject(Error('This product page is too large. Use copied product text instead.')); response.destroy(); }
        else chunks.push(chunk);
      });
      response.on('end', () => resolve({ body: Buffer.concat(chunks) }));
    });
    request.on('error', reject); request.end();
  });
}

const cleanText = (value, limit) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit) : '';
export function extractProduct(bytes, url) {
  if (bytes.length > maxBytes) throw Error('This product page is too large.');
  const document = loadBuffer(bytes), products = [];
  function inspect(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 5) return;
    if (Array.isArray(value)) { value.slice(0, 100).forEach(entry => inspect(entry, depth + 1)); return; }
    if ([value['@type']].flat().includes('Product')) products.push(value);
    for (const key of ['@graph', 'mainEntity']) if (value[key]) inspect(value[key], depth + 1);
  }
  document('script[type="application/ld+json"]').slice(0, 20).each((index, element) => { try { inspect(JSON.parse(document(element).text())); } catch {} });
  if (new Set(products.map(product => cleanText(product.name, 300))).size > 1) throw Error('This page contains multiple products or variants. Copy the exact variant’s title into Import instead.');
  const product = products[0];
  const title = cleanText(product?.name || document('#productTitle').text() || document('meta[property="og:title"]').attr('content'), 300);
  if (!title || /captcha|robot check|access denied|just a moment|sign in/i.test(title)) throw Error('No readable product details found. Copy the product title into Import instead.');
  if (!/\b(filament|PLA|PETG|ABS|ASA|TPU|nylon|polycarbonate|PVA|HIPS|PA6|PA12)\b/i.test(title)) throw Error('This does not look like a filament product. Use manual entry if it is.');
  return { title, brand: cleanText(typeof product?.brand === 'string' ? product.brand : product?.brand?.name, 80) || shops.get(url.hostname), url: url.href, warning: 'Product-page details are a draft. The selected colour, refill option and bundle contents may not be exposed by the shop; verify them against the actual roll.' };
}

export async function lookupProduct(value, download = downloadPage) {
  let url = productUrl(value);
  const signal = AbortSignal.timeout(12000);
  for (let redirects = 0; redirects <= 2; redirects++) {
    const result = await download(url, signal);
    if (result.redirect) { url = productUrl(new URL(result.redirect, url).href); continue; }
    if (!result.body) throw Error('The shop returned no product details.');
    return extractProduct(result.body, url);
  }
  throw Error('Too many redirects. Paste the final product-page address.');
}

export async function handleProductLookup(request, performLookup = lookupProduct) {
  const userId = request.headers.get('oai-authenticated-user-id');
  if (!userId) return json({ error: 'Sign in to look up products.' }, 401);
  if (request.method !== 'POST') return json({ error: 'Use POST for product lookup.' }, 405);
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Use this site’s product lookup.' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSON required.' }, 415);
  try {
    const input = await boundedJson(request, 5000);
    const url = productUrl(input.url);
    const now = Date.now();
    for (const [key, value] of recent) if (now - value.start > 60000) recent.delete(key);
    const allowance = recent.get(userId) || { start: now, count: 0 };
    if (allowance.count >= 10 || (!recent.has(userId) && recent.size >= 1000)) return json({ error: 'Please wait a minute before looking up more products.' }, 429);
    allowance.count++; recent.set(userId, allowance);
    return json({ product: await performLookup(url.href), accountKey: userId });
  } catch (error) {
    const message = /abort|timeout/i.test(error.name + ' ' + error.message) ? 'The shop took too long. Try again or paste its product text in Import.' : error.message;
    return json({ error: message?.startsWith('connect ') || message?.includes('ENOTFOUND') ? 'The shop is unavailable. Try again or use copied product text.' : message || 'Product lookup failed.' }, 400);
  }
}
