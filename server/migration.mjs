import { createHash } from "node:crypto";
import { validateBatch } from "./api.mjs";

export function inspectMigration(sourceText) {
  if (Buffer.byteLength(sourceText, "utf8") > 2000000) throw Error("Migration snapshot is too large.");
  const snapshot = JSON.parse(sourceText);
  if (snapshot.format !== "spool-studio-migration-v1" || snapshot.source?.origin !== "https://filament-library.redwards2k.chatgpt.site" || typeof snapshot.source?.accountKey !== "string" || !snapshot.source.accountKey || !Number.isFinite(Date.parse(snapshot.source.exportedAt))) throw Error("Use a verified live Filament Library snapshot, not a CSV or bundled seed.");
  const library = snapshot.library;
  if (!Number.isSafeInteger(library?.revision) || library.revision < 1 || typeof library.payload !== "string") throw Error("Missing live library revision/payload.");
  const payload = JSON.parse(library.payload);
  if (!Array.isArray(payload.items) || payload.items.length > 1000) throw Error("Invalid library items.");
  const identities = new Set();
  for (const item of payload.items) {
    if (!item || typeof item.id !== "string" || !item.id || identities.has(item.id) || typeof item.colour !== "string" || (item.used !== undefined && typeof item.used !== "boolean")) throw Error("Invalid or duplicate spool identity.");
    identities.add(item.id);
  }
  if (snapshot.phoneBatch !== null && snapshot.phoneBatch !== undefined) {
    if (typeof snapshot.phoneBatch.payload !== "string") throw Error("Invalid phone snapshot.");
    validateBatch(JSON.parse(snapshot.phoneBatch.payload));
  }
  return {
    snapshot,
    hash: createHash("sha256").update(sourceText).digest("hex"),
    summary: { entries: payload.items.length, usedEntries: payload.items.filter(item => item.used).length, availableEntries: payload.items.filter(item => !item.used).length, sourceRevision: library.revision, exportedAt: snapshot.source.exportedAt },
  };
}

export async function migrateIntoEmptyAccount(client, inspection, targetUserId) {
  if (!/^user_[A-Za-z0-9]+$/.test(targetUserId)) throw Error("A verified Clerk user ID is required.");
  const { snapshot, hash } = inspection;
  const now = new Date().toISOString();
  await client.query("BEGIN");
  try {
    await client.query("INSERT INTO libraries (user_id, revision, payload, request_id, updated_at) VALUES ($1, 1, $2, '', $3) ON CONFLICT(user_id) DO NOTHING", [targetUserId, '{"items":[]}', now]);
    const { rows } = await client.query("SELECT revision, payload, request_id FROM libraries WHERE user_id = $1 FOR UPDATE", [targetUserId]);
    const target = rows[0];
    if (target.request_id === "migration-" + hash) {
      await client.query("COMMIT");
      return { migrated: false, alreadyImported: true };
    }
    const existing = JSON.parse(target.payload);
    if (target.revision !== 1 || target.request_id || existing.items?.length !== 0 || Object.keys(existing).some(key => key !== "items")) throw Error("Destination must be a new, empty library. No existing inventory will be overwritten.");
    const phone = await client.query("SELECT user_id FROM phone_batches WHERE user_id = $1", [targetUserId]);
    if (phone.rows.length) throw Error("Destination already has a phone batch. Review it before migration.");
    if (snapshot.phoneBatch) await client.query("INSERT INTO phone_batches (user_id, revision, payload, request_id, updated_at) VALUES ($1, 1, $2, $3, $4)", [targetUserId, snapshot.phoneBatch.payload, "migration-" + hash, now]);
    await client.query("UPDATE libraries SET revision = 2, payload = $1, request_id = $2, updated_at = $3 WHERE user_id = $4", [snapshot.library.payload, "migration-" + hash, now, targetUserId]);
    const verification = await client.query("SELECT payload FROM libraries WHERE user_id = $1", [targetUserId]);
    if (verification.rows[0].payload !== snapshot.library.payload) throw Error("Migration verification failed.");
    await client.query("COMMIT");
    return { migrated: true, alreadyImported: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
