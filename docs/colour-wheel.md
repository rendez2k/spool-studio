# Colour wheel

Choose **Colour wheel** in the library navigation. This is a private, read-only view of the current account's available rolls/refills, with the existing brand, material, colour, search and purchase-date filters applied. It does not alter shelf numbering, stock, NFC tags or tool assignments.

The outer ring orders saved swatches by HSL hue; slice angle represents relative roll count **within that ring**, not a fixed hue angle. Named white/black/grey/silver shades and low-chroma swatches sit on an inner ring ordered light to dark. Ring totals are shown separately: equal angles on different rings need not represent equal counts. The centre reports plotted rolls, not grams remaining.

Exact brand/product/material/finish/shade/hex/source combinations are combined. Manufacturer resolution follows the existing colour catalogue rules; manual overrides remain manual. Colour matching is not physical measurement or a calibrated screen guarantee. Used entries and depleted individual reels are excluded. Multicolour entries, invalid hex values and unknown counts appear in a separate list and never receive an invented count or single-colour slice.

Tap/click a slice or use **Explore a shade** to inspect its brand, product, finish, roll count, hex and colour source. **View matching stock** returns to filtered collection entries without saving anything. Arrow keys navigate chart slices and library tabs. Hover/focus pauses motion; selecting a shade stops it until explicitly played again. The OS reduced-motion preference disables rotation. Selecting a shade and motion state stay local; no new backend or analytics is involved.

The wheel uses all matching entries, not the collection's current page. CSV export includes plotted groups; the off-wheel list remains visible separately. Core tests cover quantities, neutral separation, missing/multicolour values, overrides and partial depletion. Synthetic desktop/mobile browser checks cover layout, selecting a shade and pausing. Real data remains in the authenticated app, never in public fixtures.
