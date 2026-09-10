import { handleLibrary, getLibrary, libraryView } from "./library.mjs";
import { handleBatch } from "./api.mjs";
import { handleProductLookup } from "./product-lookup.mjs";
import {handleSpoolmanSync} from './spoolman-sync.mjs';
import {handleBarcodeLookup} from './barcode-lookup.mjs';
import {gmailConfig} from './gmail-config.mjs';
import {handleAccountExport} from './account-export.mjs';
import {handleEraseData} from './erase-data.mjs';
import {handleCommunityStats} from './community-stats.mjs';

export function appOrigins(value) {
  const origins = (value || "").split(",").map(origin => origin.trim()).filter(Boolean);
  if (!origins.length) throw Error("APP_ORIGINS is required.");
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (parsed.origin !== origin || (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname)))) throw Error("Invalid app origin.");
  }
  return origins;
}

export function returnPath(value) {
  return ["/", "/index.html", "/nfc.html", "/import.html", "/app.html", "/reels.html", "/welcome.html"].includes(value) || /^\/reels\.html#r=[a-f0-9-]{36}$/.test(value || "") ? value : "/";
}

export function clerkScripts(publishableKey) {
  if (!/^pk_(test|live)_[A-Za-z0-9_-]+$/.test(publishableKey || "")) throw Error("Clerk publishable key is required.");
  const encoded = publishableKey.replace(/^pk_(test|live)_/, "");
  const domain = Buffer.from(encoded, "base64").toString("utf8").replace(/\$$/, "");
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/i.test(domain)) throw Error("Invalid Clerk frontend domain.");
  return `<script defer crossorigin="anonymous" src="https://${domain}/npm/@clerk/ui@1/dist/ui.browser.js"></script><script defer crossorigin="anonymous" data-clerk-publishable-key="${publishableKey}" src="https://${domain}/npm/@clerk/clerk-js@6/dist/clerk.browser.js"></script><script defer src="/auth-client.js"></script>`;
}

function response(body, status, type = "application/json; charset=utf-8", extraHeaders) {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", type);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Netlify-CDN-Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  return new Response(body, { status, headers });
}

export async function serveNetlify(request, { authenticate, database, readPage, publishableKey, origins, gmail }) {
  const url = new URL(request.url);
  const api = url.pathname.startsWith("/api/");
  if (!origins.includes(url.origin)) return response('{"error":"This app address is not configured."}', 403);
  if (!api && !["GET", "HEAD"].includes(request.method)) return response('{"error":"Method not allowed."}', 405);
  const incomingHeaders = new Headers(request.headers);
  incomingHeaders.delete("oai-authenticated-user-id");
  incomingHeaders.delete("x-user-id");
  incomingHeaders.delete("x-clerk-user-id");
  const clean = new Request(request, { headers: incomingHeaders });
  try {
    if (url.pathname === '/api/spoolman-sync') return handleSpoolmanSync(clean, {DB: database()});
    if (["/sign-in", "/sign-out"].includes(url.pathname)) {
      const html = (await readPage("auth.html")).replace("<!-- CLERK -->", clerkScripts(publishableKey));
      return response(request.method === "HEAD" ? null : html, 200, "text/html; charset=utf-8");
    }
    const state = await authenticate(clean, { authorizedParties: origins, acceptsToken: "session_token" });
    if (state.status === "handshake" && !api && state.headers.get("location")) return response(null, 307, "text/plain", state.headers);
    const userId = state.isAuthenticated && state.tokenType === "session_token" ? state.toAuth().userId : null;
    if (!userId && api) return response('{"error":"Sign in to your Spool Studio account."}', 401);
    if (!userId && ["/nfc.html", "/import.html"].includes(url.pathname)) return response(null, 302, "text/plain", { Location: "/sign-in?return_to=" + encodeURIComponent(url.pathname) });
    if (api) {
      if(url.pathname==='/api/gmail-config')return response(JSON.stringify(gmailConfig(userId,gmail)),request.method==='GET'?200:405);
      const headers = new Headers(clean.headers);
      headers.set("oai-authenticated-user-id", userId);
      const authenticated = new Request(clean, { headers });
      const env = { DB: database() };
      if (['/api/account-export', '/api/account-data/erase', '/api/community-stats'].includes(url.pathname)) {
        const handler = url.pathname === '/api/community-stats' ? handleCommunityStats : url.pathname === '/api/account-export' ? handleAccountExport : handleEraseData;
        const result = await handler(authenticated, env);
        result.headers.set('Netlify-CDN-Cache-Control', 'no-store');
        for (const cookie of state.headers.getSetCookie()) result.headers.append('Set-Cookie', cookie);
        return result;
      }
      const result = url.pathname === "/api/library" ? await handleLibrary(authenticated, env) : url.pathname === "/api/phone-batch" ? await handleBatch(authenticated, env) : url.pathname === "/api/product-lookup" ? await handleProductLookup(authenticated) : url.pathname === "/api/barcode-lookup" ? await handleBarcodeLookup(authenticated, env) : response('{"error":"Not found."}', 404);
      result.headers.set("Netlify-CDN-Cache-Control", "no-store");
      for (const cookie of state.headers.getSetCookie()) result.headers.append("Set-Cookie", cookie);
      return result;
    }
    const filename = ({ "/": "index.html", "/index.html": "index.html", "/nfc.html": "nfc.html", "/import.html": "import.html", "/app.html": "app.html", "/reels.html": "reels.html", "/welcome.html": "welcome.html" })[url.pathname];
    if (!filename) return response('{"error":"Not found."}', 404);
    const account = '<script id="auth-account" type="application/json">' + JSON.stringify({ userId: userId || "" }).replaceAll("<", "\\u003c") + "</script>";
    let html = (await readPage(filename)).replace("<!-- CLERK -->", account + clerkScripts(publishableKey));
    if (filename === "index.html") {
      const data = userId ? libraryView(await getLibrary(database(), userId), userId) : { status: "signedout", items: [], accountKey: "", notice: "", coverage: "" };
      html = html.replace('<script id="dataset" type="application/json">{"status":"signedout","items":[]}</script>', '<script id="dataset" type="application/json">' + JSON.stringify(data).replaceAll("<", "\\u003c") + "</script>");
    }
    const headers = new Headers();
    for (const cookie of state.headers.getSetCookie()) headers.append("Set-Cookie", cookie);
    return response(request.method === "HEAD" ? null : html, 200, "text/html; charset=utf-8", headers);
  } catch {
    return response(api ? '{"error":"Spool Studio is temporarily unavailable. Your existing data has not been replaced."}' : '<!doctype html><title>Spool Studio</title><h1>Spool Studio is being prepared</h1><p>Sign-in or storage is not ready. Please try again later. Your existing library is unchanged.</p>', 503, api ? "application/json; charset=utf-8" : "text/html; charset=utf-8");
  }
}
