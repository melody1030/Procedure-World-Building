# Plan: a cyberpunk building grammar editor, as a Technique demo

## Context

Class 09 (PWB) slide 21, "Building Morphology Demo", shows a building made by a **shape grammar**
with its parameters on one side and its rules on the other. You can change any of them and the
building rebuilds at once:

```
BUILDING -> BASE SHAFT TOP
BASE     -> pier [S A]+ pier (mirrored)
SHAFT    -> FLOOR x 6
FLOOR    -> pier [A A]+ pier (mirrored)
TOP      -> parapet + cornice
```

Assignment 1 asks for "a procedural building system that allows to parametrize the creation of
buildings" and for "the variation of building types by zones, using maps to drive height or
building type".

The slide's example is a New York walk-up. This plan uses the same method for Blueprint City:
- **The look:** a rainy, rusty, dense voxel city at night. Dark masses and warm windows, with neon
  used sparingly (magenta, cyan, violet). Rooms are bolted onto walls, and pipes, AC units and
  signs crowd the facades.
- **The scale:** buildings sized from the city's own lots, and given heights by the city's zoning
  map.

**Goal:** a page in the homepage's Technique tab where the grammar is the building. You set:
- the footprint, the stages and floors, and the windows;
- the bay pattern of the street front;
- the details.

The page shows the building, the rules as they now read, and what came out of them. A building
can also be grown from a real lot in Blueprint City, with that lot's size, district and height
limit.

**Scope:** this plan covers the demo page and the grammar module it runs. Putting grammar
buildings on the city's lots is a later plan. That plan will keep the Landmark Tower and the
Corporate Megatower as signature buildings. The grammar builds into the same `Kit` and returns
the same `BuildingModel` as the library does, so that plan can use it as it is.

---

## 1. The grammar

### 1.1 Rules

```
BUILDING -> PLAN BASE SHAFT TOP
PLAN     -> bar | L | U | stepped
BASE     -> pier [ground pattern]+ pier  (mirrored)     h ground floor
SHAFT    -> STAGE+                                        one, or Stepped's three
STAGE    -> FLOOR x k
FLOOR    -> pier [upper pattern]+ pier   (mirrored)     h floor height
TOP      -> parapet + ROOF [+ CROWN]
ROOF     -> gear | garden | billboard | helipad
CROWN    -> band | cap
FRONT    -> n bays x bay width
A        -> window | balcony                              by the Balconies share
```

These rules add to the slide's:
- **Plan:** the footprint is made of rectangles (`world/buildings/massing.ts`).
  - L and U are wings of one depth round a court open to the street. Each wing end on the street
    is a front of its own, with its own bays and signs.
  - Too small a footprint for its court is built as a bar.
  - The facades run along the plan's outline. An outer corner gets a corner column. An inner
    corner keeps the bays 1.5 m clear, past the deepest thing a bay hangs out (a balcony).
- **Stages:** Bar, L and U rise in one stage. Stepped rises in three, the floors shared
  evenly, each 2 m back from the street front, leaving a terrace with a parapet.
- **Roof and crown:**
  - The roof is gear (tanks, HVAC, antennas, a stair hut), a garden with benches along the
    parapet, an 8 × 4 m billboard facing the street, or a helipad. A roof too small for a pad or
    a billboard gets gear.
  - Each roof has its own sliders: Fill for how much gear or planting, Pad size for the helipad.
    Parapet sets the parapet's height on the top and the terraces.
  - Gear is dealt from a shuffled deck of kinds, spread over the roof with room round each
    piece, so a full roof is varied rather than crowded.
  - Every roof has its stair hut in the back corner. A garden plants the whole roof round it,
    and a helipad sets the hut's strip aside before it sizes the pad.
  - The crown is a neon band round the parapet, or a stepped cap with the roof on top of it.

### 1.2 Bays

Each letter is one bay wide.

| Letter | Bay | Built from (parts in `buildings/parts.ts` where they exist) |
|---|---|---|
| A | window | a window (§1.3 window types), lit warm or dark; on the upper floors, by the Balconies share, a balcony instead: a door behind a slab and rail, with laundry, an AC unit or a planter |
| B | blank | a wall panel, in rust or grime |
| C | door | an entrance with a lit frame (ground floor) |
| S | shop front | glazing, a roller shutter, a neon sign band, and an awning with underglow |
| N | sign | a blade sign on the bay's left pier in front of a window, one color all the way up its column; never the first bay, whose left pier is the corner column |
| V | service | a vent grille, with pipes and ducts running down the wall |

**Filling the frontage:**
- n = floor((frontage − one pier) ÷ bay width), at least 1.
- The bays then stretch evenly to fill it exactly.
- The patterns are drawn from the seed (§1.3) and repeat from the left.
- Four draws in five are mirrored: the right half reflects the left. An odd middle bay takes the
  first letter; on the ground floor it becomes a door.

**The other faces:**
- The sides use the upper floors' pattern, with S, C and N read as A.
- The back is A, V and B in turns, where the pipes and the fire stairs go.

### 1.3 Parameters

