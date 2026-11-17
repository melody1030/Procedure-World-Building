import type { GrammarDone, GrammarJob } from "./grammarWorker";

/**
 * A few workers building grammar buildings for Simulation, so the page keeps drawing while they
 * work. Jobs wait in one queue and each worker takes one at a time, so replacing the queue drops
 * every job not yet started; the few in flight still come back, and the page keeps them only if
 * their key is still wanted (a key is what the building is built from, so a late result is never
 * wrong, only possibly unneeded).
 */
export class GrammarPool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: GrammarJob[] = [];

  constructor(
    private onDone: (done: GrammarDone) => void,
    size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1)),
  ) {
    for (let i = 0; i < size; i++) {
      const w = new Worker(new URL("./grammarWorker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<GrammarDone>) => {
        this.idle.push(w);
        this.onDone(e.data);
        this.pump();
      };
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  get size() {
    return this.workers.length;
  }

  /** Replaces the waiting jobs (in the order given) and starts as many as there are idle workers. */
  replace(jobs: GrammarJob[]) {
    this.queue = jobs.slice();
    this.pump();
  }

  private pump() {
    while (this.idle.length && this.queue.length) this.idle.pop()!.postMessage(this.queue.shift()!);
  }

  dispose() {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.idle = [];
    this.queue = [];
  }
}
