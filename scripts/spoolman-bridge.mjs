import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';

export function configuration(value) {
  const origin = new URL(value.origin);
  const spoolman = new URL(value.spoolmanUrl);
  if (origin.protocol !== 'https:' || origin.origin !== value.origin || origin.username || origin.password) throw Error('Use the HTTPS origin of your Spool Studio site.');
  if (!['http:', 'https:'].includes(spoolman.protocol) || spoolman.username || spoolman.password || spoolman.search || spoolman.hash || spoolman.pathname !== '/') throw Error('Use the origin of your local Spoolman server, without a path or credentials.');
  if (typeof value.token !== 'string' || !/^[A-Za-z0-9+/=]+\.[a-f0-9-]{72}$/.test(value.token)) throw Error('Download a new private bridge configuration from Physical spools.');
  return {origin: origin.origin, spoolmanUrl: spoolman.origin, token: value.token};
}

export async function jsonResponse(response, limit) {
  if (!response.ok) throw Error('Request failed (' + response.status + ').');
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw Error('Response exceeds the bridge size limit.');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function syncOnce(value, transport = fetch, now = Date.now) {
  const config = configuration(value);
  const spools = await jsonResponse(await transport(config.spoolmanUrl + '/api/v1/spool', {redirect: 'error', signal: AbortSignal.timeout(15000), headers: {Accept: 'application/json'}}), 5000000);
  if (!Array.isArray(spools) || spools.length > 5000) throw Error('Expected up to 5000 Spoolman records.');
  const weights = spools.map(spool => {
    if (!Number.isSafeInteger(spool.id) || spool.id < 1 || spool.remaining_weight !== null && spool.remaining_weight !== undefined && (!Number.isFinite(spool.remaining_weight) || spool.remaining_weight < 0 || spool.remaining_weight > 10000)) throw Error('Spoolman returned an invalid weight or ID. No snapshot was sent.');
    return {id: spool.id, remainingGrams: spool.remaining_weight ?? null};
  });
  const result = await jsonResponse(await transport(config.origin + '/api/spoolman-sync', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + config.token},
    body: JSON.stringify({sequence: now(), spools: weights})
  }), 10000);
  return {updated: result.updated ?? 0, ignored: Boolean(result.ignored), empty: weights.length === 0};
}

async function main() {
  const args = process.argv.slice(2), filename = args.find(value => !value.startsWith('--'));
  if (!filename || args.some(value => value.startsWith('--') && value !== '--once')) throw Error('Usage: node scripts/spoolman-bridge.mjs path/to/spool-studio-bridge.private.json [--once]');
  const config = configuration(JSON.parse(await readFile(filename, 'utf8')));
  do {
    try {
      const result = await syncOnce(config);
      console.log(result.empty ? 'Spoolman is empty. Create matching spool records and link their IDs before consumption can sync.' : result.updated + ' linked spool weights synced.');
    } catch { console.error('Sync failed. Check both servers, local clock, spool weights and bridge key. No success confirmed.'); if (args.includes('--once')) { process.exitCode = 1; return; } }
    if (args.includes('--once')) break;
    await pause(60000);
  } while (true);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main().catch(error => { console.error(error.message); process.exitCode = 1; });
