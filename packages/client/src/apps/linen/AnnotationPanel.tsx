import { Show, For, createMemo, type JSX } from 'solid-js';
import type { LinenDocument } from '@luminous/core/linen';
import { kindDescriptor, moduleManifest, resumeContract } from '@luminous/core/linen';

export interface AnnotationPanelProps {
  doc: LinenDocument;
  selectedId: string | null;
  onAnnotationCommit: (nodeId: string, annotation: string | undefined) => void;
}

/** The selected element's detail — "click one → what happens here?". Trace
 * Nodes carry only a Glyph on the canvas; this panel is where their meaning
 * shows. */
export function AnnotationPanel(props: AnnotationPanelProps): JSX.Element {
  const selection = createMemo(() => {
    const id = props.selectedId;
    if (id === null) return null;
    const node = props.doc.nodes.find(n => n.id === id);
    if (node) return { kind: 'node' as const, node };
    const module = props.doc.modules.find(m => m.id === id);
    if (module) return { kind: 'module' as const, module };
    const contract = props.doc.contracts.find(c => c.id === id);
    if (contract) return { kind: 'contract' as const, contract };
    return null;
  });

  const moduleName = (id: string) => props.doc.modules.find(m => m.id === id)?.name ?? id;
  const contractName = (id: string) => props.doc.contracts.find(c => c.id === id)?.name ?? id;

  return (
    <Show when={selection()}>
      {(sel) => (
        <div
          class="absolute right-3 top-3 z-10 flex w-72 flex-col gap-2 rounded-lg border border-border-subtle bg-surface p-3 text-sm shadow-md"
          data-testid="linen-annotation-panel"
        >
          <Show when={sel().kind === 'node' ? sel() : null}>
            {(s) => {
              const node = () => (s() as { kind: 'node'; node: LinenDocument['nodes'][number] }).node;
              const descriptor = () => kindDescriptor(node().kind);
              return (
                <>
                  <div class="flex items-baseline justify-between">
                    <span class="font-semibold text-fg">{descriptor().term}</span>
                    <span class="text-xs text-fg-muted">{node().id}</span>
                  </div>
                  <p class="text-xs text-fg-muted">{descriptor().gloss}</p>
                  <Show when={node().kind === 'pass'}>
                    {(() => {
                      const n = node();
                      if (n.kind !== 'pass') return null;
                      const resume = resumeContract(props.doc, n.id);
                      return (
                        <div class="rounded bg-surface-alt p-2 text-xs">
                          <div>Passes to <span class="font-medium">{moduleName(n.to)}</span></div>
                          <div class="text-fg-muted">
                            Resumes with {resume ? <span class="font-medium">{resume.name}</span> : 'no Contract connected'}
                          </div>
                        </div>
                      );
                    })()}
                  </Show>
                  <Show when={node().kind === 'type'}>
                    {(() => {
                      const n = node();
                      if (n.kind !== 'type' || n.contract === undefined) return null;
                      return (
                        <div class="rounded bg-surface-alt p-2 text-xs">
                          Contract <span class="font-medium">{contractName(n.contract)}</span>
                        </div>
                      );
                    })()}
                  </Show>
                  <textarea
                    class="min-h-24 w-full resize-y rounded border border-border-subtle bg-surface-alt p-2 text-xs text-fg"
                    placeholder="What happens here?"
                    value={node().annotation ?? ''}
                    onChange={(e) => {
                      const text = e.currentTarget.value.trim();
                      props.onAnnotationCommit(node().id, text === '' ? undefined : text);
                    }}
                  />
                </>
              );
            }}
          </Show>
          <Show when={sel().kind === 'module' ? sel() : null}>
            {(s) => {
              const module = () => (s() as { kind: 'module'; module: LinenDocument['modules'][number] }).module;
              const manifest = () => moduleManifest(props.doc, module().id);
              return (
                <>
                  <div class="flex items-baseline justify-between">
                    <span class="font-semibold text-fg">{module().name}</span>
                    <span class="text-xs text-fg-muted">Module</span>
                  </div>
                  <div class="text-xs text-fg-muted">Manifest (computed)</div>
                  <Show
                    when={manifest().passes.length > 0 || manifest().contracts.length > 0}
                    fallback={<p class="text-xs text-fg-muted">Nothing leaves this Module.</p>}
                  >
                    <ul class="flex flex-col gap-1 text-xs">
                      <For each={manifest().passes}>
                        {(p) => (
                          <li>
                            Pass to <span class="font-medium">{moduleName(p.to)}</span>
                            {p.resumeContract ? <> — resumes with {contractName(p.resumeContract)}</> : null}
                          </li>
                        )}
                      </For>
                      <For each={manifest().contracts}>
                        {(id) => <li>Shares Contract <span class="font-medium">{contractName(id)}</span></li>}
                      </For>
                    </ul>
                  </Show>
                </>
              );
            }}
          </Show>
          <Show when={sel().kind === 'contract' ? sel() : null}>
            {(s) => {
              const contract = () => (s() as { kind: 'contract'; contract: LinenDocument['contracts'][number] }).contract;
              return (
                <>
                  <div class="flex items-baseline justify-between">
                    <span class="font-semibold text-fg">{contract().name}</span>
                    <span class="text-xs text-fg-muted">Contract</span>
                  </div>
                  <Show when={contract().owner}>
                    <div class="text-xs text-fg-muted">Owned by {moduleName(contract().owner!)}</div>
                  </Show>
                  <Show when={contract().text}>
                    <pre class="overflow-x-auto rounded bg-surface-alt p-2 text-xs">{contract().text}</pre>
                  </Show>
                </>
              );
            }}
          </Show>
        </div>
      )}
    </Show>
  );
}
