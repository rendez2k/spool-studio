# One-time available-colour sharing with Strata

This receiver is staged for coordinated release with the Strata stock chooser. It grants no continuing inventory access. The user must explicitly click **Share available colours with Strata** in a signed-in Spool popup. Receiving a request, opening the popup or signing in alone never shares inventory.

## Protocol v1

URL: `https://spool-studio.uk/?view=cards#strata-stock=<32 lowercase hexadecimal nonce>&sender=<encoded exact sender origin>`.

Origins and opener checks reuse the model handoff policy: exact `https://strata3mf.uk` or `https://rendez2k.github.io` to the canonical Spool origin, or HTTP localhost/127.0.0.1 on both sides for local tests. All postMessage calls use exact targetOrigin. Incoming events must match the captured opener, origin, token, version and appropriate phase. Ambiguous links containing both stock and model transfer parameters are rejected. The correlation nonce is not an account token or credential.

1. Spool repeats `{type:'strata-spool:stock-ready',version:1,token}` after account/library readiness.
2. Strata sends `{type:'strata-spool:stock-request',version:1,token}` once. Spool opens a local review dialog; no inventory has been transmitted.
3. After explicit Share, Spool sends `{type:'strata-spool:stock-data',version:1,token,colours}` once.
4. Strata validates the payload and acknowledges `{type:'strata-spool:stock-received',version:1,token}`.
5. Error/cancel uses `{type:'strata-spool:stock-error',version:1,token,message}` with a safe reason. Remote error text is not reflected.

The active request expires two minutes after first readiness. Completion, cancellation, timeout, page exit, account changes and opener closure clear listeners, timers and transfer fragment parameters. Cancelling after Share cannot recall an already transmitted snapshot. No silent retries or background sync occur. Login navigations that lose the opener can be recovered by reopening from Strata.

## Shared fields

Each element of `colours` contains exactly `brand`, `product`, `colour`, `material`, `finish`, `hex`, `availableRolls`. There are no stock/reel IDs, account identifiers, auth credentials, emails, purchase/order data, prices, notes, locations, temperatures or weights.

- Maximum 1,000 options and 512 KiB of UTF-8 JSON for the complete stock-data message; oversized snapshots fail closed rather than silently truncate.
- String bounds: brand 80, product 120, colour 80, material 32 characters.
- Finish: standard, matte, silk, marble, sparkle, wood, glow, satin, metal or unknown. An explicitly unknown finish stays unknown; missing legacy finishes use the existing product-name inference.
- Hex: uppercase `#RRGGBB` from the saved library swatch, not a measurement of the reel.
- availableRolls: integer 1–500,000. An empty `colours: []` is valid but still requires Share.

The snapshot uses the whole available library, not visible search filters. Known positive counts follow individual reel used flags where present, otherwise purchase-entry counts; used entries and unknown/zero counts are excluded. Invalid, unsupported multi-colour/gradient/bundle swatches and overlong metadata are omitted with a local notice. Exact shared brand/product/colour/material/finish/hex combinations aggregate their roll counts. Counts include refills and do not reserve stock or certify sufficient remaining grams. Metadata is not a calibrated slicer profile.

A library revision change since the review refreshes the local preview and requires another Share click. An account switch aborts instead of sharing the newly signed-in person's stock. Strata should keep received choices in session memory only, support a material filter, and require its own explicit Apply/lock action before altering its model palette.

## Validation

Eleven focused stock tests cover field whitelisting, aggregation/reel availability, origin/source/token/type validation, no data before explicit Share, duplicates, revision reconfirmation, account changes, cancellation/timeouts, empty inventory and payload bounds. The full suite passes 230 tests. Local two-tab browser checks cover desktop/mobile in both themes, no non-GET requests, metadata-only payloads, cancel and changed-stock reconfirmation. The read-only fixture at port 18769 contains twelve synthetic PLA options and 39 available rolls; it is not a production service.

Actual Strata v1.129.0 requester integration also passes: three PLA options selected from this popup's snapshot, no model palette mutation before Apply, explicit apply/lock, Undo restoration, lock preservation through Shuffle, selection retained during search, and snapshot-only clearing. Desktop/mobile layouts and the existing forward 3MF/thumbnail transfer regression pass. All integration stock is synthetic; no real inventory or printer changes were made.
