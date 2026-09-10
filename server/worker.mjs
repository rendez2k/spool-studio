import { handleBatch } from "./api.mjs";
import { handleLibrary, getLibrary, libraryView } from "./library.mjs";
import assets from "filament-assets";

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/api/phone-batch") return handleBatch(request, env);
    if (pathname === "/api/library") return handleLibrary(request, env);
    if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405 });
    const asset = assets[pathname === "/" ? "/index.html" : pathname];
    if (!asset) return new Response("Not found", { status: 404 });
    const bytes = Uint8Array.from(atob(asset.data), character => character.charCodeAt(0));
    if (pathname === "/" || pathname === "/index.html") {
      const userId = request.headers.get("oai-authenticated-user-id");
      let data = { status: "signedout", items: [], accountKey: "", notice: "", coverage: "" };
      let status = 200;
      if (userId) {
        try { data = libraryView(await getLibrary(env.DB, userId), userId); }
        catch { data = { status: "unavailable", items: [], accountKey: userId, notice: "Your library is temporarily unavailable. Refresh to retry.", coverage: "" }; status = 503; }
      }
      const html = new TextDecoder().decode(bytes).replace('<script id="dataset" type="application/json">{"status":"signedout","items":[]}</script>', '<script id="dataset" type="application/json">' + JSON.stringify(data).replaceAll("<", "\\u003c") + "</script>");
      return new Response(request.method === "HEAD" ? null : html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
    }
    if (["/nfc.html", "/import.html"].includes(pathname) && !request.headers.get("oai-authenticated-user-id")) {
      return new Response(null, { status: 302, headers: { Location: "/signin-with-chatgpt?return_to=" + encodeURIComponent(pathname), "Cache-Control": "no-store" } });
    }
    return new Response(request.method === "HEAD" ? null : bytes, {
      headers: { "Content-Type": asset.type, "Cache-Control": "private, no-cache", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" },
    });
  },
};
