# Week 4 — Shader Studio

[← Back to the main README](../../../../README.md)

A place to learn shader techniques one at a time. Pick a technique from the dropdown, tune it,
and read how it works.

The lecture notes behind this tab are in [Shaders — Class Notes](../../../../docs/notes/shaders-notes.md).

![Shader Studio](<screenshots/截圖 2026-09-30 08.35.24.png>)


## Why a studio instead of a city

The first version of this week was a rainy voxel cyberpunk city with eight swappable strategies.
It looked good but taught little: grime, lit windows, neon and wet streets were added on top of
every strategy, so moving a slider barely changed the picture. And a voxel face only points in
six directions, so cel bands, fresnel falloff and matcaps (which all depend on smooth normals)
hardly showed. It was removed and replaced by this studio: one calm scene, one material, and
nothing on screen that is not a technique you chose.

![The earlier voxel city version](<screenshots/截圖 2026-09-29 22.56.25.png>)

## One technique at a time

The dropdown picks a single technique, grouped by the stage of the shader it runs in: Shape
(vertex shader), Base color, Lighting, Surface and Atmosphere. Each technique keeps its own
settings while you switch, and **Reset to defaults** restores the one on show.

A technique on its own sometimes has nothing to show on, so the shader adds the least it needs:

- **Flat, Matcap:** shown unlit, exactly as they are (Matcap has its light painted in).
- **Lambert, Cel / toon:** they are the light, on a neutral grey surface.
- **Position gradient, Slope:** plain Lambert light is added so the shapes read.
- **Ripple:** water covers the floor; the objects are grey with plain Lambert light.
- **Fake AO, Fresnel rim, Distance fog:** neutral grey with plain Lambert light.

## Techniques

| Technique | Stage | Controls | Core formula |
|---|---|---|---|
| Ripple | shape | Amplitude, Frequency, Speed, Water level, Foam | `world.y += amp * sin(x * f + t) * cos(z * f + t)` on the water only; contact foam where `sceneDepth - waterDepth` is small |
| Flat | base | Color | `albedo = uColor` |
| Position gradient | base | Space (world / local), Curve (with a plot), Range, Color A, Color B | `albedo = mix(a, b, curve(height / range))` |
| Slope | base | Show (Steepness / Aspect), Threshold, Softness, Flat color, Steep color | `steep = 1 - N.y; albedo = mix(flat, steep, smoothstep(t - s, t + s, steep))`; Aspect: hue from `atan(N.z, N.x)` |
| Matcap | base | Preset (clay, glossy plastic, toon, pearl) | `albedo = texture(matcap, viewNormal.xy * 0.5 + 0.5)` |
| Lambert | lighting | Ambient | `light = ambient + (1 - ambient) * dot(N, L)` |
| Cel / toon | lighting | Bands, Shadow floor, Outlines, Outline width | `band = floor(dot(N, L) * bands) / (bands - 1)` |
| Fake AO | surface | Strength, Height | `col *= mix(1 - s, 1, smoothstep(0, h, heightAboveBase))` |
| Fresnel rim | surface | Power, Strength, Color | `col += color * pow(1 - dot(N, V), power) * strength` |
| Distance fog | atmosphere | Density, Color | `col = mix(col, fog, 1 - exp(-distance * density))` |

The page opens on Position gradient.

### Viewport

Round buttons in the top right: **Frame** (reset the camera), **Light** (direction and height
sliders; Matcap ignores them, which is the matcap trade-off in action). Drag to orbit, scroll to
zoom, right-drag to pan, `E` hides the panel.

## The scene

A 10 x 10 plinth with a stepped tower, two plain towers, a low block, a staircase to a platform,
a sphere on a round base, a torus knot, a capsule, a column, a thin mast and a hill. Flat faces
show the gradient and AO clearly; the round forms show cel bands, fresnel and matcaps properly.
The hill (a gentle mound with a steep-sided mesa on top, and a lobed outline) is there for Slope:
boxes only have flat tops and straight walls, so the hill is where every steepness appears.

Every object's geometry has its origin at the centre of its base, and carries three attributes
the shaders read: `aHeight` (its height, for the local gradient), `aOcclude` (1 on objects, 0 on
the plinth, so fake AO leaves the ground alone) and `aWater` (1 on the water surface, 0
everywhere else, so only the water ripples).

### Ripple's water and contact foam

With Ripple selected, water (`aWater` = 1) covers the floor, so every object stands in it. The
water is a box 1 unit tall, finely divided on top. The vertex shader scales its top to the
**Water level** (0.05 to 1.50, default 0.25) plus the wave, while its bottom stays on the floor,
so the water always has sides.

The white foam is a **contact shader**, as in the lecture: foam appears where the water surface
is close to something solid behind it.

1. Each frame the scene is first drawn **without the water** into a render target with a depth
   texture (depth only, no color).
