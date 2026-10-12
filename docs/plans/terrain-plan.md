# Blueprint City: terrain plan

[← Back to the main README](../../README.md) · [Concept](../concept.md)

*Planned 2026-10-07. Decided so far: a **coast**, **no erosion**, **smaller voxels (0.25 m)**, a
**river valley made with Week 5's path technique**, and Week 2's **full noise list**. Nothing in
this document is built yet.*

The first layer of the new city: a voxel terrain generated from a seed, with its parameters on a
panel that works like Week 2's noise grid. The city will later grow on it, so the terrain has to
look right on its own *and* leave the right kind of ground for building.

---

## 1. What the terrain has to be

**From the concept** ([concept.md](../concept.md)):

- Natural ground: **cliffs, a coastline and a river valley**. The coast and ground come from
  noise; the valley comes from a path (§3, Stage 6). There is no erosion.
- **Terraced plateaus above water**, as in *Town to City*: the first settlement goes on the
  flattest ground nearest the water.
- **Cold, muted colors**, so that later the city is what glows.
- A **tabletop diorama** that ends in clean cliff edges on the plinth.
- **Readable voxels**: blocks visible at every scale, never a smooth realistic surface.
- Land should be **scarce on purpose**. Running out of flat ground is what pushes the city
  upward, so the terrain must not be one big flat plain.

**The high-voxel style:**

1. **Smaller voxels: 0.25 m** instead of version 1's 0.5 m. Every height is a whole number of
   these, so slopes are fine 1-voxel stairs and cliffs are tall stacks of small blocks.
   Nothing is interpolated or smoothed.
2. **The blocks stay readable even where faces are merged.** Greedy meshing merges flat areas
   into big rectangles, which hides the cubes. A shader draws them back: a faint per-voxel
   grid line and a per-block tint from a hash of the world position.
   - At 0.25 m the grid lines get dense from far away and would shimmer (aliasing, the Nyquist
     limit in the noise notes). So the shader fades them out where one voxel covers less than
     about 3 pixels, using screen-space derivatives (`fwidth`).
   - Up close you see every block; from the diorama view the ground reads as fine-grained
     voxel texture.
3. **Cliff faces show strata**: color bands down the side, matching the plinth's cut edge.
4. **Two kinds of step, mixed**:
   - *Terrace cliffs*: 3 m or more, where land levels change.
   - *Voxel slopes*: 1-voxel stairs on gentler ground.

   Version 1 only had cliffs. *Town to City* shows walkable slopes between some levels, and the
   city will need them for roads.

### New scale (`scale.ts` changes first)

| | Version 1 | New |
|---|---|---|
| Voxel | 0.5 m | **0.25 m** |
| Story (3 m) | 6 voxels | **12 voxels** |
| Land (192 m across) | 384 × 384 columns | **768 × 768 columns** |
| Chunks (32 voxels) | 12 × 12 | **24 × 24** |
| Sea depth (4 m) | 8 voxels | **16 voxels** |
| Water margin, plinth depth (20 m) | 40 voxels | **80 voxels** |

- **Physical sizes stay the same**, so the diorama doesn't shrink. Only the voxel count grows:
  four times the columns (about 590k).
- **All lengths on the panel are in meters** and converted to voxels in code. Changing the
  voxel size again later would not mean retuning every slider.
- **Fallback if it's too slow:** keep 0.25 m voxels but shrink the land to 144 m (576 columns).

---

## 2. Lessons carried over from version 1

