import { describe, expect, it } from 'vitest';
import { canPlace, countUsed, usageFor } from '../src/core/inventory';

describe('inventory limits', () => {
  const corridor = { id: 'corridor', quantity: 2 };
  const room = { id: 'room', quantity: 1 };

  it('counts placements of one definition and ignores the others', () => {
    const placements = [{ tileId: 'corridor' }, { tileId: 'room' }, { tileId: 'corridor' }];
    expect(countUsed(placements, 'corridor')).toBe(2);
    expect(countUsed(placements, 'room')).toBe(1);
    expect(countUsed(placements, 'missing')).toBe(0);
  });

  it('allows placement while copies remain and blocks once the owned count is on the board', () => {
    expect(canPlace(corridor, [])).toEqual({ ok: true, used: 0, owned: 2 });
    expect(canPlace(corridor, [{ tileId: 'corridor' }])).toMatchObject({ ok: true, used: 1, owned: 2 });

    const full = canPlace(corridor, [{ tileId: 'corridor' }, { tileId: 'corridor' }]);
    expect(full.ok).toBe(false);
    expect(full.used).toBe(2);
    expect(full.owned).toBe(2);
    expect(full.reason).toMatch(/already on the board/);
  });

  it('does not let another tile definition consume this tile’s allowance', () => {
    const check = canPlace(room, [{ tileId: 'corridor' }, { tileId: 'corridor' }]);
    expect(check).toEqual({ ok: true, used: 0, owned: 1 });
  });

  it('simulates placing until the owned quantity is exhausted', () => {
    const placements: { tileId: string }[] = [];
    let placed = 0;
    while (canPlace(corridor, placements).ok) {
      placements.push({ tileId: corridor.id });
      placed += 1;
    }
    expect(placed).toBe(2);
    expect(canPlace(corridor, placements).ok).toBe(false);
    expect(canPlace(room, placements).ok).toBe(true);
  });

  it('blocks a tile the group does not own and flags an over-allocated board', () => {
    const none = canPlace({ id: 'relic', quantity: 0 }, []);
    expect(none.ok).toBe(false);
    expect(none.reason).toMatch(/cannot be placed/);

    const usage = usageFor(corridor, [
      { tileId: 'corridor' },
      { tileId: 'corridor' },
      { tileId: 'corridor' },
    ]);
    expect(usage).toEqual({
      tileId: 'corridor',
      used: 3,
      owned: 2,
      remaining: -1,
      overAllocated: true,
    });
  });
});
