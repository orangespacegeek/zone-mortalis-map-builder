import './style.css';
import { init, subscribe } from './state/store';
import { mountApp, renderApp } from './ui/shell';

const root = document.querySelector('#app');
if (!root) throw new Error('Missing #app');

mountApp(root as HTMLElement);
subscribe(() => renderApp());
void init();
