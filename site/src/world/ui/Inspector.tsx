import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { isTextEntry } from "../../components/SidePanel";
import type { Life, Need, Person } from "../life/agents";
import type { Vehicle } from "../life/traffic";
import type { WorldView } from "../render/WorldView";
import type { Selection } from "../render/select";
import { GLASS } from "./kit";

/**
 * The inspector (Milestone 4 of docs/plans/city-controls-plan.md): a card beside whatever was
 * clicked in the city, saying what it is, what it is doing and why. It follows the selection on
 * screen every frame, flipping to the other side to stay in view, and its contents refresh four
 * times a second (not every frame, to keep React out of the render loop). On a phone it is a
 * drawer at the bottom instead. × or Escape closes it, as does clicking empty ground.
 */

/** The card's width (px, before the interface's zoom), its gap from the selection, and the margin it keeps from the edges. */
const WIDTH = 272;
const GAP = 18;
const EDGE = 10;
/** How often the contents refresh (ms). */
const REFRESH = 250;
/** Below this width (px) the card is a bottom drawer. */
const PHONE = 640;

const NEEDS: Need[] = ["thirst", "rest", "social", "home"];
const NEED_LABEL: Record<Need, string> = { thirst: "Thirst", rest: "Rest", social: "Company", home: "Home" };
/** A need is due (the person goes to meet it) at this level; see Life.choose. */
const DUE: Record<Need, number> = { thirst: 0.7, rest: 0.7, social: 0.7, home: 1 };

const MOTION: Record<Person["motion"], string> = {
  stand: "standing",
  walk: "walking",
  step: "stepping along",
  "wait-to-cross": "waiting to cross",
  squeeze: "squeezing past",
  wander: "wandering",
  "make-way": "making way",
};

const TASK: Record<Vehicle["task"], string> = {
  roam: "Driving about",
  route: "On its route",
  cruise: "Cruising for a fare",
  fetch: "Fetching a fare",
  carry: "Carrying a fare",
};

const LIMIT: Record<Vehicle["limit"], string> = {
  free: "clear road",
  bend: "slowing for a bend",
  lead: "behind another vehicle",
  people: "people in the way",
  creep: "edging past people",
  line: "waiting at the stop line",
  halt: "at its halt",
};

const VEHICLE_ACTIVITY: Record<Vehicle["activity"], string> = { drive: "Driving", stand: "Standing", off: "Off the island" };

function personActivity(p: Person): string {
  if (p.activity === "ride") return p.ride === "taxi" ? "Riding a taxi" : "Riding the bus";
  if (p.activity === "away") return "Indoors";
  if (p.activity === "use") {
    switch (p.use) {
      case "seat":
        return "Sitting";
      case "vending":
        return "At a vending machine";
      case "circle":
        return "Talking";
      case "shelter":
        return "Waiting for a bus";
      case "curb":
        return "Hailing a taxi";
      default:
        return "Busy";
    }
  }
  if (p.leg === "door") return "Getting on";
  if (p.leg === "front" || p.leg === "onto") return "Going to sit";
  if (p.leg === "off") return "Getting up";
  return p.need ? "Walking" : "Strolling";
}

function forHowLong(seconds: number): string {
  if (seconds < 60) return `for ${Math.max(1, Math.round(seconds))} s`;
  const m = Math.floor(seconds / 60);
  return `for ${m} min ${Math.round(seconds - m * 60)} s`;
}

function title(kind: string, n: number) {
  return `${kind} ${n + 1}`;
}

