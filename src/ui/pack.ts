import { boardWarnings, formatBoardSize, warnedIds } from '../core/geometry';
import { buildPullList, pullListTotal } from '../core/pull-list';
import { escapeHtml, fileSlug, tagLabel } from '../core/text';
import { downloadBlob } from '../persistence/download';
import { svgMarkupToPng } from '../render/png';
import { placementRects, renderBoardSvg } from '../render/svg';
import {
  deleteNamedLayout,
  exportExchangeFile,
  getState,
  importExchangeText,
  loadNamedLayout,
  renameNamedLayout,
  saveAsNamedLayout,
  saveNamedLayout,
  showStatus,
} from '../state/store';
import { updatePrintSheet } from './print-host';

let renamingId: string | null = null;
let busy = false;

export function refreshPack(main: HTMLElement): void {
  if (!main.querySelector('.pack')) {
    main.innerHTML = `<section class="pack">
      <div class="pack-scroll">
        <section class="panel">
          <h2>This board</h2>
          <p class="field-note" data-board-summary></p>
          <div class="form-actions">
            <button type="button" class="btn primary" data-action="save">Save layout</button>
            <button type="button" class="btn" data-action="save-copy">Save a copy</button>
          </div>
        </section>
        <section class="panel">
          <h2>Saved layouts</h2>
          <div data-layouts></div>
        </section>
        <section class="panel">
          <h2>Pull list</h2>
          <div data-pull></div>
        </section>
        <section class="panel">
          <h2>Files</h2>
          <p class="field-note">PNG is a picture of the board. Print opens the browser’s print dialog, where you can choose Save as PDF. JSON carries the library, photos, and saved layouts.</p>
          <div class="form-actions">
            <button type="button" class="btn" data-action="png">Export PNG</button>
            <button type="button" class="btn" data-action="print">Print / PDF</button>
            <button type="button" class="btn" data-action="export-json">Export JSON</button>
            <button type="button" class="btn" data-action="import-json">Import JSON</button>
          </div>
          <input data-import type="file" accept="application/json,.json" hidden />
        </section>
      </div>
    </section>`;
    const section = main.querySelector('.pack');
    if (!section) return;
    section.addEventListener('click', (event) => {
      const button = (event.target as Element).closest('button');
      if (!button || !section.contains(button)) return;
      const action = button.dataset.action;
      const id = button.dataset.id ?? '';
      if (action === 'save') void run(() => saveNamedLayout());
      if (action === 'save-copy') void run(() => saveAsNamedLayout());
      if (action === 'load') {
        if (getState().working.dirty && !window.confirm('Load that layout and replace the board you’re editing?')) return;
        void run(() => loadNamedLayout(id));
      }
      if (action === 'rename') {
        renamingId = id;
        paintPack(section);
        const input = section.querySelector('[data-rename] input') as HTMLInputElement | null;
        input?.focus();
        input?.select();
      }
      if (action === 'cancel-rename') {
        renamingId = null;
        paintPack(section);
      }
      if (action === 'delete-layout') {
        const layout = getState().layouts.find((item) => item.id === id);
        if (!layout) return;
        if (!window.confirm(`Delete the saved layout “${layout.name}”? The board stays until you load something else.`)) return;
        void run(() => deleteNamedLayout(id));
      }
      if (action === 'png') void exportPng();
      if (action === 'print') {
        updatePrintSheet();
        window.print();
      }
      if (action === 'export-json') void exportJson();
      if (action === 'import-json') section.querySelector<HTMLInputElement>('[data-import]')?.click();
    });
    section.addEventListener('submit', (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.matches('[data-rename]')) return;
      event.preventDefault();
      const id = form.dataset.rename ?? '';
      const name = String(new FormData(form).get('name') ?? '');
      renamingId = null;
      void run(() => renameNamedLayout(id, name));
    });
    section.querySelector('[data-import]')?.addEventListener('change', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return;
      const file = input.files[0];
      input.value = '';
      void importFile(file);
    });
  }
  const section = main.querySelector('.pack');
  if (section) paintPack(section);
}

async function run(action: () => Promise<void>): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    await action();
  } catch (error) {
    showStatus(error instanceof Error ? error.message : 'Something went wrong.');
  } finally {
    busy = false;
  }
}

function paintPack(section: Element): void {
  const state = getState();
  const summary = section.querySelector('[data-board-summary]');
  if (summary) {
    const count = state.working.placements.length;
    const saved = state.working.sourceId ? 'Saved layouts update when you press Save.' : 'This board is not in the saved list yet.';
    const dirty = state.working.dirty ? ' Unsaved changes.' : '';
    summary.textContent = `${state.working.name.trim() || 'Untitled layout'} · ${formatBoardSize(state.working.board)} · ${count} placed. ${saved}${dirty}`;
  }
  paintLayouts(section, state);
  paintPull(section, state);
}

