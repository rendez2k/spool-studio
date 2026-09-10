---
name: Spool Studio
description: Compact native-HTML tools for filament stock and print workflows.
colors:
  bg: "#f7f8fc"
  surface: "#fff"
  rail: "#fff"
  text: "#222636"
  muted: "#606779"
  line: "#e0e4ed"
  accent: "#4656c9"
  accent-hover: "#3644a9"
  on-accent: "#fff"
  tint: "#eef0ff"
  track: "#e7eaf5"
  dark-bg: "#14161f"
  dark-surface: "#1c202d"
  dark-rail: "#191c27"
  dark-text: "#edf0fb"
  dark-muted: "#aab2c8"
  dark-line: "#343a50"
  dark-accent: "#b0baff"
  dark-accent-hover: "#ccd2ff"
  dark-on-accent: "#202752"
  dark-tint: "#2b3150"
  dark-track: "#30374d"
typography:
  headline:
    fontFamily: 'ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
    fontSize: "clamp(1.5rem,2.5vw,1.875rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-.035em"
  body:
    fontFamily: 'ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
    fontSize: "14px"
    lineHeight: 1.5
  label:
    fontSize: ".8125rem"
    fontWeight: 600
    lineHeight: 1.45
rounded:
  surface: "14px"
  control: "10px"
  nav: "9px"
  popover: "12px"
  dialog: "18px"
spacing:
  action-gap: "8px"
  field-gap: "12px"
  grid-gap: "16px"
  section-gap: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    padding: "7px 13px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.on-accent}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "7px 13px"
    typography: "{typography.label}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "8px 11px"
  nav-active:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.accent}"
    rounded: "{rounded.nav}"
    padding: "7px 12px"
  import-badge:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.accent}"
    padding: "3px 8px"
  card:
    rounded: "{rounded.surface}"
---

# Design System: Spool Studio

## Overview

Spool Studio keeps its existing blue spool identity with a compact, HeroUI/shadcn-inspired interface. Shared native HTML, CSS and JavaScript provide the system; those references describe appearance and interaction, not installed React components.

The shared shell favours clear workflow groups, restrained surfaces and consistent controls. Filament colour is product information, while the blue interface accent identifies actions and selection. This document records the shared rules in `out/studio.css` and `out/studio.js`; page styles still supply specialised layouts. It is not a claim that visual or hardware verification is complete.

**Key Characteristics:**

- Persistent workflow navigation.
- Compact controls with visible focus and selection.
- Light and dark semantic surfaces.
- Native dialogs, disclosures and form controls.

## Colors

The frontmatter maps to the shared CSS custom properties. Light colours are defined on `:root`; `.studio-ui.dark` overrides the corresponding roles. The `dark-` prefix documents those alternate values, not additional CSS property names.

Use accent/on-accent for primary actions, tint/accent for selected controls, and surface/line for boundaries. Muted text supports metadata and help. Track is the background for quantity graphics. Filament swatches retain their own data colours and finish labels; do not recolour them to match the theme or use hue alone to communicate state.

## Typography

Use the system sans-serif stack throughout. Page headings use the fluid headline token; section headings are (1.0625rem), minor headings (.9375rem), and supporting labels (.8125rem). Compact metadata commonly uses (.75rem). Workflow group labels and mobile captions use (10px), so reserve them for short navigation text. Preserve readable units, uncertainty labels and finish names at every density.

## Layout

Desktop uses a persistent workflow rail (212px), narrowed to (184px) at viewport widths of (1100px) or less. Main library padding is (26px 32px); secondary pages cap content width at (1240px), with the NFC main region capped at (800px). The library rail is sticky; secondary-page rails are fixed and their content is offset accordingly.

At (800px) or less, the rail is hidden and the bottom navigation contains Collection, Import, Match, Spools and Menu. Menu opens a native dialog with every workflow group and a theme control. Reserve bottom clearance of `72px + env(safe-area-inset-bottom)`; sticky review/programming actions sit above that clearance. Bottom items have a minimum height of (48px), and workflow links in the mobile menu use (44px).

Collection grids use auto-fill columns with a minimum width of (230px), reduced to (210px) at the intermediate breakpoint, then two columns on mobile. At (420px) or less, cards become single-column rows. Compact-card mode also uses rows on mobile. Filters move from a three-column popover to a single scrollable column on mobile. These are shared-shell breakpoints, not an exhaustive list of page-specific breakpoints.

## Elevation & Depth

The shared stylesheet uses surface tones and thin borders rather than introducing shadow tokens. Dialog backdrops dim the page; filters and sticky actions use stacking order to remain usable. Preserve specialised page styling unless intentionally harmonised. The sidecar records the shared backdrop and stacking levels.

## Shapes

Use the surface radius for cards and task panels, the control radius for fields and buttons, and the nav radius for route links. Popovers and compact grouped panels use the popover radius; dialogs use the dialog radius. Swatches and small badges can use tighter corners. Keep the existing spool logo asset and its recognisable shape.

## Components

- **Buttons:** secondary controls use surface/text with a line border; primary actions use accent/on-accent. Default minimum height is (36px). Hover changes colour without movement; disabled buttons reduce opacity and use a blocked cursor. Preserve each action's explicit save, review or send meaning.
- **Fields:** native inputs, selects and textareas share surface/text, a line border and a minimum height of (38px). Keep persistent labels; placeholders are examples, not labels. Checkboxes use the accent colour.
- **Focus and motion:** buttons, fields, summaries and links receive a (2px) accent outline with (3px) offset on `:focus-visible`. Button colour transitions use (140ms ease). Reduced-motion preference disables shared transitions and smooth scrolling.
- **Navigation:** keep the group and destination order in `PRODUCT.md`. Links use inline stroke SVGs alongside text and `aria-current="page"` for the active route. Library views use `/?view=cards`, `table`, `shelf`, `wheel` or `match`; secondary workflows use their existing HTML routes. Keep the mobile Menu complete even when a destination has no bottom shortcut. Theme changes use the existing preference and theme controls.
- **Cards and badges:** collection cards separate the filament sample, identity, stock/usage information and actions. Preserve finish and unknown-quantity text even when compact layouts hide decorative badges. Import badges distinguish review states with words, not only colour.
- **Disclosures and dialogs:** use native `details`/`summary` for optional filters, help and setup. Filters support Escape and outside-click dismissal. Menu uses `dialog.showModal()`, an explicit close button and labelled navigation. Preserve keyboard access and focus visibility when composing these primitives.
- **Print:** hide the shared rail, bottom navigation, workflow groups and Menu in print; retain the specialised label-printing behaviour.

## Do's and Don'ts

- Do keep the existing blue spool logo and shared semantic tokens.
- Do preserve route access, visible focus, uncertainty labels and explicit review/save/send steps.
- Do keep privacy and device prerequisites close to the relevant action.
- Don't describe the refresh as a rebrand or a React, HeroUI or shadcn dependency migration.
- Don't replace material or finish information with a colour-only cue.
- Don't present source inspection as completed browser, accessibility or hardware testing.
