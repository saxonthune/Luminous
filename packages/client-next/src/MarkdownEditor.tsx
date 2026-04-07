import { onMount, onCleanup, createEffect } from 'solid-js';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import { livePreviewExtension } from './livePreview';
import { markdownTheme } from './markdownTheme';

export interface MarkdownEditorHandle {
  getSelection(): { text: string; from: number; to: number } | null;
  replaceRange(from: number, to: number, text: string): void;
}

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  minHeight: number;
  ref?: (handle: MarkdownEditorHandle) => void;
}

export function MarkdownEditor(props: MarkdownEditorProps) {
  let containerEl: HTMLDivElement | undefined;
  let view: EditorView | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  onMount(() => {
    if (!containerEl) return;

    const state = EditorState.create({
      doc: props.value,
      extensions: [
        markdown(),
        livePreviewExtension(),
        markdownTheme,
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          const newValue = update.state.doc.toString();
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            props.onChange(newValue);
          }, 500);
        }),
        EditorView.domEventHandlers({
          blur: () => {
            if (debounceTimer) {
              clearTimeout(debounceTimer);
              debounceTimer = null;
            }
            if (view) {
              props.onChange(view.state.doc.toString());
            }
          },
        }),
      ],
    });

    view = new EditorView({ state, parent: containerEl });

    props.ref?.({
      getSelection() {
        if (!view) return null;
        const sel = view.state.selection.main;
        if (sel.from === sel.to) return null;
        return { text: view.state.sliceDoc(sel.from, sel.to), from: sel.from, to: sel.to };
      },
      replaceRange(from: number, to: number, text: string) {
        if (!view) return;
        view.dispatch({ changes: { from, to, insert: text } });
      },
    });
  });

  onCleanup(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    view?.destroy();
    view = null;
  });

  // Sync external value changes
  createEffect(() => {
    const v = props.value;
    if (!view) return;
    const current = view.state.doc.toString();
    if (v !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: v } });
    }
  });

  return (
    <div
      ref={containerEl}
      data-no-pan="true"
      style={{ "min-height": `${props.minHeight}px` }}
      onKeyDown={(e) => e.stopPropagation()}
    />
  );
}
