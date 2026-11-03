import { describe, expect, it } from 'vitest';
import { renderBoardSvg } from '../src/render/svg';
import type { TileDefinition } from '../src/types';
import { emptyMission } from '../src/core/exchange';

const room: TileDefinition = {
  id: 'room',
  name: 'A & B',
  kind: 'stock',
  width: 4,
  height: 4,
  quantity: 2,
  tags: ['room'],
  maker: '',
  photoId: null,
  updatedAt: 0,
};

describe('board svg', () => {
  it('anchors a placement on the grid and escapes the tile name', () => {
    const markup = renderBoardSvg({
      name: 'Deck',
      board: { width: 48, height: 48 },
      tiles: [room],
      photoUrls: {},
      placements: [{ id: 'p1', tileId: 'room', x: 3, y: 4, rotation: 0 }],
      mission: emptyMission(),
      options: {
        showMission: false,
        minorGrid: true,
        theme: 'screen',
        pixelsPerInch: 10,
        selectedId: null,
        warnedIds: new Set(),
      },
    });
    expect(markup).toContain('data-placement-id="p1"');
    expect(markup).toContain('translate(3 4)');
    expect(markup).toContain('A &amp; B');
    expect(markup).not.toContain('OBJ-ZETA');
  });

  it('omits the mission layer until it is turned on', () => {
    const mission = emptyMission();
    mission.objectives.push({ id: 'o1', x: 2, y: 2, label: 'OBJ-ZETA' });
    const hidden = renderBoardSvg({
      name: 'Deck',
      board: { width: 48, height: 48 },
      tiles: [],
      photoUrls: {},
      placements: [],
      mission,
      options: {
        showMission: false,
        minorGrid: false,
        theme: 'screen',
        pixelsPerInch: 10,
        selectedId: null,
        warnedIds: new Set(),
      },
    });
    const shown = renderBoardSvg({
      name: 'Deck',
      board: { width: 48, height: 48 },
      tiles: [],
      photoUrls: {},
      placements: [],
      mission,
      options: {
        showMission: true,
        minorGrid: false,
        theme: 'screen',
        pixelsPerInch: 10,
        selectedId: null,
        warnedIds: new Set(),
      },
    });
    expect(hidden).not.toContain('OBJ-ZETA');
    expect(shown).toContain('OBJ-ZETA');
    expect(shown).toContain('data-objective-id="o1"');
  });
});
