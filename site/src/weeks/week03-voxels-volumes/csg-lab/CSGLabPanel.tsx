import { useEffect } from "react";
import { IconChevronRight, IconMove, IconRedo, IconRefresh, IconRotate, IconScale, IconSliders, IconUndo } from "../icons";
import { TreeDiagram } from "./TreeDiagram";
import { CSG_LAB_OPERATIONS, PRIMITIVE_META } from "./types";
import type { TransformMode } from "./types";
import { OPERATION_VISUALS, PRIMITIVE_VISUALS } from "./nodeVisuals";
import type { CSGLabController } from "./state";

const TRANSFORM_MODES: { id: TransformMode; label: string; icon: JSX.Element }[] = [
  { id: "translate", label: "Move", icon: <IconMove /> },
  { id: "rotate", label: "Rotate", icon: <IconRotate /> },
  { id: "scale", label: "Scale", icon: <IconScale /> },
];

function SectionHeading({ children }: { children: string }) {
  return <h3 className="text-sm font-semibold text-slate-200">{children}</h3>;
}

export function CSGLabPanel({ state }: { state: CSGLabController }) {
  const canCombine = state.selectedRootIds.length === 2;
  const canRemove = state.selectedRootIds.length === 1;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      if (event.shiftKey) state.redo();
      else state.undo();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.undo, state.redo]);

  return (
    <>
      <button
        onClick={state.togglePanel}
        className="pointer-events-auto absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-slate-700/50 bg-slate-900/70 text-slate-300 shadow-lg shadow-black/30 backdrop-blur-md transition-colors hover:text-cyan-300"
        aria-label={state.panelOpen ? "Close settings panel" : "Open settings panel"}
      >
        {state.panelOpen ? <IconChevronRight /> : <IconSliders />}
      </button>
      <div
        className={
          "pointer-events-auto absolute right-0 top-0 flex h-full w-80 max-w-[85vw] flex-col gap-6 overflow-y-auto border-l border-slate-700/50 bg-slate-900/70 p-6 pt-16 shadow-2xl shadow-black/40 backdrop-blur-xl transition-transform duration-300 " +
          (state.panelOpen ? "translate-x-0" : "translate-x-full")
        }
      >
        <section className="flex flex-col gap-3">
          <SectionHeading>1. Voxel Volume Inputs</SectionHeading>
          <div className="grid grid-cols-3 gap-2">
            {PRIMITIVE_META.map((meta) => {
              const visual = PRIMITIVE_VISUALS[meta.id];
              return (
                <button
                  key={meta.id}
                  onClick={() => state.addPrimitive(meta.id)}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-700/50 bg-slate-800/50 py-3 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700/60"
                >
                  <span className={visual.color}>{visual.icon}</span>
                  {meta.name}
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeading>2. CSG Operations</SectionHeading>
          <div className="grid grid-cols-3 gap-2">
            {CSG_LAB_OPERATIONS.map((operation) => {
              const visual = OPERATION_VISUALS[operation.id];
              const armed = state.previewOperation === operation.id;
              return (
                <button
                  key={operation.id}
                  onClick={() => state.armPreview(operation.id)}
                  disabled={!canCombine}
                  title={canCombine ? operation.explanation : "Select two shapes below to enable this"}
                  className={
                    "flex flex-col items-center gap-1.5 rounded-xl border py-3 text-xs font-medium transition-colors " +
                    (!canCombine
                      ? "cursor-not-allowed border-slate-800/50 bg-slate-800/20 text-slate-600"
                      : armed
                        ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-200"
                        : "border-slate-700/50 bg-slate-800/50 text-slate-300 hover:bg-slate-700/60")
                  }
                >
                  <span className={canCombine ? visual.color : ""}>{visual.icon}</span>
                  {operation.name}
                </button>
              );
            })}
          </div>
          {canRemove && (
            <button
              onClick={state.removeSelectedRoot}
              className="rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-left text-xs font-medium text-red-300 transition-colors hover:bg-red-500/20"
            >
              Remove selected shape
            </button>
          )}
          {canCombine && state.previewOperation && (
            <div className="flex gap-2">
              <button
                onClick={state.confirmPreview}
                className="flex-1 rounded-xl border border-cyan-400/50 bg-cyan-500/20 px-3 py-2 text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/30"
              >
                Apply
              </button>
              <button
                onClick={state.cancelPreview}
                className="rounded-xl border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700/60"
              >
                Cancel
              </button>
            </div>
          )}
          {!canCombine && !canRemove && (
            <p className="text-xs text-slate-400">Select two shapes below to combine them, or one to remove it.</p>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeading>3. Object Manipulation</SectionHeading>
          {canRemove ? (
            <div className="grid grid-cols-3 gap-2">
              {TRANSFORM_MODES.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => state.setTransformMode(mode.id)}
                  className={
                    "flex flex-col items-center gap-1.5 rounded-xl border py-3 text-xs font-medium transition-colors " +
                    (state.transformMode === mode.id
                      ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-200"
                      : "border-slate-700/50 bg-slate-800/50 text-slate-300 hover:bg-slate-700/60")
                  }
                >
                  {mode.icon}
                  {mode.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Select one shape below to move, rotate, or scale it with the on-screen gizmo.</p>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <SectionHeading>4. CSG Tree / Operation History</SectionHeading>
            <div className="flex items-center gap-1">
              <button
                onClick={state.undo}
                disabled={!state.canUndo}
                title="Undo (Ctrl/Cmd+Z)"
                className={
                  "flex h-6 w-6 items-center justify-center rounded-lg border transition-colors " +
                  (state.canUndo
                    ? "border-slate-700/50 bg-slate-800/50 text-slate-300 hover:bg-slate-700/60"
                    : "cursor-not-allowed border-slate-800/50 bg-slate-800/20 text-slate-600")
                }
              >
                <IconUndo />
              </button>
              <button
                onClick={state.redo}
                disabled={!state.canRedo}
                title="Redo (Ctrl/Cmd+Shift+Z)"
                className={
                  "flex h-6 w-6 items-center justify-center rounded-lg border transition-colors " +
                  (state.canRedo
                    ? "border-slate-700/50 bg-slate-800/50 text-slate-300 hover:bg-slate-700/60"
                    : "cursor-not-allowed border-slate-800/50 bg-slate-800/20 text-slate-600")
                }
              >
                <IconRedo />
              </button>
              {state.roots.length > 0 && (
                <button
                  onClick={state.resetAll}
                  title="Remove every shape and start over"
                  className="flex items-center gap-1 rounded-lg border border-slate-700/50 bg-slate-800/50 px-2 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:bg-slate-700/60"
                >
                  <IconRefresh />
                  Reset
                </button>
              )}
            </div>
          </div>
          <TreeDiagram state={state} />
        </section>
      </div>
    </>
  );
}
