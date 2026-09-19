import { expect, it } from 'vitest';
import { createRoot, createSignal } from 'solid-js';
import { projectNylon } from '@luminous/core/nylon/projection';
import { createNylonPips } from '../createNylonPips.ts';
import { pipNodeId } from '../pipSession.ts';
import { writeNylonTabSession, readNylonTabSession } from '../tabSession.ts';
import type { NylonDocument } from '@luminous/core/nylon';

it('omits PIP context and only links selected members to existing main-view Contracts', () => {
  createRoot((dispose) => {
    const doc: NylonDocument = { v: 1, transformations: [
      { id: 'parent', name: 'Parent' }, { id: 'child', name: 'Child', parent: 'parent' },
    ], contracts: [{ id: 'external', name: 'External', x: -400 }], arcs: [{ from: 'external', to: 'child' }] };
    const main = () => projectNylon(doc, undefined, undefined, undefined, undefined, { kind: 'standard', focusId: null });
    const [selected, setSelected] = createSignal<string[]>([]);
    const pips = createNylonPips(() => doc, main, undefined, () => {}, selected);
    pips.open('parent', 'parent');
    const id = pips.session().open[0].id;
    expect(pips.views()[0].projection.nodes.some((n) => n.context)).toBe(false);
    expect(pips.projection().edges.some((e) => e.id.includes('pip-selection'))).toBe(false);
    setSelected([pipNodeId(id, 'child')]);
    const links = pips.projection().edges.filter((e) => e.id.includes('pip-selection'));
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ sourceId: pipNodeId(id, 'child'), targetId: 'external', styling: { curve: 'straight', dash: 'dotted' } });
    setSelected([]);
    expect(pips.projection().edges.some((e) => e.id.includes('pip-selection'))).toBe(false);
    pips.toggleContext(id);
    expect(pips.views()[0].projection.nodes.some((n) => n.context)).toBe(true);
    writeNylonTabSession('context-test', { activeKey: 'continuous', closed: [], tabs: [{ key: 'continuous', view: { kind: 'continuous' },
      state: { camera: { x: 0, y: 0, k: 1 }, selection: [], containerStates: new Map(), pips: pips.session() } }] });
    expect(readNylonTabSession('context-test')?.tabs[0].state?.pips?.open[0].showContext).toBe(true);
    sessionStorage.clear();
    dispose();
  });
});
