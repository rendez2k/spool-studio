import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import worker from "../dist/server/index.js";

const read = filename => readFileSync(new URL("../out/" + filename, import.meta.url), "utf8");
const manifest = JSON.parse(read("app.webmanifest"));

test("both pages expose one credentialed standalone app with working PNG icons", async () => {
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/nfc.html");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert(manifest.icons.some(icon => icon.purpose === "maskable"));
  for (const page of ["index.html", "nfc.html"]) {
    assert.match(read(page), /rel="manifest" href="\/app.webmanifest" crossorigin="use-credentials"/);
    assert.match(read(page), /pwa.js/);
  }
  const response = await worker.fetch(new Request("https://test.example/app.webmanifest"), {});
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/manifest\+json/);
  for (const icon of manifest.icons) {
    const response = await worker.fetch(new Request("https://test.example" + icon.src), {});
    assert.equal(response.headers.get("content-type"), "image/png");
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    const size = Number(icon.sizes.split("x")[0]);
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
  const script = await worker.fetch(new Request("https://test.example/sw.js"), {});
  assert.match(script.headers.get("content-type"), /javascript/);
  assert.match(script.headers.get("cache-control"), /no-cache/);
  assert.equal((await worker.fetch(new Request("https://test.example/api/phone-batch"), {})).status, 401);
});

test("installation is user-triggered, handles cancellation and hides when installed", async () => {
  const nodes = new Map(["app-install", "install-app", "install-status"].map(id => [id, { hidden: false, disabled: false, textContent: "" }]));
  const handlers = {}, registrations = [];
  let standalone = false, prompts = 0, prevented = false;
  const context = vm.createContext({
    document: { getElementById: id => nodes.get(id) },
    navigator: { serviceWorker: { register: async (...args) => registrations.push(args) } },
    window: { isSecureContext: true, navigator: {}, matchMedia: () => ({ get matches() { return standalone; }, addEventListener() {} }), addEventListener: (name, callback) => { handlers[name] = callback; } },
  });
  vm.runInContext(read("pwa.js"), context);
  assert.equal(registrations[0][0], "/sw.js");
  assert.equal(registrations[0][1].updateViaCache, "none");
  await nodes.get("install-app").onclick();
  assert.match(nodes.get("install-status").textContent, /Chrome/);
  handlers.beforeinstallprompt({ preventDefault() { prevented = true; }, async prompt() { prompts++; }, userChoice: Promise.resolve({ outcome: "dismissed" }) });
  assert(prevented);assert.equal(prompts, 0);
  await nodes.get("install-app").onclick();
  assert.equal(prompts, 1);
  assert.match(nodes.get("install-status").textContent, /Not installed/);
  await nodes.get("install-app").onclick();
  assert.equal(prompts, 1);
  handlers.beforeinstallprompt({ preventDefault() {}, async prompt() { prompts++;handlers.appinstalled(); }, userChoice: Promise.resolve({ outcome: "accepted" }) });
  await nodes.get("install-app").onclick();
  assert(nodes.get("app-install").hidden);
  standalone = true;
  vm.runInContext(read("pwa.js"), context);
  assert(nodes.get("app-install").hidden);
});

test("offline navigation has a safe fallback; API, auth and writes never enter worker caching", async () => {
  let listener, offline = false;
  const network = [];
  const context = vm.createContext({
    URL, Response,
    self: { location: { origin: "https://test.example" }, addEventListener: (name, handler) => { assert.equal(name, "fetch");listener = handler; } },
    fetch: async request => { network.push(request.url);if (offline) throw Error("offline");return new Response("network response", { status: 200 }); },
  });
  vm.runInContext(read("sw.js"), context);
  const dispatch = (pathname, method = "GET", mode = "navigate") => {
    let result;
    listener({ request: { url: "https://test.example" + pathname, method, mode }, respondWith(response) { result = response; } });
    return result;
  };
  for (const route of ["/api/phone-batch", "/signin-with-chatgpt", "/callback", "/signout-with-chatgpt"]) assert.equal(dispatch(route), undefined);
  assert.equal(dispatch("/nfc.html", "POST"), undefined);
  assert.equal(dispatch("/nfc.html", "GET", "cors"), undefined);
  assert.equal(await (await dispatch("/nfc.html")).text(), "network response");
  offline = true;
  const response = await dispatch("/nfc.html");
  assert.match(await response.text(), /Reconnect to your filaments/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert(!read("sw.js").includes("caches."));
  assert(!read("sw.js").includes("skipWaiting"));
  assert(!read("sw.js").includes("clients.claim"));
});
