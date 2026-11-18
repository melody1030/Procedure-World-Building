/**
 * The city's clock (pure: no three.js). A day lasts DAY_SECONDS of real time, so an hour is 25 s;
 * the clock opens at START_HOUR, on the morning commute, and runs with the simulation (it stops
 * while Life is off or the city is still being printed). Time is kept as hours since midnight of
 * the first day, so a schedule is a plain number to compare with.
 *
 * The light follows the hour (see `lightAt`): the sun rises at SUNRISE, crosses the south and sets
 * at SUNSET, warmer and dimmer the lower it is; through the night a dim blue moon lights the city
 * from the other side, and the windows (the buildings' glow) are at their brightest.
 */

/** One day, in seconds of real time; an hour of it. */
export const DAY_SECONDS = 600;
export const HOUR_SECONDS = DAY_SECONDS / 24;
/** The hour the city opens at. */
export const START_HOUR = 6;
/** Sunrise and sunset (hours), and the sun's height at noon and the moon's (degrees). */
const SUNRISE = 6;
const SUNSET = 19;
const NOON_ELEVATION = 62;
const MOON_ELEVATION = 45;

export class Clock {
  /** Hours since midnight of the first day. */
  time = START_HOUR;

  step(dt: number) {
    this.time += dt / HOUR_SECONDS;
  }

  /** The hour of the day, 0–24. */
  get hour() {
    return hourOf(this.time);
  }

  /** The day, counted from 0. */
  get day() {
    return Math.floor(this.time / 24);
  }

  /** The first time at or after `from` that is `hour` o'clock. */
  next(hour: number, from = this.time) {
    let t = Math.floor(from / 24) * 24 + hour;
    if (t < from) t += 24;
    return t;
  }

  /** `hour` o'clock today. */
  today(hour: number) {
    return this.day * 24 + hour;
  }
}

export const hourOf = (time: number) => ((time % 24) + 24) % 24;

/** "07:25". */
export function clockLabel(time: number): string {
  const h = hourOf(time);
  const minutes = Math.floor(h * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** The light at an hour: colors are sRGB hex; the sun's (or the moon's) direction is a unit vector toward it. */
export interface Light {
  background: number;
  hemisphereSky: number;
  hemisphereGround: number;
  hemisphereIntensity: number;
  sun: number;
  sunIntensity: number;
  sunDirection: [number, number, number];
  /** How bright the windows' glow is, 0–1 (1 at night). */
  windows: number;
  exposure: number;
  /** 1 by day, 0 by night (for anything else that wants it). */
  daylight: number;
}

const DAY = { background: 0xb9d3e8, hemisphereSky: 0xe4f0ff, hemisphereGround: 0x6b7466, hemisphereIntensity: 1.4 };
const NIGHT = { background: 0x0b1222, hemisphereSky: 0x34466e, hemisphereGround: 0x14161c, hemisphereIntensity: 0.5 };
/** The sky low round the sun at dawn and dusk. */
const TWILIGHT = 0xd49a86;
const SUN_HIGH = 0xfff2dc;
const SUN_MID = 0xffd6a8;
const SUN_LOW = 0xff9558;
const MOON = 0x9fb4ff;
const SUN_INTENSITY = 2.6;
const MOON_INTENSITY = 0.55;
/** The windows' glow by day (a share of its night strength). */
const WINDOWS_DAY = 0.55;

/** The sun's height (degrees; below 0 it is down) and its compass bearing (degrees: 0 is +z, as `SKY.sunAzimuth`). */
function sunAt(hour: number): { elevation: number; azimuth: number } {
  if (hour >= SUNRISE && hour <= SUNSET) {
    const u = (hour - SUNRISE) / (SUNSET - SUNRISE);
    return { elevation: NOON_ELEVATION * Math.sin(Math.PI * u), azimuth: 95 - 190 * u };
  }
  const night = 24 - (SUNSET - SUNRISE);
  const u = (((hour - SUNSET) % 24) + 24) % 24 / night;
  return { elevation: -40 * Math.sin(Math.PI * u), azimuth: -95 + 190 * u };
}

export function lightAt(hour: number): Light {
  const { elevation, azimuth } = sunAt(hour);
  const daylight = smoothstep(-8, 10, elevation);
  const twilight = Math.max(0, 1 - Math.abs(elevation) / 12) * 0.5;
  const sunUp = elevation > 0;
  // By day the sun; by night the moon, high on the other side. Both are faint at the horizon, so
  // the switch between them is not seen.
  const az = deg(sunUp ? azimuth : azimuth + 180);
  const el = deg(sunUp ? Math.max(elevation, 2) : MOON_ELEVATION);
  const sunColor = sunUp ? (elevation < 20 ? mix(SUN_LOW, SUN_MID, elevation / 20) : mix(SUN_MID, SUN_HIGH, Math.min(1, (elevation - 20) / 25))) : MOON;
  const sunIntensity = sunUp ? SUN_INTENSITY * smoothstep(0, 14, elevation) : MOON_INTENSITY * smoothstep(0, 10, -elevation);
  return {
    background: mix(mix(NIGHT.background, DAY.background, daylight), TWILIGHT, twilight),
    hemisphereSky: mix(mix(NIGHT.hemisphereSky, DAY.hemisphereSky, daylight), TWILIGHT, twilight * 0.6),
    hemisphereGround: mix(NIGHT.hemisphereGround, DAY.hemisphereGround, daylight),
    hemisphereIntensity: NIGHT.hemisphereIntensity + (DAY.hemisphereIntensity - NIGHT.hemisphereIntensity) * daylight,
    sun: sunColor,
    sunIntensity,
    sunDirection: [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)],
    windows: WINDOWS_DAY + (1 - WINDOWS_DAY) * (1 - daylight),
    exposure: 1 + 0.15 * (1 - daylight),
    daylight,
  };
}

const deg = (d: number) => (d * Math.PI) / 180;

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Mixes two sRGB hex colors. */
function mix(a: number, b: number, t: number): number {
  t = Math.min(1, Math.max(0, t));
  const ch = (c: number, s: number) => (c >> s) & 255;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
  return m(16) | m(8) | m(0);
}
