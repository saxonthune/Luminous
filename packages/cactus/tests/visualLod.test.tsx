import { describe, expect, it } from 'vitest';
import {
  placeVisualLodItems,
  projectVisualLodItemsDuringInteraction,
  visualLodItemIsWithinZoom,
} from '../src/visualLod';
import type { VisualLodDeclaration, VisualLodPlacementInput } from '../src/visualLod';

function declaration(id: string, priority: number, patch: Partial<VisualLodDeclaration> = {}): VisualLodDeclaration {
  return {
    id,
    anchor: { nodeId: id, placement: 'top-left' },
    priority,
    placement: { candidates: ['top-left'], allowOcclusion: false },
    render: () => <span>{id}</span>,
    ...patch,
  };
}

function input(
  item: VisualLodDeclaration,
  x = 0,
  y = 0,
  w = 100,
  h = 20,
): VisualLodPlacementInput {
  return { declaration: item, anchorRect: { x, y, w: 100, h: 60 }, size: { w, h } };
}

describe('placeVisualLodItems', () => {
  it('lets a higher-priority item claim a collision and hides the lower item', () => {
    const placed = placeVisualLodItems([
      input(declaration('inner', 1)),
      input(declaration('outer', 10)),
    ]);

    expect(placed.get('outer')?.status).toBe('placed');
    expect(placed.get('inner')?.status).toBe('hidden');
    expect(placed.get('outer')!.zIndex).toBeGreaterThan(placed.get('inner')!.zIndex);
  });

  it('uses the first collision-free candidate before occluding an item', () => {
    const lower = declaration('lower', 1, {
      placement: { candidates: ['top-left', 'right'], allowOcclusion: true },
    });
    const placed = placeVisualLodItems([
      input(declaration('higher', 2)),
      input(lower),
    ]);

    expect(placed.get('lower')).toMatchObject({ status: 'placed', candidate: 'right', x: 100 });
  });

  it('keeps a partially visible lower-priority item behind the higher item', () => {
    const lower = declaration('lower', 1, {
      placement: { candidates: ['top-left'], allowOcclusion: true, minVisibleFraction: 0.4 },
    });
    const placed = placeVisualLodItems([
      input(declaration('higher', 2), 0),
      input(lower, 50),
    ]);

    expect(placed.get('lower')?.status).toBe('occluded');
    expect(placed.get('lower')?.visibleFraction).toBe(0.5);
  });

  it('hides an occluded item below its visible-area threshold', () => {
    const lower = declaration('lower', 1, {
      placement: { candidates: ['top-left'], allowOcclusion: true, minVisibleFraction: 0.6 },
    });
    const placed = placeVisualLodItems([
      input(declaration('higher', 2), 0),
      input(lower, 50),
    ]);

    expect(placed.get('lower')?.status).toBe('hidden');
  });

  it('does not collide items from different collision groups', () => {
    const placed = placeVisualLodItems([
      input(declaration('a', 2, { collisionGroup: 'one' })),
      input(declaration('b', 1, { collisionGroup: 'two' })),
    ]);

    expect(placed.get('a')?.status).toBe('placed');
    expect(placed.get('b')?.status).toBe('placed');
  });

  it('keeps a previous collision-free candidate to prevent zoom-time hopping', () => {
    const item = declaration('item', 1, {
      placement: { candidates: ['top-left', 'right'], allowOcclusion: true },
    });
    const previous = new Map([
      ['item', {
        id: 'item', x: 100, y: 20, w: 100, h: 20,
        candidate: 'right' as const, status: 'placed' as const,
        displacement: { x: 0, y: 0 }, visibleFraction: 1, zIndex: 1,
      }],
    ]);

    const placed = placeVisualLodItems([input(item)], previous);
    expect(placed.get('item')?.candidate).toBe('right');
  });

  it('searches within a bounded displacement when fixed candidates collide', () => {
    const movable = declaration('movable', 1, {
      placement: {
        candidates: ['top-left'],
        allowOcclusion: false,
        displacement: { maxDistance: 40, step: 20, directions: ['up'] },
      },
    });
    const placed = placeVisualLodItems([
      input(declaration('blocker', 2), 0, 0),
      input(movable, 0, 0),
    ]);

    expect(placed.get('movable')).toMatchObject({
      status: 'placed', y: -20, displacement: { x: 0, y: -20 },
    });
  });

  it('hides an item when its displacement tolerance cannot clear a collision', () => {
    const movable = declaration('movable', 1, {
      placement: {
        candidates: ['top-left'],
        allowOcclusion: false,
        displacement: { maxDistance: 10, step: 10, directions: ['up'] },
      },
    });
    const placed = placeVisualLodItems([
      input(declaration('blocker', 2), 0, 0),
      input(movable, 0, 0),
    ]);

    expect(placed.get('movable')?.status).toBe('hidden');
  });

  it('retains a valid previous displacement during continuous placement', () => {
    const item = declaration('item', 1, {
      placement: {
        candidates: ['top-left'],
        allowOcclusion: false,
        displacement: { maxDistance: 40, step: 20, directions: ['up'] },
      },
    });
    const previous = new Map([
      ['item', {
        id: 'item', x: 0, y: -40, w: 100, h: 20,
        candidate: 'top-left' as const, displacement: { x: 0, y: -40 },
        status: 'placed' as const, visibleFraction: 1, zIndex: 1,
      }],
    ]);
    const placed = placeVisualLodItems([
      input(declaration('blocker', 2), 0, 0),
      input(item, 0, 0),
    ], previous);

    expect(placed.get('item')).toMatchObject({ y: -40, displacement: { x: 0, y: -40 } });
  });

  it('hides deeper admission ranks when the current rank is incomplete', () => {
    const placed = placeVisualLodItems([
      input(declaration('root', 100, { admission: { group: 'tree', rank: 0 } }), 0),
      input(declaration('blocker', 90), 200),
      input(declaration('middle', 50, { admission: { group: 'tree', rank: 1 } }), 200),
      input(declaration('detail', 1, { admission: { group: 'tree', rank: 2 } }), 400),
    ]);

    expect(placed.get('root')?.status).toBe('placed');
    expect(placed.get('middle')?.status).toBe('hidden');
    expect(placed.get('detail')).toMatchObject({ status: 'hidden', visibleFraction: 0 });
  });

  it('admits the next rank after every item in the current rank remains visible', () => {
    const placed = placeVisualLodItems([
      input(declaration('root', 100, { admission: { group: 'tree', rank: 0 } }), 0),
      input(declaration('middle-a', 50, { admission: { group: 'tree', rank: 1 } }), 150),
      input(declaration('middle-b', 40, { admission: { group: 'tree', rank: 1 } }), 300),
      input(declaration('detail', 1, { admission: { group: 'tree', rank: 2 } }), 450),
    ]);

    expect(placed.get('middle-a')?.status).toBe('placed');
    expect(placed.get('middle-b')?.status).toBe('placed');
    expect(placed.get('detail')?.status).toBe('placed');
  });

  it('gates admission groups independently', () => {
    const placed = placeVisualLodItems([
      input(declaration('blocker', 200), 100),
      input(declaration('a-root', 100, { admission: { group: 'a', rank: 0 } }), 0),
      input(declaration('a-middle', 50, { admission: { group: 'a', rank: 1 } }), 100),
      input(declaration('a-detail', 1, { admission: { group: 'a', rank: 2 } }), 200),
      input(declaration('b-root', 100, { admission: { group: 'b', rank: 0 } }), 300),
      input(declaration('b-detail', 1, { admission: { group: 'b', rank: 1 } }), 400),
    ]);

    expect(placed.get('a-middle')?.status).toBe('hidden');
    expect(placed.get('a-detail')?.status).toBe('hidden');
    expect(placed.get('b-detail')?.status).toBe('placed');
  });

  it('retains settled cards before admitting cards into newly available space', () => {
    const retained = declaration('retained', 1);
    const newcomer = declaration('newcomer', 100);
    const previous = placeVisualLodItems([input(retained)]);

    const placed = placeVisualLodItems(
      [input(retained), input(newcomer)],
      previous,
      { retainVisiblePlacements: true },
    );

    expect(placed.get('retained')?.status).toBe('placed');
    expect(placed.get('newcomer')?.status).toBe('hidden');
  });
});

