import { describe, expect, it } from 'vitest';
import { validateTileDraft, type TileDraft } from '../src/core/validation';

function draft(overrides: Partial<TileDraft> = {}): TileDraft {
  return {
    name: 'Shrine',
    kind: 'stock',
    width: 4,
    height: 4,
    quantity: 1,
    tags: ['room'],
    maker: '',
    hasPhoto: false,
    ...overrides,
  };
}

describe('unique-tile photo validation', () => {
  it('lets a stock tile save with or without a photo', () => {
    expect(validateTileDraft(draft()).ok).toBe(true);
    expect(validateTileDraft(draft({ hasPhoto: true, maker: 'Forge' })).ok).toBe(true);
  });

  it('requires an overhead photo before a unique tile can be saved', () => {
    const missing = validateTileDraft(draft({ kind: 'unique', maker: 'Anvil Works', hasPhoto: false }));
    expect(missing.ok).toBe(false);
    expect(missing.errors).toContain('Unique tiles require an overhead photo.');

    const ready = validateTileDraft(draft({ kind: 'unique', maker: 'Anvil Works', hasPhoto: true }));
    expect(ready).toEqual({ ok: true, errors: [] });
  });

  it('requires a maker or source on unique tiles even when the photo is present', () => {
    const blank = validateTileDraft(draft({ kind: 'unique', maker: '   ', hasPhoto: true }));
    expect(blank.ok).toBe(false);
    expect(blank.errors).toContain('Unique tiles require a maker or source.');
  });

  it('rejects a missing name, a fractional footprint, a bad quantity, and unknown tags', () => {
    const result = validateTileDraft(
      draft({ name: '  ', width: 1.5, height: 0, quantity: -1, tags: ['room', 'teleporter'] }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      'Name is required.',
      'Width must be a whole number of squares, at least 1.',
      'Height must be a whole number of squares, at least 1.',
      'Quantity must be a whole number, 0 or more.',
      'Unknown tags: teleporter.',
    ]);
  });

  it('allows a stock tile with quantity zero', () => {
    expect(validateTileDraft(draft({ quantity: 0 })).ok).toBe(true);
  });
});
