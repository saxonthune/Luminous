import { describe, it, expect } from 'vitest';
import { parseChangedMessage } from '../watchClient';

describe('parseChangedMessage', () => {
  it('extracts the path from a changed event', () => {
    expect(parseChangedMessage('{"event":"changed","path":"Luminous/sample.dataflow.json"}')).toBe(
      'Luminous/sample.dataflow.json',
    );
  });

  it('returns null for other event types', () => {
    expect(parseChangedMessage('{"event":"other","path":"x"}')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseChangedMessage('not json')).toBeNull();
  });

  it('returns null when path is missing or not a string', () => {
    expect(parseChangedMessage('{"event":"changed"}')).toBeNull();
    expect(parseChangedMessage('{"event":"changed","path":42}')).toBeNull();
  });

  it('returns null for non-object JSON', () => {
    expect(parseChangedMessage('"just a string"')).toBeNull();
    expect(parseChangedMessage('null')).toBeNull();
  });
});
