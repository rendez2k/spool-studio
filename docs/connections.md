# Connections rollout

## Physical spool IDs and labels

Use **More → Physical spools & usage → Assign permanent IDs**. Assignment is opt-in, transactional, bounded to 5000 counted physical reels, and never invents counts for bundles. UUIDs and monotonic SP numbers are retained when the shelf changes. After assignment, refresh the library before printing QR labels. Stock totals and matching use the remaining available physical reel count; original purchase quantities stay intact.

QR labels carry only a same-origin private reel URL with its UUID in the fragment. Login alone is insufficient: the record must belong to that account. Paired box/spool copies share the same UUID. QR printing requires at least 60 × 30 mm. Verify one actual label on your printer and phone before a batch.

QR regression tests render 23 deterministic reel URLs (including three observed failing finder patterns) at the 20 mm code's approximate 203/300 dpi sizes. jsQR locates and reads each image; ZXing independently decodes its known, axis-aligned matrix with PURE_BARCODE. The previous single random test conflated ZXing's finder-pattern errors with invalid QR payloads, including at larger and integer-module image sizes. SVG modules now request crisp edges. These checks establish digital rendering/encoding, not camera focus, thermal output, curvature or universal scanner compatibility; physical acceptance is still required.

## Local Spoolman bridge

Requires Node.js 22+, a reachable local Spoolman server, and individually mapped physical spool IDs. In Physical spools, create a revocable bridge key and download the private JSON configuration. From the repository folder:

```sh
node scripts/spoolman-bridge.mjs "/path/to/spool-studio-bridge.private.json" --once
node scripts/spoolman-bridge.mjs "/path/to/spool-studio-bridge.private.json"
```

The second command repeats every minute while running. There is no automatic startup service. Default local origin is `http://localhost:7912`; edit `spoolmanUrl` for your installation. Keep the app origin HTTPS. Do not expose the printer or Spoolman to the internet.

The bridge sends only numeric Spoolman IDs and absolute remaining grams. The cloud accepts updates only for linked reels in the credential owner's library. Replaying a snapshot does not double-subtract; stale timestamps and conflicting writes are rejected. Zero remaining grams marks a reel used; a later positive value does not silently undo a user's used mark. Restoring it requires an explicit edit.

The credential is not a Clerk session and cannot read the inventory, create spools, change mappings or operate a printer. Only its hash is stored by the app. Keep the downloaded secret private; replace/revoke it to invalidate copies. Never commit configuration files.

Printer consumption reporting is a separate prerequisite. The U1 needs verified per-tool mappings before claiming automatic multi-tool tracking. No printer configuration, tool assignment or restart is performed by this bridge. An empty Spoolman library must first receive actual spool records, either manually or through the reviewed transfer below.

### Transfer an existing library

In Physical spools → Spoolman connection, choose **Export for Spoolman**. The private JSON contains available physical reels and filament specifications, not mailbox/order details, locations or bridge credentials. Unknown-quantity bundles and used-up reels are excluded. Edit `spoolmanUrl` if necessary. Fill each `materials` entry with manufacturer-confirmed `density` in g/cm³ and `diameter` in mm. For unusual blends, split the transfer into separate files with the appropriate profiles; do not assume every PLA blend shares a density. Confirm initial and remaining **net filament** grams; tare is not invented.

```sh
node scripts/spoolman-import.mjs "/path/to/spool-studio-transfer.private.json"
node scripts/spoolman-import.mjs "/path/to/spool-studio-transfer.private.json" --apply
```

The first command is a dry run with no writes. Back up Spoolman and review the file and counts before using `--apply`. Only when **every unmeasured exported reel is full**, add `--assume-full` to use its initial weight. Otherwise enter measured/known remaining grams first. No manufacturer density, diameter or remaining weight is silently guessed.

The importer creates tagged vendor/filament/spool records, reuses its exact permanent-reel markers on retry and never resets existing usage. It never calls a printer or a cloud endpoint. Do not run imports concurrently from different computers. A local lock prevents parallel CLI imports on one computer; after a crash, inspect processes before removing its temporary lock. On a failed write, created records remain in Spoolman: inspect them and rerun the same source to resume, rather than deleting valid records or changing markers. The mapping output is usable only after the command completes.

