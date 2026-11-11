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
2. Avenue lots and side-street lots are cut the same way, though busy frontage is the most valuable land.
3. No height map exists as data, so no tint can show one.
4. Type ignores height, so a tall archetype can be squashed and a low one stretched.
5. All of it is constants.

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

The street walk knows each lot's street. A corner-pass lot reads the paving straight out from its front edge: an avenue if that paving lies along a main street or is the plaza. An edge fronts paving when road, verge or plaza lies within 2 m of it (plus the setback) along at least a quarter of its length (`frontedEdges`). A corner lot has a side edge that fronts paving; a through lot, its back edge. A merged lot fronts an avenue if either half did.

### 2.2 Busy frontage is cut finer

Lots on avenues are narrower than the district's own width; side-street lots keep it. The result:
- shops crowd the avenues and the commercial strips;
- the side streets get wider, calmer plots.

Width in cells: `max(1, round(walk width × lots.avenueWidth))` on avenues, where the walk width is the district's or one more (seeded); the district's elsewhere. An avenue lot cut narrower this way is not merged back, as long as it is at least one cell wide. Depth still grows to the district's depth while the block allows it, scaled by `lots.depth`.

Only the street walk's lots along main streets are narrowed. How much it shows depends on the seed: on `harbor`, at 0.5, two 24 m avenue lots become 16 m; on `blueprint`, the avenue lots are already one cell wide, so nothing changes.

### 2.3 Tint: Frontage

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
        · (avenue frontage ? avenueBonus : 1)
        then at most the edge cap near the river and the parks
