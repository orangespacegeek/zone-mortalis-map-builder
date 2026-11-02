import { buildExchange, coerceLayout, coerceWorking, defaultWorking, parseExchange, type ExchangeFile, type ExchangeTile } from '../core/exchange';
import { clampCell, clampRect, nextRotation, rectFromDrag, snapTopLeft, snapToGrid } from '../core/geometry';
import { createId } from '../core/ids';
import { canPlace } from '../core/inventory';
import { starterTiles } from '../core/starter';
import { sortTags, validateTileDraft } from '../core/validation';
import {
  dbDeleteLayout,
  dbDeletePhoto,
  dbDeleteTile,
  dbPutLayout,
  dbPutPhoto,
  dbPutTile,
  dbPutWorking,
  loadDatabase,
} from '../persistence/db';
import { blobToDataUrl, dataUrlToBlob } from '../persistence/images';
import { TILE_TAGS, type BoardSize, type LayoutData, type PlacedTile, type Rect, type Side, type TileDefinition, type TileKind, type TileTag, type WorkingLayout } from '../types';

export interface AppState {
  loaded: boolean;
  loadError: string | null;
  tiles: TileDefinition[];
  photoUrls: Record<string, string>;
  layouts: LayoutData[];
  working: WorkingLayout;
  status: string | null;
}

export interface TileInput {
  id: string | null;
  name: string;
  kind: TileKind;
  width: number;
  height: number;
  quantity: number;
  tags: TileTag[];
  maker: string;
  photoBlob: Blob | null;
  removePhoto: boolean;
  existingPhotoId: string | null;
}

type Listener = () => void;

const listeners = new Set<Listener>();
const blobs = new Map<string, Blob>();
let photoUrls: Record<string, string> = {};
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let statusTimer: ReturnType<typeof setTimeout> | null = null;

let state: AppState = {
  loaded: false,
  loadError: null,
  tiles: [],
  photoUrls: {},
  layouts: [],
  working: defaultWorking(),
  status: null,
};

export function getState(): AppState {
  return state;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  for (const listener of listeners) listener();
}

function setStatus(message: string | null, sticky = false): void {
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = null;
  state = { ...state, status: message };
  emit();
  if (message && !sticky) {
    statusTimer = setTimeout(() => {
      if (state.status === message) {
        state = { ...state, status: null };
        emit();
      }
    }, 4500);
  }
}

export function showStatus(message: string): void {
  setStatus(message);
}

function storageMessage(error: unknown): string {
  if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
    return 'This browser is out of storage space for photos.';
  }
  return error instanceof Error ? error.message : 'Could not write to browser storage.';
}

function rememberPhoto(id: string, blob: Blob): void {
  const previous = photoUrls[id];
  if (previous) URL.revokeObjectURL(previous);
  blobs.set(id, blob);
  photoUrls = { ...photoUrls, [id]: URL.createObjectURL(blob) };
}

function forgetPhoto(id: string): void {
  const previous = photoUrls[id];
  if (previous) URL.revokeObjectURL(previous);
  blobs.delete(id);
  const next = { ...photoUrls };
  delete next[id];
  photoUrls = next;
}

function publishPhotos(): Record<string, string> {
  return { ...photoUrls };
}

function edit(mutate: (draft: WorkingLayout) => void): void {
  const draft = structuredClone(state.working);
  mutate(draft);
  draft.dirty = true;
  state = { ...state, working: draft };
  scheduleWorkingPersist();
  emit();
}

function scheduleWorkingPersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const snapshot = state.working;
    void dbPutWorking(snapshot).catch((error) => {
      setStatus(storageMessage(error), true);
    });
  }, 200);
}

function upsert<T extends { id: string }>(items: readonly T[], item: T): T[] {
  const index = items.findIndex((entry) => entry.id === item.id);
  if (index === -1) return [...items, item];
  const next = items.slice();
  next[index] = item;
  return next;
}

