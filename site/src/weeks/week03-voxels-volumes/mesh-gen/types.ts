import type { MeshMethodId } from "./meshers";

export interface MeshOptions {
  /** Surface threshold, in world units: the surface sits where the field equals this (0 = the true surface). */
  iso: number;
  /** Culled Faces: skip faces hidden by a neighbouring voxel. */
  cullHidden: boolean;
  /** Greedy: largest merged rectangle side, in voxels (1 = no merging). */
  maxQuad: number;
  /** Marching Cubes: slide vertices along edges by the density values instead of using edge midpoints. */
  interpolate: boolean;
  /** Surface Nets: vertex at the cell centre, or the average of the cell's edge crossings. */
  vertexPlacement: "center" | "average";
  /** Dual Contouring: 0 = QEF fully regularized toward the average crossing (= Surface Nets), 1 = fully sharp. */
  sharpness: number;
  /** Dual Contouring: keep each vertex inside its own cell. */
  clampToCell: boolean;
}

export interface MeshGenParams {
  method: MeshMethodId;
  options: MeshOptions;
  /** Step-by-step mode: walk through the algorithm instead of showing the finished mesh. */
  stepMode: boolean;
  /** Index into MESH_STEPS[method]. */
  step: number;
  /** Fraction (0..1) of the mesh's faces built so far. Only used on a "build" step. */
  progress: number;
}

export interface MeshStats {
  vertices: number;
  triangles: number;
  faces: number;
  faceKind: "quads" | "triangles";
  ms: number;
  voxels: number;
}

export const DEFAULT_MESH_OPTIONS: MeshOptions = {
  iso: 0,
  cullHidden: true,
  maxQuad: 20,
  interpolate: true,
  vertexPlacement: "average",
  sharpness: 1,
  clampToCell: true,
};

export const DEFAULT_MESH_PARAMS: MeshGenParams = {
  method: "culled",
  options: DEFAULT_MESH_OPTIONS,
  stepMode: false,
  step: 0,
  progress: 0,
};

/** Fixed sampling resolution. This tab compares methods, not resolutions (that is tab 01). */
export const MESH_RESOLUTION = 20;

export interface MeshMethodMeta {
  id: MeshMethodId;
  name: string;
  summary: string;
  steps: string[];
  input: string;
  look: string;
  faces: string;
  sharp: string;
  topology: string;
  cost: string;
}

export const MESH_METHODS: MeshMethodMeta[] = [
  {
    id: "culled",
    name: "Culled Faces",
    summary: "Adds one quad for every voxel face that touches empty space, and skips faces hidden between neighbouring voxels.",
    steps: ["Treat each sample as a filled or empty voxel, based on the sign of the field.", "For every filled voxel, check its 6 neighbours.", "Add a quad on each face whose neighbour is empty."],
    input: "binary",
    look: "blocky",
    faces: "medium",
    sharp: "yes (axis-aligned only)",
    topology: "watertight, often non-manifold",
    cost: "lowest",
  },
  {
    id: "greedy",
    name: "Greedy",
    summary: "Merges flat, same-facing quads into bigger rectangles. You get the same surface with far fewer faces.",
    steps: ["Find the exposed faces slice by slice, just like Culled Faces.", "Grow each face into the widest, then tallest, rectangle of exposed faces.", "Add one big quad per rectangle. The surface stays the same with fewer faces, at the cost of some T-junctions."],
    input: "binary",
    look: "blocky",
    faces: "lowest",
    sharp: "yes (axis-aligned only)",
    topology: "T-junctions",
    cost: "low–medium",
  },
  {
    id: "marching",
    name: "Marching Cubes",
    summary: "Reads the 8 corner signs of each cell as an index into a 256-case table, then stitches triangles across the cell and slides vertices along edges by the density.",
    steps: ["Take each cell of 8 neighbouring samples and note which corners are inside.", "Turn those 8 flags into an index for a 256-case table.", "The table says which cell edges the surface crosses and how to join them. Place a vertex on each edge using the density values, then connect them into triangles."],
    input: "density",
    look: "smooth, bevelled",
    faces: "highest (tris)",
    sharp: "no",
    topology: "manifold if disambiguated",
    cost: "medium",
  },
  {
    id: "surfacenets",
    name: "Surface Nets",
    summary: "Puts one vertex in every cell the surface passes through, at the average of its edge crossings, then joins neighbouring vertices with quads.",
    steps: ["Find the cells whose 8 corners are a mix of inside and outside.", "Put one vertex in each, at the average of its edge crossings.", "For every grid edge that crosses the surface, connect the 4 cells around it with a quad."],
    input: "density",
    look: "smooth",
    faces: "low (quads)",
    sharp: "no",
    topology: "mostly manifold",
    cost: "low–medium",
  },
  {
    id: "dual",
    name: "Dual Contouring",
    summary: "Works like Surface Nets, but places each vertex by minimizing a QEF over the edge crossings and their normals, so vertices snap onto sharp corners.",
    steps: ["Do what Surface Nets does, but also record each crossing point and its surface normal (Hermite data).", "Solve a small least-squares problem (the QEF) for the point closest to all of those tangent planes.", "That point snaps onto corners and edges. Then connect the cells with quads as before."],
    input: "Hermite",
    look: "smooth + sharp",
    faces: "low (quads)",
    sharp: "yes",
    topology: "risk of non-manifold / self-intersection",
    cost: "high",
  },
];

