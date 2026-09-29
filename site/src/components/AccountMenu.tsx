import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { captureThumbnail, deleteConfig, saveConfig, watchConfigs, type SavedConfig } from "../firebase/configs";
import { firebaseEnabled } from "../firebase/firebase";
import { signInWithGoogle, signOutUser, useAuth } from "../firebase/useAuth";
import type { WeekConfigHandle } from "../firebase/weekConfig";
import { headingClass } from "./controls";

const buttonClass =
  "flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const neutralButton = buttonClass + " border-slate-700/50 bg-slate-800/50 text-slate-200 hover:bg-slate-700/60";
const activeButton = buttonClass + " border-cyan-400/60 bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30";

function friendlyError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? "";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "";
  if (code === "auth/operation-not-allowed" || code === "auth/configuration-not-found") {
    return "Google sign-in isn't turned on for this Firebase project yet.";
  }
  if (code === "auth/popup-blocked") return "The sign-in window was blocked. Allow pop-ups for this site and try again.";
  if (code === "permission-denied") return "Firestore refused the request. Check the security rules.";
  return error instanceof Error ? error.message : String(error);
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}

/** The save / load card for the active week. */
function ConfigPanel({ user, handle, weekTitle, onLoaded }: { user: User; handle: WeekConfigHandle | null; weekTitle: string; onLoaded: () => void }) {
  const [configs, setConfigs] = useState<SavedConfig[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const weekId = handle?.weekId;

  useEffect(() => {
    if (!weekId) return;
    setConfigs(null);
    return watchConfigs(user.uid, weekId, setConfigs, (e) => setError(friendlyError(e)));
  }, [user.uid, weekId]);

  if (!handle) {
    return <p className="text-xs text-slate-400">This page has no settings to save.</p>;
  }

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const thumbnail = await captureThumbnail(document.querySelector("main"));
      const label = name.trim() || `${weekTitle.split(" — ")[0]} config ${new Date().toLocaleString()}`;
      await saveConfig(user.uid, handle.weekId, label.slice(0, 80), handle.getData(), thumbnail);
      setName("");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const load = (config: SavedConfig) => {
    try {
      handle.applyData(JSON.parse(config.dataJson));
      onLoaded();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const remove = async (config: SavedConfig) => {
    if (!window.confirm(`Delete "${config.name}"? This cannot be undone.`)) return;
    try {
      await deleteConfig(user.uid, config.id);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) save();
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name this configuration"
          maxLength={80}
          className="min-w-0 flex-1 rounded-xl border border-slate-700/50 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-200 outline-none placeholder:text-slate-500 hover:border-slate-500 focus:border-cyan-400/50"
        />
        <button type="submit" disabled={busy} className={activeButton}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>

      {error && <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-2.5 py-2 text-[11px] leading-snug text-red-200">{error}</p>}

      <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
        {configs === null && <p className="text-xs text-slate-500">Loading…</p>}
        {configs?.length === 0 && (
          <p className="text-[11px] leading-snug text-slate-500">
            Nothing saved for this week yet. Set things up the way you like, name it, and press Save.
          </p>
        )}
        {configs?.map((config) => (
          <div key={config.id} className="flex items-center gap-2.5 rounded-xl border border-slate-700/50 bg-slate-800/40 p-1.5">
            {config.thumbnail ? (
              <img src={config.thumbnail} alt="" className="h-10 w-14 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="h-10 w-14 shrink-0 rounded-lg bg-stage" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-slate-200" title={config.name}>
                {config.name}
              </p>
              <p className="font-mono text-[10px] text-slate-500">{config.createdAt?.toDate().toLocaleString() ?? ""}</p>
            </div>
            <button onClick={() => load(config)} className={neutralButton + " px-2.5 py-1"}>
              Load
            </button>
            <button
              onClick={() => remove(config)}
              title="Delete this configuration"
              aria-label={`Delete ${config.name}`}
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition-colors hover:text-red-400"
            >
              <TrashIcon />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Top-bar sign-in, and the Configurations menu once signed in. */
export function AccountMenu({ handle, weekTitle }: { handle: WeekConfigHandle | null; weekTitle: string }) {
  const { user, ready } = useAuth();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user || !handle) setOpen(false);
  }, [user, handle]);

  if (!firebaseEnabled || !ready) return null;

  if (!user) {
    return (
      <div className="relative ml-auto flex items-center">
        {/* Signs in with Google (see firebase/useAuth.ts). */}
        <button
          className="flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl border border-cyan-400/60 bg-slate-950/40 px-3 py-2 font-display sm:px-4 text-[0.95rem] font-bold text-cyan-300 transition hover:border-cyan-300 hover:bg-cyan-500/10 hover:text-cyan-200 hover:shadow-[0_0_18px_rgba(34,211,238,0.35)]"
          onClick={() => {
            setError("");
            signInWithGoogle().catch((e) => setError(friendlyError(e)));
          }}
        >
          <UserIcon />
          Sign In
        </button>
        {error && (
          <p className="absolute right-0 top-full z-30 mt-2 w-64 rounded-lg border border-red-400/30 bg-slate-900/95 px-2.5 py-2 text-[11px] leading-snug text-red-200 shadow-lg shadow-black/40">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="relative ml-auto flex items-center gap-3">
      {/* Only pages that registered settings (the weeks) have something to save. */}
      {handle && (
        <button className={open ? activeButton : neutralButton} onClick={() => setOpen((prev) => !prev)} aria-expanded={open}>
          Configurations
        </button>
      )}
      <div className="flex items-center gap-2" title={user.email ?? ""}>
        {user.photoURL && <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="h-7 w-7 rounded-full" />}
        <span className="hidden max-w-[10rem] truncate text-xs text-slate-300 md:inline">{user.displayName ?? user.email}</span>
      </div>
      <button className="cursor-pointer text-xs text-slate-400 transition-colors hover:text-cyan-300" onClick={() => signOutUser()}>
        Sign out
      </button>

      {open && (
        // Solid rather than glass: the top bar's own backdrop blur stops a child from blurring the scene.
        <div className="absolute right-0 top-full z-30 mt-3 flex w-80 max-w-[90vw] flex-col gap-3 rounded-2xl border border-slate-700/50 bg-slate-900/95 p-4 shadow-2xl shadow-black/40">
          <div className={headingClass}>
            <span className="flex-1">Saved configurations</span>
          </div>
          <p className="-mt-1.5 text-[11px] text-slate-500">{weekTitle}. Saved to your account, visible only to you.</p>
          <ConfigPanel user={user} handle={handle} weekTitle={weekTitle} onLoaded={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