function mergeById<T extends { id: string }>(current: readonly T[], incoming: readonly T[]): T[] {
  const map = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) map.set(item.id, item);
  return [...map.values()];
}

function asTile(value: unknown): TileDefinition | null {
  if (!value || typeof value !== 'object') return null;
  const tile = value as Partial<TileDefinition>;
  if (typeof tile.id !== 'string' || typeof tile.name !== 'string') return null;
  if (tile.kind !== 'stock' && tile.kind !== 'unique') return null;
  if (typeof tile.width !== 'number' || typeof tile.height !== 'number' || typeof tile.quantity !== 'number') return null;
  if (!Number.isInteger(tile.width) || !Number.isInteger(tile.height) || !Number.isInteger(tile.quantity)) return null;
  if (!Array.isArray(tile.tags)) return null;
  const tags = sortTags(tile.tags.filter((tag): tag is TileTag => TILE_TAGS.includes(tag as TileTag)));
  return {
    id: tile.id,
    name: tile.name,
    kind: tile.kind,
    width: tile.width,
    height: tile.height,
    quantity: tile.quantity,
    tags,
    maker: typeof tile.maker === 'string' ? tile.maker : '',
    photoId: typeof tile.photoId === 'string' ? tile.photoId : null,
    updatedAt: typeof tile.updatedAt === 'number' ? tile.updatedAt : 0,
  };
}

function toDefinition(tile: ExchangeTile): TileDefinition {
  return {
    id: tile.id,
    name: tile.name,
    kind: tile.kind,
    width: tile.width,
    height: tile.height,
    quantity: tile.quantity,
    tags: tile.tags,
    maker: tile.maker,
    photoId: tile.photoId,
    updatedAt: tile.updatedAt,
  };
}

function toLayout(working: WorkingLayout, id: string): LayoutData {
  return {
    id,
    name: working.name.trim() || 'Untitled layout',
    board: structuredClone(working.board),
    placements: structuredClone(working.placements),
    mission: structuredClone(working.mission),
    updatedAt: Date.now(),
  };
}

export async function init(): Promise<void> {
  try {
    const snapshot = await loadDatabase();
    for (const photo of snapshot.photos) {
      if (typeof photo.id === 'string' && photo.blob instanceof Blob) rememberPhoto(photo.id, photo.blob);
    }
    const tiles = snapshot.tiles.map(asTile).filter((tile): tile is TileDefinition => tile !== null);
    const layouts = snapshot.layouts
      .map((entry) => coerceLayout(entry))
      .filter((layout): layout is LayoutData => layout !== null);
    const working = snapshot.working ? coerceWorking(snapshot.working) : defaultWorking();
    state = {
      loaded: true,
      loadError: null,
      tiles,
      photoUrls: publishPhotos(),
      layouts,
      working,
      status: null,
    };
  } catch (error) {
    state = {
      ...state,
      loaded: true,
      loadError: error instanceof Error ? error.message : 'Could not read browser storage.',
    };
  }
  emit();
}