Return the generated `spoolman-mappings-….private.json` to **Import completed Spoolman mappings**, review the count, then confirm. Site/account checks and atomic validation prevent foreign, duplicate, stale or conflicting links. Existing nonmatching links must be explicitly removed first. Linking does not change purchase quantities or current weights; the bridge supplies subsequent weight snapshots. Keep source and mapping files private and remove local copies when no longer needed.

Hardware acceptance: note each SP number, Spoolman ID and loaded tool; record before/after weights around a small supervised single-tool print; verify that only the correct record changes in both systems; repeat sync to exclude double accounting; repeat for each tool before a multi-tool print. Estimates are not scale measurements.

Read-only connection diagnosis (replace both addresses):

```sh
node scripts/spoolman-check.mjs http://printer-address http://spoolman-address:7912
```

On supported U1 firmware, this also reads all four tools' Spoolman assignments and reports missing or duplicate records. Tool numbers 1–4 correspond to channels 0–3. Tag presence is reduced to a boolean; no tag UID, spool name or private notes are included. An unavailable per-tool query is reported as unknown, not as four empty tools. Reported filament/tag presence and IDs still need physical confirmation. A different server address may be an alias; resolve any mismatch before trusting record comparisons.

For current paxx12 U1 firmware, prefer the built-in **SpoolLink** integration. Older `spoolman_multi_tool` includes can conflict with it. Confirm the actual spool before using Filament Manager or `SET_SPOOL_ID CHANNEL=<0–3> SPOOL_ID=<confirmed-id>`; this also binds the detected tag UID. A connected status alone does not prove correct per-tool consumption. See the [firmware's Spoolman documentation](https://github.com/paxx12-snapmaker-u1/SnapmakerU1-Extended-Firmware/blob/develop/docs/spoolman.md).

## External barcode catalogue

The explicit UPCitemdb button queries its free trial lookup endpoint with a validated EAN/UPC/GTIN. It sends the code, not account data. No photos, offers or tracking images are rendered. Only exact returned code identities become reviewable drafts. Manufacturer SKUs stay local. Results may be absent, incomplete or wrong; this is not universal coverage.

The free provider has a shared allowance. A database-backed, atomic reservation now enforces at least 15 seconds between attempts and at most 100 attempts in a rolling 24 hours across app instances. PostgreSQL supplies the clock. Failed provider calls count too; missing or invalid limiter state fails closed rather than bypassing the allowance. A 429 response provides Retry-After for app-imposed limits. Provider limits remain authoritative and may be exhausted independently. A production-scale subscription and provider licensing review remain operator work. No paid subscription or API key has been created.

References: [API setup](https://www.upcitemdb.com/wp/docs/main/development/getting-started/), [plans](https://www.upcitemdb.com/wp/docs/main/development/plan/), [terms](https://devs.upcitemdb.com/termsofservice).

## Gmail: private test, disabled for other accounts

Ordinary Google login remains identity-only. The optional importer uses a separate browser OAuth token client requesting only `gmail.readonly`, on explicit user interaction. Search shows at most 20 message headers; only 1–10 selected message bodies are subsequently requested. Only plain-text bodies are parsed. Attachments and HTML-only messages are unsupported. Tokens and original messages are not sent to the app server or stored in browser storage. Reviewed spool fields still pass through the existing consented importer.

Before enabling a test:

1. Create a dedicated Google OAuth **web** client in a separate testing project for Gmail (do not reuse or change Clerk's production sign-in project), enable the Gmail API, configure the correct JavaScript origin, consent screen and test-user access.
2. Configure Netlify function environment `GOOGLE_GMAIL_CLIENT_ID` with its public client ID and `GMAIL_TEST_USERS` with the comma-separated Clerk IDs of approved testers. Do not put IDs or secrets in public source.
3. Test with a consenting user through Import → Import from Gmail. Handle rejected consent, expired token, switching accounts, cancellation, HTML-only emails and duplicate imports.
4. Keep `GMAIL_PUBLIC_ENABLED` unset/false until Google's restricted-scope verification, required privacy/limited-use disclosures and any applicable assessment are complete. The public switch is an operator release decision, not something the app enables automatically.

The code and synthetic tests do not establish Google approval or real-mailbox readiness. No background inbox scanning or refresh token is implemented.

On 10 September 2026 the owner approved a private importer test. A separate Google project was created with Testing audience, one explicitly listed Google tester, a web client restricted to the canonical app origin, and only the Gmail read-only scope. Production function settings allow only the approved app account; the public switch remains false. Project/client/tester identifiers remain in private operator configuration, not this repository. Gmail mailbox consent and end-to-end message import still require the tester's separate interaction. Existing production Google login is unchanged.

References: [Gmail scope classification](https://developers.google.com/workspace/gmail/api/auth/scopes), [browser token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model).

## Privacy release checklist

App & device → Your saved data downloads private JSON from the authenticated `/api/account-export` endpoint. It includes unfiltered stock, used reels, stable IDs, import fingerprints, and the latest phone batch, but no bridge key/hash or sign-in credentials. The two stored records retain separate revisions and are not an atomic restore snapshot. Reading an empty account does not create records. Clerk profile, support correspondence, provider logs and local-device data require separate access handling; the download is not claimed to fulfil every possible access request by itself.

App & device → Erase saved application data requires a fresh count/revision review and the exact typed phrase. A dedicated Postgres connection locks both account rows and clears their content in one transaction, removing import fingerprints, reel details and bridge credentials. Both revision counters advance (including for an empty account), blocking delayed pre-erasure writes. The next permanent spool number remains monotonic. Retries use the same request ID; a changed library or phone batch requires another review. No real user's data was erased during development; tests use isolated fixtures.

This is not full account deletion: the Clerk login and minimal account reference/revision/next-number/request/timestamp metadata remain. Downloaded files, locally saved phone batches, NFC tags, support correspondence and provider logs/backups need separate handling. Complete account removal and backup/log retention remain operator work. No unverified purge deadline is promised.

Operator confirmed by the owner: Robin Edwards, contact hello@productkit.digital.

Technical disclosure now includes physical spool/location/weight records, QR ownership, bridge credential handling, external barcode queries and the staged Gmail flow. The public notice remains marked draft: an assistant's technical review is not professional legal advice or a completed compliance review.

Outstanding operator/legal decisions: lawful bases and supporting assessments, support/log/backup retention, processor contracts and international transfers, deletion of inventory alongside Clerk accounts, and Google's restricted-data policy requirements before general Gmail access.
### Barcode allowance implementation

`service_limits` contains one global `upcitemdb-trial` row: a revision and at most 100 numeric request timestamps. It contains no account IDs, codes, provider products or inventory. Optimistic revision updates reserve a slot before any external request; concurrent losers retry against the shared state and cannot spend the same slot. Old timestamps are removed on the next successful reservation, not by a background purge. The row therefore remains bounded when idle. It is deliberately separate from account erasure/export.

The additive Netlify migration `002_barcode-budget` creates this table and revokes PUBLIC access; local SQLite development has its matching generated migration. Deploy migrations before serving the new handler. Missing migration or database failure returns 503 without calling the provider. Tests exercise two PostgreSQL adapters racing against the same database, rollover, protected endpoints, failed attempts and unavailable storage. No production barcode or user inventory is used in those tests.
### Gmail account-switch acceptance

Preparation is tied to both the current app account and a cancellable generation. Late configuration replies or Google-script loads cannot restore a connection after cancellation, navigation or an account switch. Rechecking a disabled test gate clears previous preparation. A connection can only start for the account whose setup was checked; message searches and reads also recheck the authenticated app account. Disconnecting or leaving clears preparation as well as the in-memory token. Old consent and revocation callbacks cannot update a newer session.

Automated fixtures cover these paths without a real mailbox or Google token. They do not replace the consenting tester's order-body copy check or Google's public-app verification. Public Gmail access remains disabled.
