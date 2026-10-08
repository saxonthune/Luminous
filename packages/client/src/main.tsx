import { render } from 'solid-js/web';
import './index.css';
import '@luminous/cactus/cactus.css';
import { AppShell } from './AppShell';

const root = document.getElementById('root');
if (!root) throw new Error('No root element');
document.getElementById('boot-status')?.remove();
performance.mark('luminous:main-evaluated');
performance.measure('luminous:html-to-main', 'luminous:html-entry', 'luminous:main-evaluated');
if (import.meta.env.DEV) {
  const boot = performance.getEntriesByName('luminous:html-to-main').at(-1);
  console.info('[Luminous startup]', { phase: 'client bundle evaluated', durationMs: Math.round(boot?.duration ?? 0) });
}
render(() => <AppShell />, root);
