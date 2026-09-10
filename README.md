# Procedure World Building

_A working repository for the Procedure World Building project (2026 Fall)._

## Overview

This repository tracks my coursework for **Procedural World Building** at
Cornell Tech (Fall 2026). The class is built around a single idea: instead
of placing every rock, river, and tree by hand, you write rules and
numbers — *procedures* — that generate a world from parameters. You turn
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

## Documentation

Project documentation lives in [`docs/`](docs), organized by purpose:

- [`docs/planning`](docs/planning) — project plans, proposals, and roadmaps
- [`docs/tutorials`](docs/tutorials) — how-to guides and walkthroughs
- [`docs/analysis`](docs/analysis) — findings, write-ups, and analysis notes

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

## Contributing

<!-- TODO: how others can contribute, if applicable -->
