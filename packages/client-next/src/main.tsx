import { render } from 'solid-js/web';
import './index.css';
import { App } from './App';

declare const __GITHUB_PAGES__: boolean;

// GitHub Pages has no backend — redirect to the static viewer
if (__GITHUB_PAGES__) {
  window.location.replace(`${import.meta.env.BASE_URL}viewer.html`);
} else {
  const root = document.getElementById('root');
  if (!root) throw new Error('No root element');
  render(() => <App />, root);
}
