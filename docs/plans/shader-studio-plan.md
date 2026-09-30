# Shader Studio: plan

Replaces the Week 4 voxel city with **Shader Studio**, a calm scene for learning what each
shader technique does. The city was too noisy (grime, windows, neon, rain) and its voxel faces
hid every technique that depends on smooth normals, so it is removed.

## Goal

Learn shader techniques by building a shader from small, understandable steps, and seeing:

- what each step does on its own (**Isolate**)
- the number each step computes (**Show value**)
- the GLSL the steps add up to (**Shader code**)

Every visible control must work. No static mock-ups.

## 1. Where it lives

- Replaces `site/src/weeks/week04-shaders/` in place. The route stays `/week04`, and the
  registry entry becomes `Week 4 — Shader Studio`.
- Plain Three.js mounted in a `useEffect`, as in every other week. **No React Three Fiber, no
  Zustand.**
- State: a `useReducer` hook, following `week03-voxels-volumes/csg-lab/state.ts`.
- Saved configurations: `useWeekConfig("week04", ...)` with `withDefaults`, as in the other weeks.

```text
site/src/weeks/week04-shaders/
  index.tsx               page: state, useWeekConfig, stage, panel, overlays
  state.ts                useReducer: stack, selection, isolate, view mode, viewport, time
  types.ts                TechniqueType, ShaderTechnique, StudioState
  config.ts               defaults, technique metadata (name, stage, copy, formula, params)
  Viewport.tsx            renderer, camera, OrbitControls, scene, animation loop
  scene.ts                the study scene geometry
  ShaderPanel.tsx         SidePanel (left): stack, add menu, controls, how it works
  TechniqueStack.tsx      the ordered rows
  AddTechniqueMenu.tsx    the popover
  TechniqueControls.tsx   controls for the selected technique only
  ViewportControls.tsx    round icon buttons over the stage
  ShaderSummary.tsx       bottom bar: composition + "Shader code"
  ShaderCode.tsx          the generated GLSL, highlighted
  icons.tsx               inline SVG icons
  shader/
    composeShader.ts      stack -> { vertexShader, fragmentShader, uniforms, key }
    uniforms.ts           one shared uniforms object
    highlight.ts          tiny GLSL highlighter (keywords, numbers, comments)
    techniques/
      flat.ts  gradient.ts  matcap.ts  lambert.ts  toon.ts
      fakeAO.ts  fresnel.ts  fog.ts  ripple.ts  popIn.ts
  README.md               the week write-up (rewritten)
```

Shared code to reuse: `SidePanel`, and `Section`, `Field`, `FieldNote`, `RangeInput`,
`Switch`, `Select`, `PanelButton`, `headingClass`, `glassCardClass`, `valueClass` from
`components/controls.tsx`. **Move `week01-threejs-basics/ColorField.tsx` into
`components/controls.tsx`** so Week 1 and Week 4 share one colour control.

## 2. The shader pipeline

A free, reorderable stack gives misleading results: a second base colour just overwrites the
first, and fog only makes sense last. So the stack is ordered by **stages**, and each stage
has a clear rule:

| Stage | Techniques | Rule | Output |
|---|---|---|---|
| 1. Shape (vertex) | Ripple, Pop-in | any number, in stack order | moved `position` and `normal` |
| 2. Base colour | Flat, Position gradient, Matcap | exactly one | `albedo` |
| 3. Lighting | Lambert, Cel / toon | exactly one (Matcap bakes its own light, so lighting is skipped under it and the panel says why) | `col = albedo * light` |
| 4. Surface modifiers | Fake AO, Fresnel rim | any number, reorderable | `col` changed |
| 5. Atmosphere | Distance fog | zero or one, always last | `col` changed |

- Adding a second base colour or lighting technique **replaces** the current one, with a
  short note ("Replaced Flat. A shader has one base colour.").
- Reordering is allowed only inside stages 1 and 4, where order can change the result. The
  "How it works" text says why (for example: AO before Fresnel darkens the base only; after,
  it darkens the rim too).
- Rows show their stage as a small uppercase label in `text-slate-500`, not as colours.

### Types

