import { describe, it, expect } from 'vitest';
import { createRoot } from 'solid-js';
import { createLayoutOverrides } from '../src/interactions/createLayoutOverrides';

describe('createLayoutOverrides', () => {
  it('returns undefined for an id with no override', () => {
    createRoot((dispose) => {
      const { layoutOverride } = createLayoutOverrides();
      expect(layoutOverride('node-a')).toBeUndefined();
      dispose();
    });
  });

  it('returns the set policy after setLayoutOverride', () => {
    createRoot((dispose) => {
      const { layoutOverride, setLayoutOverride } = createLayoutOverrides();
      setLayoutOverride('node-a', 'grid');
      expect(layoutOverride('node-a')).toBe('grid');
      dispose();
    });
  });

  it('overrides are independent per id', () => {
    createRoot((dispose) => {
      const { layoutOverride, setLayoutOverride } = createLayoutOverrides();
      setLayoutOverride('node-a', 'stack-v');
      setLayoutOverride('node-b', 'stack-h');
      expect(layoutOverride('node-a')).toBe('stack-v');
      expect(layoutOverride('node-b')).toBe('stack-h');
      dispose();
    });
  });

  it('setting undefined clears the override', () => {
    createRoot((dispose) => {
      const { layoutOverride, setLayoutOverride } = createLayoutOverrides();
      setLayoutOverride('node-a', 'pack');
      expect(layoutOverride('node-a')).toBe('pack');
      setLayoutOverride('node-a', undefined);
      expect(layoutOverride('node-a')).toBeUndefined();
      dispose();
    });
  });

  it('clearing one id does not affect another', () => {
    createRoot((dispose) => {
      const { layoutOverride, setLayoutOverride } = createLayoutOverrides();
      setLayoutOverride('node-a', 'grid');
      setLayoutOverride('node-b', 'pack');
      setLayoutOverride('node-a', undefined);
      expect(layoutOverride('node-a')).toBeUndefined();
      expect(layoutOverride('node-b')).toBe('pack');
      dispose();
    });
  });
});
