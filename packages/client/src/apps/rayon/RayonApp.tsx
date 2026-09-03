import { For, Show, createMemo, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import type { CanvasRef } from '@luminous/cactus';
import { RayonCanvas } from './RayonCanvas.tsx';
import { RayonSplitPane } from './RayonSplitPane.tsx';
import {
  completeImpulse,
  createPrimaryImpulse,
  createSecondaryImpulse,
  emptyRayonSession,
  runtimeView,
  type RayonImpulse,
} from './runtime.ts';
import { projectRayon } from './projection.ts';

const SOURCE = `const state = {
  primaryPresses: 0,
  secondaryCount: 0,
}

const primaryButton = document.querySelector('#primary')
const output = document.querySelector('#output')
primaryButton.addEventListener('click', pressPrimary)

function pressPrimary(event) {
  const before = state.primaryPresses
  const after = before + 1
  state.primaryPresses = after
  primaryButton.textContent = \`Primary · \${after}\`

  if (after === 5) {
    const button = document.createElement('button')
    button.textContent = \`Secondary · \${state.secondaryCount}\`
    button.addEventListener('click', pressSecondary)
    output.append(button)
  }
}

function pressSecondary(event) {
  state.secondaryCount += 1
  event.currentTarget.textContent =
    \`Secondary · \${state.secondaryCount}\`
}`;

const SOURCE_LINES = SOURCE.split('\n');
const FRAME_DURATION_MS = 360;

export function RayonApp(): JSX.Element {
  const [session, setSession] = createSignal(emptyRayonSession());
  const [impulse, setImpulse] = createSignal<RayonImpulse | null>(null);
  const [frameIndex, setFrameIndex] = createSignal(0);
  const [selectedId, setSelectedId] = createSignal<string | null>('data:primaryPresses');
  const [leftWidth, setLeftWidth] = createSignal(readPaneWidth());
  let canvasRef: CanvasRef | undefined;
  let frameTimer: number | undefined;

  const activeFrame = createMemo(() => impulse()?.frames[frameIndex()] ?? null);
  const view = createMemo(() => runtimeView(session(), impulse(), frameIndex()));
  const projection = createMemo(() => projectRayon(view(), activeFrame()));
  const selectedNode = createMemo(() => projection().nodes.find((node) => node.id === selectedId()) ?? null);
  const selectedLine = createMemo(() => activeFrame()?.sourceLine ?? selectedNode()?.sourceLine ?? null);

  function retainPaneWidth(width: number) {
    setLeftWidth(width);
    localStorage.setItem('luminous:rayon:left-width', String(Math.round(width)));
  }

  function reveal(id: string) {
    setSelectedId(id);
    canvasRef?.setSelectedIds([id]);
    const renderNode = projection().nodes.find((candidate) => candidate.id === id);
    if (renderNode) canvasRef?.centerView({ x: renderNode.x, y: renderNode.y, width: renderNode.w, height: renderNode.h });
  }

  function run(next: RayonImpulse | null) {
    if (!next || impulse()) return;
    window.clearTimeout(frameTimer);
    setFrameIndex(0);
    setImpulse(next);
    let index = 0;

    const advance = () => {
      index += 1;
      if (index >= next.frames.length) {
        setSession((current) => completeImpulse(current, next));
        setImpulse(null);
        setFrameIndex(0);
        frameTimer = undefined;
        return;
      }
      setFrameIndex(index);
      frameTimer = window.setTimeout(advance, FRAME_DURATION_MS);
    };

    frameTimer = window.setTimeout(advance, FRAME_DURATION_MS);
  }

  function reset() {
    window.clearTimeout(frameTimer);
    frameTimer = undefined;
    setImpulse(null);
    setFrameIndex(0);
    setSession(emptyRayonSession());
    queueMicrotask(() => {
      reveal('data:primaryPresses');
      fitEnvironment();
    });
  }

  function fitEnvironment() {
    canvasRef?.fitView(
      projection().nodes.map((renderNode) => ({ x: renderNode.x, y: renderNode.y, width: renderNode.w, height: renderNode.h })),
      64,
    );
  }

  onMount(() => window.setTimeout(fitEnvironment, 0));
  onCleanup(() => window.clearTimeout(frameTimer));

  const sourcePane = (
    <div style={{ display: 'flex', 'flex-direction': 'column', height: '100%', background: 'var(--surface)' }}>
      <div style={{ padding: '10px 12px', border: '1px solid var(--border)', 'border-left': 0, 'font-size': '12px', 'font-weight': 650 }}>
        two-buttons.js
      </div>
      <div style={{ flex: '1 1 auto', overflow: 'auto', padding: '12px 0', background: 'var(--cm-code-bg)' }}>
        <For each={SOURCE_LINES}>
          {(line, index) => {
            const lineNumber = index() + 1;
            return (
              <button
                type="button"
                onClick={() => {
                  const renderNode = projection().nodes.find((candidate) => candidate.sourceLine === lineNumber);
                  if (renderNode) reveal(renderNode.id);
                }}
                style={{
                  display: 'grid',
                  'grid-template-columns': '34px 1fr',
                  width: '100%',
                  border: 0,
                  padding: '1px 10px 1px 0',
                  background: selectedLine() === lineNumber ? 'var(--accent-10)' : 'transparent',
                  color: selectedLine() === lineNumber ? 'var(--fg)' : 'var(--cm-text)',
                  'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  'font-size': '11px',
                  'line-height': 1.65,
                  'text-align': 'left',
                  cursor: projection().nodes.some((candidate) => candidate.sourceLine === lineNumber) ? 'pointer' : 'default',
                }}
              >
                <span style={{ color: 'var(--fg-subtle)', 'text-align': 'right', 'padding-right': '9px', 'user-select': 'none' }}>{lineNumber}</span>
                <span style={{ 'white-space': 'pre' }}>{line || ' '}</span>
              </button>
            );
          }}
        </For>
      </div>
      <div style={{ padding: '14px', border: '1px solid var(--border)', 'border-left': 0, background: 'var(--surface)' }}>
        <div style={{ 'font-size': '10px', 'text-transform': 'uppercase', 'letter-spacing': '0.08em', color: 'var(--fg-muted)', 'margin-bottom': '10px' }}>Rendered output</div>
        <div style={{ display: 'flex', gap: '8px', 'align-items': 'center', 'min-height': '34px' }}>
          <button
            class="rounded bg-accent px-3 py-1.5 text-sm text-on-accent hover:bg-accent-hover disabled:cursor-wait disabled:opacity-60"
            disabled={impulse() !== null}
            on:click={() => run(createPrimaryImpulse(session()))}
          >
            Primary · {view().primaryOutputCount}
          </button>
          <Show when={view().secondaryVisible}>
            <button
              class="rounded border border-border px-3 py-1.5 text-sm text-fg hover:bg-surface-alt disabled:cursor-wait disabled:opacity-60"
              disabled={impulse() !== null}
              on:click={() => run(createSecondaryImpulse(session()))}
            >
              Secondary · {view().secondaryOutputCount}
            </button>
          </Show>
        </div>
      </div>
    </div>
  );

  const runtimePane = (
    <div style={{ position: 'relative', height: '100%', background: 'var(--canvas)' }}>
      <RayonCanvas
        view={view()}
        activeFrame={activeFrame()}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onReady={(ref) => { canvasRef = ref; }}
      />
      <div
        data-no-pan="true"
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          display: 'flex',
          'align-items': 'center',
          gap: '6px',
          padding: '5px',
          background: 'var(--overlay)',
          border: '1px solid var(--border)',
          'border-radius': '8px',
          'box-shadow': 'var(--shadow-sm)',
        }}
      >
        <button class="rounded px-2 py-1 text-xs text-fg-muted hover:bg-surface-alt hover:text-fg" onClick={fitEnvironment}>Fit environment</button>
        <button class="rounded px-2 py-1 text-xs text-fg-muted hover:bg-surface-alt hover:text-fg" onClick={reset}>Reset run</button>
        <Show when={activeFrame()}>
          {(current) => (
            <span style={{ display: 'flex', gap: '6px', padding: '0 7px', color: 'var(--accent)', 'font-size': '11px', 'font-family': 'ui-monospace, monospace' }}>
              <strong style={{ 'text-transform': 'uppercase', 'font-size': '9px', 'letter-spacing': '0.08em' }}>{current().carrier}</strong>
              {current().detail}
            </span>
          )}
        </Show>
      </div>
      <Show when={selectedNode()}>
        {(renderNode) => (
          <div
            data-no-pan="true"
            style={{
              position: 'absolute',
              right: '12px',
              bottom: '12px',
              width: '260px',
              padding: '10px 12px',
              background: 'var(--overlay)',
              border: '1px solid var(--border)',
              'border-radius': '8px',
              'box-shadow': 'var(--shadow-lg)',
              'font-size': '11px',
            }}
          >
            <div style={{ 'font-weight': 650 }}>{renderNode().title}</div>
            <div style={{ color: 'var(--fg-muted)', 'margin-top': '3px' }}>{renderNode().detail}</div>
            <div style={{ color: 'var(--fg-subtle)', 'margin-top': '7px', 'font-family': 'ui-monospace, monospace', 'overflow-wrap': 'anywhere' }}>{renderNode().id}</div>
          </div>
        )}
      </Show>
    </div>
  );

  return (
    <div style={{ flex: '1 1 auto', 'min-height': 0, display: 'flex', 'flex-direction': 'column' }}>
      <RayonSplitPane leftWidth={leftWidth} onLeftWidthChange={retainPaneWidth} left={sourcePane} right={runtimePane} />
    </div>
  );
}

function readPaneWidth(): number {
  const stored = Number(localStorage.getItem('luminous:rayon:left-width'));
  return Number.isFinite(stored) && stored >= 280 ? stored : 410;
}
