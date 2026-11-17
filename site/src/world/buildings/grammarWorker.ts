import { buildGrammar, type GrammarParams } from "./grammar";

/**
 * Builds grammar buildings off the main thread for Simulation (see grammarPool.ts). Each message
 * is one building; the reply hands its geometry's buffers over rather than copying them.
 */

export interface GrammarJob {
  key: string;
  params: GrammarParams;
  seed: number;
}

export interface GrammarDone {
  key: string;
  model: ReturnType<typeof buildGrammar>["model"];
  vertices: number;
  ms: number;
}

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<GrammarJob>) => void) | null;
  postMessage: (message: GrammarDone, transfer: Transferable[]) => void;
};

scope.onmessage = (e) => {
  const { key, params, seed } = e.data;
  const { model, stats } = buildGrammar(params, seed);
  // The fixtures are for clash checks, which the page doesn't run.
  const done: GrammarDone = { key, model: { ...model, fixtures: [] }, vertices: stats.vertices, ms: stats.ms };
  const buffers = [model.solid, model.glow].flatMap((g) => [g.position.buffer, g.normal.buffer, g.color.buffer, g.index.buffer]);
  scope.postMessage(done, buffers as Transferable[]);
};
