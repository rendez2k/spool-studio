import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { handleLibrary } from "../server/library.mjs";
import { localDatabase } from "../scripts/local-db.mjs";

const require = createRequire(import.meta.url);
const html = readFileSync(new URL("../out/index.html", import.meta.url), "utf8");
function node() {
  const classes = new Set();
  return { value: "", textContent: "", innerHTML: "", checked: false, disabled: false, hidden: false, open: false, children: [], attrs: {}, dataset: {}, style: { setProperty() {} },
    get options() { return this.children; }, append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; },
    querySelectorAll() { return []; }, setAttribute(key, value) { this.attrs[key] = value; }, addEventListener() {}, focus() {}, scrollIntoView() {}, reportValidity() { return true; }, reset() {},
    showModal() { this.open = true; }, close() { this.open = false; },
    classList: { add(value) { classes.add(value); }, remove(value) { classes.delete(value); }, contains(value) { return classes.has(value); }, toggle(value, force) { if (force ?? !classes.has(value)) classes.add(value); else classes.delete(value); } },
  };
}

test("new user can add, edit, mark used and undo without inheriting local owner data", async () => {
  const DB = localDatabase(), elements = new Map(), storage = new Map([["filament-used-v1", '{"old-spool":true}']]);
  let actor = "new-user";
  const get = id => { if (!elements.has(id)) elements.set(id, node()); return elements.get(id); };
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) get(match[1]);
  const call = async (method = "GET", body) => handleLibrary(new Request("https://test.example/api/library", { method, headers: { "oai-authenticated-user-id": actor, origin: "https://test.example", "content-type": "application/json" }, body }), { DB });
  get("dataset").textContent = JSON.stringify(await (await call()).json());
  const context = vm.createContext({
    SpoolCollection: require("../out/collection-core.js"), FilamentMatcher: require("../out/matcher.js"), FilamentNfc: require("../out/nfc-codec.js"),
    document: { getElementById: get, querySelector: node, querySelectorAll: () => [], body: node(), createElement: node, addEventListener() {}, hidden: false },
    window: { addEventListener() {} }, matchMedia: () => ({ matches: false }), Blob, URL, AbortSignal, crypto,
    location: { protocol: "https:", href: "https://test.example/" }, setTimeout() {},
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    fetch: async (url, options) => { assert.equal(url, "/api/library"); return call(options.method, options.body); },
  });
  const run = code => vm.runInContext(code, context);
  try {
    run(html.match(/<script>\s*('use strict';[\s\S]*?)<\/script>/)[1]);
    run(readFileSync(new URL("../out/library.js", import.meta.url), "utf8"));
    assert.equal(run("items.length"), 0);
    assert.equal(run("Object.keys(used).length"), 0);
    assert.equal(get("add-spool").disabled, false);
    get("add-spool").onclick();
    assert(get("spool-dialog").open);
    for (const [field, value] of Object.entries({ brand: "SUNLU", product: "PLA", material: "PLA", finish: "matte", colour: "Orange", hex: "#EF8D34", count: "4", weight: "1000", packaging: "refill", date: "2026-09-09", notes: "On shelf 2" })) get("spool-" + field).value = value;
    await get("spool-form").onsubmit({ preventDefault() {} });
    assert.equal(run("items.length"), 1);
    assert.equal(run("items[0].spools"), 4);
    assert.equal(run("items[0].finish"), "matte");
    assert.equal(run("items[0].packaging"), "refill");
    assert.equal(get("spool-dialog").open, false);
    await run("markUsage(items[0].id)");
    assert.equal(run("isUsed(items[0])"), true);
    await get("undo-used").onclick();
    assert.equal(run("isUsed(items[0])"), false);
    run("openSpoolForm(items[0].id)");
    get("spool-count").value = "3";
    await get("spool-form").onsubmit({ preventDefault() {} });
    assert.equal(run("items[0].spools"), 3);
    run("matchProjects=[{name:'Private model',slots:[],previews:[]}];matchSyncEnabled=true");
    actor = "another-user";
    await run("refreshLibrary()");
    assert.equal(run("items.length"), 0);
    assert.equal(run("matchProjects"), null);
    assert.equal(run("matchSyncEnabled"), false);
    assert.equal(get("nfc-share-link").value, "");
    assert.equal(storage.get("filament-used-v1"), '{"old-spool":true}');
  } finally { DB.close(); }
});
