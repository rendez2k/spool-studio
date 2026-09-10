import { boundedJson } from "./api.mjs";
import SpoolCatalog from "../out/spool-catalog.js";
import SpoolCost from '../out/cost-core.js';
import FilamentColours from '../out/colour-catalog.js';
import SpoolSetup from '../out/setup-core.js';
import {addReels, initialiseReels, updateReel, updateItemStatus, tokenHash} from './reels.mjs';
import {linkSpoolman} from './spoolman-mapping.mjs';

const materials = ["PLA", "PLA+", "PETG", "ABS", "ASA", "TPU", "PA", "PC", "PVA", "HIPS", "Other"];
const finishes = ["standard", "matte", "silk", "marble", "sparkle", "wood", "glow", "satin", "metal", "unknown"];
const json = (value, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });

function shortText(value, limit, name, required = true) {
  if (typeof value !== "string" || value.length > limit || /[\u0000-\u001f]/.test(value) || (required && !value.trim())) throw Error("Check " + name + ".");
  return value.trim();
}

export function validateSpool(input) {
  if (!input || typeof input !== "object") throw Error("Enter the spool details.");
  if(input.hexMode==='auto')input=FilamentColours.resolve(input);
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
  const optional = SpoolCost.fields(input);
  if(input.hexMode!==undefined){
    if(!['auto','manual'].includes(input.hexMode))throw Error('Choose automatic or custom colour.');
    optional.hexMode=input.hexMode;
  }
  if (input.barcode !== undefined) optional.barcode = SpoolCatalog.barcode(input.barcode);
  if (input.sourceUrl !== undefined) optional.sourceUrl = SpoolCatalog.sourceUrl(input.sourceUrl);
  return { brand, product, colour, notes, material: input.material, finish: input.finish, packaging: input.packaging, hex: input.hex.toUpperCase(), spools: input.spools, weightGrams: input.weightGrams, date: input.date, ...optional };
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
  return { status: "complete", items: data.items.map(FilamentColours.resolve), setup: SpoolSetup.preferences(data.setup), reels: data.reels ?? null, bridge: { enabled: Boolean(data.bridgeHash), lastSync: data.bridgeLastSync || null }, revision: row.revision, accountKey: userId, coverage: "Your private, account-synced filament inventory.", notice: "", updatedAt: row.updated_at };
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
      input = await boundedJson(request, 2000000);
      if (!Number.isSafeInteger(input.baseRevision) || input.baseRevision < 1 || typeof input.requestId !== "string" || !/^[a-zA-Z0-9-]{16,64}$/.test(input.requestId)) throw Error("Invalid library request.");
    } catch (error) { return json({ error: error.message }, 400); }
    if (input.kind === "import" && input.expectedAccountKey !== userId) return json({ error: "The signed-in account changed. Reopen the importer before saving." }, 409);
    if (['setup','bulk-edit','reel','initialise-reels','bridge-create','bridge-revoke','spoolman-mappings'].includes(input.kind) && input.expectedAccountKey !== userId) return json({error:'The signed-in account changed. Refresh before saving.'},409);
    const row = await getLibrary(env.DB, userId);
    if (row.request_id === input.requestId) return json(libraryView(row, userId));
    if (row.revision !== input.baseRevision) return json({ error: "Your library changed elsewhere. Refresh the library, then try again; your form has been kept." }, 409);
    const data = JSON.parse(row.payload);
    let bridgeToken;
    try {
      if (input.kind === 'setup') {
        SpoolSetup.update(data,input.setup);
      } else if (input.kind === 'bulk-edit') {
        const allowed = ['brand','product','material','finish','packaging','date','notes'];
        if (input.reviewed !== true || !Array.isArray(input.ids) || !input.ids.length || input.ids.length > 1000 || new Set(input.ids).size !== input.ids.length || input.ids.some(id => typeof id !== 'string')) throw Error('Review the selected entries before saving.');
        if (!input.patch || typeof input.patch !== 'object' || Array.isArray(input.patch) || !Object.keys(input.patch).length || Object.keys(input.patch).some(key => !allowed.includes(key))) throw Error('Choose supported fields to change. Counts, weights and spool IDs cannot be bulk edited.');
        const validated = validateSpool({brand:'Example',product:'PLA',material:'PLA',finish:'standard',packaging:'unknown',date:'2026-01-01',notes:'',colour:'White',hex:'#FFFFFF',spools:1,weightGrams:1000,...input.patch});
        const selected = input.ids.map(id => data.items.find(item => item.id === id));
        if (selected.some(item => !item)) throw Error('A selected entry is no longer in your library. Refresh and select again.');
        for (const item of selected) for (const key of Object.keys(input.patch)) item[key] = validated[key];
      } else if (input.kind === 'initialise-reels') {
        initialiseReels(data);
      } else if (input.kind === 'reel') {
        updateReel(data, input.reel);
      } else if (input.kind === 'spoolman-mappings') {
        if (input.reviewed !== true) throw Error('Review the Spoolman mappings before linking.');
        linkSpoolman(data, input.mappings);
      } else if (input.kind === 'bridge-create') {
        if (!Array.isArray(data.reels)) throw Error('Assign permanent spool IDs first.');
        bridgeToken = btoa(userId) + '.' + crypto.randomUUID() + crypto.randomUUID();
        data.bridgeHash = await tokenHash(bridgeToken); data.bridgeLastSequence = 0; data.bridgeLastSync = null;
      } else if (input.kind === 'bridge-revoke') {
        delete data.bridgeHash; delete data.bridgeLastSequence;
      } else if (input.kind === "import") {
        if (input.reviewed !== true || !Array.isArray(input.spools) || input.spools.length < 1 || input.spools.length > 500 || !/^[a-f0-9]{64}$/.test(input.sourceHash || "")) throw Error("Review 1–500 filament entries before importing.");
        if ((data.importHashes || []).includes(input.sourceHash)) return json({ error: "This source was already imported. Check your library before adding it again." }, 409);
        if (data.items.length + input.spools.length > 1000) throw Error("This import would exceed the 1000-entry library limit.");
        const imported = input.spools.map((spool, index) => {
          try { return validateSpool(spool); }
          catch (error) { error.entryIndex = index; throw error; }
        });
        const addedAt = new Date().toISOString();
        data.items.push(...imported.map((fields, index) => ({ ...fields, addedAt, id: "spool-" + input.requestId + "-" + index, quantity: fields.spools, form: fields.packaging, sourceProduct: "", retailer: "Reviewed import", order: "", messageId: "", lineTotal: null, currency: "", used: false })));
        for (const item of data.items.slice(-imported.length)) addReels(data, item);
        data.importHashes = [...(data.importHashes || []), input.sourceHash];
      } else if (input.kind === "add" || input.kind === "edit") {
        const fields = validateSpool(input.spool);
        if (input.kind === "add") {
          if (data.items.length >= 1000) throw Error("This library has reached its 1000-entry limit.");
          data.items.push({ ...fields, addedAt: new Date().toISOString(), id: "spool-" + input.requestId, quantity: fields.spools, form: fields.packaging, sourceProduct: "", retailer: "Added manually", order: "", messageId: "", lineTotal: null, currency: "", used: false });
          addReels(data, data.items.at(-1));
        } else {
          const item = data.items.find(item => item.id === input.id);
          if (!item) return json({ error: "Spool not found in your library." }, 404);
          if (Array.isArray(data.reels)) {
            const existing = data.reels.filter(reel => reel.itemId === item.id).length;
            if (existing && (fields.spools === null || fields.spools < existing)) throw Error('This entry has permanent spool IDs. Mark individual reels used instead of reducing its original roll count.');
            if (fields.spools !== null && fields.spools > existing) addReels(data, {...item, used: false}, fields.spools - existing);
          }
          if(input.spool.hexMode===undefined){
            const previous=FilamentColours.resolve(item);
            fields.hexMode=fields.hex!==previous.hex?'manual':previous.hexMode||'manual';
          }
          Object.assign(item, fields);
          if (data.reels) updateItemStatus(data, item.id);
        }
      } else if (input.kind === "usage") {
        if (!Array.isArray(input.changes) || input.changes.length < 1 || input.changes.length > 1000 || input.changes.some(change => !change || typeof change.id !== "string" || typeof change.used !== "boolean")) throw Error("Invalid used marks.");
        for (const change of input.changes) {
          const item = data.items.find(item => item.id === change.id);
          if (!item) return json({ error: "Spool not found in your library." }, 404);
          item.used = change.used;
          if (data.reels) {
            const owned = data.reels.filter(reel => reel.itemId === item.id);
            if (change.reelStates !== undefined && (!Array.isArray(change.reelStates) || change.reelStates.length !== owned.length || new Set(change.reelStates.map(state => state.id)).size !== owned.length || change.reelStates.some(state => typeof state.used !== 'boolean' || !owned.some(reel => reel.id === state.id)))) throw Error('Invalid individual spool states.');
            for (const reel of owned) reel.used = change.reelStates ? change.reelStates.find(state => state.id === reel.id).used : change.used;
            updateItemStatus(data, item.id);
          }
        }
      } else throw Error("Unknown library action.");
    } catch (error) { return json({ error: error.message, ...(Number.isInteger(error.entryIndex) ? { entryIndex: error.entryIndex } : {}) }, 400); }
    const updatedAt = new Date().toISOString();
    const payload = JSON.stringify(data);
    if (new TextEncoder().encode(payload).length > 8000000) return json({error:'This library exceeds the 8 MB storage limit.'},400);
    const result = await env.DB.prepare("UPDATE libraries SET revision = revision + 1, payload = ?, request_id = ?, updated_at = ? WHERE user_id = ? AND revision = ?").bind(payload, input.requestId, updatedAt, userId, input.baseRevision).run();
    if (result.meta.changes !== 1) return json({ error: "Your library changed elsewhere. Refresh and try again." }, 409);
    return json({ ...libraryView({ revision: row.revision + 1, payload, updated_at: updatedAt }, userId), ...(bridgeToken ? {bridgeToken} : {}) });
  } catch {
    console.error("Library storage unavailable");
    return json({ error: "Your library is temporarily unavailable. Your changes have not been confirmed." }, 503);
  }
}
