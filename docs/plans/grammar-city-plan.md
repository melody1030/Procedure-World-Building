# Plan: grammar buildings on the city's lots

**Closed 2026-11-17**, with both milestones built.

## Context

The building grammar (`docs/plans/building-grammar-plan.md`, closed 2026-11-16) has two pages.
`/grammar` builds one building from its rules. `/grammar/simulation` grows a building on every lot
of a made-up block, with a height map setting how tall each one is.

The city itself, `/world`, still builds every lot from the building library. Its parts are:
- `city/placement.ts`: `planBuildings` picks one of ten archetypes per lot, and `fitBuilding`
  sizes it to the lot;
- `render/WorldView.ts`: `setBuildings` builds the models a few per frame, and the timeline
  raises them storey by storey.

Assignment 1 asks for "the variation of building types by zones, using maps to drive height or
building type". Simulation shows this on a block that is not the city's. This plan shows it on
the city's own lots. Each lot already has the inputs the grammar needs:
- **its district:** core, commercial, megablock, industrial or wealthy;
- **its zoning limit:** the height map in `city/zoning.ts`;
- **its frontage:** avenue, side street, corner or through lot;
- **its size and facing.**

The grammar builds into the same `Kit` and returns the same `BuildingModel` as the library does,
so the city can place a grammar building exactly as it places a library one.

**Goal:** every lot in `/world` gets a grammar building, with these rules:
- **Size:** the lot sets the building's footprint.
- **Height:** the zoning map sets it.
- **Character:** the district sets the facade, the roof and the crown.
- **Signature buildings:** the Landmark Tower stays on the plaza, and the Corporate Megatower
  stays on any lot the library would give it.

**Measured on the default seeds (2026-11-16):**

| | `blueprint` | `harbor` |
|---|---|---|
| Lots with a building | 107 | 22 |
| Room per lot, width (min / median / max, m) | 7 / 9 / 23 | 7 / 7 / 23 |
| Room per lot, depth (min / median / max, m) | 7 / 10.5 / 31 | 8.5 / 15 / 25.5 |
| Height (min / median / max, m) | 27 / 32 / 88 | 49 / 56 / 120 |
| Library: total build, all lots | 1,132 ms | 373 ms |
| Library: vertices | 1.83M | 0.90M |
| Grammar: total build, all lots | 175 ms | 53 ms |
| Grammar: vertices | 3.95M | 1.59M |

A lot's room is the lot less 0.5 m all round. The grammar numbers were measured before the
clearance rule (§1.2), which takes most side and back balconies away. With it (M1), `blueprint`
makes 2.77M vertices in 125 ms, and `harbor` 1.07M in 40 ms.

What these numbers mean for the plan:
- **Speed:** the grammar builds about six times faster than the library's `fitBuilding`, which
  tries up to ten body sizes per lot. So the city keeps its main-thread loop (§1.4) and needs no
  workers.
- **Size:** it makes about twice the vertices, so M1 measures the frame rate before going on.
- **Lots:** most lots are small. Over 40% of `blueprint`'s lots are 8 m wide (a 7 m room). That
  is too small to keep the 1.15 m of room that balconies need (and the 1.52 m that awnings
  need, in front) on every side. So the clearance rule in §1.2 is the heart of this plan.

---

## 1. Grammar buildings on lots

### 1.1 Which lots

| Lot | Building |
|---|---|
| The plaza | The Landmark Tower, as now |
| A lot `planBuildings` gives the Corporate Megatower (core, high tier, at least 12 m) | The Corporate Megatower, as now |
| Every other lot with a building | A grammar building |

`planBuildings` keeps its archetype pick, the height and the fallbacks. It also records each
lot's grammar settings (§1.3).

### 1.2 The body and its clearance

The library keeps the whole building inside its room, the lot less 0.5 m all round, with
`Kit.clip` as the backstop. The grammar now does the same, but rather than cut a balcony in half
at the room's edge, it leaves out what does not fit.

**The body** (since the denser lots, the room is the whole lot, and lots side by side share an
edge; see the dev log, 2026-11-16):
- **Width:** the lot less 0.25 m each side, a party wall with its neighbors.
- **Depth:** the lot less a front clearance of up to 1.5 m, as much as the depth can spare above
  the 6 m minimum; the back is on the lot's back edge.
- A corner lot's cross-street side gets a street front's clearance instead of the party wall.

**The clearance rule:** `buildGrammar` takes an optional `clearance`: the meters outside the body
on the front, the sides and the back. Then:
- **Balconies:** a face gets balconies only if its clearance is at least 1.15 m, a balcony's
  reach. On the city's lots that is the street front of deep lots. The sides read as party walls
  with plain windows, as in a dense city.
- **Awnings:** shop awnings shorten to the front clearance and are left out under 0.5 m.
- **Everything else:** signs, pipes, AC units and anything else that reaches past the room is
  cut at the room's edge by `Kit.clip`, as with the library.

With no `clearance`, nothing changes: `/grammar` and Simulation build as they do now. Simulation's
setbacks already start past both reaches.

**The grammar's ranges:**
- **Depth:** the minimum drops from 8 m to 6 m for the Bar. L, U and Stepped keep their own
  minimums and fall back to a Bar, as they do now.
- **Floors:** the validated maximum rises from 46 to 66 floors (199.5 m), so a 200 m Center height
  still builds. The `/grammar` page's slider keeps 46.

