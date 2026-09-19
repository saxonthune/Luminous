import { afterEach, expect, it } from 'vitest';
import { readNylonTabSession } from '../tabSession.ts';

afterEach(() => sessionStorage.clear());
it('restores older tab state and isolates malformed PIPs from otherwise usable sessions', () => {
  const session = { v: 1, activeKey: 'continuous', closed: [], tabs: [{ view: { kind: 'continuous' },
    state: { camera: { x: 40, y: 50, k: 2 }, selection: [], containerStates: [] } }] };
  sessionStorage.setItem('nylon-tabs:migration', JSON.stringify(session));
  expect(readNylonTabSession('migration')?.tabs[0].state?.camera).toEqual({ x: 40, y: 50, k: 2 });
  expect(readNylonTabSession('migration')?.tabs[0].state?.pips).toEqual({ open: [], closed: [] });
  sessionStorage.setItem('nylon-tabs:migration', JSON.stringify({ ...session, v: 2, tabs: [{ ...session.tabs[0],
    state: { ...session.tabs[0].state, pips: { open: [{ id: 'bad' }], closed: [] } } }] }));
  expect(readNylonTabSession('migration')?.tabs[0].state?.camera.x).toBe(40);
  expect(readNylonTabSession('migration')?.tabs[0].state?.pips?.open).toEqual([]);
});
