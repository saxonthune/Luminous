import { createSignal, createEffect, onCleanup, onMount } from 'solid-js';
import { AppHeader } from './AppHeader';
import { APPS } from './apps/registry';
import { theme, cycleTheme, persistTheme } from './theme';
import { readParam, writeParam } from './urlState';

export function AppShell() {
  const [activeAppId, setActiveAppId] = createSignal(readParam('app') ?? 'canvas');

  function onSelectApp(id: string) {
    setActiveAppId(id);
    writeParam('app', id);
  }

  const activeApp = () => APPS.find((a) => a.id === activeAppId()) ?? APPS[0];

  createEffect(() => persistTheme(theme()));

  document.title = 'Luminous';

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        cycleTheme();
      }
    };
    window.addEventListener('keydown', onKey);
    onCleanup(() => window.removeEventListener('keydown', onKey));
  });

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', width: '100vw', height: '100vh' }}>
      <AppHeader
        apps={APPS}
        activeAppId={activeAppId()}
        onSelectApp={onSelectApp}
        onCycleTheme={cycleTheme}
      />
      {(() => {
        const App = activeApp().component;
        return <App />;
      })()}
    </div>
  );
}