The ranges follow the city:
- **Footprints** span its lots: 6 to 40 m, cut in 8 m lot units.
- **Floors** are its 3 m storey.
- **Height** reaches its center height, 140 m.

| Group | Parameter | Range | Default |
|---|---|---|---|
| Footprint | Shape | Bar, L, U (light court), Stepped | Bar |
| | Width (m) | 6–40 | 16 |
| | Depth (m) | 8–40 | 20 |
| Floors | Floors | 2–46 | 12 |
| | Ground floor (m) | 4–6 | 4.5 |
| Windows | Type | Punched, Ribbon, Glass | Punched |
| | Spacing (m), one bay | 1.5–4 | 2 |
| | Width (m) | 0.5 to the spacing less the piers | 1.25 |
| | Height (m) | 0.75–2.25 | 1.75 |
| | Lit | 0–1 | 0.55 |
| Facade | Balconies | 0–1 | 0.35 |
| Top | Roof | Gear, Garden, Billboard, Helipad | Gear |
| | Fill (gear, garden, billboard) | 0–1 | 0.5 |
| | Pad size (m, helipad) | 8–16, at most what the roof leaves beside the stair hut | 16 |
| | Parapet (m) | 0.5–2 | 0.75 |
| | Crown | None, Band, Cap | None |

**The patterns are drawn, not typed.** The upper floors' pattern is two to four letters: A first,
so every front has windows, then A, V or B by weight. The ground floor's pattern is two or three
letters and opens with a shop.

**Signs have no slider.** Each draw takes a sign share from 0 to 30%, and that share of the street
front's columns, never more than 30% of them, become N columns, set on the expanded row rather
than in the pattern (a two-letter pattern with one N would make half the front signs). On a
mirrored front a column goes with its reflection, so the signs stay symmetric.

**Balconies are a stochastic rule,** A -> window | balcony, not a letter: each window above the
ground floor draws its own number and is a balcony if it falls under the Balconies share. A
letter would repeat across the whole front with its pattern, so the slider could only add or
remove whole sets of columns; drawn window by window, it adds balconies a few at a time.

Each slot and each window draws its own numbers, so a slider only changes what it reaches.

The floor height is the city's 3 m. Making it a slider would break the city's storeys.

The stats show the **height tier** the floors make, using the city's thresholds: low under 20 m,
mid to 60 m, high above. They also show its color on the Height tint's scale.

### 1.4 Details and color

Toggles. Each draws on parts the library already has, and adds a few new ones.

- **Neon:**
  - edge strips;
  - floor bands;
  - the sign bays lit;
  - one accent color (magenta, cyan, violet, mint, amber).
- **Signs and screens:** blade signs, shop signs and rooftop billboards.
- **AC units:** in a seeded share of the A and L bays, with drip stains below.
- **Pipes and ducts:** down the V bays and the back.
- **Laundry and cages:** lines across the L bays, and cages on some windows.
- **Fire stairs:** zigzag stairs and catwalks on the back or a side.
- **Rooftop gear:** water tanks, HVAC units, a stair hut, antennas and dishes.
- **Weathering:**
  - rust streaks under ledges and AC units;
  - grime toward the base;
  - a few panels in a different shade.

  It is seeded, and drawn in vertex color, so it adds no draw calls.

**Palette:** the body and secondary colors come from the city's own (`PAL`):
- night concrete;
- slate;
- rust;
- wine;
- teal;
- indigo.

**Randomize** rolls a new seed. That draws new bay patterns and moves which windows are lit, where the AC
units sit, which signs appear and how the walls weather. It changes no parameter.

### 1.5 Style presets: the city's districts

Five presets, one per district. Each is a full set of parameters, facade shares, details and palette,
and each echoes the buildings that district has today.

| Preset | Footprint | Ground | Upper | Details | Echoes |
|---|---|---|---|---|---|
| Core | Stepped | S C S | A, glass windows | glass wall, crown band, helipad | Corporate Megatower |
| Commercial | Bar | S S | A A | blade signs, awnings, rooftop billboard, strong neon | Neon Commercial Tower |
| Megablock | U | S A | A V | balconies, AC, laundry, fire stairs | Modular Apartment Block, Stacked Megablock |
| Industrial | Bar | C B | A V B | ribbon windows, pipes and ducts, stacks and tanks, heavy rust | Research Lab Tower |
| Wealthy | Stepped | C A | A | planted terraces, warm light, little neon | Terraced Residential |

Choosing a preset sets every control. Moving a control after that shows the preset as "Custom".

### 1.6 The module

`world/buildings/grammar.ts` is pure, with no three.js and no React.

```ts
buildGrammar(params: GrammarParams, seed: number): { model: BuildingModel; derivation: Derivation; stats: GrammarStats }
```

- `model`: the library's two buckets, a lit body and the glowing parts. So it renders with the
  city's materials, and a building is two draw calls.
- `derivation`: the rule tree as it expanded. Each node holds its rule, its letter (for bays), its
  box and the boxes it placed. The page prints it and colors by it.
- `stats`:
  - height and tier;
  - footprint;
  - floors, windows and lit windows;
  - vertices and triangles;
  - build time.

