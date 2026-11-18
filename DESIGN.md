---
name: Blueprint City
description: A navy-ink blueprint interface of glass panels floating over a lit voxel diorama.
colors:
  ink-glass: "#0b1626"
  ink-field: "#0e1c30"
  ink-knob-off: "#24384f"
  page: "#070b12"
  stage: "#0a0f17"
  rule: "#7db4e6"
  paper-text: "#dce8f5"
  label: "#9db2c8"
  note: "#6f86a0"
  neon-cyan: "#5ad8ff"
  slider-thumb: "#f2f8ff"
  lit-amber: "#ffd27a"
  blueprint-cyan: "#22d3ee"
  sky-day: "#b9d3e8"
  plinth-top: "#243049"
  grass-low: "#46685a"
  grass-high: "#6a8a78"
  river: "#1f5f7a"
  asphalt: "#3c4049"
  lawn: "#3f7656"
typography:
  heading:
    fontFamily: "Share Tech, -apple-system, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.14em"
  subheading:
    fontFamily: "Share Tech, -apple-system, Segoe UI, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.14em"
  label:
    fontFamily: "Roboto, -apple-system, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
  note:
    fontFamily: "Roboto, -apple-system, Segoe UI, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.375
  value:
    fontFamily: "ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "11px"
    fontWeight: 400
rounded:
  chip: "6px"
  control: "8px"
  card: "14px"
  pill: "9999px"
spacing:
  tight: "8px"
  row: "14px"
  panel: "20px"
components:
  panel-glass:
    backgroundColor: "{colors.ink-glass}"
    textColor: "{colors.paper-text}"
    rounded: "{rounded.card}"
    padding: "20px"
  button:
    backgroundColor: "{colors.ink-field}"
    textColor: "{colors.paper-text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "6px 10px"
  value-chip:
    backgroundColor: "{colors.ink-field}"
    textColor: "{colors.lit-amber}"
    typography: "{typography.value}"
    rounded: "{rounded.chip}"
    padding: "2px 6px"
  select:
    backgroundColor: "{colors.ink-field}"
    textColor: "{colors.paper-text}"
    rounded: "{rounded.control}"
    padding: "6px 32px 6px 10px"
---

# Design System: Blueprint City

## Overview

**Creative North Star: "The Drafting Table"**

The interface is a drafting table set beside a lit model. The model, a terraced voxel island in cool daylight, is the subject; the controls are the blueprint paper around it: deep navy ink, hairline pale-blue rules, small precise type. Cyan marks what you can touch. Amber marks what has been measured. A number never looks like a button, and a button never looks like a number.

Density is high but quiet. Panels are translucent glass that also dims the bright scene behind them, so 12px text keeps its contrast without a solid slab hiding the city. Nothing bounces; panels slide and colors fade. The product's job is to make the rules legible (PRODUCT.md), so every control carries a hover explanation in plain sentences.

The older week pages use a sibling system, slate and cyan glass with a single cyan accent (`site/STYLE_GUIDE.md`). It is the legacy relative: same glass-over-3D idea, different ink. New work for `/world` follows this file.

**Key Characteristics:**
- Navy ink glass over a bright diorama; the scene is never hidden behind chrome.
- Two voices of color: cyan for interaction, amber for values.
- Hairline rules instead of heavy borders or shadows.
- Share Tech for headings only; Roboto for reading; monospace for numbers.
- Everything explains itself on hover, in plain sentences.

## Colors

A cold, muted world lit by two UI accents: the city glows so the chrome does not have to.

