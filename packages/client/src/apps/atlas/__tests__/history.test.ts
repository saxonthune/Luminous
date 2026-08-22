import { createRoot } from 'solid-js';
import { describe, it, expect } from 'vitest';
import type { AtlasAction } from '@luminous/core/atlas';
import { useAtlasHistory, type HistoryEntry } from '../history.ts';

function entry(label: string): HistoryEntry {
  const doAction: AtlasAction = { type: 'addNode', id: label, name: label };
  const undoAction: AtlasAction = { type: 'removeNode', id: label };
  return { label, do: [doAction], undo: [undoAction] };
}

describe('useAtlasHistory', () => {
  it('starts with nothing to undo or redo', () => {
    createRoot((dispose) => {
      const history = useAtlasHistory();
      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(false);
      expect(history.undo()).toBeNull();
      expect(history.redo()).toBeNull();
      dispose();
    });
  });

  it('records an entry, making it undoable but not redoable', () => {
    createRoot((dispose) => {
      const history = useAtlasHistory();
      history.record(entry('a'));
      expect(history.canUndo()).toBe(true);
      expect(history.canRedo()).toBe(false);
      dispose();
    });
  });

  it('undo returns the entry\'s undo actions and moves it to future', () => {
    createRoot((dispose) => {
      const history = useAtlasHistory();
      const e = entry('a');
      history.record(e);
      const actions = history.undo();
      expect(actions).toEqual(e.undo);
      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(true);
      dispose();
    });
  });

  it('redo returns the entry\'s do actions and moves it back to past', () => {
    createRoot((dispose) => {
      const history = useAtlasHistory();
      const e = entry('a');
      history.record(e);
      history.undo();
      const actions = history.redo();
      expect(actions).toEqual(e.do);
      expect(history.canUndo()).toBe(true);
      expect(history.canRedo()).toBe(false);
      dispose();
    });
  });

  it('recording a new entry clears the future (no redo after a fresh edit)', () => {
    createRoot((dispose) => {
      const history = useAtlasHistory();
      history.record(entry('a'));
      history.undo();
      expect(history.canRedo()).toBe(true);
      history.record(entry('b'));
      expect(history.canRedo()).toBe(false);
      expect(history.redo()).toBeNull();
      dispose();
    });
  });

  it('undo/redo pop entries in LIFO order across multiple entries', () => {
    createRoot((dispose) => {
      const history = useAtlasHistory();
      const a = entry('a');
      const b = entry('b');
      history.record(a);
      history.record(b);
      expect(history.undo()).toEqual(b.undo);
      expect(history.undo()).toEqual(a.undo);
      expect(history.undo()).toBeNull();
      expect(history.redo()).toEqual(a.do);
      expect(history.redo()).toEqual(b.do);
      expect(history.redo()).toBeNull();
      dispose();
    });
  });

  it('clear empties both past and future', () => {
    createRoot((dispose) => {
      const history = useAtlasHistory();
      history.record(entry('a'));
      history.undo();
      history.clear();
      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(false);
      dispose();
    });
  });
});
