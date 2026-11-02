import { describe, expect, it } from 'vitest';
import { buildPullList, pullListTotal } from '../src/core/pull-list';
import type { TileDefinition } from '../src/types';

function tile(overrides: Partial<TileDefinition> & Pick<TileDefinition, 'id' | 'name'>): TileDefinition {
  return {
    kind: 'stock',
    width: 2,
    height: 2,
    quantity: 4,
    tags: ['corridor'],
    maker: '',
    photoId: null,
    updatedAt: 0,
    ...overrides,
  };
}

describe('pull list', () => {
  const tiles = [
    tile({ id: 'room', name: 'Armoury', tags: ['room'], width: 4, height: 4, quantity: 2 }),
    tile({ id: 'corridor', name: 'Straight corridor', quantity: 8, width: 2, height: 6 }),
    tile({ id: 'stairs', name: 'Stairs', tags: ['elevation'], quantity: 2, width: 2, height: 4 }),
    tile({
      id: 'shrine',
      name: 'Command shrine',
      kind: 'unique',
      tags: ['room'],
      quantity: 1,
      maker: 'Helena',
      photoId: 'shrine-photo',
    }),
  ];

  it('counts copies used and leaves unused tiles off the list', () => {
    const lines = buildPullList(tiles, [
      { tileId: 'corridor' },
      { tileId: 'corridor' },
      { tileId: 'corridor' },
      { tileId: 'shrine' },
      { tileId: 'not-in-the-library' },
    ]);
    expect(lines.map((line) => [line.name, line.used, line.owned])).toEqual([
      ['Command shrine', 1, 1],
      ['Straight corridor', 3, 8],
    ]);
    expect(lines.find((line) => line.tileId === 'stairs')).toBeUndefined();
    expect(lines.find((line) => line.tileId === 'room')).toBeUndefined();
    expect(pullListTotal(lines)).toBe(4);
  });

  it('sorts by name and keeps size, kind, and tags for the shelf', () => {
    const lines = buildPullList(tiles, [{ tileId: 'room' }, { tileId: 'corridor' }]);
    expect(lines.map((line) => line.name)).toEqual(['Armoury', 'Straight corridor']);
    expect(lines[0]).toMatchObject({ kind: 'stock', tags: ['room'], width: 4, height: 4, used: 1 });
  });

  it('is empty when the board has no placements', () => {
    expect(buildPullList(tiles, [])).toEqual([]);
    expect(pullListTotal([])).toBe(0);
  });
});
