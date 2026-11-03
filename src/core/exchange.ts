import { TILE_TAGS, type LayoutData, type MissionState, type PlacedTile, type TileDefinition, type TileKind, type TileTag, type WorkingLayout } from '../types';
import { isRotation } from './geometry';
import { sortTags, validateTileDraft } from './validation';

export const EXCHANGE_FORMAT = 'zone-mortalis-map-builder';
export const EXCHANGE_VERSION = 1;

export interface ExchangeTile extends TileDefinition {
  photoDataUrl: string | null;
}

export interface ExchangeFile {
  format: typeof EXCHANGE_FORMAT;
  version: typeof EXCHANGE_VERSION;
  exportedAt: string;
  tiles: ExchangeTile[];
  layouts: LayoutData[];
}

export interface ParsedExchange {
  tiles: ExchangeTile[];
  layouts: LayoutData[];
  errors: string[];
}

export function emptyMission(): MissionState {
  return { visible: false, objectives: [], zones: [], doors: [], blockers: [] };
}

export function defaultWorking(): WorkingLayout {
  return {
    sourceId: null,
    name: 'Untitled layout',
    board: { width: 48, height: 48 },
    placements: [],
    mission: emptyMission(),
    dirty: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().slice(0, 80);
  return trimmed || fallback;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function wholeInRange(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

export function coercePlacement(value: unknown): PlacedTile | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || !value.id) return null;
  if (typeof value.tileId !== 'string' || !value.tileId) return null;
  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  if (x === null || y === null) return null;
  if (!isRotation(value.rotation)) return null;
  return { id: value.id, tileId: value.tileId, x, y, rotation: value.rotation };
}

export function coerceMission(value: unknown): MissionState {
  const mission = emptyMission();
  if (!isRecord(value)) return mission;
  mission.visible = value.visible === true;
  if (Array.isArray(value.objectives)) {
    for (const entry of value.objectives) {
      if (!isRecord(entry) || typeof entry.id !== 'string') continue;
      const x = wholeInRange(entry.x, -1000, 1000);
      const y = wholeInRange(entry.y, -1000, 1000);
      if (x === null || y === null) continue;
      mission.objectives.push({
        id: entry.id,
        x,
        y,
        label: clampName(entry.label, String(mission.objectives.length + 1)),
      });
    }
  }
  if (Array.isArray(value.zones)) {
    for (const entry of value.zones) {
      if (!isRecord(entry) || typeof entry.id !== 'string') continue;
      if (entry.side !== 'a' && entry.side !== 'b') continue;
      const x = wholeInRange(entry.x, 0, 240);
      const y = wholeInRange(entry.y, 0, 240);
      const width = wholeInRange(entry.width, 1, 240);
      const height = wholeInRange(entry.height, 1, 240);
      if (x === null || y === null || width === null || height === null) continue;
      mission.zones.push({ id: entry.id, side: entry.side, x, y, width, height });
    }
  }
  if (Array.isArray(value.doors)) {
    for (const entry of value.doors) {
      if (!isRecord(entry) || typeof entry.id !== 'string') continue;
      const x = wholeInRange(entry.x, 0, 240);
      const y = wholeInRange(entry.y, 0, 240);
      const span = wholeInRange(entry.span, 1, 48);
      if (x === null || y === null || span === null || !isRotation(entry.rotation)) continue;
      mission.doors.push({
        id: entry.id,
        x,
        y,
        rotation: entry.rotation,
        span,
        open: entry.open === true,
      });
    }
  }
  if (Array.isArray(value.blockers)) {
    for (const entry of value.blockers) {
      if (!isRecord(entry) || typeof entry.id !== 'string') continue;
      const x = wholeInRange(entry.x, 0, 240);
      const y = wholeInRange(entry.y, 0, 240);
      const width = wholeInRange(entry.width, 1, 240);
      const height = wholeInRange(entry.height, 1, 240);
      if (x === null || y === null || width === null || height === null) continue;
      mission.blockers.push({ id: entry.id, x, y, width, height });
    }
  }
  return mission;
}

export function coerceLayout(value: unknown): LayoutData | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) return null;
  if (!isRecord(value.board)) return null;
  const width = wholeInRange(value.board.width, 12, 240);
  const height = wholeInRange(value.board.height, 12, 240);
  if (width === null || height === null) return null;
  const placements: PlacedTile[] = [];
  if (Array.isArray(value.placements)) {
    for (const entry of value.placements) {
      const placement = coercePlacement(entry);
      if (placement) placements.push(placement);
    }
  }
  const updatedAt = finiteNumber(value.updatedAt) ?? Date.now();
  return {
    id: value.id,
    name: clampName(value.name, 'Untitled layout'),
    board: { width, height },
    placements,
    mission: coerceMission(value.mission),
    updatedAt,
  };
}

