import {boundedJson} from './api.mjs';

export class EraseConflict extends Error {}
export async function eraseSavedData(client, {accountKey, libraryRevision, phoneRevision, requestId}) {
  const erasureId = 'erase:' + requestId;
  const now = new Date().toISOString(), emptyBatch = JSON.stringify({p: '', state: 'empty', total: 0, chosen: 0, selection: null});
  await client.query('BEGIN');
  try {
    const createdLibrary = await client.query("INSERT INTO libraries (user_id, revision, payload, request_id, updated_at) VALUES ($1, 1, $2, '', $3) ON CONFLICT(user_id) DO NOTHING", [accountKey, '{"items":[]}', now]);
    const library = (await client.query('SELECT revision, payload, request_id FROM libraries WHERE user_id = $1 FOR UPDATE', [accountKey])).rows[0];
    const createdBatch = await client.query("INSERT INTO phone_batches (user_id, revision, payload, request_id, updated_at) VALUES ($1, 1, $2, '', $3) ON CONFLICT(user_id) DO NOTHING", [accountKey, emptyBatch, now]);
    const batch = (await client.query('SELECT revision, request_id FROM phone_batches WHERE user_id = $1 FOR UPDATE', [accountKey])).rows[0];
    if (library.request_id === erasureId && batch.request_id === erasureId) {
      await client.query('COMMIT');
      return {cleared: true, libraryRevision: library.revision, phoneRevision: batch.revision};
    }
    if (libraryRevision !== (createdLibrary.rowCount === 1 ? 0 : library.revision) || phoneRevision !== (createdBatch.rowCount === 1 ? 0 : batch.revision)) throw new EraseConflict('Saved data changed on another device. Review the current data before erasing.');
    const previous = JSON.parse(library.payload);
    const nextReelNumber = Number.isSafeInteger(previous.nextReelNumber) && previous.nextReelNumber > 0 ? previous.nextReelNumber : 1;
    await client.query('UPDATE libraries SET revision = revision + 1, payload = $1, request_id = $2, updated_at = $3 WHERE user_id = $4', [JSON.stringify({items: [], nextReelNumber}), erasureId, now, accountKey]);
    await client.query('UPDATE phone_batches SET revision = revision + 1, payload = $1, request_id = $2, updated_at = $3 WHERE user_id = $4', [emptyBatch, erasureId, now, accountKey]);
    await client.query('COMMIT');
    return {cleared: true, libraryRevision: library.revision + 1, phoneRevision: batch.revision + 1};
  } catch (error) {await client.query('ROLLBACK'); throw error;}
}

export async function handleEraseData(request, env) {
  const reply = (value, status = 200) => Response.json(value, {status, headers: {'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'}});
  const accountKey = request.headers.get('oai-authenticated-user-id');
  if (!accountKey) return reply({error: 'Sign in to manage your saved data.'}, 401);
  if (request.method !== 'POST') return reply({error: 'Use POST.'}, 405);
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') return reply({error: 'Use the saved-data controls in this app.'}, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({error: 'JSON required.'}, 415);
  let input;
  try {
    input = await boundedJson(request, 2000);
    if (input.expectedAccountKey !== accountKey) return reply({error: 'Your signed-in account changed. Refresh before continuing.'}, 409);
    if (input.confirmation !== 'ERASE MY SAVED DATA' || !Number.isSafeInteger(input.libraryRevision) || input.libraryRevision < 0 || !Number.isSafeInteger(input.phoneRevision) || input.phoneRevision < 0 || typeof input.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(input.requestId)) throw Error('Review your saved data and type the confirmation exactly.');
  } catch (error) {return reply({error: error.message}, 400);}
  try {return reply({...await env.DB.eraseSavedData({accountKey, libraryRevision: input.libraryRevision, phoneRevision: input.phoneRevision, requestId: input.requestId}), accountKey});}
  catch (error) {return reply({error: error instanceof EraseConflict ? error.message : 'Erasure was not confirmed. Refresh and check your saved data before trying again.'}, error instanceof EraseConflict ? 409 : 503);}
}
