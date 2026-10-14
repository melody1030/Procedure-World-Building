# Procedure World Building

_A working repository for the Procedure World Building project (2026 Fall)._

**Live site:** [procedural-worlds-d79be.web.app](https://procedural-worlds-d79be.web.app), hosted on Firebase ([how it was set up](docs/tutorial/firebase-tutorial.md)).

## Table of Contents

- [Overview](#overview)
- [Project Concept: Blueprint City](docs/concept.md)
- [Repository Structure](#repository-structure)
- [Documentation](#documentation)
- [Final Project: Blueprint City (procedural world)](#final-project-blueprint-city)
  ([development log](site/src/world/README.md)): terrain, river, street network, districts and lots
- [Weekly Progress](#weekly-progress)
  - [Week 1 — Three.js Basics](site/src/weeks/week01-threejs-basics/README.md): geometry, materials, lighting
  - [Week 2 — Noise Grid & Hydraulic Erosion](site/src/weeks/week02-noise-grid/README.md): noise stacks, shaping, droplet erosion
    ([presentation feedback](docs/analysis/week02-noise-grid-feedback.md))
  - [Week 3 — Voxels & Volumes](site/src/weeks/week03-voxels-volumes/README.md): voxel resolution, implicit surfaces, CSG, mesh generation
  - [Week 4 — Shader Studio](site/src/weeks/week04-shaders/README.md): pick a shader technique from a dropdown, tune it and see the value it computes
  - [Week 5 — Scatter & Paths](site/src/weeks/week05-scatter-paths/README.md): scatter layers with rules, spline roads and rivers, particles in a wind field
- [Firebase: Accounts & Saved Configurations](#firebase-accounts--saved-configurations)
- [Getting Started](#getting-started)

## Overview

This repository tracks my coursework for **Procedural World Building** at
Cornell Tech (Fall 2026). The class is built around a single idea: instead
of placing every rock, river, and tree by hand, you write rules and
numbers that generate a world from parameters. You turn
a slider, an algorithm runs, and a planet (or a map of it) updates in
front of you.

Over the semester the class climbs a sequence of generation problems,
starting from the web stack itself and moving through:

- **Terrain** — noise fields (Perlin-style, layered/ridged/warped), heightmaps
- **Planets** — mapping a 2D map onto a sphere, sphere geometry
- **Structure** — voxel terrain, equirectangular maps, hydraulic (droplet) erosion, biomes, flood-fill
- **Flows** — vector fields, atmosphere (wind/clouds), oceans and currents
- **Populations** — scattering objects by biome/slope/soil, foliage, simple characters
- **Networks** — roads and a small simulated town graph
- **Performance** — level of detail, streaming, line of sight

The course's shared studio (a React + TypeScript + Three.js planet
builder) and reference materials live in the instructor's repository:
[jomasan/Procedural-World-Building](https://github.com/jomasan/Procedural-World-Building).
This repo is where I track my own planning, tutorial notes, and analysis
as I work through the material.

## Repository Structure

```
Procedure-World-Building/
├── README.md                  ← you are here: entry point and table of contents
├── docs/
│   ├── concept.md             ← the project concept (Blueprint City)
│   ├── analysis/              ← feedback and reflection notes from class presentations
│   ├── plans/                 ← build plans (shader studio, terrain, town)
│   ├── notes/                 ← class notes from lectures (noise, shaders, distributions & paths)
│   └── tutorial/              ← setup guides (React, Three.js, Git, Firebase)
└── site/                      ← the React + TypeScript + Three.js workshop site
    ├── STYLE_GUIDE.md         ← shared visual style for every week
    └── src/
        ├── components/        ← UI shared by all weeks (side panel, controls)
        ├── world/             ← the final project, Blueprint City (route /world)
        │   ├── README.md      ← its development log
        │   ├── terrain/       ← one file per pipeline stage
        │   └── screenshots/
        └── weeks/
            ├── week01-threejs-basics/
            ├── week02-noise-grid/
            ├── week03-voxels-volumes/
            ├── week04-shaders/
            └── week05-scatter-paths/
                ├── README.md      ← the study notes for that week
                ├── screenshots/   ← images referenced by that README
                └── *.ts / *.tsx   ← the week's code
```

Every week follows the same pattern: its code, a `README.md` study notebook, and a
`screenshots/` folder live together in one folder under `site/src/weeks/`.

## Documentation

- [`docs/concept.md`](docs/concept.md) — the project concept: a procedural voxel diorama that grows from a cliffside settlement into a neon cyberpunk megacity
- [`site/src/world/README.md`](site/src/world/README.md) — the development log of the procedural city (live at `/world`)
- [`docs/plans/terrain-plan.md`](docs/plans/terrain-plan.md) — the build plan for the city's terrain: noise, shaping, terraces, river, surfaces
- [`docs/plans/town-plan.md`](docs/plans/town-plan.md) — the build plan for the town: street network, districts and lots, scatter
- [`docs/analysis/Week06-feedback.md`](docs/analysis/Week06-feedback.md) — teacher feedback on the project direction (Week 6)
- [`docs/analysis/week02-noise-grid-feedback.md`](docs/analysis/week02-noise-grid-feedback.md) — teacher feedback from the Week 2 presentation, and ideas for future work
- [`site/STYLE_GUIDE.md`](site/STYLE_GUIDE.md) — the shared visual style for every page of the site (colours, fonts, panels, controls)

**Class notes** ([`docs/notes/`](docs/notes)):

- [Noise & Maps](docs/notes/noise-and-maps-notes.md)
- [Shaders](docs/notes/shaders-notes.md): the graphics pipeline, shader languages, and techniques (gradients, fog, fresnel, matcap, cel, contact, vertex displacement)

**Tutorials** ([`docs/tutorial/`](docs/tutorial)):

- [Installing React (with terminal basics)](docs/tutorial/react-install-tutorial.md)
- [Installing Three.js](docs/tutorial/threejs-install-tutorial.md)
- [Git & GitHub](docs/tutorial/git-github-tutorial.md)
- [Firebase: Hosting and Firestore](docs/tutorial/firebase-tutorial.md)

## Weekly Progress

Each week's in-class workshop lives as its own tab in [`site/`](site).
Short summary below, in syllabus order; each week's folder has its own
detailed README with a dated development log of screenshots. Note the
noise grid (now Week 2) was actually built first (2026-09-10) and
Three.js Basics was split out as its own Week 1 afterward (2026-09-14) —
folder numbers track the syllabus, not build order.

- **2026-09-14 — [Week 1 — Three.js Basics](site/src/weeks/week01-threejs-basics/README.md)** —
  a playground for core Three.js building blocks: swap between primitive
  geometries (box, sphere, icosahedron, torus, torus knot, cone,
  cylinder), materials (Standard/Physical PBR, Phong, Toon, unlit Basic),
  and light types (directional, point, spot) with intensity and shadow
  controls, plus wireframe and auto-rotate. Goal: build intuition for how
  geometry, material, and lighting interact before moving into procedural
  generation.

  ![Torus knot with directional light and shadows](site/src/weeks/week01-threejs-basics/screenshots/2026-09-14-torus-knot-directional-shadows.jpg)

- **2026-09-10 — [Week 2 — Noise Grid & Hydraulic Erosion](site/src/weeks/week02-noise-grid/README.md)** —
  a 2D/3D terrain viewer driven by a noise stack (White/Perlin/Cellular
  noise, shaping curves, adjustable grid resolution, linked 2D map ↔ 3D
  terrain selection), extended into a full Assignment 2 submission with a
  deterministic, seeded hydraulic (droplet) erosion simulation and a
  scrubbable timeline player (play/pause, speed control, seek, reset)
  that reshapes the height field in real time.

  ![Perlin noise heightmap terrain](site/src/weeks/week02-noise-grid/screenshots/2026-09-10-perlin-heightmap.jpg)

- **2026-09-23 — [Week 3 — Voxels & Volumes](site/src/weeks/week03-voxels-volumes/README.md)** —
  four tabs built around sampling shapes into a voxel grid: Resolution (a
  fixed shape voxelized at an adjustable grid density), Implicit Surfaces
  (a procedural noise field turned into a solid/empty test, e.g. terraced
  terrain), a CSG "Voxel Techniques Lab" where primitives are combined
  via SDF boolean formulas (union/difference/intersection) and manipulated
  with a Move/Rotate/Scale gizmo, and Mesh Generation, which compares five
  surface-extraction methods (culled faces, greedy, marching cubes, surface
  nets, dual contouring) with per-method controls and a step-by-step mode.

  ![CSG boolean difference result](site/src/weeks/week03-voxels-volumes/screenshots/csg-difference-result.webp)

  ![Mesh generation, Marching Cubes on a cube and ball](site/src/weeks/week03-voxels-volumes/screenshots/mesh-final-ui.webp)

- **2026-09-29 — [Week 4 — Shader Studio](site/src/weeks/week04-shaders/README.md)** —
  the Assignment 2 shader study. A dropdown picks one technique at a time (ripple, which turns
  the floor into water with contact-shader foam, flat, position gradient, slope, matcap, Lambert, cel with
  outlines, fake AO, fresnel rim and distance fog) on a calm scene of simple architectural and
  rounded forms. It replaces an earlier voxel-city version that was too
  busy to show the techniques. Lecture notes:
  [Shaders — class notes](docs/notes/shaders-notes.md).
  ![Shader Studio](<site/src/weeks/week04-shaders/screenshots/截圖 2026-09-30 08.35.24.png>)

- **2026-10-06 — [Week 5 — Scatter & Paths](site/src/weeks/week05-scatter-paths/README.md)** —
  the three parts of Class 06 on one terrain. **Scatter:** four asset layers (trees, bushes,
  rocks, windmills), each with its own distribution (random, noise, Poisson disk), height and
  slope rules, surface alignment and terrain tint. **Paths:** a road and a river laid along
  Catmull-Rom splines that read the terrain, flatten or carve it, keep scatter away and place
  lamp posts. **Particles:** rain, wind and clouds driven by a curl-noise vector field, with
  trails. Lecture notes:
  [Distributions, Paths & Vector Fields — class notes](docs/notes/distribution-and-paths-notes.md).
  ![Scatter & Paths](site/src/weeks/week05-scatter-paths/screenshots/2026-10-06-scatter-rain.jpg)

## Final Project: Blueprint City

The weeks come together in one procedural world at **`/world`**
([concept](docs/concept.md)): a voxel diorama that grows from a seed into a terraced cyberpunk
city. Each stage has its own settings, and each one reuses a week's technique: Week 2's noise
for the terrain, Week 3's voxels and greedy meshing, Week 4's shaders for the voxel ground, and
Week 5's paths for the river. Full dated log with screenshots:
**[Blueprint City development log](site/src/world/README.md)**.

- **2026-10-07 — Version 1, then a restart.** A complete 14-stage city pipeline was built and
  committed (`bd582ca`), then taken back to an empty diorama to rebuild step by step. The terrain
  was rebuilt on 0.25 m voxels: noise, shaping, slope-scaled terraces, surfaces and a voxel-grid
  shader.
- **2026-10-08 — River and claims.** A river valley laid with Week 5's spline technique; the ocean
  removed so the river is the waterfront; a claim map so each stage keeps off the land earlier
  stages use; a center plaza by the river and the first switchback street.
- **2026-10-09 — Streets, districts and lots.** The street network went through three designs
  and ended as wave function collapse on a tile grid, solved outward from the plaza: one
  connected network with right-angle junctions. A district map (corporate core, neon strip,
  megablocks, industrial, wealthy, parks) and building lots along the streets.
- **2026-10-12 — Districts like Cities: Skylines, and parks.** The city always takes the larger
  side of the river. Districts became a few whole areas (a compact corporate core, a commercial
  ring, megablocks, industrial, wealthy), every lot fronts a street, and 3 to 6 round parks sit
  on their own layer.
- **2026-10-12/13 — The building library.** Eleven cyberpunk voxel buildings for the lots,
  previewed at `/buildings`. Four were redesigned from real references: the Corporate Megatower
  (SUMMIT and Edge), the Neon Commercial Tower, a Research Lab Tower (Kahn's Richards Labs) and a
  TV-tower Landmark (CN Tower). Every building has a street entrance (five styles) and shop fronts
  of mixed units, checked automatically for clashes and flicker.
- **Next:** place the buildings on the lots by district, then scatter and bridges.

| Districts and parks | The building library |
|---|---|
| ![Blueprint City: districts and round parks over the street network](site/src/world/screenshots/2026-10-12-districts-parks.webp) | ![The eleven buildings in the /buildings preview](site/src/world/screenshots/2026-10-13-building-library.webp) |

## Firebase: Accounts & Saved Configurations

The live site uses Firebase for sign-in and per-user saved settings. Full walkthrough, including
the problems I hit along the way: **[Firebase tutorial](docs/tutorial/firebase-tutorial.md)**.

- **Authentication:** "Sign in with Google" in the top bar.
- **Firestore:** once signed in, **Configurations** saves the current week's settings to your
  account (`users/{uid}/configs`) and loads them back later, on any device. Week 3 saves all four
  tabs, including the CSG shape tree. Security rules ([`site/firestore.rules`](site/firestore.rules))
  let each user reach only their own data.
- **Hosting:** the site is deployed to [procedural-worlds-d79be.web.app](https://procedural-worlds-d79be.web.app).
- **Storage:** not used. The project stays on the free Spark plan, where new projects can't create
  a Storage bucket, so each save's thumbnail is a small JPEG kept in its Firestore document. The
  tutorial explains the Storage version (Part D).

Code: [`site/src/firebase/`](site/src/firebase) (connection, sign-in, save/load) and
[`site/src/components/AccountMenu.tsx`](site/src/components/AccountMenu.tsx) (the top-bar menu).

## Getting Started

Each week's in-class workshop lives as its own tab in a small React +
TypeScript + Vite site under [`site/`](site). To run it locally:

```bash
cd site
npm install
npm run dev
```

Then open the printed `localhost` URL. New weeks are added by dropping a
folder under `site/src/weeks/` and registering it in
[`site/src/weeks/registry.ts`](site/src/weeks/registry.ts).
