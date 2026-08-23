import { describe, it, expect } from 'vitest';
import { checkLinenDocument } from '../../src/linen/check.ts';
import type { LinenDocument } from '../../src/linen/types.ts';

function clean(): LinenDocument {
  return {
    v: 1,
    modules: [
      { id: 'worker', name: 'Worker' },
      { id: 'kv', name: 'KV' },
    ],
    contracts: [{ id: 'snapshot', name: 'RenderSnapshot' }],
    nodes: [
      { id: 'start', kind: 'entry', module: 'worker' },
      { id: 'guard', kind: 'filter', module: 'worker' },
      { id: 'bail', kind: 'return', module: 'worker' },
      { id: 'store', kind: 'pass', module: 'worker', to: 'kv' },
      { id: 'done', kind: 'release-control', module: 'worker' },
    ],
    edges: [
      { from: 'start', to: 'guard' },
      { from: 'guard', to: 'bail' },
      { from: 'guard', to: 'store' },
      { from: 'store', to: 'done' },
      { from: 'kv', to: 'snapshot' },
    ],
  };
}

function messages(doc: LinenDocument, severity?: 'error' | 'warning'): string[] {
  return checkLinenDocument(doc)
    .filter(i => severity === undefined || i.severity === severity)
    .map(i => i.message);
}

describe('checkLinenDocument', () => {
  it('reports nothing on a clean document', () => {
    expect(checkLinenDocument(clean())).toEqual([]);
  });

  it('errors on a dangling edge endpoint', () => {
    const doc = clean();
    doc.edges.push({ from: 'start', to: 'ghost' });
    expect(messages(doc, 'error')).toContain('edge references unknown id "ghost"');
  });

  it('errors on an illegal endpoint combination', () => {
    const doc = clean();
    doc.edges.push({ from: 'snapshot', to: 'start' });
    expect(messages(doc, 'error').some(m => m.includes('joins a contract to a node'))).toBe(true);
  });

  it('errors on an Entry with an incoming control edge', () => {
    const doc = clean();
    doc.edges.push({ from: 'store', to: 'start' });
    expect(messages(doc, 'error').some(m => m.includes('Entry "start"') && m.includes('incoming'))).toBe(true);
  });

  it('errors on a terminating node with an outgoing control edge', () => {
    const doc = clean();
    doc.edges.push({ from: 'bail', to: 'store' });
    expect(messages(doc, 'error')).toContain('Return "bail" terminates the Trace but has an outgoing control Edge');
  });

  it('errors on a Filter with two continuing exits', () => {
    const doc = clean();
    doc.nodes.push({ id: 'extra', kind: 'transformation', module: 'worker' });
    doc.edges.push({ from: 'guard', to: 'extra' });
    expect(messages(doc, 'error').some(m => m.includes('Filter "guard" has 2 continuing exits'))).toBe(true);
  });

  it('errors on a Filter with zero continuing exits', () => {
    const doc = clean();
    doc.edges = doc.edges.filter(e => !(e.from === 'guard' && e.to === 'store'));
    const found = messages(doc, 'error').some(m => m.includes('Filter "guard" has 0 continuing exits'));
    expect(found).toBe(true);
  });

  it('warns on a Pass whose target Module has no Contract connected', () => {
    const doc = clean();
    doc.edges = doc.edges.filter(e => e.from !== 'kv');
    expect(messages(doc, 'warning').some(m => m.includes('Pass "store"') && m.includes('no Contract connected'))).toBe(true);
  });

  it('warns on a node unreachable from any Entry', () => {
    const doc = clean();
    doc.nodes.push({ id: 'island', kind: 'transformation', module: 'worker' });
    expect(messages(doc, 'warning')).toContain('node "island" is unreachable from any Entry');
  });

  it('errors on a module parent cycle', () => {
    const doc = clean();
    doc.modules = [
      { id: 'worker', name: 'Worker', parent: 'kv' },
      { id: 'kv', name: 'KV', parent: 'worker' },
    ];
    expect(messages(doc, 'error').some(m => m.includes('module parent cycle'))).toBe(true);
  });

  it('errors on dangling module, owner, and contract references', () => {
    const doc = clean();
    doc.modules[1] = { id: 'kv', name: 'KV', parent: 'ghost' };
    doc.contracts[0] = { id: 'snapshot', name: 'RenderSnapshot', owner: 'ghost' };
    doc.nodes.push({ id: 't', kind: 'type', module: 'ghost', contract: 'ghost-contract' });
    doc.edges.push({ from: 'start', to: 't' });
    const errors = messages(doc, 'error');
    expect(errors).toContain('module "kv" parent references unknown module id "ghost"');
    expect(errors).toContain('contract "snapshot" owner references unknown module id "ghost"');
    expect(errors).toContain('node "t" module references unknown module id "ghost"');
    expect(errors).toContain('node "t" contract references unknown contract id "ghost-contract"');
  });
});
