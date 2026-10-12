# Distributions, Paths & Vector Fields — Class Notes

[← Back to the main README](../../README.md)

> Week 5 (Class 06) — PCG 04. Three topics: **scattering assets** over a terrain, **splines** as paths laid on top of it, and **vector fields + particles** for things that have no fixed geometry.

## 1. Scattering / Populating

**Scattering** (or *populating*) = automatically placing many copies of assets over a surface. Instead of hand-placing every tree, rock or lamp post, you define *rules* for where things may go and let the system generate the points.

Every scatter system answers the same three questions for each candidate point:

1. **Where?** — the position on the surface.
2. **Whether?** — does this point pass the rules (density, slope, height, mask)?
3. **What & how?** — which asset, and with what rotation / scale / color variation.

```
for each candidate point p on the surface:
    if not passesRules(p):  continue
    asset = chooseAsset(p)
    place(asset, position = p, rotation = orient(p), scale = vary(p))
```

## 2. Scattering Techniques

### 2.1 Random

Pick points with uniform random coordinates across the surface.

- Simplest possible approach — just `random(x), random(y)` and look up the height.
- Looks **unnatural at scale**: pure randomness produces clumps and empty gaps, and objects can overlap.
- Use a **seeded** random generator so the same seed always gives the same layout.

> Common fix (not on the slides, but the standard next step): **Poisson-disk sampling** — reject any new point closer than a minimum distance `r` to an existing one. Gives an even-but-organic "blue noise" spread with no overlaps.

### 2.2 Noise Distribution

Use a noise field (from the Noise & Maps week) as a **density map**: sample `noise(x, y)` at each candidate point and keep it only if the value passes a threshold, or use the value as a probability.

```
density = fbm(p.x * freq, p.y * freq)      # 0..1
if random(p) < density:  keep p
```

- Produces natural **clusters and clearings** — forests with gaps, patches of grass, rock fields.
- Frequency controls patch size; threshold/contrast controls how sharp the patch edges are.

### 2.3 Asset Differentiation — Following Maps

Scatter **different assets following the internal data of the terrain**. The terrain generator already produces lots of per-point data you can reuse as masks:

| Terrain data                     | Example rule                                                        |
| -------------------------------- | ------------------------------------------------------------------- |
| **Height**                       | Pine trees only above a certain altitude; reeds only near sea level |
| **Slope**                        | Rocks / scree on steep areas; grass only on flat ground             |
| **Moisture / distance to water** | Dense vegetation near rivers; bare ground far away                  |
| **Erosion / flow maps**          | Debris and pebbles where water accumulates                          |
| **Biome / noise masks**          | Region A = forest, region B = meadow                                |

Each asset type gets its own **layer** with its own mask and density, so you can tune them independently.

### 2.4 Oriented to Surface

Align each instance to the **surface normal** at its point, instead of always pointing straight up.

- Rocks, grass and debris look embedded in the ground when they follow the normal.
- Trees usually should **not** fully follow the normal — they grow toward the light (world up). A common compromise is blending: `up = lerp(worldUp, normal, t)`.
- Add a random rotation around the up axis so copies don't look identical.

### 2.5 Consider Slope Angle

Reject points where the terrain is too steep. Example from the slides: **max slope allowed = 33°**.

```
slope = degrees(acos(dot(normal, worldUp)))   # 0° = flat, 90° = vertical cliff
if slope > maxSlope:  reject
```

- Keeps trees and buildings off cliffs.
- Different assets get different limits: grass maybe ≤ 40°, buildings ≤ 10°, rocks *prefer* steep slopes.
- Slope can also be a smooth weight rather than a hard cut — fade density out as slope approaches the limit.

### Assignment 1 — Scattering System

- Develop a scattering system that populates the terrain with **different assets** (trees, rocks, bushes, windmills, etc.).
- Create **layers to control each asset type**. Define the protocol for each asset to appear: Do assets avoid cliffs? Do they show up close to the water?
- Add **variation per asset based on terrain data** — leaf coloration, size, density, etc.

## 3. Paths — Spline Overlays

**Splines** can add an extra layer of detail on top of a terrain — the classic cases are **roads** and **rivers**. A spline is a smooth curve defined by a few control points; the curve in between is interpolated (Catmull-Rom, Bézier, B-spline…).

Why a spline instead of just painting it into the heightmap:

- It's **editable** — move a control point and the whole road updates.
- It carries **direction and length**, so you can sample along it (`t = 0..1`), get tangents, and place things at regular intervals.
- It can be **resolution independent** — the same curve works at any terrain resolution.

### 3.1 How a spline interacts with the terrain

Influence goes **both ways**:

| Direction | What happens | Example |
|---|---|---|
| **Mesh → spline** | Project the 2D curve onto the terrain: for each sample point, look up the terrain height and set `y` | A path that follows the hills |
| **Spline → mesh** | The curve modifies the terrain near it — flatten, carve, raise | A road cut into a hillside; a riverbed carved into a valley |
| **Spline → scatter** | The curve acts as a mask for the scatter layers | No trees on the road; reeds along the riverbank; lamp posts every 10 m |

