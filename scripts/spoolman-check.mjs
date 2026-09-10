import {pathToFileURL} from 'node:url';
import {jsonResponse} from './spoolman-bridge.mjs';

function localOrigin(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || value !== url.origin || url.username || url.password) throw Error('Use a local server origin with scheme and port, without paths or credentials.');
  return url.origin;
}

export function toolMapping(status, spools) {
  const ids = status?.print_task_config?.filament_spool_id;
  if (!Array.isArray(ids) || ids.length !== 4 || ids.some(id => !Number.isSafeInteger(id) || id < 0)) throw Error('Per-tool spool IDs are unavailable.');
  const seen = new Set(), warnings = [];
  const tools = ids.map((id, channel) => {
    const record = id > 0 ? spools.find(spool => spool.id === id) : null;
    const present = status.print_task_config.filament_exist?.[channel];
    const tag = status.filament_detect?.info?.[channel]?.CARD_UID;
    if (id > 0 && seen.has(id)) warnings.push('Spoolman ID ' + id + ' is assigned to more than one tool. Confirm each physical reel.');
    if (id > 0) seen.add(id);
    if (id > 0 && !record) warnings.push('Tool ' + (channel + 1) + ' references a record absent from the checked Spoolman server.');
    if (present === true && id === 0) warnings.push('Tool ' + (channel + 1) + ' reports filament but has no Spoolman assignment.');
    const weight = record?.remaining_weight;
    return {
      tool: channel + 1, channel, spoolmanId: id || null,
      recordFound: id > 0 ? Boolean(record) : null,
      filamentPresent: typeof present === 'boolean' ? present : null,
      tagDetected: Array.isArray(tag) ? tag.length > 0 : null,
      remainingGrams: Number.isFinite(weight) && weight >= 0 ? weight : null,
    };
  });
  return {available: true, tools, warnings};
}
export async function checkSpoolman(printer, spoolman, transport = fetch) {
  const printerOrigin = localOrigin(printer), spoolmanOrigin = localOrigin(spoolman);
  const get = async (origin, route) => jsonResponse(await transport(origin + route, {method: 'GET', redirect: 'error', signal: AbortSignal.timeout(12000), headers: {Accept: 'application/json'}}), 15000000);
  const [info, status, config, spools] = await Promise.all([
    get(printerOrigin, '/server/info'), get(printerOrigin, '/server/spoolman/status'), get(printerOrigin, '/server/config'), get(spoolmanOrigin, '/api/v1/spool'),
  ]);
  if (!Array.isArray(info.result?.components) || !status.result || typeof status.result.spoolman_connected !== 'boolean' || !config.result?.config || !Array.isArray(spools)) throw Error('The servers returned an unexpected diagnostic response.');
  const nativeSpoolLink = info.result.components.includes('spoollink');
  const server = config.result.config.spoolman?.server;
  const configuredSpoolman = typeof server === 'string' ? localOrigin(server) : null;
  let mapping = {available: false, tools: [], warnings: ['Per-tool status requires the supported U1 SpoolLink fields.']};
  if (nativeSpoolLink) {
    try {
      const query = await get(printerOrigin, '/printer/objects/query?print_task_config=filament_spool_id,filament_exist&filament_detect=info');
      mapping = toolMapping(query.result?.status, spools);
    } catch {
      mapping = {available: false, tools: [], warnings: ['Could not read per-tool assignments. Check Filament Manager; do not assume the tools are unassigned.']};
    }
  }
  return {
    printerReady: info.result.klippy_state === 'ready', nativeSpoolLink,
    spoolmanConnected: status.result.spoolman_connected, configuredSpoolman,
    checkedSpoolman: spoolmanOrigin, exactServerAddressMatch: configuredSpoolman === spoolmanOrigin,
    availableSpoolRecords: spools.length, activeSpoolId: status.result.spool_id ?? null,
    pendingReports: Array.isArray(status.result.pending_reports) ? status.result.pending_reports.length : null,
    toolMapping: mapping,
    nextStep: !spools.length ? 'Create or transfer physical spool records, then confirm each loaded reel-to-tool link.' : nativeSpoolLink ? 'Use the built-in SpoolLink integration. Do not layer older multi-tool macros over it. Verify each tool with a supervised print.' : 'Verify a compatible per-tool printer integration before relying on consumption tracking.',
    limitation: 'Read-only connectivity check, not proof of consumption accuracy. Active spool is not a complete tool mapping; different server addresses may be aliases of the same host.',
  };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  (async () => {
    if (args.length !== 2) throw Error('Usage: node scripts/spoolman-check.mjs http://printer-address http://spoolman-address:7912');
    console.log(JSON.stringify(await checkSpoolman(...args), null, 2));
  })().catch(error => {console.error(error.message); process.exitCode = 1;});
}