export function coerceWorking(value: unknown): WorkingLayout {
  const fallback = defaultWorking();
  if (!isRecord(value)) return fallback;
  const asLayout = coerceLayout({
    ...value,
    id: typeof value.sourceId === 'string' && value.sourceId ? value.sourceId : 'working',
  });
  if (!asLayout) return fallback;
  return {
    sourceId: typeof value.sourceId === 'string' && value.sourceId ? value.sourceId : null,
    name: asLayout.name,
    board: asLayout.board,
    placements: asLayout.placements,
    mission: asLayout.mission,
    dirty: value.dirty === true,
  };
}

function isImageDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:image/');
}

function coerceTile(value: unknown, index: number): { tile: ExchangeTile | null; error: string | null } {
  if (!isRecord(value)) return { tile: null, error: `Tile ${index + 1} is not an object.` };
  const id = typeof value.id === 'string' && value.id ? value.id : '';
  const label = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : id || `Tile ${index + 1}`;
  if (!id) return { tile: null, error: `${label} is missing an id.` };
  const kind: TileKind | null = value.kind === 'unique' ? 'unique' : value.kind === 'stock' ? 'stock' : null;
  if (!kind) return { tile: null, error: `${label} must be stock or unique.` };
  const width = typeof value.width === 'number' ? value.width : Number.NaN;
  const height = typeof value.height === 'number' ? value.height : Number.NaN;
  const quantity = typeof value.quantity === 'number' ? value.quantity : Number.NaN;
  const rawTags = Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === 'string') : [];
  const maker = typeof value.maker === 'string' ? value.maker : '';
  const photoDataUrl = isImageDataUrl(value.photoDataUrl) ? value.photoDataUrl : null;
  const draft = {
    name: typeof value.name === 'string' ? value.name : '',
    kind,
    width,
    height,
    quantity,
    tags: rawTags,
    maker,
    hasPhoto: photoDataUrl !== null,
  };
  const validation = validateTileDraft(draft);
  if (!validation.ok) {
    return { tile: null, error: `${label}: ${validation.errors.join(' ')}` };
  }
  const tags = sortTags(rawTags.filter((tag): tag is TileTag => TILE_TAGS.includes(tag as TileTag)));
  return {
    tile: {
      id,
      name: draft.name.trim(),
      kind,
      width,
      height,
      quantity,
      tags,
      maker: maker.trim(),
      photoId: photoDataUrl ? id : null,
      photoDataUrl,
      updatedAt: finiteNumber(value.updatedAt) ?? Date.now(),
    },
    error: null,
  };
}

export function parseExchange(value: unknown): ParsedExchange {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { tiles: [], layouts: [], errors: ['That file is not a Zone Mortalis export.'] };
  }
  if (value.format !== EXCHANGE_FORMAT) {
    return { tiles: [], layouts: [], errors: ['That file is not a Zone Mortalis export.'] };
  }
  if (value.version !== EXCHANGE_VERSION) {
    return { tiles: [], layouts: [], errors: [`Unsupported file version (${String(value.version)}).`] };
  }
  const tiles: ExchangeTile[] = [];
  if (Array.isArray(value.tiles)) {
    value.tiles.forEach((entry, index) => {
      const result = coerceTile(entry, index);
      if (result.tile) tiles.push(result.tile);
      else if (result.error) errors.push(result.error);
    });
  } else {
    errors.push('The tile library is missing.');
  }
  const layouts: LayoutData[] = [];
  if (Array.isArray(value.layouts)) {
    value.layouts.forEach((entry, index) => {
      const layout = coerceLayout(entry);
      if (layout) layouts.push(layout);
      else errors.push(`Layout ${index + 1} could not be read and was skipped.`);
    });
  }
  return { tiles, layouts, errors };
}

export function buildExchange(tiles: ExchangeTile[], layouts: LayoutData[]): ExchangeFile {
  return {
    format: EXCHANGE_FORMAT,
    version: EXCHANGE_VERSION,
    exportedAt: new Date().toISOString(),
    tiles,
    layouts,
  };
}
