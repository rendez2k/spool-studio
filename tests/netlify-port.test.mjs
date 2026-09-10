import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { postgresDatabase } from "../server/postgres.mjs";
import { serveNetlify, appOrigins, returnPath, clerkScripts } from "../server/netlify-app.mjs";

const origin = "https://studio.example";
const publishableKey = "pk_test_" + Buffer.from("clerk.example$").toString("base64").replaceAll("=", "");
const spool = { brand: "Test", product: "Matte PLA", material: "PLA", finish: "matte", colour: "Orange", hex: "#FF8000", spools: 2, weightGrams: 1000, packaging: "refill", date: "2026-09-10", notes: "" };

async function harness() {
  const postgres = new PGlite();
  await postgres.exec(await readFile("netlify/database/migrations/001_create-inventory/migration.sql", "utf8"));
  const database = postgresDatabase({ async query(query, values) {
    const result = await postgres.query(query, values);
    return { rows: result.rows, rowCount: result.affectedRows };
  } });
  const options = {
    publishableKey, origins: [origin], database: () => database,
    readPage: async () => '<html><head><!-- CLERK --></head><script id="dataset" type="application/json">{"status":"signedout","items":[]}</script></html>',
    authenticate: async (request, settings) => {
      assert.equal(request.headers.get("oai-authenticated-user-id"), null);
      assert.equal(request.headers.get("x-clerk-user-id"), null);
      assert.equal(settings.acceptsToken, "session_token");
      assert.deepEqual(settings.authorizedParties, [origin]);
      const token = request.headers.get("authorization");
      const userId = ({ "Bearer alice-test-session": "user_alice", "Bearer bob-test-session": "user_bob" })[token];
      return { isAuthenticated: Boolean(userId), tokenType: "session_token", headers: new Headers(), toAuth: () => ({ userId }) };
    },
  };
  function request(route, user, body, overrides = {}) {
    return new Request(origin + route, {
      method: body ? (route === "/api/phone-batch" ? "PUT" : "POST") : "GET",
      headers: { origin, "content-type": "application/json", ...(user ? { authorization: "Bearer " + user + "-test-session" } : {}), ...overrides },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  return { postgres, options, request, run: (...args) => serveNetlify(request(...args), options) };
}

test("Netlify product lookup rejects forged identities and requires a real session", async () => {
  const app = await harness();
  try {
    assert.equal((await app.run('/api/product-lookup', null, {url:'https://example.com'}, {'oai-authenticated-user-id':'user_alice','x-clerk-user-id':'user_alice'})).status,401);
    const response = await app.run('/api/product-lookup', 'alice', {url:'https://127.0.0.1/private'});
    assert.equal(response.status,400);
    assert.equal(response.headers.get('netlify-cdn-cache-control'),'no-store');
    assert.match((await response.json()).error,/HTTPS product link/);
  } finally { await app.postgres.close(); }
});

test("new connections keep Gmail gated, bridge credentials isolated and QR redirects local",async()=>{
 const app=await harness();
 try{
  assert.equal((await app.run('/api/barcode-lookup',null,{code:'4002293401102',consent:true},{'oai-authenticated-user-id':'user_alice'})).status,401);
  assert.equal((await app.run('/api/gmail-config',null)).status,401);
  assert.equal((await app.run('/api/account-export',null,null,{'oai-authenticated-user-id':'user_alice'})).status,401);
  assert.equal((await (await app.run('/api/gmail-config','alice')).json()).enabled,false);
  assert.equal((await app.run('/api/spoolman-sync','alice',{sequence:Date.now(),spools:[]})).status,401);
  let state=await (await app.run('/api/library','alice',{kind:'add',baseRevision:1,requestId:crypto.randomUUID(),spool})).json();
  state=await (await app.run('/api/library','alice',{kind:'initialise-reels',expectedAccountKey:'user_alice',baseRevision:state.revision,requestId:crypto.randomUUID()})).json();
  state=await (await app.run('/api/library','alice',{kind:'bridge-create',expectedAccountKey:'user_alice',baseRevision:state.revision,requestId:crypto.randomUUID()})).json();
  const credential=state.bridgeToken;
  const exported=await app.run('/api/account-export','alice');assert.equal(exported.headers.get('netlify-cdn-cache-control'),'no-store');const copy=await exported.json();assert.equal(copy.library.items.length,1);assert.equal(copy.library.reels.length,2);assert(!JSON.stringify(copy).includes(credential));assert.equal((await (await app.run('/api/account-export','bob')).json()).library.items.length,0);
  const response=await serveNetlify(new Request(origin+'/api/spoolman-sync',{method:'POST',headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json','oai-authenticated-user-id':'user_bob'},body:JSON.stringify({sequence:Date.now(),spools:[]})}),app.options);
  assert.equal(response.status,200);assert.equal(response.headers.get('netlify-cdn-cache-control'),'no-store');
  assert.equal((await app.run('/api/library',null,null,{authorization:'Bearer '+credential})).status,401);
  assert.equal((await app.run('/reels.html')).status,200);
  assert.equal(returnPath('/reels.html#r='+state.reels[0].id),'/reels.html#r='+state.reels[0].id);
  assert.equal(returnPath('//evil.example/reels.html'),'/');assert.equal(returnPath('/reels.html?return_to=https://evil.example'),'/');
 }finally{await app.postgres.close()}
});

test("Netlify rejects forged identity headers and isolates Clerk-owned libraries in Postgres", async () => {
  const app = await harness();
  try {
    assert.equal((await app.run("/api/library", null, null, { "oai-authenticated-user-id": "user_alice", "x-clerk-user-id": "user_alice" })).status, 401);
    assert.equal((await app.run("/api/library", "invalid")).status, 401);
    const command = { kind: "add", baseRevision: 1, requestId: crypto.randomUUID(), spool };
    const response = await app.run("/api/library", "alice", command);
    assert.equal(response.status, 200);
    const alice = await response.json();
    assert.equal(alice.items.length, 1);
    assert.equal(alice.accountKey, "user_alice");
    assert.equal(alice.revision, 2);
    assert.deepEqual((await (await app.run("/api/library", "bob")).json()).items, []);
    assert.equal((await app.run("/api/library", "bob", { ...command, kind: "edit", id: alice.items[0].id })).status, 404);
    assert.equal((await app.run("/api/library", "alice", command)).status, 200);
    assert.equal((await app.run("/api/library", "alice", { ...command, requestId: crypto.randomUUID() })).status, 409);
    assert.equal((await app.run("/api/library", "alice", { ...command, baseRevision: 2, requestId: crypto.randomUUID() }, { origin: "https://evil.example" })).status, 403);
    assert.equal((await app.run("/api/library", "alice", { ...command, kind: "import", baseRevision: 2, expectedAccountKey: "user_bob" })).status, 409);
    const html = await (await app.run("/", "alice")).text();
    assert(html.includes('"accountKey":"user_alice"'));
    const publicPage = await app.run("/");
    assert.equal(publicPage.headers.get("netlify-cdn-cache-control"), "no-store");
    assert(!(await publicPage.text()).includes("Orange"));
    const devicePage = await app.run("/app.html");
    assert.equal(devicePage.status, 200);
    assert.equal(devicePage.headers.get("cache-control"), "private, no-store");
    assert.equal(returnPath("/app.html"), "/app.html");
    const signedInDevice = await app.run("/app.html", "alice");
    assert((await signedInDevice.text()).includes('"userId":"user_alice"'));
  } finally { await app.postgres.close(); }
});

test("Netlify phone sync keeps CAS, idempotency and account separation on Postgres", async () => {
  const app = await harness();
  try {
    const batch = { p: "Test model", state: "choosing", total: 2, chosen: 0, selection: null };
    const update = { baseRevision: 0, requestId: crypto.randomUUID(), batch };
    assert.equal((await app.run("/api/phone-batch", "alice", update)).status, 200);
    assert.equal((await app.run("/api/phone-batch", "alice", update)).status, 200);
    assert.equal((await app.run("/api/phone-batch", "alice", { ...update, requestId: crypto.randomUUID() })).status, 409);
    assert.equal((await (await app.run("/api/phone-batch", "bob")).json()).batch, null);
    assert.deepEqual((await (await app.run("/api/phone-batch", "alice")).json()).batch, batch);
    const phone = await app.run("/nfc.html");
    assert.equal(phone.status, 302);
    assert.equal(phone.headers.get("location"), "/sign-in?return_to=%2Fnfc.html");
  } finally { await app.postgres.close(); }
});

test("Netlify fails closed, constrains origins/redirects, and does not cache private pages", async () => {
  const app = await harness();
  try {
    assert.throws(() => appOrigins(""));
    assert.throws(() => appOrigins("https://studio.example/"));
    assert.throws(() => appOrigins("http://public.example"));
    assert.deepEqual(appOrigins(origin + ",http://localhost:8888"), [origin, "http://localhost:8888"]);
    assert.equal(returnPath("//evil.example"), "/");
    assert.equal(returnPath("/nfc.html"), "/nfc.html");
    assert.throws(() => clerkScripts('pk_test_"bad'));
    assert.equal((await serveNetlify(new Request("https://evil.example/api/library"), app.options)).status, 403);
    const broken = { ...app.options, authenticate: async () => { throw Error("secret-do-not-expose"); } };
    const failure = await serveNetlify(app.request("/api/library", "alice"), broken);
    assert.equal(failure.status, 503);
    assert(!(await failure.text()).includes("secret-do-not-expose"));
    const machine = { ...app.options, authenticate: async () => ({ isAuthenticated: true, tokenType: "m2m_token", headers: new Headers(), toAuth: () => ({ userId: "user_alice" }) }) };
    assert.equal((await serveNetlify(app.request("/api/library"), machine)).status, 401);
    const handshake = { ...app.options, authenticate: async () => ({ status: "handshake", headers: new Headers({ location: "https://clerk.example/handshake", "set-cookie": "example=value; Secure; HttpOnly" }) }) };
    assert.equal((await serveNetlify(app.request("/"), handshake)).status, 307);
    assert.equal((await serveNetlify(app.request("/api/library"), handshake)).status, 401);
  } finally { await app.postgres.close(); }
});
