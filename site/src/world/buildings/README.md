# Building library

[← The city's log](../README.md)

Cyberpunk voxel buildings for Blueprint City to place on its lots. Preview: `/buildings` (pick one
building or all eleven; "Seed → next" shows the seeded variation; `/buildings?b=<id>&seed=<n>`
opens one directly).

Plain three.js, like the rest of `/world`. Generation is pure (no three.js): a building is two
geometries, its lit body and its glowing parts (windows, neon, signs), so each building is two draw
calls with two shared materials.

## Files

| File | What it holds |
|---|---|
| `kit.ts` | Units (0.25 m voxels, 3 m floors), the palette, the two-bucket box builder, and `Side`, which writes a facade part once for all four sides |
| `parts.ts` | Reusable parts: facades with recessed windows, mullions, sills, balconies, AC units and fins; rooftop gear (HVAC, tanks, masts, dishes, solar, gardens, helipads); signs (billboards, blade signs, shop signs, neon lines); ground level (shop rows of mixed units or a glazed office front, plain service walls, entrances, vending machines, lamps, trees, planters, stairs); skybridges, pipes, platforms; a diorama base |
| `skyscrapers.ts` | Corporate Megatower, Neon Commercial Tower, Residential Skyscraper, Research Lab Tower, Landmark Tower (and their parts: louvered service floors, brick shafts, exhaust stacks, a greenhouse, a helix; round discs and hoops for the TV tower) |
| `residential.ts` | Modular Apartment Block, Twin-Tower Complex, Stacked Megablock, Vertical Neighborhood, Terraced Residential, Tower and Annex |
| `config.ts` | `BuildingConfig` (size, floor height, colors, window, balcony, neon and detail densities, rooftop style, seed, base) and its validation |
| `registry.ts` | The eleven archetypes with their defaults and the districts they suit; `buildBuilding(id, overrides)` |
| `render.ts` | `buildingObject(model)`: the two meshes, footprint centered on the origin |
| `overlaps.ts` | Development checks: `findOverlaps` (flicker: faces sharing a plane) and `findClashes` (parts running into each other) |
| `Preview.tsx` | The `/buildings` preview page (with a soft bloom on the lights) |

## How a facade gets its depth cheaply

A mass is a dark glass core set back by the window depth, with piers, floor bands and corner
columns on the wall line in front of it. So the window cavities are real geometry, but a whole
wall is a few dozen boxes, not one per window. Lit windows are thin light boxes just in front of
the glass, lit from sill to head; mullions and sills add the fine grain. Balconies have a
railing on three sides: a parapet, posts and a top rail along the front and both ends. AC units
(`acUnit`) are wall units on brackets with a fan grille and a vent strip, up to 1.2 m wide,
centered under their window; 70% of the bays a facade would give one actually get it. A facade
can mark bays as doors (`Facade.door`): a ground-floor door reaches the ground with a step, an upper one is a recessed steel door.
Blade signs (`pierSign`) hang centered on a pier or corner column, so they always meet solid wall.

## Keeping it free of flicker

Two faces in the same plane flicker against each other (z-fighting). The kit avoids that by
construction: parts that meet a wall stand `PROUD` (0.12 voxel) in front of it, bands stand in
front of the piers, corner columns twice as far and drawn once per corner, roof parapets sit on the
slab, and neighbors never share a wall plane. Boxes off the ground draw their undersides; masses
standing on something skip them. `findOverlaps(model)` reports what is left: under 0.5 m² on ten of the eleven, about 4 m² on the
Vertical Neighborhood (not yet tracked down).

## Keeping parts from running into each other

Every part records the space it takes (`Kit.occupy`): masses, AC units, balconies, billboards,
signs, rooftop gear, trees and shrubs, lamps and planters, skybridges, platforms, pipes and shop
rows. Optional details check that their space is clear first (`Kit.clear`) and retry a few spots
or are left out: balconies and AC units, signs, rooftop gear, garden and terrace plants,
platforms. Skybridges, walkways and laundry lines reserve their space before the towers are
dressed. `findClashes(model)` lists any two parts whose boxes intersect (skybridges plugging into
towers are meant to); all eleven archetypes report none on 8 seeds.

## Every building has a way in

Each building has at least one street entrance at ground level, recorded as an `entrance`
fixture: a lobby unit in the middle of its south shop row (`shopfronts(..., lobby)`, with
an `entrance` in one of five styles, plus a lit house number), facade doors that
reach the ground, or a stand-alone `entrance`. A check confirms every archetype has one on 8
seeds, and that a door-wide walkway from each south entrance to the lot edge is clear of parts.

Entrance styles (`EntranceStyle`): `glass` (glass doors under a slim canopy), `revolving` (a
glass drum with a steel cap and a side door in a tall portal), `portico` (three steps, tall dark
doors, two columns and a deep roof, wall lamps), `gate` (a tong lau stair-hall door behind a
folding steel gate, with a mailbox panel, name plaque and bulb) and `porte` (a porte-cochère:
a deep canopy on posts, lit from beneath).

## Using a building in the city

```ts
const model = buildBuilding("stacked-megablock", { width: 16, depth: 24, height: 40, seed: lot.id });
scene.add(buildingObject(model)); // then position it on the lot
```

Each archetype lists the districts it suits (`core`, `commercial`, `megablock`, `industrial`,
`wealthy`), so the city can pick one per lot by district and size it to the lot.
