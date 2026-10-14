# Town plan: street network and scatter

[← Terrain plan](terrain-plan.md)

The terrain is finished: noise → shaping → heights → terraces → river valley → voxels →
surfaces → mesh, on a 232 m diorama of 0.25 m voxels (928 × 928 columns). This plan adds the
first layer of the city on top of it: a **street network** that starts by the river and grows
automatically, the **scatter** that follows from it (lamps, street trees, forest, rocks,
reeds), and a **district map**: an internal map of what kind of building belongs where, so
buildings can be scattered onto it later.

**Decisions (2026-10-08):**
- **Where the town starts:** by the river.
- **The network is automatic:** everything comes from the seed and the settings. Nothing is placed by hand.
- **One megacity, not separate settlements:** a single center by the river, junction sites over
  all the buildable ground, and one connected street web. The hubs have no settings.
- **3 to 5 main streets** radiate from the center plaza; smaller streets fill in between.
- **Street network, third design (2026-10-09):** the side streets come from **wave function
  collapse on a tile grid** (section 4W), starting from the plaza. It follows the "2D Module &
  Rule" board the user shared. It replaces the grown side streets of 4R (4R.4's boulevard is
  kept).
- **Street network redesign (2026-10-08):** the point-to-point network of section 4 is replaced
  by a grown network (section 4R). It grows from the plaza and a riverside boulevard, is steered
  by a direction field, and is held to local rules: crossings become junctions, and streets meet
  near right angles.
- **Buildings later:** this plan builds the district map and the lots they will go on.
- **Six districts (2026-10-09):** corporate core, neon entertainment strip, megablock housing,
  industrial / docks, wealthy enclave, parks (section 6).
- **Deferred:**
  - the elevated rail and its pillars;
  - the buildings themselves, and the facade decoration that needs them;
  - cars and people.
- **The ocean stays removed:** the river is the waterfront.

**Goal, from the reference image:** almost nothing in a city like this is scattered freely. Streets
wind down the slopes into a plaza; lamps and trees line the streets; forest covers the ground too
steep to build on. So the order is **network first, then scatter**, and every stage *claims* the
columns it uses so later ones keep off them.

Sources:
- the class notes ([distribution-and-paths-notes.md](../notes/distribution-and-paths-notes.md)) and Week 5's code;
- Galin et al. 2010 (roads as slope-costed shortest paths) and 2011 (networks that reuse roads);
- Parish & Müller 2001 (street growth with global goals and local constraints) and Chen et al.
  2008 (street networks steered by a tensor field);
- Boeing 2019 (street-network measures: orientation, junction types, circuity); FHWA and NACTO
  intersection guidance (right angles, never under 75°); city block sizes (Portland, Barcelona,
  Manhattan, Tokyo);
- Emilien et al. 2012 (villages grown from interest maps);
- Horizon Zero Dawn's placement (density maps plus distance fields plus footprints);
- Bridson's Poisson disk sampling.

---

## 1. The pipeline after this plan

```text
… terraces → river ─┬─ claims ─ hubs ─ streets (route · plazas · carve) ─ voxelize ─ surfaces ─ mesh ─ districts ─ scatter
                    └─ river distance field (kept)
```

| Stage | Param group | Reads | Writes |
|---|---|---|---|
| River (exists) | `river` | terraced map | carved map, channel, **distance field (newly kept)** |
| **Hubs** | — | river-carved map, river distance | the center, junction sites, buildable cells, suitability |
| **Streets** | `streets` | hubs, carved map, channel | road graph, curves, profiles; road and plaza carve; claim map; road distance |
| Voxelize (exists) | — | carved map | columns |
| Surfaces (exists) | `surfaces` | columns, claims | adds `road`, `plaza`, `curb` surfaces before the other rules |
| Mesh (exists) | — | | |
| **Districts** | — | columns, claims, streets, hubs, river distance | access, frontage, district and density per cell; lots; lot claims |
| **Scatter** | `scatter` | columns, surfaces, claims, curves, districts | instances per asset |

Districts and scatter run **after** the mesh: they change no ground, so tuning them never
remeshes it. Streets
run **before** voxelize because, like the river, they carve the height map.

---

## 2. The claim map (the backbone)

One byte per column, written in pipeline order. A stage may only use columns that are free (or
that it is allowed to share):

| Value | Claimed by |
|---|---|
| `free` | — |
| `river` | the channel |
| `bank` | one column beside the channel |
| `road` | inside a road's width |
| `verge` | the 1.5 m strip along each road edge, where lamps and street trees stand |
| `plaza` | inside a plaza |
| `lot` | a building lot (section 6); scatter keeps off it, except where the district allows greenery |
| *(later)* `rail` | rail pillars |

**Distance fields beside the claims:** distance to the river channel and distance to the nearest
road, in columns. They are capped at about 40 m and stamped per curve segment, as the river already
does (that code moves into `path.ts` and is shared). These answer the "≥ 2 m from a road" kind of
rule in one lookup.

**Debug view:** a **Show claims** switch tints the ground by claim (shader-side, no rebuild).

---

## 3. Hubs: the megacity's skeleton

**One city, no settings.** There is a single center (downtown, the main plaza by the river) and,
around it, **junction sites** over all the buildable ground. Streets will connect them into one
web. Blocks are small downtown and grow toward the edge. Every number is a constant in
`terrain/hubs.ts`.

**Grid:** a coarse grid of 2 m cells (8 × 8 columns, 116 × 116 cells), used by hubs and routing.
Each cell's height and slope come from its mean height on the river-carved ground, so a flat
valley floor counts as flat and single terrace steps average out.

**0. The side (2026-10-12):** the river splits the land; the city takes the side with the most land
(a flood fill per side that never enters the channel).

