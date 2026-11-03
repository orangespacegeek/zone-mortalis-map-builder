import type { BoardSize, Rect, Rotation } from '../types';

export const BOARD_PRESETS = [
  { id: '4x4', label: '4×4 ft', width: 48, height: 48 },
  { id: '6x4', label: '6×4 ft', width: 72, height: 48 },
] as const;

export type BoardPresetId = (typeof BOARD_PRESETS)[number]['id'];

const MIN_BOARD_INCHES = 12;
const MAX_BOARD_INCHES = 240;

/** Nearest integer. Halves round away from zero so drags are stable. */
export function snapToGrid(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const snapped = Math.sign(value) * Math.round(Math.abs(value));
  return snapped === 0 ? 0 : snapped;
}

export function isBoardSize(value: BoardSize | string): value is BoardSize {
  return typeof value !== 'string';
}

export function snapTopLeft(x: number, y: number): { x: number; y: number } {
  return { x: snapToGrid(x), y: snapToGrid(y) };
}

export function isRotation(value: unknown): value is Rotation {
  return value === 0 || value === 90 || value === 180 || value === 270;
}

export function nextRotation(rotation: Rotation): Rotation {
  return ((rotation + 90) % 360) as Rotation;
}

/** Footprint after a clockwise quarter-turn. 90° and 270° swap the sides. */
export function rotatedSize(
  width: number,
  height: number,
  rotation: Rotation,
): { width: number; height: number } {
  if (rotation === 90 || rotation === 270) return { width: height, height: width };
  return { width, height };
}

export function occupiedRect(
  x: number,
  y: number,
  footprintWidth: number,
  footprintHeight: number,
  rotation: Rotation,
): Rect {
  const size = rotatedSize(footprintWidth, footprintHeight, rotation);
  return { x, y, width: size.width, height: size.height };
}

/**
 * Maps a point in the tile's stored footprint into the occupied rectangle.
 * Rotation is clockwise around the top-left, then shifted back onto the grid
 * so the occupied rectangle stays anchored at (0, 0) in local space.
 * Four rotations return every corner to its start; x/y of the placement do not drift.
 */
export function mapArtPoint(
  px: number,
  py: number,
  rotation: Rotation,
  width: number,
  height: number,
): { x: number; y: number } {
  switch (rotation) {
    case 0:
      return { x: px, y: py };
    case 90:
      return { x: height - py, y: px };
    case 180:
      return { x: width - px, y: height - py };
    case 270:
      return { x: py, y: width - px };
  }
}

/** SVG transform matching `mapArtPoint`. Applied to art drawn in the stored footprint. */
export function artTransform(rotation: Rotation, width: number, height: number): string {
  switch (rotation) {
    case 0:
      return '';
    case 90:
      return `translate(${height} 0) rotate(90)`;
    case 180:
      return `translate(${width} ${height}) rotate(180)`;
    case 270:
      return `translate(0 ${width}) rotate(270)`;
  }
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function isOutOfBounds(rect: Rect, board: BoardSize): boolean {
  return (
    rect.x < 0 ||
    rect.y < 0 ||
    rect.x + rect.width > board.width ||
    rect.y + rect.height > board.height
  );
}

export interface PlacedBox {
  id: string;
  name: string;
  rect: Rect;
}

export interface BoardWarning {
  type: 'out-of-bounds' | 'overlap';
  ids: string[];
  message: string;
}

export function boardWarnings(boxes: PlacedBox[], board: BoardSize): BoardWarning[] {
  const warnings: BoardWarning[] = [];
  for (const box of boxes) {
    if (isOutOfBounds(box.rect, board)) {
      warnings.push({
        type: 'out-of-bounds',
        ids: [box.id],
        message: `${box.name} hangs off the board.`,
      });
    }
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (!a || !b) continue;
      if (rectsOverlap(a.rect, b.rect)) {
        warnings.push({
          type: 'overlap',
          ids: [a.id, b.id],
          message: `${a.name} overlaps ${b.name}.`,
        });
      }
    }
  }
  return warnings;
}

export function warnedIds(warnings: BoardWarning[]): Set<string> {
  const ids = new Set<string>();
  for (const warning of warnings) {
    for (const id of warning.ids) ids.add(id);
  }
  return ids;
}

/** Snap a drag rectangle. A tap (no travel) still yields a 1×1 square. */
export function rectFromDrag(x0: number, y0: number, x1: number, y1: number): Rect {
  const a = snapTopLeft(x0, y0);
  const b = snapTopLeft(x1, y1);
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(1, Math.abs(b.x - a.x)),
    height: Math.max(1, Math.abs(b.y - a.y)),
  };
}

export function clampRect(rect: Rect, board: BoardSize): Rect {
  const width = Math.min(Math.max(1, rect.width), board.width);
  const height = Math.min(Math.max(1, rect.height), board.height);
  const x = Math.min(Math.max(0, rect.x), board.width - width);
  const y = Math.min(Math.max(0, rect.y), board.height - height);
  return { x, y, width, height };
}

export function clampCell(x: number, y: number, board: BoardSize): { x: number; y: number } {
  return {
    x: Math.min(board.width - 1, Math.max(0, snapToGrid(x))),
    y: Math.min(board.height - 1, Math.max(0, snapToGrid(y))),
  };
}

/** First in-bounds cell, scanning rows from the top-left, that does not overlap. */
export function firstOpenSlot(
  footprintWidth: number,
  footprintHeight: number,
  rotation: Rotation,
  occupied: Rect[],
  board: BoardSize,
): { x: number; y: number } | null {
  const size = rotatedSize(footprintWidth, footprintHeight, rotation);
  if (size.width > board.width || size.height > board.height) return null;
  const maxX = board.width - size.width;
  const maxY = board.height - size.height;
  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x <= maxX; x++) {
      const rect = { x, y, width: size.width, height: size.height };
      if (!occupied.some((other) => rectsOverlap(rect, other))) return { x, y };
    }
  }
  return null;
}

export function matchPreset(board: BoardSize): BoardPresetId | null {
  const preset = BOARD_PRESETS.find((item) => item.width === board.width && item.height === board.height);
  return preset?.id ?? null;
}

export function boardFromFeet(widthFeet: number, heightFeet: number): BoardSize | string {
  if (!Number.isFinite(widthFeet) || !Number.isFinite(heightFeet)) {
    return 'Enter a width and a height in feet.';
  }
  const width = Math.round(widthFeet * 12);
  const height = Math.round(heightFeet * 12);
  if (width < MIN_BOARD_INCHES || height < MIN_BOARD_INCHES) {
    return 'The board must be at least 1 ft on each side.';
  }
  if (width > MAX_BOARD_INCHES || height > MAX_BOARD_INCHES) {
    return 'The board cannot exceed 20 ft on a side.';
  }
  return { width, height };
}

export function formatInchesAsFeet(inches: number): string {
  const feet = inches / 12;
  return Number.isInteger(feet) ? String(feet) : feet.toFixed(1);
}

export function formatBoardSize(board: BoardSize): string {
  return `${formatInchesAsFeet(board.width)}×${formatInchesAsFeet(board.height)} ft`;
}
