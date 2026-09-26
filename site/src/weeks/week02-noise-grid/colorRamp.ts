import * as THREE from "three";

/**
 * Elevation stops from low to high, built from the site's slate + cyan palette
 * (deep slate → cyan-800 → cyan-500 → cyan-300 → near-white) so the terrain reads as part of
 * the same UI rather than a realistic map.
 */
const STOPS: Array<[number, THREE.Color]> = [
  [0.0, new THREE.Color(0x0f1e33)],
  [0.25, new THREE.Color(0x155e75)],
  [0.5, new THREE.Color(0x06b6d4)],
  [0.75, new THREE.Color(0x67e8f9)],
  [1.0, new THREE.Color(0xf0fdff)],
];

/** Maps a [0, 1] elevation value to a color along the terrain ramp. */
export function elevationColor(t: number, target: THREE.Color): THREE.Color {
  const v = Math.min(1, Math.max(0, t));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [t0, c0] = STOPS[i];
    const [t1, c1] = STOPS[i + 1];
    if (v <= t1) {
      const localT = t1 === t0 ? 0 : (v - t0) / (t1 - t0);
      return target.copy(c0).lerp(c1, localT);
    }
  }
  return target.copy(STOPS[STOPS.length - 1][1]);
}
