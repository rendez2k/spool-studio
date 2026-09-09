import { boundedJson } from "./api.mjs";

const materials = ["PLA", "PLA+", "PETG", "ABS", "ASA", "TPU", "PA", "PC", "PVA", "HIPS", "Other"];
const finishes = ["standard", "matte", "silk", "marble", "sparkle", "wood", "glow", "satin", "metal", "unknown"];
const json = (value, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });

function shortText(value, limit, name, required = true) {
  if (typeof value !== "string" || value.length > limit || /[\u0000-\u001f]/.test(value) || (required && !value.trim())) throw Error("Check " + name + ".");
  return value.trim();
}

export function validateSpool(input) {
  if (!input || typeof input !== "object") throw Error("Enter the spool details.");
  const brand = shortText(input.brand, 80, "brand");
  const product = shortText(input.product, 100, "filament type");
  const colour = shortText(input.colour, 80, "colour name");
  const notes = shortText(input.notes ?? "", 500, "notes", false);
  if (!materials.includes(input.material) || !finishes.includes(input.finish)) throw Error("Choose a material and finish.");
  if (!["spooled", "refill", "unknown"].includes(input.packaging)) throw Error("Choose the packaging.");
  if (typeof input.hex !== "string" || !/^#[\da-f]{6}$/i.test(input.hex)) throw Error("Enter a six-digit colour hex.");
  if (input.spools !== null && (!Number.isInteger(input.spools) || input.spools < 1 || input.spools > 500)) throw Error("Enter 1–500 rolls, or leave it blank if unknown.");
  if (input.weightGrams !== null && (!Number.isInteger(input.weightGrams) || input.weightGrams < 1 || input.weightGrams > 10000)) throw Error("Enter 1–10000 grams per roll, or leave it blank.");
  if (typeof input.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(Date.parse(input.date)) || new Date(input.date).toISOString().slice(0, 10) !== input.date) throw Error("Choose a valid date.");
  return { brand, product, colour, notes, material: input.material, finish: input.finish, packaging: input.packaging, hex: input.hex.toUpperCase(), spools: input.spools, weightGrams: input.weightGrams, date: input.date };
}

function findLibrary(database, userId) {
  return database.prepare("SELECT revision, payload, request_id, updated_at FROM libraries WHERE user_id = ?").bind(userId).first();
}

export async function getLibrary(database, userId) {
  let row = await findLibrary(database, userId);
  if (!row) {
    const initial = { items: [] };
    await database.prepare("INSERT INTO libraries (user_id, revision, payload, request_id, updated_at) VALUES (?, 1, ?, '', ?) ON CONFLICT(user_id) DO NOTHING").bind(userId, JSON.stringify(initial), new Date().toISOString()).run();
    row = await findLibrary(database, userId);
  }
  return row;
}

export function libraryView(row, userId) {
  const data = JSON.parse(row.payload);
  return { status: "complete", items: data.items, revision: row.revision, accountKey: userId, coverage: "Your private, account-synced filament inventory.", notice: "", updatedAt: row.updated_at };
}

export async function handleLibrary(request, env) {
  const userId = request.headers.get("oai-authenticated-user-id");
  if (!userId) return json({ error: "Sign in to manage your filament library." }, 401);
  if (!["GET", "POST"].includes(request.method)) return json({ error: "Method not allowed." }, 405);
  if (request.method === "POST" && (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site")) return json({ error: "Use this site's library controls." }, 403);
  try {
    if (request.method === "GET") return json(libraryView(await getLibrary(env.DB, userId), userId));
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "JSON required." }, 415);
    let input;
    try {
      input = await boundedJson(request, 128000);
      if (!Number.isSafeInteger(input.baseRevision) || input.baseRevision < 1 || typeof input.requestId !== "string" || !/^[a-zA-Z0-9-]{16,64}$/.test(input.requestId)) throw Error("Invalid library request.");
    } catch (error) { return json({ error: error.message }, 400); }
    const row = await getLibrary(env.DB, userId);
    if (row.request_id === input.requestId) return json(libraryView(row, userId));
    if (row.revision !== input.baseRevision) return json({ error: "Your library changed elsewhere. Refresh the library, then try again; your form has been kept." }, 409);
    const data = JSON.parse(row.payload);
    try {
      if (input.kind === "add" || input.kind === "edit") {
        const fields = validateSpool(input.spool);
        if (input.kind === "add") {
          if (data.items.length >= 1000) throw Error("This library has reached its 1000-entry limit.");
          data.items.push({ ...fields, id: "spool-" + input.requestId, quantity: fields.spools, form: fields.packaging, sourceProduct: "", retailer: "Added manually", order: "", messageId: "", lineTotal: null, currency: "", used: false });
        } else {
          const item = data.items.find(item => item.id === input.id);
          if (!item) return json({ error: "Spool not found in your library." }, 404);
          Object.assign(item, fields);
        }
      } else if (input.kind === "usage") {
        if (!Array.isArray(input.changes) || input.changes.length < 1 || input.changes.length > 1000 || input.changes.some(change => !change || typeof change.id !== "string" || typeof change.used !== "boolean")) throw Error("Invalid used marks.");
        for (const change of input.changes) {
          const item = data.items.find(item => item.id === change.id);
          if (!item) return json({ error: "Spool not found in your library." }, 404);
          item.used = change.used;
        }
      } else throw Error("Unknown library action.");
    } catch (error) { return json({ error: error.message }, 400); }
    const updatedAt = new Date().toISOString();
    const payload = JSON.stringify(data);
    const result = await env.DB.prepare("UPDATE libraries SET revision = revision + 1, payload = ?, request_id = ?, updated_at = ? WHERE user_id = ? AND revision = ?").bind(payload, input.requestId, updatedAt, userId, input.baseRevision).run();
    if (result.meta.changes !== 1) return json({ error: "Your library changed elsewhere. Refresh and try again." }, 409);
    return json(libraryView({ revision: row.revision + 1, payload, updated_at: updatedAt }, userId));
  } catch {
    console.error("Library storage unavailable");
    return json({ error: "Your library is temporarily unavailable. Your changes have not been confirmed." }, 503);
  }
}
