# Filament Library

A private filament inventory for each signed-in user: organise spools, compare a 3MF project with stock, and send selected colours to an Android NFC programmer.

## Features

- Add and edit filament, roll counts, material, finish, colour and packaging (refill or supplied on a spool).
- Combine identical filaments or browse colour families and a numbered colour shelf.
- Mark entries used up, undo, and export CSV.
- Load Bambu Studio or OrcaSlicer 3MF projects locally, view available embedded previews, and compare colours with available stock. Matte and standard PLA are distinct.
- Sync a chosen batch to the permanent `/nfc.html` page using the same account on desktop and phone.
- Install the PWA with its own icon. Write and verify Generic OpenSpool tags using supported Android browsers and compatible printer firmware.

Every new account starts empty. There are no personal purchase records, connected mailboxes, preloaded models or privileged inventory owners in this repository. Test examples are synthetic.

## Run locally

Use Node.js 24 and npm:

```sh
npm ci
npm test
npm run dev
```

Open http://127.0.0.1:8766. Tests build the app first; after changing source, run `npm run build` before restarting the preview.

The loopback-only preview uses a fixed development identity and a separate SQLite database in ignored `.local/`. It is not a real login server and must never be exposed publicly. Localhost links are not phone transfer links; NFC requires an HTTPS deployment on the phone.

## Hosting and login

GitHub stores the source; it does not run the application or database. This app targets **OpenAI Sites**:

- Sites handles Sign in with ChatGPT and forwards the authenticated user's Site-specific ID.
- The app enforces ownership on the server for every inventory and phone-batch request.
- Sites provides the D1 database binding named `DB`. This stores each user's inventory and selected phone batch.
- 3MF files and their previews remain on the device. They are not uploaded to D1.

To deploy through a Sites-enabled environment, copy `.openai/hosting.example.json` to `.openai/hosting.json`. Register a new Site and use its returned project ID, or use an existing Site only when its owner explicitly authorises it. The real manifest is intentionally ignored. Build with `npm run build`, then publish through the Sites hosting workflow, including the generated migrations.

This repository is not connected to automatic deployment. Pushing here does not change an existing hosted library. The clean snapshot contains neither the original deployment binding nor its Git history or private import data.

**Do not deploy this Worker directly on an untrusted public endpoint.** Its authentication header is secure only behind the Sites gateway, which verifies login and removes client-supplied identity headers. Another host requires a verified server-side authentication adapter and login routes first. GitHub Pages alone cannot run this app.

## Data and security

Inventory and phone batches are keyed by authenticated user ID, never by an email or a user ID supplied in a JSON body. Writes require the same origin, bounded validated input and revision checks. Anonymous users get an empty sign-in page; protected APIs return 401.

The PWA does not cache private pages or API responses. Offline it shows a neutral connection message rather than a stale private inventory. QR snapshot links contain the selected batch; share them only intentionally.

Colour matches are estimates, not proof of an exact filament or enough remaining material. NFC programming requires a user-triggered write and read-back verification; printer compatibility and actual hardware operation must be checked on your device. The test suite simulates NFC hardware.

## Development

- `out/`: vanilla HTML, CSS, browser JavaScript and PWA assets.
- `server/`: Worker routing and account-scoped API handlers.
- `db/schema.ts`, `drizzle/`: D1 schema and migrations.
- `scripts/`: build and loopback development server.
- `tests/`: account isolation, inventory, matching/NFC flows, synchronisation and PWA tests.

After schema changes run `npm run db:generate` and inspect the generated SQL. Never rewrite migrations already applied to a deployed database.

Third-party QR code attribution and license are in `out/vendor/`.
