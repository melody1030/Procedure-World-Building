# Blueprint City: the procedural world

[← Back to the main README](../../../README.md) · [Concept](../../../docs/concept.md) · [Terrain plan](../../../docs/plans/terrain-plan.md) · [Town plan](../../../docs/plans/town-plan.md)

Route: `/world` (seed in the URL, e.g. `/world?seed=blueprint`).

A voxel diorama generated from a seed: terrain first, then a river, a street network, districts
and lots, with buildings to come. Every stage has its own settings on the left panel, and a change
reruns only the stages from the one it touched. The print bar at the bottom replays the terrain
printing layer by layer from the plinth up.

## Where it stands (2026-10-13)

```text
seed → noise → shaping → heights → terraces → river → claims → hubs → streets → voxelize → surfaces → mesh → districts + lots + parks
```

- **Terrain:** done. 232 m across, 0.25 m voxels (928 × 928 columns), land only, with a river.
- **Streets:** done (third design, wave function collapse from the plaza).
- **Districts, lots and parks:** done, Cities: Skylines style (whole districts, every lot on a
  street, parks as their own layer).
- **Buildings:** a library of eleven archetypes, previewed at `/buildings`, not yet placed on
  the lots.
- **Next:** place buildings on the lots by district (one landmark at the plaza), then scatter
  and bridges.

Overlays can be opened from the URL: `/world?show=districts,lots,parks`.

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


### 2026-10-12: the larger side of the river, and denser lots

- **The city's side:** the river splits the land in two, and the city now always starts on the
  side with more land. Before, the center went to the best spot on either side, so on some seeds
  the city sat on the narrow strip.
- **Grid section removed:** the noise Resolution is fixed at 96 × 96.
- **Denser lots:** lots covered only 13–25% of the district land, too sparse for a cyberpunk city.
  The land the street lots leave (block interiors, corners, land behind the outer streets) is now
  packed with **back lots** reached by alleys, and every lot keeps a 1 m alley from its
  neighbors. Cover is 48–55% on the 7 test seeds, and the stage got faster (72–139 ms).
- **Town views fixed:** Show lots is now a ground tint, like Show districts and Show claims, so
  lots follow the slopes and hide behind hills instead of floating through them. The tints no
  longer paint the diorama's outer walls, and the network's dots, lines and tile squares are
  hidden behind the ground (the squares now follow the slopes). Districts are now tinted per
  column: they reach right up to the street edge, and the paving itself stays clear.
- **Lots and districts like Cities: Skylines:** back lots needed alleys, and the alleys doubled up
  and climbed cliffs, so they're gone. Every lot now fronts a street: each side is cut into lots
  of whole 8 m zone cells that deepen until they meet the lots from the street behind, and a
  second pass fills the corners. Districts are smoothed into a few whole areas (none under
  1,500 m², reaching across streets), like painted districts. Cover is 20–41%.
- **Fewer, whole districts:** the corporate core is one compact disc around the plaza (at most
  50 m out), and nothing smooths it away or spreads it. Neon wraps it as one band of street
  frontage, with strips out along the avenues. Small leftover pieces under 2,000 m² join their
  neighbor.
- **Parks are not a district:** they are a layer of their own on top of the districts, claimed
  like roads so no lot goes there. Each seed picks 3 to 6 parks, each a round patch of
  700–1,400 m² grown outward from a spot on steep or hilly ground outside the core, and every
  park keeps at least 25 m from every other (fewer fit on a small city). They have their own **Show parks** switch; Show districts ignores them and
  shows the districts underneath.
- **Neon strip renamed Commercial,** and twice as wide: it reaches 28 m back from the street
  (was 14 m) in a 40 m ring around the core (was 20 m), plus the avenue strips. It now covers
  14–42% of the land (was 5–13%).

| Show districts and Show parks | Show lots |
|---|---|
| ![Districts in a few whole areas, the commercial ring around the core, round parks on their own layer](screenshots/2026-10-12-districts-parks.webp) | ![Every lot fronts a street, cut into whole 8 m zone cells](screenshots/2026-10-12-lots.webp) |

*Districts and parks (left) and lots (right) after these changes, on the default `blueprint` seed.*

### 2026-10-12: the building library

A library of cyberpunk voxel buildings for the lots, in [`buildings/`](buildings/README.md), with
a preview at `/buildings` (`/buildings?b=<id>&seed=<n>` opens one building). Plain three.js, like
the rest of `/world`, built at the city's 0.25 m voxel scale.

**The kit.** Every building is made from shared parts:
- recessed windows with mullions and sills;
- balconies with railings, and AC units on brackets;
- blade signs and screens;
- rooftop gear, skybridges and platforms;
- shop rows and entrances.

Every building:
- is seeded, so the same seed always gives the same building;
- takes a few milliseconds to build;
- is two draw calls (a lit body and its glowing parts);
- lists the districts it suits, ready for placing on lots.

The first version had ten archetypes: five skyscrapers and five high-density residential blocks.

**Making it hold up close.** Most of the first day went into the details looking right from any
angle:
- **Flicker:** faces sharing a plane flickered as the camera moved. Every part now keeps its own
  depth (parts stand a fraction of a voxel proud of the wall). A development check,
  `findOverlaps`, measures what's left: from 700–2,300 m² per building down to under 1 m² on
  most.
- **Parts running into each other:** a second check, `findClashes`, records every part's space
  and lists any two that run into each other. It found rooftop gear piled up, balconies inside
  skybridges, trees in walls and a bench under the awnings. Optional details now go only where
  they have room (or retry, or are left out), and skybridges reserve their space before the
  facades are dressed.
