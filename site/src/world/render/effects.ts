import * as THREE from "three";

/**
 * Atmosphere pieces: rain, the tilt-shift blur, the neon environment that wet surfaces reflect,
 * and the three moods.
 */

export type MoodId = "rain" | "clear" | "dusk";

export interface Mood {
  label: string;
  background: number;
  /** Multiplies the world's haze density. */
  fog: number;
  hemiSky: number;
  hemiGround: number;
  hemi: number;
  key: number;
  keyIntensity: number;
  /** Key light direction in degrees: compass bearing, then angle above the horizon. */
  sunAzimuth: number;
  sunElevation: number;
  /** Whether this mood rains by default. */
  rain: boolean;
  bloom: number;
  exposure: number;
  mirror: number;
}

export const MOODS: Record<MoodId, Mood> = {
  rain: {
    label: "Rainy night",
    background: 0x070b14,
    fog: 1,
    hemiSky: 0x3a4f7c,
    hemiGround: 0x0a0e18,
    hemi: 2.1,
    key: 0x9fb4e0,
    keyIntensity: 1.5,
    sunAzimuth: -55,
    sunElevation: 56,
    rain: true,
    bloom: 0.8,
    exposure: 1.15,
    mirror: 0x2e3a50,
  },
  clear: {
    label: "Clear night",
    background: 0x080d18,
    fog: 0.45,
    hemiSky: 0x40568a,
    hemiGround: 0x0a0e18,
    hemi: 2.3,
    key: 0xa8bce6,
    keyIntensity: 2.1,
    sunAzimuth: -55,
    sunElevation: 56,
    rain: false,
    bloom: 0.75,
    exposure: 1.15,
    mirror: 0x46546c,
  },
  dusk: {
    label: "Dusk",
    background: 0x3b2c4a,
    fog: 0.6,
    hemiSky: 0xffa27a,
    hemiGround: 0x241c2c,
    hemi: 1.5,
    key: 0xffb070,
    keyIntensity: 2.8,
    sunAzimuth: 70,
    sunElevation: 19,
    rain: false,
    bloom: 0.45,
    exposure: 1.05,
    mirror: 0x6a5a6e,
  },
};

/**
 * Falling rain as short line streaks, moved entirely in the vertex shader. Every drop exists; the
 * Rain setting only changes how many are drawn. Wind slants each streak and drifts the drop
 * sideways the further it has fallen.
 */
export function createRain(starts: Float32Array, height: number) {
  const drops = starts.length / 3;
  const position = new Float32Array(drops * 6);
  const top = new Float32Array(drops * 2);
  for (let i = 0; i < drops; i++) {
    position.set(starts.subarray(i * 3, i * 3 + 3), i * 6);
    position.set(starts.subarray(i * 3, i * 3 + 3), i * 6 + 3);
    top[i * 2 + 1] = 1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("aTop", new THREE.BufferAttribute(top, 1));
  const uniforms = { uTime: { value: 0 }, uWind: { value: 0.15 } };
  const material = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uHeight: { value: height } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uHeight;
      uniform float uWind;
      attribute float aTop;
      void main() {
        vec3 p = position;
        p.y = mod(p.y - uTime * (70.0 + fract(position.x * 0.37) * 30.0), uHeight);
        p.x += (uHeight - p.y) * uWind * 0.25;
        p.y += aTop * 3.0;
        p.x += aTop * 3.0 * uWind;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      void main() { gl_FragColor = vec4(0.62, 0.76, 0.95, 0.14); }`,
    transparent: true,
    depthWrite: false,
  });
  const object = new THREE.LineSegments(geometry, material);
  object.frustumCulled = false;
  return { object, uniforms, drops };
}

/**
 * Tilt-shift: blur grows with distance from a horizontal band across the screen, like a macro lens
 * on a model. Run twice (horizontal, then vertical).
 */
export const TiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null },
    uDirection: { value: new THREE.Vector2(1, 0) },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uAmount: { value: 2.2 },
    uFocus: { value: 0.48 },
    uBand: { value: 0.16 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uDirection;
    uniform vec2 uResolution;
    uniform float uAmount;
    uniform float uFocus;
    uniform float uBand;
    varying vec2 vUv;
    void main() {
      float blur = smoothstep(uBand, uBand + 0.32, abs(vUv.y - uFocus)) * uAmount;
      vec4 sum = vec4(0.0);
      float total = 0.0;
      for (int i = -4; i <= 4; i++) {
        float w = exp(-float(i * i) / 8.0);
        sum += texture2D(tDiffuse, vUv + uDirection * float(i) * blur / uResolution) * w;
        total += w;
      }
      gl_FragColor = sum / total;
    }`,
};

/** A small dark room with neon panels, prefiltered: what wet roads and water reflect. */
export function neonEnvironment(renderer: THREE.WebGLRenderer, neon: number[]): THREE.Texture {
  const room = new THREE.Scene();
  room.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ color: 0x0b1322, side: THREE.BackSide })));
  const panel = new THREE.BoxGeometry(1, 1, 1);
  const lights: [number, number, number, number, number, number, number][] = [
    [neon[0], 3, -30, 8, -20, 14, 6],
    [neon[1] ?? neon[0], 3, 28, 10, -14, 8, 10],
    [neon[2] ?? neon[0], 3, 10, 6, 32, 18, 4],
    [0xffd08a, 1.5, -24, 4, 26, 20, 3],
    [0x8fa8d8, 0.8, 0, 40, 0, 40, 2],
  ];
  for (const [colour, intensity, x, y, z, w, h] of lights) {
    const mesh = new THREE.Mesh(panel, new THREE.MeshBasicMaterial({ color: new THREE.Color(colour).multiplyScalar(intensity) }));
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, w * 0.3);
    mesh.lookAt(0, y, 0);
    room.add(mesh);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(room, 0.04).texture;
  pmrem.dispose();
  room.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
  return texture;
}
