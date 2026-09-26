# Style Guide

The visual rules for every page of the Procedural World Building site (Weeks 1, 2 and 3). The
look is **dark slate with cyan accents**: quiet translucent panels floating over a 3D scene, one
accent colour, and a small set of reusable shapes. When you add or change anything, follow this
guide so the weeks keep feeling like one product.

The values below are the ones in the code today. If you change a value, change it here too.

---

## 1. Principles

1. **The 3D scene is the hero.** Controls float over it as translucent glass cards. They never
   fill the screen and they can always be hidden (press `E`).
2. **One accent.** Cyan means "active, selected, or a live value". Everything else is slate.
3. **Same thing, same look.** A dropdown, slider, switch, panel or heading looks and behaves the
   same in every week. Reuse the shared pieces instead of restyling.
4. **Calm motion.** Panels slide, colours fade, nothing bounces. 150 to 300 ms, ease-in-out.
5. **Plain language.** Short, natural sentences. No jargon without a one-line explanation.

## 2. Where the styles live

| What | File |
|---|---|
| Tailwind config: `page` / `stage` colours, `sans` (Roboto) and `display` (Share Tech) fonts, corner radii | `tailwind.config.js` |
| Tailwind directives plus the base layer (page defaults, slider thumb) | `src/styles.css` |
| Top bar and week tabs | `src/App.tsx` |
| Floating side panel, its toggle button and the `E` shortcut | `src/components/SidePanel.tsx` |
| Shared panel controls for Weeks 1 and 2 (`Section`, `Field`, `FieldNote`, `RangeInput`, `Switch`, `Select`, `PanelButton`, heading and glass-card classes) | `src/components/controls.tsx` |
| Everything else | Tailwind classes inside each week's `.tsx` files |
| Fonts | `@fontsource/roboto`, `@fontsource/share-tech`, imported in `src/main.tsx` |

Every week is styled with Tailwind utility classes; there is no per-week CSS file. Add styling as
classes on the element. `styles.css` only holds what has no element to put a class on (the body
defaults and the native slider thumb pseudo-elements).

---

## 3. Colour

### 3.1 Tokens

The palette is Tailwind's slate and cyan, plus two custom colours in `tailwind.config.js`. The
token names below are the vocabulary used in this guide; use the Tailwind class in code.

| Token | Value | Tailwind | Used for |
|---|---|---|---|
| `--bg-page` | `#070b12` | `bg-page` | The page behind the stage |
| `--bg-app` | `#0a0f17` | `bg-stage` | Stage and 3D scene background |
| `--bg-panel` / `--panel-glass` | `rgba(15,23,42,0.7)` | `bg-slate-900/70` | Panel and card surface |
| `--panel-glass-strong` | `rgba(15,23,42,0.95)` | `bg-slate-900/95` | Sticky strips that must hide scrolling content |
| `--bg-panel-secondary` | `#1e293b` | `bg-slate-800` | Solid input surfaces |
| `--bg-elevated` | `rgba(30,41,59,0.5)` | `bg-slate-800/50` | Buttons and cards sitting on a panel |
| `--border` | `rgba(51,65,85,0.5)` | `border-slate-700/50` | Every border |
| `--text-primary` | `#e2e8f0` | `text-slate-200` | Main text, selected values |
| `--text-secondary` | `#94a3b8` | `text-slate-400` | Headings, labels |
| `--text-muted` | `#64748b` | `text-slate-500` | Hints, disabled, tertiary text |
| `--accent` | `#22d3ee` | `cyan-400` | Slider thumbs, focus, key highlights |
| `--accent-hover` | `#06b6d4` | `cyan-500` | Hover on accent fills |
| `--accent-bright` | `#67e8f9` | `text-cyan-300` | Numeric values, active tab text |
| `--accent-text` | `#a5f3fc` | `text-cyan-200` | Text on an active (cyan-filled) button |
| `--accent-soft` | `rgba(6,182,212,0.2)` | `bg-cyan-500/20` | Active / selected fill |
| `--accent-soft-hover` | `rgba(6,182,212,0.3)` | `hover:bg-cyan-500/30` | Hover on an active fill |
| `--accent-border` | `rgba(34,211,238,0.6)` | `border-cyan-400/60` | Border of an active element |

### 3.2 Colour roles

- **Neutral (default):** slate text on `slate-800/50` with a `slate-700/50` border.
- **Active / selected:** `bg-cyan-500/20`, `border-cyan-400/60`, `text-cyan-200`.
- **Live value:** monospace, `cyan-300`.
- **Info card:** `bg-cyan-500/10` with `border-cyan-400/30` (used for "How it works").
- **Step / attention card:** `bg-amber-500/10` with `border-amber-400/30`, heading `amber-200`.
- **Destructive:** slate by default, `text-red-400` on hover only (for example the bin icon).
- **Disabled:** `text-slate-600`, `border-slate-800/50`, `bg-slate-800/20`, `cursor-not-allowed`.