Typical "spline → mesh" deformation, using distance from each vertex to the curve:

```
d = distanceToSpline(vertex.xz)
w = 1 - smoothstep(roadHalfWidth, roadHalfWidth + falloff, d)
vertex.y = lerp(vertex.y, splineHeightAt(closestPoint), w)
```

- Inside the road width → fully flattened to the road height.
- In the falloff band → smooth blend back to the original terrain (embankments).
- For rivers, push `y` *below* the original height instead to carve a channel.

### 3.2 What can be represented as lines?

Roads, rivers, streams, footpaths, rail tracks, power lines and cables, walls and fences, coastlines, ridgelines, borders between biomes or districts.

### Assignment 2 — Spline Layer

- What could a spline layer be used for in your world?
- What can be represented as lines?
- How can 2D lines be **projected onto a 3D surface** / terrain mesh?
- What is the **influence a spline has over the mesh**, or vice versa?

## 4. Vector Fields & Particles

### 4.1 Particle systems

A **particle system** is **point data over space** — many small points, each with its own state (position, velocity, age, lifetime, color, size), updated every frame.

```
each frame, for each particle:
    velocity += forces(position) * dt
    position += velocity * dt
    age      += dt
    if age > lifetime:  respawn at emitter
```

Ways to render and control them, in increasing complexity:

| Stage | Idea |
|---|---|
| **Point data** | Particles are just points in space — the raw data |
| **Sprites** | Each particle is drawn as a textured quad (billboard) facing the camera — smoke puffs, raindrops, sparks |
| **Forces** | Global forces push particles around: gravity, wind, vortex, turbulence, drag |
| **Vector fields** | A field stores a direction (and strength) **at every point in space**; particles sample it at their position and follow it |
| **Complex 3D vector fields** | Full volumetric fields — swirling, layered motion through 3D space |

### 4.2 Vector fields

A vector field is like a noise map, but instead of one number per point it stores a **vector** (a direction + magnitude):

```
field(x, y, z) -> (vx, vy, vz)
```

Ways to build one procedurally:

- **From noise** — use 2–3 noise samples as the x/y/z components. Simple but tends to create sinks where particles bunch up.
- **Curl noise** — take the curl of a noise field. The result is *divergence-free*, so particles swirl and flow without clumping — the standard trick for smoke and wind.
- **From terrain** — the downhill gradient of the heightmap is a natural vector field for water flow (ties back to erosion).
- **From splines** — the tangent of a nearby spline, e.g. a river current or traffic flow.

Particles following a field and **drawing trails** (keeping their last N positions as a line) is a great way to *visualize* the field itself — flow lines, wind maps.

### 4.3 Fluid dynamics

A **fluid solver** computes the vector field itself by simulating fluid behavior (pressure, advection, viscosity) instead of authoring it. Particles are then carried by the simulated velocity field. Results are much more physical — smoke rising and curling, water splashing — at the cost of a lot more computation. In real time, approximations (grid-based stable fluids on the GPU, or curl noise as a fake) are common.

### Assignment 3 — Particle System

- Implement a particle system in your simulation.
- Calibrate it for **weather patterns or phenomena without fixed geometry** — atmosphere, water, clouds.
- Explore particle systems that **exist within vector fields**.
- Explore how particle systems can **draw trails**.
- Explore creatively **how to represent** particle systems.

## 5. Glossary

- **Scattering / populating** — automatically placing many copies of assets over a surface.
- **Density map / mask** — a 0..1 field that controls how likely an asset is to appear at each point.
- **Surface normal** — the vector perpendicular to the surface at a point; used for orientation and slope.
- **Slope angle** — angle between the surface normal and world up (0° flat, 90° vertical).
- **Poisson-disk sampling** — random points with a guaranteed minimum spacing.
- **Spline** — a smooth curve defined by control points.
- **Projection** — dropping a 2D curve onto a 3D surface by sampling the surface height.
- **Particle** — a point with state (position, velocity, age…) updated each frame.
- **Sprite / billboard** — a textured quad that always faces the camera.
- **Vector field** — a function that returns a direction vector for every point in space.
- **Curl noise** — a divergence-free vector field derived from noise; produces swirling flow without clumping.
- **Fluid solver** — a simulation that computes a physically plausible velocity field.

## 6. Quick Mental Model

```
terrain (height, slope, normals, moisture…)
   │
   ├── scatter layers ── masks + rules ──→ trees, rocks, buildings
   │        (random / noise / map-driven, oriented, slope-limited)
   │
   ├── splines ── projected onto terrain ──→ roads, rivers
   │        └── deform mesh + mask scatter layers
   │
   └── vector fields ── forces / noise / fluid ──→ particles
            └── sprites, trails → rain, fog, clouds, wind
```
