import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'solid-js';
import { createPerformanceMonitor } from '../src/createPerformanceMonitor';

// ===== RAF SIMULATION HELPERS =====

let rafCallback: FrameRequestCallback | null = null;
let rafIdCounter = 0;

function setupRafMock() {
  rafIdCounter = 0;
  rafCallback = null;

  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCallback = cb;
    return ++rafIdCounter;
  });

  vi.stubGlobal('cancelAnimationFrame', (_id: number) => {
    rafCallback = null;
  });
}

/** Drive a single rAF frame at the given timestamp. */
function frame(timestamp: number) {
  if (rafCallback) {
    const cb = rafCallback;
    rafCallback = null;
    cb(timestamp);
  }
}

/**
 * Drive the monitor through one complete sampling window that closes.
 *
 * The first frame establishes windowStart. We then drive one more frame
 * that lands just past `ms` ms later, closing the window.
 * Returns the timestamp of the window-close frame.
 *
 * framesInWindow controls how many frames land inside the window BEFORE
 * the window-close frame — so the fps = (framesInWindow + 1) / elapsed.
 */
function driveWindow(
  windowStart: number,
  ms: number,
  framesInWindow: number,
): number {
  const interval = ms / (framesInWindow + 1);
  let ts = windowStart;
  // Drive inner frames (they do NOT close the window)
  for (let i = 0; i < framesInWindow; i++) {
    ts += interval;
    frame(ts);
  }
  // Drive the closing frame (elapsed >= ms)
  ts = windowStart + ms + 1;
  frame(ts);
  return ts;
}

// ===== TESTS =====