Do not introduce a second accent colour for UI. Amber, pink, orange and lime exist only as
*data colours inside the 3D scene* (see below).

### 3.3 3D scene colours

| Element | Colour |
|---|---|
| Scene background and fog | `#0a0f17` |
| Bounding box (Week 3) | `#22d3ee` at 20% opacity |
| Ambient light | `#aac4dd` |
| Mesh surface (Week 3 meshing) | `#7fb5d6` steel blue |
| Week 1 default object | `#7fb5d6` |
| Week 1 floor grid | lines `#64748b`, centre `#334155` |
| Week 2 terrain ramp (low to high) | `#0f1e33`, `#155e75`, `#06b6d4`, `#67e8f9`, `#f0fdff` |
| Voxel overlay / inside samples | `#22d3ee` |
| Outside samples | `#8090a8` |
| Surface cells, newest face highlight | amber `#fbbf24` |
| Edge crossings | pink `#f472b6` |
| Surface normals | orange `#fb923c` |
| Cell vertices | lime `#a3e635` |

CSG primitives keep a hue per shape in their icons (cube blue, sphere sky, cylinder violet,
cone emerald, torus amber) so they can be told apart in the tree.

---

## 4. Typography

| Role | Font | Weight | Notes |
|---|---|---|---|
| App title, top-bar tabs | **Share Tech** | 700 | Title `1.15rem`, tabs `0.95rem` |
| Section headings (`h3`, `Section`, `headingClass`) | **Share Tech** | 700 | `14px`, uppercase, `tracking-wider` (0.05em), `slate-400` |
| Week 3 navigation items | **Share Tech** | 700 | `14px`, single line |
| Body text: labels, descriptions, buttons, dropdowns | **Roboto** | 400 / 500 / 700 | Default for the whole page |
| Numbers and hex values | system monospace (`ui-monospace`, SF Mono, Menlo) | 400 | `12px`, `cyan-300`, tabular numbers |

Rules:

- Share Tech only ships a regular weight. The bold is the browser's synthetic bold, so keep it to
  short titles and headings; never set long text in it.
- Headings are `font-display text-sm font-bold` plus their colour and tracking classes. Reuse
  `headingClass` from `controls.tsx` (or the `Section` component) rather than retyping it.
- Uppercase headings are produced with CSS or a class, not by typing capitals in the source.
- To use the display font on something that is not a heading, add `font-display font-bold`.
- Text sizes in panels: `12px` (`text-xs`) for descriptions and buttons, `11px` for hints,
  `14px` (`text-sm`) for dropdown values.

---

## 5. Shape, spacing and depth

### 5.1 Corner radius

Tailwind's scale is set 10% smaller in `tailwind.config.js`.

| Use | Value | Tailwind |
|---|---|---|
| Cards, panels, stages, floating overlays | `14.4px` | `rounded-2xl` |
| Buttons, dropdowns, inputs, top-bar tabs | `10.8px` | `rounded-xl` |
| Small buttons, tree rows, chips | `7.2px` | `rounded-lg` |
| Circles and pills (toggle buttons, switch, slider track) | full | `rounded-full` |

### 5.2 Spacing

- Panel padding `1.25rem` (`p-5`). Space between panel sections `1.5rem` (`gap-6`). Space inside
  a section `0.75rem` (`gap-3`) to `0.875rem`. Tight groups `0.25rem` to `0.5rem` (`gap-1`, `gap-2`).
- Everything floating sits `1rem` (`top-4`, `left-4`, `right-4`) from the stage edge.
- Top bar padding `0.75rem 1.5rem`; page content padding `1rem`.

### 5.3 Borders, blur and shadow

- Border: `border border-slate-700/50`. No thicker borders.
- Glass: translucent slate plus `backdrop-blur-xl` (24px) on cards, `backdrop-blur-md` (12px) on
  small round buttons.
- Shadow: `shadow-2xl shadow-black/40` on cards, `shadow-lg shadow-black/30` on round buttons.

---

## 6. Layout

```
┌───────────────────────────────────────────────────────────────┐
│ Top bar: title (Share Tech)   [Week 1] [Week 2] [Week 3]        │
├───────────────────────────────────────────────────────────────┤
│  ┌───────────┐ (o)                               (o) ┌───────┐ │
│  │ left panel│  3D stage (fills the area)            │ right │ │
│  └───────────┘                                       │ panel │ │
│                       [ bottom control bar ]         └───────┘ │
└───────────────────────────────────────────────────────────────┘
```

