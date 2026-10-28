import concreteBuild from "../world/screenshots/2026-10-27-concrete-build.webp";
import inhabitants from "../world/screenshots/2026-10-27-inhabitants.webp";
import busStop from "../world/screenshots/2026-10-28-bus-stop.webp";
import city from "../world/screenshots/2026-10-28-city-after-grading.webp";
import lotsFilled from "../world/screenshots/2026-10-28-lots-filled.webp";
import smoothed from "../world/screenshots/2026-10-28-smoothed-blocks.webp";
import traffic from "../world/screenshots/2026-10-28-street-traffic.webp";
import taxi from "../world/screenshots/2026-10-28-taxi-pickup.webp";
import library from "../world/screenshots/2026-10-13-building-library.webp";
import wfc from "../world/screenshots/2026-10-09-wfc-streets-districts.webp";
import districts from "../world/screenshots/2026-10-12-districts-parks.webp";
import version1 from "../world/screenshots/2026-10-07-v1-rainy-night.webp";
import { REPO } from "./ui";

/** What the homepage shows: the screenshots, the techniques and the studios, in one place. */

export const SHOTS = { concreteBuild, inhabitants, busStop, city, lotsFilled, smoothed, traffic, taxi, library, wfc, districts, version1 };

/** The concept in four frames, left to right. */
export const STAGES = [
  { image: concreteBuild, title: "Empty ground", text: "Noise, terraces and a river, printed layer by layer." },
  { image: lotsFilled, title: "Streets and lots", text: "Streets grow out from a plaza; lots are zoned along them." },
  { image: city, title: "A city", text: "Buildings picked by district and sized to their lots rise storey by storey." },
  { image: traffic, title: "Brought to life", text: "People, pigeons, cats and traffic move in and share the streets." },
];

export const ANALYSIS = [
  { title: "Town to City: building and terrain mechanics", text: "How the reference game handles terraforming, roads, placement and props.", href: `${REPO}docs/analysis/Town%20to%20City%20%E2%80%94%20Building%20%26%20Terrain%20Mechanics%20Breakdown.md` },
  { title: "Cozy off-grid builders", text: "Townscaper, Town to City and Tiny Glade compared.", href: `${REPO}docs/analysis/cozy-builders-research.md` },
  { title: "Week 9 feedback", text: "Inspecting agents and buildings, camera presets, and how to present the work.", href: `${REPO}docs/analysis/week09-feedback.md` },
];

/** The five kinds of technique the city uses, and the studios each grew from. */
export const TECHNIQUES = [
  { title: "Terrain", image: smoothed, text: "Noise, slope-scaled terraces and a river on 0.25 m voxels; streets cut and fill, blocks are smoothed between them, lots are graded flat.", doc: `${REPO}docs/techniques/terrain.md`, studios: ["week02", "week03", "week05"] },
  { title: "Shader", image: concreteBuild, text: "The voxel look on merged faces, data-texture overlays, and the build timeline, with nothing rebuilt per frame.", doc: `${REPO}docs/techniques/shader.md`, studios: ["week04"] },
  { title: "Agents", image: inhabitants, text: "People driven by needs on flow fields, boid pigeons, cats with a cone of vision, and traffic that yields to people.", doc: `${REPO}docs/techniques/agents.md`, studios: [] },
  { title: "Building morphology", image: library, text: "Eleven cyberpunk archetypes built from reusable parts, picked by district and sized to their lots.", doc: `${REPO}docs/techniques/building-morphology.md`, studios: ["buildings"] },
  { title: "Network", image: wfc, text: "A street network by wave function collapse, districts and lots zoned along it, and the graphs agents move on.", doc: `${REPO}docs/techniques/network.md`, studios: ["week05"] },
];

/** The studios: each week's in-class workshop, and the building library. */
export const STUDIOS: { id: string; number: string; title: string; description: string; path: string; icon: "cube" | "mountain" | "voxel" | "shader" | "scatter" | "building" }[] = [
  { id: "week01", number: "01", title: "Geometry", description: "Three.js basics: shapes, materials, lighting.", path: "/week01", icon: "cube" },
  { id: "week02", number: "02", title: "Terrain", description: "Noise grids, shaping, hydraulic erosion.", path: "/week02", icon: "mountain" },
  { id: "week03", number: "03", title: "Volumes", description: "Voxels, CSG, implicit surfaces, mesh generation.", path: "/week03", icon: "voxel" },
  { id: "week04", number: "04", title: "Shader Studio", description: "Stack, isolate and read shader techniques.", path: "/week04", icon: "shader" },
  { id: "week05", number: "05", title: "Scatter & Paths", description: "Scattering rules, spline roads and rivers, particles in a wind field.", path: "/week05", icon: "scatter" },
  { id: "buildings", number: "City", title: "Building library", description: "The eleven buildings the city places on its lots, one at a time or all together.", path: "/buildings", icon: "building" },
];

export const MILESTONES = [
  { date: "Oct 7", text: "Version 1, then a restart on 0.25 m voxels" },
  { date: "Oct 8", text: "A river valley and the claim map" },
  { date: "Oct 9", text: "Streets by wave function collapse, districts and lots" },
  { date: "Oct 12–13", text: "Districts like Cities: Skylines, parks, the building library" },
  { date: "Oct 14", text: "The build timeline; buildings placed on the lots" },
  { date: "Oct 26", text: "Buildings built storey by storey, under scaffolding" },
  { date: "Oct 27", text: "Landscaped parks; people, pigeons and cats; one concrete city" },
  { date: "Oct 28", text: "Traffic; smoothed blocks and graded lots; small lots merged, gaps filled" },
];

export const DEVLOG = `${REPO}site/src/world/README.md`;
export const DOCS = "https://github.com/melody1030/Procedure-World-Building#readme";
