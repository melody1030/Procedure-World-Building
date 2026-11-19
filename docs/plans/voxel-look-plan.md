# Plan: everything in voxels

**Drafted 2026-11-18. M1–M6 built 2026-11-18.** Only the ground reads as voxels; the buildings, the park
props, the people, the animals and the vehicles read as smooth boxes. This plan makes all of it
read as the same voxel world.

## Context: why only the ground reads as voxels

1. **The voxel look is drawn on the ground only.** `render/print.ts` (`LOOK_FRAGMENT`) draws a
   line round every voxel and tints each one a little, per pixel from the world position, so the
   ground's merged faces still show their cubes. The buildings and park props
   (`buildings/render.ts`, `buildingMaterials`) and everything alive (`render/life.ts`) use plain
   materials: a wall 20 m wide is one flat face.
2. **The sizes are on no grid.**
   - The building kit rounds to a quarter voxel (`m()` in `buildings/kit.ts`), and parts stand
     `PROUD` (0.12 voxel) out from the walls, so their edges fall between whole voxels.
   - The people, pigeons, cats and vehicles (`render/life.ts`) are boxes of any size: an arm is
     0.42 × 0.48 voxel, a car 5.6 × 2.4 × 13.6.
3. **The small things are smaller than one voxel.** A person is 1.3 m, about 5 voxels tall, and
   every part of them is less than one voxel across. At the ground's grid they could not show a
   single cube.
4. **The vehicles are glossy** (roughness 0.45, metalness 0.25) against the matte ground (0.92).

## Decisions

- **Two grids, nothing else.**
  - The **voxel** (0.25 m), as the ground: building masses, floors and roofs, tree crowns, hedges,
    and the large park props.
  - The **fine voxel**, a quarter voxel (6.25 cm): people, pigeons, cats, vehicles, small props
    (benches, bins, vending machines, lamps), and the buildings' details (windows, signs, AC
    units, railings).

  Every box is a whole number of cubes of one of the two.
- **One look for all of it.** The ground's lines and tint, drawn on every surface at that
  surface's own grid. They fade with distance as on the ground, so nothing shimmers.
- **The cubes are worked out in each box's own space**, not the world's. A box carries its cube
  coordinates in a vertex attribute (`aVoxel`), so a building turned to its lot, a prop turned to
  its path, or a walking person's swinging arm still shows its cubes square to its own edges.
- **Fixed constants, no new controls.** The existing Look › Grid strength drives all of it.
- **Rotation stays.** People, vehicles and props still turn freely, like voxel models in a game.
  Only their shapes go on the grid, not their placement.

---

## M1. The voxel look on everything (no shapes change)

- **`aVoxel` from the kit.** `Kit.box` writes each vertex's cube coordinates: its place in the
  box, from the box's own corner, over the box's grid. The grid is the coarsest one the box
  fits: the voxel if all its sizes are whole voxels, else the fine voxel.
- **The same attribute on the life models.** In `render/life.ts`, a helper builds each model's
  `aVoxel` from its boxes, at the fine voxel.
- **One GLSL chunk** (moved out of `LOOK_FRAGMENT`) for the lines and the per-cube tint, used:
  - by the ground, as today, on world position;
  - by the buildings' and parks' solid material, and by the life parts, on `aVoxel`. On a face,
    the axis whose coordinate doesn't change across it is skipped.
- **Not on glow.** Lit windows, neon and signs stay clean.

Done when the buildings, trees, people and cars show their cubes up close and fade to flat color
from afar, at the same frame time (±1 ms).

**Built 2026-11-18** (`render/voxelLook.ts`). The park props and tree crowns show their cubes
plainly; on the dark building walls the lines are faint, as the tint is the ground's. The frame
time was not measured (the browser pane runs at about 1 fps).

## M2. The buildings on the grid

- `PROUD` becomes a fine voxel (0.25), so proud parts start on the grid.
- Masses, floors, slabs and roofs are rounded to whole voxels (in `buildings/massing.ts` and
  `block.ts`).
- Details (windows, frames, signs, railings, AC units) are rounded to fine voxels. `m()` already
  rounds to a quarter voxel, so mostly it is the odd `PROUD` offsets and the `FIGURE_SCALE`
  products.
- Check the grammar's clash checks (`buildings/overlaps.ts`) and the Simulation page still pass.

