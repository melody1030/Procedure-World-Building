# Week 3 — Voxels & Volumes: Process Log

Tab structure: **01 — Voxels (Resolution)**, **02 — Volumes (Implicit Surfaces)**, **03 — CSG (Boolean Ops)**.

---

## 01 — Voxels (Resolution)

Samples a chosen shape (e.g. "Creature on a Stand") into a regular 3D grid and renders each
filled cell as an instanced cube. A single **Resolution** slider (`n`) controls the grid
density, so the tab exists specifically to make the voxelization trade-off visible: low `n`
gives a blocky, legible silhouette; high `n` approaches the smooth original shape.

| n = 22 (chunky) | n = 100 (smooth) |
|---|---|
| ![low resolution](screenshots/view01-resolution.webp) | ![high resolution](screenshots/view01-resolution-detail.webp) |

Rendering technique (reused by every other view in Week 3): a unit `BoxGeometry(1,1,1)` +
`THREE.InstancedMesh`, one `dummy = new THREE.Object3D()` used to write each filled cell's
transform matrix, `mesh.count` trimmed down to only the occupied cells.

## 02 — Volumes (Implicit Surfaces)

Same instanced-voxel rendering, but the fill rule comes from a **procedural noise
function** instead of a fixed mesh: frequency / amplitude / octaves / Y-offset sliders drive a
layered noise field, and a **Shape** dropdown selects how that noise field is turned into a
solid/empty test (e.g. "Terraced," shown below, quantizes ground height into discrete steps
via `⌊h/k⌋·k − y`). The panel explains the formula in plain language under the controls —
this tab is about teaching implicit-surface thinking (an inequality defines a volume) rather
than importing a specific mesh.

![terraced implicit surface](screenshots/view02-density.webp)

## 03 — CSG (Boolean Ops) — the "Voxel Techniques Lab"

This tab went through the most iteration. It teaches **SDF boolean combination** —
`min(a,b)` (union), `max(a,-b)` (difference), `max(a,b)` (intersection) — applied to
voxelized primitives, rather than being a general polygon-modeling tool.

### Iteration 1 — real polygonal CSG (superseded)

The first working version used `three-bvh-csg` (pinned to `0.0.17` for compatibility with the
repo's `three@^0.169.0`) to perform exact polygon boolean operations: a primitive palette, a
tree of combined shapes, click-to-select-and-combine, and a formula/explanation panel. This
produced smooth, crisp CSG meshes — a genuine "mini CAD" feel.

### Iteration 2 — reframed as a voxel-only teaching tool

The scope was deliberately narrowed: **only voxels**, no polygon/surface/wireframe view mode,
no resolution control (that idea belongs to View 01), and no separate A/B formula-explanation
panel. Each primitive is now voxelized directly from a hand-written pseudo-signed-distance
function (`csg-lab/sdfPrimitives.ts`) — exact formulas for box/sphere/torus, simplified
capped-cylinder/cone formulas otherwise, since only the inside/outside sign matters, not true
distance magnitude. Boolean combination happens by combining two SDFs with `min`/`max` before
sampling into the voxel grid (`csg-lab/sdfEngine.ts`), so "Volume A", "Volume B", and "Result"
are all literally the same voxel-rendering pipeline as Views 01/02, just fed by a different
function.

The three-bvh-csg dependency was left installed but is no longer imported by this tab — it
was a deliberate choice not to touch `package.json` for a UI-scoped request.

### Iteration 3 — "Object Manipulation" replaces click-and-drag

Free click-and-drag placement was hard to control precisely, so it was replaced with a
dedicated **Object Manipulation** section: Move / Rotate / Scale buttons that attach a
`THREE.TransformControls` gizmo to the selected shape. This required:

- Switching primitive/operation transforms from ad-hoc position-only state to a full
  `position` + `rotation (quaternion)` + `scale` per node, so rotate/scale are meaningful and
  compose correctly (quaternions avoid gimbal lock).
- Reading the installed `TransformControls.js` source directly to confirm its API and to find
  an upstream bug: `.dispose()` calls `this.traverse(...)`, but `TransformControls` doesn't
  extend `Object3D` and has no `.traverse` — it throws on every unmount. Fixed by calling
  `.disconnect()` and manually disposing the helper's geometries/materials instead.

### Bug fix — "the cross should move with the object"

After adding the gizmo, combined shapes (e.g. Cube − Sphere) showed the gizmo sitting at the
world origin instead of on the shape. Root cause: a combined node's `position` defaulted to
`{0,0,0}` rather than the shape's actual centroid, so the Group the gizmo tracked never moved
even though the voxel data itself was baked at absolute world coordinates.

Fix: when two shapes combine (`csg-lab/treeLogic.ts`'s `combineRoots`), the new node's
`position` is now set to the true centroid of the combined bounds, and its children are
rebased by the inverse offset so the visible geometry doesn't jump. SDF and bounds evaluation
were split into "local" (excludes a node's own transform — used to voxelize the root, paired
with the viewport's Group carrying that transform directly) and "full" (absolute — used for
nested recursion and the live preview). This makes the gizmo track the shape's real pivot in
every mode:

| Move | Union preview | Difference result |
|---|---|---|
| ![move gizmo](screenshots/csg-object-manipulation-move.webp) | ![union preview](screenshots/csg-union-preview.webp) | ![difference result](screenshots/csg-difference-result.webp) |

### Current panel structure

1. **Voxel Volume Inputs** — add Cube / Sphere / Cylinder / Cone / Torus primitives.
2. **CSG Operations** — Union / Difference / Intersection; arms a live preview, then Apply
   commits it (or Cancel backs out); "Remove selected shape" when exactly one is selected.
3. **Object Manipulation** — Move / Rotate / Scale gizmo modes (only shown once a single
   shape is selected).
4. **CSG Tree / Operation History** — indented tree with per-node hide toggle, plus
   Undo / Redo (also bound to Ctrl/Cmd+Z) and Reset.

### Other features added along the way

- **Undo/redo**: a history-wrapping reducer (`past` / `present` / `future`, capped at 50
  steps) around the base state reducer — only structural edits (add, combine, remove,
  transform, hide, reset) push history; transient UI state (selection, panel open/closed)
  does not.

### Known dev-environment quirks encountered

- Vite's dev server occasionally served stale HMR output after heavy edits — resolved each
  time with `preview_stop` → delete `node_modules/.vite` → `preview_start`.
- The in-app browser pane intermittently failed to render screenshots ("pane minimized and
  not painting"); worked around with a fresh tab and text-based page reads when that happened.

### Verification

`npx tsc -b && npm run build` passes cleanly. Manually verified in-browser: adding/combining
primitives, all three boolean operations, Undo/Redo, and the Move/Rotate/Scale gizmo tracking
both a bare primitive and a combined shape correctly (including a live drag → commit → undo
round-trip). Views 01 and 02 re-checked for regressions after the final gizmo fix.
