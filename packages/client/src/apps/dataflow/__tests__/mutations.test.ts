import { describe, it, expect } from 'vitest';
import type { DataflowDocument } from '@luminous/core/dataflow';
import {
  uniqueId,
  appendBox,
  duplicateBoxes,
  insertBoxOnFlow,
  groupRenameBatch,
  setGroupBatch,
  deleteBatch,
  buildBoxPatch,
} from '../mutations';

const doc: DataflowDocument = {
  v: 1,
  boxes: [
    { id: 'a', name: 'A', group: 'g1' },
    { id: 'b', name: 'B', group: 'g1' },
    { id: 'c', name: 'C' },
  ],
  flows: [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
  ],
};

describe('uniqueId', () => {
  it('returns the base when it is not taken', () => {
    expect(uniqueId('new-box', new Set())).toBe('new-box');
  });

  it('appends -2, -3, … until the id is free', () => {
    expect(uniqueId('a', new Set(['a']))).toBe('a-2');
    expect(uniqueId('a', new Set(['a', 'a-2']))).toBe('a-3');
  });
});

describe('appendBox', () => {
  it('adds a box with the given id and name, nothing else', () => {
    const next = appendBox(doc, 'new-box', 'New Box');
    expect(next.boxes).toHaveLength(4);
    expect(next.boxes.at(-1)).toEqual({ id: 'new-box', name: 'New Box' });
  });
});

describe('duplicateBoxes', () => {
  it('copies boxes with a -copy id and no flows when withFlows is false', () => {
    const next = duplicateBoxes(doc, ['a'], false);
    expect(next.boxes).toHaveLength(4);
    expect(next.boxes.at(-1)).toEqual({ id: 'a-copy', name: 'A', group: 'g1' });
    expect(next.flows).toEqual(doc.flows);
  });

  it('rewires flows between two duplicated boxes onto the two copies', () => {
    const next = duplicateBoxes(doc, ['a', 'b'], true);
    expect(next.flows).toContainEqual({ from: 'a-copy', to: 'b-copy' });
  });

  it('connects a copy to the untouched original endpoint', () => {
    const next = duplicateBoxes(doc, ['b'], true);
    // b->c had only 'b' duplicated, so the copy connects to the original 'c'.
    expect(next.flows).toContainEqual({ from: 'b-copy', to: 'c' });
    // a->b had only 'b' duplicated, so 'a' connects to the copy.
    expect(next.flows).toContainEqual({ from: 'a', to: 'b-copy' });
  });

  it('deconflicts ids when a -copy id is already taken', () => {
    const withCopy: DataflowDocument = { ...doc, boxes: [...doc.boxes, { id: 'a-copy', name: 'A copy' }] };
    const next = duplicateBoxes(withCopy, ['a'], false);
    expect(next.boxes.at(-1)?.id).toBe('a-copy-2');
  });
});

describe('insertBoxOnFlow', () => {
  it('splices a new box into the middle of an existing flow', () => {
    const next = insertBoxOnFlow(doc, 'a', 'b');
    expect(next.boxes.at(-1)).toEqual({ id: 'new-box', name: 'New Box' });
    expect(next.flows).not.toContainEqual({ from: 'a', to: 'b' });
    expect(next.flows).toContainEqual({ from: 'a', to: 'new-box' });
    expect(next.flows).toContainEqual({ from: 'new-box', to: 'b' });
  });
});

describe('groupRenameBatch', () => {
  it('maps every box in the old group to the new group name', () => {
    const actions = groupRenameBatch(doc, 'g1', 'g2');
    expect(actions).toEqual([
      { type: 'set', id: 'a', group: 'g2' },
      { type: 'set', id: 'b', group: 'g2' },
    ]);
  });

  it('merges groups on collision — renaming onto an existing group folds both together', () => {
    const withTwoGroups: DataflowDocument = {
      ...doc,
      boxes: [...doc.boxes, { id: 'd', name: 'D', group: 'g2' }],
    };
    const actions = groupRenameBatch(withTwoGroups, 'g1', 'g2');
    expect(actions).toEqual([
      { type: 'set', id: 'a', group: 'g2' },
      { type: 'set', id: 'b', group: 'g2' },
    ]);
  });
});

describe('setGroupBatch', () => {
  it('builds a set action per id with the given group', () => {
    expect(setGroupBatch(['a', 'b'], 'g2')).toEqual([
      { type: 'set', id: 'a', group: 'g2' },
      { type: 'set', id: 'b', group: 'g2' },
    ]);
  });

  it('clears the group when passed null', () => {
    expect(setGroupBatch(['a'], null)).toEqual([{ type: 'set', id: 'a', group: null }]);
  });
});

describe('deleteBatch', () => {
  it('builds a cascading removeBox action per id', () => {
    expect(deleteBatch(['a', 'b'])).toEqual([
      { type: 'removeBox', id: 'a', cascade: true },
      { type: 'removeBox', id: 'b', cascade: true },
    ]);
  });
});

describe('buildBoxPatch', () => {
  it('carries the form name and description through', () => {
    const patch = buildBoxPatch(
      { name: 'New Name', description: 'New desc', contractFormat: '', contractText: '' },
      'Old Name',
    );
    expect(patch).toEqual({ name: 'New Name', description: 'New desc' });
  });

  it('falls back to the previous name when the form name is blank', () => {
    const patch = buildBoxPatch(
      { name: '   ', description: '', contractFormat: '', contractText: '' },
      'Old Name',
    );
    expect(patch.name).toBe('Old Name');
  });

  it('omits contract when both format and text are blank', () => {
    const patch = buildBoxPatch(
      { name: 'A', description: '', contractFormat: '  ', contractText: '' },
      'A',
    );
    expect(patch.contract).toBeUndefined();
  });

  it('includes contract when either field is non-blank', () => {
    const patch = buildBoxPatch(
      { name: 'A', description: '', contractFormat: 'json-schema', contractText: '' },
      'A',
    );
    expect(patch.contract).toEqual({ format: 'json-schema', text: '' });
  });
});
