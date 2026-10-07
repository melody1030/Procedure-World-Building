# Blueprint City: procedural world plan

[← Back to the main README](../../README.md) · [Concept](../concept.md)

A step-by-step plan for turning the concept, the mood board and the research in
[`docs/analysis/`](../analysis/) into one procedural world built from the class techniques.

---

## 0. What the inputs tell us

**Mood board** (`Procedural World Mood Board.pdf`)

| Column | What I take from it |
|---|---|
| **Inspiration** (Town to City dioramas) | Compact island on a tabletop, stepped terraces, cliffs dropping to water, winding roads, dense trees between houses, warm windows |
| **Style** (voxel neon cities) | Blocks visible at every scale; dark navy base; cyan / magenta / amber neon *outlines* on edges; a single "hero" element (the cherry tree); the diorama ends in a clean base slab sitting on dark water |
| **Lighting** (rain, Hong Kong street) | Rain and haze that fade distant towers into blue; signs glowing through fog; wet streets reflecting colour; hanging signs and cables across narrow streets |

**Week 6 feedback** ([Week06-feedback.md](../analysis/Week06-feedback.md)), which shapes the whole plan:

1. *Show the procedural world itself, not the exploring process.* The final piece is one world, not another lab of sliders.
2. *Include the technique in the project itself.* Every class technique must be *doing a job* in the world.
3. *Explore Townscaper.* Done in [cozy-builders-research.md](../analysis/cozy-builders-research.md): irregular grid, corner tiles, WFC, "recipes".
4. *More references* for lighting, rendering, terrain, building. Mood board covers this.
5. *Be careful of the scale.* Needs a fixed unit and a height budget.

**Starting from scratch.** An earlier `voxel-city` prototype placed its coastline, hills,
landmarks and roads by hand. It looked close to the references but was not procedural, which is
exactly what feedback points 1–2 warn about, so it has been removed. The world is rebuilt from
zero as a **seed → rules → city** pipeline.

---

## Status (2026-09-30): the whole pipeline is built

Open **`/world`** (or `/world?seed=anything`). All 14 stages run in about 0.25–0.4 s per seed and
the page holds 60 fps at 2.6k × 1.8k with bloom, tilt-shift and the mirror sea. Code is in
`site/src/world/`: `stages/` generates, `render/` only draws.

| Stage | File | What it does now | Versus the plan |
|---|---|---|---|
| 00 Base | `pipeline.ts` | Seed → hash → per-stage generators; place name | — |
| 01 Island | `stages/island.ts` | Radial falloff, angular coast noise, domain warp, stretch; a carved bay and a plateau site | — |
| 02 Terrain | `stages/terrain.ts` | fBm + ridged + plateau, Week 2 erosion (tamed), terraces, majority filter, islet flood fill | See Step 2 notes |
| 03 Water | `stages/water.ts` | Priority-flood (fills pits → lakes), flow accumulation, main stem → river carved into the terraces; each drop is a waterfall | Lakes are rare: erosion's blur leaves few pits |
| 04 Voxelise | `stages/voxels.ts` | Rock rims, then greedy meshing of tops and sides within chunks (≈160k → 17k faces) | — |
| 05 Suitability | `stages/suitability.ts` | 0.45 room (BFS to terrace edge) + 0.30 near water + 0.25 low ground; heatmap overlay | — |
| 06 Districts | `stages/districts.ts` | Worley cells on good ground (terrace changes cost distance), roles by rules; overlay | — |
| 07 Roads | `stages/roads.ts` | Prim MST + loops, A* (level climbs 30, bridges 14, reuse ×0.35), Chaikin, stair-stepped ramps, bridges, plazas | — |
| 08 Growth | `stages/growth.ts` | Frontage + infill lots, 240-tick simulation, phases, heights from scarcity, landmarks planned for Megacity, stacked housing | Scarcity = 0.4 district fill + 0.6 city fill (district fill alone let tiny districts tower early) |
| 09 Buildings | `stages/buildings.ts` | Box grammar per district: blocks, tiered towers, sheds/stacks/tanks, halls, cottages; lit/dark windows, shopfronts, blade signs, billboards, spires | Additive boxes, no CSG subtraction; no WFC façades (stretch goal) |
| 10 Bridges | `stages/bridges.ts` | Elevated rail on the two longest main roads; up to 10 sky bridges, clear of roofs and rail | — |
| 11 Props | `stages/props.ts` | Grove-clustered trees, context lights (post / wall bracket / buoy), piers with cranes and boats, cables with lanterns, people, the cherry tree | — |
| 12 Atmosphere | `stages/finish.ts`, `render/effects.ts` | Seeded rain, haze sized to the skyline; three moods; neon environment map; bloom; tilt-shift; mirror sea | — |
| 13 Performance | `stages/finish.ts` | Five merged buffers (terrain, water, roads, lit city, glowing city) + instanced traffic | No level of detail yet; not needed at this size |