2. Then the scene is drawn normally. Each water pixel reads that depth at its own screen
   position, turns both depths back into distances from the camera, and takes the difference:
   `gap = sceneDepth - waterDepth`.
3. `gap * V.y` turns the gap along the view ray into a depth below the surface, so the foam line
   keeps its width however steeply the camera looks down.
4. Where that depth is under the foam width, the pixel is white. It is a hard `step`, not a
   blend, and noise moves the threshold in and out, so the line is jagged like cartoon foam.
5. The same depth colors the water: light where it is shallow, dark blue where it is deep.
6. Foam is only drawn on the top surface: the box's sides meet the floor too, but that is not a
   shoreline.

**Foam** (0 to 1) sets the width of the line.

## How it is implemented

- **Technique modules** (`shader/techniques/*.ts`). Each technique is one object: its panel
  copy, its parameters, its GLSL (uniforms, helper functions, body) and an `apply` function that copies panel values
  into uniforms.
- **One composed shader** (`shader/composeShader.ts`). The selected technique's GLSL, plus any
  helper lighting, is stitched into one vertex and one fragment shader, stage by stage.
- **Compile only when the GLSL changes.** The composer returns a `key`. The viewport builds a new
  `ShaderMaterial` only when that key changes, which means picking another technique. Moving a
  slider or picking a color only writes a uniform. The stage's `data-compiles` attribute counts
  compiles, which is how this was checked.
- **One uniforms object** (`shader/uniforms.ts`) holds every technique's uniforms, shared by all
  materials, so a new material starts with the current values.
- **Cel outlines** are an inverted hull: each object is drawn a second time with the same vertex
  shader, pushed outwards along `aSmoothNormal` (each corner's normals averaged, so box corners do
  not crack open) and with only back faces drawn.
- **Raw colors.** Colors go to the shader as raw sRGB values and come out with no color-space
  conversion, so a hex in the panel is the hex on screen.
- **State** is a `useReducer` (`state.ts`): the technique on show, every technique's settings,
  and the light. Saved configurations (signed in) store the technique, the settings
  and the light.

## Files

| File | Purpose |
|---|---|
| `index.tsx` | The page: state, saved configurations, stage, panel and viewport buttons |
| `state.ts` | The reducer: select, params, reset, light |
| `config.ts` | The technique registry, the stages and the defaults |
| `types.ts` | State types |
| `Viewport.tsx` | Renderer, camera, orbit controls, render loop; swaps materials on a new composition and writes uniforms otherwise |
| `scene.ts` | The study scene and its per-object attributes |
| `ShaderPanel.tsx` | The left panel: the technique dropdown, its controls, How it works |
| `TechniqueControls.tsx` | Controls for the selected technique, and the curve plot |
| `ShaderInfo.tsx` | The How it works card |
| `ViewportControls.tsx` | Frame and Light |
| `shader/composeShader.ts` | Stitches the technique (and its helper light) into GLSL |
| `shader/technique.ts` | The technique module type and color helpers |
| `shader/techniques/` | One file per technique |
| `shader/uniforms.ts` | The shared uniforms and `applyParams` |
| `shader/matcaps.ts` | Canvas-drawn matcaps |
| `icons.tsx` | Inline SVG icons |

Shared across weeks: `SidePanel`, and `Section`, `Field`, `FieldNote`, `RangeInput`, `Switch`,
`Select`, `ColorField`, `PanelButton` from [`site/src/components/`](../../components).
`ColorField` moved there from Week 1 so both weeks use one color control.

## Process

1. **Review of the voxel city.** Every strategy was buried under the city's own detail, and
   voxel normals hid the normal-based techniques. See "Why a studio" above.
2. **Plan** ([docs/plans/shader-studio-plan.md](../../../../docs/plans/shader-studio-plan.md)).
   A first draft was a free, reorderable technique stack. It became fixed stages, because free
   reordering often did nothing or gave misleading results. Show value, light direction, pause
   time and two vertex techniques were added, because they are what makes a technique readable.
3. **Build.** The city was removed; the studio reuses the shared side panel and controls.
   Pause buttons, were removed to keep the stage clear.
4. **One technique at a time.** The stack (add, remove, reorder, switch on and off, Isolate)
   became a single dropdown, so each technique is studied on its own. Combining techniques is no
   longer possible in the UI, but the composer still stitches GLSL by stage, so it could return.
5. **Water.** Ripple now moves only the floor and shades it as water, with a
   Foam control for white foam around the objects and on the crests. At first the crest foam
   covered every wave top in big white blobs; it now only shows on the very tops, in patches.
6. **A real contact shader.** The foam first came from a baked map of distances to each object's
   footprint. It became a depth-based contact shader, as in the lecture: a separate water
   surface, a depth pass of everything behind it, and a hard, jagged foam line, following a
   stylized water reference.
7. **Slope.**  a base color from the normal's steepness, with an
    Aspect view that colors slopes by compass direction. A hill joined the scene, since boxes
    only show two steepnesses.
