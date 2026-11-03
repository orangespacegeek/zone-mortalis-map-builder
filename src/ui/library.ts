import { TILE_TAGS, type TileDefinition, type TileKind, type TileTag } from '../types';
import { escapeHtml, tagLabel } from '../core/text';
import { usageFor } from '../core/inventory';
import { sortTags, validateTileDraft } from '../core/validation';
import { shrinkImage } from '../persistence/images';
import { renderTileThumbnail } from '../render/art';
import {
  addStarterTiles,
  deleteTile,
  getState,
  saveTile,
  showStatus,
  type TileInput,
} from '../state/store';
import { requestRefresh } from './refresh';

let editing = false;
let previewUrl: string | null = null;

export function libraryIsEditing(): boolean {
  return editing;
}

export function cancelLibraryEdit(): void {
  editing = false;
  revokePreview();
}

function revokePreview(): void {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
}

function byName(a: TileDefinition, b: TileDefinition): number {
  return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id);
}

function parseWhole(value: string): number {
  if (!/^-?\d+$/.test(value.trim())) return Number.NaN;
  return Number(value.trim());
}

export function refreshLibrary(main: HTMLElement): void {
  if (editing) return;
  if (!main.querySelector('.library')) {
    main.innerHTML = `<section class="library">
      <div class="toolbar">
        <button type="button" class="btn primary" data-action="new-tile">Add tile</button>
        <button type="button" class="btn" data-action="starter">Add starter tiles</button>
      </div>
      <div class="list-scroll" data-list></div>
    </section>`;
    const section = main.querySelector('.library');
    section?.addEventListener('click', (event) => {
      const button = (event.target as Element).closest('button');
      if (!button || !section.contains(button)) return;
      const action = button.dataset.action;
      if (action === 'new-tile') openTileForm(main, null);
      if (action === 'starter') {
        void addStarterTiles().catch((error: unknown) => {
          showStatus(error instanceof Error ? error.message : 'Could not add starter tiles.');
        });
      }
      if (action === 'edit') openTileForm(main, button.dataset.id ?? null);
      if (action === 'delete-tile') {
        const id = button.dataset.id;
        const tile = getState().tiles.find((item) => item.id === id);
        if (!id || !tile) return;
        if (!window.confirm(`Delete ${tile.name}? It will come off every saved layout.`)) return;
        void deleteTile(id).catch((error: unknown) => {
          showStatus(error instanceof Error ? error.message : 'Could not delete that tile.');
        });
      }
    });
  }
  paintLibrary(main);
}

function paintLibrary(main: HTMLElement): void {
  const list = main.querySelector('[data-list]');
  if (!list) return;
  const { tiles, photoUrls, working } = getState();
  if (tiles.length === 0) {
    list.innerHTML = `<div class="empty">
      <h2>No tiles yet</h2>
      <p>Add the corridors, rooms, and junctions your group owns. Stock tiles can be a plain outline. A unique tile needs an overhead photo before it can be saved.</p>
    </div>`;
    return;
  }
  const cards = tiles.slice().sort(byName).map((tile) => {
    const usage = usageFor(tile, working.placements);
    const usageClass = usage.overAllocated ? 'over' : usage.remaining <= 0 ? 'full' : 'ok';
    const photo = tile.photoId ? (photoUrls[tile.photoId] ?? null) : null;
    const tags = tile.tags.map((tag) => `<span class="tag">${tagLabel(tag)}</span>`).join('');
    return `<article class="tile-card">
      <div class="thumb">${renderTileThumbnail(tile, photo)}</div>
      <div class="tile-copy">
        <h2>${escapeHtml(tile.name)}</h2>
        <p class="meta">${tile.kind === 'unique' ? 'Unique' : 'Stock'} · ${tile.width}×${tile.height} in · own ${tile.quantity}</p>
        <p class="tags">${tags || '<span class="tag muted-tag">Untagged</span>'}</p>
        ${tile.kind === 'unique' && tile.maker ? `<p class="meta">Maker: ${escapeHtml(tile.maker)}</p>` : ''}
        <p class="usage ${usageClass}">On this board: ${usage.used}/${usage.owned}</p>
      </div>
      <div class="card-actions">
        <button type="button" class="btn" data-action="edit" data-id="${escapeHtml(tile.id)}">Edit</button>
        <button type="button" class="btn danger" data-action="delete-tile" data-id="${escapeHtml(tile.id)}">Delete</button>
      </div>
    </article>`;
  });
  list.innerHTML = cards.join('');
}