**On the page:** the world opens finished. A left settings panel works like the weekly studios
(sticky tabs, icon sections, Reset, Result, How it works), with one tab per course topic in the
order they were taught: **Terrain** (Week 2: island, noise, erosion, terraces, water), **Voxels**
(Week 3: greedy meshing on/off, tones), **Shader** (Week 4: mood, light, bloom, distance fog,
tilt-shift, rain), **Paths** (districts as nodes, A* roads and street lights, bridges and rail) and
**Scatter** (Week 5: suitability as the density map, buildings, trees with jittered grid / random /
Poisson disk, props). All parameters live in `site/src/world/params.ts`. A change reruns only the
stage that reads it and the stages after it; shader settings apply live. The bottom bar keeps the
growth timeline (no auto-play), the world layers and the Terraces, Suitability and Districts
overlays. The seed card sits top right.

---

## 1. Design rules (decide once, keep all the way)

- **One seed, one world.** Everything is derived from `seed`. Same seed → same city.
- **Scale.** 1 world unit = 1 voxel = 0.5 m. Storey = 6 voxels (3 m). Person ≈ 3.5 voxels.
  Terrace step = 1 storey. Land = 12 × 12 chunks of 32 voxels = 384 × 384 voxels (≈ 192 m),
  with 40 voxels of open water around it. All of this lives in `site/src/world/scale.ts`.
- **Height budget** (from memory of past iterations): ~60 % low (1–3 storeys), 25 % medium
  (4–8), 10 % tall (9–15), ≤ 5 % landmarks (16–26, at most three, core only). Towers need a
  footprint of at least 11 voxels and only rise once land is scarce.
- **Stålberg's rule:** large shapes predictable (island, terraces, districts), small shapes free
  (windows, signs, props).
- **Palette:** near-black navy + slate base, cyan main neon, magenta + amber secondary, warm
  window yellow. Terrain stays cold and muted so the city is what glows. Bloom only on emissives.
- **Avoid** (things that went wrong before): walls of skyscrapers, flat rectangular grids,
  bloom washing out the scene, oversized landmark discs, trees everywhere.

---

## 2. The pipeline

