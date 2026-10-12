
*Town to City* (developed by Galaxy Grove and published by Kwalee) is an organic, diorama-style voxel city builder. Unlike traditional grid-aligned or tile-based city builders (like *SimCity 4* or *Anno*), *Town to City* is built around continuous spatial placement, freeform terraforming, and procedural prop adaptation. 

This document analyzes the game’s core mechanics across **terrain manipulation**, **road construction**, **building placement**, **contextual prop systems**, and **environmental rendering**, strictly isolating these systems from the citizen management and economic progression loops.

---

## 1. Terrain & Terraforming Systems

Terrain in *Town to City* acts as a continuous voxel height field that players can dynamically sculpt using brush-based terraforming tools unlocked in the Belvau research tree and sandbox modes.

### 1.1 Sculpting Brushes
* **Raise Terrain:** Extrudes voxel volumes upward to create hills, cliffs, or tiered plateaus.
* **Lower Terrain:** Carves stepped voxel depressions, valleys, and pits into the earth.
* **Flatten Terrain:** Samples the target elevation at the cursor's initial click and pulls or pushes all voxels within the brush radius to that uniform plane, creating level foundations for building clusters.
* **Smooth Terrain:** Blends height disparities between adjacent voxel tiers, easing harsh cliff steps into gentle, walkable gradients.
* **Brush Size & Control:** Scalable radius via hotkeys (`[` / `]`), with support for undo/redo stacks across continuous brushing actions.

### 1.2 Water Generation & Hydrology
* **Add Water:** Floods depressions and trenches up to the current sea/water-table plane, converting sculpted dry trenches into canals, ponds, and lakes.
* **Remove Water:** Drains designated water zones back into dry terrain.
* **Dynamic Surface Reaction:** Water surfaces generate autonomous ambient life (such as jumping fish) and alter the properties of overlapping props and structures.

### 1.3 Span & Elevation Bridging
* Elevated terrain features and waterways can be bridged using specialized bridge primitives:
  * **Variants:** Light Wood, Dark Wood, Stone, Arched Stone, and Metal.
  * **Anchoring:** Bridges snap to opposing cliff-sides or bank heights, automatically extending supports and guard rails down to the water or ravine floor.

---

## 2. Road Network Mechanics

Roads dictate town connectivity and citizen navigation, serving as the foundational anchor points for architectural placement.

* **Spline- & Brush-Based Road Painting ("Draw Roads"):**
  * Roads are painted as continuous ribbon strokes directly onto the terrain surface.
  * The path curves organically without 90-degree grid constraints, forming winding alleys, curved avenues, and open pedestrian plazas.
* **Length Caps & Stroke Chunks:**
  * Road segments have maximum single-stroke lengths to preserve pathfinding stability and prevent spline distortion on irregular slopes.
* **Width & Surface Customization:**
  * Players can adjust road width and apply distinct surface themes (e.g., dirt tracks, cobblestone, paved promenade). Upgrading a road updates connected visual meshes seamlessly.
* **Snapping & Intersections:**
  * Roads automatically bevel and join when intersecting or connecting back to key hubs (such as the central train station).

---

## 3. Building Placement & Spatial Rules

*Town to City* abandons the traditional tile grid in favor of free continuous 3D transforms with proximity rules.

### 3.1 Orientation and Free Rotation
* Buildings can be freely rotated 360 degrees and positioned at arbitrary coordinates.
* **Snap-to-Road:** Buildings detect nearby road edges, offering an optional magnetic snap that aligns the front entrance flush to the roadway curve.

### 3.2 Footprint Buffers & Clearance
* **Inherent Clearance Spacing:** Rather than allowing arbitrary mesh intersection, residential and commercial buildings have a built-in separation buffer. When placing buildings along a curved street, this small gap naturally forms narrow alleys, courtyards, and backyards.
* **Placement Restriction Toggles:**
  * For players seeking pure aesthetic freedom, advanced sandbox toggles allow disabling collision checks, ignoring slope/height placement restrictions, and enabling auto-demolition of blocking minor decorations.

