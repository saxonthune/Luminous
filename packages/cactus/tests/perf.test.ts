import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { traceCallback, markInteraction, observeLongTasks } from '../src/perf.js';

function busyWait(ms: number) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    // spin
  }
}

describe('traceCallback', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    performance.clearMarks();
    performance.clearMeasures();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls the wrapped function and returns its result', () => {
    const fn = vi.fn((a: number, b: number) => a + b);
    const traced = traceCallback('add', fn);
    const result = traced(2, 3);
    expect(fn).toHaveBeenCalledWith(2, 3);
    expect(result).toBe(5);
  });

  it('preserves this context', () => {
    const obj = {
      value: 42,
      getValue(this: { value: number }) {
        return this.value;
      },
    };
    const traced = traceCallback('getValue', obj.getValue.bind(obj));
    expect(traced()).toBe(42);
  });

  it('does not warn for fast callbacks', () => {
    const fn = vi.fn(() => 'fast');
    const traced = traceCallback('fast', fn);
    traced();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('warns when execution exceeds 16ms', () => {
    const slowFn = vi.fn(() => {
      busyWait(25);
    });
    const traced = traceCallback('slowFn', slowFn);
    traced();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/\[cactus\] slow: slowFn took \d+\.\d+ms/)
    );
  });

  it('creates performance marks and measures', () => {
    const fn = vi.fn(() => {});
    const traced = traceCallback('myCallback', fn);
    traced();
    expect(performance.getEntriesByName('cactus:myCallback:start', 'mark')).toHaveLength(1);
    expect(performance.getEntriesByName('cactus:myCallback:end', 'mark')).toHaveLength(1);
    expect(performance.getEntriesByName('cactus:myCallback', 'measure')).toHaveLength(1);
  });
});

describe('markInteraction', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    performance.clearMarks();
    performance.clearMeasures();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates start mark immediately', () => {
    markInteraction('drag');
    expect(performance.getEntriesByName('cactus:drag:start', 'mark')).toHaveLength(1);
  });

  it('creates end mark and measure after end()', () => {
    const mark = markInteraction('resize');
    mark.end();
    expect(performance.getEntriesByName('cactus:resize:end', 'mark')).toHaveLength(1);
    expect(performance.getEntriesByName('cactus:resize', 'measure')).toHaveLength(1);
  });

  it('does not warn — interaction duration is user-controlled', () => {
    const mark = markInteraction('drag');
    busyWait(110);
    mark.end();
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('observeLongTasks', () => {
  it('returns a cleanup function', () => {
    const cleanup = observeLongTasks();
    expect(typeof cleanup).toBe('function');
    cleanup();
  });

  it('returns a no-op cleanup if PerformanceObserver is unavailable', () => {
    const g = globalThis as { PerformanceObserver?: unknown };
    const original = g.PerformanceObserver;
    g.PerformanceObserver = undefined;
    const cleanup = observeLongTasks();
    expect(typeof cleanup).toBe('function');
    expect(() => cleanup()).not.toThrow();
    g.PerformanceObserver = original;
  });
});

describe('no-ops in production', () => {
  it('traceCallback returns fn unchanged when DEV is false', async () => {
    vi.stubEnv('DEV', false);
    vi.resetModules();
    const { traceCallback: tc } = await import('../src/perf.js');
    const fn = vi.fn();
    expect(tc('test', fn)).toBe(fn);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('markInteraction returns no-op end when DEV is false', async () => {
    vi.stubEnv('DEV', false);
    vi.resetModules();
    const { markInteraction: mi } = await import('../src/perf.js');
    performance.clearMarks();
    const mark = mi('noop');
    expect(performance.getEntriesByName('cactus:noop:start', 'mark')).toHaveLength(0);
    mark.end();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('observeLongTasks returns no-op when DEV is false', async () => {
    vi.stubEnv('DEV', false);
    vi.resetModules();
    const { observeLongTasks: ol } = await import('../src/perf.js');
    const cleanup = ol();
    expect(typeof cleanup).toBe('function');
    expect(() => cleanup()).not.toThrow();
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
