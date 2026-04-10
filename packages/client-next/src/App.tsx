import { createSignal, Show } from 'solid-js';
import { DocumentPicker } from './DocumentPicker';
import { CanvasView } from './CanvasView';
import { serverPersistence } from './api';

type View =
  | { state: 'picker' }
  | { state: 'canvas'; path: string }

export function App() {
  const [view, setView] = createSignal<View>({ state: 'picker' });

  return (
    <Show
      when={view().state === 'canvas' ? view() as { state: 'canvas'; path: string } : undefined}
      fallback={
        <DocumentPicker
          onOpen={(path) => setView({ state: 'canvas', path })}
        />
      }
    >
      {(canvasView) => (
        <CanvasView
          documentPath={canvasView().path}
          persistence={serverPersistence(canvasView().path, () => {})}
          onBack={() => setView({ state: 'picker' })}
        />
      )}
    </Show>
  );
}
