import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { inspectMigration, migrateIntoEmptyAccount } from "../server/migration.mjs";

function source(overrides = {}) {
  return JSON.stringify({
    format: "spool-studio-migration-v1",
    source: { origin: "https://filament-library.redwards2k.chatgpt.site", accountKey: "test-source", exportedAt: "2026-09-10T12:00:00Z" },
    library: { revision: 12, payload: JSON.stringify({ items: [{ id: "existing-roll", colour: "Orange", used: true, customField: "preserve-me" }, { id: "other-roll", colour: "White", used: false }], importHashes: ["a".repeat(64)] }) },
    phoneBatch: null,
    ...overrides,
  });
}

test("migration preserves exact payload, IDs and used state, retries safely and never replaces edited stock", async () => {
  const database = new PGlite();
  try {
    await database.exec(await readFile("netlify/database/migrations/001_create-inventory/migration.sql", "utf8"));
    const inspection = inspectMigration(source());
    assert.equal(inspection.summary.entries, 2);
    assert.equal(inspection.summary.usedEntries, 1);
    assert.deepEqual(await migrateIntoEmptyAccount(database, inspection, "user_destination"), { migrated: true, alreadyImported: false });
    let row = (await database.query("SELECT * FROM libraries WHERE user_id = $1", ["user_destination"])).rows[0];
    assert.equal(row.payload, inspection.snapshot.library.payload);
    assert.equal(row.revision, 2);
    assert.deepEqual(await migrateIntoEmptyAccount(database, inspection, "user_destination"), { migrated: false, alreadyImported: true });
    await database.query("UPDATE libraries SET revision = 3, request_id = 'later-edit' WHERE user_id = $1", ["user_destination"]);
    await assert.rejects(migrateIntoEmptyAccount(database, inspection, "user_destination"), /new, empty library/);
    row = (await database.query("SELECT * FROM libraries WHERE user_id = $1", ["user_destination"])).rows[0];
    assert.equal(row.revision, 3);
    await assert.rejects(migrateIntoEmptyAccount(database, inspection, "not-a-clerk-user"), /verified Clerk/);
  } finally { await database.close(); }
});

test("migration rejects incompatible snapshots and rolls back if destination phone data exists", async () => {
  assert.throws(() => inspectMigration(source({ format: "csv" })), /verified live/);
  assert.throws(() => inspectMigration(source({ library: { revision: 2, payload: '{"items":[{"id":"same","colour":"Red"},{"id":"same","colour":"Blue"}]}' } })), /duplicate/);
  assert.throws(() => inspectMigration(source({ phoneBatch: { payload: '{"state":"bogus"}' } })));
  const database = new PGlite();
  try {
    await database.exec(await readFile("netlify/database/migrations/001_create-inventory/migration.sql", "utf8"));
    await database.query("INSERT INTO phone_batches VALUES ($1, 1, $2, 'phone-saved', 'now')", ["user_busy", '{"state":"empty"}']);
    await assert.rejects(migrateIntoEmptyAccount(database, inspectMigration(source()), "user_busy"), /phone batch/);
    assert.equal((await database.query("SELECT * FROM libraries")).rows.length, 0);
    assert.equal((await database.query("SELECT * FROM phone_batches")).rows.length, 1);
  } finally { await database.close(); }
});
