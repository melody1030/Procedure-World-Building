import { useCallback, useReducer } from "react";
import {
  addPrimitiveRoot,
  combineRoots,
  findNode,
  isRoot,
  removeRoot,
  toggleNodeHidden,
  updatePrimitiveParams as applyParamPatch,
  updateRootTransform,
} from "./treeLogic";
import type { TransformPatch } from "./treeLogic";
import type { CSGLabState, CSGOp, PrimitiveType, TransformMode } from "./types";

type Action =
  | { type: "ADD_PRIMITIVE"; primitiveType: PrimitiveType }
  | { type: "INSPECT_NODE"; id: string }
  | { type: "ARM_PREVIEW"; operation: CSGOp }
  | { type: "CANCEL_PREVIEW" }
  | { type: "CONFIRM_PREVIEW" }
  | { type: "REMOVE_ROOT"; id: string }
  | { type: "UPDATE_PRIMITIVE_PARAMS"; id: string; patch: Record<string, number> }
  | { type: "TRANSFORM_ROOT"; id: string; patch: TransformPatch }
  | { type: "TOGGLE_HIDDEN"; id: string }
  | { type: "SET_TRANSFORM_MODE"; mode: TransformMode }
  | { type: "TOGGLE_PANEL" }
  | { type: "RESET" };

const initialState: CSGLabState = {
  roots: [],
  selectedRootIds: [],
  inspectedNodeId: null,
  panelOpen: true,
  nextSlot: 0,
  previewOperation: null,
  transformMode: "translate",
};

function reducer(state: CSGLabState, action: Action): CSGLabState {
  switch (action.type) {
    case "ADD_PRIMITIVE": {
      const roots = addPrimitiveRoot(state.roots, action.primitiveType, state.nextSlot);
      return { ...state, roots, nextSlot: state.nextSlot + 1 };
    }
    case "INSPECT_NODE": {
      const { id } = action;
      let selectedRootIds = state.selectedRootIds;
      // Clicking always inspects the node; additionally, if it's a top-level root, the same
      // click toggles it into the combine-selection set (capped at 2, FIFO-evicting the oldest).
      if (isRoot(state.roots, id)) {
        if (selectedRootIds.includes(id)) {
          selectedRootIds = selectedRootIds.filter((existing) => existing !== id);
        } else {
          selectedRootIds = [...selectedRootIds, id];
          if (selectedRootIds.length > 2) selectedRootIds = selectedRootIds.slice(1);
        }
      }
      // Any change to the selected pair invalidates a still-armed preview.
      const previewOperation = selectedRootIds.length === 2 ? state.previewOperation : null;
      return { ...state, inspectedNodeId: id, selectedRootIds, previewOperation };
    }
    case "ARM_PREVIEW": {
      if (state.selectedRootIds.length !== 2) return state;
      return { ...state, previewOperation: action.operation };
    }
    case "CANCEL_PREVIEW":
      return { ...state, previewOperation: null };
    case "CONFIRM_PREVIEW": {
      if (state.selectedRootIds.length !== 2 || !state.previewOperation) return state;
      const [idA, idB] = state.selectedRootIds;
      const roots = combineRoots(state.roots, idA, idB, state.previewOperation);
      const newRoot = roots[roots.length - 1];
      return {
        ...state,
        roots,
        selectedRootIds: [],
        inspectedNodeId: newRoot ? newRoot.id : null,
        previewOperation: null,
      };
    }
    case "REMOVE_ROOT": {
      const roots = removeRoot(state.roots, action.id);
      if (roots.length === state.roots.length) return state;
      const selectedRootIds = state.selectedRootIds.filter((id) => id !== action.id);
      const inspectedNodeId = findNode(roots, state.inspectedNodeId) ? state.inspectedNodeId : null;
      const previewOperation = selectedRootIds.length === 2 ? state.previewOperation : null;
      return { ...state, roots, selectedRootIds, inspectedNodeId, previewOperation };
    }
    case "UPDATE_PRIMITIVE_PARAMS": {
      if (!isRoot(state.roots, action.id)) return state;
      return { ...state, roots: applyParamPatch(state.roots, action.id, action.patch) };
    }
    case "TRANSFORM_ROOT": {
      if (!isRoot(state.roots, action.id)) return state;
      return { ...state, roots: updateRootTransform(state.roots, action.id, action.patch) };
    }
    case "TOGGLE_HIDDEN":
      return { ...state, roots: toggleNodeHidden(state.roots, action.id) };
    case "SET_TRANSFORM_MODE":
      return { ...state, transformMode: action.mode };
    case "TOGGLE_PANEL":
      return { ...state, panelOpen: !state.panelOpen };
    case "RESET":
      return { ...initialState, panelOpen: state.panelOpen };
    default:
      return state;
  }
}

