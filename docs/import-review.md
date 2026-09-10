# Compact import review

Gmail, CSV, photo and pasted text all feed the same private review table. Gmail reads message bodies only after **Review selected orders**; photo OCR and CSV extraction also proceed directly to review. Parsing is on-device and rule-based, not an AI or guaranteed order reconciliation service. Source text remains editable under **Choose or change import source**.

The table shows shade, brand/range/finish, quantity, weight, cost per roll and a library check. **Review** expands one row for corrections, warnings, source text and matching saved purchases. Unknown prices remain unknown; order totals are not automatically treated as per-roll costs.

- **Similar stock in library** uses the existing conservative duplicate check. It does not establish the same purchase, and does not silently merge stock.
- **Repeated in this import** flags similar rows within this batch. Separate genuine purchases may still be selected deliberately.
- **Needs details** flags missing identity/colour or unknown finish, packaging, quantity or weight. Unknown quantity and weight remain permitted, not invented.
- **New to library** means no similar entry was found, not a guarantee of novelty or parser accuracy.

Possible duplicates start unselected. **Select new entries (all pages)** excludes similar/repeated/needs-details rows; individual selection remains available. Editing an unselected row does not add it. One final approval is still required. Pagination retains edits and selections; save errors return to the affected page. Costs-only mode retains purchase matching and explicit replacement approval, with no stock creation.

Email text is never rendered as HTML. Account changes clear drafts, source changes revoke approval, and saving retains account/revision checks and idempotent retries. No mailbox scanning, stock writes or source uploads happen simply by opening the page.
