import { perlin } from "../../world/noise";
import { Rng } from "../../world/rng";
import { WORLD_SIZE } from "./config";
import { heightAt, type Heightmap } from "./terrain";
import type { ParticleMode, ParticleParams } from "./types";

/**
 * Vector fields and particles (Class 06, PCG 04: Vector Fields & Particles). Particles are point
 * data: a position, a velocity and an age each. Every frame they read the wind field at their
 * position, update their velocity, then move.
 */

export const MAX_PARTICLES = 6000;
export const MAX_TRAIL = 16;

const HALF = WORLD_SIZE / 2;
const SPAN = HALF - 0.2;
const FIELD_SEED = 9137;

/**
 * The wind at (x, z) and time t: a base direction plus the curl of a noise field. The curl of a
 * scalar field is divergence free, so particles swirl without bunching up in sinks.
 */
export function windAt(params: ParticleParams, x: number, z: number, t: number, out: number[] = [0, 0]): number[] {
  const angle = (params.windDirection * Math.PI) / 180;
  const s = 0.12 / params.fieldScale;
  const e = 0.05;
  const px = x * s + t * 0.06;
  const pz = z * s - t * 0.04;
  const dPdx = (perlin(px + e, pz, FIELD_SEED) - perlin(px - e, pz, FIELD_SEED)) / (2 * e);
  const dPdz = (perlin(px, pz + e, FIELD_SEED) - perlin(px, pz - e, FIELD_SEED)) / (2 * e);
  out[0] = Math.cos(angle) * params.windStrength + dPdz * params.swirl * 0.9;
  out[1] = Math.sin(angle) * params.windStrength - dPdx * params.swirl * 0.9;
  return out;
}

/** How each mode looks and how often its trail records a position. */
export const MODE_STYLE: Record<Exclude<ParticleMode, "off">, { color: string; size: number; opacity: number; trailStride: number }> = {
  rain: { color: "#a5f3fc", size: 0.05, opacity: 0.5, trailStride: 1 },
  wind: { color: "#22d3ee", size: 0.09, opacity: 0.9, trailStride: 4 },
  clouds: { color: "#cbd5e1", size: 2.2, opacity: 0.1, trailStride: 6 },
};

export class ParticleSim {
  readonly positions = new Float32Array(MAX_PARTICLES * 3);
  readonly velocities = new Float32Array(MAX_PARTICLES * 3);
  readonly ages = new Float32Array(MAX_PARTICLES);
  readonly lives = new Float32Array(MAX_PARTICLES);
  /** Height above the ground each wind particle hovers at. */
  readonly lift = new Float32Array(MAX_PARTICLES);
  /** Ring buffer of past positions: [slot][particle][xyz]. */
  readonly history = new Float32Array(MAX_TRAIL * MAX_PARTICLES * 3);
  head = 0;
  private frame = 0;
  private rng = new Rng(4242);
  private wind = [0, 0];
  mode: ParticleMode = "off";

