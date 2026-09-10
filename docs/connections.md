# Connections rollout

## Physical spool IDs and labels

Use **More → Physical spools & usage → Assign permanent IDs**. Assignment is opt-in, transactional, bounded to 5000 counted physical reels, and never invents counts for bundles. UUIDs and monotonic SP numbers are retained when the shelf changes. After assignment, refresh the library before printing QR labels. Stock totals and matching use the remaining available physical reel count; original purchase quantities stay intact.

QR labels carry only a same-origin private reel URL with its UUID in the fragment. Login alone is insufficient: the record must belong to that account. Paired box/spool copies share the same UUID. QR printing requires at least 60 × 30 mm. Verify one actual label on your printer and phone before a batch.

## Local Spoolman bridge

Requires Node.js 22+, a reachable local Spoolman server, and individually mapped physical spool IDs. In Physical spools, create a revocable bridge key and download the private JSON configuration. From the repository folder:

```sh
node scripts/spoolman-bridge.mjs "/path/to/spool-studio-bridge.private.json" --once
node scripts/spoolman-bridge.mjs "/path/to/spool-studio-bridge.private.json"
```

The second command repeats every minute while running. There is no automatic startup service. Default local origin is `http://localhost:7912`; edit `spoolmanUrl` for your installation. Keep the app origin HTTPS. Do not expose the printer or Spoolman to the internet.

The bridge sends only numeric Spoolman IDs and absolute remaining grams. The cloud accepts updates only for linked reels in the credential owner's library. Replaying a snapshot does not double-subtract; stale timestamps and conflicting writes are rejected. Zero remaining grams marks a reel used; a later positive value does not silently undo a user's used mark. Restoring it requires an explicit edit.

The credential is not a Clerk session and cannot read the inventory, create spools, change mappings or operate a printer. Only its hash is stored by the app. Keep the downloaded secret private; replace/revoke it to invalidate copies. Never commit configuration files.

Printer consumption reporting is a separate prerequisite. The U1 needs verified per-tool mappings before claiming automatic multi-tool tracking. No printer configuration, tool assignment or restart is performed by this bridge. An empty Spoolman library must first receive actual spool records; this release does not seed them automatically.

Hardware acceptance: note each SP number, Spoolman ID and loaded tool; record before/after weights around a small supervised single-tool print; verify that only the correct record changes in both systems; repeat sync to exclude double accounting; repeat for each tool before a multi-tool print. Estimates are not scale measurements.

## External barcode catalogue

The explicit UPCitemdb button queries its free trial lookup endpoint with a validated EAN/UPC/GTIN. It sends the code, not account data. No photos, offers or tracking images are rendered. Only exact returned code identities become reviewable drafts. Manufacturer SKUs stay local. Results may be absent, incomplete or wrong; this is not universal coverage.

The free provider has a shared allowance. Per-process pacing reduces bursts; provider limits are authoritative across serverless instances. A production-scale subscription, global rate limiter and provider licensing review are separate rollout work. No paid subscription or API key has been created.

References: [API setup](https://www.upcitemdb.com/wp/docs/main/development/getting-started/), [plans](https://www.upcitemdb.com/wp/docs/main/development/plan/), [terms](https://devs.upcitemdb.com/termsofservice).

## Gmail: staged, disabled by default

Ordinary Google login remains identity-only. The optional importer uses a separate browser OAuth token client requesting only `gmail.readonly`, on explicit user interaction. Search shows at most 20 message headers; only 1–10 selected message bodies are subsequently requested. Only plain-text bodies are parsed. Attachments and HTML-only messages are unsupported. Tokens and original messages are not sent to the app server or stored in browser storage. Reviewed spool fields still pass through the existing consented importer.

Before enabling a test:

1. Create a dedicated Google OAuth **web** client for Gmail (do not reuse Clerk's sign-in client), enable the Gmail API, configure the correct JavaScript origin, consent screen and test-user access.
2. Configure Netlify function environment `GOOGLE_GMAIL_CLIENT_ID` with its public client ID and `GMAIL_TEST_USERS` with the comma-separated Clerk IDs of approved testers. Do not put IDs or secrets in public source.
3. Test with a consenting user through Import → Import from Gmail. Handle rejected consent, expired token, switching accounts, cancellation, HTML-only emails and duplicate imports.
4. Keep `GMAIL_PUBLIC_ENABLED` unset/false until Google's restricted-scope verification, required privacy/limited-use disclosures and any applicable assessment are complete. The public switch is an operator release decision, not something the app enables automatically.

The code and synthetic tests do not establish Google approval or real-mailbox readiness. No background inbox scanning or refresh token is implemented.

References: [Gmail scope classification](https://developers.google.com/workspace/gmail/api/auth/scopes), [browser token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model).

## Privacy release checklist

Operator confirmed by the owner: Robin Edwards, contact hello@productkit.digital.

Technical disclosure now includes physical spool/location/weight records, QR ownership, bridge credential handling, external barcode queries and the staged Gmail flow. The public notice remains marked draft: an assistant's technical review is not professional legal advice or a completed compliance review.

Outstanding operator/legal decisions: lawful bases and supporting assessments, support/log/backup retention, processor contracts and international transfers, deletion of inventory alongside Clerk accounts, and Google's restricted-data policy requirements before general Gmail access.
