# Project Concept: Blueprint City

[← Back to the main README](../README.md)

> *Working title.*

**A procedural voxel diorama where a small cliffside settlement grows into a neon cyberpunk megacity by rules, not by hand.**

---

## 1. The Idea in One Paragraph

Blueprint City borrows the miniature voxel-diorama style of the game *Town to City*, but turns its tone from a cozy Mediterranean village towards a cyberpunk future. The terrain is still natural: cliffs, a coastline and a river valley, shaped by noise and erosion. What grows on it is not a village but a city that keeps climbing. Rules place the first settlement on flat ground near the water, run roads along the slopes, and then, as space runs out, push the city *upward*: towers, stacked housing, bridges and elevated walkways spanning the cliffs. The result is a night-time voxel diorama lit by neon signs, glowing windows and wet reflections. Every seed grows a different megacity that still feels hand-built.

## 2. Inspiration

The visual starting point is *Town to City*: a cozy city builder with a voxel look, where a small village gradually grows into a lively city. What I take from it:

- **The diorama feel:** the world reads as a tabletop model, seen from above with tilt-shift framing, ending in cliff edges.
- **Terraced cliffs above water:** settlements sit on stepped, whitewashed plateaus beside a lake or the sea.
- **Organic growth:** streets wind with the terrain; plazas form where streets meet; the place feels like it grew rather than was planned.
- **Readable voxels:** buildings are clearly made of blocks, detailed but never realistic.

What I change is the **tone** and **who does the building**. In *Town to City* a player places every building in a warm, sunlit world. In Blueprint City, **rules grow the city** by themselves, and the world is a dark, neon-lit future.

## 3. From the References to My Version

| *Town to City* | Blueprint City |
|---|---|
| Golden-hour, warm sunlight | Permanent night or dusk; the city is its own light source |
| Terracotta roofs, pastel façades | Dark concrete, steel and glass, lit by neon signs and windows |
| Plazas with fountains | Holographic plazas, transit hubs, glowing night markets |
| Winding cobbled streets | Layered streets: ground level, elevated walkways, sky bridges |
| Street lamps | Neon strips, billboards, flickering signs |
| Calm lake | Dark, reflective water mirroring the city lights |
| A village grows outward | The city grows **outward first, then upward** |
| A player builds | Rules build |
| Cozy | Dense and atmospheric, a little lonely, but still beautiful |

## 4. How the City Grows

Growth is the heart of the project: watching one seed go from a few lights to a megacity.

1. **Outpost.** A few lit shelters appear on the flattest ground closest to the water.
2. **District.** A road network follows the slopes. Plazas form where roads meet, and buildings line the roads.
3. **Sprawl.** Density rises until almost every buildable voxel on the terraces is used.
4. **Megacity.** With no flat land left, the city goes vertical: towers rise, housing stacks on housing, and bridges and walkways cross the valley to reach new ground.

The key rule is **land scarcity drives vertical growth**. That single rule is what turns an ordinary town at night into a cyberpunk city, and it is simple to implement and to show.

The rules behind the stages:

- **Suitability:** each voxel column gets a score from slope, distance to water, distance to roads and elevation. Buildings go where the score is highest.
- **Roads:** paths between settlement points prefer gentle slopes, so streets follow the terrain the way they do in real hillside towns.
- **Density and height:** as the land fills, allowed building height increases with land value (near plazas, transit and the waterfront).
- **Bridges:** once a terrace is full, the city connects to the nearest unused terrace across the gap.

## 5. Visual Language

- **Palette:** a base of near-black navy and slate (the same colours as this project's website), cyan as the main neon (the site's accent colour), plus one or two secondary neons such as magenta or amber. The natural terrain stays cold and muted, so that the city is what glows.
- **Light:** emissive windows and signs, glow and bloom, haze between the towers, rain and reflections on wet streets and water.
- **Form:** blocks stay visible at every scale. A tower is still a stack of voxels, so the city reads as a model rather than a realistic render.
- **Framing:** looking down at the whole city as a tabletop object, with the cliff edges as the border of the diorama.

## 6. What Makes It Mine

- **Blueprint → city.** Every world starts as a glowing cyan wireframe of rules, like the terrain on this site's homepage, and then "prints" block by block into concrete, glass and neon. The project's two looks, the technical blueprint and the lit city, become one idea. This is where the working title comes from.
- **Nature versus city.** The terrain stays organic and quiet; the city grows over it in hard geometry and light. The contrast is the image.
- **Visible rules.** An optional overlay shows the suitability score as a glowing heatmap, like a city-planning scanner, so the viewer can see *why* a building appeared where it did. It explains the growth and fits the sci-fi tone.

## 7. Pillars

| Pillar | What it means |
|---|---|
| **Natural terrain** | Cliffs, coast and valley from noise and erosion, built from voxels |
| **Rule-driven growth** | Suitability decides *where* to build; density decides *how tall* |
| **Vertical city** | Once flat land runs out, the city grows upward and across |
| **Neon atmosphere** | Night lighting, emissive materials, fog and reflections on a voxel diorama |

## 8. How the Course Builds Towards It

Each week of the course is one layer of the final city:

| Course topic | Role in Blueprint City | Status |
|---|---|---|
| [Week 1: Three.js basics](../site/src/weeks/week01-threejs-basics/README.md) | Materials and lights, including emissive neon and night lighting | Done |
| [Week 2: Noise grid and hydraulic erosion](../site/src/weeks/week02-noise-grid/README.md) | The terrain: cliffs, coast and river valley | Done |
| [Week 3: Voxels and volumes](../site/src/weeks/week03-voxels-volumes/README.md) | The voxel world, shape combination (CSG) for buildings, and meshing for performance | Done |
| Populations | Scattering trees, props and signs by slope and zone | Upcoming |
| Networks | Roads, bridges and the city's growth graph | Upcoming |
| Flows | Rain, haze and moving traffic | Upcoming |
| Performance | Level of detail and streaming for a city-sized voxel world | Upcoming |

## 9. Keywords

Voxel diorama, tilt-shift miniature, neon-lit, rain-soaked, vertical megacity, stacked housing, sky bridges, elevated walkways, emissive windows, holographic signage, haze, reflective water, night skyline, procedural growth, suitability, land scarcity, density, zoning, road network.