/**
 * What the viewport draws on a step:
 * - samples: the field sampled at every voxel centre, coloured inside / outside
 * - exposed: (Greedy) every exposed unit face, before merging
 * - cells: the cells the surface passes through
 * - crossings: where the surface crosses cell edges (with normals for Dual Contouring)
 * - vertices: one vertex per surface cell
 * - build: the mesh, built face by face
 */
export type MeshStepKind = "samples" | "exposed" | "cells" | "crossings" | "vertices" | "build";

export interface MeshStepDef {
  kind: MeshStepKind;
  title: string;
  text: string;
}

const SAMPLES_STEP: MeshStepDef = {
  kind: "samples",
  title: "Sample the volume",
  text: "The cube and ball are combined into one field and sampled once per voxel. Cyan dots are inside the volume and grey dots are outside. A binary method only ever sees this grid of inside and outside signs.",
};

export const MESH_STEPS: Record<MeshMethodId, MeshStepDef[]> = {
  culled: [
    SAMPLES_STEP,
    {
      kind: "build",
      title: "Emit exposed faces",
      text: "Visit every filled voxel and check its 6 neighbours. A face is added only where the neighbour is empty. Drag the slider or press Play to watch it build. The newest face is highlighted.",
    },
  ],
  greedy: [
    SAMPLES_STEP,
    {
      kind: "exposed",
      title: "Find exposed faces",
      text: "This is the same as Culled Faces: one small quad for every voxel face that touches empty space. It is the starting point, with lots of tiny flat quads.",
    },
    {
      kind: "build",
      title: "Merge into rectangles",
      text: "Sweep through each slice and grow every face into the widest, then tallest, rectangle of exposed faces. Each rectangle becomes one big quad, so flat areas collapse into a few large pieces.",
    },
  ],
  marching: [
    SAMPLES_STEP,
    {
      kind: "cells",
      title: "Find surface cells",
      text: "A cell is the cube between 8 neighbouring samples. Cells that are entirely inside or entirely outside are skipped. The amber cells are the ones the surface passes through.",
    },
    {
      kind: "build",
      title: "Look up triangles per cell",
      text: "Each surface cell's 8 corner signs make an 8-bit index into a 256-case table. The table says which edges the surface crosses and how to join them into triangles. Vertices slide along those edges according to the density values.",
    },
  ],
  surfacenets: [
    SAMPLES_STEP,
    {
      kind: "cells",
      title: "Find surface cells",
      text: "These are the cells whose corners are a mix of inside and outside, the same ones Marching Cubes visits. They are marked in amber.",
    },
    {
      kind: "crossings",
      title: "Find edge crossings",
      text: "Some edges of each surface cell have one end inside and one end outside. The pink dots show where the surface crosses those edges, found by interpolating the density.",
    },
    {
      kind: "vertices",
      title: "One vertex per cell",
      text: "Average each cell's crossing points to get a single vertex (green). That is the whole placement rule, and there is no lookup table.",
    },
    {
      kind: "build",
      title: "Connect with quads",
      text: "Every grid edge that crosses the surface is shared by 4 cells, so their 4 vertices are joined into a quad. Quads appear in sweep order and the newest one is highlighted.",
    },
  ],
  dual: [
    SAMPLES_STEP,
    {
      kind: "cells",
      title: "Find surface cells",
      text: "These are the cells whose corners are a mix of inside and outside, marked in amber just like in Surface Nets.",
    },
    {
      kind: "crossings",
      title: "Hermite data: crossings and normals",
      text: "Dual Contouring records more than Surface Nets. At each crossing (pink) it also stores the surface normal (orange line), and together they describe a tangent plane.",
    },
    {
      kind: "vertices",
      title: "Solve the QEF",
      text: "Find the point that best fits all of a cell's tangent planes, using least squares. Near a sharp edge or corner the planes disagree, so the vertex snaps onto it (green) instead of being averaged away.",
    },
    {
      kind: "build",
      title: "Connect with quads",
      text: "The cell vertices are connected into quads exactly as in Surface Nets. Only the vertex positions differ, and that is what keeps corners sharp.",
    },
  ],
};
