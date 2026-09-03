export type RayonImpulseKind = 'primary-press' | 'secondary-press';
export type RayonCarrier = 'event' | 'control' | 'value' | 'mutation' | 'structure';

export interface RayonRuntimeEvent {
  id: string;
  kind: RayonImpulseKind;
  ordinal: number;
  before: number;
  after: number;
  branchTaken?: boolean;
}

export interface RayonSession {
  primaryPresses: number;
  secondaryCount: number;
  nextImpulse: number;
  events: RayonRuntimeEvent[];
}

export interface RayonRuntimeView {
  primaryPresses: number;
  secondaryCount: number;
  primaryOutputCount: number;
  secondaryOutputCount: number;
  secondaryVisible: boolean;
}

export interface RayonImpulseFrame {
  nodeId: string;
  viaEdgeId?: string;
  effectEdgeId?: string;
  carrier: RayonCarrier;
  payload: string;
  detail: string;
  sourceLine: number;
  patch?: Partial<RayonRuntimeView>;
}

export interface RayonImpulse extends RayonRuntimeEvent {
  frames: RayonImpulseFrame[];
}

export function emptyRayonSession(): RayonSession {
  return { primaryPresses: 0, secondaryCount: 0, nextImpulse: 1, events: [] };
}

export function sessionView(session: RayonSession): RayonRuntimeView {
  return {
    primaryPresses: session.primaryPresses,
    secondaryCount: session.secondaryCount,
    primaryOutputCount: session.primaryPresses,
    secondaryOutputCount: session.secondaryCount,
    secondaryVisible: session.primaryPresses >= 5,
  };
}

export function createPrimaryImpulse(session: RayonSession): RayonImpulse {
  const ordinal = session.events.filter((event) => event.kind === 'primary-press').length + 1;
  const after = session.primaryPresses + 1;
  const branchTaken = after === 5;
  const frames: RayonImpulseFrame[] = [
    frame('output:primaryButton:1', 'event', 'click Event', 'the browser creates a click event', 6),
    frame('instruction:dispatch-primary', 'event', 'click Event', 'EventTarget dispatch finds the registered listener', 8, 'primary-native-event'),
    frame('instruction:primary-handler', 'control', 'pressPrimary(event)', 'the browser calls the handler function', 10, 'dispatch-primary-handler'),
    frame('instruction:read-primary', 'value', String(session.primaryPresses), 'read state.primaryPresses', 11, 'primary-handler-read', 'primary-state-read'),
    frame('instruction:increment-primary', 'value', `${session.primaryPresses} → ${after}`, 'evaluate before + 1', 12, 'primary-read-increment'),
    frame('instruction:write-primary', 'mutation', `primaryPresses ← ${after}`, 'assign the new number to the state object', 13, 'primary-increment-write', 'write-primary-state', { primaryPresses: after }),
    frame('instruction:update-primary-output', 'mutation', `Primary · ${after}`, 'assign the button textContent', 14, 'primary-write-update', 'update-primary-dom', { primaryOutputCount: after }),
    frame('instruction:test-secondary', 'value', `${after} === 5 → ${branchTaken}`, 'evaluate the branch condition', 16, 'primary-update-test'),
  ];

  if (branchTaken) {
    frames.push(
      frame('instruction:create-secondary', 'structure', 'HTMLButtonElement', 'document.createElement creates a detached node', 17, 'test-create'),
      frame('instruction:configure-secondary', 'structure', 'text + listener', 'configure the node and register pressSecondary', 19, 'create-configure'),
      frame('instruction:append-secondary', 'structure', 'append(button)', 'insert the node into the live DOM', 20, 'configure-append'),
      frame('output:secondaryButton:1', 'structure', 'Secondary button', 'the DOM now contains a new interface individual', 20, 'append-secondary-output', undefined, { secondaryVisible: true }),
    );
  } else {
    frames.push(frame('instruction:no-secondary', 'control', 'return', 'the branch body is skipped', 16, 'test-stop'));
  }

  return {
    id: `impulse:${session.nextImpulse}`,
    kind: 'primary-press',
    ordinal,
    before: session.primaryPresses,
    after,
    branchTaken,
    frames,
  };
}

export function createSecondaryImpulse(session: RayonSession): RayonImpulse | null {
  if (session.primaryPresses < 5) return null;
  const ordinal = session.events.filter((event) => event.kind === 'secondary-press').length + 1;
  const after = session.secondaryCount + 1;
  return {
    id: `impulse:${session.nextImpulse}`,
    kind: 'secondary-press',
    ordinal,
    before: session.secondaryCount,
    after,
    frames: [
      frame('output:secondaryButton:1', 'event', 'click Event', 'the browser creates a click event', 20),
      frame('instruction:dispatch-secondary', 'event', 'click Event', 'EventTarget dispatch finds the registered listener', 19, 'secondary-native-event'),
      frame('instruction:secondary-handler', 'control', 'pressSecondary(event)', 'the browser calls the handler function', 24, 'dispatch-secondary-handler'),
      frame('instruction:read-secondary', 'value', String(session.secondaryCount), 'read state.secondaryCount', 25, 'secondary-handler-read', 'secondary-state-read'),
      frame('instruction:increment-secondary', 'value', `${session.secondaryCount} → ${after}`, 'evaluate the increment', 25, 'secondary-read-increment'),
      frame('instruction:write-secondary', 'mutation', `secondaryCount ← ${after}`, 'assign the new number to the state object', 25, 'secondary-increment-write', 'write-secondary-state', { secondaryCount: after }),
      frame('instruction:update-secondary-output', 'mutation', `Secondary · ${after}`, 'assign event.currentTarget.textContent', 26, 'secondary-write-update', 'update-secondary-dom', { secondaryOutputCount: after }),
    ],
  };
}

export function runtimeView(session: RayonSession, impulse: RayonImpulse | null, frameIndex: number): RayonRuntimeView {
  const view = sessionView(session);
  if (!impulse) return view;
  const lastFrame = Math.min(Math.max(frameIndex, 0), impulse.frames.length - 1);
  for (let index = 0; index <= lastFrame; index += 1) Object.assign(view, impulse.frames[index]?.patch);
  return view;
}

export function completeImpulse(session: RayonSession, impulse: RayonImpulse): RayonSession {
  const view = runtimeView(session, impulse, impulse.frames.length - 1);
  const { frames: _frames, ...event } = impulse;
  return {
    primaryPresses: view.primaryPresses,
    secondaryCount: view.secondaryCount,
    nextImpulse: session.nextImpulse + 1,
    events: [...session.events, event],
  };
}

function frame(
  nodeId: string,
  carrier: RayonCarrier,
  payload: string,
  detail: string,
  sourceLine: number,
  viaEdgeId?: string,
  effectEdgeId?: string,
  patch?: Partial<RayonRuntimeView>,
): RayonImpulseFrame {
  return { nodeId, viaEdgeId, effectEdgeId, carrier, payload, detail, sourceLine, patch };
}
