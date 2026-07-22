import { describe, it, expect } from 'vitest';
import { atlasDataPathFor } from '../dataLoader.ts';

describe('atlasDataPathFor', () => {
  it('replaces the trailing .atlas.json with .atlasdata.json', () => {
    expect(atlasDataPathFor('root/system.atlas.json')).toBe('root/system.atlasdata.json');
  });

  it('preserves a namespaced root and nested directories', () => {
    expect(atlasDataPathFor('myroot/nested/dir/system.atlas.json')).toBe(
      'myroot/nested/dir/system.atlasdata.json',
    );
  });

  it('appends the suffix rather than replacing when the id has no .atlas.json suffix', () => {
    expect(atlasDataPathFor('root/system')).toBe('root/system.atlasdata.json');
  });
});
