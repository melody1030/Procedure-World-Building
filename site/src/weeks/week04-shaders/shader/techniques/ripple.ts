import type { TechniqueModule } from "../technique";

export const ripple: TechniqueModule = {
  type: "ripple",
  stage: "shape",
  name: "Ripple",
  summary:
    "Floods the floor with water. The vertex shader moves every water vertex up and down with two crossing waves. The white foam is a contact shader: each water pixel compares its own depth with the depth of whatever is just behind it, and turns white where the gap is small, which is where an object pokes through.",
  formula: "world.y += amp * sin(x * f + t) * cos(z * f + t)\ngap = sceneDepth - waterDepth\nfoam = gap * V.y < width",
  params: [
    { key: "amplitude", label: "Amplitude", description: "How tall the waves are.", kind: "range", min: 0, max: 0.1, step: 0.005, decimals: 3, default: 0.03 },
    { key: "frequency", label: "Frequency", description: "How many waves fit across the scene.", kind: "range", min: 0.5, max: 8, step: 0.1, decimals: 2, default: 3 },
    { key: "speed", label: "Speed", description: "How fast the waves move.", kind: "range", min: 0, max: 4, step: 0.05, decimals: 2, default: 1 },
    { key: "level", label: "Water level", description: "How high the water stands above the floor.", kind: "range", min: 0.05, max: 1.5, step: 0.05, decimals: 2, default: 0.25 },
    { key: "foam", label: "Foam", description: "How wide the white foam line around objects is.", kind: "range", min: 0, max: 1, step: 0.05, decimals: 2, default: 0.5 },
  ],
  uniforms: ["uniform float uWaterLevel;", "uniform float uRippleAmp;", "uniform float uRippleFreq;", "uniform float uRippleSpeed;"],
  body: `
// Two crossing waves in world space. Only the water moves (aWater is 1 there, 0 elsewhere).
float rippleT = uTime * uRippleSpeed;
float rippleA = world.x * uRippleFreq + rippleT;
float rippleB = world.z * uRippleFreq * 0.8 + rippleT * 1.3;
float rippleH = sin(rippleA) * cos(rippleB);
// The water box is 1 unit tall: scale its top up to the water level plus the wave. Its bottom
// (position.y = 0) stays on the floor, so the sides always reach down to it.
world.y = mix(world.y, position.y * (uWaterLevel + uRippleAmp * rippleH), aWater);
// Tilt the top's normal by the wave's slope (its x and z derivatives).
vec3 rippleSlope = uRippleAmp * aWater * position.y * vec3(uRippleFreq * cos(rippleA) * cos(rippleB), 0.0, -uRippleFreq * 0.8 * sin(rippleA) * sin(rippleB));
worldNormal = normalize(worldNormal - rippleSlope * worldNormal.y);`,
  fragment: {
    uniforms: [
      "uniform float uTime;",
      "uniform float uFoam;",
      "uniform sampler2D uSceneDepth;  // depth of everything except the water, drawn first",
      "uniform vec2 uScreenSize;",
      "uniform float uCameraNear;",
      "uniform float uCameraFar;",
    ],
    functions: `
float foamHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Smooth 0 to 1 noise, used to make the foam's edge jagged.
float foamNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(foamHash(i), foamHash(i + vec2(1.0, 0.0)), u.x), mix(foamHash(i + vec2(0.0, 1.0)), foamHash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// A depth-buffer value (0 near, 1 far) back to a distance from the camera.
float linearDepth(float depth) {
  return (uCameraNear * uCameraFar) / (uCameraFar - depth * (uCameraFar - uCameraNear));
}`,
    body: `
// Contact: how far behind this water pixel is the next solid surface?
vec2 screenUv = gl_FragCoord.xy / uScreenSize;
float gap = linearDepth(texture2D(uSceneDepth, screenUv).r) - linearDepth(gl_FragCoord.z);
// The gap is measured along the view ray; V.y turns it into a depth below the surface, so the
// foam line keeps its width however the camera looks down.
float depthBelow = gap * V.y;
// Shallow water is light, deep water is dark.
vec3 water = mix(vec3(0.33, 0.72, 0.80), vec3(0.10, 0.32, 0.55), smoothstep(0.0, 0.25, depthBelow));
water *= 0.7 + 0.3 * ndl;
water += vec3(0.6, 0.8, 0.9) * pow(max(dot(reflect(-L, N), V), 0.0), 60.0);
// A hard foam line where the gap is small. Noise pushes the edge in and out, so it is jagged.
float jag = foamNoise(vWorldPos.xz * 7.0 + vec2(uTime * 0.25, -uTime * 0.15));
// Only on the top surface: the sides of the water box meet the floor too, but that is not a shoreline.
float foam = uFoam > 0.0 ? step(depthBelow, uFoam * 0.14 * (0.45 + jag)) * step(0.5, N.y) : 0.0;
col = mix(col, mix(water, vec3(0.97, 0.99, 1.0), foam), vWater);`,
  },
  apply: (p, u) => {
    u.uRippleAmp.value = p.amplitude;
    u.uRippleFreq.value = p.frequency;
    u.uRippleSpeed.value = p.speed;
    u.uFoam.value = p.foam;
    u.uWaterLevel.value = p.level;
  },
};
