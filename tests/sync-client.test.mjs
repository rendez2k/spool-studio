import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";

const source = readFileSync(new URL("../out/nfc-sync.js", import.meta.url), "utf8");
const batch = name => ({ p: name, state: "choosing", total: 4, chosen: 0, selection: null });
const tick = () => new Promise(resolve => setImmediate(resolve));

test("publisher coalesces selections, preserves failed requests and detects another desktop", async () => {
  let saved = { revision: 0, batch: null }, failAfterSave = false;
  const statuses = [], writes = [];
  const context = vm.createContext({
    Response, AbortSignal, crypto: webcrypto, setTimeout() {}, clearTimeout() {},
    fetch: async (url, options) => {
      assert.equal(url, "/api/phone-batch");
      assert.equal(options.credentials, "same-origin");
      if (options.method === "GET") return Response.json(saved);
      const input = JSON.parse(options.body);
      writes.push(input);
      if (saved.requestId === input.requestId) return Response.json(saved);
      if (input.baseRevision !== saved.revision) return Response.json({ error: "Newer batch elsewhere." }, { status: 409 });
      saved = { revision: saved.revision + 1, batch: input.batch, requestId: input.requestId };
      if (failAfterSave) { failAfterSave = false; throw Error("Response lost"); }
      return Response.json(saved);
    },
    report: status => statuses.push(status),
  });
  vm.runInContext(source + "\nvar publisher=FilamentSync.publisher(report);", context);
  const publish = value => { context.batch = value; return vm.runInContext("publisher.publish(batch)", context); };
  await tick();
  assert.equal(writes.length, 0);
  await publish(batch("Panda"));
  assert.equal(saved.revision, 1);
  await publish(batch("Panda"));
  assert.equal(writes.length, 1);
  failAfterSave = true;
  await publish(batch("Ghost"));
  assert.match(statuses.at(-1), /Not synced/);
  await publish(batch("Ghost"));
  assert.equal(writes.at(-1).requestId, writes.at(-2).requestId);
  assert.equal(saved.revision, 2);
  saved = { revision: 3, batch: batch("Other desktop") };
  await publish(batch("New print"));
  assert.match(statuses.at(-1), /Newer batch/);
  assert.equal(saved.batch.p, "Other desktop");
  await publish(batch("New print"));
  assert.equal(saved.revision, 4);
  assert.equal(saved.batch.p, "New print");
});

test("rapid changes are serialized and the last choice wins", async () => {
  let release, saved = { revision: 0, batch: null };
  let first = true;
  const writes = [];
  const context = vm.createContext({
    Response, AbortSignal, crypto: webcrypto, setTimeout() {}, clearTimeout() {},
    fetch: async (url, options) => {
      if (options.method === "GET") return Response.json(saved);
      const input = JSON.parse(options.body);
      writes.push(input);
      if (first) { first = false; await new Promise(resolve => { release = resolve; }); }
      assert.equal(input.baseRevision, saved.revision);
      saved = { revision: saved.revision + 1, batch: input.batch };
      return Response.json(saved);
    },
  });
  vm.runInContext(source + "\nvar publisher=FilamentSync.publisher(()=>{});", context);
  context.batch = batch("First");
  const inFlight = vm.runInContext("publisher.publish(batch)", context);
  await tick();
  context.batch = batch("Intermediate");
  await vm.runInContext("publisher.publish(batch)", context);
  context.batch = batch("Latest");
  await vm.runInContext("publisher.publish(batch)", context);
  release();
  await inFlight;
  await tick();
  assert.deepEqual(writes.map(input => input.batch.p), ["First", "Latest"]);
  assert.equal(saved.batch.p, "Latest");
});
