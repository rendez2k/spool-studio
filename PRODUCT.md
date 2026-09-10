# Spool Studio

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People managing their own 3D-printing filament stock, choosing filament for a print, and tracking physical reels across storage and printer use.

## Product Purpose

Maintain a private, per-user filament library that connects stock records, print preparation, shelf labels and physical spool tracking. Success means finding suitable stock and making an informed, explicit change without losing quantity uncertainty or reel identity.

## Operating Context

The persistent workflow groups are:

| Group | Destinations, in order |
| --- | --- |
| Your library | Collection, List, Import, Shelf & labels, Colour wheel |
| Prepare a print | Match |
| Print & track | Send printer, NFC, Spools |
| Support | Setup, Settings, Help |

Mobile quick navigation exposes Collection, Import, Match and Spools, plus a Menu dialog containing every destination and the theme control. Collection, List, Shelf & labels, Colour wheel and Match are views of the same library application.

## Capabilities and Constraints

- **Stock and import:** stock belongs to the signed-in user. Local import review lets the user inspect and correct extracted fields before explicitly saving approved records. Keep source text and images on the device; do not imply that the saved library itself is exclusively local.
- **Quantities:** unknown counts and remaining weights stay unknown until confirmed. Do not substitute zero, infer a full reel, or silently turn estimates into measured values. Assigning permanent IDs requires a confirmed roll count.
- **Print matching:** 3MF-based matches and consumption figures are estimates for review. Preserve material, colour and finish distinctions; similar colour alone does not establish suitability or interchangeability.
- **Physical spools:** permanent reel numbers follow the reel, independent of shelf position, and are never reused. A reel and its box can share a QR label. Shelf organisation, product grouping and physical reel identity remain distinct concepts.
- **Devices:** local bridges support printer workflows; Android NFC is a supported workflow, with a printer bridge alternative for iPhone. Make device and bridge prerequisites visible at the point of use.
- **Printer changes:** preserve review, explicit send and existing validation safeguards. The printer workflow sends generic material, finish and colour; it does not send temperatures, heating commands or a print job. Later tag scans or slicer jobs may replace these settings.

## Brand Commitments

Keep the Spool Studio name and existing blue spool logo. The user chose a compact UI inspired by HeroUI and shadcn, implemented with native HTML, shared CSS and JavaScript. This refresh is not a rebrand or a migration to React or either component library. Use clear UK English and concrete action labels.

## Evidence on Hand

The confirmed brief and existing interface establish these workflows. The shared shell is implemented in `out/studio.css` and `out/studio.js`; the existing logo is `out/icons/filament.svg`. These sources document implementation, not completed browser, accessibility or hardware testing.

Do not claim legal certification, universal barcode coverage, automatic spool identification or completed hardware tests without separate evidence. Keep private paths, account records, credentials and real user data out of documentation and examples.

## Product Principles

- Preserve user ownership and privacy across import, storage and device workflows.
- Keep review and explicit save/send steps visible and separate from preparation.
- Show uncertainty and provenance where they affect stock or print decisions.
- Preserve permanent reel identity and printer safeguards through UI changes.
