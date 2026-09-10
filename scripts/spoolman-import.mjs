import {readFile, open, unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {jsonResponse} from './spoolman-bridge.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const positiveId = value => Number.isSafeInteger(value) && value > 0;
function text(value, maximum) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000-\u001f]/.test(value)) throw Error('Check the exported filament text fields.');
  return value.trim();
}
export function prepareTransfer(input, assumeFull = false) {
  if (input?.format !== 'spool-studio-spoolman-v1' || typeof input.accountKey !== 'string' || !input.accountKey || !Array.isArray(input.spools) || !input.spools.length || input.spools.length > 5000) throw Error('Use a physical-spool transfer exported by Spool Studio.');
  const origin = new URL(input.origin), local = new URL(input.spoolmanUrl);
  if (origin.protocol !== 'https:' || origin.origin !== input.origin || origin.username || origin.password) throw Error('The source must be a Spool Studio HTTPS origin.');
  if (!['http:', 'https:'].includes(local.protocol) || local.origin !== input.spoolmanUrl || local.username || local.password) throw Error('Use the origin of your local Spoolman server, without paths or credentials.');
  const ids = new Set(), mapped = new Set();
  const spools = input.spools.map(spool => {
    if (!spool || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(spool.reelId) || ids.has(spool.reelId) || !positiveId(spool.number)) throw Error('The transfer contains invalid or duplicate permanent IDs.');
    ids.add(spool.reelId);
    if (spool.spoolmanId !== null && (!positiveId(spool.spoolmanId) || mapped.has(spool.spoolmanId))) throw Error('The transfer contains invalid or duplicate Spoolman links.');
    if (spool.spoolmanId) mapped.add(spool.spoolmanId);
    const material = text(spool.material, 64), profile = input.materials?.[material];
    if (!profile || !Number.isFinite(profile.density) || profile.density < 0.01 || profile.density > 10 || !Number.isFinite(profile.diameter) || profile.diameter < 0.5 || profile.diameter > 5) throw Error('Set the confirmed density (g/cm³) and diameter (mm) for ' + material + ' in the transfer file. No defaults are assumed.');
    if (!Number.isFinite(spool.weightGrams) || spool.weightGrams <= 0 || spool.weightGrams > 10000) throw Error('Confirm the initial net filament grams for SP-' + spool.number + '.');
    const remaining = spool.remainingGrams === null && assumeFull ? spool.weightGrams : spool.remainingGrams;
    if (!Number.isFinite(remaining) || remaining < 0 || remaining > spool.weightGrams) throw Error('Confirm remaining grams for SP-' + spool.number + '. Use --assume-full only if every unmeasured reel in this export is full.');
    if (!/^#[a-f0-9]{6}$/i.test(spool.hex)) throw Error('Confirm the exported colour hex.');
    const brand = text(spool.brand, 80), product = text(spool.product, 100), colour = text(spool.colour, 80), finish = text(spool.finish, 32);
    const filamentKey = hash([input.origin, input.accountKey, brand, product, colour, finish, material, spool.hex.toUpperCase(), spool.weightGrams, profile.density, profile.diameter]);
    return {id: spool.reelId, number: spool.number, spoolmanId: spool.spoolmanId, brand, filamentKey, filament: {name: (product + ' · ' + colour).slice(0, 64), material, density: profile.density, diameter: profile.diameter, weight: spool.weightGrams, color_hex: spool.hex.slice(1).toUpperCase(), comment: 'Spool Studio filament ' + filamentKey + '\n' + product + ' · ' + colour + ' · ' + finish}, spool: {initial_weight: spool.weightGrams, remaining_weight: remaining, comment: 'Spool Studio reel ' + spool.reelId + '\nSP-' + String(spool.number).padStart(5, '0'), archived: false}};
  });
  return {origin: input.origin, accountKey: input.accountKey, spoolmanUrl: local.origin, spools};
}

export async function importSpools(input, {apply = false, assumeFull = false, transport = fetch} = {}) {
  const plan = prepareTransfer(input, assumeFull);
  async function api(route, body) {
    const response = await transport(plan.spoolmanUrl + '/api/v1/' + route, {method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(15000), headers: {'Content-Type': 'application/json', Accept: 'application/json'}, ...(body ? {body: JSON.stringify(body)} : {})});
    return jsonResponse(response, 15000000);
  }
  const [spools, filaments, vendors] = await Promise.all([api('spool?allow_archived=true'), api('filament'), api('vendor')]);
  for (const records of [spools, filaments, vendors]) if (!Array.isArray(records) || records.length > 20000 || records.some(record => !positiveId(record.id))) throw Error('Spoolman returned an invalid catalogue.');
  const byComment = (records, marker) => {
    const matches = records.filter(record => record.comment?.split('\n')[0] === marker);
    if (matches.length > 1) throw Error('Duplicate Spool Studio markers in Spoolman. Resolve those before retrying.');
    return matches[0];
  };
  const existing = new Map();
  for (const reel of plan.spools) {
    const marked = byComment(spools, 'Spool Studio reel ' + reel.id);
    const linked = reel.spoolmanId ? spools.find(spool => spool.id === reel.spoolmanId) : marked;
    if (reel.spoolmanId && (!linked || marked && marked.id !== linked.id)) throw Error('An existing Spoolman link is missing or conflicts. Resolve the link before importing.');
    existing.set(reel.id, linked);
    byComment(filaments, 'Spool Studio filament ' + reel.filamentKey);
  }
  const create = [...existing.values()].filter(value => !value).length;
  if (!apply) return {dryRun: true, create, reuse: plan.spools.length - create, total: plan.spools.length};
  const mappings = [];
  for (const reel of plan.spools) {
    let spool = existing.get(reel.id);
    if (!spool) {
      let filament = byComment(filaments, 'Spool Studio filament ' + reel.filamentKey);
      if (!filament) {
        const vendorMarker = 'Spool Studio vendor ' + hash(reel.brand);
        let vendor = byComment(vendors, vendorMarker) || vendors.find(value => value.name === reel.brand);
        if (!vendor) {vendor = await api('vendor', {name: reel.brand.slice(0, 64), comment: vendorMarker + '\n' + reel.brand}); if (!positiveId(vendor.id)) throw Error('Spoolman did not confirm vendor creation.'); vendors.push(vendor);}
        filament = await api('filament', {...reel.filament, vendor_id: vendor.id});
        if (!positiveId(filament.id)) throw Error('Spoolman did not confirm filament creation.');
        filaments.push(filament);
      }
      spool = await api('spool', {...reel.spool, filament_id: filament.id});
      if (!positiveId(spool.id)) throw Error('Spoolman did not confirm spool creation.');
      spools.push(spool);
    }
    mappings.push({id: reel.id, spoolmanId: spool.id});
  }
  return {format: 'spool-studio-mappings-v1', origin: plan.origin, accountKey: plan.accountKey, mappings};
}

async function main() {
  const args = process.argv.slice(2), filename = args[0], apply = args.includes('--apply');
  if (!filename || filename.startsWith('--') || args.slice(1).some(value => !['--apply', '--assume-full'].includes(value))) throw Error('Usage: node scripts/spoolman-import.mjs transfer.private.json [--assume-full] [--apply]');
  const source = await readFile(filename, 'utf8');
  if (Buffer.byteLength(source) > 5000000) throw Error('Transfer file exceeds 5 MB.');
  const input = JSON.parse(source), plan = prepareTransfer(input, args.includes('--assume-full'));
  const lockPath = path.join(tmpdir(), 'spool-studio-import-' + hash(plan.spoolmanUrl) + '.lock');
  let lock;
  try {lock = await open(lockPath, 'wx', 0o600);} catch {throw Error('Another import may be running. Do not run simultaneous imports against this Spoolman server.');}
  let output;
  try {
    const outputPath = path.resolve(path.dirname(filename), 'spoolman-mappings-' + Date.now() + '.private.json');
    if (apply) output = await open(outputPath, 'wx', 0o600);
    const result = await importSpools(input, {apply, assumeFull: args.includes('--assume-full')});
    if (apply) {await output.writeFile(JSON.stringify(result, null, 2)); console.log('Import complete. Review and import mappings in Physical spools: ' + outputPath);}
    else console.log('Dry run: ' + result.create + ' new spools, ' + result.reuse + ' existing links. Nothing written. Review the file, back up Spoolman, then repeat with --apply.');
  } finally {await output?.close(); await lock.close(); await unlink(lockPath);}
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main().catch(error => {console.error(error.message + ' If a write failed, stop and inspect Spoolman before retrying; created records are retained, not rolled back.'); process.exitCode = 1;});
