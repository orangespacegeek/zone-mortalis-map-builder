import { escapeHtml } from '../core/text';
import { getState, setLayoutName } from '../state/store';
import { boardIsDragging, handleBoardKey, nudgeZoom, refreshBoard } from './board';
import { cancelLibraryEdit, libraryIsEditing, refreshLibrary } from './library';
import { refreshPack } from './pack';
import { updatePrintSheet } from './print-host';
import { requestRefresh, setRefresher } from './refresh';
import { session, type Tab } from './session';

export function mountApp(root: HTMLElement): void {
  root.classList.add('app');
  root.innerHTML = `<header class="app-header">
      <div class="brand">
        <p class="eyebrow">Horus Heresy</p>
        <h1>Zone Mortalis</h1>
      </div>
      <label class="layout-name">
        <span>Layout</span>
        <input id="layout-name" maxlength="80" autocomplete="off" aria-label="Layout name" />
        <span class="dirty" data-dirty hidden>Unsaved</span>
      </label>
    </header>
    <p id="status" class="status" role="status"></p>
    <main id="main" class="main"><p class="loading">Loading the library…</p></main>
    <nav class="tabbar" aria-label="Sections">
      <button type="button" data-tab="library">Library</button>
      <button type="button" data-tab="board" aria-current="page">Board</button>
      <button type="button" data-tab="pack">Pack</button>
    </nav>`;
  setRefresher(() => renderApp());
  const nameInput = root.querySelector('#layout-name');
  if (nameInput instanceof HTMLInputElement) {
    nameInput.addEventListener('input', () => setLayoutName(nameInput.value));
  }
  root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = button.dataset.tab;
      if (next !== 'library' && next !== 'board' && next !== 'pack') return;
      if (libraryIsEditing()) {
        if (!window.confirm('Discard unsaved changes to this tile?')) return;
        cancelLibraryEdit();
      }
      session.tab = next;
      requestRefresh();
    });
  });
  window.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      return;
    }
    if (libraryIsEditing() || event.metaKey || event.ctrlKey || event.altKey) return;
    if (session.tab === 'board' && (event.key === '+' || event.key === '=')) {
      event.preventDefault();
      nudgeZoom(1.25);
      return;
    }
    if (session.tab === 'board' && (event.key === '-' || event.key === '_')) {
      event.preventDefault();
      nudgeZoom(0.8);
      return;
    }
    if (session.tab === 'board') handleBoardKey(event);
  });
}

export function renderApp(): void {
  renderChrome();
  if (boardIsDragging()) return;
  const state = getState();
  if (!state.loaded) return;
  updatePrintSheet();
  const main = document.querySelector('#main');
  if (!(main instanceof HTMLElement)) return;
  if (libraryIsEditing()) return;
  if (state.loadError) {
    main.innerHTML = `<section class="empty"><h2>Storage unavailable</h2><p>${escapeHtml(state.loadError)}</p><p>The builder keeps the library in this browser. Private mode or blocked storage will stop it from saving.</p></section>`;
    return;
  }
  showTab(main, session.tab);
}

function showTab(main: HTMLElement, tab: Tab): void {
  if (tab === 'library') refreshLibrary(main);
  else if (tab === 'board') refreshBoard(main);
  else refreshPack(main);
}

function renderChrome(): void {
  const state = getState();
  const input = document.querySelector('#layout-name');
  if (input instanceof HTMLInputElement && document.activeElement !== input) input.value = state.working.name;
  const dirty = document.querySelector('[data-dirty]');
  if (dirty instanceof HTMLElement) dirty.hidden = !state.working.dirty;
  const status = document.querySelector('#status');
  if (status) {
    status.textContent = state.status ?? '';
    status.classList.toggle('is-visible', Boolean(state.status));
  }
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => {
    const on = button.dataset.tab === session.tab;
    if (on) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (state.loaded) {
    document.title = `${state.working.name.trim() || 'Untitled layout'} · Zone Mortalis`;
  }
}
