import { createSignal, createEffect } from 'solid-js';

type Theme = 'light' | 'dusk';

const stored = localStorage.getItem('luminous-theme') as Theme | null;
const initial: Theme = stored === 'dusk' ? 'dusk' : 'light';

export const [theme, setTheme] = createSignal<Theme>(initial);

createEffect(() => {
  const t = theme();
  document.documentElement.dataset.theme = t;
  localStorage.setItem('luminous-theme', t);
});

export function toggleTheme() {
  setTheme((t) => (t === 'light' ? 'dusk' : 'light'));
}
