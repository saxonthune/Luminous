import { render } from 'solid-js/web';
import './index.css';
import '@luminous/cactus/cactus.css';
import { ensurePacksRegistered } from './registerPacks';
import { AppShell } from './AppShell';

ensurePacksRegistered();

const root = document.getElementById('root');
if (!root) throw new Error('No root element');
render(() => <AppShell />, root);