function paintLayouts(section: Element, state: ReturnType<typeof getState>): void {
  const list = section.querySelector('[data-layouts]');
  if (!list) return;
  const active = document.activeElement;
  if (active instanceof HTMLInputElement && list.contains(active)) return;
  const layouts = state.layouts.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  if (layouts.length === 0) {
    list.innerHTML = `<p class="empty-inline">No named layouts yet. Save the current board to keep it in this list.</p>`;
    return;
  }
  list.innerHTML = layouts
    .map((layout) => {
      const current = layout.id === state.working.sourceId;
      const when = layout.updatedAt
        ? new Date(layout.updatedAt).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })
        : '';
      const controls =
        renamingId === layout.id
          ? `<form data-rename="${escapeHtml(layout.id)}" class="rename-form">
              <input name="name" maxlength="80" value="${escapeHtml(layout.name)}" aria-label="Layout name" />
              <button type="submit" class="btn primary">Save name</button>
              <button type="button" class="btn" data-action="cancel-rename">Cancel</button>
            </form>`
          : `<div class="card-actions">
              <button type="button" class="btn" data-action="load" data-id="${escapeHtml(layout.id)}">Load</button>
              <button type="button" class="btn" data-action="rename" data-id="${escapeHtml(layout.id)}">Rename</button>
              <button type="button" class="btn danger" data-action="delete-layout" data-id="${escapeHtml(layout.id)}">Delete</button>
            </div>`;
      return `<article class="layout-card ${current ? 'is-current' : ''}">
        <h3>${escapeHtml(layout.name)} ${current ? '<span class="tag">On board</span>' : ''}</h3>
        <p class="meta">${formatBoardSize(layout.board)} · ${layout.placements.length} tiles${when ? ` · ${escapeHtml(when)}` : ''}</p>
        ${controls}
      </article>`;
    })
    .join('');
}

function paintPull(section: Element, state: ReturnType<typeof getState>): void {
  const slot = section.querySelector('[data-pull]');
  if (!slot) return;
  const lines = buildPullList(state.tiles, state.working.placements);
  if (lines.length === 0) {
    slot.innerHTML = `<p class="empty-inline">Nothing to pull — the board is empty.</p>`;
    return;
  }
  const rows = lines
    .map((line) => {
      const short = line.used > line.owned ? ' class="short"' : '';
      const tags = line.tags.map((tag) => tagLabel(tag)).join(', ');
      return `<tr${short}><td>${escapeHtml(line.name)}<span class="meta"> ${escapeHtml(tags)}</span></td><td>${line.width}×${line.height}</td><td>${line.used}</td><td>${line.owned}</td></tr>`;
    })
    .join('');
  slot.innerHTML = `<p class="meta">Take ${pullListTotal(lines)} tiles off the shelf.</p>
    <table class="pull">
      <thead><tr><th>Tile</th><th>Size</th><th>Take</th><th>Own</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

async function exportPng(): Promise<void> {
  if (busy) return;
  busy = true;
  showStatus('Drawing the PNG…');
  try {
    const state = getState();
    const boxes = placementRects(state.tiles, state.working.placements);
    const warnings = boardWarnings(boxes, state.working.board);
    const longSide = Math.max(state.working.board.width, state.working.board.height);
    const ppi = Math.max(8, Math.min(18, Math.floor(2400 / longSide)));
    const markup = renderBoardSvg({
      name: state.working.name,
      board: state.working.board,
      tiles: state.tiles,
      photoUrls: state.photoUrls,
      placements: state.working.placements,
      mission: state.working.mission,
      options: {
        showMission: state.working.mission.visible,
        minorGrid: true,
        theme: 'screen',
        pixelsPerInch: ppi,
        selectedId: null,
        warnedIds: warnedIds(warnings),
      },
    });
    const blob = await svgMarkupToPng(markup, state.working.board.width * ppi, state.working.board.height * ppi);
    downloadBlob(blob, `zone-mortalis-${fileSlug(state.working.name)}.png`);
    showStatus(`PNG downloaded (${Math.max(1, Math.round(blob.size / 1024))} KB).`);
  } catch (error) {
    showStatus(error instanceof Error ? error.message : 'Could not export the PNG.');
  } finally {
    busy = false;
  }
}

async function exportJson(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const file = await exportExchangeFile();
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `zone-mortalis-${fileSlug(getState().working.name)}.json`);
    showStatus('JSON downloaded. Photos are inside the file.');
  } catch (error) {
    showStatus(error instanceof Error ? error.message : 'Could not export JSON.');
  } finally {
    busy = false;
  }
}

async function importFile(file: File): Promise<void> {
  if (busy) return;
  busy = true;
  showStatus('Importing…');
  try {
    const text = await file.text();
    await importExchangeText(text);
  } catch (error) {
    showStatus(error instanceof Error ? error.message : 'Could not import that file.');
  } finally {
    busy = false;
  }
}
