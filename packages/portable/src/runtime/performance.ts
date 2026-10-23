/** Opt-in, bounded summaries. No per-pointer console output. */
export function createPerformanceDiagnostics(enabled = false) {
  let active: { kind: string; frames: number[]; updates: number[]; routes: number[]; instances: number; started: number } | undefined;
  let frame = 0;
  let previous = 0;
  let serial = 0;
  const summaries: unknown[] = [];
  const stats = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return { count: values.length, totalMs: values.reduce((a, b) => a + b, 0), maxMs: sorted.at(-1) ?? 0, p95Ms: sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] ?? 0 };
  };
  const tick = (now: number) => {
    if (!active) return;
    if (previous) active.frames.push(now - previous);
    previous = now;
    frame = requestAnimationFrame(tick);
  };
  return {
    start(kind: string) {
      if (!enabled) return;
      cancelAnimationFrame(frame);
      serial++;
      active = { kind, frames: [], updates: [], routes: [], instances: 0, started: performance.now() };
      previous = 0;
      frame = requestAnimationFrame(tick);
    },
    update<T>(fn: () => T): T {
      if (!enabled || !active) return fn();
      const start = performance.now();
      try { return fn(); } finally {
        const duration = performance.now() - start;
        active?.updates.push(duration);
        performance.measure('portable:drag-update', { start, duration });
      }
    },
    event(event: { kind: 'routing' | 'edge-instance'; durationMs: number }) {
      if (!enabled || !active) return;
      if (event.kind === 'routing') {
        active.routes.push(event.durationMs);
        performance.measure('portable:routing', { start: performance.now() - event.durationMs, duration: event.durationMs });
      } else active.instances++;
    },
    end(released = performance.now()) {
      if (!enabled || !active) return;
      const interaction = active, token = serial;
      // Two rAFs bracket a rendering opportunity, not a GPU presentation timestamp.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (token !== serial) return;
        cancelAnimationFrame(frame); active = undefined;
        const summary = { kind: interaction.kind, elapsedMs: performance.now() - interaction.started,
          frames: stats(interaction.frames), updates: stats(interaction.updates), routing: stats(interaction.routes),
          edgeInstancesCreated: interaction.instances, releaseToPaintOpportunityMs: performance.now() - released };
        summaries.push(summary); if (summaries.length > 30) summaries.shift();
        console.info('[portable performance]', summary);
        performance.clearMeasures('portable:drag-update'); performance.clearMeasures('portable:routing');
      }));
    },
    dispose() { serial++; cancelAnimationFrame(frame); active = undefined; },
    summaries,
  };
}