**Built 2026-11-18.** Every box is snapped to the fine voxels in `Kit.box` and `Kit.light`, so no
part needed its own rounding; masses use `whole()`. The cubes are counted from each building's
origin. Snapping put many details in the plane of what they sit on, so a face that overlaps one
already in its plane is drawn a layer (0.02 voxel) in front of it. The flicker check is at 70 m²
over 88 test buildings (20 before, 3,300 snapped without layers); the clash check stays at zero; a
building takes about 6 ms to build instead of 2.

## M3. Animals as voxel models

- **Models from small voxel grids.** A pigeon 3 × 8 fine voxels, a cat 3 × 11, filled in as boxes
  of cubes and meshed once at load: only the faces no other cube covers, merged into as few
  rectangles as the colors allow.
- **Same parts and poses.** The pigeon's body and wings and the cat stay separate instanced parts,
  so the peck, flap and the cat's stalk and sprint keep working unchanged.
- **Colors per cube from the model** (a pigeon's wing bars, green neck, pink feet, eyes and beak;
  a cat's stripes, eyes and nose), times the color of each one as now.

**Built 2026-11-18** (`render/voxelModel.ts`, `render/life.ts`). The people stay as they are.

## M4. Vehicles, bins and shelters as voxel models

- Car, taxi, van, bus and garbage truck rebuilt on the fine grid, in one model each: the wheels
  (8 × 8, a hub on the outside), bumpers and skirts shaded into the paint; the glass; for a bus,
  its lit windows with pillars between, its door and its destination sign, drawn from the same
  model.
- Lights and the taxi sign as glow cubes, standing a fine voxel out of the body.
- Matte paint (roughness 0.8, metalness 0.05), so they sit with the ground.
- The wheelie bins (a band, the lid, two wheels and a handle), bag piles (three tied bags) and bus
  shelters likewise.

**Built 2026-11-18.**

## M5. Park props and street lamps

- Tree crowns, hedges and shrubs on whole voxels, with a stronger per-cube tint (leaves read as
  separate cubes).
- Benches, bins, vending machines, lamps and street lamps on fine voxels.

**Built 2026-11-18.** The benches, bins, vending machines, lamps and street lamps were on fine
voxels already, drawn with the building kit since M2. Each plant (tree, shrub, hedge) is now one
set of whole voxels (`voxelGrid.ts`, shared with the life models): its blocks fill in cubes and
only the outside is drawn, so overlapping blocks show no patches or seams and nothing flickers.
Leaves vary per cube three times as much (`LEAFY`, carried in `aVoxel`'s fourth value). The voxel
look rounds, not floors, the cube across a face, so a face on a whole voxel no longer speckles.
The flicker check is zero on every plant.

## M6. Check and tune

- Screenshots at three distances (street, park, whole city) on `blueprint` and `neon7`.
- Frame time and draw calls before and after; no shimmer when the camera moves.
- The README's dev log, the techniques docs, `npm run build`.

**Built 2026-11-18.** Measured on `blueprint` against the city before the plan (6cf213d), same
camera, in the browser pane:

| View | Frame (median) | Draw calls | Triangles |
|---|---|---|---|
| Whole city, before | 21.6 ms | 465 | 6.40 M |
| Whole city, after | 19.7 ms | 389 | 6.40 M |
| Street, before | 16.7 ms | 308 | 4.34 M |
| Street, after | 16.6 ms | 252 | 4.35 M |

The frame is no slower, with fewer draw calls (the before also lacks the plaza's roundabout, so
not all of the difference is this plan's) and the same triangles. The street view runs at the
display's rate either way.

---

## Files

| File | What changes |
|---|---|
| `render/print.ts` | The look chunk shared by the ground and everything else |
| `buildings/kit.ts` | `aVoxel` per vertex, the box's grid, `PROUD` |
| `buildings/render.ts` | The solid material gets the look |
| `buildings/massing.ts`, `block.ts`, `parts.ts` … | Sizes rounded to the two grids (M2) |
| `city/parkModels.ts` | Plants on whole voxels, leaves leafy (M5) |
| `render/life.ts` | `aVoxel` on the people (M1); voxel models for the animals and vehicles (M3, M4) |
| `voxelGrid.ts`, `render/voxelModel.ts` | Cubes filled in as boxes, their outside merged into rectangles (M3–M5) |
| `render/WorldView.ts` | The park materials patched with the look |
