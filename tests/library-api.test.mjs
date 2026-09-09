import test from "node:test";
import assert from "node:assert/strict";
import { handleLibrary } from "../server/library.mjs";
import { localDatabase } from "../scripts/local-db.mjs";
import worker from "../dist/server/index.js";

const spool = { brand: "Test brand", product: "PLA", material: "PLA", finish: "matte", colour: "Orange", hex: "#EF8D34", spools: 2, weightGrams: 1000, packaging: "refill", date: "2026-09-09", notes: "" };
const request = (user, body, options = {}) => new Request("https://test.example/api/library", { method: body ? "POST" : "GET", headers: { ...(user ? { "oai-authenticated-user-id": user } : {}), origin: "https://test.example", "content-type": "application/json", ...options }, body: body ? JSON.stringify(body) : undefined });
const command = (baseRevision, kind = "add", extra = {}) => ({ baseRevision, kind, requestId: crypto.randomUUID(), spool, ...extra });

test("every account starts empty and cannot access another user's library", async () => {
  const DB = localDatabase();
  try {
    assert.equal((await handleLibrary(request(null), { DB })).status, 401);
    for (const user of ["alice", "bob"]) {
      const state = await (await handleLibrary(request(user), { DB })).json();
      assert.deepEqual(state.items, []);
      assert.equal(state.accountKey, user);
    }
    const owner = await (await handleLibrary(request("alice", command(1)), { DB })).json();
    const forbidden = command(1, "edit", { id: owner.items[0].id, userId: "alice" });
    assert.equal((await handleLibrary(request("bob", forbidden), { DB })).status, 404);
    assert.deepEqual((await (await handleLibrary(request("bob"), { DB })).json()).items, []);
    assert.equal((await (await handleLibrary(request("alice"), { DB })).json()).items.length, 1);
  } finally { DB.close(); }
});

test("spool add/edit/used/undo enforce ownership, revision checks and input bounds", async () => {
  const DB = localDatabase();
  const act = (user, value) => handleLibrary(request(user, value), { DB });
  try {
    await act("alice");
    const addition = command(1);
    let response = await act("alice", addition);
    assert.equal(response.status, 200);
    let state = await response.json();
    const id = state.items[0].id;
    assert.equal(state.items[0].finish, "matte");
    assert.equal(state.items[0].packaging, "refill");
    assert.equal((await (await act("alice", addition)).json()).items.length, 1);
    assert.equal((await act("bob", command(1, "usage", { changes: [{ id, used: true }] }))).status, 404);
    assert.equal((await act("alice", command(1))).status, 409);
    const results = await Promise.all([act("alice", command(2, "edit", { id, spool: { ...spool, finish: "standard" } })), act("alice", command(2, "edit", { id }))]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    state = await (await act("alice")).json();
    state = await (await act("alice", command(state.revision, "usage", { changes: [{ id, used: true }] }))).json();
    assert.equal(state.items[0].used, true);
    state = await (await act("alice", command(state.revision, "usage", { changes: [{ id, used: false }] }))).json();
    assert.equal(state.items[0].used, false);
    for (const invalid of [{ spools: -1 }, { spools: 501 }, { hex: "red" }, { material: "Anything" }, { finish: "pretend" }, { date: "2026-02-31" }, { weightGrams: 0 }, { notes: "x".repeat(501) }]) {
      assert.equal((await act("alice", command(state.revision, "add", { spool: { ...spool, ...invalid } }))).status, 400);
    }
    assert.equal((await handleLibrary(request("alice", command(state.revision), { origin: "https://other.example" }), { DB })).status, 403);
    assert.equal((await (await act("bob")).json()).items.length, 0);
  } finally { DB.close(); }
});

test("bulk updates are atomic and client-supplied import data is rejected", async () => {
  const DB = localDatabase();
  try {
    const state = await (await handleLibrary(request("alice", command(1)), { DB })).json();
    const changes = [{ id: state.items[0].id, used: true }, { id: "not-owned", used: true }];
    assert.equal((await handleLibrary(request("alice", command(state.revision, "usage", { changes })), { DB })).status, 404);
    assert.equal((await (await handleLibrary(request("alice"), { DB })).json()).items[0].used, false);
    assert.equal((await handleLibrary(request("alice", command(state.revision, "import-used", { changes })), { DB })).status, 400);
  } finally { DB.close(); }
});

test("public pages/assets expose no personal data and server-injected JSON is escaped", async () => {
  const DB = localDatabase();
  try {
    await handleLibrary(request("private-user", command(1, "add", { spool: { ...spool, colour: "Private-test-colour" } })), { DB });
    for (const pathname of ["/", "/index.html", "/library.js", "/matcher.js", "/nfc-sync.js", "/pwa.js", "/sw.js"]) {
      const response = await worker.fetch(new Request("https://test.example" + pathname), { DB });
      const html = await response.text();
      assert(!html.includes("Private-test-colour"));
      if (pathname === "/" || pathname === "/index.html") assert.deepEqual(JSON.parse(html.match(/<script id="dataset" type="application\/json">([\s\S]*?)<\/script>/)[1]).items, []);
    }
    for (const pathname of ["/server/library.mjs", "/previews/private.png", "/.openai/hosting.json", "/dist/server/index.js"]) assert.equal((await worker.fetch(new Request("https://test.example" + pathname), { DB })).status, 404);
    const phone = await worker.fetch(new Request("https://test.example/nfc.html"), { DB });
    assert.equal(phone.status, 302);
    assert.equal(phone.headers.get("location"), "/signin-with-chatgpt?return_to=%2Fnfc.html");
    await handleLibrary(request("test-user"), { DB });
    const injection = "</script><img src=x onerror=alert(1)>";
    await handleLibrary(request("test-user", command(1, "add", { spool: { ...spool, colour: injection } })), { DB });
    const page = await worker.fetch(new Request("https://test.example/", { headers: { "oai-authenticated-user-id": "test-user" } }), { DB });
    assert.equal(page.headers.get("cache-control"), "private, no-store");
    const html = await page.text();
    assert(!html.includes(injection));
    const data = JSON.parse(html.match(/<script id="dataset" type="application\/json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(data.items[0].colour, injection);
    assert.equal(data.items.length, 1);
  } finally { DB.close(); }
});
