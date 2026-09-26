import { useState } from "react";
import { IconChevronDown, IconEye, IconEyeOff, IconTrash } from "../icons";
import { CSG_LAB_OPERATIONS, PRIMITIVE_META } from "./types";
import type { CSGTreeNode } from "./types";
import type { CSGLabController } from "./state";
import { OPERATION_VISUALS, PRIMITIVE_VISUALS } from "./nodeVisuals";

function nodeLabel(node: CSGTreeNode): string {
  if (node.kind === "primitive") {
    return PRIMITIVE_META.find((meta) => meta.id === node.primitiveType)?.name ?? node.primitiveType;
  }
  return CSG_LAB_OPERATIONS.find((meta) => meta.id === node.operation)?.name ?? node.operation;
}

function nodeVisual(node: CSGTreeNode): { icon: JSX.Element; color: string } {
  return node.kind === "primitive" ? PRIMITIVE_VISUALS[node.primitiveType] : OPERATION_VISUALS[node.operation];
}

// An indented-list "layer panel" style tree: each node is a row with a collapse chevron
// (operations only), an icon + label, and a visibility toggle. Children are wrapped one level
// deeper (left border + padding) — recursion handles indentation, no depth bookkeeping needed.
function TreeNode({
  node,
  state,
  collapsed,
  onToggleCollapse,
  isRoot = false,
}: {
  node: CSGTreeNode;
  state: CSGLabController;
  collapsed: Set<string>;
  onToggleCollapse: (id: string) => void;
  /** Only top-level shapes can be deleted, so only their rows get the bin. */
  isRoot?: boolean;
}) {
  const isInspected = node.id === state.inspectedNodeId;
  // Nested (non-root) ids never appear in selectedRootIds by construction, so this check
  // naturally only ever highlights top-level roots without needing an extra guard here.
  const isSelected = state.selectedRootIds.includes(node.id);
  const { icon, color } = nodeVisual(node);
  const isOperation = node.kind === "operation";
  const isCollapsed = collapsed.has(node.id);

  return (
    <div className="flex flex-col gap-1">
      <div
        className={
          "flex items-center gap-1 rounded-lg border pr-1 text-xs font-medium transition-colors " +
          (isSelected
            ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-200"
            : isInspected
              ? "border-slate-400/60 bg-slate-700/60 text-slate-100"
              : "border-transparent bg-slate-800/50 text-slate-300 hover:bg-slate-700/40")
        }
      >
        {isOperation ? (
          <button
            onClick={() => onToggleCollapse(node.id)}
            aria-label={isCollapsed ? "Expand" : "Collapse"}
            className={"flex h-7 w-6 shrink-0 items-center justify-center text-slate-400 transition-transform hover:text-slate-200 " + (isCollapsed ? "-rotate-90" : "")}
          >
            <IconChevronDown />
          </button>
        ) : (
          <span className="h-7 w-1 shrink-0" />
        )}
        <button onClick={() => state.inspectNode(node.id)} className="flex flex-1 items-center gap-2 py-1.5 text-left">
          <span className={color}>{icon}</span>
          <span className={node.hidden ? "text-slate-500 line-through" : ""}>{nodeLabel(node)}</span>
        </button>
        <button
          onClick={() => state.toggleHidden(node.id)}
          title={node.hidden ? "Show this shape" : "Hide this shape"}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:text-slate-200"
        >
          {node.hidden ? <IconEyeOff /> : <IconEye />}
        </button>
        {isRoot && (
          <button
            onClick={() => state.removeRoot(node.id)}
            title="Delete this shape"
            aria-label="Delete this shape"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:text-red-400"
          >
            <IconTrash />
          </button>
        )}
      </div>
      {isOperation && !isCollapsed && (
        <div className="ml-3 flex flex-col gap-1 border-l border-slate-700/50 pl-3">
          <TreeNode node={node.left} state={state} collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
          <TreeNode node={node.right} state={state} collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
        </div>
      )}
    </div>
  );
}

export function TreeDiagram({ state }: { state: CSGLabController }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (state.roots.length === 0) {
    return <p className="text-xs text-slate-400">Add a shape from the palette above to get started.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {state.roots.map((root) => (
        <TreeNode key={root.id} node={root} state={state} collapsed={collapsed} onToggleCollapse={toggleCollapse} isRoot />
      ))}
    </div>
  );
}
