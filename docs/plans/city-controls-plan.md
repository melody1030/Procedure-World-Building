# Plan: rework Blueprint City's controls with patterns from the Component Gallery

## Context

Blueprint City (`/world`) has three pieces of interface today:

- **The left panel** (`world/ui/TerrainPanel.tsx`, built from `world/ui/kit.tsx`): title, seed,
  six collapsible sections (Noise, Shaping, Terraces, River, Surfaces, Town) and *Reset to defaults*.
- **The print bar** (`world/ui/PrintBar.tsx`): play/pause, a scrubber split into the six build
  phases, a native speed `<select>`, and a status text.
- **The rebuild note**: a pill at the top of the view while the city rebuilds.

The Week 9 critique (`docs/analysis/week09-feedback.md`) asked for:
- click on a person, bird or vehicle to see its state (why it is stuck, where it is going);
- building info;
- navigation, and preset cameras for recording the important moments;
- a tutorial and navigation tool.

This plan picks patterns from [The Component Gallery](https://component.gallery/components/) for
each problem below. It changes only the interface; the terrain, city and life code stay as they
are, except for the picking and camera hooks named in §4.

The new pieces live in `world/ui/kit.tsx` and keep the blueprint look (navy glass, cyan for what
you can touch, amber for values). **No new dependency:** each pattern is small enough to write
in Tailwind like the rest of the kit. The same pieces can be copied into `river-site/` later.

---

## 1. What is wrong today

| # | Problem | Where |
|---|---|---|
| 1 | One panel mixes **making** the city (Noise … Surfaces change the terrain and rebuild it) with **looking** at it (Town holds seven view switches that rebuild nothing). The section called "Town" has no town settings. | `TerrainPanel.tsx` |
| 2 | Four overlays tint the same ground (network suitability, districts, lots, claims). They are independent switches, so two can be on at once and paint over each other. | Town section |
| 3 | Every explanation is a hover tooltip on the label (`cursor-help`). It never shows on touch or keyboard, and some are five lines long (Show life). | `Row` in `kit.tsx` |
| 4 | A closed section gives no sign that something inside it was changed, and Reset is all or nothing. | `Section`, Reset button |
| 5 | The six phase segments of the timeline have no names until you hover, and you cannot jump to a phase. The speed is a native select. | `PrintBar.tsx` |
| 6 | You cannot click anything in the city to learn about it, though every agent already records its `activity`, `since` and `why`. | `WorldView.ts`, `life/agents.ts`, `life/traffic.ts` |
| 7 | There are no camera presets, no help, and the `E` shortcut (hide the panels) is never shown. | — |

---

## 2. Components chosen

| Need | Component | Gallery page | Reference to look at |
|---|---|---|---|
| Split "make" from "look" (1) | **Tabs** | [tabs](https://component.gallery/components/tabs/) | Radix Primitives Tabs, GOV.UK Tabs |
| Keep the build sections collapsible (1, 4) | **Accordion** (exists as `Section`) | [accordion](https://component.gallery/components/accordion/) | Carbon Accordion |
| Show how many settings changed in a closed section (4) | **Badge** | [badge](https://component.gallery/components/badge/) | Primer CounterLabel |
| One ground tint at a time (2) | **Segmented control** | [segmented-control](https://component.gallery/components/segmented-control/) | Radix Toggle group, Carbon Content switcher |
| Layers drawn on top (buildings, life …) | **Toggle** (exists as `Switch`) | [toggle](https://component.gallery/components/toggle/) | — |
| Explanations you can find (3) | **Tooltip** beside the panel | [tooltip](https://component.gallery/components/tooltip/) | Primer Tooltip |
| Name and jump to the build phases (5) | **Progress indicator** (steps) | [progress-indicator](https://component.gallery/components/progress-indicator/) | Carbon Progress indicator |
| Playback speed (5) | **Segmented control** | [segmented-control](https://component.gallery/components/segmented-control/) | — |
| Inspect a person, animal, vehicle or building (6) | **Popover** in a **Card**; **Drawer** on phones | [popover](https://component.gallery/components/popover/), [card](https://component.gallery/components/card/), [drawer](https://component.gallery/components/drawer/) | Radix Popover, Material bottom sheet |
| An agent's needs (6) | **Progress bar** (meter) | [progress-bar](https://component.gallery/components/progress-bar/) | — |
| The agent's state (6) | **Badge** | [badge](https://component.gallery/components/badge/) | — |
| Camera presets, help, hide UI (7) | **Button group** (toolbar) with **Tooltip**s | [button-group](https://component.gallery/components/button-group/) | Figma-style vertical toolbar |
| Keyboard shortcuts (7) | **Modal** | [modal](https://component.gallery/components/modal/) | — |
| First-visit tour (7) | **Popover** steps with a **Progress indicator** | [popover](https://component.gallery/components/popover/) | — |

**Considered and not used:**
- **Stepper** (nudger) for whole-number settings: the slider already shows the default tick.
- **Combobox** for the seed: a seed is free text. A list of recent seeds could come later.
- **Drawer** for the main panel: `SidePanel` already slides.

---

## 3. The new layout

```
┌──────────────────────┐                                         ┌───┐
│ ← Home               │                                         │ ⌂ │ Overview
│ Blueprint City       │                                         │ ◎ │ Plaza
│ [Seed blueprint ][🎲]│                                         │ ≈ │ River
│ ┌ Build ┬ Layers ┐   │          (the diorama)                  │ ⌖ │ Street      
│ │       └────────┘   │                                         │ ⊙ │ Follow selected
│ ▸ Noise          (2) │                       ┌──────────────┐  ├───┤
│ ▸ Shaping            │                       │ Person · walk│  │ ? │ Help & shortcuts
│ ▾ River          (1) │                       │ "thirsty"    │  │ ◐ │ Hide UI (E)
│   Width   ━━━●━━  3m │                       │ 12 s         │  └───┘
│   Depth   ━●━━━━  1m │                       │ thirst ▓▓▓░  │
│ ▸ Terraces           │                       │ [Follow] [×] │
│ ↺ Reset all          │                       └──────────────┘
└──────────────────────┘
        ┌─────────────────────────────────────────────────────────┐
        │ ▶  ●───●───●───●───○───○   Growing streets · 5/6   [½|1|2|4] │
        │    Terrain River Water Plaza Streets Buildings            │
        └─────────────────────────────────────────────────────────┘
```

---

## 4. Details

### 4.1 Panel: Tabs, *Build* and *Layers*

- The title and seed stay above the tabs: they belong to both.
- **Build** holds Noise, Shaping, Terraces, River, Surfaces: everything that rebuilds the
  terrain. A future "Town" section goes here only once it has real settings.
- **Layers** holds everything that only changes what is drawn (see 4.2).
- The tabs follow the ARIA tabs pattern: `role="tablist"`, arrow keys move between tabs, and the
  open tab is remembered in `localStorage` (wrapped in try/catch).

### 4.2 Layers tab: one Segmented control, then Toggles

- **Ground color** is a segmented control (`role="radiogroup"`) with four options:
  `None · Districts · Claims · Suitability`. Under it, the legend of the chosen option (the
  existing `Legend`), with the share of each district when Districts is chosen.
- **Drawn on top** is a list of toggles: Streets (network lines and junctions), Lots, Parks,
  Buildings, Life, River path. Each one keeps its one-line count note when on
  (e.g. "420 people, 150 pigeons, 8 cats").
- **Render change:** `WorldView.setNetworkVisible` turns on both the street lines and the
  suitability tint (`uShowSuit`). Split it into `setNetworkVisible` (lines only) and a new
  `setGroundTint("none" | "districts" | "claims" | "suitability")`, which replaces
  `setShowDistricts` and `setShowClaims`. In `state.ts`, the separate `show*` flags for the tints
  become a single `groundTint` value.

### 4.3 Hover explanations beside the panel

- Hovering a setting's name (shown with a help cursor) shows its explanation in a bubble just
  right of the panel, level with the row, so it never covers the panel's controls. Reaching the
  control with the keyboard shows it too, and Escape hides it.
- There is no ⓘ icon. (Milestone 1 first tried a click-to-open toggletip behind an ⓘ, then a
  hover bubble under the row; both were dropped.)

### 4.4 Accordion with Badges

- The section header shows a cyan count badge, e.g. `(2)`, when that many settings in it differ
  from the defaults.
- There is one reset, *Reset all*, at the end of the panel (a per-section reset was tried and
  dropped: two reset buttons in a row read as a duplicate).

### 4.5 Timeline: Progress indicator and speed control

- Each phase's stretch of the scrubber is as long as the phase takes, so the thumb moves at a
  steady pace. Under each stretch its step is named, starting where the stretch starts:
  `Terrain River Water Plaza Streets Buildings`. The bar is 44rem wide so the shortest name
  (Plaza, 7% of the time) still fits. (Equal-width stretches were tried, but they made the thumb
  speed up and slow down from phase to phase.) Done steps are cyan, the current one is white,
  later ones are gray.
- Clicking a step plays the build from the start of that phase (watching a phase is more useful
  than pausing before it).
- When the bar is too narrow for any name to fit its stretch (measured, not a fixed
  breakpoint), the steps give way to one line naming the current step ("Streets · 5/6").
- The speed `<select>` becomes a four-option segmented control: `0.5× 1× 2× 4×`.
- The status text ("Growing streets · 5/6") is gone: the steps show the phase, the scrubber's
  `aria-valuetext` says it to screen readers, and the rebuild note at the top covers
  "Generating…".

### 4.6 Inspector: Popover card, Drawer on phones

- **Picking** (built in `render/select.ts`): a click with no drag (under 4 px of movement, so
  orbiting does not count) casts a ray. Each agent is tested as a sphere round its middle,
  padded to at least 5 px on screen so a pigeon can be hit; each building by its bounds. The
  nearest hit in front of the ground wins, and an agent at a building's face beats the building.
  `WorldView.setSelectHandler` tells React; `WorldView.select(null)` clears it. (Instanced-mesh
  `instanceId`s were the first idea, but the meshes are rebuilt and reordered, so indices into
  the Life arrays are steadier.)
- **The card** sits beside the clicked thing and follows it each frame. It flips to stay on
  screen. On screens under 640 px it becomes a bottom drawer instead.
- **Contents for an agent:**
  - kind and name ("Person 132", "Bus · route 2");
  - a badge with `activity` (and `motion` for people);
  - the `why` sentence, in quotes;
  - `since` as "for 12 s";
  - for people, four small meters for `needs` (thirst, rest, social, home), with the current
    `need` highlighted;
  - for vehicles, the task and the next stop.
- **Contents for a building:** library type and category, district, size and height, and lot
  size. (Streets have no names yet, so "the street it faces" is left out.)
- The contents refresh four times a second, not every frame; only the card's position moves
  every frame (set directly on the element, outside React).
- **Actions:**
  - **Follow** moves the camera to trail the agent (see 4.7): it flies there keeping the view's
    direction if nothing stands between, else the nearest clear side, then moves with it, still
    free to orbit and zoom (not pan). Selecting another agent while following flies over to it;
  - **×** closes, as do Escape and clicking empty ground.
- **Highlight:** the selected agent gets a ring on the ground so it can be found in a crowd.
- The card refreshes about 4 times a second, not every frame, to keep React out of the render
  loop.

### 4.7 Camera toolbar: Button group with Tooltips

- A vertical toolbar is pinned to the top right with these presets (keys `1`–`5`):
  - **Overview**: the default view of the whole diorama;
  - **Plaza**: 95 m out and 36° up, looking down on the plaza paving and the Landmark's base
    (`streets.plazas[0]`);
  - **Park**: 43° up into the park with the most in it (a full park before a flower garden),
    40–60 m out depending on its size, close enough to see its people, benches and trees;
  - **River**: a long look up the river at a point a little past halfway down it, 108 m out
    and 27° up from downstream, turned 25° off the river's line (matched to a view set by hand
    on seed km8gt7);
  - **Street**: down a street from 70 m past one of its ends and 27 m up, on the line of its
    last stretch, looking back along it 21.5° down (matched to a view set by hand on seed km8gt7).
    It takes the first clear one of: the main streets, then the other streets (longest first);
    the end away from the plaza first; the camera at its full distance, then closer (85%, 70%,
    55%). A pose is clear when no building or hill stands between the camera and the street's end
    and the camera stays over the island. (On blueprint the main streets end at the plaza by the
    island's edge, among the towers, so it looks down a side street instead.)
- Plaza and Park look from whichever of 24 sides has the clearest view: buildings and hills in
  the corridor between the whole place and the camera count against a side, and a side where the
  camera would sit inside a building or a hill is ruled out. Ties go to the overview's side.
  Then each view turns from that side by a set angle, chosen by eye: the plaza 45°
  counterclockwise seen from above, the park 10° clockwise (matched to a view set by hand on
  seed km8gt7). If the turned side is
  blocked, the camera first comes closer (to 85%, 70%, then 55% of its distance), then tries the
  sides next to it, nearest first and up to 90° off, and takes the first clear one.
- A preset with nothing to show (no river, no streets yet) is disabled. The preset the view is
  at is lit; dragging the view by hand clears it.
- Each preset flies the camera and its target there over 700 ms, easing in and out (the style
  guide's "calm motion"). Grabbing the view mid-flight stops the flight.
- Each button names itself and its key in a tooltip to its left (a speech bubble like the
  panel's), on hover or keyboard focus.
- The toolbar hides with the panels when `E` is pressed. (A visible Hide UI button was tried
  and dropped.)
- **Follow** (key `6`) sits under the presets, past a thin rule. It is disabled until a
  person, pigeon, cat or vehicle is selected, and lit while the camera follows.
- `WorldView` has `flyTo(preset)`, `setViewHandler`, `select`, `setFollowing`,
  `setFollowHandler` and `selectionOnScreen` (for the card to sit beside).

### 4.8 Help: shortcut Modal and first-visit tour (built 2026-11-11)

- **?** (the last button on the camera toolbar, or the `?` key) opens a sheet of shortcuts
  (`ui/Help.tsx`):
  - keys: `E` hide or show the panels; `Space` play or pause the build; `1`–`5` the camera
    places; `6` Follow; `Esc` close the inspector (or the sheet); `?` the sheet;
  - mouse: click to inspect, drag to orbit, right-drag to pan, scroll to zoom;
  - a note on touch.

  It also has a **Take the tour** button. It is a native modal `<dialog>`: the page behind is
  inert, Tab stays inside, Escape and a click on the backdrop close it, and focus goes back to
  what opened it. Keys pressed inside stop there, so Escape doesn't also close the inspector and
  `1` doesn't fly the camera.
- **Space** plays or pauses the timeline from anywhere, except on a control where Space already
  does something (a button, a tab, a checkbox, a text field).
- **Tour** (`ui/Tour.tsx`): on the first visit, a moment after the first build finishes, four
  cards in turn, each with a four-part progress bar and "2 of 4", *Back*, *Next* and *Skip tour*,
  and an arrow pointing at its control. The rest of the page dims and the control stays lit in a
  rounded window (a spotlight; a glowing cyan outline was tried first and looked out of place):
  1. the seed;
  2. the Build tab;
  3. the Layers tab;
  4. "Click anyone in the city", which ends when something is selected.

  The card sits to the right of its control (for the tabs, right of the whole tab row, so it
  doesn't cover the other tab), or below it when there's no room (phones). It opens the panel
  for steps 1–3 and, on a phone, closes it again for step 4. Escape skips the tour. Whether it
  has been seen is remembered in `localStorage` (`world.tourSeen`), so it shows only once.

---

## 5. Files

| File | Change |
|---|---|
| `world/ui/kit.tsx` | Add `Tabs`, `Segmented`, `useHoverTip`, `Tooltip`, `Badge`, `Meter`, `Popover` (positioning only), `Modal`. `Row` uses `useHoverTip`. |
| `world/ui/TerrainPanel.tsx` | Split into `BuildTab` and `LayersTab`; section badges and resets. |
| `world/ui/PrintBar.tsx` | Phase names, click to jump, `Segmented` speed control. |
| `world/ui/Inspector.tsx` *(new)* | The card or drawer for agents and buildings. |
| `world/ui/CameraBar.tsx` *(new)* | Toolbar, presets, keys. |
| `world/ui/Help.tsx` *(new)* | Shortcut modal and tour. |
| `world/state.ts` | `groundTint` replaces `showDistricts`, `showClaims` and the tint part of `showNetwork`; `selected`. |
| `world/render/WorldView.ts` | `setGroundTint`, `setPickHandler`, `flyTo`, `follow`, selection ring. |
| `world/render/life.ts` | `pick(ray)`. |
| `world/index.tsx` | Mount Inspector, CameraBar and Help. |
| `world/README.md` | Log entry with screenshots. |

---

## 6. Milestones

1. **Panel:** Tabs, Layers tab with the ground-color segmented control, hover explanations and badges. Includes the `setGroundTint` render split.
2. **Timeline:** phase names, jump to phase, segmented speed control.
3. **Cameras:** `flyTo`, the toolbar with tooltips, keys `1`–`5`, the visible Hide UI button.
4. **Inspector:** picking, the card and drawer, need meters, selection ring, Follow.
5. **Help:** shortcut modal, tour, Space for the timeline.
6. **Docs:** world README log with screenshots.

Milestones 1–3 can be done in any order. Milestone 4 needs 3 for Follow, and 5 needs 4 for the
last tour step.

---

## 7. Verification

- **Browser** (preview `site`, `/world`):
  - every control works by mouse and by keyboard alone (Tab, arrows, Enter, Escape);
  - no console errors;
  - only one ground tint shows at a time;
  - the badge counts match the changed settings;
  - clicking a person shows a `why` that changes as it moves on, and clicking a bus shows its
    route;
  - the card stays on screen at the edges;
  - each camera preset lands where named, and Follow keeps the agent in view;
  - `E` still hides everything, and the timeline keeps its place.
- **Phone width** (375 px): the inspector is a bottom drawer, the timeline shows one phase name,
  and the toolbar does not cover the panel button.
- **Performance:** frame rate unchanged with Life on and the inspector open (Performance panel).
- **Build:** `npm run build` in `site/`.
