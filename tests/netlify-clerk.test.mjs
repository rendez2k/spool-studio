import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { createClerkClient } from "@clerk/backend";
import { serveNetlify } from "../server/netlify-app.mjs";

test("real Clerk verification rejects forged/expired/wrong-origin JWTs before touching storage", async () => {
  const origin = "https://studio.example";
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwtKey = publicKey.export({ type: "spki", format: "pem" });
  const publishableKey = "pk_test_" + Buffer.from("clerk.example$").toString("base64").replaceAll("=", "");
  const clerk = createClerkClient({ publishableKey, secretKey: "sk_test_synthetic_not_a_credential", jwtKey, telemetry: { disabled: true } });
  const now = Math.floor(Date.now() / 1000);
  function token(overrides = {}, signingKey = privateKey) {
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test" })).toString("base64url");
    const claims = Buffer.from(JSON.stringify({ sub: "user_test", sid: "sess_test", iss: "https://clerk.example", azp: origin, iat: now, nbf: now - 10, exp: now + 60, ...overrides })).toString("base64url");
    const unsigned = header + "." + claims;
    return unsigned + "." + sign("RSA-SHA256", Buffer.from(unsigned), signingKey).toString("base64url");
  }
  const request = value => new Request(origin + "/api/library", { headers: { authorization: "Bearer " + value, "oai-authenticated-user-id": "user_victim" } });
  const valid = await clerk.authenticateRequest(request(token()), { authorizedParties: [origin], acceptsToken: "session_token" });
  assert.equal(valid.isAuthenticated, true);
  assert.equal(valid.toAuth().userId, "user_test");
  const otherKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  let storageReads = 0;
  for (const invalid of [token({ azp: "https://evil.example" }), token({ exp: now - 60 }), token({}, otherKey)]) {
    const response = await serveNetlify(request(invalid), {
      publishableKey, origins: [origin], authenticate: (incoming, options) => clerk.authenticateRequest(incoming, options),
      database: () => { storageReads++; throw Error("Must not read storage"); }, readPage: async () => "",
    });
    assert.equal(response.status, 401);
  }
  assert.equal(storageReads, 0);
});
