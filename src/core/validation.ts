import { TILE_TAGS, type TileKind, type TileTag } from '../types';

export interface TileDraft {
  name: string;
  kind: TileKind;
  width: number;
  height: number;
  quantity: number;
  tags: readonly string[];
  maker: string;
  /** True when an overhead photo is already stored or chosen for this save. */
  hasPhoto: boolean;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function sortTags(tags: readonly TileTag[]): TileTag[] {
  return TILE_TAGS.filter((tag) => tags.includes(tag));
}

export function validateTileDraft(draft: TileDraft): ValidationResult {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push('Name is required.');
  if (!Number.isInteger(draft.width) || draft.width < 1) {
    errors.push('Width must be a whole number of squares, at least 1.');
  }
  if (!Number.isInteger(draft.height) || draft.height < 1) {
    errors.push('Height must be a whole number of squares, at least 1.');
  }
  if (!Number.isInteger(draft.quantity) || draft.quantity < 0) {
    errors.push('Quantity must be a whole number, 0 or more.');
  }
  if (draft.kind !== 'stock' && draft.kind !== 'unique') {
    errors.push('Type must be stock or unique.');
  }
  const unknown = draft.tags.filter((tag) => !TILE_TAGS.includes(tag as TileTag));
  if (unknown.length > 0) {
    errors.push(`Unknown tags: ${unknown.join(', ')}.`);
  }
  if (draft.kind === 'unique') {
    if (!draft.hasPhoto) errors.push('Unique tiles require an overhead photo.');
    if (!draft.maker.trim()) errors.push('Unique tiles require a maker or source.');
  }
  return { ok: errors.length === 0, errors };
}
