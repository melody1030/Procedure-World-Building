import type { ReactNode } from "react";
import { linkProps } from "../../router";
import { HEADING, RULE } from "../ui/kit";

/** The grammar pages' shared pieces: the Building | Simulation switch, a panel section, a stat line. */

const PAGES = [
  { path: "/grammar", label: "Building" },
  { path: "/grammar/simulation", label: "Simulation" },
];

/** The switch between the grammar's two pages, at the top of the left column. */
export function PageSwitch({ path }: { path: string }) {
  return (
    <nav className="flex rounded-lg border border-[#7db4e6]/20 bg-[#0e1c30]/60 p-0.5 text-[12px] font-medium" aria-label="Grammar pages">
      {PAGES.map((p) => (
        <a
          key={p.path}
          {...linkProps(p.path)}
          aria-current={p.path === path ? "page" : undefined}
          className={
            "flex-1 rounded-md px-2 py-1 text-center transition-colors " +
            (p.path === path ? "bg-[#5ad8ff]/15 text-white" : "text-[#9db2c8] hover:text-white")
          }
        >
          {p.label}
        </a>
      ))}
    </nav>
  );
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={"flex flex-col gap-3 border-t pt-3 first:border-t-0 first:pt-0 " + RULE}>
      <h2 className={"m-0 " + HEADING}>{title}</h2>
      {children}
    </section>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[#9db2c8]">{label}</dt>
      <dd className="m-0 text-right font-mono tabular-nums text-[#ffd27a]">{value}</dd>
    </>
  );
}

/** A count in thousands, to one decimal (28,048 → 28.0k), or millions past that. */
export const thousands = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);
