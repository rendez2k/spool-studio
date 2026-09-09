import codec from "../out/nfc-codec.js";

function reply(value, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export function validateBatch(value) {
  if (!value || typeof value.p !== "string" || value.p.length > 80 || /[\u0000-\u001f]/.test(value.p)) throw Error("Invalid project name.");
  if (!Number.isInteger(value.total) || value.total < 0 || value.total > 64 || !Number.isInteger(value.chosen) || value.chosen < 0 || value.chosen > value.total) throw Error("Invalid colour counts.");
  const state = value.total === 0 ? "empty" : value.total > 4 ? "unsupported" : value.chosen < value.total ? "choosing" : "ready";
  if (value.state !== state && !(value.state === "unsupported" && value.total > 0)) throw Error("Invalid batch state.");
  const selection = value.state === "ready" ? codec.validate(value.selection) : null;
  if (selection && (selection.s.length !== value.total || selection.p !== value.p)) throw Error("Invalid selection.");
  return { p: value.p, state: value.state, total: value.total, chosen: value.chosen, selection };
}

function readBatch(database, userId) {
  return database.prepare("SELECT revision, payload, request_id, updated_at FROM phone_batches WHERE user_id = ?").bind(userId).first();
}

function stateOf(row) {
  return row ? { revision: row.revision, batch: JSON.parse(row.payload), updatedAt: row.updated_at } : { revision: 0, batch: null, updatedAt: null };
}

export async function boundedJson(request, maxBytes = 8192) {
  if (!request.body) throw Error("Missing batch.");
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maxBytes) { await reader.cancel(); throw Error("Request is too large."); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function handleBatch(request, env) {
  const userId = request.headers.get("oai-authenticated-user-id");
  if (!userId) return reply({ error: "Sign in with the same ChatGPT account on both devices." }, 401);
  if (!["GET", "PUT"].includes(request.method)) return reply({ error: "Method not allowed." }, 405);
  try {
    if (request.method === "GET") return reply(stateOf(await readBatch(env.DB, userId)));
    if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") return reply({ error: "Use this site's sync controls." }, 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "JSON required." }, 415);
    let input, batch;
    try {
      input = await boundedJson(request);
      if (!Number.isSafeInteger(input.baseRevision) || input.baseRevision < 0 || typeof input.requestId !== "string" || !/^[a-zA-Z0-9-]{16,64}$/.test(input.requestId)) throw Error("Invalid sync request.");
      batch = validateBatch(input.batch);
    } catch (error) { return reply({ error: error.message || "Invalid batch." }, 400); }
    const existing = await readBatch(env.DB, userId);
    const payload = JSON.stringify(batch);
    if (existing?.request_id === input.requestId) {
      if (existing.payload !== payload) return reply({ error: "Request already used." }, 409);
      return reply(stateOf(existing));
    }
    if ((existing?.revision || 0) !== input.baseRevision) return reply({ error: "A newer batch was saved on another desktop. Sync again to replace it." }, 409);
    const updatedAt = new Date().toISOString();
    const result = input.baseRevision === 0
      ? await env.DB.prepare("INSERT INTO phone_batches (user_id, revision, payload, request_id, updated_at) VALUES (?, 1, ?, ?, ?) ON CONFLICT(user_id) DO NOTHING").bind(userId, payload, input.requestId, updatedAt).run()
      : await env.DB.prepare("UPDATE phone_batches SET revision = revision + 1, payload = ?, request_id = ?, updated_at = ? WHERE user_id = ? AND revision = ?").bind(payload, input.requestId, updatedAt, userId, input.baseRevision).run();
    if (result.meta.changes !== 1) {
      const current = await readBatch(env.DB, userId);
      if (current?.request_id === input.requestId && current.payload === payload) return reply(stateOf(current));
      return reply({ error: "A newer batch was saved elsewhere. Sync again to replace it." }, 409);
    }
    return reply({ revision: input.baseRevision + 1, batch, updatedAt });
  } catch {
    console.error("Phone batch storage unavailable");
    return reply({ error: "Sync is temporarily unavailable. Your selection is still on this device." }, 503);
  }
}
