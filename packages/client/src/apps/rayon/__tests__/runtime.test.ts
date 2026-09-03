import { describe, expect, it } from 'vitest';
import {
  completeImpulse,
  createPrimaryImpulse,
  createSecondaryImpulse,
  emptyRayonSession,
  runtimeView,
} from '../runtime.ts';
import { projectRayon } from '../projection.ts';

describe('Rayon two-button runtime', () => {
  it('moves an impulse through one persistent network instead of adding history nodes', () => {
    const session = emptyRayonSession();
    const impulse = createPrimaryImpulse(session);
    const beforeWrite = runtimeView(session, impulse, 4);
    const afterWrite = runtimeView(session, impulse, 5);
    const afterDomUpdate = runtimeView(session, impulse, 6);

    expect(beforeWrite.primaryPresses).toBe(0);
    expect(afterWrite.primaryPresses).toBe(1);
    expect(afterWrite.primaryOutputCount).toBe(0);
    expect(afterDomUpdate.primaryOutputCount).toBe(1);
    expect(impulse.frames.map((frame) => frame.carrier)).toEqual([
      'event',
      'event',
      'control',
      'value',
      'value',
      'mutation',
      'mutation',
      'value',
      'control',
    ]);
    expect(projectRayon(afterWrite, impulse.frames[5] ?? null).nodes.some((node) => node.id.startsWith('event:'))).toBe(false);
  });

  it('materializes the secondary output when the fifth impulse crosses the threshold', () => {
    let session = emptyRayonSession();
    for (let index = 0; index < 4; index += 1) {
      session = completeImpulse(session, createPrimaryImpulse(session));
    }

    const fifth = createPrimaryImpulse(session);
    const beforeMaterialization = runtimeView(session, fifth, fifth.frames.length - 2);
    const afterMaterialization = runtimeView(session, fifth, fifth.frames.length - 1);

    expect(fifth.branchTaken).toBe(true);
    expect(beforeMaterialization.secondaryVisible).toBe(false);
    expect(projectRayon(beforeMaterialization, fifth.frames.at(-2) ?? null).nodes.some((node) => node.id === 'output:secondaryButton:1')).toBe(false);
    expect(projectRayon(afterMaterialization, fifth.frames.at(-1) ?? null).nodes.some((node) => node.id === 'output:secondaryButton:1')).toBe(true);
  });

  it('does not admit a secondary impulse before its output exists', () => {
    expect(createSecondaryImpulse(emptyRayonSession())).toBeNull();
  });
});