- **Facade details,** one at a time:
  - balconies got railings on three sides;
  - lit windows are lit from sill to head (no half-lit ones);
  - AC units became wall units on brackets, 1.2 m wide, with 30% left out at random;
  - an outside fire stair was tried on the Stacked Megablock, then removed.
- **Signs on solid wall.** Blade signs floated in front of windows or out over alleys. They now
  hang centered on a pier or corner column of their own mass (`pierSign`), sliding up or down to
  find room but never past their wall. Screens over fins or AC units stand off on brackets.

### 2026-10-13: redesigns, entrances and shop fronts

**Four buildings redesigned from references.** For each, I looked up real buildings first.
- **Corporate Megatower,** after SUMMIT One Vanderbilt and Edge (30 Hudson Yards), now 150 m:
  - a shaft tapering in four-floor tiers, its south face leaning;
  - thin ledges and lit glass reveals like SUMMIT's;
  - Edge's triangular sky deck jutting 12 m out near the top;
  - a stepped glass crown and a spire.
- **Neon Commercial Tower,** now 75 m:
  - blade signs only on every other inner pier, so they never cover each other;
  - neon bands broken around the screens;
  - warm lit windows only, so the signs carry the color.
- **Research Lab Tower** (replacing the Industrial Technology Tower), after Louis Kahn's Richards
  Medical Research Laboratories and the Salk Institute:
  - two glass lab towers either side of a windowless concrete service tower;
  - louvered service floors between every two lab floors;
  - brick stair and exhaust shafts climbing the outside, and exhaust stacks;
  - a greenhouse, and a double helix up the service tower.
  - Before it there was an industrial tower (an exoskeleton, smokestacks and a cooling tower),
    which was deleted. The first industrial design lives on as the residential **Tower and
    Annex**, the eleventh archetype.
- **Landmark Tower,** a TV tower after the CN Tower and Berlin's Fernsehturm, now 170 m:
  - buttress fins at the foot of a tapering round shaft, with a glass lift;
  - a disc observation pod with a deck and a restaurant, then a sky pod;
  - a banded antenna mast.
  - Its research: what landmarks in different countries share. They are visible from afar,
    unlike their neighbors, have a silhouette you can draw, a crowned top and a public viewing
    level. It is the tallest building in the library.

| The library (seed 1) | Corporate Megatower |
|---|---|
| ![All eleven buildings in the preview](screenshots/2026-10-13-building-library.webp) | ![Corporate Megatower: tapering tiers, glass reveals, the sky deck and crown](screenshots/2026-10-13-corporate-megatower.webp) |

| Research Lab Tower | Landmark Tower (TV tower) |
|---|---|
| ![Research Lab Tower: glass lab towers, louvered service floors, brick shafts and the helix](screenshots/2026-10-13-research-lab-tower.webp) | ![Landmark Tower: a TV tower with a disc pod, sky pod and antenna](screenshots/2026-10-13-landmark-tv-tower.webp) |

**Screens.** The posters went through three rounds:
1. **Finer pixels:** a 0.25 m pixel grid, with each row's runs of one color merged into one box.
2. **More designs,** from cyberpunk pixel-art ad references.
3. **Without the neon look:** posters are now lit like backlit prints, below the bloom
   threshold. The designs are a ramen shop, a phone launch, a drink with a price burst, a cat
   mascot, a logo, a headline and a synthwave travel ad. A building doesn't repeat a design.

**A way into every building.** An audit found that only two buildings had their own doors; the
others reached the street only through shops. Now:
- Every building has a ground entrance facing the street. Each door records itself, and a check
  confirms every building has one, with a clear walkway to the lot edge, on 8 seeds.
- Entrances come in five styles, after real types, each matched to the building:
  - **glass doors** (Neon Commercial, the Tower and Annex's tower);
  - a **revolving door** (Corporate Megatower);
  - a **porte-cochère** (Residential Skyscraper, Twin-Tower);
  - a **portico** (Terraced Residential, the Research Lab);
  - a Hong Kong **tong lau gated stair hall** (Modular, Stacked, Vertical Neighborhood, the annex).

**Shop fronts.** Nearly every building had shops on all four sides.
- Now only the street side has shops; the other sides are plain service walls with a back door,
  vents and posters.
- The Neon Commercial Tower keeps shops all round. The Corporate Megatower and Terraced
  Residential have a glazed lobby front instead.
- Each shop unit is one of five types: a store, a closed roller shutter with graffiti, a noodle
  bar (noren curtains, a red lantern, stools), a convenience store or a hatch kiosk.

| Neon Commercial Tower | Stacked Megablock |
|---|---|
| ![Neon Commercial Tower: blade signs on the piers, backlit posters, warm windows](screenshots/2026-10-13-neon-commercial-tower.webp) | ![Stacked Megablock: the shop row with the gated stair-hall entrance](screenshots/2026-10-13-stacked-megablock.webp) |

| Terraced Residential | Tower and Annex |
|---|---|
| ![Terraced Residential: planted terraces, a glazed lobby front and a portico](screenshots/2026-10-13-terraced-residential.webp) | ![Tower and Annex: a slab of flats over shops beside a low annex with a roof garden](screenshots/2026-10-13-tower-and-annex.webp) |

Where it ends up: eleven archetypes, every one with no clashes on 8 seeds and under 0.5 m² of
flicker (the Vertical Neighborhood has about 4 m² left, not yet tracked down).
