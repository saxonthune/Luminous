import { describe, expect, it } from 'vitest';
import { checkNylonDocument, nylonRules, parseNylonDocument, reparentNylonNode, type NylonDocument, type NylonRuleContext } from '../../src/nylon/index.ts';
import { executeNylonAction } from '../../src/nylon/actions.ts';

const document = (): NylonDocument => ({
  v: 1,
  transformations: [{ id: 'parent', name: 'Parent' }, { id: 'child', name: 'Child', parent: 'parent' }],
  contracts: [{ id: 'input', name: 'Input' }], arcs: [],
});

describe('Nylon-wide rules', () => {
  it('gives JSON and mutation-created semantic violations identical diagnostics', () => {
    const before = document();
    const authored: NylonDocument = {
      ...before,
      transformations: before.transformations.map((node) => node.id === 'parent'
        ? { ...node, contractPair: { input: 'input', output: 'input' } } : node),
      arcs: [{ from: 'parent', to: 'child' }, { from: 'input', to: 'missing' }, { from: 'parent', to: 'child' }],
    };
    const result = executeNylonAction(before, { op: 'batch', operations: [
      { op: 'arc.add', from: 'parent', to: 'child' },
      { op: 'arc.add', from: 'input', to: 'missing' },
      { op: 'arc.add', from: 'parent', to: 'child' },
      { op: 'contract-pair.set', transformationId: 'parent', input: 'input', output: 'input' },
    ] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = parseNylonDocument(JSON.stringify(authored));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(result.doc).toEqual(parsed.doc);
    const issues = checkNylonDocument(result.doc);
    expect(issues).toEqual(checkNylonDocument(parsed.doc));
    expect(issues.map((issue) => issue.rule)).toEqual(expect.arrayContaining([
      'data-alternation', 'data-parent-endpoint', 'arc-endpoint', 'distinct-contracts', 'duplicate-arc',
    ]));
    expect(issues.every((issue) => issue.severity === 'warning')).toBe(true);
    expect(before).toEqual(document());
  });

  it('uses the same structural cycle rule for reparenting and authored JSON without modifying either', () => {
    const doc = document();
    const invalid = { ...doc, transformations: doc.transformations.map((node) => node.id === 'parent' ? { ...node, parent: 'child' } : node) };
    const issues = checkNylonDocument(invalid);
    expect(issues.every((issue) => issue.rule === 'parent-cycle' && issue.severity === 'error')).toBe(true);
    const result = reparentNylonNode(doc, 'parent', 'child');
    expect(result).toEqual({ ok: false, error: issues.map((issue) => issue.message).join('; ') });
    expect(doc).toEqual(document());
  });

  it('assigns diagnostic identity and severity from the catalog, including a newly added rule', () => {
    expect(new Set(nylonRules.map((rule) => rule.id)).size).toBe(nylonRules.length);
    const doc = document();
    const rules = [...nylonRules, {
      id: 'prototype-needs-description', description: 'Describe each Transformation.', severity: 'warning' as const,
      check: ({ doc }: NylonRuleContext) => doc.transformations
        .filter((node) => !node.prose).map((node) => ({ message: 'Add a description', nodeIds: [node.id] })),
    }];
    expect(checkNylonDocument(doc, rules)).toEqual(doc.transformations.map((node) => ({
      rule: 'prototype-needs-description', severity: 'warning', message: 'Add a description',
      nodeIds: [node.id], arcIds: [], id: node.id,
    })));
    expect(doc).toEqual(document());
  });
});
