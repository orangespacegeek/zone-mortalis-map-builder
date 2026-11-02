import { artTransform, occupiedRect, rotatedSize } from '../core/geometry';
import { escapeHtml } from '../core/text';
import type {
  BoardSize,
  DeploymentZone,
  DoorMarker,
  LosBlocker,
  MissionState,
  ObjectiveMarker,
  PlacedTile,
  TileDefinition,
} from '../types';
import { renderTileArt } from './art';

export interface BoardSvgOptions {
  showMission: boolean;
  minorGrid: boolean;
  theme: 'screen' | 'print';
  /** How large an inch is drawn, so hairline strokes stay about one screen pixel. */
  pixelsPerInch: number;
  selectedId: string | null;
  warnedIds: ReadonlySet<string>;
}

export interface BoardSvgInput {
  name: string;
  board: BoardSize;
  tiles: readonly TileDefinition[];
  photoUrls: Readonly<Record<string, string>>;
  placements: readonly PlacedTile[];
  mission: MissionState;
  options: BoardSvgOptions;
}

interface Palette {
  board: string;
  minor: string;
  major: string;
  text: string;
  sideA: string;
  sideB: string;
  blocker: string;
  doorOpen: string;
  doorClosed: string;
  objective: string;
  objectiveInk: string;
  select: string;
  warn: string;
}

const SCREEN: Palette = {
  board: '#171814',
  minor: '#3a3d34',
  major: '#6d6758',
  text: '#f0eadc',
  sideA: '#6ea0c4',
  sideB: '#d4876a',
  blocker: '#8d4d6a',
  doorOpen: '#8fba72',
  doorClosed: '#e15d4e',
  objective: '#e0b15a',
  objectiveInk: '#2a2112',
  select: '#e0b15a',
  warn: '#e15d4e',
};

const PRINT: Palette = {
  board: '#ffffff',
  minor: '#e4ddd0',
  major: '#b7ad9e',
  text: '#241f18',
  sideA: '#3d6f96',
  sideB: '#a85b42',
  blocker: '#7a3e58',
  doorOpen: '#2f7d46',
  doorClosed: '#a33b32',
  objective: '#c4923a',
  objectiveInk: '#24180c',
  select: '#8a6a2f',
  warn: '#a33b32',
};

function grid(board: BoardSize, palette: Palette, minorGrid: boolean, px: (pixels: number) => number): string {
  const lines: string[] = [];
  const stroke = (major: boolean) => (major ? px(1.75) : px(1));
  for (let x = 0; x <= board.width; x++) {
    const major = x % 12 === 0;
    if (!major && !minorGrid) continue;
    lines.push(
      `<line x1="${x}" y1="0" x2="${x}" y2="${board.height}" stroke="${major ? palette.major : palette.minor}" stroke-width="${stroke(major)}" shape-rendering="crispEdges"/>`,
    );
  }
  for (let y = 0; y <= board.height; y++) {
    const major = y % 12 === 0;
    if (!major && !minorGrid) continue;
    lines.push(
      `<line x1="0" y1="${y}" x2="${board.width}" y2="${y}" stroke="${major ? palette.major : palette.minor}" stroke-width="${stroke(major)}" shape-rendering="crispEdges"/>`,
    );
  }
  return `<g pointer-events="none">${lines.join('')}</g>`;
}

function zoneMarkup(zone: DeploymentZone, palette: Palette, px: (pixels: number) => number): string {
  const color = zone.side === 'a' ? palette.sideA : palette.sideB;
  const label = zone.side === 'a' ? 'Side A' : 'Side B';
  const font = Math.min(1.15, Math.max(0.7, Math.min(zone.width, zone.height) * 0.28));
  return `<g data-zone-id="${escapeHtml(zone.id)}" transform="translate(${zone.x} ${zone.y})">
    <rect width="${zone.width}" height="${zone.height}" fill="${color}" fill-opacity="0.42" stroke="${color}" stroke-width="${Math.max(0.12, px(2))}"/>
    <text x="0.35" y="${font + 0.15}" fill="${palette.text}" font-size="${font}" font-family="system-ui,sans-serif" pointer-events="none">${label}</text>
  </g>`;
}