describe('createPerformanceMonitor', () => {
  beforeEach(() => {
    setupRafMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('factor starts at initialFactor (default 1)', () => {
    createRoot((dispose) => {
      const mon = createPerformanceMonitor();
      expect(mon.factor()).toBe(1);
      dispose();
    });
  });

  it('factor starts at custom initialFactor', () => {
    createRoot((dispose) => {
      const mon = createPerformanceMonitor({ initialFactor: 0.5 });
      expect(mon.factor()).toBe(0.5);
      dispose();
    });
  });

  it('active() is false before start, true after start, false after stop', () => {
    createRoot((dispose) => {
      const mon = createPerformanceMonitor();
      expect(mon.active()).toBe(false);
      mon.start();
      expect(mon.active()).toBe(true);
      mon.stop();
      expect(mon.active()).toBe(false);
      dispose();
    });
  });

  it('start() begins the rAF loop', () => {
    createRoot((dispose) => {
      const mon = createPerformanceMonitor();
      mon.start();
      expect(rafCallback).not.toBeNull();
      mon.stop();
      dispose();
    });
  });

  it('stop() cancels the rAF loop', () => {
    createRoot((dispose) => {
      const mon = createPerformanceMonitor();
      mon.start();
      mon.stop();
      expect(rafCallback).toBeNull();
      dispose();
    });
  });

  it('start() is idempotent — calling twice does not double-register', () => {
    createRoot((dispose) => {
      const mon = createPerformanceMonitor();
      mon.start();
      const firstId = rafIdCounter;
      mon.start(); // should be a no-op
      expect(rafIdCounter).toBe(firstId);
      mon.stop();
      dispose();
    });
  });

  it('FPS calculation — ~60 frames per second yields ~60 fps after window', () => {
    createRoot((dispose) => {
      // ms=1000, iterations=1 so a single window triggers evaluation
      const mon = createPerformanceMonitor({ ms: 1000, iterations: 1 });
      mon.start();

      // Establishing frame sets windowStart=0
      frame(0);

      // Drive 59 more frames inside the window at ~16.67ms intervals
      for (let i = 1; i <= 59; i++) {
        frame(i * (1000 / 60));
      }

      // Closing frame past 1000ms — window fires
      frame(1001);

      const measured = mon.fps();
      expect(measured).toBeGreaterThanOrEqual(55);
      expect(measured).toBeLessThanOrEqual(65);

      mon.stop();
      dispose();
    });
  });

  it('decline detection — sustained low FPS decreases factor by step', () => {
    createRoot((dispose) => {
      // bounds: lower=40, upper=55. Low fps ~10 (way below 40) → decline
      const mon = createPerformanceMonitor({
        ms: 100,
        iterations: 3,
        threshold: 0.75,
        bounds: () => [40, 55],
        step: 0.1,
        initialFactor: 1,
      });
      mon.start();

      // Establishing frame for window 1
      frame(0);

      // Drive 3 windows, each closing with just 1 inner frame → low fps
      // Window 1: closes at ts=101, fps = round(2/101*1000) = 20 (below 40) ✓
      let ts = driveWindow(0, 100, 0);
      // Window 2: windowStart is now ts=101, close at ts=202
      ts = driveWindow(ts, 100, 0);
      // Window 3: close at ts=303
      ts = driveWindow(ts, 100, 0);

      // All 3 windows had fps < 40 → decline should have fired
      expect(mon.factor()).toBeCloseTo(0.9, 5);

      mon.stop();
      dispose();
    });
  });

  it('incline detection — sustained high FPS increases factor', () => {
    createRoot((dispose) => {
      // bounds: lower=40, upper=55. High fps ~60 (above 55) → incline
      const mon = createPerformanceMonitor({
        ms: 100,
        iterations: 3,
        threshold: 0.75,
        bounds: () => [40, 55],
        step: 0.1,
        initialFactor: 0.5,
      });
      mon.start();

      // Establishing frame
      frame(0);

      // Drive 3 windows with 6 inner frames each → ~60fps per window
      // fps = round(7 / 101 * 1000) = round(69.3) = 69 (above 55) ✓
      let ts = driveWindow(0, 100, 6);
      ts = driveWindow(ts, 100, 6);
      ts = driveWindow(ts, 100, 6);

      expect(mon.factor()).toBeCloseTo(0.6, 5);

      mon.stop();
      dispose();
    });
  });

  it('reset() returns factor to initialFactor and clears history', () => {
    createRoot((dispose) => {
      const mon = createPerformanceMonitor({
        ms: 100,
        iterations: 3,
        threshold: 0.75,
        bounds: () => [40, 55],
        step: 0.1,
        initialFactor: 1,
      });
      mon.start();

      // Cause a decline
      frame(0);
      let ts = driveWindow(0, 100, 0);
      ts = driveWindow(ts, 100, 0);
      driveWindow(ts, 100, 0);

      expect(mon.factor()).toBeCloseTo(0.9, 5);

      mon.reset();
      expect(mon.factor()).toBe(1);
      expect(mon.fps()).toBe(0);
      expect(mon.active()).toBe(false);

      dispose();
    });
  });

  it('flipflop detection — stabilizes factor after oscillations', () => {
    createRoot((dispose) => {
      const mon = createPerformanceMonitor({
        ms: 100,
        iterations: 3,
        threshold: 0.75,
        bounds: () => [40, 55],
        step: 0.1,
        initialFactor: 0.5,
        flipflops: 2,
      });
      mon.start();

      // Establishing frame
      frame(0);

      // Round 1: high fps → incline (lastTrend = incline, factor = 0.6)
      let ts = driveWindow(0, 100, 6);
      ts = driveWindow(ts, 100, 6);
      ts = driveWindow(ts, 100, 6);
      expect(mon.factor()).toBeCloseTo(0.6, 5);

      // Round 2: low fps → decline (flipflopCount=1, factor = 0.5)
      ts = driveWindow(ts, 100, 0);
      ts = driveWindow(ts, 100, 0);
      ts = driveWindow(ts, 100, 0);
      expect(mon.factor()).toBeCloseTo(0.5, 5);

      // Round 3: high fps → incline (flipflopCount=2, reaches limit → stabilized, factor = 0.6)
      ts = driveWindow(ts, 100, 6);
      ts = driveWindow(ts, 100, 6);
      ts = driveWindow(ts, 100, 6);
      expect(mon.factor()).toBeCloseTo(0.6, 5);

      // Round 4: low fps → should NOT change (stabilized)
      ts = driveWindow(ts, 100, 0);
      ts = driveWindow(ts, 100, 0);
      ts = driveWindow(ts, 100, 0);
      expect(mon.factor()).toBeCloseTo(0.6, 5); // unchanged

      mon.stop();
      dispose();
    });
  });
});
