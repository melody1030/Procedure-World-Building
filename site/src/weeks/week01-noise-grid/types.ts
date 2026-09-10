export type NoiseType = "white" | "perlin" | "cellular";
export type ShapingType = "none" | "power" | "terrace" | "ridge";
export type ViewMode = "heightmap" | "wireframe";
export type CameraPreset = "perspective" | "top" | "side";

export interface NoiseParams {
  noiseType: NoiseType;
  scale: number;
  octaves: number;
  persistence: number;
  seed: number;
}

export interface ShapingParams {
  shapingType: ShapingType;
  amount: number;
}

export interface Week1State extends NoiseParams, ShapingParams {
  resolution: number;
  viewMode: ViewMode;
}
