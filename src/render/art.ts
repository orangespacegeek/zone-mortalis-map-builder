import { escapeHtml } from '../core/text';

export interface ArtTile {
  name: string;
  width: number;
  height: number;
  tags: readonly string[];
}

interface ArtColors {
  wall: string;
  floor: string;
  floorAlt: string;
  ink: string;
  line: string;
  panel: string;
}

const SCREEN: ArtColors = {
  wall: '#2a2f2a',
  floor: '#4e584c',
  floorAlt: '#6c5842',
  ink: '#f0eadc',
  line: '#e0b15a',
  panel: '#3c3330',
};

const PRINT: ArtColors = {
  wall: '#d5cfc2',
  floor: '#f7f3ea',
  floorAlt: '#e4d3b8',
  ink: '#241f18',
  line: '#6d5c42',
  panel: '#c9bba8',
};

function colorsFor(theme: 'screen' | 'print'): ArtColors {
  return theme === 'print' ? PRINT : SCREEN;
}

function rect(x: number, y: number, width: number, height: number, fill: string): string {
  if (width <= 0 || height <= 0) return '';
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`;
}

type Motif = 'corridor' | 't' | 'cross' | 'room' | 'door' | 'stairs' | 'plain';

function motifFor(tile: ArtTile): Motif {
  if (tile.tags.includes('elevation')) return 'stairs';
  if (tile.tags.includes('door') && !tile.tags.includes('room') && !tile.tags.includes('corridor')) return 'door';
  if (tile.tags.includes('junction')) return tile.name.toLowerCase().includes('cross') ? 'cross' : 't';
  if (tile.tags.includes('room')) return 'room';
  if (tile.tags.includes('corridor')) return 'corridor';
  return 'plain';
}

function frame(width: number, height: number, fill: string, line: string): string {
  const inset = 0.06;
  return [
    rect(0, 0, width, height, fill),
    `<rect x="${inset}" y="${inset}" width="${Math.max(0, width - inset * 2)}" height="${Math.max(0, height - inset * 2)}" fill="none" stroke="${line}" stroke-width="0.08"/>`,
  ].join('');
}

function corridor(tile: ArtTile, colors: ArtColors): string {
  const { width, height } = tile;
  const margin = Math.min(0.42, Math.min(width, height) * 0.28);
  const alongY = height >= width;
  const walk = alongY
    ? rect(margin, 0, width - margin * 2, height, colors.floor)
    : rect(0, margin, width, height - margin * 2, colors.floor);
  return `${frame(width, height, colors.wall, colors.line)}${walk}`;
}

function junction(tile: ArtTile, colors: ArtColors, cross: boolean): string {
  const { width, height } = tile;
  const bar = Math.min(width, height) * 0.42;
  const vertical = rect((width - bar) / 2, cross ? 0 : height * 0.28, bar, cross ? height : height * 0.72, colors.floor);
  const horizontal = rect(0, cross ? (height - bar) / 2 : height * 0.28, width, bar, colors.floor);
  return `${frame(width, height, colors.wall, colors.line)}${vertical}${horizontal}`;
}

function room(tile: ArtTile, colors: ArtColors): string {
  const { width, height } = tile;
  const tick = Math.min(0.45, Math.min(width, height) * 0.16);
  const corners = [
    rect(0, 0, tick, tick, colors.wall),
    rect(width - tick, 0, tick, tick, colors.wall),
    rect(0, height - tick, tick, tick, colors.wall),
    rect(width - tick, height - tick, tick, tick, colors.wall),
  ];
  const column =
    width >= 6 && height >= 6
      ? `<circle cx="${width / 2}" cy="${height / 2}" r="0.48" fill="${colors.wall}" stroke="${colors.line}" stroke-width="0.08"/>`
      : '';
  return `${frame(width, height, colors.floor, colors.line)}${corners.join('')}${column}`;
}

function door(tile: ArtTile, colors: ArtColors): string {
  const { width, height } = tile;
  const alongY = height >= width;
  const seam = alongY
    ? `<line x1="${width / 2}" y1="0.15" x2="${width / 2}" y2="${height - 0.15}" stroke="${colors.line}" stroke-width="0.1"/>`
    : `<line x1="0.15" y1="${height / 2}" x2="${width - 0.15}" y2="${height / 2}" stroke="${colors.line}" stroke-width="0.1"/>`;
  return `${frame(width, height, colors.panel, colors.line)}${seam}`;
}

function stairs(tile: ArtTile, colors: ArtColors): string {
  const { width, height } = tile;
  const alongY = height >= width;
  const bands: string[] = [];
  const span = alongY ? height : width;
  for (let step = 0; step < span; step += 1) {
    const fill = step % 2 === 0 ? colors.floor : colors.floorAlt;
    bands.push(
      alongY
        ? rect(0.2, step + 0.15, width - 0.4, 0.7, fill)
        : rect(step + 0.15, 0.2, 0.7, height - 0.4, fill),
    );
  }
  return `${frame(width, height, colors.wall, colors.line)}${bands.join('')}`;
}

export function renderTileArt(tile: ArtTile, photoUrl: string | null, theme: 'screen' | 'print'): string {
  const colors = colorsFor(theme);
  if (photoUrl) {
    const href = escapeHtml(photoUrl);
    return [
      rect(0, 0, tile.width, tile.height, colors.wall),
      `<image href="${href}" xlink:href="${href}" x="0" y="0" width="${tile.width}" height="${tile.height}" preserveAspectRatio="xMidYMid meet"/>`,
      `<rect x="0.06" y="0.06" width="${Math.max(0, tile.width - 0.12)}" height="${Math.max(0, tile.height - 0.12)}" fill="none" stroke="${colors.line}" stroke-width="0.08"/>`,
    ].join('');
  }
  switch (motifFor(tile)) {
    case 'corridor':
      return corridor(tile, colors);
    case 't':
      return junction(tile, colors, false);
    case 'cross':
      return junction(tile, colors, true);
    case 'room':
      return room(tile, colors);
    case 'door':
      return door(tile, colors);
    case 'stairs':
      return stairs(tile, colors);
    case 'plain':
      return frame(tile.width, tile.height, colors.floor, colors.line);
  }
}

export function renderTileThumbnail(tile: ArtTile, photoUrl: string | null): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${tile.width} ${tile.height}" width="56" height="56" aria-hidden="true">${renderTileArt(tile, photoUrl, 'screen')}</svg>`;
}
