import { createSignal } from 'solid-js';

export interface PerformanceMonitorOptions {
  /** FPS sampling window in ms (default: 250) */
  ms?: number;
  /** Number of FPS averages to collect before evaluating (default: 10) */
  iterations?: number;
  /** Fraction of iterations that must agree for incline/decline (default: 0.75) */
  threshold?: number;
  /** Given detected refresh rate, return [lower, upper] FPS bounds (default: [hz*0.8, hz*0.95]) */
  bounds?: (refreshRate: number) => [lower: number, upper: number];
  /** Max incline/decline oscillations before triggering fallback (default: Infinity) */
  flipflops?: number;
  /** Initial quality factor 0-1 (default: 1) */
  initialFactor?: number;
  /** Factor step size per incline/decline (default: 0.1) */
  step?: number;
}

export interface PerformanceMonitorResult {
  /** Reactive quality factor 0-1. 1 = full quality, 0 = minimum quality */
  factor: () => number;
  /** Current measured FPS (reactive) */
  fps: () => number;
  /** Detected device refresh rate (reactive, starts at 60) */
  refreshRate: () => number;
  /** Start sampling — call when an interaction begins */
  start: () => void;
  /** Stop sampling — call when an interaction ends */
  stop: () => void;
  /** Whether currently sampling (reactive) */
  active: () => boolean;
  /** Reset factor to initial value and clear history */
  reset: () => void;
}

export function createPerformanceMonitor(
  options: PerformanceMonitorOptions = {},
): PerformanceMonitorResult {
  const {
    ms = 250,
    iterations = 10,
    threshold = 0.75,
    bounds = (hz) => [hz * 0.8, hz * 0.95],
    flipflops = Infinity,
    initialFactor = 1,
    step = 0.1,
  } = options;

  const [factor, setFactor] = createSignal(initialFactor);
  const [fps, setFps] = createSignal(0);
  const [refreshRate, setRefreshRate] = createSignal(60);
  const [active, setActive] = createSignal(false);

  // Mutable state (not reactive — updated frequently in rAF loop)
  let rafId: number | null = null;
  let frames: number[] = [];
  let windowStart = -1; // -1 = not yet started; avoids false-match when timestamp=0
  let averages: number[] = [];
  let flipflopCount = 0;
  let lastTrend: 'incline' | 'decline' | null = null;
  let stabilized = false;

  function tick(timestamp: number) {
    frames.push(timestamp);

    if (windowStart === -1) {
      windowStart = timestamp;
    }

    const elapsed = timestamp - windowStart;

    if (elapsed >= ms) {
      const currentFps = Math.round((frames.length / elapsed) * 1000);
      setFps(currentFps);

      // Track refresh rate as max observed FPS
      if (currentFps > refreshRate()) {
        setRefreshRate(currentFps);
      }

      // Store in rolling averages
      averages.push(currentFps);
      if (averages.length > iterations) {
        averages.shift();
      }

      // Evaluate once we have enough samples
      if (averages.length >= iterations && !stabilized) {
        const hz = refreshRate();
        const [lower, upper] = bounds(hz);
        const required = iterations * threshold;

        const inclineCandidates = averages.filter((v) => v >= upper).length;
        const declineCandidates = averages.filter((v) => v < lower).length;

        if (inclineCandidates > required) {
          const newFactor = Math.min(1, factor() + step);
          setFactor(newFactor);
          if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
            console.warn(`[cactus] perf incline: factor=${newFactor}`);
          }

          if (lastTrend === 'decline') {
            flipflopCount++;
            if (flipflopCount >= flipflops) {
              stabilized = true;
              if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
                console.warn(
                  `[cactus] perf stabilized at factor=${newFactor} after ${flipflopCount} flipflops`,
                );
              }
            }
          }
          lastTrend = 'incline';
          averages = [];
        } else if (declineCandidates > required) {
          const newFactor = Math.max(0, factor() - step);
          setFactor(newFactor);
          if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
            console.warn(`[cactus] perf decline: factor=${newFactor}`);
          }

          if (lastTrend === 'incline') {
            flipflopCount++;
            if (flipflopCount >= flipflops) {
              stabilized = true;
              if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
                console.warn(
                  `[cactus] perf stabilized at factor=${newFactor} after ${flipflopCount} flipflops`,
                );
              }
            }
          }
          lastTrend = 'decline';
          averages = [];
        }
      }

      // Reset window
      frames = [];
      windowStart = timestamp;
    }

    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (rafId !== null) return;
    frames = [];
    windowStart = -1;
    setActive(true);
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    frames = [];
    windowStart = -1;
    setActive(false);
  }

  function reset() {
    stop();
    averages = [];
    flipflopCount = 0;
    lastTrend = null;
    stabilized = false;
    setFactor(initialFactor);
    setFps(0);
    setRefreshRate(60);
  }

  return { factor, fps, refreshRate, start, stop, active, reset };
}
