# Plan: a debug view (lenses)

**Drafted 2026-11-20. D1–D3 built 2026-11-20.** Week 9's feedback asked to move the layers into a
debug view where hovering a place shows its details, and to show the process, "the state machine,
the debug layer". Before this the Layers tab only recolored the ground; you couldn't ask the city
*why* a place is what it is.

## Context

- **The ground tints are drawn by the shader** from data textures, one texel per column
  (`render/print.ts`), so the data a hover needs is already there, per column, in the `Terrain`.
- **Clicking an agent** opens the Inspector with its state and why (`ui/Inspector.tsx`,
  `render/select.ts`).
- A classmate's project reads like this: pick one property (a lens), hover to read a place.

**Decisions:**
- **One lens at a time**, as the ground tints already are. A lens is a property of the city, not
  a new layer of data: nothing is rebuilt when it changes.
- **Off until asked for.** The debug view opens with the **D** key or a button on the right-hand
  toolbar (a magnifier, above Shortcuts), so the city reads clean by default.
- **Opening it turns the world gray, spreading from the plaza.** Over about 0.6 seconds a wave
  runs out from the plaza across the screen (`render/gray.ts`): behind its front every lit material
  is gray and a little darker, the sky with it, and a faint cyan line rides the front. The camera
  does not move. Windows and signs keep their lights. With the Waste lens the walls take the bin
  colors over the gray; with the Agents lens the people, animals and vehicles keep theirs.
- **It stays marked.** A cyan frame round the view and a badge at the top ("Debug view · press D to
  leave", with a pulsing dot) fade in as the sweep ends and stay until it is left.
- **The left panel swaps.** Normally it holds only **Build**. In the debug view it holds the
  layers (the ground color, its legend, and what is drawn on top) instead, and the panel opens if
  it was shut. The ground colors apply only in the debug view.
- **Hover reads.** Hovering shows a small card at the cursor; clicking an agent still opens the
  Inspector.
- **No new generation.** Every reading comes from data the pipeline already makes.

## D1. Hover reading on the ground

Raycast the cursor to the terrain, take the column, and show a card at the cursor. Its title says
what the column is, with a dot of that kind's color, and its rows say what matters for it:

| Pointed at | The card reads |
|---|---|
| Lot | District, area, height limit, built height |
| Main or side street | Width, height |
| Verge, river bank, open ground | Height (a verge also its street, open ground its district) |
| River | Water level, depth |
| Plaza | Size, height |
| Park | Kind, size, benches, vending machines, trees or flower beds |

| Building | District, use, storeys, height, limit, homes or jobs, who is inside, how full its bin is |

Every card ends with a sentence on **why** the place is as it is, from what the stages decided (a
building's cap, whether ground can be built on, how its street was made). What the card is about
lights up in the city (`WorldView.setHighlight`): a lot's outline, a street's or the river's
line, the plaza's or a park's rectangle, a building's box.

A ground color with something of its own to say replaces the rows:

| Lens | The card reads |
|---|---|
| Districts | The district, a lot's area |
| Height | The height limit (m), its tier, and the built height |
| Suitability | The score for the center, 0 to 1, and whether it can be built on |

Done when moving the cursor reads a different place every frame without a hitch, and the card
agrees with the tint under it.

**Built 2026-11-20.** `WorldView` finds the column under the mouse (at most once a frame, and not
when the sky is under it, or a button is down) and tells `ui/Lens.tsx`, whose card
reads the stages' own data. Heights come from the graded ground, as drawn, not the ground
before the lots were dug. With the Waste tint there is no ground card (the buildings are the lens). Checked on `blueprint` against the five tints.

## D2. A lens for the agents

- **By state:** tint people, pigeons, cats and vehicles by what they are doing now, with a legend.
  Five broad states (`life/states.ts`), so the legend reads at a glance: Moving, Using or resting,
  Waiting, On a task, Alarmed. The detailed states (`docs/techniques/agents.md`) fold into these.
- **Hover an agent:** a card with its name, its state and the reason, the same text the Inspector
  shows; click still opens the Inspector.

Done when the whole city can be read at a glance by what everyone is up to, and a hover answers
"why is that person standing there".

**Built 2026-11-20.** *Agents* is a ground color of its own (`GROUND_TINTS`). `render/life.ts`
colors each instance by its state while it is on (the people's body parts all take the one color),
and `GRAY.uKeepAgents` keeps them out of the gray so they are the only color left in the city. The
hover card reuses the Inspector's `describe`, refreshed four times a second while the mouse rests
on someone.

## D3. Check and tell

- The tour gets a step for the debug view; Help lists the key.
- The development log, `docs/techniques/data-and-layers.md` and the README table.
- Frame time with a lens on and the cursor moving (the picks must not cost a frame).

**Built 2026-11-20.** On `blueprint` at Street view, 3 s each: debug off, median 16.7 ms and p95
24.9 ms; debug on with the Agents lens and the cursor moving the whole time, median 16.7 ms and p95
25 ms (the display's rate either way). A card at the screen's bottom-right corner stays inside the
view.

---

## Files

| File | Change |
|---|---|
| `ui/Lens.tsx` | The hover card (ground and agents), the debug frame and badge |
| `ui/TerrainPanel.tsx` | `LayersTab` and its legends, shown in the left panel in the debug view |
| `render/WorldView.ts` | The ground raycast on pointer move, the gray wave, the agents' lens |
| `render/gray.ts` | The gray wave and what keeps its color |
| `render/life.ts`, `life/states.ts` | The agents colored by state |
| `state.ts` | The Agents ground color |

## Open

- Whether the layers belong in the left panel or in a bar at the bottom, as the feedback's "all
  the panels at the bottom" suggests; that is a layout change for the whole interface.
