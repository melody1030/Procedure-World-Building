# Plan: a debug view (lenses)

**Drafted 2026-11-20. D1 built 2026-11-20; D2–D4 to come.** Week 9's feedback asked to move the layers into a debug
view where hovering a place shows its details, and to show the process, "the state machine, the
debug layer". Today the Layers tab only recolors the ground; you can't ask the city *why* a place
is what it is.

## Context

- **Layers** (`ui/TerrainPanel.tsx`, `LayersTab`) has one ground tint at a time (districts,
  frontage, heights, claims, suitability, waste) and switches for the network, lots, parks,
  buildings and life. Legends sit inside the panel.
- **The tints are drawn by the shader** from data textures, one texel per column
  (`render/print.ts`), so the data a hover needs is already there, per column, in the `Terrain`.
- **Clicking an agent** already opens the Inspector with its state and why (`ui/Inspector.tsx`,
  `render/select.ts`). Hovering gives nothing.
- A classmate's project reads like this: pick one property (a lens), hover to read a place, click
  to keep a detailed reading, and the legend sits on the stage, not in a panel.

**Decisions:**
- **One lens at a time**, as the ground tints already are. A lens is a property of the city, not
  a new layer of data: nothing is rebuilt when it changes.
- **Off until asked for.** The debug view opens with the **D** key or a button on the right-hand
  toolbar (a magnifier, above Shortcuts), so the city reads clean by default.
- **Opening it turns the world gray, spreading from the plaza.** Over about 0.6 seconds a wave
  runs out from the plaza across the screen (`render/gray.ts`): behind its front every lit material
  is gray and a little darker, the sky with it, and a faint cyan line rides the front. The camera
  does not move. Windows and signs keep their lights. With the Waste lens the buildings are the
  lens, so they keep their color.
- **It stays marked.** A cyan frame round the view and a badge at the top ("Debug view · press D to
  leave", with a pulsing dot) fade in as the sweep ends and stay until it is left.
- **The left panel swaps.** Normally it holds only **Build**. In the debug view it holds the
  layers (the ground color and what is drawn on top) instead, and the panel opens if it was shut.
- **Hover reads, click keeps.** Hovering shows a small card at the cursor; clicking pins it
  (agents keep using the Inspector).
- **The legend moves onto the stage**, bottom left, so it stays in view while the panel is closed.
- **No new generation.** Every reading comes from data the pipeline already makes.

## D1. Hover reading on the ground

Raycast the cursor to the terrain, take the column, and show a card at the cursor for the active
lens:

| Lens | The card reads |
|---|---|
| Claims | What owns the column (river, bank, road, verge, plaza, lot, park) |
| Districts | The district, its lot's id, frontage and area |
| Heights | The height limit (m), its tier, and what held a building below it |
| Suitability | The score for the center, 0 to 1, and whether it can be built on |
| Ground | Height in meters, and the slope |

Done when moving the cursor reads a different place every frame without a hitch, and the card
agrees with the tint under it.

**Built 2026-11-20.** `WorldView` finds the column under the mouse (at most once a frame, and not
when an agent, a building or the sky is under it, or a button is down) and tells `ui/Lens.tsx`,
whose card reads the stages' own data. Ground height and slope come from the graded ground, as
drawn, not the ground before the lots were dug. With no tint, or the Waste tint, the card reads the
ground itself. Checked on `blueprint` against the five tints.

## D2. The legend on the stage, and a Lenses panel

- Move each tint's legend out of the panel to a card at the bottom left, with the lens' name and
  a gradient bar that marks the value under the cursor, as in the reference.
- (The layers already moved from a Layers tab into the left panel's debug view; see above.)
- Group the lenses the way a person asks: **Land** (ground, claims, slope), **City** (districts,
  frontage, height limit, suitability), **Life** (waste, and D3's). One line of what each shows.
- The switches for the network, lots, parks, buildings and life stay as "Show on the island".

Done when the panel can be closed and the lens and its legend are still readable.

## D3. A lens for the agents

- **By state:** tint people, pigeons, cats and vehicles by what they are doing now (walking,
  using, waiting, riding, away; prowling, hunting; driving, standing), with a legend.
- **Hover an agent:** a one-line card with its state and the reason, the same text the Inspector
  shows; click still opens the Inspector.

Done when the whole city can be read at a glance by what everyone is up to, and a hover answers
"why is that person standing there".

## D4. Check and tell

- The tour gets a step for the lenses; Help lists the keys.
- The development log, `docs/techniques/data-and-layers.md` and the README table.
- Frame time with a lens on and the cursor moving (the picks must not cost a frame).

---

## Files

| File | Change |
|---|---|
| `ui/TerrainPanel.tsx` | `LayersTab` becomes the Lenses panel (D2) |
| `ui/Lens.tsx` (new) | The stage legend and the hover card (D1–D3) |
| `render/WorldView.ts` | The ground raycast on pointer move, a `hover` callback (D1); the agents' state tint (D3) |
| `state.ts` | A lens beside `groundTint` (D2–D3) |
| `render/print.ts` | The agent-state tint, if it is done in the shader (D3) |

## Open

- Whether D3's tint is worth it, or the hover card alone is enough.
- Whether the lenses belong in the right panel or in a bar at the bottom, as the feedback's "all
  the panels at the bottom" suggests; that is a layout change for the whole interface, so it
  waits until the lenses work.