// Undo/redo wraps the reducer above rather than changing it: only actions that represent a
// meaningful structural edit push a history entry. Transient UI state (selection, an armed-but-
// not-yet-applied preview, the panel's open/closed flag, which gizmo is active) updates
// `present` in place without touching `past`/`future`, so undoing "add a cube" doesn't also
// have to step back through every click that happened to select something first.
const UNDOABLE_ACTION_TYPES = new Set<Action["type"]>([
  "ADD_PRIMITIVE",
  "CONFIRM_PREVIEW",
  "REMOVE_ROOT",
  "UPDATE_PRIMITIVE_PARAMS",
  "TRANSFORM_ROOT",
  "TOGGLE_HIDDEN",
  "RESET",
]);

const MAX_HISTORY = 50;

interface History {
  past: CSGLabState[];
  present: CSGLabState;
  future: CSGLabState[];
}

type HistoryAction = Action | { type: "UNDO" } | { type: "REDO" };

function historyReducer(history: History, action: HistoryAction): History {
  if (action.type === "UNDO") {
    if (history.past.length === 0) return history;
    const previous = history.past[history.past.length - 1];
    return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
  }
  if (action.type === "REDO") {
    if (history.future.length === 0) return history;
    const [next, ...rest] = history.future;
    return { past: [...history.past, history.present], present: next, future: rest };
  }

  const nextPresent = reducer(history.present, action);
  if (nextPresent === history.present) return history;
  if (!UNDOABLE_ACTION_TYPES.has(action.type)) {
    return { ...history, present: nextPresent };
  }
  return { past: [...history.past, history.present].slice(-MAX_HISTORY), present: nextPresent, future: [] };
}

export interface CSGLabController extends CSGLabState {
  addPrimitive: (type: PrimitiveType) => void;
  inspectNode: (id: string) => void;
  armPreview: (operation: CSGOp) => void;
  cancelPreview: () => void;
  confirmPreview: () => void;
  removeRoot: (id: string) => void;
  updatePrimitiveParams: (id: string, patch: Record<string, number>) => void;
  transformRoot: (id: string, patch: TransformPatch) => void;
  toggleHidden: (id: string) => void;
  setTransformMode: (mode: TransformMode) => void;
  togglePanel: () => void;
  resetAll: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useCSGLabState(): CSGLabController {
  const [history, dispatch] = useReducer(historyReducer, { past: [], present: initialState, future: [] });
  const state = history.present;

  const addPrimitive = useCallback((primitiveType: PrimitiveType) => dispatch({ type: "ADD_PRIMITIVE", primitiveType }), []);
  const inspectNode = useCallback((id: string) => dispatch({ type: "INSPECT_NODE", id }), []);
  const armPreview = useCallback((operation: CSGOp) => dispatch({ type: "ARM_PREVIEW", operation }), []);
  const cancelPreview = useCallback(() => dispatch({ type: "CANCEL_PREVIEW" }), []);
  const confirmPreview = useCallback(() => dispatch({ type: "CONFIRM_PREVIEW" }), []);
  const removeRoot = useCallback((id: string) => dispatch({ type: "REMOVE_ROOT", id }), []);
  const updatePrimitiveParams = useCallback(
    (id: string, patch: Record<string, number>) => dispatch({ type: "UPDATE_PRIMITIVE_PARAMS", id, patch }),
    [],
  );
  const transformRoot = useCallback((id: string, patch: TransformPatch) => dispatch({ type: "TRANSFORM_ROOT", id, patch }), []);
  const toggleHidden = useCallback((id: string) => dispatch({ type: "TOGGLE_HIDDEN", id }), []);
  const setTransformMode = useCallback((mode: TransformMode) => dispatch({ type: "SET_TRANSFORM_MODE", mode }), []);
  const togglePanel = useCallback(() => dispatch({ type: "TOGGLE_PANEL" }), []);
  const resetAll = useCallback(() => dispatch({ type: "RESET" }), []);
  const undo = useCallback(() => dispatch({ type: "UNDO" }), []);
  const redo = useCallback(() => dispatch({ type: "REDO" }), []);

  return {
    ...state,
    addPrimitive,
    inspectNode,
    armPreview,
    cancelPreview,
    confirmPreview,
    removeRoot,
    updatePrimitiveParams,
    transformRoot,
    toggleHidden,
    setTransformMode,
    togglePanel,
    resetAll,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