export async function saveTile(input: TileInput): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const existing = input.id ? (state.tiles.find((tile) => tile.id === input.id) ?? null) : null;
  let photoId = input.removePhoto ? null : input.existingPhotoId;
  const newPhotoId = input.photoBlob ? createId() : null;
  if (newPhotoId) photoId = newPhotoId;
  const hasPhoto = Boolean(photoId && (input.photoBlob || blobs.has(photoId)));
  const validation = validateTileDraft({
    name: input.name,
    kind: input.kind,
    width: input.width,
    height: input.height,
    quantity: input.quantity,
    tags: input.tags,
    maker: input.maker,
    hasPhoto,
  });
  if (!validation.ok) return { ok: false, errors: validation.errors };

  const tile: TileDefinition = {
    id: existing?.id ?? input.id ?? createId(),
    name: input.name.trim(),
    kind: input.kind,
    width: input.width,
    height: input.height,
    quantity: input.quantity,
    tags: sortTags(input.tags),
    maker: input.maker.trim(),
    photoId,
    updatedAt: Date.now(),
  };

  try {
    if (input.photoBlob && newPhotoId) {
      await dbPutPhoto(newPhotoId, input.photoBlob);
      rememberPhoto(newPhotoId, input.photoBlob);
    }
    await dbPutTile(tile);
  } catch (error) {
    if (newPhotoId) {
      forgetPhoto(newPhotoId);
      await dbDeletePhoto(newPhotoId).catch(() => undefined);
    }
    throw new Error(storageMessage(error));
  }

  const tiles = upsert(state.tiles, tile);
  const previous = existing?.photoId ?? null;
  if (previous && previous !== tile.photoId && !tiles.some((item) => item.photoId === previous)) {
    forgetPhoto(previous);
    await dbDeletePhoto(previous).catch(() => undefined);
  }
  state = { ...state, tiles, photoUrls: publishPhotos() };
  showStatus('Tile saved.');
  return { ok: true };
}

export async function deleteTile(id: string): Promise<void> {
  const tile = state.tiles.find((item) => item.id === id);
  if (!tile) return;
  const tiles = state.tiles.filter((item) => item.id !== id);
  const layouts = state.layouts.map((layout) => ({
    ...layout,
    placements: layout.placements.filter((placement) => placement.tileId !== id),
  }));
  const working = structuredClone(state.working);
  const removedFromBoard = working.placements.some((placement) => placement.tileId === id);
  working.placements = working.placements.filter((placement) => placement.tileId !== id);
  if (removedFromBoard) working.dirty = true;

  try {
    await dbDeleteTile(id);
    if (tile.photoId && !tiles.some((item) => item.photoId === tile.photoId)) {
      await dbDeletePhoto(tile.photoId);
      forgetPhoto(tile.photoId);
    }
    for (const layout of state.layouts) {
      if (!layout.placements.some((placement) => placement.tileId === id)) continue;
      const next = layouts.find((item) => item.id === layout.id);
      if (next) await dbPutLayout(next);
    }
    await dbPutWorking(working);
  } catch (error) {
    throw new Error(storageMessage(error));
  }

  state = { ...state, tiles, layouts, working, photoUrls: publishPhotos() };
  showStatus(`Deleted ${tile.name}.`);
}

export async function addStarterTiles(): Promise<number> {
  const have = new Set(state.tiles.map((tile) => tile.id));
  const fresh = starterTiles()
    .filter((tile) => !have.has(tile.id))
    .map((tile) => ({ ...tile, updatedAt: Date.now() }));
  if (fresh.length === 0) {
    showStatus('Starter tiles are already in the library.');
    return 0;
  }
  try {
    for (const tile of fresh) await dbPutTile(tile);
  } catch (error) {
    throw new Error(storageMessage(error));
  }
  state = { ...state, tiles: [...state.tiles, ...fresh] };
  showStatus(`Added ${fresh.length} starter tiles.`);
  return fresh.length;
}

export function setBoard(board: BoardSize): void {
  if (board.width === state.working.board.width && board.height === state.working.board.height) return;
  edit((draft) => {
    draft.board = { width: board.width, height: board.height };
  });
}

export function setLayoutName(name: string): void {
  const next = name.slice(0, 80);
  if (next === state.working.name) return;
  edit((draft) => {
    draft.name = next;
  });
}

export function setMissionVisible(visible: boolean): void {
  if (state.working.mission.visible === visible) return;
  edit((draft) => {
    draft.mission.visible = visible;
  });
}

