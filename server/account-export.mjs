export async function handleAccountExport(request, env) {
  const reply = (value, status = 200) => Response.json(value, {status, headers: {'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'}});
  const accountKey = request.headers.get('oai-authenticated-user-id');
  if (!accountKey) return reply({error: 'Sign in to export your saved data.'}, 401);
  if (request.method !== 'GET') return reply({error: 'Use GET to export your data.'}, 405);
  try {
    const [library, batch] = await Promise.all([
      env.DB.prepare('SELECT revision, payload, updated_at FROM libraries WHERE user_id = ?').bind(accountKey).first(),
      env.DB.prepare('SELECT revision, payload, updated_at FROM phone_batches WHERE user_id = ?').bind(accountKey).first(),
    ]);
    const data = library ? JSON.parse(library.payload) : {items: []};
    return reply({
      format: 'spool-studio-account-export-v1', accountKey, origin: new URL(request.url).origin, exportedAt: new Date().toISOString(),
      library: {items: data.items, reels: data.reels ?? null, importFingerprints: data.importHashes ?? [], nextReelNumber: data.nextReelNumber ?? null, revision: library?.revision ?? 0, updatedAt: library?.updated_at ?? null},
      phoneBatch: batch ? {batch: JSON.parse(batch.payload), revision: batch.revision, updatedAt: batch.updated_at} : null,
      bridge: {enabled: Boolean(data.bridgeHash), lastSync: data.bridgeLastSync ?? null},
      scope: 'Saved Spool Studio application data. Authentication secrets and bridge credentials are excluded. Clerk profile, support correspondence, provider logs, local files and NFC tag contents are not included. Library and phone-batch revisions are read separately. This is a data copy, not an automatic restore file.',
    });
  } catch {return reply({error: 'Your export could not be prepared. No data has been changed; try again later.'}, 503);}
}