**1. The center:** the cell on that side with the best suitability (Emilien's interest map):

```text
flat  = 1 − smoothstep(0, 8°, slope)
river = exp(−((d − 8 m) / 15 m)²)                 d = distance to the river channel
low   = 1 − 0.5 · height / Height
S     = flat · low · (0.4 + 0.6 · river)          0 within 1 m of the channel and at the map edge
```

Without a river, `river` = 1 and the city starts on the flattest low ground.

**2. Buildable cells:**
- slope under 15°;
- at least 3 m from the channel;
- away from the map edge;
- on the city's side of the river (the side with the most land), until bridges exist (step 8).

**3. Junction sites, growing outwards like a city:**
- **Visiting order:** buildable cells are visited by
  `key = distance to center + block · (0.6 · steepness + 0.5 · seeded random)`.
- **Keeping a cell:** it is kept if no junction so far is closer than its **block size**. The block
  size grows from **26 m** at the center to **46 m** at the city's far edge.
- **Ties:** flatter ground and the seeded jitter win ties, so the pattern is organic rather than
  rings.

**Overlay (Show network):**
- pins the center (large, white) and every junction;
- tints the ground dark where nothing can be built, and elsewhere violet to amber by suitability for the center.

---

## 4. Streets: routing (superseded by section 4R)

> **Superseded.** This point-to-point network (sectors, a neighbor graph between junction sites,
> each link routed on its own) was built in step 4 and is replaced by section 4R. It is kept here
> for the record. Section 4R lists what is reused from it.

**Main streets first (3–5, default 4):** the town's spine, radiating from the center plaza like
the arms of a hillside town.
1. **Sectors:** split the circle around the center into *Main streets* equal sectors, turned by a
   seeded angle, so the main streets always spread out instead of bunching on one side.
2. **Target in each sector:**
   - The street runs to the farthest junction in its sector, so it crosses the city.
   - If the sector is one of the *Exits* (0 up to Main streets, default 2), it carries on from
     there to the diorama edge, ending on the lowest ground near the sector's middle.
   - An empty sector (no junction) runs straight to its edge point.
3. **Routing:** the main streets are routed first, so every later road joins them. They take the
   shortest way (around the river only), cutting and filling the terrain to stay within the grade.
4. **Fallback:** if a sector's target is unreachable (cliffs), it is dropped, but never below
   three main streets. The next-best sector target is tried instead.

**Then the streets, linking neighboring junctions:**
- **Which junctions connect:** two junctions are linked when no other junction lies inside the
  circle that has them as its diameter (a Gabriel graph).
- **Why this rule:** it gives a planar web of city blocks with natural loops, and no long
  diagonal shortcuts.
- **Too steep:** links over ground too steep to route are dropped.
- **Streets params:** the Loops setting is no longer needed.

**Routing each edge**, shortest first (Galin 2010/2011): A* on the 2 m grid.
- **Neighbors:** 16 directions (the 8 neighbors plus the knight moves), so roads can run at
  angles between the 45° ones. Galin's k-neighborhood idea.
- **Step cost** (the formula below):
  - **The slope term** makes steep ground expensive and forbids grades over **Max grade**.
    Switchbacks then appear by themselves on steep hills.
  - **Reuse:** cells that are already road cost `× (1 − Reuse)`, so later roads join earlier ones.
    That makes a branching network instead of parallel roads. The A* heuristic is scaled by
    `(1 − Reuse)` so it stays admissible.
  - **Forbidden cells:** the river channel (bridges come in step 7) and a 2-cell margin at the map
    edge, except at exits.
  - **Unreachable junctions** (too steep everywhere) are dropped.

```text
step cost = length · (1 + Slope cost · (grade / Max grade)²)
```

**Edge hierarchy:** the 3–5 main streets use Main width; every other street uses Street width.
Where a street joins a main street, the main street wins.

---

## 5. Streets: shape, plazas and carving (partly superseded by section 4R)

> The curve, profile and carve tools below are reused. Profiles are now solved per junction first
> (section 4R.5), and the junction plazas were removed.

**Plazas first**, so roads meet them at a fixed level:
- **Size:** a 24 m square framed by a curb at the center (on the voxel grid, moved to fit clear of
  the river). It is the only plaza.
- **Level:** the median ground height inside, rounded to whole voxels.

**From cells to curves:**
1. **Simplify:** the cell path is simplified with a 1-cell tolerance (Douglas–Peucker).
2. **Curve:** a centripetal Catmull-Rom curve through the remaining points (`path.ts`), sampled
   about every column.
3. **Height profile:**
   - sample the ground under the curve and smooth it (`smoothProfile`);
   - pin both ends to their plaza levels;
   - clamp the grade with a forward and a backward pass so it never exceeds Max grade;
   - round to whole voxels.

   The roads step in single voxels, as ramps and stairs that read as voxel streets.

**Carving into the height map** (cut *and* fill, unlike the river, which only cuts):
- **Inside the half-width:** the road level.
- **Across the Embankment band:** a blend back to the ground.
- **Overlaps:** where two roads overlap, the wider one wins; at equal width, the lower level wins.
- **The river:** carving never touches the channel or the bank.

**Surfaces:**
- `road`: dark paving, slightly lighter on main streets.
- `curb`: the one-column road edge, in a lighter stone.
- `plaza`: paving with a slight checker tone.

These rules run before rock, dirt and grass.

## 4R. Street network redesign: a grown network

### 4R.1 Why: what was wrong (measured 2026-10-08)

The step-4 network connected scattered junction sites with independently routed streets. Measured
on four seeds the way street-network studies measure real cities:

| Measure | Step-4 network | Real cities | Problem |
|---|---|---|---|
| Junction angles under 60° | 28–36% | Design guides: right angles, never under 75° (FHWA, NACTO) | Wedges and slivers |
| Junction angles 75–105° | 9–17% | Most junctions are T- or X-junctions near 90° | |
| Street pairs crossing away from a junction | 9–17 per seed | About none: every crossing is a junction | Overlaps; the network isn't planar |
| Enclosed blocks | Median 60–540 m²; 3–9 under 400 m² | About 3,700 m² (Portland) to 12,800 m² (Barcelona) | Blocks too small to build on |
| Street shape | Straight segments with kinks | Hillside cities follow contours (Lisbon, Hong Kong) | Main streets cut 10 m into hills |
| Relation to the river | None | A riverside boulevard, streets down to the water | The city turns its back on the river |

**The root cause is the mechanism.** A network drawn between points produces its junction angles
and crossings by accident. Real cities, and the classic procedural method (Parish & Müller 2001),
*grow*:
- **Branching:** new streets branch off existing ones.
- **Local constraints:** a street snaps to a nearby junction, stops where it meets a street (a
  T-junction), turns a crossing into a junction, and is rejected if the angle or block would be
  too small.
- **Global goals:** a direction field steers the growth (Chen et al. 2008 use a tensor field).

### 4R.2 What stays and what goes

- **Stays:**
  - the hubs stage's center, buildable cells and side of the river;
  - the 24 m center plaza;
  - `path.ts` curves and distance fields;
  - the cut-and-fill carve with depth-scaled embankments;
  - curbs, claims and surfaces;
  - the A* router, used only for the riverside boulevard if needed.
- **Goes:**
  - the junction sites (hubs keeps only the center, buildable and side);
  - the sector targets;
  - the neighbor graph;
  - point-to-point side streets;
  - the reuse discount;
  - string pulling for side streets.

Nothing becomes tunable: every number is a constant, as before.

### 4R.3 The direction field (the global goal)

**A cross field** on the 2 m cells: at every cell, two perpendicular street directions. It is
stored as the angle θ (mod 90°) through the vector (cos 4θ, sin 4θ), so directions 90° apart
count as the same and can be blended. Three sources, blended by weight:

| Source | Direction | Weight |
|---|---|---|
| **Contours** | Along the contour (perpendicular to the downhill gradient of the smoothed ground) | Rises from 0 at 3° of slope to 1 at 10° |
| **River** | Along the river's curve at the nearest point | 1 at the bank, fading to 0 by 50 m |
| **Core grid** | One angle for the flat core: the river's direction at the plaza | 0.3 everywhere, so flat ground keeps a steady grid |

The field is blurred a few times so directions turn gradually. **The result:** streets on slopes
run along the contours (hillside terraces) with cross streets climbing straight up them; near the
water they run parallel and perpendicular to the river; flat ground gets a calm grid.

**Overlay:** Show network draws a small cross per 8 m showing the field.

### 4R.4 The skeleton: boulevard and main streets

1. **The riverside boulevard (a main street, 6 m).**
   - **Path:** the river's curve offset onto the city's bank, past the channel, the bank, half
     the width and 2 m. It is clipped to buildable cells and runs to the diorama's edges where it
     can.
   - **The plaza:** it passes along the plaza's river side.
   - **Profile:** the usual profile (section 5), held within the grade.
2. **2–4 main streets from the plaza (6 m),** so with the boulevard there are 3–5 (the seed
   picks).
   - **Start:** each starts at the middle of a plaza side that doesn't face the river (a corner
     instead if more are needed). So main streets arrive spread out, as at a city square, not all
     at one point.
   - **Path:** each is a **streamline** of the cross field. Starting perpendicular to its plaza
     side, it steps 2 m at a time along whichever field direction is closest to its current
     heading. So it climbs where the field allows and turns along the contours where the hill is
     too steep.
   - **Grade:** a main street may also cut and fill, but no more than 4 m, so the turn happens
     before a deep cut is needed.
   - **End:** it stops at the diorama's edge (an exit) or at the end of the buildable land, or it
     joins another main street (see the snapping rules in 4R.5).

### 4R.5 Growth with local constraints (the side streets)

**Seeds:** along every street, every *block length*, a branch is proposed on each side,
perpendicular to the street (snapped to the field direction nearest to perpendicular).
- **Block length:** 30 m in the core, growing to 50 m at the city's edge, by distance from the
  plaza along the streets.
- **Order:** seeds are processed in order of that distance, so the city fills from the center
  outward, like a city growing.

**Each branch (3.5 m)** grows in 2 m steps as a streamline of the field, up to two block lengths.
After each step, the local constraints (Parish & Müller) are checked in this order:

1. **Snap:** within 6 m of an existing junction, end there and stop.
2. **Cross:** if the step crosses a street, end at the crossing and stop. The crossing becomes a
   junction: a T-junction, or an X-junction if the branch continues on the far side as a new seed.
3. **Extend:** if a street lies within 8 m straight ahead, run on to meet it at a T-junction and
   stop.
4. **Stop:** if it leaves buildable cells, comes within the river clearance, or would climb more
   than 15% even with up to 2 m of cut.
5. **Reject the whole branch** if:
   - it meets a street at less than 75°;
   - it runs closer than 18 m alongside a parallel street (that would make a sliver block);
   - or it ends up shorter than 12 m.

**After growth:** a dead end shorter than one block is removed. A longer one is extended up to 20 m
to the nearest street, or kept as a cul-de-sac if it ends in housing ground.

**The graph is planar by construction:** every crossing is a node. It is stored as nodes
(junctions, with positions) and edges (polylines between them), with a spatial hash of segments for
the crossing tests.

### 4R.6 Levels per junction, then streets, then one carve

1. **Junction levels first:**
   - **Starting level:** each node starts at the smoothed ground under it; the plaza is fixed.
   - **Relax:** a few hundred quick passes over the edges. Where two ends differ by more than the
     grade allows over the edge's length, both move toward each other (a fixed node doesn't move).
   - **Result:** junctions are at consistent heights, and every street can reach both its ends.
     This removes the steps where streets join, the remaining roughness of step 4.
