# App releases

`releases.json` is the single source of truth for the visible app version and public What’s new page. The current numbered release starts at 1.0.0; earlier work is summarised in that entry rather than assigned invented historic versions.

Before each subsequent production release, run:

```sh
npm run release -- patch "Short release title" "User-facing improvement" "Another improvement"
```

This automatically increments the patch version and prepends dated notes. Use `minor` for a larger feature release or `major` for a breaking change. Review the notes and include `releases.json` in the release commit. Do not bump for each local test or rebuild. Never put account IDs, email contents or private deployment configuration into release notes.

Both build paths embed the release number into the HTML, so an already open page keeps its own version. The megaphone opens public release notes in a new tab without discarding an import or interrupting NFC writing. The App & device build fingerprint remains a separate, content-derived update check. Production `app-release.json` reports both `version` (technical fingerprint) and `displayVersion` (human release).

Run `npm test`, commit/push the completed changes, deploy and verify the live release endpoint and What’s new page. No version bump happens merely by visiting or installing the app.

The megaphone gains a small dot and tinted background for unread notes. `release.js` remembers the highest viewed release in this browser's `spool-studio-release-seen` localStorage key, not in the account database. A visible latest-release heading on the notes page marks that version read; a background tab or an old release cannot clear a newer highlight. Storage events update other open tabs. If browser storage is blocked, persistence across pages is unavailable, but the app remains usable.

On load and when returning to an app tab, a throttled public-release check can highlight newer notes without reloading the page, replacing its displayed running version or disturbing a draft/NFC session. Network failures retain the known version. There is no background polling timer or analytics request. Reading on one device does not mark notes read on another.