function blockerMarkup(blocker: LosBlocker, palette: Palette, px: (pixels: number) => number): string {
  return `<g data-blocker-id="${escapeHtml(blocker.id)}" transform="translate(${blocker.x} ${blocker.y})">
    <rect width="${blocker.width}" height="${blocker.height}" fill="${palette.blocker}" fill-opacity="0.38" stroke="${palette.blocker}" stroke-width="${px(2)}"/>
    <line x1="0.25" y1="0.25" x2="${blocker.width - 0.25}" y2="${blocker.height - 0.25}" stroke="${palette.blocker}" stroke-width="${px(2)}" pointer-events="none"/>
    <line x1="${blocker.width - 0.25}" y1="0.25" x2="0.25" y2="${blocker.height - 0.25}" stroke="${palette.blocker}" stroke-width="${px(2)}" pointer-events="none"/>
  </g>`;
}

function doorMarkup(door: DoorMarker, palette: Palette, px: (pixels: number) => number): string {
  const horizontal = door.rotation === 0 || door.rotation === 180;
  const color = door.open ? palette.doorOpen : palette.doorClosed;
  const dash = door.open ? ` stroke-dasharray="${px(5)} ${px(4)}"` : '';
  const thickness = Math.max(0.22, px(5));
  const line = horizontal
    ? `<line x1="0.15" y1="0.5" x2="${door.span - 0.15}" y2="0.5" stroke="${color}" stroke-width="${thickness}" stroke-linecap="round"${dash}/>`
    : `<line x1="0.5" y1="0.15" x2="0.5" y2="${door.span - 0.15}" stroke="${color}" stroke-width="${thickness}" stroke-linecap="round"${dash}/>`;
  const label = door.open ? 'Door, open' : 'Door, closed';
  const hit = horizontal
    ? `<rect x="0" y="0" width="${door.span}" height="1" fill="transparent"/>`
    : `<rect x="0" y="0" width="1" height="${door.span}" fill="transparent"/>`;
  const mark = `<rect x="0.22" y="0.22" width="0.56" height="0.56" rx="0.08" fill="${color}"/>`;
  return `<g data-door-id="${escapeHtml(door.id)}" transform="translate(${door.x} ${door.y})">
    <title>${escapeHtml(label)}</title>
    ${hit}
    ${mark}
    ${line}
  </g>`;
}

function objectiveMarkup(objective: ObjectiveMarker, palette: Palette): string {
  const full = objective.label.trim() || '•';
  const short = [...full].slice(0, 3).join('');
  const font = short.length > 2 ? 0.3 : 0.42;
  return `<g data-objective-id="${escapeHtml(objective.id)}" transform="translate(${objective.x} ${objective.y})">
    <title>${escapeHtml(full)}</title>
    <circle cx="0.5" cy="0.5" r="0.42" fill="${palette.objective}" stroke="${palette.objectiveInk}" stroke-width="0.06"/>
    <text x="0.5" y="0.5" text-anchor="middle" dominant-baseline="central" font-size="${font}" font-family="system-ui,sans-serif" fill="${palette.objectiveInk}" pointer-events="none">${escapeHtml(short)}</text>
  </g>`;
}

