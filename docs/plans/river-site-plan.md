# Plan: *What the River Remembers*, a standalone ancient-city simulation site

## Context

The midterm critique called Blueprint City "a game without intention." The new concept (Shuiyi's
idea, researched in `docs/analysis/ancient-city-simulation-research.md`): a visitor picks a real
historical river city, picks a founding rule, and watches centuries pass as the city grows, the
river floods, shifts course and lays down silt, and buildings decay, collapse and are buried, with
new cities founded on the ruins. The visitor's choices are the rules; the outcome follows from them.

It is a **new, separate website**, not a page of the current one. Decisions already made:
- **Location:** a new Vite project in this repo at `./river-site/`, with its own `package.json` and its own
  Firebase Hosting site. It **copies** the helpers it needs from `site/`, never imports them.
- **Look:** the voxel diorama language of Blueprint City, but in **warm daylight** with
  earth, brick and stone colors.
- **Sites:** four real cities: Kaifeng, Mohenjo-daro, Angkor, Rome. Atlantis is skipped for now.

---

## 1. The experience (three screens)

1. **Choose a site.** Four cards over a slowly turning diorama of each site. Each card shows:
   - name, river, and years;
   - a danger tag;
   - a one-line history.
2. **Found the city.** The chosen site fills the screen.
   - The ground where a city may be founded glows; the visitor taps a point there.
   - The visitor picks one of four founding rules. Each rule card shows a small plan diagram.
   - The **Found the city** button starts the run.
3. **Watch time pass.** The city grows and the river acts on it. When a city is abandoned and the
   land can host people again, the run pauses with **"Found a new city here?"**:
   - the visitor picks the rule again, or lets the land stay empty;
   - at most 3 cities per run.

   At the end of the timeline, the camera swings to a **cross-section** that shows every city as
   a layer of soil and ruins.

---

## 2. Sites