function openTileForm(main: HTMLElement, tileId: string | null): void {
  const tile = tileId ? (getState().tiles.find((item) => item.id === tileId) ?? null) : null;
  editing = true;
  revokePreview();
  const kind: TileKind = tile?.kind ?? 'stock';
  const selected = new Set(tile?.tags ?? []);
  const tagButtons = TILE_TAGS.map(
    (tag) =>
      `<button type="button" class="chip" data-tag="${tag}" aria-pressed="${selected.has(tag) ? 'true' : 'false'}">${tagLabel(tag)}</button>`,
  ).join('');
  main.innerHTML = `<form class="tile-form" data-kind="${kind}">
    <div class="form-head">
      <h2>${tile ? 'Edit tile' : 'New tile'}</h2>
      <button type="button" class="btn" data-action="cancel">Cancel</button>
    </div>
    <div class="form-errors" data-errors hidden></div>
    <label>Name <input name="name" required maxlength="80" autocomplete="off" value="${escapeHtml(tile?.name ?? '')}" /></label>
    <fieldset>
      <legend>Type</legend>
      <label class="choice"><input type="radio" name="kind" value="stock" ${kind === 'stock' ? 'checked' : ''}/> Stock <span>Photo optional. Without one, the board draws an outline.</span></label>
      <label class="choice"><input type="radio" name="kind" value="unique" ${kind === 'unique' ? 'checked' : ''}/> Unique <span>Overhead photo and a maker or source are required.</span></label>
    </fieldset>
    <div class="pair">
      <label>Width (squares) <input name="width" inputmode="numeric" value="${tile?.width ?? 2}" /></label>
      <label>Height (squares) <input name="height" inputmode="numeric" value="${tile?.height ?? 2}" /></label>
    </div>
    <p class="field-note">1 square = 1 inch. Width and height are the tile before it is rotated on the board.</p>
    <label>Quantity owned <input name="quantity" inputmode="numeric" value="${tile?.quantity ?? 1}" /></label>
    <fieldset>
      <legend>Tags</legend>
      <div class="chips">${tagButtons}</div>
    </fieldset>
    <label>Maker / source <span class="req">required for unique</span>
      <input name="maker" maxlength="80" autocomplete="off" value="${escapeHtml(tile?.maker ?? '')}" />
    </label>
    <label>Overhead photo <span class="req">required for unique</span>
      <input name="photo" type="file" accept="image/*" />
    </label>
    <p class="field-note unique-note">A unique tile cannot be saved until an overhead photo is attached. JPEG or PNG, up to 8 MB.</p>
    <div class="photo-preview" data-preview></div>
    <div class="form-actions">
      <button type="submit" class="btn primary">Save tile</button>
      ${tile ? `<button type="button" class="btn danger" data-action="delete">Delete tile</button>` : ''}
    </div>
  </form>`;
  const form = main.querySelector('form');
  if (!form) return;
  const nameInput = form.querySelector('input[name="name"]') as HTMLInputElement;
  nameInput.focus();
  let removed = false;
  const showPreview = () => {
    const slot = form.querySelector('[data-preview]');
    if (!slot) return;
    const existing = tile?.photoId ? (getState().photoUrls[tile.photoId] ?? null) : null;
    const src = previewUrl || (!removed ? existing : null);
    slot.innerHTML = src ? `<img src="${escapeHtml(src)}" alt="Overhead preview" />` : '';
    const remove = src
      ? `<button type="button" class="btn" data-action="remove-photo">Remove photo</button>`
      : '';
    if (remove) slot.insertAdjacentHTML('beforeend', remove);
  };
  showPreview();
  form.addEventListener('click', (event) => {
    const button = (event.target as Element).closest('button');
    if (!button) return;
    if (button.dataset.tag) {
      const pressed = button.getAttribute('aria-pressed') === 'true';
      button.setAttribute('aria-pressed', pressed ? 'false' : 'true');
    }
    if (button.dataset.action === 'cancel') {
      cancelLibraryEdit();
      requestRefresh();
    }
    if (button.dataset.action === 'remove-photo') {
      removed = true;
      revokePreview();
      const file = form.querySelector('input[name="photo"]') as HTMLInputElement;
      file.value = '';
      showPreview();
    }
    if (button.dataset.action === 'delete' && tile) {
      if (!window.confirm(`Delete ${tile.name}? It will come off every saved layout.`)) return;
      cancelLibraryEdit();
      void deleteTile(tile.id)
        .catch((error: unknown) => {
          showStatus(error instanceof Error ? error.message : 'Could not delete that tile.');
        })
        .finally(() => requestRefresh());
    }
  });
  form.addEventListener('change', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.name === 'kind') {
      form.dataset.kind = target.value;
    }
    if (target instanceof HTMLInputElement && target.name === 'photo') {
      const file = target.files?.[0] ?? null;
      revokePreview();
      if (file) {
        removed = false;
        previewUrl = URL.createObjectURL(file);
      }
      showPreview();
    }
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitTile(form, tile, removed);
  });
}