```ts
type TechniqueType =
  | "ripple" | "popIn"
  | "flat" | "gradient" | "matcap"
  | "lambert" | "toon"
  | "fakeAO" | "fresnel"
  | "fog";

type Stage = "shape" | "base" | "lighting" | "surface" | "atmosphere";

interface ShaderTechnique {
  id: string;
  type: TechniqueType;
  enabled: boolean;
  params: Record<string, number | string | boolean>;
}
```

### One composed material

Each technique module exports:

```ts
interface TechniqueModule {
  type: TechniqueType;
  stage: Stage;
  uniforms: (id: string) => Record<string, THREE.IUniform>;  // namespaced: uFresnel_3_Power
  glsl: (id: string) => { functions?: string; body: string };  // body runs in main()
  value?: (id: string) => string;                              // GLSL for "Show value"
}
```

`composeShader(stack)` concatenates the functions and bodies in stage order and returns the two
shader strings plus a **composition key** (the enabled types and their order).

- **Recompile only when the key changes**: add, remove, reorder, enable or disable, isolate,
  view mode. Build a new `ShaderMaterial` and dispose of the old one.
- **Parameter changes only write uniforms.** The reducer holds the params for the UI; the
  viewport copies them into the uniforms object in an effect, without rebuilding anything.
- All scene meshes share the one material (and one outline material), so a change reaches
  everything at once.
- The generated code is formatted with a comment header per technique, because the user reads it.

## 3. Techniques

UI copy uses British spelling, sentence case, no em dashes. Numbers use fixed decimals.

| Technique | Controls (default) | GLSL core | "Show value" (grayscale) |
|---|---|---|---|
| **Ripple** | Amplitude (0.04), Frequency (3.00), Speed (1.00) | `pos.y += amp * sin(pos.x*f + t) * cos(pos.z*f + t)`, normal from the derivatives | the wave height, remapped |
| **Pop-in** | Duration (0.80), Stagger (0.30), Replay button | `easeOutBack` scale about each object's base | `t` of the animation |
| **Flat** | Colour (`#7fb5d6`) | `albedo = uColor` | none (uniform) |
| **Position gradient** | Space (Local / World), Curve (Linear, Smoothstep, Expo, Parabola, Cubic pulse), Range (1.00), Colour A (`#1d3a52`), Colour B (`#7fb5d6`) | `albedo = mix(a, b, curve(h / range))` | `curve(h / range)` |
| **Matcap** | Preset (Neon rim, Chrome, Holographic, Clay) | `texture2D(uMatcap, viewN.xy * 0.5 + 0.5)` | `viewN.xy` as red and green |
| **Lambert** | Ambient (0.30) | `light = amb + (1-amb) * max(dot(N, L), 0)` | `dot(N, L)` |
| **Cel / toon** | Bands (4), Shadow floor (0.35), Outlines (on), Outline width (0.02) | `floor(ndl * bands) / (bands - 1)` | the band |
| **Fake AO** | Strength (0.45), Height (0.60) | `col *= mix(1-s, 1, smoothstep(0, h, heightAboveBase))` | the AO factor |
| **Fresnel rim** | Power (3.20), Strength (0.65), Colour (`#22d3ee`) | `rim = pow(1 - dot(N, V), p); col += rimColor * rim * s` | `rim` |
| **Distance fog** | Density (0.06), Colour (`#0a0f17`) | `f = 1 - exp(-d * density); col = mix(col, fog, f)` | `f` |

Details:

- **Fake AO:** every mesh gets `aBaseY` and `aHeight` attributes from its bounding box when the
  scene is built, so "height above base" works per object.
- **Matcaps:** drawn on a canvas at runtime (no image assets), as before.
- **Cel outlines:** an inverted hull, a second mesh per object with the outline material,
  drawn back faces only and inflated along the normal. Only visible when Cel is enabled.
- **Fog:** the stage background follows the fog colour while fog is enabled.

## 4. The study scene

Built for reading shaders, not for mood. One material, no emissive detail, no particles.

- A low round **plinth** (the ground), so fog and AO have something to meet.
- **Smooth forms:** a sphere, a torus knot, a capsule. These show Cel bands, Fresnel falloff
  and matcap wrap properly.
- **Architectural forms:** three boxes of different heights, a stepped tower (setbacks), a
  staircase, a cylinder column, a thin mast. These show gradient, AO and slope-like reads on
  flat faces.