- **Top bar.** Translucent slate (`rgba(15,23,42,0.6)`), 24px blur, bottom border. Title left, week
  tabs next to it. Tabs are transparent with a transparent border; hover is `slate-800/60` with
  `cyan-300` text; active is `rgba(6,182,212,0.15)` fill, `rgba(34,211,238,0.3)` border, `#67e8f9` text.
- **Stage.** One rounded (`14.4px`), clipped (`overflow: hidden`) region that fills the rest of the
  page. The canvas covers it. Clipping matters: it is what hides a closed side panel.
- **Side panels.** Floating cards on the left or right, all built with `<SidePanel>` (section 7.1).
  Width `16.2rem` (259px) for every settings panel and the Week 3 navigation.
- **Overlays.** Small cards floating over the stage use the same glass card: Week 2's erosion
  player (top right) and 2D noise map (bottom right), Week 3 tab 01's bottom control bar
  (bottom centre, `36rem` wide, `rounded-3xl`).

---

## 7. Components

### 7.1 Side panel (`src/components/SidePanel.tsx`)

The single shared panel. Use it for any new panel; do not hand-roll another.

```tsx
<SidePanel side="right" open={open} onToggle={toggle} widthRem={16.2} label="settings panel">
  {sections}
</SidePanel>
```

- Card: `rounded-2xl border border-slate-700/50 bg-slate-900/70 shadow-2xl shadow-black/40 backdrop-blur-xl`.
- Height fits its content and scrolls past `100% - 2rem`.
- Toggle button: `40px` circle, `top-4`, chevron pointing at the panel edge when open, an icon
  (default sliders; menu for navigation) when closed. Open, it sits `8px` outside the panel's inner
  edge so it never covers content; closed, it returns to the corner.
- Slides fully out of view in `300ms ease-in-out`. The stage's `overflow: hidden` clips it.
- Press **`E`** to toggle every panel at once (see section 9).

### 7.2 Section heading

Share Tech, 700, 14px, uppercase, `slate-400`, tracking `0.05em`. Icon (if any) is `14px`, `slate-500`.
Sections are always open. There are no collapsible section headers.

### 7.3 Field: label, value, slider

```
LABEL                          0.40      <- uppercase label (12px, slate-400) + mono value (cyan-300)
━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━             <- track 6px, thumb 12.8px
```

- Week 3: `SliderField` (`label`, `value`, `min`, `max`, `step`, `onChange`).
- Weeks 1 and 2: `<Field label description valueLabel>` wrapping a `<RangeInput>` (the label shows
  its description as a hover tooltip). Week 1's geometry parameters use `ParamRow`, whose value is
  an editable text input.
- Optional one-line hint under it: `<FieldNote>` (`11px`, `slate-500`).

### 7.4 Slider

Track `h-1.5 rounded-full bg-slate-700 accent-cyan-400` (`RangeInput` in Weeks 1 and 2). Thumb
`12.8px` circle, `cyan-400`, no border, set once in the base layer of `styles.css`; never restyle it
per component.

### 7.5 Dropdown (select)

`rounded-xl` (10.8px), `border-slate-700/50`, `bg-slate-800/60`, `px-3 py-2`, `14px`, text
`slate-200`, focus border `cyan-400/50`, no outline. Weeks 1 and 2 use `<Select>`, which draws a
chevron icon `12px` from the right edge (`compact` is the small overlay variant). Week 3 tab 01
draws the same chevron; its other panels still use the native one.

### 7.6 Switch (checkbox)

`2.25rem x 1.25rem` pill, off `#334155`, on `rgba(6,182,212,0.7)`, `1rem` white-slate knob, 200 ms
slide. `<Switch>` inside `<Field inline>`, used in Week 1 for on/off options.

### 7.7 Buttons

| Kind | Classes |
|---|---|
| Neutral | `rounded-xl border border-slate-700/50 bg-slate-800/50 text-slate-300 hover:bg-slate-700/60` |
| Active / primary | `border-cyan-400/60 bg-cyan-500/20 text-cyan-200` (hover `bg-cyan-500/30`) |
| Disabled | `cursor-not-allowed border-slate-800/50 bg-slate-800/20 text-slate-600` |
| Icon (row action) | `24px` square, `text-slate-400`, `hover:text-slate-200`; destructive icon `hover:text-red-400` |
| Round toggle | `40px` circle, `bg-slate-900/70 backdrop-blur-md`, `hover:text-cyan-300` |

- Button text is `12px` and `font-medium`. Selected buttons stay the same size; only colour changes.
- Choice groups (mode, transform mode, tabs) are equal-width buttons in a grid; the selected one
  uses the active style. Two-button nav rows (Back / Next) use equal columns with a centred
  indicator in the middle.
- Sticky primary button (Week 1 Randomize) sits on a solid `#0f172a` base so scrolling content
  never shows through the translucent cyan.