function placementMarkup(
  placement: PlacedTile,
  tile: TileDefinition | undefined,
  photoUrl: string | null,
  palette: Palette,
  theme: 'screen' | 'print',
  selected: boolean,
  warned: boolean,
  px: (pixels: number) => number,
): string {
  const footprintW = tile?.width ?? 1;
  const footprintH = tile?.height ?? 1;
  const occupied = rotatedSize(footprintW, footprintH, placement.rotation);
  const transform = artTransform(placement.rotation, footprintW, footprintH);
  const name = tile?.name ?? 'Missing tile';
  const art = tile
    ? renderTileArt(tile, photoUrl, theme)
    : `<rect width="${footprintW}" height="${footprintH}" fill="#5a3030" stroke="#e15d4e" stroke-width="0.08"/>`;
  const shortSide = Math.min(occupied.width, occupied.height);
  const caption =
    !photoUrl && shortSide >= 2
      ? `<text x="${occupied.width / 2}" y="${occupied.height / 2}" text-anchor="middle" dominant-baseline="central" font-size="${Math.min(0.72, shortSide * 0.28)}" font-family="Georgia, Palatino, serif" fill="${palette.text}" pointer-events="none">${escapeHtml(name)}</text>`
      : '';
  const stroke = warned ? palette.warn : selected ? palette.select : 'none';
  const outline =
    stroke === 'none'
      ? ''
      : `<rect x="0" y="0" width="${occupied.width}" height="${occupied.height}" fill="none" stroke="${stroke}" stroke-width="${px(2.5)}"${warned ? ` stroke-dasharray="${px(4)} ${px(3)}"` : ''} pointer-events="none"/>`;
  const groupTransform = transform ? ` transform="${transform}"` : '';
  return `<g data-placement-id="${escapeHtml(placement.id)}" transform="translate(${placement.x} ${placement.y})">
    <title>${escapeHtml(name)}</title>
    <g${groupTransform} pointer-events="none">${art}</g>
    ${caption}
    <rect x="0" y="0" width="${occupied.width}" height="${occupied.height}" fill="transparent"/>
    ${outline}
  </g>`;
}

export function renderBoardSvg(input: BoardSvgInput): string {
  const { board, options } = input;
  const palette = options.theme === 'print' ? PRINT : SCREEN;
  const pixelsPerInch = Math.max(options.pixelsPerInch, 1);
  const px = (pixels: number) => pixels / pixelsPerInch;
  const tilesById = new Map(input.tiles.map((tile) => [tile.id, tile]));
  const placements = input.placements
    .map((placement) => {
      const tile = tilesById.get(placement.tileId);
      const photoUrl = tile?.photoId ? (input.photoUrls[tile.photoId] ?? null) : null;
      return placementMarkup(
        placement,
        tile,
        photoUrl,
        palette,
        options.theme,
        options.selectedId === placement.id,
        options.warnedIds.has(placement.id),
        px,
      );
    })
    .join('');
  const mission = options.showMission
    ? [
        ...input.mission.zones.map((zone) => zoneMarkup(zone, palette, px)),
        ...input.mission.blockers.map((blocker) => blockerMarkup(blocker, palette, px)),
        placements,
        ...input.mission.doors.map((door) => doorMarkup(door, palette, px)),
        ...input.mission.objectives.map((objective) => objectiveMarkup(objective, palette)),
      ].join('')
    : placements;
  const label = escapeHtml(`${input.name}, ${board.width} by ${board.height} inches`);
  const width = board.width * pixelsPerInch;
  const height = board.height * pixelsPerInch;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${board.width} ${board.height}" width="${width}" height="${height}" role="img" aria-label="${label}">
    <rect class="board-bg" width="${board.width}" height="${board.height}" fill="${palette.board}"/>
    ${grid(board, palette, options.minorGrid, px)}
    ${mission}
  </svg>`;
}

export function placementRects(tiles: readonly TileDefinition[], placements: readonly PlacedTile[]) {
  const tilesById = new Map(tiles.map((tile) => [tile.id, tile]));
  return placements.map((placement) => {
    const tile = tilesById.get(placement.tileId);
    return {
      id: placement.id,
      name: tile?.name ?? 'Missing tile',
      rect: occupiedRect(placement.x, placement.y, tile?.width ?? 1, tile?.height ?? 1, placement.rotation),
    };
  });
}