async function submitTile(form: HTMLFormElement, existing: TileDefinition | null, removed: boolean): Promise<void> {
  const data = new FormData(form);
  const kind: TileKind = data.get('kind') === 'unique' ? 'unique' : 'stock';
  const tags = [...form.querySelectorAll<HTMLButtonElement>('[data-tag][aria-pressed="true"]')].map(
    (button) => button.dataset.tag as TileTag,
  );
  const file = (form.querySelector('input[name="photo"]') as HTMLInputElement).files?.[0] ?? null;
  const existingPhotoId = removed ? null : (existing?.photoId ?? null);
  const hasPhoto = Boolean(file || existingPhotoId);
  const draft = {
    name: String(data.get('name') ?? ''),
    kind,
    width: parseWhole(String(data.get('width') ?? '')),
    height: parseWhole(String(data.get('height') ?? '')),
    quantity: parseWhole(String(data.get('quantity') ?? '')),
    tags,
    maker: String(data.get('maker') ?? ''),
    hasPhoto,
  };
  const validation = validateTileDraft(draft);
  if (!validation.ok) {
    showErrors(form, validation.errors);
    return;
  }
  let photoBlob: Blob | null = null;
  if (file) {
    try {
      photoBlob = await shrinkImage(file);
    } catch (error) {
      showErrors(form, [error instanceof Error ? error.message : 'Could not read that image.']);
      return;
    }
  }
  const input: TileInput = {
    id: existing?.id ?? null,
    name: draft.name,
    kind,
    width: draft.width,
    height: draft.height,
    quantity: draft.quantity,
    tags: sortTags(tags),
    maker: draft.maker,
    photoBlob,
    removePhoto: removed && !file,
    existingPhotoId,
  };
  try {
    const result = await saveTile(input);
    if (!result.ok) {
      showErrors(form, result.errors);
      return;
    }
  } catch (error) {
    showErrors(form, [error instanceof Error ? error.message : 'Could not save that tile.']);
    return;
  }
  cancelLibraryEdit();
  requestRefresh();
}

function showErrors(form: HTMLFormElement, errors: string[]): void {
  const slot = form.querySelector('[data-errors]');
  if (!slot) return;
  slot.innerHTML = `<ul>${errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul>`;
  slot.removeAttribute('hidden');
  slot.scrollIntoView({ block: 'nearest' });
}
