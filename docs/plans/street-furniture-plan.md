# Plan: street lamps (town plan step 6)

**Built 2026-11-18, all milestones at once, and closed.** Kept few on purpose: the streets are
lit, not crowded.

## Context

The town plan (`docs/plans/town-plan.md` §9) step 6, "Scatter along paths", was written before
the parks, the buildings and the people. By now:
- **The parks** (`city/parks.ts`, `city/parkModels.ts`) are furnished in full: lamps along their
  paths, trees, benches, bins, vending machines, and a fountain on the court of most of them.
- **The plaza** (24 m square) is taken by the Landmark (18 m footprint) and the paving ring
  around it.
- **The streets** are 3.5 m wide (`terrain/streets.ts`), each with a paved **verge** 1.5 m wide on
  both sides (`VERGE`). The verges held only the bus shelters, the waste bins, the people and the
  doors of the buildings behind them.

So step 6 came down to lamps along the streets.

**Decisions:**
- **The plaza gets a lamp at each corner.** It is the Landmark's.
- **Fixed rules, no new controls.** Spacing, heights and colors are constants in the code.
- **The parks' way of drawing:** blocky models in the buildings' palette, merged into one solid
  and one glow mesh, growing out of the ground with the parks' props.
- **People walk round them:** their columns are blocked in the walk map.

---

## 1. The model

All of it in `city/streetProps.ts` (pure: no three.js), planned in `terrain/pipeline.ts` after the
parks and the lots, from the streets, the claims and the districts.

### 1.1 Where along a street

- Each street is walked with a **slot every 24 m** (the first 6 m in), each on the other side
  from the one before. So on either side of a street a lamp stands every 48 m.
- A lamp stands on the verge, 2 columns (0.5 m) in from the road's edge, so the rest of the verge
  stays clear to walk on.
- A slot stays empty where:
  - its column is not verge (a park or a lot cuts the verge there);
  - it is within 3 m (plus the street's width) of a junction, or near the plaza;
  - it is within 2 m of a lot's front middle (its building's door), or 1.5 m of a park's way in;
  - the street steps there (a rise over 1 voxel within 4 samples either way).
- The bus shelters, bins and taxi fares come later, from the simulation (`life/traffic.ts`):
  a shelter keeps 6 columns from a lamp, searching along its lane for a clear spot, and a curb
  spot keeps 3.

### 1.2 The lamp

- A post 4.2 m tall with an arm 1.1 m long out over the road and a lantern. Its glow follows the
  district behind it: amber in the homes (megablock, wealthy), cyan in the core and the shops,
  warm white in industry; cyan at the plaza.

### 1.3 On the timeline

- The lamps grow out of the ground with the parks' props, outward from the plaza, each by its
  distance from it. No new step.

---

## 2. Files

| File | What changed |
|---|---|
| `city/streetProps.ts` | New: the slots and the lamps (pure) |
| `city/parks.ts` | The `streetlamp` kind, a prop's `color`, `Parks.street` |
| `city/parkModels.ts` | The street lamp model |
| `terrain/pipeline.ts` | Plans the lamps after the parks and lots |
| `render/WorldView.ts` | The lamps drawn with the parks' props, growing with them |
| `life/walk.ts` | The walk map blocks the lamps' columns; `clearOfStreetProps` |
| `life/traffic.ts` | Bus shelters and curb spots keep clear of the lamps |
| `docs/plans/town-plan.md` | Step 6 rewritten to what was built |

---

## 3. Verification (2026-11-18)

| Seed | Streets | Lamps | Planning |
|---|---|---|---|
| `blueprint` | 1.86 km | 37 | 5.8 ms |
| `8ahsrz` | 1.06 km | 27 | 4.8 ms |
| `neon7` | 0.86 km | 14 | 4.9 ms |
| `rust42` | 0.20 km | 6 | 3.9 ms |

On all four seeds:
- no lamp off the verge or the plaza;
- none within 6 columns of a building's door or a bus stop, or 3 columns of a bin;
- no door's column blocked in the walk map;
- planning under 20 ms;
- `npm run build` passes.
