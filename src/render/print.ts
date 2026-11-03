import { formatBoardSize } from '../core/geometry';
import { buildPullList, pullListTotal } from '../core/pull-list';
import { escapeHtml, tagLabel } from '../core/text';
import type { AppState } from '../state/store';
import { boardWarnings, warnedIds } from '../core/geometry';
import { placementRects, renderBoardSvg } from './svg';

export function renderPrintHtml(state: AppState): string {
  const { working, tiles, photoUrls } = state;
  const boxes = placementRects(tiles, working.placements);
  const warnings = boardWarnings(boxes, working.board);
  const svg = renderBoardSvg({
    name: working.name,
    board: working.board,
    tiles,
    photoUrls,
    placements: working.placements,
    mission: working.mission,
    options: {
      showMission: working.mission.visible,
      minorGrid: true,
      theme: 'print',
      pixelsPerInch: 12,
      selectedId: null,
      warnedIds: warnedIds(warnings),
    },
  });
  const lines = buildPullList(tiles, working.placements);
  const pullRows =
    lines.length === 0
      ? `<tr><td colspan="4">No tiles on the board.</td></tr>`
      : lines
          .map((line) => {
            const short = line.used > line.owned ? ' short' : '';
            return `<tr class="${short.trim()}"><td>${escapeHtml(line.name)}</td><td>${line.width}×${line.height} in</td><td>${line.used}</td><td>${line.owned}</td></tr>`;
          })
          .join('');
  const mission = working.mission;
  const missionBits: string[] = [];
  if (mission.objectives.length) {
    missionBits.push(
      `<li>Objectives: ${mission.objectives.map((item) => escapeHtml(item.label)).join(', ')}</li>`,
    );
  }
  if (mission.zones.length) {
    const sides = mission.zones
      .map((zone) => `${zone.side === 'a' ? 'Side A' : 'Side B'} ${zone.width}×${zone.height}`)
      .join(', ');
    missionBits.push(`<li>Deployment: ${escapeHtml(sides)}</li>`);
  }
  if (mission.doors.length) {
    const open = mission.doors.filter((door) => door.open).length;
    missionBits.push(`<li>Doors: ${mission.doors.length} (${open} open, ${mission.doors.length - open} closed)</li>`);
  }
  if (mission.blockers.length) missionBits.push(`<li>Line-of-sight blockers: ${mission.blockers.length}</li>`);
  const warningBlock =
    warnings.length === 0
      ? ''
      : `<p class="print-warn">${warnings.map((warning) => escapeHtml(warning.message)).join(' ')}</p>`;
  return `<article class="print-page">
    <header>
      <p class="print-kicker">Zone Mortalis</p>
      <h1>${escapeHtml(working.name.trim() || 'Untitled layout')}</h1>
      <p>${formatBoardSize(working.board)} · ${working.board.width}×${working.board.height} in · 1 square = 1 inch${mission.visible ? ' · mission layer on' : ''}</p>
    </header>
    <div class="print-board">${svg}</div>
    ${warningBlock}
    <h2>Pull list <span>${pullListTotal(lines)} tiles</span></h2>
    <table>
      <thead><tr><th>Tile</th><th>Size</th><th>Take</th><th>Owned</th></tr></thead>
      <tbody>${pullRows}</tbody>
    </table>
    ${missionBits.length ? `<h2>Mission</h2><ul>${missionBits.join('')}</ul>` : ''}
    <p class="print-foot">Tags in the library: ${['corridor', 'room', 'junction', 'door', 'elevation'].map(tagLabel).join(', ')}. Printed from the local map builder.</p>
  </article>`;
}