Each site is a hand-authored file: terrain shape, starting river course, a **flow history**
(the river's strength over time), sediment load, scripted anchor events, time span, palette, and
building set. Between the anchors, the history is procedural from the seed, so each run differs
but the big events are true to history.

| Site | Span | Terrain | River behavior | Anchors (real) | Danger |
|---|---|---|---|---|---|
| **Kaifeng**, Yellow River | 400 BCE – 1900 CE | Almost flat loess plain; the river runs *above* the city between dikes | Very high silt; the bed rises fast; frequent floods; avulsions | Recurrent floods (100+ since the 1100s, 4 catastrophic); **1642 flood buries the inner city under meters of silt** | Burial |
| **Mohenjo-daro**, Indus | 2600 – 1700 BCE | Wide floodplain, with an optional raised citadel mound | Annual floods; the monsoon weakens from ~1900 BCE; the river turns seasonal | Rebuilt on its own ruins many times; decline and a shift of settlement eastward after ~1900 BCE | Drying, and floods |
| **Angkor**, Siem Reap rivers to the Tonle Sap lake | 800 – 1450 CE | Gentle slope down to a lake | Monsoon rain; the city builds barays (reservoirs) and canals as it grows | 14th-century extreme floods and droughts; **channels erode in some places and silt up in others, and the failure cascades through the network** (Penny et al. 2018; Day et al. 2012) | Infrastructure collapse |
| **Rome**, Tiber | 753 BCE – 1900 CE | 3–4 hills beside a meandering river and its floodplain (the Campus Martius) | Frequent floods (in 189 BCE the river flooded the Campus Martius 12 times) | The floodplain rises through flood deposits and rebuilding, which buried the Ara Pacis | The city that survives: the hills persist |

Rome is the deliberate contrast: the same forces, but high ground means the city continues and
simply rises on its own ruins.

Atlantis is skipped. Herakleion/Canopus is a possible real "sunken city" fifth site later.

---

## 3. Founding rules (layout generators)

Each rule is a function `(site, foundingPoint, rng) → plan`. The plan holds streets, wall, gates,
ordered lots, and the center monument. **Growth fills the lots in the plan's order** as the
population rises, and then extends the plan beyond the wall.

| Rule | Layout (from the sources) | Orientation | Growth order | Persistence |
|---|---|---|---|---|
| **Roman grid** (*castrum*) | Rectangular wall with 4 gates. The cardo (N–S) and decumanus (E–W) cross at the forum. Square blocks (*insulae*) of about 35 m. | Cardinal | Forum outward, block by block; later the grid extends past the walls | 0.8 |
| **Chinese axial square** (*Kaogong ji*) | Square wall, 3 gates per side, a 3 × 3 grid of main streets, palace at the center on the N–S axis. Ancestral temple on the left (east), altar on the right (west), court in front, market behind. | Cardinal (N–S axis) | Palace, then the walled wards, ring by ring | 0.9 (walls and axis) |
| **Organic** (medieval) | Streets grow from a market at the best dry spot (Parish & Müller-style growth). Each new street segment prefers to run along the contour lines (CityEngine's "slope 0" rule), with a randomized bend limit. Houses line the streets. | Follows the land | Along the streets, outward from the market | 0.2 |
| **Plaza-out** | A plaza with radiating main streets, side streets from the WFC road tiles (copied `wfc.ts`) | Free | Rings out from the plaza | 0.5 |

**Persistence** (Rossi's *permanences*): when a later city is founded, buried streets
**attract** its new streets. The pull strength is the old city's persistence value, and it
weakens with burial depth. A strong grid reappears through 3 m of silt; organic lanes vanish.
The old center monument's mound pulls the new center toward it.

---

## 4. Simulation mechanism

**Grid:** 160 × 160 cells, each **2 m** (a 320 m diorama).

**Time step:** 5 years, with sub-steps for flood events.

**Execution:** deterministic from the seed, in a **Web Worker**, with zero-copy transferable
typed arrays.

**State per cell:**
- `ground`: the surface height.
- `stack`: the soil layers, each with thickness, era and material (bedrock, natural soil,
  silt from flood N, rubble of city K). The cross-section is drawn from this.
- `water`: depth, and whether the cell is in the channel.
- `irrig`: water access, from the river or canals.

**Per step, in this order:**

1. **Flow.** `Q = siteFlow(year) × (1 + noise)`, from the site's flow history. A flood happens
   when Q exceeds the channel's bankfull capacity; anchor events force specific floods.
2. **Aggradation.** The channel bed and the levees beside it rise by `a × sedimentLoad` each step.
   Kaifeng's sediment load is high, which is why its river ends up above the city.
3. **Avulsion** (Mohrig et al. 2000; Jerolmack & Paola 2007):
   - for each channel cell, compute the superelevation
     `SE = (levee crest − nearby floodplain) / channel depth`;
   - during a flood, if the largest SE is above the threshold (~1, tunable), the river breaks out
     at that cell;
   - the new course is traced by **steepest descent** to the outlet, with a little noise to break
     ties;
   - the old channel is marked abandoned and slowly fills with silt.

   This single rule produces avulsions of every size, from small to valley-wide.
4. **Flooding.** A statistical "stage and spread" model, not a fluid simulation:
   - a multi-source BFS runs out from the channel;
   - the water level at each cell is `stage(Q) − slope × distance`;
   - every cell lower than that level floods, to a depth equal to the difference.

   This is cheap enough to run every step across centuries. A full shallow-water model
   (the virtual-pipe model of Mei et al. 2007) needs tiny time steps and is meant for GPU
   real-time erosion. Its realism isn't needed at a 5-year scale. It is a possible stretch goal
   for the visual of the single big flood moment.
5. **Deposition.** Each flooded cell gains `d = c × depth × exp(−distance / L)` of silt, as a new
   stack layer tagged with the flood's year. Deposits are thickest near the channel, which is how
   levees form. Kaifeng's 1642 anchor uses a large `c`, so the inner city is buried in meters.
   Still water at a river mouth or a lake edge silts up, so the shoreline moves outward.
6. **Drying.** The flow history scales the channel width. At Mohenjo-daro after ~1900 BCE the
   river narrows, then is wet only in flood years, so the water access of the cells around it falls.
7. **Angkor's water network.** The city digs canals and barays as its population grows. Each
   canal segment has a capacity:
   - in extreme flows, upstream segments erode (their capacity grows) and downstream segments
     silt up (capacity shrinks);
   - flow is routed through the network every step;
   - a segment that fails sends its water to its neighbors, so failures cascade.

   This is the Penny et al. 2018 mechanism, simplified.
8. **Carrying capacity and population.** There are no individual agents (Janssen 2009 showed
   carrying capacity does most of the work).
   - `K = Σ over farmland cells within reach of fertility × irrig`. Silt from moderate floods
     raises fertility; deep or late floods destroy that year's crop.
   - Population grows logistically: `P += r P (1 − P / K)`. When `K < P`, people leave.
   - The occupied lots follow `P`. New lots are built in the founding rule's order, and the
     outermost lots are abandoned first.
9. **Decay.** Each building has a condition `c` from 1 (new) to 0 (rubble).
   - An occupied building is repaired, so its condition only falls in floods.
   - An abandoned building loses 2–4% per step.
   - Standing in floodwater costs a large one-time loss, plus extra loss for each year it stays
     wet.
   - At `c = 0` the building collapses into a rubble mound about 30% of its height, which becomes
     a stack layer.
   - A building whose base is covered by more silt than its own height is **buried** and leaves
     the scene, but stays in the stack.
10. **Abandonment and refounding.**
    - A city is abandoned when `P` drops below a floor, or when the river has left its water
      reach for 50 or more years.
    - After a gap of at least 30 years, if any land has `K` above the founding threshold, the run
      pauses with the refounding prompt.
    - The founding zone is drawn where `K` is high and the ground is dry.
11. **Event log.** Every flood above a size threshold, avulsion, collapse wave, abandonment,
    founding and anchor event is logged with its year, location and a sentence of text. The log
    drives the captions and the camera.

**Scrubbing backward:** the worker saves a snapshot every 50 years. To go back, it restores the
nearest earlier snapshot and simulates forward again, which takes about 1 s for 50 years in the
worker.

**Determinism:** one seed per run; `Rng.fork(label)` per subsystem.

---

## 5. Style

**Voxel diorama, daylight.**
- Terrain is drawn per 2 m cell, quantized to **0.5 m** vertical steps.
- Buildings are voxelized at 0.5 m.
- The diorama sits on a plinth, copied from `buildPlinth`, re-colored in dark wood or earth, so
  the cross-section edge reads as a museum display case.

**Light:** a warm low sun (copied from WorldView's sun and hemisphere setup, but with a warmer
color and ~35° elevation), soft PCF shadows, ACES tone mapping, sky color `#e9dcc4`.

**Palettes per site:**

| Site | Ground | Water | Buildings |
|---|---|---|---|
| Kaifeng | Loess yellow | Ochre, silt-laden | Gray brick, dark tile roofs, red columns, a pagoda (the Iron Pagoda) |
| Mohenjo-daro | Pale alluvium | Brown-green | Baked red-ochre brick, flat roofs, the Great Bath, the citadel platform |
| Angkor | Laterite red, green rice fields | Green, blue barays | Sandstone gray, temple towers (prang) and moats |
| Rome | Green hills, travertine | Tiber green-brown | Terracotta roofs, white temples, insulae, a forum |

**Building library:** about 6 archetypes per culture:
- houses (courtyard house / domus / row house);
- a large house;
- a workshop or market;
- a temple or palace;
- walls and gates;
- one landmark.

It uses the pattern of the `Kit` and `parts` box builders, copied and simplified.

**Era colors in the cross-section:** each city's rubble layer gets its own tint; silt layers are
striped pale-to-dark by age.

**Decay, shown in stages:**
- `c < 0.7`: the roof is removed;
- `c < 0.4`: the building is lower (its upper voxels are dropped) and its colors darken;
- `c < 0.15`: it tilts 3–8°;
- at 0: it is swapped for a rubble mound.

The **silt top** is drawn in a wet tone for 2 steps after each flood.

**Water:** a translucent surface at the water level, colored by depth, with the ripple vertex
technique from the Shader Studio (`week04 techniques/ripple`).

---

## 6. UI

**Museum-display style (2026-10-20):** parchment panels (`paper` #f6efe0, border `line`
#d3c09a) with dark-ink text (`ink` #33281d, soft #6b5843, faint #9a8467); **Cormorant Garamond**
for titles, headings and the year (an exhibition-label serif), **Source Sans 3** for body text,
JetBrains Mono for small values; deep **river teal** #1d6f68 as the one accent, **clay** #a9502a
for events. `E` hides the panels. Colors are Tailwind tokens in `river-site/tailwind.config.js`.

| Region | Contents |
|---|---|
| **Top-left: title card** | Site name and river, **current year in large type** (e.g. "1642 CE"), city number (I, II, III), population, status ("Growing", "Flooded", "Abandoned") |
| **Right: event log** | Captions, newest first, with year, icon and one sentence (e.g. "1642: The Yellow River breaks its dike north of the city. The inner city is buried under 6 m of silt."). Tapping an entry flies the camera to the place and scrubs to the year. |
| **Left: rules panel** (collapsible) | Overlays: water depth, flood risk, carrying capacity, era layers. **River rules** (sliders): sediment load, avulsion threshold, flood frequency, so visitors can see how a rule changes the fate. A Reset button. |
| **Bottom: time bar** (the requested control panel) | Play/pause; a **year scrubber** labeled in years, with era bands (city I/II/III) and event ticks; a **speed** select of ½×, 1×, 2×, 4×, 8× (1× = 10 years/s); a **Cut** toggle for the cross-section; the current year. Pattern copied from `PrintBar.tsx`. |
| **Founding screen** | Site diorama with a glowing founding zone, 4 rule cards with small plan diagrams, a "Found the city" button |
| **Refounding modal** | "The river left. 40 years later, people return. Found a new city?" with the 4 rule cards and "Leave it empty" |
| **End card** | e.g. "3 cities · 2,300 years · buried 9 m", and Replay / Try another rule / Another site |

**Cross-section:** a clipping plane through the diorama (`renderer.localClippingEnabled`)
with a solid cap. The soil faces in the cut are colored from each cell's `stack`. The plane can
be dragged.

---

## 7. Project structure (`river-site/`)

```
river-site/
  package.json  vite.config.ts  tailwind.config.js  tsconfig.json  index.html
  firebase.json  .firebaserc                        # hosting target "river"
  src/
    main.tsx  App.tsx                               # screens: pick → found → simulate
    lib/        rng.ts noise.ts path.ts geometry.ts voxels.ts distance.ts wfc.ts   # copied
    sites/      types.ts kaifeng.ts mohenjodaro.ts angkor.ts rome.ts terrain.ts (authoring helpers)
    sim/        state.ts flow.ts river.ts flood.ts sediment.ts canals.ts
                population.ts decay.ts persistence.ts events.ts snapshot.ts step.ts
                worker.ts  client.ts                # Worker + typed-array transfer
    city/       castrum.ts axial.ts organic.ts plazaOut.ts plan.ts (shared Plan type)
    buildings/  kit.ts parts.ts chinese.ts indus.ts khmer.ts roman.ts render.ts
    render/     View.ts ground.ts water.ts cutaway.ts rubble.ts palette.ts plinth.ts
    ui/         controls.tsx SidePanel.tsx SiteCards.tsx FoundingPanel.tsx TimeBar.tsx
                EventLog.tsx RulesPanel.tsx RefoundModal.tsx EndCard.tsx
  test/         sim.test.ts                         # vitest: determinism + invariants
```

**Copied from `site/` and adapted:**
- `src/world/rng.ts` (`hashSeed`, `hash2`, `Rng`), `noise.ts` (`fbm`, `ridged`), `path.ts`
  (`centripetalCurve`, `distanceToCurve`), `geometry.ts` (`GeometryBuilder`), `voxels.ts`
  (`VoxelBatch`), `terrain/distance.ts`, `terrain/wfc.ts` (`solve`);
- the column meshing of `terrain/meshColumns` (`terrain/mesh.ts:193`), adapted to draw layered
  stacks;
- the camera, lights and controls from `render/WorldView.ts` (lines ~95–150), the print-clamp
  idea from `render/print.ts` (used for the build-up of new buildings), and `render/base.ts`
  `buildPlinth`;
- the building-kit pattern from `buildings/kit.ts`, `parts.ts` and `render.ts`;
- `components/controls.tsx` (Field, Switch, RangeInput, Select), `components/SidePanel.tsx`
  (`useShortcutToggle`), and the `ui/PrintBar.tsx` pattern;
- Shader Studio's ripple and fog snippets (`weeks/week04-shaders/shader/techniques/`).

**Rendering performance:**
- Ground is remeshed per 16 × 16-cell chunk, and only chunks whose cells changed.
- Each building is one merged mesh (as in Blueprint City); decay changes its group's scale and
  tilt, or swaps the mesh.
- At most ~800 buildings.

**Cleanup in the current site:** `site/src/App.tsx` imports `./river` (an uncommitted change),
and `site/src/river/` contains only empty folders, so the current site's build fails. Remove
that import and route, and the empty folder.

**Deploy:** a second Hosting site in the same Firebase project (`firebase hosting:sites:create`,
target `river`), deployed from `river-site/`, only when asked. Add a `river` entry to
`.claude/launch.json` (port 5181) for previews.

---

## 8. Milestones

1. **Scaffold:** Vite, React, three.js, Tailwind; copied libraries; a blank diorama with plinth,
   daylight and camera; the time bar running a year counter. Fix the current site's build
   (cleanup above).
2. **River sim on one site (Kaifeng):** flow, aggradation, avulsion, flooding, deposition, stack
   layers; ground and water meshes; event log. Verify an avulsion happens and silt accumulates.
3. **City:** the castrum and axial layouts, carrying capacity and population, lots filling,
   ancient buildings (the Chinese set first), decay stages, rubble, burial.
4. **Refounding and persistence:** abandonment, refounding prompt, attraction to buried streets,
   3 cities in one run. Add the cross-section.
5. **All four sites and rules:** Mohenjo-daro (drying), Angkor (canal network), Rome (hills,
   continuity); the organic and plaza-out layouts; each culture's buildings.
6. **Screens and polish:** site cards, founding screen, rules panel, end card, captions,
   snapshots for scrubbing, palettes. Test with classmates: can they retell the story?

---

## 9. Verification

- **Simulation tests (vitest, Node, no rendering):**
  - the same seed and choices give identical event logs (determinism);
  - water never flows uphill in an avulsion path;
  - an avulsion fires when SE passes the threshold and not before;
  - silt layers only add to the ground;
  - Kaifeng's 1642 anchor buries the inner city (the burial depth near the center is several
    meters);
  - Mohenjo-daro's `K` falls after 1900 BCE;
  - a broken Angkor canal raises the load on its neighbors;
  - persistence 0.9 makes the second city's streets overlap the first's more than persistence 0.2.
- **Browser** (preview at localhost:5181):
  - each site at 1× and 8×, no console errors;
  - scrubbing backward restores the earlier state;
  - the Cut view shows colored layers;
  - frame rate stays near 60 fps at 8× (checked with the performance panel);
  - screenshots of each milestone.
- **Build:** `npm run build` in `river-site/`, and also in `site/` after the cleanup.

## Key references

- Jerolmack & Paola 2007 and Mohrig et al. 2000 (avulsion by superelevation).
- Penny et al. 2018 and Day et al. 2012 (Angkor's water network).
- Giosan et al. 2012 (Indus rivers).
- The 2020 *Scientific Reports* study of the 1642 Kaifeng flood.
- Aldrete 2007 (Tiber floods).
- Janssen 2009 (carrying capacity over agents).
- Parish & Müller 2001 and CityEngine's street growth (organic layout).
- The *Kaogong ji* capital plan.
- Roman castrum and colony plans (Ostia, Turin).
- Mei et al. 2007 (virtual-pipe water: considered and deferred).
- Rossi, *The Architecture of the City* (persistence).