| What happened | What to do this time |
|---|---|
| Terracing left one-column spikes and tiny islets | A majority filter, a minimum ledge width, and sinking islets under a size threshold |
| Erosion barely showed after terracing, and was the slowest stage | No erosion; a deliberate river valley instead, which is visible and tunable |
| Version 1's river came from flow accumulation and couldn't be steered | The river is a path with its own parameters (Stage 6) |
| Regenerating everything for one slider was slow | Rerun only from the stage a parameter belongs to (version 1's cache, which worked) |
| Too many parameters in the end | Week 2's set for noise and shaping; a few clear ones per voxel stage |

---

## 3. The pipeline

Each stage writes one layer and can be shown on its own, as Week 2's teacher feedback asked
("different layer, toggle on/off").

```text
seed
 ├─ 1 Base noise ....... Perlin / Ridged / Billow / Cellular / White fBm                 (Week 2, noise notes §4–6)
 ├─ 2 Land mask ........ coast (or island): falloff + noisy coastline + bay              (noise notes §5)
 ├─ 3 Shaping .......... power, ridge, height                                            (Week 2)
 ├─ 4 Terraces ......... height → whole voxels; terraces blended with slopes             (Week 2 terrace, Week 3 voxels)
 ├─ 5 Clean-up ......... majority filter, minimum ledge width, sink islets               (grids, flood fill)
 ├─ 6 River valley ..... path: control points → Catmull-Rom spline → carve               (Week 5 paths)
 ├─ 7 Surfaces ......... sand, grass, dirt, rock, strata, riverbed by rules              (rules on slope, height, distance)
 └─ 8 Mesh ............. greedy meshing per chunk + voxel-grid shader + river water      (Week 3 meshing, Week 4 shaders)
```

No erosion: every shape comes from noise, shaping and the river path. All are fast,
deterministic and easy to explain.

### Stage 1: base noise (Week 2's noise stack, extended)

- **Week 2's controls, kept as they are:**
  - Noise type: Perlin, Cellular, White. White stays for parity; it shows why raw static
    makes useless terrain.
  - Scale, octaves, persistence, seed.
- **Added from the noise notes:**
  - **Lacunarity**.
  - Two more noise types: **Ridged** (crests) and **Billow** (rounded hills).
  - *Domain warp was built (strength and scale) and removed on 2026-10-08 at the user's request.*
- **Resolution:** the noise is sampled on a field grid, as in Week 2, then bilinearly sampled
  per column.
  - Default 96 cells across (one per 2 m), up to 384.

### Stage 2: land mask (where the sea is)

- **Shape:** **Coast** by default. Land rises from the sea along one side of the diorama, for
  the "cliffside settlement above the water" in the concept. *Island* (radial falloff) stays
  as an option.
- **Controls:**
  - Direction: which side faces the sea (seed by default).
  - Land size: how far inland the coastline sits.
  - Coast roughness: noise along the coastline (headlands and coves).
  - Edge sharpness: how quickly land drops to sea.
  - Sea level.
  - Bay size (0 = no bay). The bay is where the harbor goes later and where the river ends.
- **Diorama edge:**
  - On the sea side the land fades to water before the edge of the square.
  - On the land side the ground meets the plinth's edge as a clean cut, showing its strata
    like the plinth below: the "diorama ends in cliff edges" in the concept.

### Stage 3: shaping (Week 2's curves)

- **Power** (redistribution): above 1 flattens lowlands into broad shelves near the water,
  where the first settlement goes.
- **Ridge sharpness:** Week 2's ridge fold, for crests on the high ground.
- **Height:** how high the ground can rise, in meters. Default 24 m.
- Terracing is **not** here as in Week 2. It moves to Stage 4, after shaping, and is
  blended with voxel slopes.

### Stage 4: terraces (where the voxel style comes from)

Each voxel column takes its height from the shaped field, then:

```text
h       = sea + field · height                          (voxels, continuous)
level   = floor(h / terraceStep + wander · fBm(x, z))   (terrace index)
terrace = level · terraceStep                           (snapped to a terrace)
column  = round( mix(h, terrace, strength) )            (whole 0.25 m voxels)
```

- **Terrace strength** (0–1) is the key control.
  - At 1 the ground is pure terraces: flat shelves and 3 m cliffs (version 1).
  - At 0 it is a pure 1-voxel stair landscape.
  - In between, flat shelves are joined by stairs on gentle ground and cliffs on steep ground:
    the *Town to City* look.
- **Terrace height:** 3 m by default; higher gives taller cliffs.
- **Edge wander:** how far terrace edges stray from the contour.
- **Slope threshold:** where the height change between neighbors is gentle it stays as stairs;
  where it is steep it becomes a cliff. This decides where the walkable slopes are.

### Stage 5: clean-up (makes the ground buildable)

**Skipped for now (2026-10-07, the user's choice).** With Terrace strength at 0.3 the ground has
few hard shelves to clean up. The pipeline goes straight from terraces to the river.

- Two **majority-filter** passes: no one-column spikes or notches.
- **Minimum ledge width** (default 5 m = 20 voxels): narrower terraces merge into a neighbor,
  so the city gets no unusable slivers.
- **Islets:** land pieces under a size threshold (default 60 m²) are sunk, using a flood fill.

### Stage 6: river valley (Week 5's path technique)

**Revised 2026-10-08 (after research on how rivers are built and rendered):**
- **Level across, falling along.** The water level at each sample is the lowest ground across the
  whole channel plus a column of bank each side, not just the center. A final pass lowers any
  water cell to its lowest dry neighbor. Water standing above a bank went from 7–16% of the
  river's edges to none at the default settings.
- **Steady descent.** The running minimum was flat for 73–86% of the river and then dropped all at
  once. Each drop is now spread back along the flat stretch before it (up to 0.75 m), and the last
  stretch falls into the sea. Bigger drops keep the rest as waterfalls at terrace edges.
- **Flow (removed the same day, the user's choice).** A flow shader that scrolled streaks
  downstream was built and then taken out, with the flow data that fed it. The river's surface is
  still. The bank and steady-descent fixes above stay.

The river comes **after the terrain is finished** (noise, coast, shaping, terraces, clean-up),
so it carves into the final ground rather than being reshaped by it.

The same three-way influence as Week 5's river, on the coast. The river runs from the high
ground inland down to the bay.

1. **Mesh → spline: choose the control points by reading the terrain.**
   - The **source** is on high ground near the inland edge; *Source position* slides it along
     that edge.
   - The **mouth** is the nearest sea on the coast (there is no bay).
   - Between them, *Control points* steps are spaced evenly. At each step the point may move
     sideways up to *Wander* × the distance between steps, and it goes to the **lowest ground**
     within that reach, as in Week 5.
2. **The curve:** a **centripetal Catmull-Rom spline** through the control points (Week 5's
   choice: no loops or cusps), sampled about every voxel.
3. **Water level profile:**
   - The terrain height is read along the curve and smoothed (*Profile smoothing* passes).
   - It is then forced to **never rise going downstream** (Week 5's `riverLevel`). Where it has
     to drop sharply, it drops in steps.
4. **Spline → terrain: a distance field to the curve carves the valley.**
   - Inside the **channel** (half of *Channel width*, growing to *Width at mouth* × at the bay),
     the ground goes to the water level minus *Channel depth*.
   - From the channel edge out to *Valley width*, the ground blends back to the original
     height. The blend follows *Valley shape*: low values give a V, high values a flat-floored
     U valley with steeper sides.
   - The carve only ever **lowers** ground, so it never builds walls.
5. **Through the terraces:** the river carves the finished, terraced ground. Its water level
   follows the stepped ground under it and only falls, so where it crosses a terrace edge it
   drops a whole step: a **waterfall**. The carve only lowers ground, so no terrace can dam it.
6. **Spline → later stages:** the distance field is kept on the terrain. The city will use it
   to keep buildings off the river, place bridges, and put lamps along the banks (Week 5's
   spline → scatter).
7. **Water** (switchable): voxel water fills the channel up to the stepped water level, with
   vertical water faces at the falls.

**Parameters** (all tunable on the panel):

| Parameter | What it does | Default | Range |
|---|---|---|---|
| River | On / off | on | |
| Source position | Where along the inland edge the river starts | seed | 0–1 |
| Control points | How many points the path is built from | 8 | 3–16 |
| Wander | How far each point may move sideways to find low ground | 0.5 | 0–1 |
| Channel width | Width of the riverbed at the source | 4 m | 1–12 m |
| Width at mouth | How much wider it gets at the bay | ×2 | ×1–×4 |
| Channel depth | How far the bed sits under the water level | 1 m | 0.25–4 m |
| Valley width | How far the valley reaches beyond the channel | 20 m | 0–60 m |
| Valley shape | V (0) to flat-floored U (1) | 0.4 | 0–1 |
| Profile smoothing | Passes that smooth the water level before it is made to only fall | 4 | 0–12 |
| Water | Fill the channel with voxel water | on | |

### Stage 7: surfaces (cold and muted)

Chosen by rules, not painted:

| Surface | Rule |
|---|---|
| Sand | Lowest level, within 1.5 m of the sea (breadth-first distance) |
| Grass | Flat tops, in 2–3 tones from low-frequency noise (darker low, lighter high) |
| Dirt / scree | 1-voxel slope stairs |
| Rock | Cliff rims that drop 6 m or more |
| Riverbed, banks | Inside the channel; stone along its edge |
| Strata | Cliff sides: color bands every 1.5–2 m, darker with depth |
| Seabed | Under water, shallow to deep |

The palette stays in the night-navy family from `palette.ts`, desaturated so the future city's
neon owns the color.

### Stage 8: mesh and look

- **Greedy meshing** of tops and sides per 32-voxel chunk (Week 3). At four times the columns
  this matters even more. Expect very roughly 60–120k faces after merging.
- **Voxel-grid shader** (Week 4), with the distance fade from §1.
- **River water:** its own greedy-meshed surface and waterfall faces.
- **Optional:** contact darkening at cliff bases (Week 4's fake AO).
- **Scene:** the plinth, the dark mirror sea and the moonlight already on `/world`, rescaled to
  the new voxel size.

---

### Ocean and coast removed (2026-10-08)

The ocean, the seabed and the coast were built, then removed at the user's request (a copy of
that version was kept outside the repo). What is left:
- **Land everywhere:** h = 1 + noise · (Height − 1), from one voxel above the plinth to Shaping's Height.
- **Plinth:** its top is height 0, and it is 20 m deep.
- **Stages:** the coast mask stage, the ocean stage and the coast/ocean parameter groups are gone.
- **River:** runs from one edge of the diorama to the opposite one; the seed picks the direction.
  It is never carved below one voxel above the plinth.
- **Surfaces:** the seabed and sand surfaces are gone, and with them Sand width, since sand only
  marked beaches. The rules are now riverbed, bank, rock, dirt, grass.
- **Panel:** the Water section is called River again and holds only the river controls.

## 4. The panel (like Week 2)

**Panel:** left side, sticky, in the weekly-studio style, with sections in pipeline order and a
Reset button. No Result or How it works cards (removed at the user's request). Lengths are in
meters.

| Section | Controls | Default |
|---|---|---|
| **Seed** | seed text + dice (seed also in the URL) | `blueprint` |
| **Noise** | Type (Perlin / Ridged / Billow / Cellular / White) · Scale · Octaves · Persistence · Lacunarity | Perlin · 3 · 5 · 0.5 · 2 |
| | Resolution (field cells across) | 96 (24–384) |
| **Shaping** | Power · Ridge sharpness · Height | 1.3 · 0.2 · 24 m |
| **River** | River · Control points · Channel width · Channel depth · Valley width · Valley shape · Water · Show path (drag points) · Reset path | see Stage 6 |
| **Voxels** | Terrace strength · Terrace height · Edge wander · Slope threshold · Min ledge width · Min islet | 0.3 · 3 m · 0.25 · 10° · 5 m · 60 m² |
| **Surfaces** | Grass tones · Strata spacing · Voxel grid (on/off, strength) | 3 · 1.75 m · on, 0.3 |

**Behavior:**
- Sliders apply on release; a change reruns only the stages from its own section onward.
- Selects and switches apply at once.
- A **Reset** button per section.

**Layers** (switches, one at a time on the ground, as Week 2's teacher asked):
- Height (Week 2's color ramp)
- Terrace levels
- Slope (stairs vs cliffs)
- **River path:** the control points and the spline drawn over the terrain, as Week 5 draws its
  paths, plus the distance field as a soft band. It shows why the valley is where it is.
- Buildable ground: flat shelves at least the minimum ledge width, as a preview of where the
  city can go

**2D map inset** (Week 2's linked map):
- The height field as a small map in a corner, with the river path on it.
- Week 2's click-to-pin, with a crosshair on the 3D terrain.

**Camera presets** (from Week 2): Perspective (the diorama view), Top, Side.

---

## 5. Code layout

```text
site/src/world/
  scale.ts, palette.ts, noise.ts, rng.ts      (kept; scale.ts moves to 0.25 m voxels)
  terrain/
    params.ts        every parameter, defaults, panel descriptions (one place)
    noise.ts         Stage 1: noise types, fBm variants
    mask.ts          Stage 2: coast / island mask, bay
    shape.ts         Stage 3: power, ridge, height (reuses Week 2's applyShaping where it fits)
    river.ts         Stage 6: control points, Catmull-Rom, water profile, distance-field carve
    voxelize.ts      Stages 5–6: columns, terraces, slopes, clean-up
    surfaces.ts      Stage 7
    mesh.ts          Stage 8: greedy mesher for ground and water
    pipeline.ts      runs the stages, reruns from the changed one
  render/            WorldView (kept), terrain material with the voxel-grid shader, layers, path overlay
  ui/                TitleCard (seed back), TerrainPanel, MapInset
```

**Shared code:**
- Week 2's shaping and noise descriptions are reused where they match, so the two pages
  explain things the same way.
- Week 5's `paths.ts` holds the river logic (control points, centripetal Catmull-Rom,
  `riverLevel`, distance field), written for Week 5's smooth terrain. The parts that don't
  depend on its terrain format (spline sampling, the never-rising profile) should be moved into
  a shared helper and imported by both, not copied.

---

## 6. Build order (each step ends with something to see)

1. **New scale + noise → voxel columns.**
   - `scale.ts` to 0.25 m; plinth and sea rescaled.
   - Stage 1 plus a plain voxelize (no terraces, no mask); panel with Seed, Noise, Resolution.
   - *See:* a finely blocky noise landscape that changes with every Week 2 control; rebuild time
     checked at 768 × 768.
   - **✔ Done 2026-10-07.** Code in `site/src/world/terrain/` (`params`, `noise`, `voxelize`,
     `mesh`, `pipeline`) and `ui/TerrainPanel.tsx`; the seed is back in the top-right card.
     - Measured on seed `blueprint`: noise 21 ms at Resolution 192 (280 ms at 768), voxelize
       about 15 ms, mesh about 130 ms. 768 × 768 columns are fast enough, so no fallback.
     - Until terraces exist, the ground is pure 1-voxel stairs: about 1.2M visible voxel faces,
       merged into about 400k quads (1.6M vertices). It still renders at about 90 fps. Terraces
       (step 5) will flatten large areas and cut this down. If it doesn't drop enough, store
       positions and normals in smaller types.
     - The height is fixed at 24 m above a 4 m seabed until Shaping (step 3) adds
       the Height control.
2. **Land mask.**
   - *See:* a coast rising from the sea on one side, with a bay, and land cut cleanly at the
     diorama's edge on the other.
   - **✔ Done 2026-10-07, without Shape, Direction or Bay size** (the user's choice). Coast
     only; the seed picks the sea side; no bay.
     - Code: `terrain/mask.ts` on its own 192-cell grid, so changing the noise Resolution never
       moves the coast.
     - Panel: a **Coast** section with Land size, Coast roughness, Edge sharpness and Sea level.
     - Elevation = mask × (0.35 + 0.65 × noise). The 0.35 keeps low noise from drowning inland
       ground. Below Sea level is seabed; above it, land starts one voxel above the water.
     - On five seeds about 30 % ends up under water. The mesh roughly halved (about 190k quads),
       since the sea floor is flat.
3. **Shaping + height.**
   - *See:* flatter lowlands and crested highs; height in meters.
   - **✔ Done 2026-10-07.**
     - Code: `terrain/shape.ts`, a stage of its own between the coast and voxelize. A Shaping
       change reruns shape → voxelize → mesh in about 70–140 ms.
     - Panel: a **Shaping** section with Power (1.3), Ridge sharpness (0.2) and Height
       (24 m).
     - Ridge is blended in by its own amount: v ← mix(v, (1 − |2v − 1|)^(1+3r), r). Power is
       applied after it.
     - Height is how high the ground *can* rise. The coast and Power keep most ground below it.
     - The color ramp now spans the land from the shore to Height.
4. **River valley.**
   - Path, carve and water, plus the River path layer.
   - *See:* a valley from the high ground to the bay, moving as you change Wander, widths and
     shape.
   - **✔ Done 2026-10-07**, with all 11 parameters and a **Show path** switch.
     - Code: `terrain/river.ts`. Heights became their own stage (`terrain/heights.ts`, continuous
       values), so the river carves them before `voxelize` rounds.
     - The spline and profile helpers are shared in `world/path.ts`; Week 5 now imports its
       `smoothProfile` and `neverRising` from there.
     - The water level is never above the ground under the curve and never rises downstream.
       The curve is cut just past the coast, and control points out at sea are not drawn.
     - River water is its own greedy mesh, translucent, with paler faces where it drops, and it
       prints with the terrain.
     - Measured on six seeds: rivers 134–145 m long; the river stage takes 50–70 ms. A river
       change reruns river → voxelize → mesh in 115–365 ms.
   - **Changed the same day (the user's choice):**
     - Removed Source position, Wander, Width at mouth and Profile smoothing. They are now fixed:
       a seeded source in the middle half of the inland edge, wander 0.5, one channel width,
       and 4 smoothing passes.
     - **Control points can be dragged** in the view while Show path is on. A drop rebuilds the
       river through the moved point.
     - Dragged points are stored as `river.control` with the parameters, so only river →
       voxelize → mesh rerun.
     - The automatic path returns on a new seed, a different number of points, Reset path, or
       Reset to defaults.
     - Points out at sea are drawn faint, since they can be dragged onto land.
     - The river's cut face at the diorama edge is drawn from its bed, in a darkened river
       color.
5. **Terraces and slopes.**
   - **Order changed (2026-10-07, the user's choice):** the river now runs **after** the terrain
     is finished. Terraces (and step 6's clean-up) slot in before the river in the pipeline, and
     the river carves the terraced ground.
   - Terrace strength, wander, slope threshold; river columns snapped down.
   - *See:* shelves, cliffs and stairs, and the river stepping down in waterfalls.
   - **✔ Done 2026-10-07** as Stage 4 (`terrain/terraces.ts`), between the height map and the
     river.
     - Panel: a **Terraces** section with Terrace strength (0.3), Terrace height (3 m),
       Edge wander (0.25) and Slope threshold (10°).
     - Snapping is scaled by local slope: ground gentler than the threshold keeps its voxel
       stairs; steeper ground becomes shelves and cliffs.
     - The 10° default comes from the measured slopes: the median is about 14° and a quarter of
       the land is under 6°.
     - Measured on three seeds: flat ground about 48 % → 70 %, cliff edges about 3 %, quads down
       about 30 % (54k with the threshold at 0). The stage takes about 50 ms.

6. **Clean-up.**
   - Ledge width and islets, plus the Buildable ground layer.
   - *See:* no slivers or spikes, and a clear picture of where a city could go.
7. **Surfaces + voxel-grid shader.**
   - *See:* sand, grass, rock, riverbed and strata in the cold palette, with readable cubes up
     close and no shimmer from afar.
   - **✔ Done 2026-10-07.**
     - Code: `terrain/surfaces.ts` (Stage 7) runs after voxelize. It picks seabed, riverbed, bank,
       sand, rock (2 m+ drop), dirt (steeper than 30°) or grass, plus one of three noise tones.
     - The mesh merges tops only where height, surface and tone all match. Sides are cliff rock
       from dark to light, except sand and seabed.
     - The voxel look (grid lines, a slight per-block tint, strata bands on cliff sides) is drawn
       in the ground shader (`render/print.ts`) from world position. Grid lines fade out below
       about 4 pixels per voxel.
     - Panel: a **Surfaces** section with Ground tones, Sand width (1.5 m), Rock cliff (2 m),
       Dirt slope (30°), Grass limit (30 m, above it is rock), and Voxel grid (the `look` group,
       live; nothing regenerates). Strata spacing was removed as a control; the bands stay at a
       fixed 1.75 m. Rule changes rerun surfaces → mesh only.
     - Fix (same day): dirt was hugging every terrace edge (about 60 % of it sat on an edge),
       because slope was read from the terraced map, where each step looks near-vertical. Slope
       is now read from the map before terracing, across 3 m: about 25 % on edges, and dirt
       forms patches on genuinely steep hillsides.
   - **Parameter audit (same day).** All 30 settings were swept to their min and max: no NaN,
     and cached rebuilds identical to fresh ones. Fixed:
     - Sea level 0 no longer turns the open sea into land.
     - Voxel grid changes no longer re-upload the mesh.
     - Ground tones 0 merges faces across tones.
     - Settings that blocked each other at defaults:
       - **Grass limit** is now the share of land (by area, lowest first) that may be grass,
         default 85%, so every seed gets about 12–16% bare high rock.
       - **Rock cliff** defaults to 0.75 m, so terrace rims at strength 0.3 can turn to rock.
       - **Sand** may sit up to max(1 m, 0.4 × Sand width) above the water, so wider settings
         make wider beaches.
     - On three seeds: grass about 53 %, dirt about 12 %, sand under 1 %, no rock at Terrace
       strength 0.3. Quads went from about 105k to about 170k, since tone and surface
       boundaries split merged faces.

8. **Views.**
   - 2D map inset with pin, the other layers, camera presets.
   - **Skipped (2026-10-08, the user's choice).**
9. **Check and tune.**
   - Five seeds next to the concept images.
   - Rebuild time: under about 400 ms for a full rebuild at Resolution 96; under about 150 ms
     for a river or voxel change (earlier stages cached).
   - README and screenshots, in the weeks' study-notebook style.

---

## 7. How to know it worked

- Five different seeds give five different coasts, each with cliffs, a bay, terraces, a mix of
  cliffs and voxel slopes, and a river valley that reaches the bay.
- Every Week 2 noise and shaping control, and every river parameter, visibly changes the
  terrain.
- The river never runs uphill, never sits above its banks, and steps down at terraces.
- The cubes read as cubes up close, and the ground doesn't shimmer from the diorama view.
- Buildable flat ground is about 20–35 % of the land: enough to start a settlement, little
  enough that it runs out.
- A screenshot sits comfortably next to the *Town to City* references, but cold and at night.

---

## 8. Decisions

**Decided (2026-10-07):**
- **River back on** (`RIVER_VISIBLE = true`) once terraces were built. It carves the terraced
  ground. The switch stays in `terrain/params.ts` for hiding it again.
- **Order: the river comes after the terrain is finished** (noise → coast → shaping → terraces →
  clean-up → river → surfaces → mesh).
- Shape: **Coast only**. Island, Direction and Bay size were dropped when step 2 was built, so
  the seed picks the sea side and there is no bay. The river (Stage 6) will end at the nearest
  sea instead of a bay.
- **No erosion.**
- **Heights in meters, not stories** (the user's choice): Height and Terrace height are set in
  meters, like the panel's other lengths.
- **Smaller voxels: 0.25 m**, keeping the diorama 192 m across (768 × 768 columns).
- **River valley from Week 5's path technique**, with the tunable parameters in Stage 6.
- **Noise list kept as is** (Perlin, Cellular, White), plus Ridged and Billow.

**Answered by step 1:** 768 × 768 columns at 0.25 m are fast enough; no fallback needed.
