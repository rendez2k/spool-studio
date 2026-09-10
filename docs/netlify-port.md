# Spool Studio: one maintained application

Canonical repository: https://github.com/rendez2k/spool-studio.
Production: https://spool-studio.uk.

All features live in `out/` and the shared server modules. The legacy Sites Worker remains a reference adapter; do not copy new work back into the old hosted libraries. A Git push does not deploy the app automatically unless continuous deployment is separately configured.

## Current implementation

- Netlify serves the app and functions, Clerk handles verified account sessions, and Netlify Database (Postgres) stores account-scoped inventory and phone batches.
- Google sign-in requests only basic identity, not Gmail access. Production and preview use separate Clerk instances and database branches.
- The PWA, app-management page, reviewed text/image/CSV imports, 3MF matching/remapping, shelf labels and quick-entry methods are implemented.
- Common/custom brand and type choices preserve matte/standard distinctions. Product lookup creates a reviewable draft; barcode scanning matches only the user's own saved products.
- Automatic printer-consumption tracking remains unconnected. Roll counts, shelf positions and NFC tags are not measurements of remaining grams.
- Owner migration has been completed and checked privately. No owner's identity, inventory snapshot or phone batch is bundled with the app. Other users' legacy libraries are not migrated automatically.
- The privacy notice remains a draft pending operator review; a working deployment is not public-launch or legal acceptance.

## Authentication and data

The Netlify function strips incoming legacy identity headers and verifies a Clerk session against an explicit origin allowlist. Only then does it supply the internal identity expected by the shared API handlers. Never expose the legacy Worker directly on an untrusted public endpoint.

All inventory and phone-batch queries are scoped to the verified account ID. Postgres retains the shared revision/CAS and idempotent-retry behaviour. Text payloads preserve legacy fields losslessly. This is server-enforced tenancy, not client-side filtering or end-to-end encryption.

Private HTML templates stay outside the public directory and are served with private/no-store headers. Account changes reload the page. API failures do not create fallback guest inventories. The service worker does not cache private pages or API responses.

Product lookup requires the same origin and verified authentication. Retailer URLs and redirect destinations are allowlisted; DNS results are pinned to public addresses. It does not forward user cookies or inventory. See the README for response limits and the typed-text fallback.

## Deployment configuration

Set `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` and `APP_ORIGINS` for each deployment context. Never commit real environment files or reuse development credentials for production inventory. `.env.example` contains empty placeholders.

Production origins are `https://spool-studio.uk`, `https://www.spool-studio.uk` and `https://spool-studio-productkit.netlify.app`. The apex is primary; www redirects to it. Keep Netlify and Clerk DNS records DNS-only unless their current provider instructions explicitly support proxying.

Configure Google OAuth in the intended production Clerk instance with the exact callback `https://clerk.spool-studio.uk/v1/oauth_callback`. Store credentials in Clerk, not source. Test sign-in in a normal browser rather than an embedded WebView.

The separate `port-preview` alias uses Netlify's branch-deploy context, not deploy-preview. Its development identity and database must remain isolated from production. Never point an unreviewed preview at the owner's live inventory.

Build with `npm run build:netlify`; validate with `npm test`. Deploy using the explicitly verified Netlify project, not an inherited project binding. Database migrations live under `netlify/database/migrations/`; do not rewrite applied migrations.

## Installed app management

The dashboard, sign-in, import and NFC pages use the same spool logo. The manifest keeps its root identity and NFC start URL. More → App & device shows installation mode, hostname, build ID, update checks and account access.

The build fingerprints assets, templates and server modules into `app-release.json`. Update checks never force a reload mid-scan; users choose when to refresh. An installation from an old domain cannot change its origin in place: install from the new address after verifying migrated stock. Locally loaded 3MF files are not migrated.

Android Chrome supports this app's NFC-writing workflow with compatible tags. iPhone/iPad can use the library and imports but cannot write NFC through this web app; installing the PWA does not change browser capabilities.

## Controlled legacy migration

Keep backups outside Git and all served directories, for example in ignored `.local/`. Do not reconstruct a snapshot from a truncated connector response. Use an authenticated complete export containing original inventory and phone-batch payload strings, then verify the destination account and source ownership.

Snapshot format:

```json
{
  "format": "spool-studio-migration-v1",
  "source": { "origin": "https://legacy.example", "accountKey": "verified-source-account", "exportedAt": "2026-09-10T00:00:00.000Z" },
  "library": { "revision": 1, "payload": "{\"items\":[]}" },
  "phoneBatch": null
}
```

Run `node scripts/migrate-library.mjs --snapshot <private-file>` for an offline dry run. Review counts and snapshot hash. After verifying the intended destination identity, use the approved database environment and explicitly pass `--apply --source-account <verified-source-id> --target-user <clerk-user-id> --expected-email <verified-email>`.

The transaction refuses to replace a nonempty or previously edited account or an existing phone batch. It preserves IDs, used state and metadata, verifies payloads before commit, and never deletes the source. Immediate retries are idempotent; retries after subsequent edits must fail instead of overwriting stock.

If production administrator write access is disabled, obtain explicit owner approval before enabling it temporarily. Disable it immediately afterward, including on failure. Never treat an API role argument as permission to bypass that control. Do not save or print connection credentials. Freeze edits during final export/import and compare payloads and the signed-in UI before cutover.

Completed migrations must not be rerun simply because another feature is deployed. ChatGPT and Clerk identities are separate; signing in with the same email does not itself migrate stock.
