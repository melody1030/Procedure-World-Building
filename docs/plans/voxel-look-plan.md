# Plan: everything in voxels

**Drafted 2026-11-18. M1 built 2026-11-18; M2–M6 to come.** Only the ground reads as voxels; the buildings, the park
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

## M3. People and animals as voxel models

- **Models from small voxel grids.**
  - A person about 21 fine voxels tall:
    - head 4 × 4 × 4, hair as cubes on it;
    - torso 5 × 7 × 3;
    - arms 2 wide, legs 2 wide each.
  - A pigeon about 5 long, a cat about 7.
  - Each model is written as layers of characters (like MagicaVoxel slices) and greedy-meshed to
    boxes once at load.
- **Same parts and poses.** Torso, head, hair, legs, arms, the seated legs and the pigeon's wings
  stay separate instanced parts, so the walk, sit and flap animations keep working unchanged.
- **Colors per cube from the model** (skin, shirt, trousers, shoes), still tinted per person as
  now.

## M4. Vehicles, bins and shelters as voxel models

- Car, taxi, van, bus and garbage truck rebuilt on the fine grid:
  - square wheels 6 × 6 fine voxels;
  - lights and the taxi sign as glow cubes.
- Matte paint (roughness 0.8, metalness 0.05), so they sit with the ground.
- The wheelie bins, bag piles and bus shelters likewise.

## M5. Park props and street lamps

- Tree crowns, hedges and shrubs on whole voxels, with a stronger per-cube tint (leaves read as
  separate cubes).
- Benches, bins, vending machines, lamps and street lamps on fine voxels.

## M6. Check and tune

- Screenshots at three distances (street, park, whole city) on `blueprint` and `neon7`.
- Frame time and draw calls before and after; no shimmer when the camera moves.
- The README's dev log, the techniques docs, `npm run build`.

---

## Files

| File | What changes |
|---|---|
| `render/print.ts` | The look chunk shared by the ground and everything else |
| `buildings/kit.ts` | `aVoxel` per vertex, the box's grid, `PROUD` |
| `buildings/render.ts` | The solid material gets the look |
| `buildings/massing.ts`, `block.ts`, `parts.ts` … | Sizes rounded to the two grids (M2) |
| `city/parkModels.ts` | Props on the grids (M5) |
| `render/life.ts` | Voxel models for people, animals and vehicles, with `aVoxel` (M1, M3, M4) |
| `render/WorldView.ts` | The park materials patched with the look |
