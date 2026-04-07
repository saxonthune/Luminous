const FRAME_BUDGET = 16; // ms — one animation frame

/**
 * Wraps a function to measure its execution time with performance.mark/measure.
 * Logs a console.warn if execution exceeds FRAME_BUDGET (16ms).
 * In production, returns `fn` unchanged (no overhead).
 */
export function traceCallback<T extends (...args: any[]) => any>(name: string, fn: T): T {
  if (!import.meta.env.DEV) return fn;
  return function (this: unknown, ...args: Parameters<T>): ReturnType<T> {
    const startMark = `cactus:${name}:start`;
    const endMark = `cactus:${name}:end`;
    performance.mark(startMark);
    const t0 = performance.now();
    const result = fn.apply(this, args) as ReturnType<T>;
    const elapsed = performance.now() - t0;
    performance.mark(endMark);
    performance.measure(`cactus:${name}`, startMark, endMark);
    if (elapsed > FRAME_BUDGET) {
      console.warn(`[cactus] slow: ${name} took ${elapsed.toFixed(1)}ms`);
    }
    return result;
  } as T;
}

/**
 * Starts a PerformanceObserver that watches for long tasks (>50ms main-thread blocks).
 * Returns a cleanup function. No-op in production or when PerformanceObserver is unavailable.
 */
export function observeLongTasks(): () => void {
  if (!import.meta.env.DEV) return () => {};
  if (typeof PerformanceObserver === 'undefined') return () => {};

  let observer: PerformanceObserver;
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        console.warn(`[cactus] long task: ${entry.duration.toFixed(0)}ms`);
      }
    });
    observer.observe({ type: 'longtask', buffered: false });
  } catch {
    return () => {};
  }

  return () => observer.disconnect();
}

/**
 * Marks the start of an interaction lifecycle (e.g., drag start to drag end).
 * Returns `{ end() }` to call when the interaction completes.
 * Creates a performance.measure visible in DevTools — no console warning,
 * since interaction duration depends on how long the user holds the button.
 * No-op in production.
 */
export function markInteraction(name: string): { end: () => void } {
  if (!import.meta.env.DEV) return { end: () => {} };

  const startMark = `cactus:${name}:start`;
  performance.mark(startMark);

  return {
    end() {
      const endMark = `cactus:${name}:end`;
      performance.mark(endMark);
      performance.measure(`cactus:${name}`, startMark, endMark);
    },
  };
}
