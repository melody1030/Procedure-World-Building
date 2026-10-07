# Blueprint City: the procedural world

[← Back to the main README](../../../README.md) · [Concept](../../../docs/concept.md) · [Plan](../../../docs/plans/procedural-world-plan.md)

Route: `/world` (seed in the URL, e.g. `/world?seed=harbor`).

## Now: starting again from the terrain

The world has been taken back to its ground, to be rebuilt one technique at a time. What is
here:

- **Island** (`stages/island.ts`): radial falloff, a noisy coast radius, domain warp, a random
  stretch and rotation, and a bay.
- **Terrain** (`stages/terrain.ts`): fBm, ridged noise and a plateau, Week 2's droplet erosion,
  terraces one storey tall with wandering edges, and a clean-up pass.
- **Voxelise** (`stages/voxels.ts`): the terraced columns drawn as voxels, greedy-meshed.
- **Diorama** (`render/`): the cut-away plinth, a dark mirror sea, moonlight with shadows, and a
  Terraces colour overlay.

The settings panel (left) has the Island, Noise, Erosion and Terraces settings, a Result card
and How it works. A change reruns only the stages from the one it touches.

## Version 1 (2026-10-07): the full city pipeline

The first complete version: a 14-stage seed → rules → city pipeline (island, terrain, water,
voxels, suitability, districts, roads, growth, buildings, bridges, props, atmosphere,
performance). The settings panel had one tab per course topic (Terrain, Voxels, Shader, Paths,
Scatter), and a change reran only the stages from the one it touched. This version was then
taken back to terrain only, to rebuild the world step by step from the start. The code is in
the git history at commit `bd582ca`.

| Rainy night | Dusk |
|---|---|
| ![Rainy night, finished city](screenshots/2026-10-07-v1-rainy-night.webp) | ![Dusk mood](screenshots/2026-10-07-v1-dusk.webp) |

| Districts overlay | Growth, District phase |
|---|---|
| ![Worley districts overlay](screenshots/2026-10-07-v1-districts-overlay.webp) | ![The city partway through its growth](screenshots/2026-10-07-v1-growth-district-phase.webp) |
