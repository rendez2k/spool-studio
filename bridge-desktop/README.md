# Spool Studio Bridge (desktop beta)

Users download the application from https://spool-studio.uk/bridge.html — they do not need Git, Node.js or access to the repository.

1. Open Printer in Spool Studio. Create a printer key and download the private configuration.
2. Import that file into the desktop app on a computer on the printer's network.
3. Check the connection, then Start. Keep the computer awake and the bridge running.

Closing the window keeps the bridge in the tray/menu bar. Stop prevents new requests and lets an in-flight request finish; Quit exits safely. On Windows, opt into Start with Windows and reconnect automatically. It starts in the tray after user sign-in, checks the printer and retries offline checks every 30 seconds. Stop cancels reconnecting for the current session; disable the option to remove the Windows startup entry. macOS remains manual in this beta. Do not run multiple bridge instances using the same key.

Imported credentials are encrypted using the operating system's secure storage. The original downloaded JSON still contains a secret: keep it private and delete it when no longer needed. Remove configuration deletes the app's copy; revoking the key on the website disables that key.

This beta is not Windows-signed or Apple-notarised. Operating systems may block it. Do not disable security protections; use the advanced source/Docker option or wait for a signed release.

This companion sends reviewed printer settings. It is not the separate Spoolman weight-sync bridge and does not measure consumption.

## Docker (advanced)

The compose file targets Linux amd64. Place the private printer JSON beside it, accessible to container user 1000 without making it world-readable. No inbound ports are published. Run a read-only check before starting the service. The computer must be on the printer's network.

## Maintainers

Run root npm ci, then npm ci --prefix bridge-desktop and npm run package --prefix bridge-desktop. The manually dispatched bridge-release workflow builds Windows x64 and Mac Intel/Apple Silicon packages and the container image. Publish downloads only after all checks pass. Never include private configurations or account data in releases.
