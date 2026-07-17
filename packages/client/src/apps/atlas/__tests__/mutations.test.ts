import { describe, it, expect } from 'vitest';
import type { AtlasDocument } from '@luminous/core/atlas';
import { setNode } from '@luminous/core/atlas';
import {
  buildContentEditPatch,
  buildModePatch,
  buildColorPatch,
  uniqueId,
  duplicateNode,
  selfAndDescendantIds,
  resolveDrop,
  describePendingDrop,
} from '../mutations';

describe('buildContentEditPatch', () => {
  it('carries the form name and text, preserving the current Mode', () => {
    const patch = buildContentEditPatch({ name: 'New Name', text: 'hello' }, 'Old Name', 'code');
    expect(patch).toEqual({ name: 'New Name', content: { text: 'hello', mode: 'code' } });
  });

  it('falls back to the previous name when the form name is blank', () => {
    const patch = buildContentEditPatch({ name: '  ', text: 'hello' }, 'Old Name', 'markdown');
    expect(patch.name).toBe('Old Name');
  });

  it('defaults the Mode to markdown for a Node that had no Content', () => {
    const patch = buildContentEditPatch({ name: 'N', text: 'hello' }, 'N', undefined);
    expect(patch.content.mode).toBe('markdown');
  });
});

describe('buildModePatch', () => {
  it('sets the Mode while keeping the existing text', () => {
    const patch = buildModePatch({ text: 'existing text', mode: 'markdown' }, 'code');
    expect(patch).toEqual({ content: { text: 'existing text', mode: 'code' } });
  });

  it('creates an empty-text Content for a Node with no Content yet', () => {
    const patch = buildModePatch(undefined, 'code');
    expect(patch).toEqual({ content: { text: '', mode: 'code' } });
  });
});

describe('buildColorPatch', () => {
  it('carries the color key for a token', () => {
    const patch = buildColorPatch('rose');
    expect('color' in patch).toBe(true);
    expect(patch.color).toBe('rose');
  });

  it('carries the color key as undefined so setNode clears it', () => {
    const patch = buildColorPatch(undefined);
    expect('color' in patch).toBe(true);
    expect(patch.color).toBeUndefined();
  });

  it('selecting a swatch produces a Document whose node carries the token', () => {
    const d: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A' }], edges: [] };
    const result = setNode(d, 'a', buildColorPatch('violet'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.nodes.find((n) => n.id === 'a')?.color).toBe('violet');
  });
});

function doc(nodes: AtlasDocument['nodes']): AtlasDocument {
  return { v: 1, nodes, edges: [] };
}

describe('duplicateNode', () => {
  it('copies name, Content, and parent under a fresh non-colliding id', () => {
    const d = doc([
      { id: 'container', name: 'Container' },
      { id: 'a', name: 'A', parent: 'container', content: { text: 'hi', mode: 'markdown' } },
    ]);
    const next = duplicateNode(d, 'a');
    const copy = next.nodes.find((n) => n.id !== 'a' && n.id !== 'container');
    expect(copy).toEqual({ id: 'a-copy', name: 'A', parent: 'container', content: { text: 'hi', mode: 'markdown' } });
  });

  it('avoids colliding with an existing id', () => {
    const d = doc([
      { id: 'a', name: 'A' },
      { id: 'a-copy', name: 'A copy already here' },
    ]);
    const next = duplicateNode(d, 'a');
    expect(next.nodes.map((n) => n.id)).toContain('a-copy-2');
  });

  it('does not copy descendants or Edges', () => {
    const d: AtlasDocument = {
      v: 1,
      nodes: [
        { id: 'a', name: 'A' },
        { id: 'child', name: 'Child', parent: 'a' },
      ],
      edges: [{ from: 'a', to: 'child' }],
    };
    const next = duplicateNode(d, 'a');
    expect(next.nodes).toHaveLength(3);
    expect(next.edges).toEqual(d.edges);
  });
});

describe('selfAndDescendantIds', () => {
  it('includes the node itself and every transitive child', () => {
    const d = doc([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B', parent: 'a' },
      { id: 'c', name: 'C', parent: 'b' },
      { id: 'unrelated', name: 'U' },
    ]);
    expect(selfAndDescendantIds(d, 'a')).toEqual(new Set(['a', 'b', 'c']));
  });
});

describe('resolveDrop', () => {
  const d = doc([
    { id: 'container', name: 'Container' },
    { id: 'other', name: 'Other' },
    { id: 'a', name: 'A', parent: 'container' },
    { id: 'child', name: 'Child', parent: 'a' },
  ]);

  it('is a no-op when the hit target equals the current parent', () => {
    expect(resolveDrop(d, 'a', 'container')).toEqual({ changed: false });
  });

  it('is a no-op dropping a root Node on the background', () => {
    expect(resolveDrop(d, 'other', null)).toEqual({ changed: false });
  });

  it('produces a root reparent when dropped on the background', () => {
    const outcome = resolveDrop(d, 'a', null);
    expect(outcome.changed).toBe(true);
    if (outcome.changed && outcome.result.ok) {
      expect(outcome.result.doc.nodes.find((n) => n.id === 'a')?.parent).toBeUndefined();
    } else {
      throw new Error('expected ok reparent');
    }
  });

  it('produces a Container reparent when dropped on a different Container', () => {
    const outcome = resolveDrop(d, 'a', 'other');
    expect(outcome.changed).toBe(true);
    if (outcome.changed && outcome.result.ok) {
      expect(outcome.result.doc.nodes.find((n) => n.id === 'a')?.parent).toBe('other');
    } else {
      throw new Error('expected ok reparent');
    }
  });

  it('refuses dropping a Node onto itself', () => {
    const outcome = resolveDrop(d, 'a', 'a');
    expect(outcome.changed).toBe(true);
    if (outcome.changed) expect(outcome.result.ok).toBe(false);
  });

  it('refuses dropping a Node onto its own descendant', () => {
    const outcome = resolveDrop(d, 'a', 'child');
    expect(outcome.changed).toBe(true);
    if (outcome.changed) expect(outcome.result.ok).toBe(false);
  });
});

describe('describePendingDrop', () => {
  const d = doc([
    { id: 'container', name: 'Container' },
    { id: 'other', name: 'Other' },
    { id: 'a', name: 'A', parent: 'container' },
    { id: 'root', name: 'Root' },
  ]);

  it('is null when the hit target equals the current parent', () => {
    expect(describePendingDrop(d, 'a', 'container')).toBeNull();
  });

  it('is null for a root Node hovering the background', () => {
    expect(describePendingDrop(d, 'root', null)).toBeNull();
  });

  it('describes adding a root Node to a Container', () => {
    expect(describePendingDrop(d, 'root', 'container')).toContain('Add');
  });

  it('describes removing a Node from its Container', () => {
    expect(describePendingDrop(d, 'a', null)).toContain('Remove');
  });

  it('describes moving between two Containers', () => {
    expect(describePendingDrop(d, 'a', 'other')).toContain('Move');
  });
});

describe('uniqueId', () => {
  it('returns the base id when unused', () => {
    expect(uniqueId('new-node', new Set())).toBe('new-node');
  });

  it('appends an increasing suffix until free', () => {
    expect(uniqueId('new-node', new Set(['new-node', 'new-node-2']))).toBe('new-node-3');
  });
});