export function placeTile(
  tileId: string,
  x: number,
  y: number,
  id = createId(),
): { ok: true; id: string } | { ok: false; reason: string } {
  const tile = state.tiles.find((item) => item.id === tileId);
  if (!tile) return { ok: false, reason: 'That tile is no longer in the library.' };
  const check = canPlace(tile, state.working.placements);
  if (!check.ok) return { ok: false, reason: check.reason ?? 'No copies left to place.' };
  const snapped = snapTopLeft(x, y);
  edit((draft) => {
    const placed: PlacedTile = { id, tileId, x: snapped.x, y: snapped.y, rotation: 0 };
    draft.placements.push(placed);
  });
  return { ok: true, id };
}

export function movePlacement(id: string, x: number, y: number): void {
  if (!state.working.placements.some((item) => item.id === id)) return;
  const snapped = snapTopLeft(x, y);
  edit((draft) => {
    const placement = draft.placements.find((item) => item.id === id);
    if (!placement) return;
    placement.x = snapped.x;
    placement.y = snapped.y;
  });
}

export function rotatePlacement(id: string): void {
  if (!state.working.placements.some((item) => item.id === id)) return;
  edit((draft) => {
    const placement = draft.placements.find((item) => item.id === id);
    if (placement) placement.rotation = nextRotation(placement.rotation);
  });
}

export function deletePlacement(id: string): void {
  if (!state.working.placements.some((item) => item.id === id)) return;
  edit((draft) => {
    draft.placements = draft.placements.filter((item) => item.id !== id);
  });
}

export function addObjective(x: number, y: number, id = createId()): string {
  edit((draft) => {
    const cell = clampCell(x, y, draft.board);
    draft.mission.objectives.push({
      id,
      x: cell.x,
      y: cell.y,
      label: String(draft.mission.objectives.length + 1),
    });
  });
  return id;
}

export function moveObjective(id: string, x: number, y: number): void {
  if (!state.working.mission.objectives.some((item) => item.id === id)) return;
  edit((draft) => {
    const objective = draft.mission.objectives.find((item) => item.id === id);
    if (!objective) return;
    const cell = clampCell(x, y, draft.board);
    objective.x = cell.x;
    objective.y = cell.y;
  });
}

export function setObjectiveLabel(id: string, label: string): void {
  const objective = state.working.mission.objectives.find((item) => item.id === id);
  if (!objective) return;
  const next = label.slice(0, 24);
  if (next === objective.label) return;
  edit((draft) => {
    const current = draft.mission.objectives.find((item) => item.id === id);
    if (current) current.label = next;
  });
}

export function deleteObjective(id: string): void {
  if (!state.working.mission.objectives.some((item) => item.id === id)) return;
  edit((draft) => {
    draft.mission.objectives = draft.mission.objectives.filter((item) => item.id !== id);
  });
}

