# Cozy "Off-Grid" Builders: Research Notes

**Games covered:** Townscaper · Town to City · Tiny Glade
**Compiled:** September 30, 2026

> **Naming and scope notes**
> - The game is officially **Tiny Glade** (singular).
> - "Off-grid" means different things here. **Townscaper still uses a grid**, just an irregular, organic-looking one. **Town to City** and **Tiny Glade** are genuinely gridless.

---

## Contents

1. [Research 1 — Mechanics, algorithms, gameplay & assets (Townscaper, Town to City)](#research-1--mechanics-algorithms-gameplay--assets)
   - [Townscaper](#townscaper)
   - [Town to City](#town-to-city)
   - [Side-by-side comparison](#side-by-side-comparison)
2. [Research 2 — Aesthetics, style, asset detail & design (Town to City, Tiny Glade)](#research-2--aesthetics-style-asset-detail--design)
   - [Town to City: the voxel diorama](#town-to-city-the-voxel-diorama)
   - [Tiny Glade: the procedural storybook](#tiny-glade-the-procedural-storybook)
   - [How the two aesthetics differ](#how-the-two-aesthetics-differ)
3. [Takeaways for building something in this space](#takeaways-for-building-something-in-this-space)
4. [Sources](#sources)

---

## Research 1 — Mechanics, algorithms, gameplay & assets

### Townscaper

**Developer:** Oskar Stålberg · **Publisher:** Raw Fury · **Released:** PC/Mac June 2020, Switch August 2021, mobile October 2021 · **Engine:** Unity

#### Gameplay loop

Stålberg describes Townscaper as more of a toy than a game. There are no objectives. The player can do only a few things:

- add a block,
- remove a block,
- choose the colour of the blocks they place,
- plus camera, lighting and sun-angle tweaks.

Everything else is generated. Game Developer calls this a **mixed-initiative system**: the player decides *where* the structure grows, and the system reads the resulting shape, works out which prebuilt pieces of architecture fit, and inserts them.

Many emergent behaviours are deliberately undocumented and left for players to discover. For example, enclosing a plaza with buildings grows a garden with trees and bushes, and birds settle on rooftops and scatter when you build nearby.

#### The algorithm stack

Townscaper combines systems from three earlier Stålberg projects:

| Component | Origin | Role in Townscaper |
|---|---|---|
| Irregular quad grid | *Night Call* (Paris city tool) | Organic, non-rectilinear building footprints |
| Wave Function Collapse (WFC) | *Bad North* (island generator) | Chooses which tile modules fit the player's shape |
| Marching-cubes-style tiles | *Brick Block* prototype | Fits modular tiles into irregular cells |

Game Developer reports that combining them took about three months, from early prototype to working implementation.

##### Step 1 — Build the irregular grid

1. Start with hexagon-shaped chunks, each filled with equilateral triangles. The grid is infinite, but it is assembled chunk by chunk.
2. Randomly merge pairs of triangles into quads. Some triangles stay unmerged.
3. Subdivide every face: each triangle becomes 3 quads and each quad becomes 4. The result is a mesh made only of quads.
4. Relax the mesh (smooth vertex positions) so it looks organic.

According to Boris the Brave's Sylves tutorial, the real Townscaper grid uses a more efficient relaxation scheme than typical recreations, and its relaxation rule favours squarish cells.

**Why all-quads matters:** the tile system below needs four-cornered cells. Subdivision guarantees that, while still letting the overall grid look irregular.

Stålberg's underlying insight was that any mesh can be converted to quads. So hand-authored, standardised square tiles can be deformed onto an irregular topology. In Night Call he found that tiles could be skewed quite heavily before anyone at street level noticed.

##### Step 2 — Corner-based tiles (marching cubes)

- Building state is stored on **grid corners (vertices)**, not on cells.
- Each cell reads its corner states and selects the matching tile. In 3D this gives 2⁸ = **256 possible configurations** per cube, reduced by symmetry to a smaller canonical set.
- Tiles are therefore **corner segments**, not whole building chunks. They snap together to fill cells of any shape.
- Hobbyist recreations model custom tile meshes in Blender and label each with the empty/full neighbour pattern it fits. **Cage-based deformation** (trilinear interpolation of the tile's unit-cube coordinates onto the irregular cell's corners) then warps each tile into its cell.

##### Step 3 — Wave Function Collapse, adapted for real time

WFC is a **constraint solver**. Think of Sudoku: each cell could hold many values, but adjacency rules restrict which values can sit next to each other.

- **Where the rules come from.** In Bad North, tiles modelled in Maya were scanned on import into Unity, and adjacency rules were derived from their edge profiles.
- **Two passes: solve, then decorate.** When the player places a piece, WFC first solves which modules are valid in each affected cell, and only afterwards decorates them. Any add or remove makes the connected structure re-check its constraints.
  - This is why detail sometimes appears a moment *after* the block itself.
  - It is also why that delay grows on big builds: one edit ripples through the whole connected area.
- **Failing silently.** Bad North restarted a generation whenever it failed. Townscaper instead ignores cells where no perfectly matching modules exist. This is most visible in steel support structures, because WFC handles long, thin forms (walls, pipes, supports) poorly.

##### Step 4 — Decoration and "recipes"

- **Decorations** are small-scale patterns that look at the free space around a block and place props (windows, chimneys, benches, bushes, laundry) against its surfaces.
- **Windows** are cut out of the mesh with a **stencil buffer** rather than baked into tiles. This avoids windows being sliced in half or landing on corners.
- **Recipes** are special set pieces hidden deep in the WFC with much higher priority. Players can discover them, but they are predictable enough to reproduce on purpose.
  - *Example: gardens.* Garden modules have very high priority, but their only valid edge is against a wall. So they can appear only inside a fully enclosed, flat area, and the rule works at any scale.
  - The low stone walls inside gardens vary. They appear at house corners or where house colours change, which suggests property boundaries.

**Core design principle (Stålberg):** the player should feel in control of the *large* shapes, while the *small* shapes are free to vary.

#### Assets and presentation

- **Tile count.** Stålberg estimates that reskinning the game would mean building roughly **500 tiles**.
- **Architectural reference.** He chose a Scandinavian vernacular (Copenhagen, Stockholm, Aarhus): colourful, but not heavily ornamented. Heavier ornament looks cluttered and aliases badly when zoomed out. Keeping it slightly abstract also lets players imagine their own detail.
- **Ambient life.** Simple AI birds and butterflies anchor to nearby objects, occasionally fly around them, and react to local geometry.
- **Rendering.** Tuned to reduce aliasing so outlines stay crisp at any angle or distance.
- **Audio.** Ambient wind and waves, plus sound feedback on every edit.
- **Export.** Towns can be exported as `.obj` files, which the community uses for 3D printing.
- **Scale and price.** Stålberg set the original grid limit by building the largest thing he could imagine and doubling it. Players still asked for more, and a later update enlarged it. He priced the game low because he expected sessions of around an hour.

---

### Town to City

**Developer:** Galaxy Grove (Utrecht, NL; makers of *Station to Station*) · **Publisher:** Kwalee · **Early Access:** September 16, 2025 · **1.0 release:** May 26, 2026 · **Price:** $29.99 · **Soundtrack:** Paul Aubry

#### Core loop

- **Money is the main resource.** There is little traditional resource micromanagement.
- **The train station is both your supply line and your growth trigger.** New citizens arrive only by train, and how often they arrive depends on overall happiness.
- **Goods flow:** train → warehouse → stalls and shops, and stalls must be within range of the homes they serve.
- **Labour is one shared pool:**
  - shops need workers to serve residents,
  - warehouses need workers to move goods,
  - the Research Center needs workers to generate research points.
- **Growth threshold:** new families arrive only while total average happiness is **at or above 60%**.

#### Progression

| Stage transition | What it introduces |
|---|---|
| Village → Small Town | Demand for leisure |
| Small Town → Town | New citizen class: **Artisans** |
| Town → City | Demand for public services |
| City → Large City | **Bourgeoisie**, which must be researched. Goal: house 25 of them at 60% average happiness |

Other progression systems:

- **Population milestones** unlock new tiers, such as second stories on houses and road upgrades.
- **New areas / towns** restart the build while keeping earned upgrades. They introduce farming and crop management, and later tourism, all linked by trade and travel routes.
- **Road upgrades** (dirt → brick) look better *and* extend how far warehouses can transport goods.
- **Other features:** terraforming (elevation, water, terrain), hundreds of decorations, photo and first-person modes, pets and livestock, heat maps, campaign and sandbox modes.

#### Gridless building

- Buildings can be placed **at any angle, anywhere**, and roads are drawn like pen strokes.
- For players who want order, there is a **straight-line tool** and a **snap-to-road helper**.
- **Context-sensitive decorations** are the standout system. The same flower item can become a window box, a hanging garland, or lily pads depending on where you place it.

#### Known friction points (from reviews)

- Painting roads is less precise than grid-based placement, and "straight" roads can end up slightly crooked.
- Some players were frustrated by limited terrain editing and by an economy that can feel punishing when new buildings need more citizens to staff them.
- There is no map editor (noted at 1.0).

#### What isn't publicly documented

Galaxy Grove hasn't published a technical breakdown of its gridless placement or voxel pipeline, unlike Stålberg or Pounce Light. The following is **inference from observed behaviour, not confirmed fact**:

- Roads are probably spline or brush strokes that define connectivity and service range.
- Buildings are most likely **authored voxel models** placed freely, not generated procedurally.
- The decoration system probably picks an item's form from its surface context (wall, water, ground). That would be a lighter-weight relative of Townscaper's approach.

---

### Side-by-side comparison

| | Townscaper | Town to City |
|---|---|---|
| **Grid** | Irregular, relaxed quad grid | Truly gridless (snapping optional) |
| **Player input** | Place/remove block, pick colour | Roads, buildings, decorations, terraforming, job assignment |
| **Generation** | WFC + marching-cubes corner tiles | Authored voxel assets + context-sensitive decorations |
| **Simulation** | None | Happiness, labour, logistics, classes, research |
| **Goals** | None ("a toy") | Campaign stages + sandbox |
| **Session shape** | Short, meditative | Long, management-driven but low-pressure |

---

## Research 2 — Aesthetics, style, asset detail & design

### Town to City: the voxel diorama

#### Overall style

- Reviewers describe it as **Lego and Minecraft in miniature**, so large towns read like intricate desktop dioramas. Because it doesn't chase realism, the style should age well.
- The **palette is rich and saturated**, drawing on Mediterranean colour.
- The **setting** is a romanticised 19th-century Mediterranean, with lush landscapes and elegant architecture.

#### Light and camera

- Reviewers single out the **warm lighting across the day/night cycle**, including tree shadows and warm sunlight.
- **Depth of field** gently blurs the background when zoomed in, which focuses attention and adds to the miniature feel.
- A **first-person camera** lets you walk among the villagers, and **photo mode** is a featured system.
- Players can place their own lighting.

#### Asset design

- **Buildings use curated variants, not free painting.** There are relatively few building types, but each has preset variations with built-in colour choices. You can't custom-paint a house.
- **The richness comes from the decoration layer.** Flower pots, trees, and lights change shape and attach to buildings depending on where they are placed.
- **Road material doubles as a progression marker.** Upgrading a road overwrites its previous look with a uniform white surface, which some players dislike.
- **Voxel citizens** visibly walk the streets, which makes towns feel inhabited up close.

#### Weak spot

Up close, the angular voxels can be harder to read. The style is tuned for the zoomed-out diorama view.

---

### Tiny Glade: the procedural storybook

**Developer / publisher:** Pounce Light (two-person Swedish studio: Anastasia Opara, Tomasz Stachowiak) · **Released:** September 23, 2024 · **Price:** $14.99 · **Tech:** modified Bevy ECS (Rust) with a custom Vulkan renderer

#### Design philosophy

- Pounce Light describes it as a **small diorama builder** for doodling whimsical castles, cozy cottages, and romantic ruins. There is **no management, combat, or goals**.
- **Inspirations:** Opara cites *Townscaper*, *Unpacking*, and *A Little to the Left*, and compares their warmth to the feeling after a Ghibli film.
- **Role of the developers:** Stachowiak compares it to handing a child LEGO bricks and staying out of the way once they are in the zone. Tools were judged by *how many stories they let players tell*.
- **Origin:** the game began as Opara's weekend project for learning rendering, a procedural wall generator. The team found that watching walls rearrange themselves was satisfying in itself, and that became the core of the game.

#### How assets are made — mostly generated, not placed

This is the biggest difference from Town to City. Almost nothing is a static prop.

- The game **assembles every brick, pebble and plank** as you build.
  - Draw a path through a building and a **door appears**.
  - Raise a building and **columns and beams line up** to support it.
- There is **no single master algorithm**. There are many generators, each with its own pipeline to create, assemble, morph, or deform one kind of element.
- **Windows** automatically chip the surrounding plaster for an aged look. This is driven by a **single float vertex attribute that stores signed distance to the nearest window**.
- **Building gluing:** separate buildings can be merged into one castle, with roof controls to hide the seams.
- **Procedural tower roofs** include a small tile-jumping animation when a tower is raised quickly.
- **Design grew from playtesting.** Bridges weren't planned, but player demand led to a full system for elevating buildings, which turned the terrain-bound design into a real 3D one. Players stacking stairs to imitate machicolations led to proper machicolation support.

#### Deliberate imperfection

- Even critics who were lukewarm on the game describe the handmade look: carefully mossed stone, chimneys that always smoke, slightly crooked picture-book structures, and a pastel, low-detail palette (PC Gamer).
- **Controlled randomness:** extending a wall might turn a plant pot into a bench or another prop. Reviewers describe learning to go along with these happy accidents.
- **Post-launch updates handed that control to players:**
  - auto-placed clutter can be moved, rotated, deleted, and cloned,
  - the light limit rose from 32 to 32,768, with adjustable lantern intensity,
  - a stair, ladder and platform tool, cobblestone roads, and new floor textures,
  - a slider for how much plaster peels off buildings,
  - Steam Workshop support and a macOS version.

#### Rendering as art direction

- **Engine:** Bevy's ECS is kept for game logic, but the renderer is custom **Vulkan**, because the game needed heavy compute-shader work and GPU-side procedural generation that Bevy couldn't provide at the time.
- **Global illumination:** diffuse GI uses **software ray tracing**, so it runs on older and low-end GPUs. Stachowiak previously led Embark's *kajiya* real-time GI project.
  - Lighting is stored as **spherical harmonics** and **denoised** in post-processing.
  - Each part of the GI is only as accurate as the art style needs, which keeps it fast. Digital Foundry showed it running at 60 fps on a GTX 1060, rendering at 900p and upscaling.
- **Windows and interiors:** two **parallax planes** suggest curtains and a blurry interior. Reflections combine **screen-space reflections** with software ray tracing.
- **Depth of field:** the tilt-shift, macro-lens style DoF is a big part of why everything reads as a diorama.
- Stachowiak's talk *Rendering Tiny Glades With Entirely Too Much Ray Marching* (Graphics Programming Conference, Breda) covers the full stack, including shadow-acne fixes, GI, DoF, and GPU-driven rendering.

#### Mood controls

- **Glade themes** change the environment, season, weather, vegetation, and the **colour palette available for buildings**.
- Players can set the **time of day** on a 24-hour clock and **rotate the site** to change where shadows fall.
- **Living details:** ivy climbs buildings, sheep wander paths, ducks swim in ponds, sunsets flare with colour, and fireflies appear at night.
- **Every action has an animated undo and redo.** There are no failure states.
- **Daily prompts** (a bakery, an alchemist's shop, a church) give players a starting idea.

---

### How the two aesthetics differ

Both games aim for the **tabletop-diorama** feel through warm light, depth-of-field blur, and an emphasis on photo mode. They get there in opposite ways:

| | Town to City | Tiny Glade |
|---|---|---|
| **Base medium** | Authored voxel models | Procedurally generated meshes (brick by brick) |
| **Palette** | Rich, saturated Mediterranean | Soft, pastel storybook |
| **Source of charm** | Density, colour, lively citizens | Handmade imperfection: moss, crookedness, wear |
| **Variation** | Preset building variants + context-aware decorations | Generators react to every stroke; randomness tamed by later updates |
| **Lighting emphasis** | Warm day/night cycle, player-placed lights | Software ray-traced GI, SH encoding, dramatic sunsets |
| **Readability need** | High, because it's a simulation game | Low, because it's pure expression |
| **Up-close weakness** | Angular voxels harder to parse | Limited control over fine details (at launch) |

---

## Takeaways for building something in this space

1. **Large shapes predictable, small shapes free.** Stålberg's rule underpins all three games. Players should feel they own the silhouette, while the system adds the detail.
2. **Make the moment of change the reward.** A door appearing, a garden forming, a flower turning into a window box: the satisfaction comes from the world visibly reacting to one input.
3. **Spend your technical budget where your genre needs it.**
   - *Townscaper* put it into a constraint solver plus a carefully authored tileset.
   - *Tiny Glade* put it into dozens of bespoke generators plus custom GI.
   - *Town to City* put it into simulation, with lighter procedural decoration on top.
4. **Gridless doesn't have to mean structureless.** Townscaper shows that an *irregular* grid can look organic while keeping modular, hand-authored tiles. That is often more practical than a fully freeform system.
5. **Expect to add player control later.** Tiny Glade's clutter and lighting updates, and Town to City's snapping tools, show that players eventually want to override the procedural "happy accidents."

---

## Sources

**Townscaper**
- Tommy Thompson, *How Townscaper Works: A Story Four Games in the Making* (Game Developer, interview with Oskar Stålberg): https://www.gamedeveloper.com/game-platforms/how-townscaper-works-a-story-four-games-in-the-making
- Boris the Brave, *Townscaper Grid* (Sylves tutorial): https://boristhebrave.com/docs/sylves/1/articles/tutorials/townscaper.html
- John Wigg, *Creating an organic grid on a sphere*: https://john-wigg.dev/SphereScaper/
- kai-denrei, *oskar-procedure: dual grid & tile deformation notes*: https://github.com/kai-denrei/oskar-procedure/blob/main/docs/03-dual-grid-and-tiles.md
- @exppad thread on reproducing Townscaper in Unity: https://threadreaderapp.com/thread/1261950965189672961.html
- Wikipedia, *Townscaper*: https://en.wikipedia.org/wiki/Townscaper
- Stålberg talks: *Organic Towns from Square Tiles* (IndieCade Europe 2019), *The Story of Townscaper* (Konsoll 2021), *Beyond Townscaper* (Sweden Game Arena 2021), *Wave Function Collapse in Bad North* (EPC 2018)

**Town to City**
- Steam store page: https://store.steampowered.com/app/3115220/Town_to_City/
- Wikipedia, *Town to City*: https://en.wikipedia.org/wiki/Town_to_City
- NoobFeed review: https://www.noobfeed.com/reviews/town-to-city-review
- Otaku Study review: https://www.otakustudy.com/video-game/2026/06/town-to-city-review/
- COGconnected preview and review: https://cogconnected.com/preview/town-to-city-preview/ · https://cogconnected.com/review/town-to-city-review/
- Gameluster Early Access review: https://gameluster.com/town-to-city-early-access-review-building-a-dreamy-suburbs/
- Cloud Dosage Early Access review: https://clouddosage.com/town-to-city-early-access-game-review/
- Noisy Pixel preview: https://noisypixel.net/town-to-city-preview-early-access/
- GameIndustry.com review: https://www.gameindustry.com/reviews/game-review/town-to-city-builds-a-cozy-voxel-world-worth-settling-into/
- Thumb Culture review: https://www.thumbculture.co.uk/town-to-city-pc-review
- Gamepressure database entry: https://www.gamepressure.com/games/town-to-city/zc6c2a
- Community guides (progression and mechanics): https://tposegaming.com/town-to-city-guide/ · https://dq7reimagined.com/town-to-city/ · https://intoindiegames.com/walkthroughs/town-to-city-walkthrough-upgrade-city-to-large-city/

**Tiny Glade**
- Steam store page: https://store.steampowered.com/app/2198150/Tiny_Glade/
- 80 Level, *Tiny Glade Developers Discuss Bevy, Proceduralism, Publishers & Cozy Games*: https://80.lv/articles/exclusive-tiny-glade-developers-discuss-bevy-proceduralism-publishers-cozy-games
- 80 Level, procedural windows: https://80.lv/articles/procedural-windows-in-pounce-light-s-tiny-glade-get-an-upgrade
- 80 Level, procedural tower roofs: https://80.lv/articles/a-look-at-procedural-tower-roofs-in-tiny-glade
- 80 Level, gluing buildings together: https://80.lv/articles/this-upcoming-game-lets-you-procedurally-glue-buildings-together
- 80 Level, movable clutter and lights update: https://80.lv/articles/tiny-glade-s-update-with-movable-clutter-multiple-lights-is-here/
- Tomasz Stachowiak, *Rendering Tiny Glades With Entirely Too Much Ray Marching* (GPC talk): https://www.youtube.com/watch?v=jusWW2pPnA0
- Digital Foundry coverage (summary thread): https://hardforum.com/threads/tiny-glade-beautiful-ray-traced-visuals-at-60fps-on-a-gtx-1060.2037236/
- PCGamingWiki: https://www.pcgamingwiki.com/wiki/Tiny_Glade
- PC Gamer review: https://pcgamer.com/games/city-builder/tiny-glade-review
- Shacknews review: https://www.shacknews.com/article/141431/tiny-glade-review-score
- Gameluster review: https://gameluster.com/?p=107947
- SteamDeckHQ, stair tool / cobblestone update: https://steamdeckhq.com/news/tiny-glades-latest-update-fixes-switching-controller-modes-steam-deck/
- Wikipedia, *Tiny Glade*: https://en.wikipedia.org/wiki/Tiny_Glade
