/**
 * Fixed-timestep game loop on requestAnimationFrame. Real time is accumulated
 * and consumed in whole ticks, so a throttled or hidden tab catches up when it
 * comes back instead of drifting.
 */
export interface LoopOptions {
  tickMs: number;
  /** Upper bound on catch-up work per frame so the page stays responsive. */
  maxTicksPerFrame: number;
  tick(dtMs: number): void;
  render(): void;
}

export function startLoop(options: LoopOptions): () => void {
  let accumulator = 0;
  let last = performance.now();
  let handle = 0;
  let running = true;

  const frame = (now: number) => {
    if (!running) return;
    accumulator += now - last;
    last = now;
    let ticks = 0;
    while (accumulator >= options.tickMs && ticks < options.maxTicksPerFrame) {
      options.tick(options.tickMs);
      accumulator -= options.tickMs;
      ticks += 1;
    }
    options.render();
    handle = requestAnimationFrame(frame);
  };

  handle = requestAnimationFrame(frame);
  return () => {
    running = false;
    cancelAnimationFrame(handle);
  };
}
