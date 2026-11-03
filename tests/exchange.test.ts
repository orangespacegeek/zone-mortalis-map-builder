import { describe, expect, it } from 'vitest';
import { EXCHANGE_FORMAT, parseExchange } from '../src/core/exchange';

const PHOTO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('exchange import', () => {
  it('rejects a unique tile that has no overhead photo and keeps a valid stock tile', () => {
    const parsed = parseExchange({
      format: EXCHANGE_FORMAT,
      version: 1,
      tiles: [
        {
          id: 'corridor',
          name: 'Straight corridor',
          kind: 'stock',
          width: 2,
          height: 6,
          quantity: 4,
          tags: ['corridor'],
          maker: '',
          photoDataUrl: null,
        },
        {
          id: 'shrine',
          name: 'Command shrine',
          kind: 'unique',
          width: 4,
          height: 4,
          quantity: 1,
          tags: ['room'],
          maker: 'Helena',
          photoDataUrl: null,
        },
      ],
      layouts: [
        {
          id: 'layout-1',
          name: 'Deck 4',
          board: { width: 48, height: 48 },
          placements: [
            { id: 'p1', tileId: 'corridor', x: 0, y: 0, rotation: 0 },
            { id: 'bad', tileId: 'corridor', x: 0, y: 0, rotation: 45 },
          ],
          mission: { visible: true, objectives: [], zones: [], doors: [], blockers: [] },
          updatedAt: 10,
        },
      ],
    });

    expect(parsed.tiles.map((tile) => tile.id)).toEqual(['corridor']);
    expect(parsed.errors.some((error) => error.includes('overhead photo'))).toBe(true);
    expect(parsed.layouts).toHaveLength(1);
    expect(parsed.layouts[0]?.placements.map((placement) => placement.id)).toEqual(['p1']);
  });

  it('imports a unique tile when the photo and maker are present', () => {
    const parsed = parseExchange({
      format: EXCHANGE_FORMAT,
      version: 1,
      tiles: [
        {
          id: 'shrine',
          name: 'Command shrine',
          kind: 'unique',
          width: 4,
          height: 4,
          quantity: 1,
          tags: ['room'],
          maker: 'Helena',
          photoDataUrl: PHOTO,
        },
      ],
      layouts: [],
    });
    expect(parsed.errors).toEqual([]);
    expect(parsed.tiles[0]).toMatchObject({ id: 'shrine', photoId: 'shrine', kind: 'unique' });
  });

  it('refuses a file that is not this app’s export', () => {
    expect(parseExchange({ hello: 'world' }).errors[0]).toMatch(/not a Zone Mortalis export/);
    expect(parseExchange({ format: EXCHANGE_FORMAT, version: 2, tiles: [], layouts: [] }).errors[0]).toMatch(
      /Unsupported file version/,
    );
  });
});
