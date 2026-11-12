# Plan: Blueprint City's morphology, from frontage lots and zoning maps

## Context

Class 09 (PWB) described a city's form as the work of a few layers:
- the streets;
- **plot subdivision** along the street frontage;
- a **zoning map** that sets how tall each place may build and what kind of building goes there;
- the buildings that fill each plot within those limits.

Blueprint City (`/world`) already has most of these layers. Each one is a constant, though, and you can't see any of them:

- `terrain/districts.ts` already cuts lots along the frontage, as Cities: Skylines does. Its header says "Nothing here is tunable".
- `city/placement.ts` sets a building's height from its district's range times the lot's density. Density comes from distance to the plaza. You can't see that map, and nothing tells you why a building is tall.
- The building type is a seeded pick among the archetypes that list the district and fit the lot. A 14 m lot in the core can be given a tower made for 140 m.

**Goal:** the city's form reads from two maps that you can see in Layers, tune in Build, and ask about in the inspector:
- **frontage**: how the land is cut along the streets;
- **zoning**: how tall each place may build and what kind of building goes there.

Every building can say why it is that tall and that kind.

**Scope:** `/world` only. The streets stay as they are: this plan reads the WFC network and does not change it. The building library gets no new archetypes. Each archetype only learns which height tiers it suits.

---

## 1. How it works today

| Step | Where | What it does | Tunable? |
|---|---|---|---|
| Fields | `districts.ts` §1 | access (distance along the streets from the plaza), frontage (nearest road cell, whether it is on an avenue), buildable, height rank, river distance | no |
| Districts | `districts.ts` §2 | core, commercial, megablock, industrial, wealthy, then smoothed into areas | no |
| Density | `districts.ts` §3 | district base · (1 − 0.5 · access / span) | no |
| Lots | `districts.ts` §4–6 | street sides walked in ZONE (8 m) cells, each district's width and depth in cells; through lots; corner lots; small lots merged | no |
| Height | `placement.ts` | `HEIGHTS[district]` lerped by density, × 0.75–1 random, capped at SLENDER × narrow side | no |
| Type | `placement.ts` | archetypes whose `districts` list the lot's district and whose `MIN_SIDE` fits, then fallbacks | no |

What the viewer gets today:
- the Districts tint;
- lot outlines;
- in the inspector, a building's type, district, size and lot.

**What is missing:**
1. A lot doesn't record its frontage. It doesn't know whether it faces an avenue, a side street or two streets, or whether it is a corner.
2. No height map exists as data, so no tint can show one.
3. Type ignores height, so a tall archetype can be squashed and a low one stretched.
4. All of it is constants.

---

## 2. Frontage subdivision

### 2.1 Each lot records its frontage

`Lot` gains four fields, filled in where each lot is cut:

```ts
/** The street the lot fronts: an avenue or a side street. */
street: "avenue" | "side";
/** Length of the lot's front edge, in meters. */
frontage: number;
/** A corner lot (packed in step 5), fronting two streets. */
corner: boolean;
/** A through lot (a block shallower than THROUGH_BLOCK), fronting a street at each end. */
through: boolean;
```

The street walk knows each lot's street. A corner-pass lot reads the paving straight out from its front edge: an avenue if that paving lies along a main street or is the plaza. An edge fronts paving when road, verge or plaza lies within 2 m of it along at least a quarter of its length (`frontedEdges`). A corner lot has a side edge that fronts paving; a through lot, its back edge. A merged lot fronts an avenue if either half did.

### 2.2 Tint: Frontage

A new ground tint, **Frontage**, colors each lot by what it fronts. A lot takes the first kind that applies:
- corner (pink);
- through (lime);
- avenue (amber);
- side street (sky blue).

A 1.5 m strip along each lot's front edge is drawn brighter, so you can see which way it faces. A legend shows each kind's share of the lots.

---

## 3. Zoning maps

A new pure module, `city/zoning.ts`, builds two maps per 2 m cell after the districts. `planBuildings` reads both.

### 3.1 Height map: the height limit

The limit at each cell, in meters (as built):

```
limit = scale · (lo + (hi − lo) · density · skyline · variety)    the district's range
```

