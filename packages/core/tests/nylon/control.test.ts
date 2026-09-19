import fixture from '../../../client/public/canvases/dotnet-customers.nylon.json';
import { describe, expect, it } from 'vitest';
import { parseNylonDocument, checkNylonDocument, differentiateTransformation } from '../../src/nylon/index.ts';
import { executeNylonAction } from '../../src/nylon/actions.ts';
import { projectNylon } from '../../src/nylon/projection.ts';

const specimen = () => {
  const parsed = parseNylonDocument(JSON.stringify(fixture));
  if (!parsed.ok) throw new Error(parsed.issues.join('; '));
  return parsed.doc;
};

describe('control prototype', () => {
  it('shows two repository calls with separate continuations and three two-node Control Contracts', () => {
    const doc = specimen();
    expect(checkNylonDocument(doc)).toEqual([]);
    expect(doc.transformations.some((node) => node.contractPair)).toBe(false);
    for (const id of ['http-get-call', 'http-refresh-call', 'startup-call', 'environment-call', 'secrets-call', 'app-options-call']) {
      expect(doc.arcs.find((arc) => arc.id === id)).toMatchObject({ kind: 'control', control: 'invoke', controlContract: expect.any(Object) });
    }
    const view = projectNylon(doc, undefined, undefined, undefined, undefined, { kind: 'standard', focusId: 'contact-refresh-service' });
    expect(view.contractFrames.filter((frame) => frame.controlArcId)).toHaveLength(3);
    expect(view.edges.find((edge) => edge.id === 'details-call')).toMatchObject({ sourceId: 'contact-refresh-load', targetId: 'customer-repository-details', styling: { dash: 'dashed', colorToken: 'nylon-control-arc' } });
    expect(view.edges.find((edge) => edge.id === 'details-call-return')).toMatchObject({ sourceId: 'contact-details-materialize', targetId: 'contact-refresh-prepare' });
  });

  it('preserves invocation identity and boundary endpoints when a repository is differentiated', () => {
    const doc = specimen();
    const result = differentiateTransformation(doc, 'contact-summary-upsert');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.arcs.filter((arc) => arc.kind === 'control')).toEqual(doc.arcs.filter((arc) => arc.kind === 'control'));
    expect(checkNylonDocument(result.doc).map(({ message }) => message)).toEqual(checkNylonDocument(doc).map(({ message }) => message));
  });

  it('connects the startup providers through their settings and migrates GET call ownership', () => {
    const doc = specimen();
    const data = doc.arcs.filter((arc) => arc.kind !== 'control');
    for (const [from, to] of [
      ['environment-variables', 'environment-settings'], ['environment-settings', 'prepare-secrets-request'],
      ['aws-secrets-manager', 'secret-settings'], ['secret-settings', 'prepare-app-options-request'],
      ['app-options-table', 'app-options-provider'], ['app-options-provider', 'app-options-settings'],
      ['environment-settings', 'bind-options'], ['secret-settings', 'bind-options'], ['app-options-settings', 'bind-options'],
      ['bind-options', 'application-configured'], ['application-configured', 'contact-refresh-handle'],
    ]) expect(data).toContainEqual(expect.objectContaining({ from, to }));
    for (const id of ['customer-service-class', 'customer-repository-class', 'customer-database']) {
      expect(doc.transformations.find((node) => node.id === id)?.contractPair).toBeUndefined();
    }
    for (const [id, input, output] of [
      ['get-service-call', 'service-request', 'customer-result'],
      ['get-repository-call', 'customer-query', 'customer-row'],
      ['get-database-call', 'sql-query', 'sql-result'],
    ]) expect(doc.arcs.find((arc) => arc.id === id)).toMatchObject({ control: 'invoke', controlContract: { input, output } });
    expect(doc.transformations.find((node) => node.id === 'rate-limit')?.parent).toBe('customer-get-endpoint');
  });

  it('returns not found through its own guarded continuation without reaching the summary write', () => {
    const doc = specimen();
    const control = doc.arcs.filter((arc) => arc.kind === 'control');
    const reachable = new Set(['contact-refresh-not-found']);
    const queue = [...reachable];
    for (const id of queue) for (const arc of control.filter((arc) => arc.from === id)) {
      if (!reachable.has(arc.to)) { reachable.add(arc.to); queue.push(arc.to); }
    }
    expect(reachable.has('contact-refresh-respond-not-found')).toBe(true);
    expect(reachable.has('contact-refresh-save')).toBe(false);
    expect(reachable.has('contact-summary-upsert')).toBe(false);
    expect(reachable.has('contact-refresh-respond')).toBe(false);
    expect(control.find((arc) => arc.id === 'details-not-found-return')).toMatchObject({
      from: 'contact-details-materialize', to: 'contact-refresh-not-found', invocation: 'details-call',
    });
    expect(doc.transformations.find((node) => node.id === 'contact-refresh-prepare')?.prose).toContain('Guard: details result is Found');
    expect(doc.transformations.find((node) => node.id === 'contact-refresh-not-found')?.prose).toContain('Guard: details result is NotFound');
    expect(doc.arcs).toContainEqual({ from: 'customers-table', to: 'contact-details-read' });
    expect(doc.arcs).toContainEqual({ from: 'customer-contacts-table', to: 'contact-details-read' });
    expect(doc.arcs).toContainEqual({ from: 'contact-summary-upsert', to: 'contact-summaries-table' });
    expect(doc.transformations.find((node) => node.id === 'contact-details-materialize')?.parent).toBe('customer-repository-details');
  });

  it('retains semantic violations while allowing movement and reports both endpoints', () => {
    const doc = specimen();
    doc.arcs.push({ id: 'broken-return', kind: 'control', control: 'return', from: 'contact-refresh-load', to: 'contact-refresh-save', invocation: 'missing' });
    const result = executeNylonAction(doc, { op: 'node.move', id: 'contact-refresh-load', dx: 10, dy: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.arcs).toEqual(doc.arcs);
    expect(checkNylonDocument(result.doc)).toContainEqual(expect.objectContaining({ rule: 'return-invocation', nodeIds: ['contact-refresh-load', 'contact-refresh-save'], arcIds: ['broken-return'] }));
    expect(executeNylonAction(doc, { op: 'doctor' })).toMatchObject({ ok: true, doc });
  });
});
