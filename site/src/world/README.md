# Blueprint City: the procedural world

[← Back to the main README](../../../README.md) · [Concept](../../../docs/concept.md) · [Terrain plan](../../../docs/plans/terrain-plan.md) · [Town plan](../../../docs/plans/town-plan.md)

Route: `/world` (seed in the URL, e.g. `/world?seed=blueprint`).

A voxel diorama generated from a seed: terrain first, then a river, a street network, districts
and lots, with buildings to come. Every stage has its own settings on the left panel, and a change
reruns only the stages from the one it touched. The print bar at the bottom replays the terrain
printing layer by layer from the plinth up.

## Where it stands (2026-10-12)

```text
seed → noise → shaping → heights → terraces → river → claims → hubs → streets → voxelize → surfaces → mesh → districts + lots
```

- **Terrain:** done. 232 m across, 0.25 m voxels (928 × 928 columns), land only, with a river.
- **Streets:** done (third design, wave function collapse from the plaza).
- **Districts and lots:** first pass done.
- **Next:** scatter along the streets and over the land, then bridges and the buildings.

Code: `terrain/` holds one file per stage; `ui/TerrainPanel.tsx` is the panel, `ui/PrintBar.tsx`
the print timeline, `render/print.ts` the ground shader. `noise.ts` and `rng.ts` are shared with
Week 5.

---

## Development log

### 2026-10-07: version 1, the full city pipeline

The first complete version: a 14-stage seed → rules → city pipeline (island, terrain, water,
voxels, suitability, districts, roads, growth, buildings, bridges, props, atmosphere,
performance). The settings panel had one tab per course topic (Terrain, Voxels, Shader, Paths,
Scatter).

It worked, but it was too much at once and hard to tune or explain, so the same day it was taken
back to terrain only (commit `5e83a14`) and then wiped, to rebuild the world one step at a time.
The code is in the git history at commit `bd582ca`.

| Rainy night | Dusk |
|---|---|
| ![Rainy night, finished city](screenshots/2026-10-07-v1-rainy-night.webp) | ![Dusk mood](screenshots/2026-10-07-v1-dusk.webp) |

| Districts overlay | Growth, District phase |
|---|---|
| ![Worley districts overlay](screenshots/2026-10-07-v1-districts-overlay.webp) | ![The city partway through its growth](screenshots/2026-10-07-v1-growth-district-phase.webp) |

### 2026-10-07: rebuilding the terrain

Following [the terrain plan](../../../docs/plans/terrain-plan.md).

- **Smaller voxels:** 0.25 m instead of 0.5 m, so slopes read as fine voxel stairs and cliffs as
  tall stacks of small blocks.
- **Noise:** Week 2's noise stack (Perlin, Ridged, Billow, Cellular, White; Scale, Octaves,
  Persistence, Lacunarity), sampled at an adjustable Resolution, rounded to whole voxels and
  greedy-meshed chunk by chunk.
- **Shaping:** Power, Ridge sharpness and Height.
- **Terraces:** snapping scaled by local slope. Gentle ground keeps its voxel stairs; steep ground
  becomes shelves and cliffs.
- **Surfaces:** riverbed, bank, rock, dirt and grass by rules on slope and height, with a ground
  shader that draws the voxel grid, a per-block tint and strata bands on cliff sides.

![The first terrain: Perlin noise on 0.25 m voxels, with the noise panel](screenshots/2026-10-07-terrain-noise.webp)

*The first step: noise → voxel columns, with the Noise, Grid and Coast sections. The coast and
domain warp seen here were removed the next day.*

### 2026-10-08: the first street

- **River valley,** with Week 5's path technique: control points that seek low ground, a
  centripetal Catmull-Rom spline, and a carve with banks. The water stays level across the
  channel and steps down steadily along it. The control points can be dragged in the view.
- **Hubs:** one center by the river, on the flattest ground, for a single megacity.
- **The first street:** an route from the center plaza that climbs in switchbacks, never
  steeper than 15%, carved into the hills and built up over dips.

| The river and the first street                                                                           | The same view with Show claims                                                        |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| ![River valley with the plaza and one switchback street](screenshots/2026-10-08-river-first-street.webp) | ![Claims: river, bank, road, verge and plaza](screenshots/2026-10-08-claims-map.webp) |

### 2026-10-09: the street network, districts and lots

The street network went through three designs in two days:

1. **Point to point:** each link routed on its own. Streets met at sharp angles and crossed away
   from junctions.
2. **Grown:** streets grown from the plaza, steered by a direction field and held to local rules.
   Better angles, but sparse on hilly seeds and few closed blocks.
3. **Wave function collapse:** street tiles on a grid, solved outward from the plaza.

What the network is now:
- **Avenues:** 3 to 5 straight from the plaza (the seed picks), held to a 15% grade; side streets
  may climb 25%.
- **Width:** every street is 3.5 m.
- **Junctions:** square pads on the voxel grid, as wide as the streets meeting there.

Then the **district map**, an internal map of what kind of building belongs where:
- **Six districts:** corporate core, neon strip, megablocks, industrial / docks, wealthy, parks,
  from access to the plaza, street frontage, distance to the river and slope.
- **Lots** along the streets, each in its district's color, never touching a road, the plaza, the
  river or another lot.
- **Show districts** and **Show lots** draw them without rebuilding the ground.

| Show districts and Show lots | Show claims: streets, verges, plaza and lots |
|---|---|
| ![Districts and lots over the street network](screenshots/2026-10-09-wfc-streets-districts.webp) | ![Claims with the lots added](screenshots/2026-10-09-wfc-streets-lots-claims.webp) |