/** What the card says about the selection, or null if it is gone. */
function describe(sel: Selection, life: Life | null): { name: string; badges: string[]; why?: string; since?: number; body?: ReactNode } | null {
  if (!life) return null;
  if (sel.kind === "person") {
    const p = life.people[sel.index];
    if (!p) return null;
    const badges = [personActivity(p)];
    if (p.activity === "walk" || p.activity === "use") badges.push(MOTION[p.motion]);
    return { name: title("Person", sel.index), badges, why: p.why, since: p.since, body: <NeedMeters person={p} /> };
  }
  if (sel.kind === "pigeon") {
    const b = life.pigeons[sel.index];
    if (!b) return null;
    const what = b.activity === "fly" ? "Flying with its flock" : b.activity === "land" ? "Coming down to land" : "On the ground";
    return { name: title("Pigeon", sel.index), badges: [what], why: b.why, since: b.since, body: <Facts rows={[["Flock", String(b.flock + 1)]]} /> };
  }
  if (sel.kind === "cat") {
    const c = life.cats[sel.index];
    if (!c) return null;
    const what = c.activity === "hunt" ? (c.stage === "stalk" ? "Stalking a pigeon" : "Sprinting at a pigeon") : c.activity === "flee" ? "Fleeing" : c.activity === "rest" ? "Resting" : "Prowling";
    return { name: title("Cat", sel.index), badges: [what], why: c.why, since: c.since };
  }
  const v = life.traffic.vehicles[sel.index];
  if (!v) return null;
  const kind = v.kind[0].toUpperCase() + v.kind.slice(1);
  const name = v.kind === "bus" ? `Bus · route ${v.route + 1}` : title(kind, life.traffic.vehicles.filter((o, i) => o.kind === v.kind && i < sel.index).length);
  const rows: [string, string][] = [["Task", TASK[v.task]]];
  if (v.activity === "drive") rows.push(["Held by", LIMIT[v.limit]]);
  if (v.kind === "bus") {
    const stops = life.traffic.routes[v.route]?.stops.length ?? 0;
    if (stops) rows.push(["Next stop", `${(v.next % stops) + 1} of ${stops}`]);
    rows.push(["Riders", String(v.riders.length)]);
  }
  return { name, badges: [VEHICLE_ACTIVITY[v.activity]], why: v.why, since: v.since, body: <Facts rows={rows} /> };
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-[#9db2c8]">{k}</dt>
          <dd className="m-0 text-[#dce8f5]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A person's four needs as meters, full when due; the one being met is lit in amber. */
function NeedMeters({ person }: { person: Person }) {
  return (
    <ul className="m-0 grid list-none gap-1.5 p-0" aria-label="Needs">
      {NEEDS.map((need) => {
        const level = Math.min(1, person.needs[need] / DUE[need]);
        const current = person.need === need;
        return (
          <li key={need} className="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-[12px]">
            <span className={current ? "font-medium text-[#ffd27a]" : "text-[#9db2c8]"}>{NEED_LABEL[need]}</span>
            <span className="h-[5px] overflow-hidden rounded-full bg-[#24384f]" role="meter" aria-label={NEED_LABEL[need]} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
              <span className={"block h-full rounded-full " + (current ? "bg-[#ffd27a]" : level >= 1 ? "bg-[#5ad8ff]" : "bg-[#5ad8ff]/60")} style={{ width: `${level * 100}%` }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function Inspector({
  view,
  selection,
  following,
  life,
  scale,
  onClose,
  onFollow,
}: {
  view: WorldView | null;
  selection: Selection | null;
  following: boolean;
  life: Life | null;
  /** The interface's zoom (UI_SCALE), to place the card in screen pixels. */
  scale: number;
  onClose: () => void;
  onFollow: (on: boolean) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);
  const [phone, setPhone] = useState(() => window.innerWidth < PHONE);

  useEffect(() => {
    const onResize = () => setPhone(window.innerWidth < PHONE);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Refresh the contents a few times a second while something is selected.
  useEffect(() => {
    if (!selection) return;
    const timer = setInterval(() => setTick((t) => t + 1), REFRESH);
    return () => clearInterval(timer);
  }, [selection]);

  // Escape closes (not while typing).
  useEffect(() => {
    if (!selection) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isTextEntry(e.target)) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, onClose]);

  // Every frame: sit beside the selection, on its right unless that runs off screen, kept clear of
  // the edges. When it can't be seen (riding, behind the camera), the card waits at the top right.
  useLayoutEffect(() => {
    if (!selection || phone || !view) return;
    let frame = 0;
    const place = () => {
      const card = cardRef.current;
      if (card) {
        const w = WIDTH * scale;
        const h = card.offsetHeight * scale;
        const at = view.selectionOnScreen();
        let x: number;
        let y: number;
        if (at) {
          const clear = Math.min(at.reach, window.innerWidth / 4) + GAP * scale;
          x = at.x + clear;
          if (x + w > window.innerWidth - EDGE) x = at.x - clear - w;
          y = at.y - h / 2;
        } else {
          x = window.innerWidth - w - 80 * scale;
          y = 16 * scale;
        }
        x = Math.min(Math.max(EDGE, x), window.innerWidth - w - EDGE);
        y = Math.min(Math.max(EDGE, y), window.innerHeight - h - 90 * scale);
        card.style.transform = `translate(${x / scale}px, ${y / scale}px)`;
        card.style.visibility = "visible";
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [selection, phone, view, scale]);

  if (!selection) return null;
  const info = describe(selection, life);
  if (!info) return null;

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label={`${info.name}: inspector`}
      className={
        "pointer-events-auto absolute rounded-2xl border p-3.5 text-[#dce8f5] " +
        GLASS +
        (phone ? " inset-x-3 bottom-[5.5rem]" : " left-0 top-0 invisible")
      }
      style={phone ? undefined : { width: WIDTH }}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="m-0 font-display text-[15px] font-bold leading-tight text-white">{info.name}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the inspector"
          title="Close (Esc)"
          className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#9db2c8] transition-colors hover:bg-[#0e1c30]/70 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {info.badges.map((b, i) => (
          <span key={b} className={"rounded-md px-1.5 py-0.5 text-[11px] " + (i === 0 ? "bg-[#5ad8ff]/15 text-[#5ad8ff]" : "bg-[#7db4e6]/10 text-[#9db2c8]")}>
            {b}
          </span>
        ))}
      </div>
      {info.why && (
        <p className="mb-0 mt-2.5 text-[13px] leading-snug text-[#dce8f5]">
          “{info.why}”
          {info.since !== undefined && <span className="ml-1.5 font-mono text-[11px] text-[#ffd27a]">{forHowLong(info.since)}</span>}
        </p>
      )}
      {info.body && <div className="mt-3">{info.body}</div>}
      <button
        type="button"
        onClick={() => onFollow(!following)}
        aria-pressed={following}
        aria-keyshortcuts="6"
        className={
          "mt-3.5 flex w-full items-center justify-center gap-2 rounded-lg border py-1.5 text-[12px] transition-colors " +
          (following ? "border-[#5ad8ff]/50 bg-[#5ad8ff]/20 text-[#5ad8ff]" : "border-[#5ad8ff]/30 text-[#5ad8ff] hover:bg-[#5ad8ff]/10")
        }
      >
        {following ? "Following · stop" : "Follow"}
        <kbd className="rounded bg-[#ffd27a]/10 px-1 font-mono text-[10px] text-[#ffd27a]">6</kbd>
      </button>
    </div>
  );
}