### 3.3 Relocation Without Demolition
* Pressing `M` activates the Move tool, allowing players to pick up, rotate, and reposition any existing structure at will without incurring economic penalties or resetting the structure's identity.

### 3.4 Cosmetic Material Swapping
* Post-placement, building facades, shutters, and roof palettes can be recolored or swapped without affecting the building’s spatial footprint or functional properties.

---

## 4. Adaptive Props & Contextual Micro-Placement

One of the game’s defining technical features is how individual decorative assets adapt to their immediate geometric context.

### 4.1 Morphing Prop Attachments
Rather than requiring separate assets for different surfaces, decorative items inspect the surface normal and environment where they are dropped:
* **Street Lights / Lanterns:**
  * Placed on open terrain/road $\rightarrow$ Spawns as a freestanding vertical lamp post.
  * Placed against a house or wall $\rightarrow$ Morphs into a wall-mounted lantern bracket.
  * Placed onto a water surface $\rightarrow$ Morphs into a floating water lantern buoy.

### 4.2 3D Transformation Gizmo
* Players can switch from simple point-and-click placement to a full 3D manipulation gizmo. This allows fine translation along the $X$, $Y$, and $Z$ axes, pitch/roll adjustments, and micro-nudging of foliage, flower boxes, banners, and street furniture.

### 4.3 Layered Micro-Decorations
* Props can be stacked into tight clusters (e.g., barrels under awnings, potted plants on window ledges, benches nestled between fences and flower beds) using collision-free decoration modes.

---

## 5. Rendering, Lighting, & Environmental Presentation

Galaxy Grove (founded by Joost van Dongen, pioneer of interior mapping shaders) employs an Unreal Engine 5 pipeline tuned for a tactile miniature diorama aesthetic.

```
       [ Dynamic Sun Angle & Day-Night Color Ramp ]
                          │
                          ▼
           [ Real-time Directional Shadows ]
                          │
                          ▼
             [ Stepped Voxel Terracing ]
                          │
         ┌────────────────┴────────────────┐
         ▼                                 ▼
[ Interior Mapping Shader ]     [ Tilt-Shift Depth of Field ]
(Window room depth illusion)    (Macro lens diorama blur)
```

* **Voxel Height Field Representation:** 
  * The world is rendered with distinct voxel stepping along edges, creating clean geometric terraces rather than interpolated, smooth polygon terrain.
* **Dynamic Day/Night Cycle:**
  * Sunlight transitions across a warm Mediterranean color ramp (golden afternoon, deep amber sunset, cool twilight).
  * Window interiors and player-placed light sources dynamically cast volumetric glows at dusk.
* **Interior Mapping Shaders:**
  * Windows simulate three-dimensional room depth and furniture layouts internally via shader math without instantiating actual internal mesh geometry.
* **Miniature / Tilt-Shift Optics:**
  * Strong depth-of-field blurring along the upper and lower screen peripheries simulates a macro-lens tilt-shift effect, making towns resemble physical hobbyist dioramas.
* **First-Person & Photo Modes:**
  * A dedicated first-person camera lets players descend from the isometric bird’s-eye perspective down to street level, traversing their custom alleys and road paths.

---

## 6. Summary Comparison: Traditional Grid vs. *Town to City*

| Dimension | Traditional Grid City Builder | *Town to City* |
|---|---|---|
| **Terrain** | Fixed height grid or heightmap interpolation | Stepped voxel height field with 6-axis sculpt brushes |
| **Water** | Static sea level or pre-baked water planes | Paintable water volumes with hydrological prop reactions |
| **Road Layout** | 90° or 45° snapped grid tiles | Continuous spline/brush ribbons with dynamic curve joins |
| **Building Placement** | Rectangular lot occupancy | Continuous 3D transforms with automatic street alignment |
| **Props & Clutter** | Fixed snap nodes or static prefabs | Context-sensitive morphing (ground vs. wall vs. water) + 3D gizmo |
| **Building Interiors** | Opaque textures or modeled rooms | Optimized real-time *Interior Mapping* procedural shaders |