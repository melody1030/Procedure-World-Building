import { validate, type Archetype, type BuildingConfig, type BuildingModel } from "./config";
import { Kit, PAL, m } from "./kit";
import { base } from "./parts";
import { modularApartmentBlock, stackedMegablock, terracedResidential, towerAndAnnex, twinTowerComplex, verticalNeighborhood } from "./residential";
import { corporateMegatower, landmarkTower, neonCommercialTower, researchLabTower, residentialSkyscraper } from "./skyscrapers";

/**
 * The building library: every archetype with its defaults, and `buildBuilding`, which turns an
 * archetype and a config into geometry. Pure: the renderer (render.ts) wraps the result.
 */

const common: Omit<BuildingConfig, "width" | "depth" | "height"> = {
  floorHeight: 3,
  primaryColor: PAL.navy,
  secondaryColor: PAL.slate,
  accentColor: PAL.cyan,
  windowDensity: 0.5,
  balconyDensity: 0.3,
  neonIntensity: 0.9,
  rooftopStyle: "mixed",
  detailDensity: 0.6,
  seed: 1,
  base: false,
};

export const ARCHETYPES: Archetype[] = [
  // Skyscrapers.
  {
    id: "corporate-megatower",
    name: "Corporate Megatower",
    category: "skyscraper",
    summary: "A supertall after SUMMIT and Edge: a tapering shaft with glass reveals, a triangular sky deck, a faceted glass crown and a spire.",
    districts: ["core"],
    defaults: { ...common, width: 26, depth: 26, height: 150, windowDensity: 0.45 },
    build: corporateMegatower,
  },
  {
    id: "neon-commercial-tower",
    name: "Neon Commercial Tower",
    category: "skyscraper",
    summary: "Covered in blade signs, screens and neon bands, with service platforms, a penthouse and a rooftop sign.",
    districts: ["commercial"],
    defaults: { ...common, width: 16, depth: 14, height: 75, primaryColor: PAL.charcoal, secondaryColor: PAL.wine, accentColor: PAL.magenta, windowDensity: 0.55 },
    build: neonCommercialTower,
  },
  {
    id: "residential-skyscraper",
    name: "Residential Skyscraper",
    category: "skyscraper",
    summary: "A tall stack of flats in three sections split by mechanical floors, warm light strips and a garden roof.",
    districts: ["megablock", "core"],
    defaults: { ...common, width: 16, depth: 16, height: 75, primaryColor: PAL.warmGray, secondaryColor: PAL.slate, accentColor: PAL.amber, windowDensity: 0.55, balconyDensity: 0.35 },
    build: residentialSkyscraper,
  },
  {
    id: "research-lab-tower",
    name: "Research Lab Tower",
    category: "skyscraper",
    summary: "Glass lab towers either side of a concrete service tower, louvered service floors, brick shafts, exhaust stacks, a greenhouse and a lit helix.",
    districts: ["industrial", "core"],
    defaults: { ...common, width: 24, depth: 18, height: 60, primaryColor: PAL.concrete, secondaryColor: PAL.pale, accentColor: PAL.mint, windowDensity: 0.55, rooftopStyle: "service" },
    build: researchLabTower,
  },
  {
    id: "landmark-tower",
    name: "Landmark Tower",
    category: "skyscraper",
    summary: "A TV tower: a tapering round shaft on buttress fins, a disc observation pod with a deck and restaurant, a sky pod and a banded antenna.",
    districts: ["core"],
    defaults: { ...common, width: 20, depth: 20, height: 170, primaryColor: PAL.concrete, secondaryColor: PAL.pale, accentColor: PAL.cyan, windowDensity: 0.4 },
    build: landmarkTower,
  },
  // High-density residential.
  {
    id: "modular-apartment-block",
    name: "Modular Apartment Block",
    category: "residential",
    summary: "A slab of repeated flats in stepped modules, balconies and AC units, a stair core with pipes.",
    districts: ["megablock"],
    defaults: { ...common, width: 20, depth: 12, height: 36, primaryColor: PAL.warmGray, secondaryColor: PAL.plum, accentColor: PAL.magenta },
    build: modularApartmentBlock,
  },
  {
    id: "twin-tower-complex",
    name: "Twin-Tower Complex",
    category: "residential",
    summary: "Two towers of different heights on a shop podium, skybridges at two levels, a garden court between.",
    districts: ["megablock"],
    defaults: { ...common, width: 26, depth: 16, height: 48, primaryColor: PAL.teal, secondaryColor: PAL.slate, accentColor: PAL.cyan },
    build: twinTowerComplex,
  },
  {
    id: "stacked-megablock",
    name: "Stacked Megablock",
    category: "residential",
    summary: "Interlocking volumes stacked off-center with cantilevers and garden terraces.",
    districts: ["megablock", "commercial"],
    defaults: { ...common, width: 22, depth: 18, height: 42, primaryColor: PAL.slate, secondaryColor: PAL.rust, accentColor: PAL.magenta, balconyDensity: 0.25 },
    build: stackedMegablock,
  },
  {
    id: "vertical-neighborhood",
    name: "Vertical Neighborhood",
    category: "residential",
    summary: "Four slim towers on a shared podium, narrow alleys, walkways across them and laundry lines.",
    districts: ["megablock"],
    defaults: { ...common, width: 22, depth: 22, height: 44, primaryColor: PAL.warmGray, secondaryColor: PAL.teal, accentColor: PAL.violet, balconyDensity: 0.35 },
    build: verticalNeighborhood,
  },
  {
    id: "terraced-residential",
    name: "Terraced Residential",
    category: "residential",
    summary: "A broad stepped block pulled back floor by floor, planted terraces with trees and rails, a garden on top.",
    districts: ["wealthy", "megablock"],
    defaults: { ...common, width: 24, depth: 20, height: 30, primaryColor: PAL.concrete, secondaryColor: PAL.slate, accentColor: PAL.amber, balconyDensity: 0.15, rooftopStyle: "garden" },
    build: terracedResidential,
  },
  {
    id: "tower-and-annex",
    name: "Tower and Annex",
    category: "residential",
    summary: "A tall slab of flats over shops beside a low annex with a roof garden, a courtyard of trees between.",
    districts: ["megablock", "commercial"],
    defaults: { ...common, width: 20, depth: 16, height: 55, primaryColor: PAL.slate, secondaryColor: PAL.warmGray, accentColor: PAL.amber },
    build: towerAndAnnex,
  },
];

export function archetype(id: string): Archetype {
  const found = ARCHETYPES.find((a) => a.id === id);
  if (!found) throw new Error(`Unknown building archetype: ${id}`);
  return found;
}

/** Builds one building: the archetype's defaults with `overrides` on top, validated. */
export function buildBuilding(id: string, overrides: Partial<BuildingConfig> = {}): BuildingModel {
  const a = archetype(id);
  const c = validate(a.defaults, overrides);
  const k = new Kit(c.seed ^ hash(a.id));
  k.neon = c.neonIntensity;
  a.build(k, c);
  const width = m(c.width);
  const depth = m(c.depth);
  const height = k.top;
  if (c.base) base(k, width, depth);
  return { id: a.id, ...k.finish(), width, depth, height, fixtures: k.fixtures };
}

/** A small string hash, so two archetypes with the same seed still differ. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