### 7.8 Cards inside panels

| Card | Look |
|---|---|
| Info ("How it works") | `rounded-xl border-cyan-400/30 bg-cyan-500/10 px-3 py-2.5`, body `12px slate-300` |
| Step / attention | `rounded-xl border-amber-400/30 bg-amber-500/10`, title `text-sm amber-200`, body `12px slate-300` |
| Stats | `rounded-xl border-slate-700/50 bg-slate-800/40`, monospace `12px`, labels `slate-500`, values `cyan-300` right aligned |

### 7.9 Tabs

- **Top-bar tabs:** section 6.
- **Panel tabs** (Week 2 Noise / View): two equal `rounded-xl` buttons in a sticky strip, active
  style as above.

### 7.10 Tree rows (Week 3 CSG)

Row: `rounded-lg border pr-1 text-xs`, `bg-slate-800/50`. Selected: active cyan style; inspected:
`slate-700/60` with a `slate-400/60` border. Icon and name on the left, eye toggle and (top-level
shapes only) bin icon on the right. Children are indented under a `slate-700/50` left border.

---

## 8. Motion

| Thing | Duration | Easing |
|---|---|---|
| Panel slide and toggle button move | 300 ms | ease-in-out |
| Colour, border and background changes | 150 ms | ease |
| Switch knob, chevrons | 150 to 200 ms | ease |
| Press feedback on primary button | 100 ms, `translateY(1px)` | ease |

Do not animate layout size or height. Slide, fade or recolour instead.

---

## 9. Interaction

- **`E`** toggles all side panels together: if any is open, all close; if none is open, all open.
  Ignored while typing in a text box or focusing a dropdown, and with Ctrl, Cmd or Alt held.
- Toggle buttons expose `aria-label` and a tooltip such as "Close settings panel (E)".
- **Undo / Redo** in the CSG lab: `Ctrl/Cmd + Z`, `Ctrl/Cmd + Shift + Z`.
- 3D views use orbit controls: drag to orbit, scroll to zoom, right-drag to pan.
- Icon-only buttons need a `title` and `aria-label`.

---

## 10. Icons

Inline SVG, no icon library. `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, stroke
width `1.8` to `2`, round caps and joins. Size `16px` (`h-4 w-4`) in buttons and toggles, `14px`
next to headings, `14px` (`h-3.5 w-3.5`) for row actions. Icons take their colour from the text
colour; only CSG primitives carry their own hue.

---

## 11. Writing the interface text

- Sentence case for buttons and descriptions; headings are uppercased by style.
- Short and natural. Say what a control does and what changes, in one or two sentences.
  Good: "Turn this off to put every vertex at its edge's midpoint, so the surface snaps to coarse positions."
- **No em dashes in descriptions or hints.** Use a full stop, comma or colon. (Tab and page names
  keep the `01 — Title` format.)
- British spellings are used in the copy (neighbours, centre, bevelled). Keep it consistent.
- Numbers show with a fixed number of decimals so they do not jump (`0.40`, `2.4`).

---

## 12. Adding a new week or view

1. Create `src/weeks/weekNN-name/` and register it in `src/weeks/registry.ts`.
2. Wrap your stage in `relative min-h-[480px] flex-1 overflow-hidden rounded-2xl`, with the scene
   mount inside it as `absolute inset-0 bg-stage` (see Week 1's `index.tsx` and `Scene3D.tsx`).
3. Put controls in `<SidePanel>`; do not build a new panel.
4. Build fields from `src/components/controls.tsx`, or with the Tailwind recipes in section 7. Do
   not add a CSS file.
5. Colour the 3D scene from section 3.3: `#0a0f17` background and fog, cyan for emphasis, one
   surface colour.
6. Add screenshots to the week's `screenshots/` folder and a README process log.

---

## 13. Known gaps

Things that do not yet match the rules above, in rough priority order:

1. **Week 3 controls** are hand-written Tailwind rather than the shared `controls.tsx` components.
   The look matches, but moving Week 3 onto them would keep all weeks in step automatically.
2. **Week 3 dropdowns** (tabs 02 and 04) still use the native arrow; everywhere else draws the chevron.
3. **Week 3 CSG panel headings** are numbered sentence-style (`1. Voxel Volume Inputs`) while other
   headings are uppercase labels. They share the font, size and weight but not the case.
4. **Numbers** use the system monospace. Share Tech Mono would match the heading font better.
5. **Week 2 panel tabs** (Noise / View) are Roboto; the top-bar tabs are Share Tech.
6. **`index.html`** loads the `Press Start 2P` and `Unica One` Google fonts. Nothing uses them yet;
   remove them or adopt them here.
7. **Old screenshots.** The Week 1 and Week 2 READMEs still show the previous purple theme.