### 1.3 Each lot's settings

Simulation's `drawGrammar` (`buildings/block.ts`) moves to a shared module,
`buildings/lotGrammar.ts`, so that Simulation and the city use the same draw. The draw reads:
- **Floors:** from the planned height, 1 + floor((height − ground floor) ÷ 3 m), so the top floor
  stays within the zoning limit and the slender rule.
- **Shape:** from the body. L and U go on wide, deep lots and Stepped on tall ones; the rest
  are Bars.
- **Windows, roof and crown:** from the height tier, as in Simulation.
- **The seed:** the lot's own seed.

The draw then adds the district's character (§1.5, milestone 2). With no district (Simulation),
the draw is what it is now.

### 1.4 Building and raising them

- **The build loop:** `setBuildings` keeps its loop, which builds for 10 ms per frame. The grammar
  builds a lot in about 1.6 ms, so the whole city stands in a few frames instead of a few seconds.
- **The timeline:** the raise (frame, then cladding, storey by storey; `buildings/print.ts`) reads
  only a model's height, so it works on grammar buildings unchanged.
- **Placement:** a grammar building's front is the model's +z, like a library one's. So
  `plan.rotation` and `plan.base` place it as they do now.
- **The frame-rate check:** M1 measures the frame rate on both default seeds, with traffic and
  people. If it drops below the library's, the first cut is the street-front balconies on the
  smallest lots.

### 1.5 Zones drive the type

The assignment's "building types by zones". Each district weights the draw:

| District | Facade | Windows | Roof and crown |
|---|---|---|---|
| Core | Few balconies; signs up to the cap on avenues | Glass, then ribbon | Helipads and gear; bands and caps |
| Commercial | Shops on every ground bay, signs on 30–50% of the front (its own cap: at 30% the city's three- and four-bay fronts get none), a taller ground floor (4.75–5.25 m at full size) | Punched and ribbon | Billboards; bands |
| Megablock | Balconies up to 0.5 where the clearance allows, more lit windows | Punched | Gear and gardens; no crown |
| Industrial | Service bays (V) in the upper pattern and opening the ground floor, few shops, fewer lit windows | Ribbon | Gear at full fill |
| Wealthy | Wide bays (2.5–3 m), no signs, a ground floor of windows and doors; Stepped more often | Punched and glass | Gardens; caps |

The draw also reads the lot's frontage:
- **Avenue lots** get the commercial ground floor whatever their district.
- **Corner lots** get a second street front: the side toward the cross street takes the street
  front's ground floor and signs, and as much of 1.5 m of clearance as the width can spare, as the
  front does. For this, `districts.ts` records which side of a corner lot fronts paving
  (`Lot.cornerSide`).

The district's draws come from a stream of their own, after the size-and-tier draw, so Simulation
(no district) builds exactly as before. The grammar takes them as an optional `GrammarStyle`: the
bay weights, the ground floor's first slot, the sign range and cap, and the corner side.

---

## 2. Files

| File | Change |
|---|---|
| `world/buildings/grammar.ts` | `clearance`: balconies by face, awnings shortened, `Kit.clip` at the room; depth down to 6 m for the Bar; floors validated to 90; `GrammarStyle` (§1.5) |
| `world/buildings/lotGrammar.ts` (new) | each lot's grammar settings: `drawGrammar` moved from `block.ts`, plus the district and frontage weights (§1.5) |
| `world/buildings/block.ts` | imports the draw from `lotGrammar.ts` |
| `world/city/placement.ts` | each plan's grammar settings, body and clearance; a `fitGrammar` beside `fitBuilding` |
| `world/terrain/districts.ts` | which side of a corner lot fronts paving |
| `world/render/WorldView.ts` | `setBuildings` builds the grammar models |
| `site/src/world/README.md` | dev log entry |
| `README.md` | the process log |

---

## 3. Milestones

1. **Grammar on the lots** (built 2026-11-16):
   - the body and clearance rule (§1.2);
   - the shared draw (§1.3);
   - the plans' grammar settings;
   - `setBuildings` building them, with the Landmark and the Megatower kept;
   - the frame rate measured on both default seeds.
2. **Zones drive the type** (built 2026-11-16):
   - the district weights (§1.5);
   - avenue ground floors;
   - corner lots' second front.

---

## 4. Verification

- **Every lot builds:** on `blueprint`, `harbor` and a few other seeds, at Center height 40, 140
  and 200 m and at every Lot size:
  - every lot with a building gets one;
  - no part reaches past its room;
  - `findClashes` stays at zero.
- **The rules hold:**
  - every building's top floor is within its lot's zoning limit and the slender rule;
  - no balcony stands on a face with less than 1.15 m of clearance;
  - every front faces its street.
- **Nothing else changes:** `/grammar` and Simulation build the same buildings as before for
  the same seeds (no `clearance`, no district).
- **Zones read:** from the overview, the districts look different at a glance (glass and crowns in
  the core, signs and billboards along commercial streets, balconies in the megablocks, gear and
  ribbon windows in industry, gardens in the wealthy district).
- **Speed:**
  - the whole city builds in well under a second;
  - the frame rate with traffic and people stays at the library's;
  - the timeline's raise runs as it does now.
- `npm run build` passes, and the console stays clean.