describe('interaction projection', () => {
  it('keeps a committed candidate instead of searching during camera motion', () => {
    const blocker = declaration('blocker', 2);
    const movable = declaration('movable', 1, {
      placement: { candidates: ['top-left', 'right'], allowOcclusion: false },
    });
    const committed = placeVisualLodItems([
      input(blocker, 200),
      input(movable, 0),
    ]);

    const projected = projectVisualLodItemsDuringInteraction([
      input(blocker, 0),
      input(movable, 0),
    ], committed);

    expect(projected.get('movable')).toMatchObject({
      candidate: 'top-left',
      status: 'hidden',
    });
  });

  it('does not admit a card that was hidden when interaction began', () => {
    const visible = declaration('visible', 2);
    const hidden = declaration('hidden', 1);
    const committed = placeVisualLodItems([input(visible), input(hidden)]);

    const projected = projectVisualLodItemsDuringInteraction([
      input(visible, 0),
      input(hidden, 200),
    ], committed);

    expect(projected.get('hidden')?.status).toBe('hidden');
  });

  it('keeps a gesture-suppressed card hidden after its collision clears', () => {
    const item = declaration('item', 1);
    const committed = placeVisualLodItems([input(item)]);

    const projected = projectVisualLodItemsDuringInteraction(
      [input(item, 200)],
      committed,
      new Set(['item']),
    );

    expect(projected.get('item')?.status).toBe('hidden');
  });
});

describe('visual LOD zoom hysteresis', () => {
  const item = { minZoom: 0.25, maxZoom: 0.65 };

  it('requires a hidden card to enter its declared zoom range', () => {
    expect(visualLodItemIsWithinZoom(item, 0.66, false)).toBe(false);
    expect(visualLodItemIsWithinZoom(item, 0.64, false)).toBe(true);
  });

  it('keeps a visible card through the exit margin', () => {
    expect(visualLodItemIsWithinZoom(item, 0.67, true)).toBe(true);
    expect(visualLodItemIsWithinZoom(item, 0.69, true)).toBe(false);
  });
});