```

- **District range:** the old `HEIGHTS` table (now in `city/zoning.ts`) is the floor and ceiling of each district. `density` is the district's base density, so busy districts reach further up their range. `scale` is `zoning.peak` over 140 m, so every range follows the center height.
- **The skyline:** 1 at the plaza, halving every `zoning.falloff` meters along the streets (access, not straight-line distance). Far out, a district builds near its floor.
- **Variety:** slow noise in patches about 48 m across, `1 − variety · (1 − noise)`. At 0.25 it spans the same 0.75–1 as the old per-lot random factor, but heights now vary in patches, not lot by lot.
- **Smoothing:** one 3 × 3 pass over the cells with a district, so neighbors step rather than jump.
- **Avenues:** a lot fronting an avenue may build `zoning.avenueBonus` times higher.
- **Open edges:** within EDGE (12 m) of the river bank or a park, the limit is at most `zoning.edgeCap`; beyond, the cap doubles every 12 m. This steps the city down toward open ground and makes the riverfront readable.

A lot's limit is its center cell's. A building's height is the smaller of that limit and SLENDER × its narrower side, and at least 12 m. Each plan records its limit and what held it down (the edge, the slender rule, or nothing).

**Defaults, matched in milestone 3:** peak 140 m, falloff 220 m (the old density fell off linearly to half at the city's reach, about 220 m on every seed tried), avenue bonus 1, variety 0.25, edge cap 30 m. With the edge cap off, mean heights on five seeds stay within 2 m of the old ones. The edge cap is the one new rule: it holds down 20–50% of lots and lowers mean heights by 4–13 m on five seeds, most on `harbor`, whose core sits on the river.

### 3.2 Use map: district plus height tier

The district stays the use. Each height is sorted into a tier:

| Tier | Height |
|---|---|
| low | under 20 m |
| mid | 20–60 m |
| high | over 60 m |

Each archetype in `buildings/registry.ts` gains `tiers`, the tiers it reads well at. This sits next to `districts`, and `MIN_SIDE` moves there too. The tiers below are proposed; each is checked in the `/buildings` preview at those heights before it is used.

| Archetype | Districts | Tiers |
|---|---|---|
| Corporate Megatower | core | high |
| Neon Commercial Tower | commercial | mid, high |
| Residential Skyscraper | megablock, core | high |
| Research Lab Tower | industrial, core | mid, high |
| Modular Apartment Block | megablock | low, mid |
| Twin-Tower Complex | megablock | mid |
| Stacked Megablock | megablock, commercial | mid |
| Vertical Neighborhood | megablock | mid |
| Terraced Residential | wealthy, megablock | low |
| Tower and Annex | megablock, commercial | mid, high |

**The pick**, in order:
1. district ∧ tier ∧ fits;
2. district ∧ fits, with the height clamped into that archetype's tiers;
3. tier ∧ fits, any district;
4. today's slimmest fallback.

With `zoning.mix` above 0, that share of the lots near a district border may also draw from the neighboring district's list. This gives mixed-use edges.

The table shows the gaps the library leaves: industrial low-rise and wealthy mid-rise. Lots there fall back to step 2 or 3, and the inspector says so (§5).

### 3.3 Tint: Height

A ground tint, **Height**, is a heat map of each lot's limit from navy through violet and rose to amber, on a log scale from 12 to 140 m so the mid-rise band gets most of the color. The land between lots shows the cell map, fainter. Its legend marks the three tiers and says how many lots the edge cap holds down.

Districts stays as the tint for use. Tints remain one at a time, and the control is a 3 × 2 grid:

```ts
GROUND_TINTS = ["none", "districts", "frontage", "heights", "claims", "suitability"]
```

---

## 4. Parameters

Two new Build sections after Surfaces, each with a description in `terrain/params.ts` like the others. Every default equals today's constant, so the default city keeps its form until a slider moves. The only exception is `edgeCap`.

**Lots** (group `lots`): read by the districts stage, so a change re-cuts the lots, regrades them, lays out the parks and redraws the ground (2–5 s in development). Sliders apply when released.

The verge itself is painted by the streets stage (1.5 m), so it is not a lot setting. In its place, **Setback** keeps lots that far back from the verge, corner lots included.

| Key | Label | Range | Default | Today |
|---|---|---|---|---|
| `unit` | Frontage unit (m) | 6–12 | 8 | ZONE |
| `avenueWidth` | Avenue lot width | 0.5–1 | 1 | — |
| `depth` | Lot depth | 0.5–1.5 | 1 | district depths |
| `alley` | Alley (m) | 0–4 | 1 | ALLEY |
| `setback` | Setback (m) | 0–4 | 0 | — |
| `merge` | Merge lots under (m) | 6–16 | 10 | MERGE_BELOW |
| `corners` | Corner lots | on/off | on | always |

**Zoning** (group `zoning`): read only by `planBuildings`, so a change re-plans and rebuilds the buildings and leaves the terrain alone.

| Key | Label | Range | Default |
|---|---|---|---|
| `peak` | Center height (m) | 40–200 | 140 |
| `falloff` | Falloff (m) | 40–400 | 220 |
| `avenueBonus` | Avenue bonus | 1–1.5 | 1 |
| `edgeCap` | Waterfront and park cap (m) | 10–80 | 30 |
| `variety` | Variety | 0–1 | 0.25 |
| `mix` | Mixed use | 0–0.5 | 0 |

**Plumbing:**
- The districts stage in `terrain/pipeline.ts` gets `params: "lots"`. `buildDistricts` takes `params.lots` in place of its constants.
- The `plans` memo in `index.tsx` adds `params.zoning` to its dependencies. The zoning map gets its own memo, keyed on districts and `params.zoning`.

---

## 5. The inspector

The building card (`ui/Inspector.tsx`, `describe`) gains three lines. They tell the building's story from the maps:

- **Frontage:** "12 m on an avenue · corner".
- **Height:** "48 of 62 m allowed". When something capped it, the line says what: "capped: slender lot" or "capped: waterfront".
- **Type:** "mid-rise in Megablocks". When the pick fell back, it says so: "no low-rise industrial type; nearest fit".

---

## 6. Files

| File | Change |
|---|---|
| `terrain/params.ts` | `lots` and `zoning` groups, defaults, labels, descriptions |
| `terrain/districts.ts` | constants → `params.lots`; `Lot` gains `street`, `frontage`, `corner`, `through`; avenue lots cut narrower; header comment rewritten |
| `terrain/pipeline.ts` | districts stage reads `lots` |
| `city/zoning.ts` (new) | height limit and tier maps, pure |
| `city/placement.ts` | height from the zoning map; type by district and tier; records what capped the height and how the type was picked |
| `buildings/registry.ts` | `tiers` and `minSide` per archetype (from `MIN_SIDE`) |
| `state.ts` | ground tints `frontage` and `heights` |
| `ui/TerrainPanel.tsx` | Lots and Zoning sections; the two tints and their legends |
| `render/WorldView.ts`, `render/print.ts` | draw the two tints and the brighter front edges |
| `ui/Inspector.tsx` | the three lines in §5 |
| `site/src/world/README.md` | dev log entry with screenshots |

---

## 7. Milestones

1. **Frontage data** (built 2026-11-11): `Lot` records its frontage; the Frontage tint. No lot or building changes.
2. **Lot parameters** (built 2026-11-11): constants → the Lots section; avenue lots cut finer.
3. **Height map** (built 2026-11-11): `city/zoning.ts`; placement reads it; the Height tint. Defaults matched to the old skyline.
4. **Type by tier:** `tiers` in the registry, checked in `/buildings`; the new pick; `mix`.
5. **Zoning parameters:** the Zoning section.
6. **Inspector:** the frontage, height and type lines.
7. **Docs:** the world README dev log, with before/after screenshots and the two tints.

---

## 8. Verification

- **Defaults keep the city.** On five seeds (`blueprint` and four others), compare the default city with today's: lot count and each district's share within 5%, and a building height histogram of the same shape. Then turn the edge cap on and compare again.
- **Sweeps.** Each parameter at its minimum and maximum on two seeds. Check that:
  - every lot still fronts a street (within the setback);
  - no lot overlaps a park or another lot;
  - `findClashes` stays at zero;
  - the console stays clean.
- **Speed.** A Zoning change skips the terrain entirely; time its re-plan and building rebuild. A Lots change costs no more than today's districts stage (`Terrain.timings`).
- **Tints** read on desktop, with their legends.
- **The inspector's three lines** are right on a corner lot, an avenue lot, a capped waterfront lot and a fallback lot.
- `npm run build` passes.