- **District range:** the old `HEIGHTS` table (now in `city/zoning.ts`) is the floor and ceiling of each district. `density` is the district's base density, so busy districts reach further up their range. `scale` is `zoning.peak` over 140 m, so every range follows the center height.
- **The skyline:** 1 at the plaza, halving every FALLOFF (220 m) along the streets (access, not straight-line distance). Far out, a district builds near its floor.
- **Variety:** slow noise in patches about 48 m across, `1 − VARIETY · (1 − noise)`. VARIETY is 0.25, so it spans the same 0.75–1 as the old per-lot random factor, but heights now vary in patches, not lot by lot.
- **Smoothing:** one 3 × 3 pass over the cells with a district, so neighbors step rather than jump.

A lot's limit is its center cell's. A building's height is the smaller of that limit and SLENDER × its narrower side, and at least 12 m. Each plan records its limit and what held it down (the slender rule, a lower tier, or nothing).

**Defaults, matched in milestone 3:** peak 140 m, falloff 220 m (the old density fell off linearly to half at the city's reach, about 220 m on every seed tried), variety 0.25. Falloff and variety stay constants; only the peak is a setting (§4). Mean heights on five seeds stay within 2 m of the old ones.

### 3.2 Use map: district plus height tier

The district stays the use. Each height is sorted into a tier:

| Tier | Height |
|---|---|
| low | under 20 m |
| mid | 20–60 m |
| high | over 60 m |

Each archetype in `buildings/registry.ts` gains `tiers`, the tiers it reads well at, next to `districts`; `MIN_SIDE` moved there as `minSide`. Each was checked in the `/buildings` preview (`?h=`, `?w=`, `?d=` build the whole library at one size) at 16, 40 and 90 m on a 15 × 22 m footprint, and the height each one actually builds was measured from 12 to 120 m. Three never build under a floor, whatever height is asked; they keep it as `minHeight`, so a lot whose height is more than 3 m under it does not take them.

| Archetype | Districts | Tiers | Builds no lower than |
|---|---|---|---|
| Corporate Megatower | core | high | 36 m |
| Neon Commercial Tower | commercial | mid, high | — |
| Residential Skyscraper | megablock, core | mid, high | 46 m |
| Research Lab Tower | industrial, core | low, mid, high | — |
| Modular Apartment Block | megablock | low, mid | — |
| Twin-Tower Complex | megablock | mid | — |
| Stacked Megablock | megablock, commercial | mid | 32 m |
| Vertical Neighborhood | megablock | mid | — |
| Terraced Residential | wealthy, megablock | low, mid | — |
| Tower and Annex | megablock, commercial | mid, high | — |

Three changes from the proposal, all from the measurements:
- The Research Lab Tower follows the asked height down to 11 m and reads as a low lab block at 16 m: it takes low too, which closes the industrial low-rise gap.
- Terraced Residential steps back to about 33 m and reads well at 28 m: it takes mid too, which closes the wealthy mid-rise gap.
- The Residential Skyscraper builds faithfully from 46 m: it takes mid too, with its floor keeping it off lower lots.

**The pick**, in order:
1. district ∧ tier ∧ fits; else the district's slimmest for its tier, if within 1.5 m of fitting (so a narrow megablock lot still gets a residential block, not a shop tower);
2. district ∧ fits a lower tier, with the height brought down to that tier's top (never up: that would break the limit);
3. tier ∧ fits, any district; else the slimmest of those within 1.5 m of fitting;
4. the old slimmest fallback, among the archetypes that can build that low.

Each plan records its tier and how it was picked, for the inspector (§5).

### 3.3 Tint: Height

A ground tint, **Height**, is a heat map of each lot's limit from navy through violet and rose to amber, on a log scale from 12 to 140 m so the mid-rise band gets most of the color. The land between lots shows the cell map, fainter. Its legend marks and lists the three tiers.

Districts stays as the tint for use. Tints remain one at a time, and the control is a 3 × 2 grid:

```ts
GROUND_TINTS = ["none", "districts", "frontage", "heights", "claims", "suitability"]
```

---

## 4. Parameters

One Build section, **Zoning**, after Surfaces, with two settings, each with a short description in `terrain/params.ts`. Both defaults equal the old constants, so the default city keeps its form.

Center height comes first, because it only re-plans the buildings; lot size comes last, because it re-cuts the lots.

| Group | Key | Label | Range | Default | A change takes |
|---|---|---|---|---|---|
| `zoning` | `peak` | Center height (m) | 40–200 | 140 | about 0.3 s |
| `lots` | `unit` | Lot size (m) | 6–12 | 8 | about 3 s for the districts stage, 7 s in all (development) |

- **Center height** is read only by the zoning map and `planBuildings`. No terrain stage reads the group, so `generateTerrain` returns the same districts and mesh; the buildings then refit a few per frame.
- **Lot size** is ZONE, the cell the lots are measured in. The districts stage reads it, so a change re-cuts the lots, regrades them, lays out the parks and redraws the ground. Sliders apply when released.
- **Constants:** the alley (1 m), merging lots under 10 m, corner lots, the district depths, the skyline's falloff (220 m), and the variety (0.25).

**Plumbing:**
- The districts stage in `terrain/pipeline.ts` gets `params: "lots"`. `buildDistricts` takes `params.lots` and reads ZONE from it.
- The zoning map's memo in `index.tsx` is keyed on the districts, the seed and `params.zoning`; the `plans` memo follows it.

---

## 5. The inspector

The building card (`ui/Inspector.tsx`, `describe`) gains three lines. They tell the building's story from the maps:

- **Frontage:** "12 m on an avenue · corner".
- **Height:** "48 of 62 m allowed". When something capped it, the line says what: "capped: slender lot".
- **Type:** "mid-rise in Megablocks". When the pick fell back, it says so: "no low-rise industrial type; nearest fit".

---

## 6. Files

| File | Change |
|---|---|
| `terrain/params.ts` | `lots` and `zoning` groups, defaults, labels, descriptions |
| `terrain/districts.ts` | ZONE → `params.lots.unit`; `Lot` gains `street`, `frontage`, `corner`, `through`; header comment rewritten |
| `terrain/pipeline.ts` | districts stage reads `lots` |
| `city/zoning.ts` (new) | height limit and tier maps, pure |
| `city/placement.ts` | height from the zoning map; type by district and tier; records what capped the height and how the type was picked |
| `buildings/registry.ts` | `tiers`, `minSide` (from `MIN_SIDE`) and `minHeight` per archetype |
| `buildings/Preview.tsx` | `?h=`, `?w=`, `?d=` build the whole library at one size |
| `state.ts` | ground tints `frontage` and `heights` |
| `ui/TerrainPanel.tsx` | the Zoning section; the two tints and their legends |
| `render/WorldView.ts`, `render/print.ts` | draw the two tints and the brighter front edges |
| `ui/Inspector.tsx` | the three lines in §5 |
| `site/src/world/README.md` | dev log entry with screenshots |

---

## 7. Milestones

1. **Frontage data** (built 2026-11-11): `Lot` records its frontage; the Frontage tint. No lot or building changes.
2. **Lot size** (built 2026-11-11): ZONE becomes a setting.
3. **Height map** (built 2026-11-11): `city/zoning.ts`; placement reads it; the Height tint. Defaults matched to the old skyline.
4. **Type by tier** (built 2026-11-11): `tiers` in the registry, checked in `/buildings`; the new pick.
5. **Zoning settings** (built 2026-11-12): one Zoning section with two settings, center height and lot size.
6. **Inspector:** the frontage, height and type lines.
7. **Docs:** the world README dev log, with before/after screenshots and the two tints.

---

## 8. Verification

- **Defaults keep the city.** On five seeds (`blueprint` and four others), compare the default city with today's: lot count and each district's share within 5%, and a building height histogram of the same shape.
- **Sweeps.** Each parameter at its minimum and maximum on two seeds. Check that:
  - every lot still fronts a street;
  - no lot overlaps a park or another lot;
  - `findClashes` stays at zero;
  - the console stays clean.
- **Speed.** A Zoning change skips the terrain entirely; time its re-plan and building rebuild. A lot size change costs no more than today's districts stage (`Terrain.timings`).
- **Tints** read on desktop, with their legends.
- **The inspector's three lines** are right on a corner lot, an avenue lot, a slender-capped lot and a fallback lot.
- `npm run build` passes.
