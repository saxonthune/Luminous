import { createEffect, on, createSignal, onMount, onCleanup, createMemo, type Accessor } from 'solid-js';
import { EditorView } from '@codemirror/view';
import { Compartment, StateEffect, EditorState, type Extension } from '@codemirror/state';

function createCompartmentExtension(
  extension: Accessor<Extension> | Extension,
  view: Accessor<EditorView | undefined>,
) {
  const compartment = new Compartment();
  const $extension = typeof extension === 'function' ? extension : () => extension;

  createEffect(
    on([view, $extension], ([view, extension]) => {
      if (view && extension) {
        if (compartment.get(view.state)) {
          view.dispatch({ effects: compartment.reconfigure(extension) });
        } else {
          view.dispatch({ effects: StateEffect.appendConfig.of(compartment.of(extension)) });
        }
      }
    }, { defer: true }),
  );
}

interface CreateCodeMirrorProps {
  onValueChange?: (value: string) => void;
}

export function createCodeMirror(props?: CreateCodeMirrorProps) {
  const [ref, setRef] = createSignal<HTMLElement>();
  const [editorView, setEditorView] = createSignal<EditorView>();

  function createExtension(extension: Accessor<Extension> | Extension) {
    createCompartmentExtension(extension, editorView);
  }

  createEffect(
    on(ref, (ref) => {
      if (!ref) return;
      const state = EditorState.create({ doc: '' });
      const currentView = new EditorView({
        state,
        parent: ref,
        dispatch: (transaction) => {
          currentView.update([transaction]);
          if (transaction.docChanged) {
            props?.onValueChange?.(transaction.state.doc.toString());
          }
        },
      });
      onMount(() => setEditorView(currentView));
      onCleanup(() => {
        editorView()?.destroy();
        setEditorView(undefined);
      });
    }),
  );

  return { editorView, ref: setRef, createExtension };
}

export function createEditorControlledValue(
  view: Accessor<EditorView | undefined>,
  code: Accessor<string>,
) {
  const memoizedCode = createMemo(code);
  createEffect(
    on(view, (view) => {
      if (!view) return;
      createEffect(
        on(memoizedCode, (code) => {
          const localValue = view.state.doc.toString();
          if (localValue === code) return;
          if (view.hasFocus) return; // Don't overwrite while user is editing
          view.dispatch({
            changes: { from: 0, to: localValue.length, insert: code ?? '' },
          });
        }),
      );
    }),
  );
}