- A **water disc** at one side, finely subdivided, which is where Ripple is most visible. (All
  shape techniques apply to every mesh; the disc just shows them best.)
- Palette from the style guide: background and fog `#0a0f17`, surface `#7fb5d6`, light
  `#aac4dd`. Cyan only for effects such as the rim.

## 5. Layout and controls

Follow `site/STYLE_GUIDE.md` exactly. Only the points specific to this view are listed here.

**Stage.** `relative min-h-[480px] flex-1 overflow-hidden rounded-2xl`, scene in
`absolute inset-0 bg-stage`. No extra page header: the shared site header already shows the
week title.

**Left panel** (`SidePanel side="left"`, 16.2rem), three sections:

1. **Shader**
   - The stack. Each row (`rounded-lg`, slate, selected row in cyan) has: number, name, stage
     label, enable `Switch`, up and down buttons (stages 1 and 4 only), remove button. Icon
     buttons have `title` and `aria-label`; the selected row has `aria-current`.
   - `+ Add technique` (`PanelButton`) opens a compact popover grouped by stage.
   - Reset, which restores the initial stack and parameters.
2. **Selected technique** (heading is the technique name): only its controls, using
   `Field` + `RangeInput` / `Select` / `Switch` / the shared colour field.
3. **How it works:** the cyan info card with two or three plain sentences, a "Show formula"
   toggle for the core GLSL line, and two buttons:
   - **Isolate:** turns every other technique off in the shader (the stack keeps its switches,
     shown dimmed) so only the selected one shows. Base colour falls back to a neutral grey
     and lighting to plain Lambert, so the effect is visible on its own.
   - **Show value:** outputs the technique's 0 to 1 value in grayscale.

   Both use the cyan active treatment with `aria-pressed`.

**Viewport controls** (round 40px buttons, bottom-right, from the style guide):

| Button | Does |
|---|---|
| Frame | resets the camera to the default view |
| Light | shows two small sliders (azimuth, elevation) for `uLightDir` |
| Pause | pauses and resumes time; a time slider appears while paused |
| Wireframe | shows the triangles, useful for Ripple |
| Grid | shows a ground grid |

**Bottom summary** (centred glass bar): the enabled techniques in order, joined by `+`, in
slate text; the isolated technique in cyan. A `Shader code` button on the right opens the code
panel above it: a scrollable glass card with Vertex and Fragment tabs, highlighted GLSL, and a
Copy button. It updates when the composition changes.

**Responsive.** Below `md`, the panel starts closed and opens as an overlay. `E` works as in
every week (the shared `SidePanel` already handles it).

## 6. Initial state

```text
Shader
1. Position gradient   (base colour)
2. Lambert             (lighting)
3. Fake AO             (surface)
4. Fresnel rim         (surface)   <- selected
```

Ripple, Pop-in, Matcap, Cel and Fog are one click away in the add menu.

## 7. Build order

Each step ends with a check in the browser.

0. **Save the city first.** `site/src/weeks/week04-shaders/` has never been committed, so
   deleting it would lose it for good. Commit it (or copy it out) before removing it.
1. Remove the city files, the old screenshots and the city README. Update the registry title,
   the home page card and the main README entries.
2. Move `ColorField` into shared controls; point Week 1 at it.
3. Scene + viewport + one hard-coded Lambert material: stage, orbit, frame, resize.
4. `composeShader` with Flat + Lambert, then every technique module. Check each one alone.
5. Reducer + panel: stack, add, remove, reorder, enable, stage rules, selected controls.
6. Isolate and Show value.
7. Viewport controls, bottom summary, Shader code panel.
8. `useWeekConfig` save and load; responsive check; `E` key check.
9. New week README (what each technique does, what was learned, screenshots), and fix the notes
   (section numbering, Obsidian image embeds to standard Markdown).

## 8. Done when

- Every technique works alone (Isolate) and in combination, and the values it shows match the
  formula card.
- Parameter changes never rebuild the material (checked by logging compiles).
- Add, remove, reorder, enable and disable all recompile once, and the Shader code panel
  matches what is running.
- The page looks like the other weeks: same panel, controls, fonts, cyan as the only UI accent.
- No console errors; smooth frame rate at desktop size.
