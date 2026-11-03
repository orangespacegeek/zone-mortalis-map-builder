export interface OwnedTile {
  id: string;
  quantity: number;
}

export interface PlaceCheck {
  ok: boolean;
  used: number;
  owned: number;
  reason?: string;
}

export interface TileUsage {
  tileId: string;
  used: number;
  owned: number;
  remaining: number;
  overAllocated: boolean;
}

export function countUsed(placements: readonly { tileId: string }[], tileId: string): number {
  let used = 0;
  for (const placement of placements) {
    if (placement.tileId === tileId) used += 1;
  }
  return used;
}

/**
 * A tile can be placed only while copies on the board are still under the owned quantity.
 * Reaching the owned count blocks the next placement.
 */
export function canPlace(tile: OwnedTile, placements: readonly { tileId: string }[]): PlaceCheck {
  const used = countUsed(placements, tile.id);
  if (used >= tile.quantity) {
    const reason =
      tile.quantity === 0
        ? 'None of these are owned, so it cannot be placed.'
        : `All ${tile.quantity} owned ${tile.quantity === 1 ? 'copy is' : 'copies are'} already on the board.`;
    return { ok: false, used, owned: tile.quantity, reason };
  }
  return { ok: true, used, owned: tile.quantity };
}

export function usageFor(tile: OwnedTile, placements: readonly { tileId: string }[]): TileUsage {
  const used = countUsed(placements, tile.id);
  return {
    tileId: tile.id,
    used,
    owned: tile.quantity,
    remaining: tile.quantity - used,
    overAllocated: used > tile.quantity,
  };
}
