import { describe, expect, it } from 'vitest';
import {
  artTransform,
  boardFromFeet,
  boardWarnings,
  firstOpenSlot,
  isOutOfBounds,
  mapArtPoint,
  nextRotation,
  occupiedRect,
  rectFromDrag,
  rectsOverlap,
  rotatedSize,
  snapToGrid,
  snapTopLeft,
} from '../src/core/geometry';
import type { Rotation } from '../src/types';

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

describe('snapping', () => {
  it('snaps to the nearest grid line, with halves away from zero', () => {
    expect(snapToGrid(1.4)).toBe(1);
    expect(snapToGrid(1.5)).toBe(2);
    expect(snapToGrid(2.6)).toBe(3);
    expect(snapToGrid(-0.6)).toBe(-1);
    expect(snapToGrid(-1.5)).toBe(-2);
    expect(snapToGrid(0)).toBe(0);
    expect(snapToGrid(Number.NaN)).toBe(0);
  });

  it('snaps a dragged top-left to a grid intersection', () => {
    expect(snapTopLeft(1.2, 3.8)).toEqual({ x: 1, y: 4 });
    expect(snapTopLeft(-0.4, 0.4)).toEqual({ x: 0, y: 0 });
  });
});

describe('rotation', () => {
  it('cycles through quarter turns and swaps the footprint at 90 and 270', () => {
    expect(nextRotation(0)).toBe(90);
    expect(nextRotation(90)).toBe(180);
    expect(nextRotation(180)).toBe(270);
    expect(nextRotation(270)).toBe(0);
    expect(rotatedSize(2, 6, 0)).toEqual({ width: 2, height: 6 });
    expect(rotatedSize(2, 6, 90)).toEqual({ width: 6, height: 2 });
    expect(rotatedSize(2, 6, 180)).toEqual({ width: 2, height: 6 });
    expect(rotatedSize(2, 6, 270)).toEqual({ width: 6, height: 2 });
  });

  it('keeps the occupied rectangle anchored on the top-left', () => {
    expect(occupiedRect(4, 5, 2, 6, 0)).toEqual({ x: 4, y: 5, width: 2, height: 6 });
    expect(occupiedRect(4, 5, 2, 6, 90)).toEqual({ x: 4, y: 5, width: 6, height: 2 });
    let rotation: Rotation = 0;
    for (let step = 0; step < 4; step++) rotation = nextRotation(rotation);
    expect(rotation).toBe(0);
    expect(occupiedRect(4, 5, 2, 6, rotation)).toEqual({ x: 4, y: 5, width: 2, height: 6 });
  });

  it('maps every footprint corner onto a corner of the occupied rectangle', () => {
    const width = 2;
    const height = 6;
    const corners = [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ];
    for (const rotation of ROTATIONS) {
      const occupied = rotatedSize(width, height, rotation);
      const expected = new Set([
        '0,0',
        `${occupied.width},0`,
        `${occupied.width},${occupied.height}`,
        `0,${occupied.height}`,
      ]);
      const mapped = corners.map(([px, py]) => {
        const point = mapArtPoint(px ?? 0, py ?? 0, rotation, width, height);
        return `${point.x},${point.y}`;
      });
      expect(new Set(mapped)).toEqual(expected);
    }
  });

  it('builds the SVG transform that matches the corner mapping', () => {
    expect(artTransform(0, 2, 6)).toBe('');
    expect(artTransform(90, 2, 6)).toBe('translate(6 0) rotate(90)');
    expect(artTransform(180, 2, 6)).toBe('translate(2 6) rotate(180)');
    expect(artTransform(270, 2, 6)).toBe('translate(0 2) rotate(270)');
  });
});

describe('bounds and overlap', () => {
  const board = { width: 48, height: 48 };

  it('treats shared edges as neighbors, not overlaps', () => {
    const left = { x: 0, y: 0, width: 2, height: 2 };
    const right = { x: 2, y: 0, width: 2, height: 2 };
    const overlapping = { x: 1, y: 1, width: 2, height: 2 };
    expect(rectsOverlap(left, right)).toBe(false);
    expect(rectsOverlap(left, overlapping)).toBe(true);
  });

  it('flags a tile that crosses the table edge and allows one that ends on it', () => {
    expect(isOutOfBounds({ x: 46, y: 0, width: 2, height: 2 }, board)).toBe(false);
    expect(isOutOfBounds({ x: 47, y: 0, width: 2, height: 2 }, board)).toBe(true);
    expect(isOutOfBounds({ x: -1, y: 0, width: 2, height: 2 }, board)).toBe(true);
  });

  it('reports out-of-bounds tiles and each overlapping pair once', () => {
    const warnings = boardWarnings(
      [
        { id: 'a', name: 'Corridor', rect: { x: 0, y: 0, width: 2, height: 6 } },
        { id: 'b', name: 'Room', rect: { x: 1, y: 1, width: 4, height: 4 } },
        { id: 'c', name: 'Stairs', rect: { x: 47, y: 0, width: 2, height: 4 } },
      ],
      board,
    );
    expect(warnings.map((warning) => warning.type)).toEqual(['out-of-bounds', 'overlap']);
    expect(warnings[0]?.message).toBe('Stairs hangs off the board.');
    expect(warnings[1]?.message).toBe('Corridor overlaps Room.');
    expect(warnings[1]?.ids).toEqual(['a', 'b']);
  });

  it('snaps a drag into a grid rectangle of at least one square', () => {
    expect(rectFromDrag(1.2, 2.2, 4.6, 5.1)).toEqual({ x: 1, y: 2, width: 4, height: 3 });
    expect(rectFromDrag(5.4, 5.4, 1.2, 2.2)).toEqual({ x: 1, y: 2, width: 4, height: 3 });
    expect(rectFromDrag(3.1, 3.1, 3.2, 3.4)).toEqual({ x: 3, y: 3, width: 1, height: 1 });
  });
});

describe('open slots and custom boards', () => {
  it('places the next tile in the first free cell, skipping overlaps', () => {
    const board = { width: 10, height: 6 };
    expect(firstOpenSlot(2, 2, 0, [], board)).toEqual({ x: 0, y: 0 });
    const occupied = [{ x: 0, y: 0, width: 2, height: 2 }];
    expect(firstOpenSlot(2, 2, 0, occupied, board)).toEqual({ x: 2, y: 0 });
    expect(firstOpenSlot(2, 6, 90, [], board)).toEqual({ x: 0, y: 0 });
    expect(firstOpenSlot(8, 2, 0, [], { width: 6, height: 6 })).toBeNull();
  });

  it('converts feet to whole inches and rejects an impossible table', () => {
    expect(boardFromFeet(4, 4)).toEqual({ width: 48, height: 48 });
    expect(boardFromFeet(6, 4)).toEqual({ width: 72, height: 48 });
    expect(boardFromFeet(4.5, 4)).toEqual({ width: 54, height: 48 });
    expect(boardFromFeet(0, 4)).toBe('The board must be at least 1 ft on each side.');
    expect(boardFromFeet(Number.NaN, 4)).toBe('Enter a width and a height in feet.');
  });
});
