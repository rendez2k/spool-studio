import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { handleBatch } from "../server/api.mjs";
import { localDatabase } from "../scripts/local-db.mjs";

const batch = { p: "Panda", state: "ready", total: 1, chosen: 1, selection: { v: 1, p: "Panda", s: [{ n: 1, m: "PLA", c: "FFFFFF", f: "matte", l: "White" }] } };
function request(user = "owner", method = "GET", body, overrides = {}) {
  return new Request("https://test.example/api/phone-batch", { method, headers: { ...(user ? { "oai-authenticated-user-id": user } : {}), origin: "https://test.example", "content-type": "application/json", ...overrides }, body: body ? JSON.stringify(body) : undefined });
}
const update = (revision = 0, requestId = "request-id-00000001", value = batch) => ({ baseRevision: revision, requestId, batch: value });

test("authenticated, isolated, persistent latest batch with concurrency and idempotency", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "filament-sync-test-"));
  const filename = path.join(directory, "test.sqlite");
  let database = localDatabase(filename);
  const run = (incoming) => handleBatch(incoming, { DB: database });
  try {
    assert.equal((await run(request(null))).status, 401);
    assert.equal((await (await run(request())).json()).batch, null);
    assert.equal((await run(request("owner", "PUT", update(), { origin: "https://evil.example" }))).status, 403);
    assert.equal((await run(request("owner", "PUT", update(), { "sec-fetch-site": "cross-site" }))).status, 403);
    const writes = await Promise.all([run(request("owner", "PUT", update())), run(request("owner", "PUT", update(0, "request-id-00000002")))]);
    assert.deepEqual(writes.map(response => response.status).sort(), [200, 409]);
    assert.equal((await run(request("owner", "PUT", update()))).status, 200);
    assert.equal((await (await run(request())).json()).revision, 1);
    assert.equal((await (await run(request("other"))).json()).batch, null);
    const choosing = { p: "Ghost", state: "choosing", total: 4, chosen: 0, selection: null };
    assert.equal((await run(request("owner", "PUT", update(1, "request-id-00000003", choosing)))).status, 200);
    database.close();
    database = localDatabase(filename);
    const saved = await (await run(request())).json();
    assert.equal(saved.revision, 2);
    assert.deepEqual(saved.batch, choosing);
    assert.equal((await run(request("owner", "PUT", update(1, "request-id-00000004")))).status, 409);
  } finally {
    database.close();
    const resolved = path.resolve(directory);
    assert(resolved.startsWith(path.resolve(tmpdir()) + path.sep));
    assert(path.basename(resolved).startsWith("filament-sync-test-"));
    rmSync(resolved, { recursive: true });
  }
});

test("invalid and oversized selections are rejected without changing saved data", async () => {
  const database = localDatabase();
  try {
    for (const invalid of [{ ...batch, total: 65 }, { ...batch, chosen: 0 }, { ...batch, p: "wrong" }, { ...batch, selection: { ...batch.selection, s: [{ ...batch.selection.s[0], m: "PLA+" }] } }]) {
      assert.equal((await handleBatch(request("owner", "PUT", update(0, "request-id-00000001", invalid)), { DB: database })).status, 400);
    }
    assert.equal((await handleBatch(request("owner", "PUT", { extra: "a".repeat(9000) }), { DB: database })).status, 400);
    assert.equal((await (await handleBatch(request(), { DB: database })).json()).revision, 0);
  } finally { database.close(); }
});