### Primary
- **Neon Cyan** (#5ad8ff): Interaction. Focus and hover borders, selected segments, slider thumb ring, change badges. Rare and always meaningful.
- **Blueprint Cyan** (#22d3ee): The site's older accent; the layer being printed glows in it, and the plinth rim uses it.

### Secondary
- **Lit Amber** (#ffd27a): Values only: the chip beside a parameter, at 10% fill with amber mono text. Echoes the city's lit windows.

### Neutral
- **Ink Glass** (#0b1626, 75% with 24px blur and brightness 0.7): Panel surface.
- **Ink Field** (#0e1c30, 60 to 70%): Controls sitting on a panel: buttons, selects, segmented groups.
- **Rule** (#7db4e6 at 10 to 25%): Every border and hairline.
- **Paper Text** (#dce8f5): Headings, selected and primary text.
- **Label** (#9db2c8): Parameter names.
- **Note** (#6f86a0): Hints, subheadings, inactive chevrons.
- **Page** (#070b12) and **Stage** (#0a0f17): Behind the canvas.

### Scene
Daylight sky (#b9d3e8), navy plinth strata starting at #243049, muted grass (#46685a to #6a8a78), river (#1f5f7a), asphalt (#3c4049), tended lawns (#3f7656). Defined in `site/src/world/palette.ts`; the code is the source of truth for scene colors.

### Named Rules
**The Two Voices Rule.** Cyan is for things you can act on; amber is for things that are measured. Never swap them, never add a third accent to the UI.

**The City Glows Rule.** UI color stays cold and muted so the lit city carries the saturation.

## Typography

**Display Font:** Share Tech (regular weight only; bold is synthesized)
**Body Font:** Roboto
**Label/Mono Font:** system monospace

**Character:** A technical stencil for titles, a plain humanist sans for reading, tabular mono for numbers: the title block, the notes and the dimensions of a drawing.

### Hierarchy
- **Heading** (700, 13px, 0.14em tracking, uppercase): Panel sections and titles. Uppercase by CSS, never by typing capitals.
- **Subheading** (700, 11px, 0.14em, uppercase, Note color): Groups inside a tab.
- **Label** (500, 12px, Label color): Parameter names in sentence case; buttons.
- **Note** (400, 11px, 1.375 line height): Hints and hover bubbles.
- **Value** (mono, 11px, tabular figures, amber): Numbers and seeds, fixed decimals so they do not jump.

### Named Rules
**The Short Stencil Rule.** Share Tech is for short headings only; never set a sentence in it.

## Layout

A full-height stage with the canvas filling it and floating panels over its edges. Panels are tab or accordion columns, about 16rem wide, scrolling inside themselves, inset 1rem from the stage edge. Section spacing 14px, tight groups 8px, panel padding 20px. `/world` is desktop only: no phone layout is designed or verified. Panels close with the keyboard (`E` in the weeks; keep one shortcut per surface) so the city can be seen whole.

## Elevation & Depth

Depth is optical, not shadowed. Panels are translucent navy with a 24px backdrop blur and a brightness drop so they separate from the bright scene; a faint soft shadow (`0 12px 32px rgba(8,16,30,0.35)`) only lifts the glass. Inside a panel, depth is tonal: Ink Field controls over Ink Glass, divided by hairlines.

### Named Rules
**The Hairline Rule.** Borders are 1px Rule color at 10 to 25% opacity. Never thicker, never opaque.

## Shapes

Small, softened rectangles. Cards 14px, controls 8px, chips 6px, and full pills only for toggles and sliders. The slider is a 3px filled track with a small pale thumb ringed in cyan and a tick at the default value.

## Components

### Panels
Ink Glass with the Hairline border, 14px corners, 20px padding, scrolling inside. Sections are accordions with a Heading, a 14px cyan icon at 70%, and a count badge when settings inside have changed.

### Parameter Row
The name on the left in Label type, the value in an amber chip on the right, the slider below. The name carries a hover bubble: an ink-glass speech bubble placed just right of the panel with a tail pointing at the name, portaled to the page so scrolling never clips it. It also opens on keyboard focus.

### Buttons
- **Shape:** 8px corners, 1px Rule border, Ink Field at 60%.
- **Hover:** border moves to Neon Cyan at 50% and text to white; 150 ms color fade.

### Segmented and Tabs
A shared Ink Field track with a 1px rule; the selected item gets Neon Cyan fill at 15% and a 40% cyan border. Tabs use a bottom hairline and a keyboard-arrow model.

### Select and Switch
Select: Ink Field, 8px corners, 12px text, a drawn chevron 14px, hover border brightens, focus border Neon Cyan at 60%. Switch: 28px by 16px pill, off #24384f, on cyan, pale knob sliding 200 ms.

### Legend
A wrapping row of 8px swatches with Note-type labels, as on a map.

## Do's and Don'ts

### Do:
- **Do** keep cyan for controls and amber for values (The Two Voices Rule).
- **Do** give every control a one or two sentence hover explanation in plain American English.
- **Do** use the kit in `site/src/world/ui/kit.tsx` before writing a new control; extend it rather than restyling in place.
- **Do** keep panels translucent and dimming so the scene shows through.
- **Do** fix the decimals of every shown number.

### Don't:
- **Don't** add a second UI accent; amber, pink and lime are for data only.
- **Don't** use solid opaque panels, heavy borders or hard shadows.
- **Don't** animate layout size; slide, fade or recolor instead, 150 to 300 ms.
- **Don't** set long text in Share Tech.
- **Don't** design for phone widths in `/world`.
- **Don't** use em dashes in interface descriptions.
