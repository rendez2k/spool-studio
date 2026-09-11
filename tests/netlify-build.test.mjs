import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access, readdir } from "node:fs/promises";
import path from "node:path";

test("Netlify build keeps private templates and source data off the CDN and removes legacy login links", async () => {
  for (const name of ["index.html", "nfc.html", "import.html", "app.html", "auth.html"]) {
    await assert.rejects(access(path.join("dist/netlify-public", name)));
    const html = await readFile(path.join("dist/netlify-pages", name), "utf8");
    assert(html.includes("<!-- CLERK -->"));
    assert(!html.includes("signin-with-chatgpt"));
  }
  const root = await readFile("dist/netlify-pages/index.html", "utf8");
  assert(root.includes('<script id="dataset" type="application/json">{"status":"signedout","items":[]}</script>'));
  const publicEntries = await readdir("dist/netlify-public");
  for (const forbidden of ["server", "previews", ".openai", "legacy-inventory.json", "netlify", ".env"]) assert(!publicEntries.includes(forbidden));
  for (const name of ["library.js", "import.js", "nfc-sync.js"]) {
    const script = await readFile(path.join("dist/netlify-public", name), "utf8");
    assert(!script.includes("signin-with-chatgpt"));
    assert(!script.includes("signout-with-chatgpt"));
  }
  const privacy = await readFile("dist/netlify-public/privacy.html", "utf8");
  assert(privacy.includes("Clerk handles account registration"));
  assert(privacy.includes("Netlify Database (Postgres)"));
  assert(!privacy.includes("Cloudflare Workers"));
  assert(privacy.includes("data-privacy-review"));
});

test("one spool identity and manifest cover the app and sign-in; release matches the device page", async () => {
  for (const name of ["index.html", "nfc.html", "import.html", "app.html", "auth.html"]) {
    const html = await readFile(path.join("dist/netlify-pages", name), "utf8");
    assert(html.includes('class="studio-brand"'));
    assert(html.includes('src="/icons/filament.svg"'));
    assert(html.includes('href="/app.webmanifest"'));
    assert(html.includes('src="/pwa.js"'));
  }
  const release = JSON.parse(await readFile("dist/netlify-public/app-release.json", "utf8"));
  assert.match(release.version, /^[a-f0-9]{12}$/);
  const page = await readFile("dist/netlify-pages/app.html", "utf8");
  assert(page.includes('name="app-release" content="' + release.version + '"'));
  const manifest = JSON.parse(await readFile("dist/netlify-public/app.webmanifest", "utf8"));
  for (const route of ["/?add=barcode", "/?add=manual", "/nfc.html", "/"]) assert(manifest.shortcuts.some(shortcut => shortcut.url === route));
});
