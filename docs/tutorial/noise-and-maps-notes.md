# Noise & Maps — Class Notes

## 1. What Is Procedural Noise?

Procedural noise is a **function that turns coordinates into a value**, deterministically:

```
noise(x, y) -> a number (usually in [-1, 1] or [0, 1])
```

Same input coordinates always give the same output — it isn't random in the sense of `Math.random()`, it's *pseudo-random and continuous*. That's what makes it useful for world building: you can sample the same field at any resolution, from any angle, at any time, and always get a consistent result. This is what lets a terrain, a cloud layer, or a texture look "natural" without an artist placing every detail by hand.

**Key idea:** noise by itself is just a field of numbers. A "map" (terrain, texture, cloud density, etc.) is what you get when you **sample that field over a grid and interpret the numbers** — as height, as color, as density, as a threshold.

## 2. Core Noise Types

| Type | How it works | Looks like | Typical use |
|---|---|---|---|
| **White Noise** | One independent random value per grid cell, no smoothing | Static / TV noise, blocky | Grain, dithering, rarely used alone for terrain |
| **Value Noise** | Random value per lattice point, then interpolated between points | Blobby, slightly grid-aligned | Cheap smooth noise |
| **Perlin Noise** | Random *gradient vectors* at lattice points, interpolated with a smooth fade curve | Smooth, organic, faint square-grid artifacts at low frequency | Classic terrain/texture noise (Ken Perlin, 1983) |
| **Simplex Noise** | Same idea as Perlin but on a simplex (triangular) grid instead of a square grid | Smooth, no axis-aligned artifacts, cheaper in higher dimensions | Modern default choice over Perlin |
| **Cellular / Worley Noise** | Distance from each point to the nearest of many scattered random "feature points" | Cracked-earth, cells, mosaic, Voronoi cells | Rocky/organic textures, cracks, biome cells |

**Why smoothing matters:** White noise has zero correlation between neighboring points — every cell is independent. Perlin/Simplex noise interpolates *between* lattice points, so nearby coordinates give similar values. That correlation is what makes it look like a natural landscape instead of static.

## 3. From Noise to a Map

A heightmap (or any noise-driven map) is built in three steps:

1. **Sample** — for every point on a grid (every pixel, every mesh vertex), call `noise(x, y)`.
2. **Normalize** — noise typically outputs roughly `[-1, 1]`; remap to `[0, 1]` (or whatever range the next step needs): `normalized = (raw + 1) / 2`.
3. **Interpret** — use that number as a height, a color, a density, or a yes/no threshold.

```
for each vertex (x, y) on the grid:
    raw    = noise(x, y)
    height = (raw + 1) / 2      # 0..1
    vertex.y = height * heightScale
```

### Frequency and resolution have to match

**Frequency** controls how "zoomed in" the noise pattern is — how many bumps fit per unit of space. **Resolution** controls how many grid vertices you have to represent that pattern. If frequency is high but resolution is low, the grid can't capture the shape of the wave between vertices — you get jagged, aliased spikes instead of smooth hills. This is the same **Nyquist limit** idea from signal processing: you need at least ~2 samples per noise "wave" to represent it faithfully.

```
noise wavelength ≈ 1 / frequency
grid spacing     ≈ worldSize / resolution
```

If grid spacing is bigger than half the wavelength, expect aliasing.

## 4. Fractal Brownian Motion (fBm)

A single noise call gives you one smooth bump pattern. Real terrain has detail at multiple scales — big mountains *and* small rocks. **fBm** builds that by stacking several "octaves" of the same noise function at increasing frequency and decreasing amplitude, then summing them:

```
value = 0
amplitude = 1
frequency = 1
for octave in range(octaves):
    value += noise(x * frequency, y * frequency) * amplitude
    amplitude *= persistence
    frequency *= lacunarity
value /= totalAmplitude   # normalize back to ~[-1, 1]
```

| Parameter | What it controls | Typical range |
|---|---|---|
| **Octaves** | How many layers are stacked. More = more detail, more compute. | 1 – 8 |
| **Lacunarity** | How much frequency multiplies each octave. Higher = finer detail layers are packed tighter. | 1.5 – 3 (2 is the classic default) |
| **Persistence** | How much amplitude shrinks each octave. Higher = finer octaves matter more → rougher surface. | 0.3 – 0.6 (0.5 is the classic default) |

Low persistence → smooth rolling hills (fine detail barely visible). High persistence → jagged, rough terrain (fine detail dominates).

## 5. Shaping the Result

Once you have a normalized noise value, you can **reshape it** before using it as height — this is where a lot of the "art direction" of procedural terrain happens:

| Operation | Formula (roughly) | Effect |
|---|---|---|
| **Power curve** | `value ^ exponent` | Exponent > 1 sharpens peaks, flattens valleys. Exponent < 1 does the opposite. |
| **Threshold** | `value > cutoff ? 1 : 0` | Turns smooth noise into solid mesas / binary masks — good for islands, biome masks. |
| **Smoothstep band** | `smoothstep(edge0, edge1, value)` | Highlights a soft band of values, fading on both sides — coastlines, ridgelines. |
| **Terracing** | `round(value * steps) / steps` | Quantizes into flat stair-step levels instead of a smooth gradient. |

## 6. Further Modifiers (beyond basic fBm)

These change *how the octaves combine*, not just how the final value is reshaped — worth knowing even before implementing them:

- **Ridged noise** — take `1 - abs(noise)` per octave. Flips valleys into sharp ridges; classic for mountain ranges.
- **Billow noise** — take `abs(noise)` per octave. Produces rounded, puffy shapes (clouds, rolling hills without sharp valleys).
- **Turbulence** — sum `abs(noise) * amplitude` across octaves (similar family to billow, different accumulation). Produces a churned, roiling look — good for fire, smoke, marble.
- **Domain warping** — before sampling `noise(x, y)`, distort the input coordinates using *another* noise field: `noise(x + warp(x,y), y + warp(x,y))`. Breaks up the regularity of the base pattern — turns straight ridgelines into flowing, organic curves. This is one of the most powerful and most underused techniques in procedural generation.

| Standard fBm | Ridged | Billow |
|---|---|---|
| Rolling hills, valleys and peaks both soft | Sharp mountain ridgelines, valleys still soft | Rounded, puffy — no sharp valleys or peaks |

## 7. Glossary

- **Lattice / grid point** — the fixed integer coordinates a noise algorithm anchors its randomness to (e.g. gradient vectors in Perlin noise).
- **Octave** — one layer of noise at a given frequency/amplitude in an fBm stack.
- **Amplitude** — how much a given octave contributes to the final value (its "volume").
- **Aliasing** — visual artifacts from sampling a signal at too low a resolution for its frequency.
- **Seed** — the initial value that determines a noise field's random pattern; same seed + same parameters = same result every time.
- **Heightmap** — a 2D grid of values interpreted as elevation, used to displace a mesh or grayscale image.
- **Domain warping** — distorting the *input coordinates* of a noise function using another noise function, rather than reshaping its output.

## 8. Quick Mental Model

```
noise type  →  raw pattern (smooth / blocky / cellular)
   + fBm    →  multi-scale detail (octaves, lacunarity, persistence)
   + shaping →  art-directed final look (power/threshold/terrace)
   + warping →  organic irregularity (optional, advanced)
   ↓
normalized value [0, 1]
   ↓
interpreted as height / color / density → the "map"
```
