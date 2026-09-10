# Spool Studio

The shared Spool Studio application, hosted on Netlify with Clerk authentication and Postgres. Each signed-in account starts with an empty private library; existing libraries are migrated only through a verified, explicit account transfer.

[Open Spool Studio](https://spool-studio.uk/) · [GitHub repository](https://github.com/rendez2k/spool-studio)

## Netlify deployment

`npm run build:netlify` prepares CDN assets and function-only private pages. `npm run dev:netlify` runs the Netlify development server. Configure Clerk and the exact allowed origins as described in `docs/netlify-port.md`. `npm test` includes Postgres isolation, migration and legacy feature regressions.

The Netlify project is `spool-studio-productkit`. Production sign-in and the owner's verified migration are complete; the separate preview keeps development authentication and an isolated database. The old Sites deployments remain unchanged. No private inventory or credentials are included in this source tree. See `docs/netlify-port.md` for deployment and controlled migration guidance; do not deploy the old Worker bundle to Netlify. The privacy notice still requires operator review before it can be treated as final.

A private filament inventory for each signed-in user: organise spools, compare a 3MF project with stock, and send selected colours to an Android NFC programmer.

## Features

- Export an editable 3MF using chosen library filaments: suggested close stock, explicit review, unchanged geometry/paint and shared NFC choices. Original calibration is retained for slicer review, not replaced with verified presets. See `docs/remap-export.md` for supported inputs and limitations.
- Public `/guide.html` with import examples, review tips and an Android/Paxx U1 NFC setup checklist. Import and phone pages link directly to their relevant sections; no extra confirmation gate is added. Firmware references were checked on 9 September 2026; placement advice is explicitly based on a local trial, not a guaranteed reader radius.
- Add and edit filament, roll counts, material, finish, colour and packaging (refill or supplied on a spool).
- Combine identical filaments or browse colour families and a numbered colour shelf.
- Mark entries used up, undo, and export CSV.
- Assign permanent physical spool IDs; print paired spool/box QR labels (60 × 30 mm or larger) that open the owner's private reel record.
- Record each reel’s location and remaining grams, or sync linked Spoolman estimates with the optional local bridge. Printer consumption reporting and per-tool mapping require separate setup and hardware validation.
- Look up unknown EAN/UPC codes through an explicit UPCitemdb catalogue request; results are reviewable drafts with limited coverage, not universal identification.
- Gmail read-only import is staged behind separate configuration and consent. It is disabled by default pending Google setup/verification. See `docs/connections.md` for rollout status and setup.
- Load Bambu Studio or OrcaSlicer 3MF projects locally, view available embedded previews, and compare colours with available stock. Matte and standard PLA are distinct.
- Sync a chosen batch to the permanent `/nfc.html` page using the same account on desktop and phone.
- Install the PWA with its own icon. Write and verify Generic OpenSpool tags using supported Android browsers and compatible printer firmware.

Every new account starts empty. There are no personal purchase records, connected mailboxes, preloaded models or privileged inventory owners in this repository. Test examples are synthetic.

## Run locally

### Importing orders and labels

The public `/email-import.html` guide supplies a copyable, read-only email-extraction prompt and an empty Excel-friendly CSV template. The importer accepts that CSV locally (UTF-8, comma or semicolon, 500 entries/1 MB). It uses the same account-bound review/duplicate/save path as OCR. ChatGPT connections are optional and separate from the app; source email contents supplied to ChatGPT do not fall under the on-device processing guarantee. CSV headers are explicit, formulas and malformed records are rejected, unknown swatches require review, and source records are not treated as proof of remaining stock.

Use **Import** to paste order-confirmation text or read a JPG, PNG or WebP screenshot/label photo. English OCR runs in a local web worker using self-hosted Tesseract assets; there is no AI API or external OCR endpoint. The separately gated Gmail feature is optional and not generally enabled. It reads printed text, not the physical colour of filament. HEIC and PDF are not supported in this first version; use a screenshot instead.

Uploads are limited to one image at a time, 10 MB and 20 megapixels; text batches are limited to 60,000 characters and 500 candidate entries. Recognition and extraction are conservative and imperfect: missing fields need review, bundle contents may require manual splitting, and swatches inferred from colour words are explicitly approximate.

The review page flags possible duplicates and starts them unselected. Nothing is saved until the user reviews and confirms their selected fields. Raw text and images remain in page memory and are not uploaded or persisted. Only approved spool fields and a deduplication hash of the normalised source are saved to the account. Batch saves are atomic, revision-checked, retry-safe, and bound to the account that opened the importer.

The build copies the pinned OCR runtime, three LSTM core variants and English trained data into ignored `out/vendor/ocr/`. Browser and Node OCR tests use local assets and synthetic input; they do not test physical phone hardware.

Use Node.js 24 and npm:

```sh
npm ci
npm test
npm run dev
```

Open http://127.0.0.1:8766. Tests build the app first; after changing source, run `npm run build` before restarting the preview.

The loopback-only preview uses a fixed development identity and a separate SQLite database in ignored `.local/`. It is not a real login server and must never be exposed publicly. Localhost links are not phone transfer links; NFC requires an HTTPS deployment on the phone.

## Legacy Sites hosting

The canonical application runs on Netlify as described above. The repository retains an older **OpenAI Sites** Worker; the new bridge and Gmail configuration endpoints require the Netlify adapter. GitHub stores source rather than running the application or database. In the legacy deployment:

- Sites handles Sign in with ChatGPT and forwards the authenticated user's Site-specific ID.
- The app enforces ownership on the server for every inventory and phone-batch request.
- Sites provides the D1 database binding named `DB`. This stores each user's inventory and selected phone batch.
- 3MF files and their previews remain on the device. They are not uploaded to D1.

To deploy through a Sites-enabled environment, copy `.openai/hosting.example.json` to `.openai/hosting.json`. Register a new Site and use its returned project ID, or use an existing Site only when its owner explicitly authorises it. The real manifest is intentionally ignored. Build with `npm run build`, then publish through the Sites hosting workflow, including the generated migrations.

This repository is not connected to automatic deployment. Pushing here does not change an existing hosted library. The clean snapshot contains neither the original deployment binding nor its Git history or private import data.

**Do not deploy this Worker directly on an untrusted public endpoint.** Its authentication header is secure only behind the Sites gateway, which verifies login and removes client-supplied identity headers. Another host requires a verified server-side authentication adapter and login routes first. GitHub Pages alone cannot run this app.

## Data and security

The print matcher offers Amazon UK searches for included colours without a confirmed exact match, using the site owner's public tracking ID configured in `out/shopping.js`. The links are labelled as paid links and accompanied by the Associate disclosure. Unnamed colours use approximate colour families, not verified product matches. Prices, stock and exact variants are not claimed; matching ranks never depend on shopping links. Forks should replace the tracking ID with their own approved ID and update its test. Before using affiliate links, list the deployed site in your Associates account and check any applicable installed-app approval requirements.

Inventory and phone batches are keyed by authenticated user ID, never by an email or a user ID supplied in a JSON body. Writes require the same origin, bounded validated input and revision checks. Anonymous users get an empty sign-in page; protected APIs return 401.

The PWA does not cache private pages or API responses. Offline it shows a neutral connection message rather than a stale private inventory. QR snapshot links contain the selected batch; share them only intentionally.

Colour matches are estimates, not proof of an exact filament or enough remaining material. NFC programming requires a user-triggered write and read-back verification; printer compatibility and actual hardware operation must be checked on your device. The test suite simulates NFC hardware.

## Development

### Quick entry

Add spools offers common brand/type selects with custom values, an optional product-link draft and barcode templates from the signed-in user's own inventory. Common types fill material/finish only, never calibrated printer settings. Barcode camera decoding is lazy-loaded from self-hosted ZXing; camera frames stay local. Supported scans: EAN-8/13, UPC-A, Code 128/39 and ITF (not UPC-E or QR). A new code needs manual details first; this is not a universal product catalogue or physical-spool identifier. Optional `barcode` and `sourceUrl` fields preserve old records when omitted by older clients.

Product lookup runs on the canonical Netlify backend (`POST /api/product-lookup`), not the legacy Sites Worker. It requires verified Clerk identity and same origin. Only allowlisted retailer product URLs are fetched; DNS addresses are vetted and pinned to public IPs, each redirect is revalidated (maximum two), and responses are limited to HTML, 2 MB and 12 seconds. No caller credentials are forwarded. A best-effort per-process limit of 10 lookups/user/minute is not a global distributed quota. Shops may refuse automated requests; copied text in Import remains the fallback. Results never silently save stock or assert an exact variant. Read the updated privacy and device guides before rollout. Automatic U1 consumption tracking remains unconnected.

### Shelf labels

Colour shelf → Print shelf labels prints the current available, counted roll sequence. Presets: 60 × 30, 50 × 30, 40 × 30, 100 × 50 mm and 4 × 6 inches; custom width 40–210 mm and height 25–297 mm. Choose one label or adjacent identical spool-and-box copies, and a position range (maximum 500 labels including copies). This uses the browser print dialog and installed driver, not a direct MUNBYN connection. Match the physical paper size, 100% scaling, zero margins and no headers/footers; hardware calibration must be tested on the user's printer.

Numbers are mutable shelf positions, not durable physical-spool IDs. Unknown-quantity bundles are excluded. A shelf snapshot is held only in memory; changes invalidate it before printing. Text is inserted through DOM textContent, and overflow blocks printing rather than silently clipping names. Label dimensions are validated before entering the print stylesheet. No inventory writes or consumption tracking are performed.

- `out/`: vanilla HTML, CSS, browser JavaScript and PWA assets.
- `server/`: Worker routing and account-scoped API handlers.
- `db/schema.ts`, `drizzle/`: D1 schema and migrations.
- `scripts/`: build and loopback development server.
- `tests/`: account isolation, inventory, matching/NFC flows, synchronisation and PWA tests.

After schema changes run `npm run db:generate` and inspect the generated SQL. Never rewrite migrations already applied to a deployed database.

Third-party QR code attribution and license are in `out/vendor/`.
