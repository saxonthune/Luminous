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
  applyDrop,
  describePendingDrop,
  canConnect,
  buildConnectDropActions,
} from '../mutations';
import { projectAtlasNodes } from '../projection.ts';

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
    const patch = buildColorPatch('accent-8');
    expect('color' in patch).toBe(true);
    expect(patch.color).toBe('accent-8');
  });

  it('carries the color key as undefined so setNode clears it', () => {
    const patch = buildColorPatch(undefined);
    expect('color' in patch).toBe(true);
    expect(patch.color).toBeUndefined();
  });

  it('selecting a swatch produces a Document whose node carries the token', () => {
    const d: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A' }], edges: [] };
    const result = setNode(d, 'a', buildColorPatch('accent-5'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.nodes.find((n) => n.id === 'a')?.color).toBe('accent-5');
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

describe('applyDrop', () => {
  const d = doc([
    { id: 'container', name: 'Container' },
    { id: 'other', name: 'Other' },
    { id: 'a', name: 'A', parent: 'container' },
    { id: 'child', name: 'Child', parent: 'a' },
  ]);

  it('a plain move persists the dropped parent-relative x/y, offset by the child-area origin', () => {
    // container sits at (100, 100) absolute; "a" drops at (150, 260) absolute.
    // Stored position is relative to the child area, not the container's top-left.
    const result = applyDrop(d, 'a', 'container', { x: 150, y: 260 }, { x: 100, y: 100 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const a = result.doc.nodes.find((n) => n.id === 'a')!;
    expect(a.parent).toBe('container');
    expect(a.x).toBe(32);
    expect(a.y).toBe(80);
  });

  it('a root-level move persists position relative to the origin', () => {
    const result = applyDrop(d, 'other', null, { x: 300, y: 40 }, undefined);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const other = result.doc.nodes.find((n) => n.id === 'other')!;
    expect(other.parent).toBeUndefined();
    expect(other.x).toBe(300);
    expect(other.y).toBe(40);
  });

  it('a reparenting drop carries both the new parent and the reparented-relative position', () => {
    const result = applyDrop(d, 'a', 'other', { x: 520, y: 420 }, { x: 500, y: 400 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const a = result.doc.nodes.find((n) => n.id === 'a')!;
    expect(a.parent).toBe('other');
    expect(a.x).toBe(2);
    expect(a.y).toBe(-60);
  });

  it('a refused reparent (dropping onto a descendant) writes no position', () => {
    const result = applyDrop(d, 'a', 'child', { x: 999, y: 999 }, { x: 0, y: 0 });
    expect(result.ok).toBe(false);
    const a = d.nodes.find((n) => n.id === 'a')!;
    expect(a.x).toBeUndefined();
  });

  it('round-trips: a dropped child re-projects to the same screen position it was dropped at', () => {
    const start = doc([
      { id: 'container', name: 'Container', x: 300, y: 300 },
      { id: 'child', name: 'Child', parent: 'container' },
    ]);
    const beforeDrop = projectAtlasNodes(start);
    const containerRn = beforeDrop.find((rn) => rn.node.id === 'container')!;
    const droppedAbs = { x: containerRn.x + 60, y: containerRn.y + 90 };

    const result = applyDrop(start, 'child', 'container', droppedAbs, { x: containerRn.x, y: containerRn.y });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rendered = projectAtlasNodes(result.doc);
    const childRn = rendered.find((rn) => rn.node.id === 'child')!;
    expect(childRn.x).toBe(droppedAbs.x);
    expect(childRn.y).toBe(droppedAbs.y);
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

describe('canConnect', () => {
  const d: AtlasDocument = {
    v: 1,
    nodes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    edges: [{ from: 'a', to: 'b' }],
  };

  it('refuses a self edge', () => {
    expect(canConnect(d, 'a', 'a')).toBe(false);
  });

  it('refuses an edge that already exists', () => {
    expect(canConnect(d, 'a', 'b')).toBe(false);
  });

  it('allows a valid new pair', () => {
    expect(canConnect(d, 'b', 'a')).toBe(true);
  });
});

describe('buildConnectDropActions', () => {
  it('a root drop places the new Node at the absolute dropped position, no parent', () => {
    const d = doc([{ id: 'a', name: 'A' }]);
    const actions = buildConnectDropActions(d, 'a', null, { x: 300, y: 40 }, undefined);
    expect(actions).toEqual([
      { type: 'addNode', id: 'new-node', name: 'New Node', x: 300, y: 40 },
      { type: 'addEdge', from: 'a', to: 'new-node' },
    ]);
  });

  it('a Container drop sets the parent and positions relative to the child-area origin', () => {
    // Same geometry as applyDrop's plain-move case: container at (100, 100),
    // dropped at (150, 260) absolute -> (32, 80) relative to the child area.
    const d = doc([
      { id: 'container', name: 'Container' },
      { id: 'a', name: 'A', parent: 'container' },
    ]);
    const actions = buildConnectDropActions(d, 'a', 'container', { x: 150, y: 260 }, { x: 100, y: 100 });
    expect(actions).toEqual([
      { type: 'addNode', id: 'new-node', name: 'New Node', parent: 'container', x: 32, y: 80 },
      { type: 'addEdge', from: 'a', to: 'new-node' },
    ]);
  });

  it('an id collision appends a suffix', () => {
    const d = doc([
      { id: 'a', name: 'A' },
      { id: 'new-node', name: 'Taken' },
    ]);
    const actions = buildConnectDropActions(d, 'a', null, { x: 0, y: 0 }, undefined);
    expect(actions[0]).toMatchObject({ id: 'new-node-2' });
    expect(actions[1]).toEqual({ type: 'addEdge', from: 'a', to: 'new-node-2' });
  });

  it('the second action is the Edge from the source into the new Node', () => {
    const d = doc([{ id: 'source', name: 'Source' }]);
    const actions = buildConnectDropActions(d, 'source', null, { x: 0, y: 0 }, undefined);
    expect(actions[1]).toEqual({ type: 'addEdge', from: 'source', to: 'new-node' });
  });
});
