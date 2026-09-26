import { SidePanel } from "../../../components/SidePanel";
import { IconSliders } from "../icons";
import { SliderField } from "../SliderField";
import { MeshGenStepper } from "./MeshGenStepper";
import { DEFAULT_MESH_OPTIONS, MESH_METHODS } from "./types";
import type { MeshMethodId } from "./meshers";
import type { MeshGenParams, MeshOptions, MeshStats } from "./types";

function SectionHeading({ children }: { children: string }) {
  return <h3 className="font-display text-sm font-bold uppercase tracking-wider text-slate-400">{children}</h3>;
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        className={
          "rounded-xl border px-3 py-2 text-left text-xs font-medium transition-colors " +
          (checked
            ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-200"
            : "border-slate-700/50 bg-slate-800/50 text-slate-300 hover:bg-slate-700/60")
        }
      >
        {label}: {checked ? "on" : "off"}
      </button>
      <p className="text-[11px] text-slate-500">{hint}</p>
    </div>
  );
}

export function MeshGenPanel({
  params,
  onChange,
  stats,
  open,
  onToggleOpen,
}: {
  params: MeshGenParams;
  onChange: (patch: Partial<MeshGenParams>) => void;
  stats: MeshStats | null;
  open: boolean;
  onToggleOpen: () => void;
}) {
  const method = MESH_METHODS.find((m) => m.id === params.method) ?? MESH_METHODS[0];
  const options = params.options;
  const setOption = (patch: Partial<MeshOptions>) => onChange({ options: { ...options, ...patch } });

  return (
    <SidePanel side="right" open={open} onToggle={onToggleOpen} widthRem={16.2} closedIcon={<IconSliders />} label="settings panel">
        <section className="flex flex-col gap-3">
          <SectionHeading>Mode</SectionHeading>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: false, label: "Explore" },
              { id: true, label: "Step-by-step" },
            ].map((mode) => (
              <button
                key={mode.label}
                onClick={() => {
                  onChange({ stepMode: mode.id, step: 0, progress: 0 });
                }}
                className={
                  "rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors " +
                  (params.stepMode === mode.id
                    ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-200"
                    : "border-slate-700/50 bg-slate-800/50 text-slate-300 hover:bg-slate-700/60")
                }
              >
                {mode.label}
              </button>
            ))}
          </div>
        </section>

        {!params.stepMode && (
          <>
            <section className="flex flex-col gap-3">
              <SectionHeading>Method</SectionHeading>
              <select
                value={params.method}
                onChange={(event) => onChange({ method: event.target.value as MeshMethodId })}
                className="w-full cursor-pointer rounded-xl border border-slate-700/50 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-400/50"
              >
                {MESH_METHODS.map((m) => (
                  <option key={m.id} value={m.id} className="bg-slate-900 text-slate-200">
                    {m.name}
                  </option>
                ))}
              </select>
            </section>

            <section className="flex flex-col gap-3">
              <SectionHeading>How it works</SectionHeading>
              <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2.5">
                <p className="text-xs text-slate-300">{method.summary}</p>
                <ol className="mt-2 flex list-decimal flex-col gap-1 pl-4 text-xs text-slate-400">
                  {method.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <SectionHeading>Controls</SectionHeading>
                <button
                  onClick={() => onChange({ options: DEFAULT_MESH_OPTIONS })}
                  className="rounded-lg border border-slate-700/50 bg-slate-800/50 px-2 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:bg-slate-700/60"
                >
                  Reset
                </button>
              </div>

              <div className="flex flex-col gap-1">
                <SliderField label="Threshold" value={options.iso} min={-1.2} max={1.2} step={0.05} onChange={(iso) => setOption({ iso })} />
                <p className="text-[11px] text-slate-500">Moves the surface in or out, which changes which voxels are filled and where the mesh sits.</p>
              </div>

              {params.method === "culled" && (
                <ToggleRow
                  label="Cull hidden faces"
                  hint="Turn this off to add all 6 faces of every voxel, including buried ones, and see how much culling saves."
                  checked={options.cullHidden}
                  onChange={(cullHidden) => setOption({ cullHidden })}
                />
              )}

            {params.method === "greedy" && (
              <div className="flex flex-col gap-1">
                <SliderField label="Max quad size" value={options.maxQuad} min={1} max={20} step={1} onChange={(maxQuad) => setOption({ maxQuad: Math.round(maxQuad) })} />
                <p className="text-[11px] text-slate-500">Caps how big a rectangle can grow. 1 means no merging (same as Culled Faces) and 20 means fully greedy.</p>
              </div>
            )}

            {params.method === "marching" && (
              <ToggleRow
                label="Interpolate along edges"
                hint="Turn this off to put every vertex at its edge's midpoint, so the surface snaps to coarse positions."
                checked={options.interpolate}
                onChange={(interpolate) => setOption({ interpolate })}
              />
            )}

            {params.method === "surfacenets" && (
              <ToggleRow
                label="Average edge crossings"
                hint="Turn this off to put each vertex at its cell's centre, so the surface follows the voxel grid instead of the density."
                checked={options.vertexPlacement === "average"}
                onChange={(average) => setOption({ vertexPlacement: average ? "average" : "center" })}
              />
            )}

            {params.method === "dual" && (
              <>
                <div className="flex flex-col gap-1">
                  <SliderField label="Sharpness" value={options.sharpness} min={0} max={1} step={0.05} onChange={(sharpness) => setOption({ sharpness })} />
                  <p className="text-[11px] text-slate-500">Controls the QEF regularization. 0 pulls vertices to the average crossing (like Surface Nets) and 1 snaps them onto sharp corners.</p>
                </div>
                <ToggleRow
                  label="Clamp to cell"
                  hint="Turn this off to let vertices leave their cell. Corners get sharper, but the mesh can spike and intersect itself."
                  checked={options.clampToCell}
                  onChange={(clampToCell) => setOption({ clampToCell })}
                />
              </>
            )}
            </section>
          </>
        )}

        {params.stepMode && <MeshGenStepper params={params} onChange={onChange} />}

        <section className="flex flex-col gap-2">
          <SectionHeading>Output</SectionHeading>
          {stats ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl border border-slate-700/50 bg-slate-800/40 px-3 py-2.5 font-mono text-xs">
              <dt className="text-slate-500">Vertices</dt>
              <dd className="text-right text-cyan-300">{stats.vertices.toLocaleString()}</dd>
              <dt className="text-slate-500">Faces ({stats.faceKind})</dt>
              <dd className="text-right text-cyan-300">{stats.faces.toLocaleString()}</dd>
              <dt className="text-slate-500">Triangles</dt>
              <dd className="text-right text-cyan-300">{stats.triangles.toLocaleString()}</dd>
              <dt className="text-slate-500">Filled voxels</dt>
              <dd className="text-right text-cyan-300">{stats.voxels.toLocaleString()}</dd>
              <dt className="text-slate-500">Build time</dt>
              <dd className="text-right text-cyan-300">{stats.ms.toFixed(1)} ms</dd>
            </dl>
          ) : (
            <p className="text-xs text-slate-400">Building…</p>
          )}
        </section>
    </SidePanel>
  );
}
