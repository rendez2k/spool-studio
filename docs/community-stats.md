# Community roll total

App & device shows a combined available-roll count across all current libraries in this Netlify deployment. It includes refills, excludes used-up entries/reels and unknown or invalid quantities, and does not include legacy sites or another deployment. It counts declared inventory, not verified ownership or unique humans.

If an item has permanent reel records, its available physical reels replace its purchase count; otherwise its original known roll count is used. Counts are joined by account and item ID to prevent cross-account collisions. Orphan reel records are not counted. Account data erasure removes that inventory from subsequent totals.

`GET /api/community-stats` requires a verified Clerk session. The database aggregates internally and returns only one scalar; the response contains `availableRolls` and `asOf`. No account IDs/counts, names, brands, materials, prices or individual records are returned. Filters and non-GET methods are rejected. Errors display unavailable rather than a fabricated zero. The endpoint and client do not persist a historical series or send analytics. The snapshot is refreshed when App & device opens or the user retries after an error; it is not polled.

The privacy notice describes this aggregate display. This limited roll total does not make individual libraries public. Existing privacy-review items remain outstanding; no claim of legal certification is made.
