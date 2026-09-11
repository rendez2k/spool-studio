# Adding filament on a phone

Mobile navigation provides Collection, Add spools, Scan barcode, NFC tags and Menu. Import, matching and usage remain available through Menu. The NFC landing page also offers Scan barcode and Add manually; its existing live batch and NFC workflow remain unchanged.

`/?add=barcode` opens the signed-in library's Add spools form with Barcode selected. `/?add=manual` opens manual entry. The intent waits for the library to load and is removed from the URL after opening, so refreshes do not reopen a dismissed form. Existing drafts are never replaced by a navigation shortcut. Supported installed-app shortcut menus include these routes; updating those menus depends on the browser.

Opening a shortcut does not access the camera, send a barcode to a provider or save stock. The user taps Scan barcode with camera, grants permission and reviews the matched template before Add to library. Unknown barcodes retain manual entry and the separately consented external catalogue lookup. This change does not add Firecrawl or expand catalogue coverage.
