import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = relative => readFileSync(new URL("../" + relative, import.meta.url), "utf8");

test("public source has no owner bootstrap or hardcoded phone destination", () => {
  assert.equal(existsSync(new URL("../server/legacy-inventory.json", import.meta.url)), false);
  assert.equal(existsSync(new URL("../out/previews", import.meta.url)), false);
  assert.doesNotMatch(read("server/library.mjs"), /ownerUserId|legacyOwner|legacy-inventory/);
  assert.doesNotMatch(read("out/library.js"), /legacyOwner|legacyUsageImported|import-used/);
  assert.doesNotMatch(read("out/index.html"), /https:\/\/[^'"]+\.chatgpt\.site/);
  assert.match(read("out/index.html"), /const base=location.href/);
  assert.match(read("out/index.html"), /Open your hosted HTTPS library/);
  assert.match(read(".gitignore"), /\.openai\/hosting\.json/);
  const manifest = JSON.parse(read(".openai/hosting.example.json"));
  assert.equal(manifest.project_id, null);
  assert.equal(manifest.d1, "DB");
});
