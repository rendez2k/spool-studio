# Strata → Spool Studio receiver (v1)

Canonical receiver: `https://spool-studio.uk/?view=match#strata-transfer=<32 lowercase hexadecimal characters>&sender=<encoded exact sender origin>`.

Allowed production sender origins are exactly `https://strata3mf.uk` and `https://rendez2k.github.io`. The GitHub Pages origin is trusted as a whole, not a path: do not host untrusted applications under that origin. Local testing permits HTTP localhost/127.0.0.1 only when both sender and receiver are loopback origins. Arbitrary hosted previews, LAN IPs and production-to-loopback transfers are rejected.

The sender opens a new tab with an opener reference. Neither side may set a COOP policy or noopener behavior that severs that relationship. All messages use an exact targetOrigin. File events must come from the captured opener with the exact sender origin, token and version.

- Receiver sends `{type:'strata-spool:ready',version:1,token}` every second after the private library is ready.
- Sender sends one `{type:'strata-spool:file',version:1,token,name,buffer}`, where name is a basename ending .3mf and buffer is an ArrayBuffer of 22 bytes to 100 MiB.
- Receiver sends `{type:'strata-spool:received',version:1,token}` after successful import, or `{type:'strata-spool:error',version:1,token,message}` on failure.

No file is accepted before account readiness. Only the first valid matching message is considered; duplicates and foreign messages are ignored. Ready and parsing share a two-minute deadline starting at first readiness. Cancel, pagehide, sender closure, account changes, success and failure clean up listeners/timers and remove transfer parameters from the URL. If signing in navigates away or breaks opener isolation, return to Strata and resend; manual file import remains available.

The adapter uses FilamentMatcher.readProject and prepareMatchProject, retains the entire original File for existing reviewed remap/export, and appends to existing projects (maximum eight). Geometry, native mixing recipes and other opaque archive contents are not rewritten by transfer. Included thumbnails are handled by the existing bounded importer. A new transfer does not choose inventory, enable phone sync, change stock, remap automatically or send a printer command.

Implementation: out/strata-transfer.js (protocol/lifecycle), out/strata-transfer-ui.js (matcher adapter and status/cancel UI). No account tokens or inventory are sent to Strata.

Local integration fixture: run `node .local/studio-preview.mjs` in this repository, then target `http://127.0.0.1:18769` from a loopback Strata sender. This ignored fixture serves synthetic inventory and rejects non-GET requests. Do not use it as a production server. Publish the receiver before enabling the sender's production handoff button.

## Validation

The full suite passes 219 tests, including 13 dedicated protocol/adapter checks. Two-tab integration with the actual Strata sender passes for a cube generated through its export pipeline and a supplied native Spectrum robot project. Both arrive with three physical filament slots and a thumbnail; the transfer fragment is removed and Strata receives the acknowledgement. The received robot sourceFile has the same SHA-256 as the complete original archive, preserving its native mixture recipes and all other content. Normal Strata file download remains available. These checks do not certify slicing or physical printing.