A typical building must build in a few milliseconds, so every slider can rebuild live. The Bar at
its largest (46 floors on 40 × 40 m) takes about 35 ms with no balconies, about 55 ms at the default
35%, and 85–110 ms with every window a balcony. With stages and courts the largest stays
under about 170 ms.

---

## 2. The page

**Route:** `/grammar`, full screen like `/buildings`.

**Ways in from the Technique tab:**
- The Building morphology card gets a "Building grammar" chip.
- A new studio card, **Building grammar**, sits next to Building library.

**Layout:** three columns at desktop width, as in slide 21. The panels are the city's glass
panels (`world/ui/kit.tsx`).

| Left: parameters | Center: the building | Right: details and rules |
|---|---|---|
| Footprint, Floors and Windows sliders (§1.3) | The building on a lot slab with a sidewalk and a wet street edge | Style preset, Randomize, palette, neon color |
| Facade: the Balconies slider; the bay patterns and the signs are drawn from the seed. Top: Roof and Crown | the city's night lighting and bloom, so lit windows and neon read as they do in `/world` | Detail toggles (§1.4) |
| | orbit controls, and the city's grid lines on every voxel | **Grammar:** the rules as they read now, with the current numbers |
| | | **Stats:** height and tier, footprint, floors and windows, vertices and triangles, build time |

**Color by rule:** a toggle that tints the building by where each part came from, so the grammar
can be read on the building:
- BASE, each STAGE, and TOP each get a color;
- each bay letter gets its own hue.

Hovering a line in the Grammar printout highlights the parts it made.

**From a city lot:** a panel at the top of the left column that ties the grammar to the city.
- Pick a seed (default `blueprint`) and a lot, or "Random lot".
- The page generates that city's terrain and lots once. That takes a few seconds, with a spinner.
- It then sets the controls from the lot:
  - **the preset** from its district;
  - **the frontage and depth** from its size less the gap;
  - **the floors** from its height: the zoning limit, capped by the slender rule.
- A small map shows where the lot is, tinted by the Height map.
- This is the slide's other half: zones and maps drive the building's height and type.

**The URL holds the state** (`?shape=u&floors=12&up=ALV&gr=SA&seed=…`), so a building can be
linked, and the docs can link to a few.

---

## 3. Files

| File | Change |
|---|---|
| `world/buildings/grammar.ts` (new) | rules, bays, stages, roofs, details, presets; `buildGrammar` |
| `world/buildings/massing.ts` (new) | the plans and stages as rectangles, and the outline the facades run along |
| `world/buildings/GrammarPage.tsx` (new) | the page: panels, view, printout, stats, the city lot panel, URL state |
| `world/buildings/parts.ts` | new parts: roller shutter, ribbon windows, zigzag fire stairs, weathering stains |
| `App.tsx` | the `/grammar` route and its title |
| `home/content.ts` | the Building grammar studio card, and the chip on the Building morphology card |
| `docs/techniques/building-morphology.md` | a section on the grammar, with screenshots and linked examples |
| `site/src/world/README.md` | dev log entry |

---

## 4. Milestones

1. **Grammar core** (built 2026-11-12):
   - the Bar footprint;
   - BASE, one STAGE, and TOP with a parapet and rooftop gear;
   - bays A, B, C and S;
   - the page with the Footprint, Floors and Windows sliders, the night lighting, and the stats
     with the tier.
2. **Facade grammar** (built 2026-11-12):
   - the bay patterns and the signs drawn from the seed, signs on at most 30% of the front;
   - the Balconies slider;
   - bays N and V, and the balcony rule A -> window | balcony;
   - the three window types;
   - the Grammar printout.
3. **Massing** (built 2026-11-16):
   - L, U and Stepped;
   - Stepped's stages and terraces;
   - roofs and crowns.
4. **The city's look:**
   - the detail toggles, weathering, palettes and neon color;
   - Randomize;
   - the five district presets;
   - Color by rule and hover highlighting;
   - URL state.
5. **From a city lot, and docs:**
   - the city lot panel and its map;
   - the Technique tab card and chip;
   - the technique page section with screenshots;
   - the dev log.

---

## 5. Verification

- **The rules hold:**
  - the bay count matches the formula, and the bays fill the frontage exactly;
  - a mirrored pattern is symmetric;
  - the ground floor plus floors × 3 m (plus the roof) equal the height in the stats;
  - each of Stepped's stages stands inside the one below.
- **Every combination builds:**
  - each shape at the ends of every slider, with every bay letter, builds;
  - no part reaches past the footprint (`Kit.clip`), and `findClashes` stays at zero.
- **Speed:** a typical building builds in a few milliseconds, the largest in 35–170 ms (§1.3),
  and dragging a slider stays smooth.
- **It looks like the city:**
  - each preset sits beside the `/buildings` library at the same lighting and reads as its
    district;
  - a few random lots from `blueprint` and `harbor` make buildings of the right size and tier for
    where they stand.
- **The URL** round-trips: a link opens the same building.
- `npm run build` passes, and the console stays clean.
