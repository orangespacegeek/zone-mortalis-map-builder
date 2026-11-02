import type { TileDefinition, TileKind, TileTag } from '../types';
import { countUsed } from './inventory';

export interface PullLine {
  tileId: string;
  name: string;
  kind: TileKind;
  tags: TileTag[];
  width: number;
  height: number;
  used: number;
  owned: number;
}

/** Tiles to take off the shelf for this board, one line per definition that is actually used. */
export function buildPullList(
  tiles: readonly TileDefinition[],
  placements: readonly { tileId: string }[],
): PullLine[] {
  const lines: PullLine[] = [];
  for (const tile of tiles) {
    const used = countUsed(placements, tile.id);
    if (used <= 0) continue;
    lines.push({
      tileId: tile.id,
      name: tile.name,
      kind: tile.kind,
      tags: tile.tags,
      width: tile.width,
      height: tile.height,
      used,
      owned: tile.quantity,
    });
  }
  lines.sort(
    (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.tileId.localeCompare(b.tileId),
  );
  return lines;
}

export function pullListTotal(lines: readonly PullLine[]): number {
  return lines.reduce((sum, line) => sum + line.used, 0);
}
