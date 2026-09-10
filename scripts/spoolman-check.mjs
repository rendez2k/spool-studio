import {pathToFileURL} from 'node:url';
import {jsonResponse} from './spoolman-bridge.mjs';

function localOrigin(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || value !== url.origin || url.username || url.password) throw Error('Use a local server origin with scheme and port, without paths or credentials.');
  return url.origin;
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
  return {
    printerReady: info.result.klippy_state === 'ready', nativeSpoolLink,
    spoolmanConnected: status.result.spoolman_connected, configuredSpoolman,
    checkedSpoolman: spoolmanOrigin, exactServerAddressMatch: configuredSpoolman === spoolmanOrigin,
    availableSpoolRecords: spools.length, activeSpoolId: status.result.spool_id ?? null,
    pendingReports: Array.isArray(status.result.pending_reports) ? status.result.pending_reports.length : null,
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
