# Send to printer (U1)

Open **Send to printer** on a library card, the physical-reel page, the phone programmer or App & device. Choose a filament and tool 1–4, review the existing and proposed metadata, and confirm. This changes the printer's generic vendor/material/finish/colour, not an NFC tag. No temperatures, extrusion, motion, heating, print starts, firmware installation or restarts are sent. The slicer still owns print settings; later tag scans or jobs may replace the displayed metadata.

## Local setup

Use Node.js 22+ and the current repository on a computer that can reach Moonraker. Install dependencies with `npm ci`. Open **Local bridge setup**, create a separate printer key, enter the printer's private IPv4 origin (including its port when needed), then download the private JSON on that computer. The configuration explicitly enables `allowPrinterWrites`; it is not the Spoolman weight-sync configuration. An optional `printerApiKey` may be set locally when Moonraker requires it. Neither the IP nor that API key is uploaded.

```sh
node scripts/printer-bridge.mjs "path/to/spool-studio-printer.private.json" --check
node scripts/printer-bridge.mjs "path/to/spool-studio-printer.private.json"
```

`--check` performs only local reads; it does not connect to the app or execute requests. The normal process polls over outbound HTTPS every five seconds; keep it running. Ctrl+C stops it. No local listener, port forwarding, public printer address or browser-to-LAN access is needed. iPhone, Android and desktop all use the same signed-in app page.

## Supported firmware and limits

The bridge checks the printer's actual `gcode.commands`, not just `/printer/gcode/help` (which may omit commands with no help text). It requires `SET_PRINT_FILAMENT_CONFIG` and the four `print_task_config` metadata arrays. Tool 1 corresponds to channel 0. The current implementation intentionally does not use the ACE-specific `SET_FILAMENT_CONFIG` command or invent its temperature/weight parameters.

Only explicit PLA, PETG, ABS, ASA, TPU, PA, PC, PVA or HIPS with standard, matte or silk finish and a valid single-colour hex can be sent. Older imports without a finish field can infer it from an exact product name such as PLA Basic or PLA Matte; saved finish choices are never overridden. PLA+, unknown materials/finishes and special blends are not silently converted. A generic metadata label is not evidence of nozzle, dryer, feeder or material compatibility.

Protocol references: [U1-RFID command implementation](https://github.com/DnG-Crafts/U1-RFID/blob/main/Android/U1RFID/app/src/main/java/dngsoftware/u1rfid/Utils.java), [paxx12 filament UI](https://github.com/paxx12-snapmaker-u1/SnapmakerU1-Extended-Firmware/blob/develop/overlays/firmware-extended/68-app-filament-ui/root/usr/local/filament-ui/html/script.js), [SpoolLink commands](https://github.com/paxx12-snapmaker-u1/SnapmakerU1-Extended-Firmware/blob/develop/docs/spoolman.md).

## Optional Spoolman tracking

Choose the actual physical reel with an existing mapped Spoolman ID, then explicitly enable assignment. The configured Spoolman origin must exactly match the printer's configuration. The bridge checks connection, spool ID, material, colour, archive/zero-weight state and other tool assignments. `SET_SPOOL_ID` can also bind the currently detected tag UID; review the physical reel first. The original brand is retained in the library; printer metadata is generic.

**Colour-only sends clear an existing Spoolman tool assignment** after showing that change in the review. Otherwise a new reel could consume the previous reel's stock. If the firmware cannot safely clear the assignment, sending is blocked. This feature does not create records, map library receipts to physical reels, set remaining weights or prove consumption accuracy. A supervised test print is still necessary.

## Safety and failure semantics

- Separate revocable printer credential; hashes only in the database. Keep the downloaded key private. It is not accepted by the weight-sync endpoint.
- Account-bound library selection, server-resolved profile and explicit reviewed Spoolman ID. Fresh review (20 seconds) and fresh idle status are required; printing, paused, error and unknown states fail closed.
- One pending command. The local bridge claims it with an atomic revision check; other bridge processes cannot receive the same command. Unclaimed requests expire after 30 seconds; claimed commands have a short execution deadline.
- Printer state is read again immediately before each write. These HTTP checks are not an atomic printer job-scheduler lock: do not start another job or edit filament simultaneously.
- Read-back must match material, finish, vendor, colour and Spoolman assignment. A receipt/HTTP 200 alone is not success.
- Printer commands are never automatically retried, including after a lost HTTP reply. Only reporting an already-completed result is retried. Missing results become uncertain; inspect the printer before another manually reviewed request.
- A multi-command assignment can partially complete. Uncertain status explicitly requires inspection; no automatic rollback or second write is attempted.
- Cancelling works only before claim. Revoking or replacing a key cannot recall an in-flight printer command.

The dedicated `printer_connections` table avoids bumping inventory revisions on every heartbeat. It keeps the latest status and one latest request; new requests replace previous results. Key revocation or saved-data erasure clears this data; erasure retains a minimal revision barrier. Account export includes visible status/result but no key/hash. Provider backups have the existing retention/recovery limitations.

## Hardware acceptance

Run `--check`, confirm tool numbers and currently loaded reels, then send one reviewed filament while idle. Confirm both app read-back and printer UI. Test a busy/paused printer without expecting any settings writes. For tracking, confirm the mapped reel and do a supervised print. Development tests use synthetic transports; reading live capabilities does not itself count as a successful hardware send.
