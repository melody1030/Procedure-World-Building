import { useEffect, useState, type ReactNode } from "react";
import type { WeekConfigHandle } from "../firebase/weekConfig";
import { linkProps } from "../router";
import { weeks } from "../weeks/registry";
import { AccountMenu } from "./AccountMenu";

// `short` ("Week 5") is shown in the top bar until there is room for the full title.
const NAV_ITEMS = [
  { path: "/", label: "Home", short: "Home" },
  ...weeks.map((week) => ({ path: `/${week.id}`, label: week.title, short: week.title.split(" — ")[0] })),
];

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
      {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
    </svg>
  );
}

function NavLink({ path, active, title, children }: { path: string; active: boolean; title: string; children: ReactNode }) {
  return (
    <a
      {...linkProps(path)}
      title={title}
      aria-current={active ? "page" : undefined}
      className={
        // The underline sits on the header's bottom border, glowing cyan on the active page.
        "relative flex items-center whitespace-nowrap px-3 font-display text-[0.95rem] font-bold transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors " +
        (active
          ? "text-cyan-300 after:bg-cyan-400 after:shadow-[0_0_10px_rgba(34,211,238,0.7)]"
          : "text-slate-400 after:bg-transparent hover:text-cyan-300 hover:after:bg-cyan-400/30")
      }
    >
      {children}
    </a>
  );
}

/** App-wide top bar: title, Home and week links, and sign-in. Collapses to a menu below `lg`. */
export function SiteHeader({ path, configHandle, weekTitle }: { path: string; configHandle: WeekConfigHandle | null; weekTitle: string }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [path]);

  return (
    <header className="relative z-20 border-b border-slate-700/50 bg-slate-900/60 backdrop-blur-xl">
      <div className="flex h-[62px] items-stretch gap-3 px-4 sm:gap-6 sm:px-6 lg:px-10">
        <a {...linkProps("/")} className="flex items-center whitespace-nowrap font-display text-base font-bold sm:text-[1.15rem] tracking-[0.02em] text-slate-200">
          Procedural World Building
        </a>
        <nav className="hidden items-stretch gap-2 lg:flex" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.path} path={item.path} active={item.path === path} title={item.label}>
              <span className="2xl:hidden">{item.short}</span>
              <span className="hidden 2xl:inline">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <AccountMenu handle={configHandle} weekTitle={weekTitle} />
          <button
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-slate-700/50 text-slate-300 transition-colors hover:text-cyan-300 lg:hidden"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            <MenuIcon open={menuOpen} />
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav className="flex flex-col border-t border-slate-700/50 bg-slate-900/95 py-2 lg:hidden" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.path}
              {...linkProps(item.path)}
              aria-current={item.path === path ? "page" : undefined}
              className={
                "border-l-2 px-6 py-2.5 font-display text-[0.95rem] font-bold transition-colors " +
                (item.path === path ? "border-cyan-400 text-cyan-300" : "border-transparent text-slate-400 hover:text-cyan-300")
              }
            >
              {item.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
