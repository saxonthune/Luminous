import { describe, it, expect, beforeEach } from 'vitest';
import { readParam, writeParam } from '../urlState';

describe('urlState', () => {
  beforeEach(() => {
    history.replaceState(null, '', window.location.pathname);
  });

  it('readParam returns null when the param is absent', () => {
    expect(readParam('src')).toBeNull();
  });

  it('readParam returns the value when the param is present', () => {
    history.replaceState(null, '', '?src=foo');
    expect(readParam('src')).toBe('foo');
  });

  it('writeParam sets a param while preserving others', () => {
    history.replaceState(null, '', '?app=canvas');
    writeParam('src', 'foo');
    expect(readParam('app')).toBe('canvas');
    expect(readParam('src')).toBe('foo');
  });

  it('writeParam deletes a param with null while preserving others', () => {
    history.replaceState(null, '', '?app=canvas&src=foo');
    writeParam('src', null);
    expect(readParam('app')).toBe('canvas');
    expect(readParam('src')).toBeNull();
  });

  it('writeParam with null on the last param clears the search string', () => {
    history.replaceState(null, '', '?src=foo');
    writeParam('src', null);
    expect(window.location.search).toBe('');
  });
});