export function addZone(side: Side, rect: Rect, id = createId()): string {
  edit((draft) => {
    const snapped = rectFromDrag(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
    const clamped = clampRect(snapped, draft.board);
    draft.mission.zones.push({ id, side, ...clamped });
  });
  return id;
}

export function moveZone(id: string, x: number, y: number): void {
  if (!state.working.mission.zones.some((item) => item.id === id)) return;
  edit((draft) => {
    const zone = draft.mission.zones.find((item) => item.id === id);
    if (!zone) return;
    const clamped = clampRect({ ...zone, x: snapToGrid(x), y: snapToGrid(y) }, draft.board);
    zone.x = clamped.x;
    zone.y = clamped.y;
  });
}

export function deleteZone(id: string): void {
  if (!state.working.mission.zones.some((item) => item.id === id)) return;
  edit((draft) => {
    draft.mission.zones = draft.mission.zones.filter((item) => item.id !== id);
  });
}

export function addDoor(x: number, y: number, id = createId()): string {
  edit((draft) => {
    const cell = clampCell(x, y, draft.board);
    draft.mission.doors.push({ id, x: cell.x, y: cell.y, rotation: 0, span: 1, open: false });
  });
  return id;
}

export function moveDoor(id: string, x: number, y: number): void {
  if (!state.working.mission.doors.some((item) => item.id === id)) return;
  edit((draft) => {
    const door = draft.mission.doors.find((item) => item.id === id);
    if (!door) return;
    const cell = clampCell(x, y, draft.board);
    door.x = cell.x;
    door.y = cell.y;
  });
}

export function rotateDoor(id: string): void {
  if (!state.working.mission.doors.some((item) => item.id === id)) return;
  edit((draft) => {
    const door = draft.mission.doors.find((item) => item.id === id);
    if (door) door.rotation = nextRotation(door.rotation);
  });
}

export function toggleDoor(id: string): void {
  if (!state.working.mission.doors.some((item) => item.id === id)) return;
  edit((draft) => {
    const door = draft.mission.doors.find((item) => item.id === id);
    if (door) door.open = !door.open;
  });
}

export function deleteDoor(id: string): void {
  if (!state.working.mission.doors.some((item) => item.id === id)) return;
  edit((draft) => {
    draft.mission.doors = draft.mission.doors.filter((item) => item.id !== id);
  });
}

export function addBlocker(rect: Rect, id = createId()): string {
  edit((draft) => {
    const snapped = rectFromDrag(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
    const clamped = clampRect(snapped, draft.board);
    draft.mission.blockers.push({ id, ...clamped });
  });
  return id;
}

export function moveBlocker(id: string, x: number, y: number): void {
  if (!state.working.mission.blockers.some((item) => item.id === id)) return;
  edit((draft) => {
    const blocker = draft.mission.blockers.find((item) => item.id === id);
    if (!blocker) return;
    const clamped = clampRect({ ...blocker, x: snapToGrid(x), y: snapToGrid(y) }, draft.board);
    blocker.x = clamped.x;
    blocker.y = clamped.y;
  });
}

export function deleteBlocker(id: string): void {
  if (!state.working.mission.blockers.some((item) => item.id === id)) return;
  edit((draft) => {
    draft.mission.blockers = draft.mission.blockers.filter((item) => item.id !== id);
  });
}

export async function saveNamedLayout(): Promise<void> {
  const working = state.working.name.trim()
    ? state.working
    : { ...state.working, name: 'Untitled layout' };
  const id = working.sourceId ?? createId();
  const layout = toLayout(working, id);
  try {
    await dbPutLayout(layout);
    const nextWorking: WorkingLayout = { ...working, name: layout.name, sourceId: id, dirty: false };
    await dbPutWorking(nextWorking);
    state = { ...state, layouts: upsert(state.layouts, layout), working: nextWorking };
  } catch (error) {
    throw new Error(storageMessage(error));
  }
  showStatus('Layout saved on this device.');
}

export async function saveAsNamedLayout(): Promise<void> {
  const base = state.working.name.trim() || 'Untitled layout';
  const taken = new Set(state.layouts.map((layout) => layout.name));
  let name = `${base} copy`;
  let suffix = 2;
  while (taken.has(name)) {
    name = `${base} copy ${suffix}`;
    suffix += 1;
  }
  const layout = toLayout({ ...state.working, name }, createId());
  const working: WorkingLayout = {
    ...state.working,
    name,
    sourceId: layout.id,
    dirty: false,
  };
  try {
    await dbPutLayout(layout);
    await dbPutWorking(working);
  } catch (error) {
    throw new Error(storageMessage(error));
  }
  state = { ...state, layouts: upsert(state.layouts, layout), working };
  showStatus(`Saved “${name}”.`);
}

export async function loadNamedLayout(id: string): Promise<void> {
  const layout = state.layouts.find((item) => item.id === id);
  if (!layout) return;
  const working: WorkingLayout = {
    sourceId: layout.id,
    name: layout.name,
    board: structuredClone(layout.board),
    placements: structuredClone(layout.placements),
    mission: structuredClone(layout.mission),
    dirty: false,
  };
  try {
    await dbPutWorking(working);
  } catch (error) {
    throw new Error(storageMessage(error));
  }
  state = { ...state, working };
  showStatus(`Loaded ${layout.name}.`);
}

export async function renameNamedLayout(id: string, name: string): Promise<void> {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) {
    showStatus('The layout needs a name.');
    return;
  }
  const existing = state.layouts.find((layout) => layout.id === id);
  if (!existing) return;
  const layout: LayoutData = { ...existing, name: trimmed, updatedAt: Date.now() };
  let working = state.working;
  if (working.sourceId === id) working = { ...working, name: trimmed };
  try {
    await dbPutLayout(layout);
    if (working !== state.working) await dbPutWorking(working);
  } catch (error) {
    throw new Error(storageMessage(error));
  }
  state = { ...state, layouts: upsert(state.layouts, layout), working };
  showStatus('Layout renamed.');
}

export async function deleteNamedLayout(id: string): Promise<void> {
  const layout = state.layouts.find((item) => item.id === id);
  if (!layout) return;
  let working = state.working;
  if (working.sourceId === id) working = { ...working, sourceId: null, dirty: true };
  try {
    await dbDeleteLayout(id);
    if (working !== state.working) await dbPutWorking(working);
  } catch (error) {
    throw new Error(storageMessage(error));
  }
  state = { ...state, layouts: state.layouts.filter((item) => item.id !== id), working };
  showStatus(`Deleted ${layout.name}.`);
}

async function ensureSavedForExport(): Promise<void> {
  const working = state.working;
  const mission = working.mission;
  const hasContent =
    working.placements.length > 0 ||
    mission.objectives.length > 0 ||
    mission.zones.length > 0 ||
    mission.doors.length > 0 ||
    mission.blockers.length > 0;
  if (!hasContent && !working.sourceId) return;
  if (working.sourceId && !working.dirty) return;
  if (!working.name.trim()) state = { ...state, working: { ...working, name: 'Untitled layout' } };
  await saveNamedLayout();
}

export async function exportExchangeFile(): Promise<ExchangeFile> {
  await ensureSavedForExport();
  const tiles: ExchangeTile[] = [];
  for (const tile of state.tiles) {
    let photoDataUrl: string | null = null;
    if (tile.photoId) {
      const blob = blobs.get(tile.photoId);
      if (blob) photoDataUrl = await blobToDataUrl(blob);
    }
    tiles.push({ ...tile, photoDataUrl });
  }
  return buildExchange(tiles, state.layouts);
}

export async function importExchangeText(text: string): Promise<{ tiles: number; layouts: number; errors: string[] }> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text) as unknown;
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const parsed = parseExchange(parsedJson);
  try {
    for (const tile of parsed.tiles) {
      if (tile.photoDataUrl && tile.photoId) {
        const blob = dataUrlToBlob(tile.photoDataUrl);
        await dbPutPhoto(tile.photoId, blob);
        rememberPhoto(tile.photoId, blob);
      }
      await dbPutTile(toDefinition(tile));
    }
    for (const layout of parsed.layouts) await dbPutLayout(layout);
  } catch (error) {
    throw new Error(storageMessage(error));
  }
  const tiles = mergeById(state.tiles, parsed.tiles.map(toDefinition));
  const layouts = mergeById(state.layouts, parsed.layouts);
  const used = new Set(tiles.map((tile) => tile.photoId).filter((id): id is string => Boolean(id)));
  for (const photoId of [...blobs.keys()]) {
    if (used.has(photoId)) continue;
    forgetPhoto(photoId);
    await dbDeletePhoto(photoId).catch(() => undefined);
  }
  state = { ...state, tiles, layouts, photoUrls: publishPhotos() };
  const note = parsed.errors[0] ? ` ${parsed.errors[0]}` : '';
  showStatus(`Imported ${parsed.tiles.length} tiles and ${parsed.layouts.length} layouts.${note}`);
  return { tiles: parsed.tiles.length, layouts: parsed.layouts.length, errors: parsed.errors };
}