  /** Starts every particle over, e.g. when the mode or the terrain changes. */
  reset(mode: ParticleMode, map: Heightmap) {
    this.mode = mode;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.spawn(i, map, true);
    }
  }

  private spawn(i: number, map: Heightmap, scatterAge: boolean) {
    const r = this.rng;
    const x = r.range(-SPAN, SPAN);
    const z = r.range(-SPAN, SPAN);
    const ground = heightAt(map, x, z);
    let y = ground;
    if (this.mode === "rain") y = map.maxH + 1 + r.next() * 7;
    else if (this.mode === "wind") {
      this.lift[i] = 0.25 + r.next() * 1.6;
      y = ground + this.lift[i];
    } else if (this.mode === "clouds") y = map.maxH + 2.5 + r.next() * 2.5;
    const p = i * 3;
    this.positions[p] = x;
    this.positions[p + 1] = y;
    this.positions[p + 2] = z;
    this.velocities[p] = 0;
    this.velocities[p + 1] = this.mode === "rain" ? -6 : 0;
    this.velocities[p + 2] = 0;
    this.lives[i] = this.mode === "wind" ? 3 + r.next() * 4 : 1e9;
    this.ages[i] = scatterAge ? r.next() * this.lives[i] : 0;
    this.clearTrail(i);
  }

  /** A respawned particle's trail starts at its new spot, instead of a line across the map. */
  private clearTrail(i: number) {
    const stride = MAX_PARTICLES * 3;
    for (let k = 0; k < MAX_TRAIL; k++) {
      this.history[k * stride + i * 3] = this.positions[i * 3];
      this.history[k * stride + i * 3 + 1] = this.positions[i * 3 + 1];
      this.history[k * stride + i * 3 + 2] = this.positions[i * 3 + 2];
    }
  }

  step(dt: number, t: number, params: ParticleParams, map: Heightmap) {
    if (this.mode === "off") return;
    const count = Math.min(params.count, MAX_PARTICLES);
    const { positions: pos, velocities: vel, wind } = this;
    for (let i = 0; i < count; i++) {
      const p = i * 3;
      windAt(params, pos[p], pos[p + 2], t, wind);
      if (this.mode === "rain") {
        // Drag pulls the sideways speed towards the wind; gravity pulls down to a terminal speed.
        vel[p] += (wind[0] * 1.5 - vel[p]) * 2 * dt;
        vel[p + 2] += (wind[1] * 1.5 - vel[p + 2]) * 2 * dt;
        vel[p + 1] = Math.max(-10, vel[p + 1] - 9.8 * dt);
      } else if (this.mode === "wind") {
        vel[p] = wind[0] * 1.3;
        vel[p + 2] = wind[1] * 1.3;
        vel[p + 1] = (heightAt(map, pos[p], pos[p + 2]) + this.lift[i] - pos[p + 1]) * 3;
      } else {
        vel[p] = wind[0] * 0.35;
        vel[p + 2] = wind[1] * 0.35;
        vel[p + 1] = 0;
      }
      pos[p] += vel[p] * dt;
      pos[p + 1] += vel[p + 1] * dt;
      pos[p + 2] += vel[p + 2] * dt;
      this.ages[i] += dt;

      const out = Math.abs(pos[p]) > SPAN || Math.abs(pos[p + 2]) > SPAN;
      if (this.mode === "clouds" && out) {
        // Clouds wrap around to the far edge so the sky never empties.
        pos[p] = pos[p] > SPAN ? -SPAN : pos[p] < -SPAN ? SPAN : pos[p];
        pos[p + 2] = pos[p + 2] > SPAN ? -SPAN : pos[p + 2] < -SPAN ? SPAN : pos[p + 2];
        this.clearTrail(i);
      } else if (out || this.ages[i] > this.lives[i] || (this.mode === "rain" && pos[p + 1] < heightAt(map, pos[p], pos[p + 2]))) {
        this.spawn(i, map, false);
      }
    }

    // Record the trail every few frames, so slow particles still draw long flow lines.
    this.frame++;
    if (this.frame % MODE_STYLE[this.mode].trailStride === 0) {
      this.head = (this.head + 1) % MAX_TRAIL;
      this.history.set(pos.subarray(0, count * 3), this.head * MAX_PARTICLES * 3);
    }
  }

  /** Writes line segments joining each particle's last `length` positions. Returns the vertex count. */
  writeTrails(out: Float32Array, count: number, length: number): number {
    const stride = MAX_PARTICLES * 3;
    let v = 0;
    for (let i = 0; i < count; i++) {
      // The newest segment joins the live position to the latest recorded one.
      let ax = this.positions[i * 3];
      let ay = this.positions[i * 3 + 1];
      let az = this.positions[i * 3 + 2];
      for (let k = 0; k < length - 1; k++) {
        const slot = ((this.head - k + MAX_TRAIL) % MAX_TRAIL) * stride + i * 3;
        out[v * 3] = ax;
        out[v * 3 + 1] = ay;
        out[v * 3 + 2] = az;
        ax = this.history[slot];
        ay = this.history[slot + 1];
        az = this.history[slot + 2];
        out[v * 3 + 3] = ax;
        out[v * 3 + 4] = ay;
        out[v * 3 + 5] = az;
        v += 2;
      }
    }
    return v;
  }
}