Each stage reads the previous stage's output and writes one new *layer*. Every layer can be
shown as a toggleable overlay (teacher's Week 2 note: "different layer, toggle on/off"), which
is also how the technique stays visible inside the finished world.

```text
seed
 │
 ├─ 1 Island shape ........ noise + radial falloff               (Week 2)
 ├─ 2 Terrain ............. fBm, ridged, erosion, terracing       (Week 2)
 ├─ 3 Water & rivers ...... sea level, flow accumulation          (Week 2 / Flows)
 ├─ 4 Voxelise ............ heightfield → voxel columns, meshing  (Week 3)
 ├─ 5 Suitability map ..... slope, water dist, elevation          (Structure)
 ├─ 6 Districts ........... Voronoi / Worley cells + rules        (noise notes)
 ├─ 7 Road network ........ A* on slope cost, MST + loops         (Networks)
 ├─ 8 Lots & growth ....... roadside lots, land scarcity → height (Networks / town graph)
 ├─ 9 Buildings ........... CSG voxel grammar per district        (Week 3)
 ├─ 10 Bridges & walkways . connect full terraces across gaps     (Networks)
 ├─ 11 Props & population . scatter by zone/slope, context props  (Populations)
 ├─ 12 Atmosphere ......... neon, rain, fog, wet reflections      (Weeks 1, 4 / Flows)
 └─ 13 Performance ........ greedy meshing, instancing, LOD       (Performance)
```

---

## 3. Step-by-step build order

Each step ends with something you can **see and screenshot**, so it doubles as that week's
presentation. Rough week targets follow the course order in the README.

### Step 1: Scaffold the world page (½ week) · ✔ done 2026-09-30
- New route `/world`, plain Three.js like the weeks, `useReducer` state.
- `world/` folder with `scale.ts`, `rng.ts` (seeded random + noise), `pipeline.ts`
  (`generate(seed) → WorldModel`), and a `layers` object.
- Minimal UI: seed box + "regenerate", a **layer toggle** strip, and the `E` hide-UI shortcut.
  No per-technique slider walls; tweakables go in a collapsed "Planner" drawer.
- ✅ *Done when:* changing the seed prints a new `WorldModel` and the page renders an empty slab on water.
- **Built:** `/world` (full screen, seed kept in the URL as `?seed=`). Files in `site/src/world/`:
  `scale.ts`, `rng.ts`, `palette.ts`, `voxels.ts` (box batcher), `pipeline.ts` (stage list +
  `generate`), `layers.ts`, `render/` (WorldView, diorama base), `ui/` (title card with seed,
  layer bar, pipeline panel). Layers so far: Land, Water, Chunks, Scale. Each stage gets its own
  forked random generator, so building a stage later never changes the stages after it.

### Step 2: Island and terrain (1 week) · *Week 2 techniques* · ✔ done 2026-09-30
- Heightmap = fBm × radial falloff (island shape), plus ridged noise for cliffs, domain warp for an irregular coast.
- Run the Week 2 droplet **hydraulic erosion** at low resolution to carve valleys.
- **Terrace quantisation:** `h = floor(h / step) * step`, with step = 1 storey; keep 4–7 levels.
  Add noise to the step boundaries so terrace edges are not contour-perfect.
- ✅ *Done when:* 5 seeds give 5 distinct islands, each with a bay, a high plateau, and cliffs.
- **Built:** `stages/island.ts` (radial falloff, coast radius from noise around a circle, domain
  warp, random stretch and rotation, a carved bay, a plateau site opposite it) and
  `stages/terrain.ts` (fBm + ridged + flat-topped plateau, power shaping, Week 2's
  `erodeDroplets` imported directly, terraces with wandering edges). `render/terrain.ts` is a
  column mesher (top face + exposed sides) with a second colour set for the Terraces overlay.
- **What had to change on the way:**
  - Raw erosion deposited sediment in the shallow sea, which built new land, rounded every coast
    and filled the bay. The erosion change is now blurred, deposits count half, and the sea floor
    never rises.
  - Terracing left one-column spikes and small islets. Two majority-filter passes and a flood
    fill (islets under 250 columns are sunk) clean them up.
  - Beaches are the 3 voxels nearest the water, from a breadth-first distance-to-water pass. That
    distance is kept on the terrain for the suitability map in Step 4.
  - Speed: Perlin now picks from 16 precomputed gradients (no trig per sample), and Week 2's
    `erodeAt` uses `Math.sqrt` instead of the much slower `Math.hypot`. A world generates in about
    150 ms, most of it erosion.
- Checked on seeds `blueprint`, `harbor`, `kowloon`, `neon`, `rust`: 4–6 terraces, ~35 % land,
  plateau tops 10–16 m, bay core 100 % water on all five. Erosion is the one control, in the
  pipeline panel under the terrain stage.

### Step 3: Water and voxelisation (½–1 week) · *Week 3 techniques*
- Sea level plane; lakes via flood-fill of depressions; one river from flow accumulation, with a waterfall where it crosses a terrace edge.
- Heightfield → voxel columns (top material by slope/height: grass, rock, sand, concrete).
- **Greedy meshing** (Week 3 mesh-gen) so the island is one cheap mesh.
- Diorama base: cut the island into a clean slab with dark cross-section sides (Style column).
- ✅ *Done when:* the empty island looks like the Inspiration photos minus the town.

### Step 4: Suitability and districts (1 week) · *Structure*
- Per-column **suitability** = w₁·flatness + w₂·near-water + w₃·elevation-band − w₄·river.
- **Districts** from Worley cells seeded on high-suitability ground, assigned by rules:
  core (highest land value, centre), residential terraces, industrial (flat, near water, downwind),
  waterfront/docks, green highland (steep, high).
- Overlay: suitability heatmap in cyan, the "city-planning scanner" from the concept.
- ✅ *Done when:* the heatmap overlay explains *why* each district sits where it does.

### Step 5: Roads (1 week) · *Networks*
- Pick settlement nodes (district centres, docks, a transit hub).
- Connect with a **minimum spanning tree + a few extra loops**, each edge routed by **A\*** where
  cost = distance + slope penalty + terrace-crossing penalty (ramps/stairs at crossings).
- Result: roads wind along terraces like hillside towns. Rasterise into the voxel grid.
- Plazas where ≥ 3 roads meet.
- ✅ *Done when:* roads never cut straight up a cliff and form a readable network from above.

### Step 6: Growth simulation (1–1½ weeks) · *the heart of the project*
- Lots along roads (Townscaper idea: an *irregular* lot grid along the road curve, not a rectangle grid).
- Growth loop in ticks: *Outpost → District → Sprawl → Megacity*.
  - Each tick, fill the highest-value free lot.
  - **Land scarcity rule:** `maxHeight(lot) = base × (1 + k · fillRatio(terrace)) × landValue(lot)`.
    As terraces fill, allowed height rises, only in high-value cells, keeping the 60/25/10/5 budget.
- A timeline scrubber replays growth. The *moment of change* is the reward (research takeaway 2).
- ✅ *Done when:* scrubbing from 0 → 100 % shows a village becoming a vertical city.

### Step 7: Buildings (1–1½ weeks) · *Week 3 CSG + grammar*
- One generator per district, all from voxel boxes:
  - **Residential:** stacked boxes with setbacks, balconies, AC units, rooftop water tanks.
  - **Core:** towers with tiers, neon edge strips, vertical signs, crown.
  - **Industrial:** stacks, tanks, warehouses, pipes, rust palette.
  - **Waterfront:** docks, cranes, containers, stilts into water.
- CSG subtraction for arcades, gaps and window rows. Windows lit by a hash so ~40 % glow.
- Try a small **WFC / corner-tile** façade pass (Townscaper) for residential blocks as a stretch goal.
- ✅ *Done when:* a building's district is obvious from its silhouette alone.

### Step 8: Bridges and elevated walkways (½ week) · *Networks*
- When a terrace's fill ratio passes a threshold, connect it to the nearest under-used terrace:
  sky bridges between towers, elevated walkways over roads, a rail loop.
- ✅ *Done when:* the Megacity stage visibly grows *across* as well as *up*.

### Step 9: Props and population (1 week) · *Populations*
- Scatter by layer masks: trees on residential/green slopes (clustered by noise, not everywhere),
  signs on core façades, cables and hanging signs across narrow streets (Lighting column),
  street lamps, people and cars on roads.
- **Context props** (Town to City): the same "light" becomes a post on ground, a bracket on a wall,
  a buoy on water. Decide by surface normal / neighbour voxels.
- One **hero element** per seed (e.g. a glowing cherry tree in a plaza), as in the Style board.
- ✅ *Done when:* close-ups look inhabited and the far view still reads cleanly.

### Step 10: Atmosphere and rendering (1 week) · *Weeks 1 & 4, Flows*
- Night lighting: dim moonlit key light, emissive windows/signs, selective bloom.
- Height + distance fog tinted blue so far towers fade (Lighting column, left image).
- Rain particles, wet-street reflections (roughness mask + SSR or a cheap env-map), dark reflective water.
- Neon edge outlines on buildings (Style column); tilt-shift depth of field for the diorama look.
- A small mood switch: *Dusk* (warm, Inspiration) ↔ *Rainy night* (Lighting).
- ✅ *Done when:* a screenshot sits comfortably next to the mood board.

### Step 11: Performance (½ week) · *Performance*
- Greedy meshing per chunk, instanced props, LOD for far buildings, cap draw calls.
- ✅ *Done when:* 60 fps on a laptop with the full Megacity stage.

### Step 12: Present the world (ongoing)
- Default view = the finished world, not the tools (feedback 1).
- Controls: seed, growth scrubber, mood, layer toggles, orbit + a street-level camera.
- README per stage with screenshots, following the weeks' study-notebook pattern.

---

## 4. Class technique → where it lives in the world

| Technique | Job in the world |
|---|---|
| Three.js materials & lights (W1) | Emissive neon, night lighting |
| Noise, fBm, ridged, warp (W2) | Island shape, terrain, grove clustering, district jitter |
| Hydraulic erosion (W2) | Valleys and river beds |
| Voxels, CSG, meshing (W3) | Terrain columns, building grammar, greedy mesh |
| Shaders (W4) | Wet streets, water, window flicker, fog, outlines |
| Worley / Voronoi | Districts and lots |
| Flood fill / flow | Lakes, river, waterfall |
| Scatter by mask | Trees, signs, props |
| Graphs, A\*, MST | Road network, bridges |
| Simulation | Growth loop with land-scarcity rule |
| Particles / flows | Rain, steam, traffic |
| LOD / instancing | Performance |

---

## 5. Risks and how to avoid them

- **Scope.** If time runs short, cut in this order: WFC façades → context props → street camera
  → rain reflections. Never cut the growth loop; it *is* the project.
- **Looks procedural but ugly.** Compare screenshots against the mood board each week and tune
  rules until a generated seed holds up next to the references.
- **Scale drift.** All sizes come from `scale.ts`; the Scale layer shows a person, a three-storey block and a 100 m ruler.
- **Too many sliders again.** Parameters sit in the world's own panel, grouped by stage and week, and
  the default view is still the finished world, so the sliders explore the world rather than replace it.

---

## 6. Immediate next actions

1. ~~Create `site/src/world/` on the `/world` route and write `scale.ts`.~~ Done.
2. ~~Write the foundations: `rng.ts`, a voxel batch builder, and `palette.ts`.~~ Done (noise comes with Step 2).
3. ~~Build Step 2 (island + terraces).~~ Done.
4. Step 3: lakes and a river with a waterfall, greedy meshing, surface materials.