2. **Street profiles:** each edge's profile is pinned to its two node levels and held within the
   grade (section 5's two passes). Curves come from Catmull-Rom through the edge's polyline.
3. **One carve:**
   - **Junctions:** at every node, a disc as wide as its widest street is flattened to the node
     level, so crossings are flush.
   - **Streets:** they carve as before (cut and fill, embankments).
   - **Order:** the boulevard and main streets go first, so where streets overlap, theirs wins.
4. **Curbs and claims:** as now.

### 4R.7 Alleys (the third tier, with the districts)

**What they are:** inside any block larger than about 2,500 m², a second, finer growth round
(spacing 15–20 m, width 2 m) adds alleys.
- **Grade:** alleys may climb up to 40%, built as voxel stairs, which is the Hong Kong and Lisbon
  stair-street.
- **Why with the districts:** the dense core and the hillside districts get them, so it waits for
  step 5.

### 4R.8 How to know it worked

The same measurements as 4R.1, on 7 seeds:
- **Junction angles:** at least 70% within 75–105°, and at most 5% under 60°;
- **Crossings:** 0 away from a junction;
- **Blocks:** median enclosed block at least 1,500 m², and none under 400 m², except where
  district rules want a tiny square;
- **Connected:** one network;
- **Main streets:** 3–5 including the boulevard, at least 2 of them reaching the edge;
- **Grade:** no carved 4 m stretch steeper than 20% (only voxel rounding left), and no main street
  cut deeper than 4 m;
- **River:** the boulevard runs along the river on every seed with a river;
- **Speed:** the streets stage under 300 ms.

A test script (`scratchpad`-style, run with tsx) prints these numbers for each seed, as the step-4
checks did.

### 4R.9 Build order for the redesign (replaces the rest of step 4)

1. **R1. Direction field:** the cross field and its overlay crosses.
   - *See:* the crosses follow the contours on slopes and the river near the water.
2. **R2. Skeleton:** the riverside boulevard, and 2–4 main streets traced from the plaza sides.
   - *See:* a boulevard along the river and main streets that bend along the hills instead of
     cutting through them.
3. **R3. Growth:** seeds, streamline branches and the local constraints; the planar graph.
   - *See:* blocks with right-angle junctions; no wedges, no overlaps.
4. **R4. Levels and carve:** junction levels, edge profiles, junction discs, one carve. The old
   routing code is removed.
   - *See:* flush junctions on slopes.
5. **R5. Clean-up and checks:** dead ends, the 4R.8 numbers, tuning the constants.
6. **Then on to step 5 (districts and lots),** with alleys (R6) folded into it.

**R1–R5 built 2026-10-09 (first pass).**

The code:
- `terrain/field.ts`: the cross field.
- `terrain/streets.ts`: rewritten as a planar street graph with a spatial hash.
- `terrain/hubs.ts`: now only the center, buildable cells, side and span. The junction sites are
  gone.
- **Show network** draws the field as crosses and dots the junctions.

**Changes from the plan,** each found by measuring:
- **Steering.** Each cross-field direction pair holds both the contour and the straight-uphill
  direction, so "closest to the heading" sent streets straight up hills.
  - A street now takes the closest direction that is within its grade; on a slope, that is along
    the contour.
  - It never turns back on itself.
  - Main streets steer by a 50/50 blend of their heading and the way they set out, so they don't
    follow a contour round a hill.
  - Main streets may turn 20° per step (was 12°).
- **Side streets grow on any ground on the city's side,** not only buildable cells. Only scattered
  patches of this hilly land are under 15°, and branches stopped at once.
- **Side streets may climb 25%,** as stepped hillside streets; main streets stay at 15%. Otherwise
  no branch can leave a contour street on a slope steeper than 15%.
- **Growth:**
  - **X-junctions:** a seed sitting on a junction (the other side's branch was built) starts from
    it, instead of being skipped.
  - **Continuing:** a branch that stopped only at its length carries on from its end.
- **Boulevard:** a piece ending within 40 m of the plaza joins the plaza's nearest corner.
- **Sizes:**
  - parallel gap 26 m (was 18), minimum branch length 20 m (was 12);
  - unpaved pockets under 150 m² enclosed by paving are paved as small squares;
  - the pocket search marks whole large areas done, so it stays fast.

**Measured on 7 seeds, against 4R.8:**

| Measure | Target | Now | Step-4 network |
|---|---|---|---|
| Street pairs at junctions meeting obliquely under 60° | ≤ 5% | 3–25% | 28–36% (old measure) |
| Near right angle (75–105°), of non-straight pairs | ≥ 70% | 40–80% | 9–17% |
| Streets crossing away from a junction | 0 | 0 by construction (the measure's nearness test sees 0–1) | 9–17 |
| Blocks enclosed by streets | median ≥ 1,500 m², none under 400 | 0–6 per seed, 156–2,000 m²; 1–4 under 400 | median 60–540 m² |
| One connected network | always | 6 of 7 seeds (kowloon 95%) | always |
| Grade | no 4 m stretch over 20% | side streets go to 25% by design; stretches over 30%: 1.4–5.5% | |
| Speed | under 300 ms | 200–330 ms | 140–410 ms |

**Not yet met:**
1. **Coverage.** Growth is still sparse on the hilliest seeds (3–5 side streets on 8ahsrz,
   harbor and myg654), so few blocks close. Most failures: branches too short or too steep (cut
   limit), and links rejected for meeting a street at a shallow angle (16).
2. **Sharp angles.** Most come from the skeleton (main streets and the boulevard meeting each other
   and the plaza's corners), where the angle rules don't apply.
3. **Connectivity.** One seed leaves a boulevard piece unjoined.

**Next fixes, in order:** apply the angle rule to main streets (bend or stop short instead of
joining at a shallow angle); join every loose end in a final pass; then tune the cut limits and
block lengths seed by seed.

### 4R.10 Risks

- **Field singularities:** where the three sources disagree, the cross field can swirl or have
  points where its direction is undefined. Blurring and the core-grid weight calm it; streamlines
  that start circling (heading changes over 180° within 40 m) are stopped.
- **Too few streets on steep seeds:** if most branches are rejected, the block length shrinks by
  20% and growth runs again, once.
- **Boulevard too close to the plaza:** if the plaza sits closer to the river than the boulevard
  offset, the boulevard bends around the plaza's river side.
- **Speed:** streamline steps and crossing tests are cheap (a spatial hash). Most of the cost stays
  in the carve, which already works per street box.

## 4W. Street network, third design: wave function collapse from the plaza

**Why (2026-10-09).** The grown network (4R) fixed the stray crossings and followed the hills, but
on 7 seeds it still had:
- 3–25% sharp junctions;
- too few streets on hilly seeds (few closed blocks);
- one seed not connected.

The user shared a board that generates roads with **wave function collapse (WFC)** over 12 road
tiles and three rules. Those rules answer each remaining problem by construction, so the side-street
growth is replaced. Kept: the plaza (now the **starting point** of the collapse), the riverside
boulevard, junction levels, profiles, the carve, pockets, curbs and claims.

### 4W.1 Tiles and grid

- **The grid:** square cells of **TILE = 20 m** (80 columns), aligned to the voxel grid (so
  streets are crisp voxel lines, not staircases), with **the plaza at the center of one cell**.
  About 12 × 12 cells cover the diorama; a cell exists if its center is inside the diorama.
- **The 12 modules:** each cell holds one module: a road through the cell's center to some of its
  four edge midpoints (E, S, W, N):
  - 2 straights (E–W, N–S);
  - 4 corners;
  - 4 T-junctions;
  - 1 cross;
  - 1 empty.

  There are no dead-end modules: every road continues.
- **Block size:** a block is at least 2 × 3 cells (see the rules), so at least about 600 m²
  inside the curbs, and 3 × 3 cells is about 40 m across.

### 4W.2 Which roads each cell may have (terrain)

For each cell and each direction, an **arm** runs from the cell's center to its edge midpoint (10 m).
An arm is **allowed** if every meter of it is:
- inside the diorama and on the city's side of the river;
- at least half the street width plus 1 m from the channel;
- within **25%** grade (stepped side streets; 15% for the avenues).

A module is allowed in a cell only if all its arms are. Each edge between two cells is one of:

| Edge | When | Effect |
|---|---|---|
| **Shared** | Both cells' arms toward it are allowed | Both have a road there, or neither (the basic rule) |
| **Blank** | Either arm is not allowed, or it faces the diorama's edge | No road |
| **Exit** | It faces the diorama's edge on an avenue's line | A road may leave the diorama there |
| **Boulevard** | A cell's arm runs into the riverside boulevard before the next cell | A road may end there, joining the boulevard at a T |

### 4W.3 The rules (from the board)

0. **Basic rule:** a road edge only meets a road edge, never a blank side, an empty cell or the
   boundary (except exits and the boulevard). There are no broken streets.
1. **Rule 1:** no curve onto a curve in the same direction. Two corners joined by their road,
   whose other arms point the same way, would make a U-turn and a 1-cell-wide loop.
   **Extended:** no 2 × 2 group of cells may form a closed loop, so the smallest block is 2 × 3
   cells.
2. **Rule 2:** no repeated identical combinations. A corner may not join a corner that joins a
   third corner of the first's module, so there are no staircases of zig-zag corners.
3. **Rule 3:** all roads lead to the plaza.
   - **Order:** the collapse **starts at the plaza** and grows outward. The next cell is always one
     next to the collapsed area: the one with the fewest options left, nearest the plaza first.
   - **Clean-up:** afterward, any road piece not connected to the plaza is erased.

**Terrain preference (weights).** Each module's chance is weighted:
- by type: straight 2, T 1.2, corner 0.8, cross 0.6;
- empty from 0.3 at the plaza to 1.5 at the city's edge, so the core is dense;
- each arm by how gentle it is, so on slopes the roads prefer to run along the contours.

### 4W.4 The plaza and the avenues

- **The plaza cell:** it holds the module with **every arm it can have**, a cross or a T where a
  side faces the river.
- **Avenues:** with the boulevard, the seed picks 3–5 main streets.
  - **Which:** 2–4 of the plaza's arms are avenues.
  - **Path:** each runs straight along its row or column from the plaza: those cells may only hold
    modules with both arms on the line, for as long as both arms are allowed.
  - **Width:** every street is 3.5 m (avenues were 6 m until 2026-10-09).
  - **Exits:** an avenue that reaches the diorama's edge is an exit.

### 4W.5 Solving

- **The solver:** standard WFC with constraint propagation (a cell's options are pruned whenever a
  neighbor's change rules them out). Rules 1, 2 and the 2 × 2 loop are checked when a cell
  collapses, against its collapsed neighbors.
- **Contradictions:** a cell left with no options restarts the collapse with the next seed, up to
  30 times. If every try fails, the last try's broken cells become empty, and their neighbors'
  roads toward them end as short dead ends.

### 4W.6 From tiles to streets

1. **Polylines:** roads are traced from junction cells (T and cross), the plaza's sides, exits and
   boulevard ends, through the cell centers and edge midpoints. Corners are rounded by the
   Catmull-Rom curve.
2. **The graph:**
   - the polylines go into the street graph (4R's planar graph, reused);
   - an exit runs on to the diorama's edge;
   - a boulevard end runs on until it meets the boulevard, which is split there.
3. **Downstream unchanged:** junction levels, profiles, the carve, pockets, curbs and claims.

**Overlay:** Show network draws the tile grid (faint squares) over the city's side, the junctions
and the center lines.

### 4W.7 How to know it worked

The 4R.8 numbers, on the same 7 seeds:
- **Angles:** junction angles all 90° (straight or near right: 100%);
- **Blocks:** median block at least 1,000 m², none under 400 m²;
- **Connected:** one network on every seed;
- **Coverage:** at least 30 road cells on every seed with a city larger than 60 m;
- **Speed:** the streets stage under 300 ms.

### 4W.8 Build order

1. **W1. The solver** (`terrain/wfc.ts`): modules, rules, propagation, collapse from the plaza,
   restarts.
2. **W2. Terrain:** arms, edges, avenues, weights, exits, boulevard edges.
3. **W3. Tiles to streets:** polylines into the graph. The growth code (4R.5) and the direction
   field are removed.
4. **W4. Overlay and checks:** the grid overlay, the 4W.7 numbers, the plan updated.

### 4W.10 Built (2026-10-09)

The code:
- `terrain/wfc.ts`: the solver.
- `terrain/streets.ts`: tiles, terrain, avenues, the solve, tiles to streets; the boulevard, levels,
  carve, pockets and curbs are kept.
- **Removed:** `terrain/field.ts` and the 4R growth.
- **Show network** draws the road tiles as faint squares.

**Changes from 4W, each found by measuring:**
- **Arms touching the plaza** are graded from the plaza's level, and may cut or fill up to 4 m
  (other arms 1.5 m beyond their grade). The plaza often sits on a valley floor below every
  neighbor, which left it with no arms.
- **The plaza may be a dead end.** Four dead-end modules exist, allowed only in the plaza cell, so
  a plaza with a single usable side still starts a street.
- **Peeling:** before solving, cells with fewer than two ways on (to another cell or the
  boulevard) lose their arms, repeatedly, so no dead-end corridor can force a contradiction.
  - **Plaza:** it takes only arms whose next cell can carry on.
  - **Avenues:** an avenue only steps into a cell that can.
- **Soft rules:** if no option keeps every rule, the rules are relaxed one at a time for that
  cell (Rule 2, then the 2 × 2 loop, then Rule 1). Only a propagation contradiction restarts.
- **The 2 × 2 loop rule** fires as soon as the loop is certain (each inner edge is known from
  either cell beside it), not only when the fourth cell collapses. Without that, 1-tile blocks
  still formed.
- **Rule 3:** a road that reaches the boulevard counts as connected (the boulevard joins the
  plaza).

**Measured on 7 seeds, against 4W.7:**

| Measure | Target | Now |
|---|---|---|
| Road tiles | ≥ 30 | 36–83 |
| One connected network | always | 7 of 7 |
| Dead ends | (none by design) | 0–2 (avenue ends at the diorama's edge, counted by the nearness test) |
| Junction pairs straight or near right | 100% | 86–100%: the oblique ones are where streets meet the curved boulevard |
| Under 60° | ≤ 5% | 0–4% on 6 seeds, 9% on myg654 |
| Blocks enclosed by streets | median ≥ 1,000 m², none under 400 | 6–14 per seed, mostly 600–2,200 m²; 1–4 under 400 m² per seed (beside the boulevard, or one-tile blocks where a rule had to relax) |
| Speed | under 300 ms | 200–330 ms |

**Still open:**
- **Exits:** avenues reach the edge on only 2 of 7 seeds (they stop where an arm is too steep for a
  main street).
- **Steep spots:** carved stretches over 30% are 2–5% of the streets, mostly beside the plaza (the
  4 m cut) and at junctions.

**Boulevard removed, square junctions (2026-10-09, the user's call).**
- **No boulevard:** the riverside boulevard is gone.
  - **Main streets:** all are avenues from the plaza, 3–5 (the seed picks), capped by the plaza's
    four sides.
  - **Removed with it:** the "road may end on the boulevard" edges, the street graph's crossing
    and split tools, and its spatial hash.
- **Square junction pads:** each pad is a square on the voxel grid, exactly as wide as the widest
  street meeting there. It was a circle 1 m wider, which bulged past the street edges.
- **Checked on 7 seeds:**
  - every junction pair is straight-through or a right angle (0% oblique);
  - no dead ends;
  - one connected network;
  - 16–85 road tiles;
  - the stage takes 145–320 ms.
- **The cost:** on harbor, the boulevard had linked most of the city, so it drops to 16 road
  tiles (its plaza has few usable sides).

**One street width (2026-10-09, the user's call).**
- **Width:** every street is 3.5 m wide, avenues included; the wider avenue rule (6 m) is gone.
- **What still marks an avenue:**
  - it runs straight from the plaza;
  - it holds the 15% grade (side streets 25%);
  - it is tagged `main` for the districts later.
- **Checked on 7 seeds:** one width (3.5 m) everywhere; the network is otherwise unchanged.

### 4W.9 Risks

- **A gridded look:** streets are straight lines on a 20 m grid. Corners are rounded and slopes
  favor contour arms, but it is a grid city. That suits the dense core in the reference, and is the
  user's choice.
- **Steep seeds:** few arms are allowed on steep land, so the city may be small there. That is
  honest to the terrain; stairs (4R.7) can add links later.
- **Contradictions:** the extended loop rule and Rule 2 are checked only at collapse, so they can
  dead-end the solver; restarts and the fallback handle it.

---

## 6. Districts: the building map

**What it is:** an internal map of *what kind of cyberpunk district belongs where*, built from the
terrain and the street network, and the **lots** buildings will stand on. No building geometry yet:
the building stage later only has to read a lot's district and density and place a building.

**The districts (chosen 2026-10-09)** are six, from the common cyberpunk city types (Night City,
Blade Runner's Los Angeles, Kowloon Walled City), each placed by a terrain rule:
- corporate core;
- neon entertainment strip;
- megablock housing;
- industrial and docks;
- wealthy enclave;
- parks.

Slums, market and old town were left out. Nothing is tunable: every number is a constant, as for
the streets.

### 6.1 Fields, per 2 m cell (the hubs grid)

| Field | How it's made | Used for |
|---|---|---|
| **Access** | Distance from the plaza *along the streets*: a multi-source Dijkstra over road cells from the plaza, then plus the straight distance from a cell to its nearest road cell | Core, neon strip, density |
| **Frontage** | Nearest road cell: its distance, its direction, and whether it is an avenue (a `main` street) | Neon strip, which way a lot faces |
| **Buildable** | Not road, river, bank or plaza; slope under 20°; within 30 m of a road | Where districts and lots may go |
| **Height rank** | Each buildable cell's height as a percentile of all buildable cells (0 lowest, 1 highest) | Docks low, enclave high |
| **River distance** | From the claims stage | Docks |
| **Exit distance** | Distance to the nearest avenue exit at the diorama's edge | Docks (goods leave the city) |
| **Density** | 0–1: the district's base density, scaled by `1 − 0.5 · access / span` | Building height later |

### 6.2 The districts (first match wins)

| # | District | Rule | Base density | Buildings later |
|---|---|---|---|---|
| 1 | **Parks** | Not buildable (too steep, too far from a road), **or** a slow noise patch (about 10% of the buildable land, never in the core) | 0 | Trees and forest (area scatter), later hologram trees |
| 2 | **Corporate core** | Access ≤ 45 m from the plaza | 1.0 | Megatowers, a landmark tower, giant billboards |
| 3 | **Industrial / docks** | Within 30 m of the river **and** in the lowest 35% of buildable ground; or within 30 m of an exit | 0.35 | Wide low halls, warehouses, cranes, tanks, chimneys, piers |
| 4 | **Neon entertainment strip** | Within 14 m of an avenue, access ≤ 120 m | 0.75 | Mid-rise blocks with stacked neon signs, shops and bars at street level |
| 5 | **Wealthy enclave** | Highest 20% of buildable ground, access ≥ 80 m, and at least 40 m from industrial | 0.3 | Villas, gardens, sleek low towers, few signs |
| 6 | **Megablock housing** | Everything else buildable | 0.6 | Stacked apartment boxes, balconies, AC units, laundry |

**Clean-up:**
- **Smoothing:** two majority passes (3 × 3 cells) smooth the edges.
- **Small regions:** any district region smaller than 400 m² joins the neighbor it shares the most
  border with, so districts read as areas, not speckles.

**Debug colors (Show districts):**

| District | Color |
|---|---|
| Corporate core | Cyan |
| Neon strip | Magenta |
| Megablocks | Violet |
| Industrial | Amber |
| Wealthy | Pale gold |
| Parks | Green |

### 6.3 Lots

The streets now run on the 20 m tile grid, so blocks are rectangles and lots are cut along straight
block edges.

1. **Walk each street, both sides:**
   - cut the frontage, behind the verge, into lots of the district's width, with a seeded ±15%
     variation and a 1 m alley gap between neighbors;
   - each lot is a rectangle aligned to the street, its front on the verge, its depth from the
     district.

   | District | Lot width | Lot depth |
   |---|---|---|
   | Corporate core | 16 m | 16 m |
   | Neon strip | 8 m (narrow shopfronts) | 10 m |
   | Megablocks | 10 m | 12 m |
   | Industrial | 20 m | 20 m |
   | Wealthy | 14 m | 14 m |
   | Parks | no lots | |
2. **A lot is dropped** if:
   - it overlaps the river, a road, the plaza, a park or another lot;
   - it leaves buildable cells;
   - its ground spans more than 2 m (4 m for megablocks, which stack down the slope).
3. **The district at the lot's center decides its size.** Where a lot would straddle two districts,
   it takes the district of its front.
4. **Record:** each lot stores its id, corners, front direction, district, density, area and ground
   range. Its columns are claimed `lot`, with a lot-id map per column.
5. **Back lots (2026-10-12):** the free district land the street lots leave (block interiors,
   corners, land behind the outer streets) is packed with grid-aligned rectangles reached by
   alleys:
   - each is the district's lot size, either way round or 60% wide, at least 6 m a side;
   - every lot, street or back, keeps a 1 m alley from every other lot;
   - the same ground-step limit applies;
   - **access (2026-10-12):** a 1 m alley must run straight over free ground, within 30 m, to a
     road, verge, plaza or an earlier alley. Each way out is tried from the middle of that side
     and along both flanks of the lot (inside the 1 m gap it keeps anyway). An alley never steps
     more than 0.5 m (along it, across it, or onto the way it meets) or rises more than 0.75 m in
     2 m. Of the alleys that work, the one using the least buildable ground wins, then the
     shortest. It is claimed `alley` (so no later lot blocks it, and later back lots branch off
     it), and the lot faces it. A lot with no way out is not placed, and the scan skips 2 m on. This follows alley-served blocks in
     procedural favela generators and the access rule in Vanegas et al. 2012 (every parcel
     needs street access) and CityEngine's `forceStreetAccess`.
   - Street lots must touch their verge (on curves, rounding could leave a sliver).
   Stair streets through large blocks (4R.7) are left for later.

**Debug views:** Show lots draws each lot's outline in its district's color, with a tick on its
front edge.

### 6.4 The panel

There are no settings. The Town section gains two view switches:
- **Show districts:** a ground tint by district, with a legend, applied in the shader with no
  rebuild, like Show claims;
- **Show lots:** lot outlines.

A note shows each district's share of the buildable land and the number of lots.

### 6.5 How to know it worked (7 seeds)

- **Every district appears** on most seeds: industrial needs low ground by the river or an exit,
  and wealthy needs high ground away from the core. Each appears on at least 5 of 7 seeds.
- **Shares of buildable land, roughly:**
  - core 10–20%;
  - neon 10–20%;
  - megablocks 30–50%;
  - industrial 10–20%;
  - wealthy 5–15%;
  - parks at least 10%.
- **Lots:**
  - no lot overlaps a road, the river, the plaza or another lot;
  - every lot's front is on a verge;
  - lots cover roughly 20–35% of the land.
- **Determinism:** the same seed gives the same districts and lots.
- **Speed:** the districts stage takes under 100 ms. It runs after the mesh, so it never remeshes.

### 6.7 Built: 5a and 5b (2026-10-09)

**The code:**
- `terrain/districts.ts`: the `districts` stage, after the mesh, so it never rebuilds the ground.
- **Show districts:** a shader tint from a per-cell texture, with a legend and shares; no rebuild.
- **Show lots:** translucent filled lots in their district's color, with outlines and a tick on
  the street side.
- **Show claims** now includes `lot`.

**Changes from 6.1–6.3, each found by measuring:**
- **Access thresholds are shares of the buildable land**, not meters:
  - core is the nearest 15%;
  - the neon avenue frontage reaches the nearest 60%;
  - wealthy is the farther half.

  The tile streets wind, so the median access is 160–210 m, and "within 45 m" was a sliver.
- **Neon also forms an inner ring:** within 10 m of any street in the nearest 35%, not only along
  avenues, which are short on some seeds. Every road cell beside an avenue's center line counts as
  avenue: a street spans two cells.
- **Docks** reach 50 m from the river, on the lower 50% of ground (were 30 m and 35%).
- **Cells:**
  - a cell is road only if at least half of it is paving;
  - verge counts as free;
  - buildable needs half the cell free.

  Before this, every cell beside a street was unbuildable.
- **Buildable slope is 30°,** read on the ground *before* the streets were carved. The cut and fill
  slopes beside streets are where buildings go, and this terrain is hilly.
- **Small regions** merge under 100 m² (was 400). Neon strips and docks came in pieces smaller than
  400 m², and the merge erased them.
- **Lots:**
  - a lot's district is read 5 m in from its front;
  - a lot that doesn't fit tries 60% of its width;
  - lots may span 6 m of ground (megablocks 10 m), as the building stage will terrace them;
  - a quick check of the corners and middle comes before testing every column.

**Measured on 7 seeds** (shares of buildable land):

| Seed | Core | Neon | Megablocks | Industrial | Wealthy | Parks | Lots | Lot cover |
|---|---|---|---|---|---|---|---|---|
| u2uyer | 14% | 9% | 48% | 7% | 7% | 15% | 40 | 17% |
| 8ahsrz | 15% | 12% | 51% | 7% | 2% | 13% | 31 | 20% |
| blueprint | 14% | 11% | 53% | 3% | 8% | 11% | 72 | 25% |
| harbor | 13% | 17% | 42% | 12% | 0% | 17% | 15 | 18% |
| myg654 | 14% | 10% | 53% | 8% | 2% | 13% | 29 | 15% |
| neon | 13% | 17% | 41% | 14% | 5% | 10% | 38 | 23% |
| kowloon | 14% | 14% | 54% | 5% | 1% | 11% | 22 | 13% |

- **Met:**
  - core, neon, megablocks and parks hit their targets;
  - no lot touches a road, the plaza, the river or another lot;
  - the same seed gives the same result.
- **Not yet met:**
  - **Industrial** is 3–14% (target 10–20%) and gets almost no lots: its low riverside land lies
    away from the streets.
  - **Wealthy** is 0–8% (target 5–15%), with few lots.
  - **Lot cover** is 13–25% of district land (target 20–35%).
  - **Speed:** the stage takes 120–300 ms (target 100 ms); lot placement is most of it.

**Denser lots (2026-10-12).** Street lots alone covered 13–25% of district land: each is one
fixed-depth row behind its street, and lots fail where the streets turn. A first try deepened each
street lot toward the middle of its block, which barely helped (14–27%): the tile streets are 20 m
apart, so most blocks are only about 13 m deep between verges. Back lots (6.3, item 5) replaced it,
and street lots now keep a 1 m alley from each other too (before, lots from crossing streets
touched at block corners).

| Seed | Street lots | Back lots | Lot cover (non-park district land) | Stage |
|---|---|---|---|---|
| blueprint | 69 | 126 | 50% | 139 ms |
| harbor | 14 | 45 | 52% | 72 ms |
| myg654 | 24 | 103 | 48% | 89 ms |
| u2uyer | 41 | 133 | 55% | 109 ms |
| 8ahsrz | 45 | 89 | 54% | 105 ms |
| neon | 39 | 81 | 55% | 85 ms |
| kowloon | 22 | 107 | 50% | 75 ms |

- no lot touches another lot, a road, a verge, the plaza or the river;
- the same seed gives the same lots;
- the stage got faster (it was 120–300 ms): a summed-area table tests each back lot at once.

**Access for every lot (2026-10-12).** Back lots had no way to the street. With the alley rule,
every lot on the 7 seeds now reaches a street, directly or through alleys (checked by a flood fill
from the paving through the alleys). Cover dropped to 39–52%, since lots with no way out are not
placed; alleys take 400–1,100 m² per seed. The stage takes 111–256 ms (over the 100 ms target).

**Alleys that fit the ground (2026-10-12).** The first alleys ran straight up cliffs, took long
ways when a shorter one existed, and cut through land a lot could use. With the grade limit, the
flank routes and the cost rule above, on the 7 seeds: every lot still has access; no two
neighboring alley columns differ by more than 0.5 m; alleys take 104–507 m²; cover is 34–50%; the
stage takes 113–234 ms.

**Cities: Skylines lots and painted districts (2026-10-12, the user's call).** Alleys doubled up
beside each other, and districts came in many small pieces. Following Cities: Skylines, where
buildings spawn only on zone cells (8 m, up to 4 deep) that reach a road, and districts are painted
areas:
- **Back lots and alleys are gone.** Every lot fronts a street. The street walk cuts each side into
  lots of whole 8 m zone cells (the district's width, give or take one; fewer where a full one
  doesn't fit). A lot starts 6 m deep and deepens a meter at a time to the district's depth (3–4
  cells) while the street straight behind the block is farther than the lot is deep, so facing
  lots meet halfway; cross streets at a block's ends don't stop it.
- **Corner lots:** a second pass packs the frontage the walk leaves (rounded corners, short runs)
  with grid-aligned rectangles, at least 6 m a side, each fronting a verge along at least half its
  narrower side.
- **Lots may use any district ground that isn't park;** the ground-step limit keeps them off steep
  land. Before, a district patch merged over steep ground looked built up but could take no lots.
- **Districts as areas:** three majority passes within 8 m over the buildable cells, then regions
  under 1,500 m² join a neighbor; a region reaches across a street, so a district on both sides of
  one counts as one area.

| Seed | Lots | Cover | District areas (smallest) | Shares (core/neon/mega/ind/wealthy/parks) | Stage |
|---|---|---|---|---|---|
| blueprint | 110 | 33% | 3 (1,868 m²) | 16/6/59/0/0/19 | 247 ms |
| harbor | 19 | 26% | 2 (1,808 m²) | 0/19/44/0/0/37 | 158 ms |
| myg654 | 36 | 20% | 3 (292 m²) | 15/0/65/0/0/20 | 106 ms |
| u2uyer | 92 | 34% | 5 (1,788 m²) | 15/11/53/7/9/6 | 185 ms |
| 8ahsrz | 80 | 41% | 3 (1,668 m²) | 16/9/64/0/0/11 | 173 ms |
| neon | 85 | 39% | 4 (1,740 m²) | 15/11/57/10/0/7 | 166 ms |
| kowloon | 45 | 26% | 3 (2,548 m²) | 14/16/58/0/0/11 | 111 ms |

- every lot touches its verge or street; no two lots touch;
- **the cost:** cover is lower than with back lots (34–50%): block interiors past half a street's
  reach and the outskirts stay empty, as in Cities: Skylines; industrial and wealthy are absorbed
  on most seeds by the smoothing.

**Whole districts, counted parks, a central core (2026-10-12, the user's call).**
- **Parks:** each seed picks 2 to 6 parks (was 8% of the land), each 1,500–3,000 m². Each grows
  from the best-scoring spot (steep or hilly ground plus slow noise) outside the core, starts at
  least 40 m from the others and keeps 4 m from them; a pocket too small for half its size is
  skipped for the next spot. Parks never merge with anything.
- **Core:** the 15% of land nearest the plaza in a straight line, but never past 50 m, so it is
  one compact disc on the plaza even when the plaza sits by the river. Smoothing and merging
  leave it alone.
- **Neon:** street frontage in a 20 m ring around the core, plus the avenue strips; it no longer
  appears as scattered inner-ring patches. Smoothing leaves it alone; only specks under 400 m²
  merge.
- **Smoothing** now only settles megablocks, industrial and wealthy; pieces under 2,000 m² merge.
- **Checked on 8 seeds:** the number of parks equals the number picked on every seed (2–6, about
  900–3,000 m² each); one core disc per seed; neon is one band around it. Industrial and wealthy
  still appear only on some seeds.

**Parks out of the districts (2026-10-12, the user's call).** Parks are no longer a district: the
district map holds only the five urban kinds and covers the parks' ground too. Parks are a layer
of their own, claimed `park` in the claim map (so lots keep off them), with their own **Show
parks** switch (fill, stronger edge); Show districts ignores them. Show claims lists them too.
- **The rule:** each seed picks 3 to 6 parks; each grows to 1,500–3,000 m² from the best-scoring
  spot (steep or hilly ground plus slow noise) outside the core; every park keeps at least 25 m of
  ground from every other; a pocket that can't fit half a park is skipped.
- **Checked on 8 seeds:** parks placed equal parks picked on 6 seeds; harbor and 8ahsrz picked 6
  and fit 3 (the 25 m spacing leaves no room for more). The closest two parks are 27–31 m apart;
  no lot is on a park.
- **Smaller and round (same day):** 700–1,400 m² (was 1,500–3,000). A park grows outward from its
  spot, nearest cell first, never past 1.1× the radius of a circle of its size, so a street
  cutting it can't make it wrap around; a spot where less than 80% of the park fits is skipped.
  On 8 seeds: 7 placed every park picked (8ahsrz 4 of 6), 490–1,330 m² each, at least 26 m apart.

**Neon strip → Commercial (2026-10-12, the user's call).** Renamed in the code and the legend
(`DISTRICT.commercial`, the `COMMERCIAL_*` constants), and widened 2×: 28 m back from the street
(was 14 m), in a 40 m ring around the core (was 20 m), plus the avenue strips. On 8 seeds it now
covers 14–42% of the land (was 5–13%); its lots stay 1 cell (8 m) wide, as shopfronts.

### 6.6 Risks

- **Small cities:** on a seed whose city is small (harbor, 16 road tiles), districts may all
  collapse into core and neon. Acceptable; it reads as a downtown.
- **No low land by the river:** industrial then comes only from the exits. With no exits it can be
  missing. Acceptable on a few seeds.
- **Wealthy next to industrial:** the 40 m gap keeps them apart. If the high ground is all near
  industry, there is no enclave.

## 7. Scatter

Two kinds, each a list of **layers**. Every layer has its own seed, and it draws its random
numbers in the same order whatever its rules say, as in Week 5. So changing one setting never
reshuffles the rest.

### 7.1 Along paths (sampled along the curves)

| Layer | Rule | Defaults |
|---|---|---|
| **Lamps** | Every *Spacing* along each road, alternating sides, on the verge; around each plaza's rim | 12 m on roads, 8 m on plaza rims |
| **Street trees** | Main streets only, both sides, on the verge, with a Chance per spot | every 9 m, 70% |
| **Fountain** | The center plaza | one |

Each spot is skipped if it isn't on a verge or plaza rim (another road, the river, a plaza
interior). Lamps face the road.

### 7.2 Over areas (density maps)

**Candidates** come from Bridson's Poisson disk with the layer's spacing, kept with probability
`density × noise patches × rules`:

| Layer | Spacing | Where | Notes |
|---|---|---|---|
| **Forest** | 3 m | grass, dirt; district None or Park; ≥ 2 m from roads | Density **rises with slope** until rock cliff, then 0: the forest covers what the town can't use (the reference's green cliffs). Parks get a lighter, rounder mix. |
| **Bushes** | 1.5 m | grass; district None or Park, or the verge edge | Low ground, gentle slope |
| **Rocks** | 2 m | rock, steep dirt | Size grows with slope |
| **Reeds** | 0.75 m | bank, and grass next to river water | Dense clumps |

**Variation per copy:**
- **Size:** each layer's size ± its Size variation.
- **Rotation:** a seeded turn around the vertical.
- **Tint:** from the ground under the copy (lighter and yellower higher up, as in Week 5) plus a small jitter.

Copies sit on the center of their column's flat top. Voxel tops are flat, so the notes' "align to
the surface" doesn't apply here.

**Panel:** an **Asset** dropdown picks the layer, then its controls (Week 5's pattern):
- On, Spacing, Density, Size, Size variation;
- the layer's own rules.

A Result line shows candidates, placed copies, and how many each rule rejected.

### 7.3 Assets: small voxel models

Each asset is a few boxes built with `VoxelBatch`, in meters, so the scale is right at 0.25 m per
voxel. There are two or three variants each, chosen per copy:

| Asset | Size (voxels) |
|---|---|
| Round tree | trunk 0.5 × 2 m, blocky canopy about 3 m (2 × 12 × 12-ish, layered) |
| Tall tree (conifer) | stepped tiers, 5–7 m |
| Bush | 1 × 0.75 m |
| Rock | 1–2 m chunks |
| Reeds | 0.25 m blades, 1–1.5 m tall |
| Lamp | 0.25 m post, 4 m, a glowing head (emissive, ready for night) |
| Fountain | 4 m basin, a glowing water column |

**Rendering:** one `InstancedMesh` per asset variant, with a per-instance color for the tint.
The print material needs one change for instances: the print clamp tests the instance's own
height (`instanceMatrix[3].y`), so whole copies appear as their layer prints. Shadows on.

---

## 8. The panel

New collapsible sections, after River, all closed by default:

| Section | Controls | Defaults |
|---|---|---|
| **Town** | Show network · Show claims (no settings: the hubs are automatic) | off · off |
| **Streets** | Main streets · Exits · Main width · Street width · Max grade · Slope cost · Reuse · Embankment · Plaza size | 4 (3–5) · 2 · 6 m · 3.5 m · 15% · 8 · 0.6 · 2 m · 10 m |
| **Town (districts)** | Show districts · Show lots (no settings: the district rules are fixed) | off · off |
| **Scatter** | Asset ▾ · (that layer's controls) · Show claims | Forest |

---

## 9. Build order (each step ends with something to see)

1. **Claims and distance fields.**
   - Keep the river's distance field; add the claim map and the Show claims view.
   - *See:* the river and its bank tinted; nothing else claimed yet.
   - **✔ Done 2026-10-08.**
     - **Code:**
       - `terrain/claims.ts` is a new stage after the river (no parameters). It claims the
         channel and a one-column bank (the same columns as the Bank surface) and measures the
         distance to the channel for every column.
       - `terrain/distance.ts` is a shared chamfer transform. It covers the whole map instead of
         keeping the river's capped distance field.
     - **Show claims** (Town section) tints the ground from a 928 × 928 claim texture in the
       ground shader. Turning it on or off rebuilds nothing. A legend lists the claims made so far.
     - **Checked on 3 seeds:**
       - the bank claim matches the Bank surface exactly;
       - river columns are at distance 0 and bank columns at distance 1;
       - with the river off, nothing is claimed and every distance is Infinity;
       - the stage takes about 30 ms.
2. **Hubs.**
   - Suitability, the center, the hubs and the exits; the Town section; Show network with the heat map.
   - *See:* the center on flat ground by the river on every seed, and hubs spreading outwards.
   - **✔ Done 2026-10-08.**
     - **Code:** `terrain/hubs.ts`, the `hubs` stage (group `town`), after claims.
       - **Height and slope** come from each 2 m cell's mean height on the river-carved ground, so
         valley floors count as flat and single terrace steps average out.
       - **Same bank:** hubs stay on the center's bank (a flood fill over cells that never enters
         the channel).
     - **Changed from the plan:**
       - **River term:** S uses `0.4 + 0.6 · river` instead of `river`. With the plain Gaussian,
         ground 50 m from the river scored about 0, so only 2–4 of 7 hubs fit.
       - **Town size:** it is a hard radius (default 80 m), not only a weight. Before, hubs landed
         up to 211 m out.
       - **Exits** move to step 4, with the main streets.
     - **Panel:** the Town section has Hubs, Hub spacing, Town size, River distance and Max hub
       slope, plus Show network and Show claims.
       - **Show network** pins every hub (the center large and white) and tints the ground by
         suitability, violet to amber, with no rebuild.
       - **A note** says how many hubs were placed.
     - **Checked on 6 seeds:**
       - the center is 5–11 m from the river, with suitability 0.84–0.96;
       - 6–7 hubs, all within 80 m and at least 35 m apart;
       - every hub is on the center's bank;
       - without a river, 7 hubs on the flattest low ground;
       - the stage takes 10–40 ms.
   - **Redesigned the same day: one megacity, no settings.** The user asked for one city instead of
     separate settlements, and for no hub settings (the Town section keeps only Show network and
     Show claims).
     - **How it works now:** one center, buildable cells, and junction sites spread outwards with
       a block size of 26 → 46 m (section 3).
     - **Checked on 6 seeds:**
       - the center is 5–11 m from the river;
       - 14–28 junctions, covering 24–48% of the land as buildable;
       - the city reaches 150–239 m;
       - the nearest junction is about 32 m away downtown and about 44 m on the outskirts;
       - the stage takes 13–58 ms.
3. **One street.**
   - A* from the center to the farthest hub; simplify, curve, profile, carve; road surfaces;
     plazas at both ends.
   - *See:* a street that climbs in switchbacks instead of straight up, never steeper than Max grade.
   - **✔ Done 2026-10-08.**
     - **Code:** `terrain/streets.ts`, the `streets` stage after hubs. Voxelize now takes the
       streets' carved height map, and surfaces read the streets' claim map.
     - **No settings** (the user prefers fixed rules): street width 6 m, max grade 15%, slope cost 8,
       embankment 2 m, verge 1.5 m, center plaza radius 9 m.
     - **The street:** it runs from the center to the farthest junction that can be reached. This
       is a placeholder for the main-street rule, which comes with step 4 (one per sector).
       - **Routing:** A* reads cell heights blurred over about 10 m, so it follows the broad land,
         and the carve flattens single terrace steps.
       - **Off limits:** cells under 4 m from the channel.
     - **Shared code:** `distanceToCurve` moved into `path.ts`, shared by the river and the streets.
       The river's output is byte-for-byte the same.
     - **Surfaces:** new `road`, `curb` (road edge) and `plaza` surfaces, in cold grays with no
       tone patches, so they merge into few faces.
     - **Overlay:** Show network draws the street's center line, and the claims legend adds Road,
       Verge and Plaza.
     - **Checked on 6 seeds:**
       - a street is found on every seed, 239–416 m long, winding 1.4–2.6 × the straight line;
       - it never touches the channel;
       - the cuts are at most 4.9 m and the fills 2.9 m;
       - the continuous profile stays within 15%; over 4 m of street, whole-voxel rounding adds at
         most one 0.25 m step (20%);
       - the stage takes 26–54 ms.
   - **Fix (same day): the street was wobbly.** Two causes: the route is a staircase of 2 m
     cells, the one-cell simplification kept most of its kinks, and the curve reproduced them; and
     the search had no reason not to zig-zag around small bumps. Now:
     - **Turning costs extra** in A*: the state is a cell plus the direction it was entered from,
       and a turn adds `1.5 · (turn / 90°)²` cells of cost (Galin's curvature term).
     - **String pulling** replaces Douglas–Peucker: from each kept point, jump straight to the
       farthest later route point whose straight line stays on open cells and within 15%. Bends
       survive only where the land needs them, such as switchbacks.
     - **A bug, found on the way:** a street passing back near the plaza snapped to the plaza
       level. Only its opening stretch is pinned now.
     - **Result:** long straight runs and steady bends. The grade is unchanged (20% over 4 m,
       rounding only). The stage now takes 40–180 ms: tracking direction makes the search bigger,
       so step 4, with many streets, will need it faster.
   - **Changed (same day, the user's call): main streets go direct, and the plaza is a big square.**
     - **Main streets take the shortest way:** slope no longer steers them; only the river (and 4 m
       around it) is off limits. String pulling then makes them straight lines.
       - **Profile:** the broad ground, smoothed, pinned level with the plaza at the start and to
         the junction's real ground at the end, held within 15% by a pass out and a pass back.
       - **Carve:** the street cuts through hills and is built up over dips. Embankments widen with
         depth: 1 m of slope per meter of cut or fill, from 2 m to 10 m.
       - **Side streets (step 4):** slope-aware routing is kept for them.
     - **The center plaza is a 36 m square** on the voxel grid, twice the old 18 m circle. It sits
       as near the city center as fits, with its whole border at least 2 m from the channel and on
       the city's bank, so it moves 13–22 m off the center.
     - **Checked on 6 seeds:**
       - every main street is straight (winding 1.00), 121–216 m long;
       - it meets its junction's ground within 0.3 m;
       - its grade is within 15% (19% over 4 m with voxel rounding);
       - cuts reach up to 10 m and fills up to 6 m;
       - no change to the river water;
       - the stage takes 50–100 ms.
   - **Plaza 24 m with a curb (same day).** The plaza square shrank from 36 m to 24 m, so it now
     only moves 7–14 m off the center to clear the river. Its edge is a curb ring: plaza columns
     that border unpaved ground use the curb surface, and the ring stays open where a street comes
     in (26–30 columns, about the 6 m street).
   - **Raised curbs (same day).** The streets stage now marks curb columns (paving, street or plaza,
     that borders unpaved ground) and raises them one voxel; the curb surface reads that same map.
     On 3 seeds about 94% of curbs stand exactly one voxel above the paving beside them. The rest
     (0 or 2) sit where a sloping street steps by a voxel right beside the curb.
   - **American English (same day, the user's request)** for all code, UI text and plans:
     `voxelise.ts` → `voxelize.ts`, centre → center, colour → color, metres → meters, kerb → curb,
     neighbour → neighbor, and so on.
4. **The whole network.**
   - 3–5 main streets by sector, with exits; then the Gabriel-graph streets; reuse; widths by
     tier; plazas; the Streets section.
   - *See:* 3–5 main streets fanning out from the center plaza, a branching network between them;
     Main streets and Reuse visibly change it.
   - **✔ Done 2026-10-08.** In `terrain/streets.ts`, with no settings (the user prefers fixed rules).
     - **Main streets:** the seed picks 3–5.
       - **Sectors:** the directions the city covers are split into equal sectors. That is the
         junctions' bearings from the plaza, minus the widest empty gap, which is usually across
         the river.
       - **Route:** each runs straight to the farthest junction in its sector, or to the edge if
         the sector is empty.
       - **Exits:** the 2 whose junctions are nearest the edge carry on to it. An exit is pinned
         only at its start and cuts down to the edge.
     - **Side streets:** a Gabriel graph over the junctions and the plaza (links up to 70 m),
       shortest first.
       - **Routing:** slope-aware, 3.5 m wide.
       - **Dropped:** if the two ends differ in height more than 15% of the length allows, or if
         the route winds more than 1.5× the straight line.
       - **Second pass:** links that would join two separate parts of the city are retried with
         any winding, so the network is always one piece.
     - **Shared rules:**
       - routing reuses roads (cells holding a street cost 40%), and A* uses the full
         distance-to-goal estimate;
       - each side street searches a corridor around its ends;
       - profiles are pinned to the levels at their ends and to any paving laid earlier, which
         cut the steep spots where streets join from 6–14% to 0.4–3.7% of 4 m stretches;
       - main streets are paved first, and the first street to pave a column keeps it.
     - **Plazas:** the 24 m center plaza, plus 12 m squares at the 4 busiest junctions (5+
       planned streets). Curbs are open wherever paving meets paving.
     - **Speed:** the carve works on each street's own box, and its embankment reaches only as
       far as its deepest cut needs.
     - **Checked on 7 seeds:**
       - 3–4 main streets + 2 exits, all reaching the edge;
       - 15–37 side streets and 5 plazas;
       - one connected network;
       - 5,300–8,900 m² of paving;
       - nothing on the river;
       - the stage takes 260–640 ms.
     - **Known rough spots:**
       - where streets cross at different levels, a few short stretches are steeper than 25%
         (up to about 3.7% of 4 m windows on the hilliest seed);
       - a few side streets still hairpin on steep ground.

       Smoothing the paving around junctions would be the next fix.
   - **Calmer side streets, no junction plazas (same day, the user's call).** The network looked
     messy: sharp V's, curls, streets weaving into each other.
     - **Junction plazas are gone:** the 24 m center plaza is the only plaza.
     - **Links:** a relative neighborhood graph replaces the Gabriel graph, which keeps fewer
       diagonals. Shortest first, a link that leaves a junction within 35° of a street already
       there (main streets included) is dropped.
     - **Routing:** turn cost 4 (was 1.5), slope cost 3 (was 8), reuse discount 30% (was 60%), max
       winding 1.3 (was 1.5).
     - **The network grows outward from the plaza:** a side street is built only once one of its
       ends is connected.
       1. The planned links, following the terrain.
       2. Any neighbor link that reaches a part not yet connected, routed the shortest way and
          carved like a main street.
       3. The planned links whose ends were both already connected, which close the loops.

       This makes the network one piece by construction. It replaces the earlier second pass,
       which let some pairs of streets end up cut off.
     - **Checked on 7 seeds:**
       - one connected network;
       - 8–37 side streets;
       - steep stretches (over 25% across 4 m) 0.07–1.2% of the streets;
       - the stage takes 140–410 ms.
4R. **Street network redesign** (section 4R.9): R1 direction field, R2 skeleton, R3 growth, R4
   levels and carve, R5 clean-up and checks.
4W. **Street network, third design** (section 4W.8): W1 solver, W2 terrain, W3 tiles to
   streets, W4 overlay and checks.
5. **Districts and lots** (section 6).
   - **5a. Fields and districts.** Access, frontage, buildable, height rank, river and exit
     distance, density; the six district rules; smoothing and small-region merging; Show
     districts with its legend.
     - *See:* a corporate core around the plaza, neon strips along the avenues, docks on low ground
       by the river, a wealthy enclave on the high ground, megablocks filling the rest, parks on
       the steep land.
   - **5b. Lots.** Lots along every street by district size; the drop rules; the `lot` claims and
     lot-id map; Show lots.
     - *See:* rows of lots facing the streets, narrow neon shopfronts, wide industrial lots, with
       alleys between.
   - **5c. Checks.** The 6.5 numbers on 7 seeds; the plan updated.
6. **Scatter along paths.**
   - Voxel assets, instancing, print support; lamps, street trees, the fountain.
   - *See:* lit streets, and a plaza with a fountain.
7. **Area scatter.**
   - Poisson disk, density and rules for forest, bushes, rocks and reeds; the Scatter section and its Result line.
   - *See:* green slopes and parks, empty lots waiting for buildings, reeds on the banks; no copy
     on a road, a lot or in the river.
8. **Bridges.**
   - Let A* cross the channel at a Bridge cost. A crossing becomes a deck at bank height (its own
     geometry, claimed as `road`), so the town can grow on both banks.
   - *See:* at least one bridge on most seeds.
9. **Check and tune.**
   - Five seeds, timings, README with screenshots.

---

## 10. How to know it worked

- **The town starts by the river on every seed:** the center plaza is within about 20 m of the
  channel. A seed without a river still gets a sensible center.
- **No road breaks its limits:** no road exceeds the max grade or touches the channel (outside
  bridges).
- **Main streets:** there are always 3–5 including the riverside boulevard, spread around the
  plaza's sides.
- **The street network reads like a city:** the 4R.8 numbers (junction angles, no stray
  crossings, block sizes, connected).
- **Districts are plausible:**
  - every district appears on most seeds;
  - lots never overlap roads, the river or each other;
  - every lot faces a road;
  - buildable lots cover roughly 20–35% of the land.
- **No copy sits where it shouldn't:** nothing on a road, a plaza interior, a lot or in the river.
  Forest covers the steep ground, the town area is clear.
- **The same seed gives the same town**, and changing a scatter setting never moves the streets.
- **Speed:** hubs plus streets under about 150 ms, districts under about 50 ms, scatter under
  about 100 ms, at about 90 fps.

## 11. Risks

- **Deep valleys:** in a narrow, deep valley the river banks may be too steep for a center. The
  fallback is the flattest ground within 40 m of the river.
- **Unreachable exits:** an exit beyond a cliff is dropped instead of forcing a road.
- **Street-network risks:** see section 4R.10.
- **Lots on curved roads:** rectangles on the outside of a bend fan apart and leave wedges; on the
  inside they collide and get dropped. Acceptable at first; later, lot width can follow the
  curvature.
- **Instancing and the print shader:** the print clamp is in object space today; step 5 starts by
  checking that it works for instances.
