import type { TileDefinition } from '../types';

const STARTER_UPDATED_AT = 0;

function stock(tile: Omit<TileDefinition, 'kind' | 'maker' | 'photoId' | 'updatedAt'>): TileDefinition {
  return {
    ...tile,
    kind: 'stock',
    maker: '',
    photoId: null,
    updatedAt: STARTER_UPDATED_AT,
  };
}

/** A small collection of plain outlines so a board can be planned before any photos are added. */
export function starterTiles(): TileDefinition[] {
  return [
    stock({
      id: 'starter-corridor',
      name: 'Straight corridor',
      width: 2,
      height: 6,
      quantity: 8,
      tags: ['corridor'],
    }),
    stock({
      id: 'starter-short-corridor',
      name: 'Short corridor',
      width: 2,
      height: 2,
      quantity: 6,
      tags: ['corridor'],
    }),
    stock({
      id: 'starter-t-junction',
      name: 'T-junction',
      width: 4,
      height: 4,
      quantity: 4,
      tags: ['junction'],
    }),
    stock({
      id: 'starter-cross-junction',
      name: 'Cross junction',
      width: 4,
      height: 4,
      quantity: 2,
      tags: ['junction'],
    }),
    stock({
      id: 'starter-small-room',
      name: 'Small room',
      width: 4,
      height: 4,
      quantity: 4,
      tags: ['room'],
    }),
    stock({
      id: 'starter-large-room',
      name: 'Large room',
      width: 6,
      height: 6,
      quantity: 2,
      tags: ['room'],
    }),
    stock({
      id: 'starter-bulkhead',
      name: 'Bulkhead',
      width: 2,
      height: 1,
      quantity: 6,
      tags: ['door'],
    }),
    stock({
      id: 'starter-stairs',
      name: 'Stairs',
      width: 2,
      height: 4,
      quantity: 2,
      tags: ['elevation'],
    }),
  ];
}
