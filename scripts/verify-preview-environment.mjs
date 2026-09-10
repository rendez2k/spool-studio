import assert from "node:assert/strict";
import { getDatabase } from "@netlify/database";

const origin = "https://port-preview--spool-studio-productkit.netlify.app";
if (!process.env.TEST_DATABASE_URL) throw Error("Use the port-preview database connection only.");
const database = getDatabase({ connectionString: process.env.TEST_DATABASE_URL });
try {
  const tables = await database.pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  assert(tables.rows.some(row => row.tablename === "libraries"), "Hosted library migration is missing.");
  assert(tables.rows.some(row => row.tablename === "phone_batches"), "Hosted phone migration is missing.");
  for (const route of ["/", "/sign-in", "/icons/filament-192.png"]) {
    const response = await fetch(origin + route, { redirect: "manual", signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200, route);
    if (route === "/") {
      const html = await response.text();
      const dataset = html.match(/<script id="dataset" type="application\/json">([\s\S]*?)<\/script>/);
      assert(dataset);
      assert.deepEqual(JSON.parse(dataset[1]).items, []);
    }
  }
  for (const route of ["/api/library", "/api/phone-batch"]) {
    const response = await fetch(origin + route, { headers: { "oai-authenticated-user-id": "forged", "x-clerk-user-id": "forged" }, redirect: "manual", signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 401, route);
  }
  for (const route of ["/server/library.mjs", "/.openai/hosting.json"]) assert.equal((await fetch(origin + route)).status, 404);
  console.log(JSON.stringify({ passed: true, checks: ["hosted schema", "public shell", "sign-in page", "icons", "private APIs reject forged identity", "source files not exposed"], stillRequired: "Real browser sign-in and two-device user acceptance testing" }));
} finally { await database.pool.end(); }
