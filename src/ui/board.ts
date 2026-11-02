import { renderTileThumbnail } from '../render/art';
import { placementRects, renderBoardSvg } from '../render/svg';
import {
  BOARD_PRESETS,
  boardFromFeet,
  boardWarnings,
  firstOpenSlot,
  formatBoardSize,
  formatInchesAsFeet,
  isBoardSize,
  matchPreset,
  rectFromDrag,
  rotatedSize,
  snapTopLeft,
  warnedIds,
  type BoardWarning,
} from '../core/geometry';
import { canPlace, usageFor } from '../core/inventory';
import { createId } from '../core/ids';
import { escapeHtml } from '../core/text';
import type { TileDefinition } from '../types';
import {
  addBlocker,
  addDoor,
  addObjective,
  addZone,
  deleteBlocker,
  deleteDoor,
  deleteObjective,
  deletePlacement,
  deleteZone,
  getState,
  moveBlocker,
  moveDoor,
  moveObjective,
  movePlacement,
  moveZone,
  placeTile,
  rotateDoor,
  rotatePlacement,
  setBoard,
  setMissionVisible,
  setObjectiveLabel,
  showStatus,
  toggleDoor,
} from '../state/store';
import { requestRefresh } from './refresh';
import { session, type Selection, type Tool } from './session';

let dragging = false;
let zoomHandler: ((factor: number) => void) | null = null;

export function boardIsDragging(): boolean {
  return dragging;
}

export function nudgeZoom(factor: number): void {
  zoomHandler?.(factor);
}

interface MoveDrag {
  kind: 'move';
  pointerId: number;
  selection: Selection;
  group: SVGGElement;
  grabDX: number;
  grabDY: number;
  startClientX: number;
  startClientY: number;
  moved: boolean;
  previewX: number;
  previewY: number;
}

interface TrayDrag {
  kind: 'tray';
  pointerId: number;
  tileId: string;
  startClientX: number;
  startClientY: number;
  mode: 'undecided' | 'scroll' | 'drag';
  ghost: HTMLElement | null;
}

interface RectDrag {
  kind: 'rect';
  pointerId: number;
  tool: 'zone-a' | 'zone-b' | 'los';
  anchorX: number;
  anchorY: number;
  preview: SVGRectElement;
}

type Drag = MoveDrag | TrayDrag | RectDrag;

const TOOL_HELP: Record<Tool, string> = {
  select: 'Drag to move. Tap a placed tile to rotate it.',
  objective: 'Tap the board to drop an objective.',
  'zone-a': 'Drag a rectangle for Side A.',
  'zone-b': 'Drag a rectangle for Side B.',
  door: 'Tap to place a door. Tap a door again to open or close it.',
  los: 'Drag a rectangle that blocks line of sight.',
};

export function refreshBoard(main: HTMLElement): void {
  let view = main.querySelector('.board-view');
  if (!(view instanceof HTMLElement)) {
    main.innerHTML = boardSkeleton();
    view = main.querySelector('.board-view');
    if (view instanceof HTMLElement) bindBoard(view);
  }
  if (view instanceof HTMLElement) paintBoard(view);
}

export function handleBoardKey(event: KeyboardEvent): boolean {
  if (event.key === 'Escape') {
    session.selection = null;
    session.tool = 'select';
    requestRefresh();
    event.preventDefault();
    return true;
  }
  const selection = session.selection;
  if (!selection) return false;
  if (event.key === 'r' || event.key === 'R') {
    if (selection.kind === 'placement') rotatePlacement(selection.id);
    else if (selection.kind === 'door') rotateDoor(selection.id);
    else return false;
    event.preventDefault();
    return true;
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    removeSelection();
    return true;
  }
  const nudgeBy =
    event.key === 'ArrowLeft'
      ? [-1, 0]
      : event.key === 'ArrowRight'
        ? [1, 0]
        : event.key === 'ArrowUp'
          ? [0, -1]
          : event.key === 'ArrowDown'
            ? [0, 1]
            : null;
  if (!nudgeBy) return false;
  event.preventDefault();
  nudge(nudgeBy[0] ?? 0, nudgeBy[1] ?? 0);
  return true;
}

function boardSkeleton(): string {
  return `<section class="board-view">
    <div class="toolbar">
      <div class="segment" role="group" aria-label="Board size">
        <button type="button" data-preset="4x4">4×4 ft</button>
        <button type="button" data-preset="6x4">6×4 ft</button>
      </div>
      <form class="custom-size" data-custom-size>
        <label>W ft <input name="width" inputmode="decimal" aria-label="Width in feet" /></label>
        <label>H ft <input name="height" inputmode="decimal" aria-label="Height in feet" /></label>
        <button type="submit" class="btn">Set</button>
      </form>
      <p class="scale-note">1 square = 1 inch · <span data-size-label></span></p>
      <button type="button" class="btn" data-action="mission-toggle" aria-pressed="false">Mission layer</button>
      <div class="zoom" role="group" aria-label="Zoom">
        <button type="button" data-action="zoom-out" aria-label="Zoom out">−</button>
        <button type="button" data-action="zoom-fit" aria-pressed="true">Fit</button>
        <button type="button" data-action="zoom-in" aria-label="Zoom in">+</button>
      </div>
    </div>
    <div data-warnings></div>
    <p class="hint" data-hint>Drag a tile onto the grid, or tap one to drop it in the first open space. Tap a placed tile to rotate it.</p>
    <div class="board-scroll" data-board-scroll><div data-svg-host></div></div>
    <div class="selection-bar" data-selection hidden></div>
    <div class="mission-tools" data-mission-tools hidden>
      <div class="tool-row" role="group" aria-label="Mission tools">
        <button type="button" data-tool="select">Move</button>
        <button type="button" data-tool="objective">Objective</button>
        <button type="button" data-tool="zone-a">Side A</button>
        <button type="button" data-tool="zone-b">Side B</button>
        <button type="button" data-tool="door">Door</button>
        <button type="button" data-tool="los">LOS block</button>
      </div>
      <p class="tool-help" data-tool-help></p>
    </div>
    <div class="tray-wrap">
      <button type="button" class="tray-scroll" data-action="tray-left" aria-label="Scroll tiles left">‹</button>
      <div class="tray" data-tray></div>
      <button type="button" class="tray-scroll" data-action="tray-right" aria-label="Scroll tiles right">›</button>
    </div>
  </section>`;
}

function bindBoard(view: HTMLElement): void {
  let drag: Drag | null = null;
  let lastFit = 0;
  const scroll = view.querySelector('[data-board-scroll]');
  if (scroll instanceof HTMLElement) {
    const observer = new ResizeObserver(() => {
      if (!view.isConnected) {
        observer.disconnect();
        return;
      }
      if (!session.fit) return;
      const { width, height } = getState().working.board;
      const next = measurePpi(scroll, width, height);
      if (Math.abs(next - lastFit) < 0.5) return;
      lastFit = next;
      paintBoard(view);
    });
    observer.observe(scroll);
  }

  zoomHandler = (factor) => {
    if (!view.isConnected || !(scroll instanceof HTMLElement)) return;
    const { width, height } = getState().working.board;
    const current = measurePpi(scroll, width, height);
    session.fit = false;
    session.pxPerInch = Math.max(4, Math.min(64, current * factor));
    paintBoard(view);
  };

  view.addEventListener('submit', (event) => {
    if (!(event.target instanceof HTMLFormElement)) return;
    if (!event.target.matches('[data-custom-size]')) return;
    event.preventDefault();
    const data = new FormData(event.target);
    const next = boardFromFeet(Number(data.get('width')), Number(data.get('height')));
    if (!isBoardSize(next)) {
      showStatus(next);
      return;
    }
    setBoard(next);
  });

  view.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const button = target.closest('button');
    if (!button || !view.contains(button)) return;
    const action = button.dataset.action;
    const preset = button.dataset.preset;
    if (preset) {
      const match = BOARD_PRESETS.find((item) => item.id === preset);
      if (match) setBoard({ width: match.width, height: match.height });
      return;
    }
    if (button.dataset.tool) {
      session.tool = button.dataset.tool as Tool;
      paintTools(view);
      return;
    }
    if (action === 'mission-toggle') {
      setMissionVisible(!getState().working.mission.visible);
      return;
    }
    if (action === 'zoom-in') zoomHandler?.(1.25);
    if (action === 'zoom-out') zoomHandler?.(0.8);
    if (action === 'zoom-fit') {
      session.fit = true;
      paintBoard(view);
    }
    if (action === 'tray-left' || action === 'tray-right') {
      view.querySelector('[data-tray]')?.scrollBy({ left: action === 'tray-left' ? -180 : 180, behavior: 'smooth' });
    }
    if (action === 'goto-library') {
      session.tab = 'library';
      requestRefresh();
    }
    if (action === 'rotate') {
      const selection = session.selection;
      if (selection?.kind === 'placement') rotatePlacement(selection.id);
      if (selection?.kind === 'door') rotateDoor(selection.id);
    }
    if (action === 'toggle-door' && session.selection?.kind === 'door') toggleDoor(session.selection.id);
    if (action === 'nudge') nudge(Number(button.dataset.dx ?? 0), Number(button.dataset.dy ?? 0));
    if (action === 'delete-selection') removeSelection();
  });

  view.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.dataset.field !== 'objective-label') return;
    if (session.selection?.kind !== 'objective') return;
    setObjectiveLabel(session.selection.id, target.value);
  });

  view.addEventListener('keydown', (event) => {
    const card = event.target instanceof Element ? event.target.closest('[data-tray-tile]') : null;
    if (!card) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    const tileId = card.getAttribute('data-tray-tile');
    if (tileId) placeClean(tileId);
  });

  view.addEventListener('contextmenu', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-placement-id], [data-tray-tile]')) event.preventDefault();
  });

  view.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || dragging) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('button, input, textarea, a') && !target.closest('[data-tray-tile]')) return;
    const card = target.closest('[data-tray-tile]');
    if (card) {
      const tileId = card.getAttribute('data-tray-tile');
      if (!tileId) return;
      const tile = getState().tiles.find((item) => item.id === tileId);
      if (!tile) return;
      const check = canPlace(tile, getState().working.placements);
      if (!check.ok) {
        showStatus(check.reason ?? 'No copies left to place.');
        return;
      }
      event.preventDefault();
      dragging = true;
      drag = {
        kind: 'tray',
        pointerId: event.pointerId,
        tileId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        mode: 'undecided',
        ghost: null,
      };
      capture(view, event.pointerId);
      return;
    }
    if (!target.closest('[data-board-scroll]')) return;
    const svg = view.querySelector('svg');
    if (!(svg instanceof SVGSVGElement)) return;
    const tool: Tool = getState().working.mission.visible ? session.tool : 'select';
    const point = clientToBoard(svg, event.clientX, event.clientY);
    if (!point) return;
    if (tool === 'objective') {
      event.preventDefault();
      const id = createId();
      session.selection = { kind: 'objective', id };
      addObjective(point.x, point.y, id);
      return;
    }
    if (tool === 'door') {
      event.preventDefault();
      const existing = target.closest('[data-door-id]');
      if (existing) {
        const id = existing.getAttribute('data-door-id');
        if (!id) return;
        session.selection = { kind: 'door', id };
        toggleDoor(id);
        return;
      }
      const id = createId();
      session.selection = { kind: 'door', id };
      addDoor(point.x, point.y, id);
      return;
    }
    if (tool === 'zone-a' || tool === 'zone-b' || tool === 'los') {
      event.preventDefault();
      const preview = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      preview.setAttribute('fill', 'rgba(224,177,90,0.28)');
      preview.setAttribute('stroke', '#e0b15a');
      preview.setAttribute('stroke-width', '0.12');
      svg.appendChild(preview);
      drag = { kind: 'rect', pointerId: event.pointerId, tool, anchorX: point.x, anchorY: point.y, preview };
      dragging = true;
      capture(view, event.pointerId);
      return;
    }
    const hit = hitTest(target);
    if (!hit) {
      if (session.selection) {
        session.selection = null;
        paintBoard(view);
      }
      return;
    }
    const origin = originOf(hit);
    const group = target.closest('g');
    if (!origin || !(group instanceof SVGGElement)) return;
    event.preventDefault();
    session.selection = hit;
    paintSelection(view);
    drag = {
      kind: 'move',
      pointerId: event.pointerId,
      selection: hit,
      group,
      grabDX: point.x - origin.x,
      grabDY: point.y - origin.y,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
      previewX: origin.x,
      previewY: origin.y,
    };
    dragging = true;
    capture(view, event.pointerId);
  });

  view.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drag.kind === 'tray') {
      const dx = event.clientX - drag.startClientX;
      const dy = event.clientY - drag.startClientY;
      if (drag.mode === 'undecided') {
        if (Math.hypot(dx, dy) < 8) return;
        if (Math.abs(dx) > Math.abs(dy) && dy < 24) drag.mode = 'scroll';
        else {
          drag.mode = 'drag';
          drag.ghost = makeGhost(drag.tileId);
        }
      }
      if (drag.mode === 'scroll') {
        const tray = view.querySelector('[data-tray]');
        if (tray) tray.scrollLeft -= event.movementX;
        return;
      }
      if (drag.ghost) {
        drag.ghost.style.left = `${event.clientX}px`;
        drag.ghost.style.top = `${event.clientY}px`;
      }
      return;
    }
    if (drag.kind === 'rect') {
      const svg = view.querySelector('svg');
      if (!(svg instanceof SVGSVGElement)) return;
      const point = clientToBoard(svg, event.clientX, event.clientY);
      if (!point) return;
      const x = Math.min(drag.anchorX, point.x);
      const y = Math.min(drag.anchorY, point.y);
      drag.preview.setAttribute('x', String(x));
      drag.preview.setAttribute('y', String(y));
      drag.preview.setAttribute('width', String(Math.abs(point.x - drag.anchorX)));
      drag.preview.setAttribute('height', String(Math.abs(point.y - drag.anchorY)));
      return;
    }
    if (Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) < 8) return;
    drag.moved = true;
    const svg = view.querySelector('svg');
    if (!(svg instanceof SVGSVGElement)) return;
    const point = clientToBoard(svg, event.clientX, event.clientY);
    if (!point) return;
    const next = snapTopLeft(point.x - drag.grabDX, point.y - drag.grabDY);
    drag.previewX = next.x;
    drag.previewY = next.y;
    drag.group.setAttribute('transform', `translate(${next.x} ${next.y})`);
  });

  const finish = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const current = drag;
    drag = null;
    dragging = false;
    if (current.kind === 'tray') {
      current.ghost?.remove();
      const svg = view.querySelector('svg');
      if (current.mode === 'undecided') {
        placeClean(current.tileId);
        return;
      }
      if (current.mode === 'drag' && svg instanceof SVGSVGElement && overSvg(svg, event.clientX, event.clientY)) {
        dropNew(current.tileId, svg, event.clientX, event.clientY);
      }
      return;
    }
    if (current.kind === 'rect') {
      const width = Number(current.preview.getAttribute('width'));
      const height = Number(current.preview.getAttribute('height'));
      const x = Number(current.preview.getAttribute('x'));
      const y = Number(current.preview.getAttribute('y'));
      current.preview.remove();
      const dragged = Number.isFinite(width) && width > 0.75 && Number.isFinite(height) && height > 0.75;
      const size = current.tool === 'los' ? 4 : 8;
      const snapped = dragged
        ? rectFromDrag(x, y, x + width, y + height)
        : rectFromDrag(current.anchorX, current.anchorY, current.anchorX + size, current.anchorY + size);
      const id = createId();
      if (current.tool === 'los') {
        session.selection = { kind: 'blocker', id };
        addBlocker(snapped, id);
      } else {
        session.selection = { kind: 'zone', id };
        addZone(current.tool === 'zone-a' ? 'a' : 'b', snapped, id);
      }
      return;
    }
    if (!current.moved && current.selection.kind === 'placement') {
      rotatePlacement(current.selection.id);
      return;
    }
    if (current.moved) commitMove(current);
  };
  view.addEventListener('pointerup', finish);
  view.addEventListener('pointercancel', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drag.kind === 'tray') drag.ghost?.remove();
    if (drag.kind === 'rect') drag.preview.remove();
    if (drag.kind === 'move') {
      const origin = originOf(drag.selection);
      if (origin) drag.group.setAttribute('transform', `translate(${origin.x} ${origin.y})`);
    }
    drag = null;
    dragging = false;
  });
}

function paintBoard(view: HTMLElement): void {
  if (!view.isConnected || dragging) return;
  const state = getState();
  pruneSelection(state);
  const scroll = view.querySelector('[data-board-scroll]');
  const board = state.working.board;
  const ppi = scroll instanceof HTMLElement ? measurePpi(scroll, board.width, board.height) : session.pxPerInch;
  const boxes = placementRects(state.tiles, state.working.placements);
  const warnings = boardWarnings(boxes, board);
  const host = view.querySelector('[data-svg-host]');
  const scrollLeft = scroll instanceof HTMLElement ? scroll.scrollLeft : 0;
  const scrollTop = scroll instanceof HTMLElement ? scroll.scrollTop : 0;
  if (host) {
    host.innerHTML = renderBoardSvg({
      name: state.working.name.trim() || 'Untitled layout',
      board,
      tiles: state.tiles,
      photoUrls: state.photoUrls,
      placements: state.working.placements,
      mission: state.working.mission,
      options: {
        showMission: state.working.mission.visible,
        minorGrid: true,
        theme: 'screen',
        pixelsPerInch: ppi,
        selectedId: session.selection?.kind === 'placement' ? session.selection.id : null,
        warnedIds: warnedIds(warnings),
      },
    });
  }
  if (scroll instanceof HTMLElement) {
    scroll.scrollLeft = scrollLeft;
    scroll.scrollTop = scrollTop;
  }
  const preset = matchPreset(board);
  view.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((button) => {
    button.setAttribute('aria-pressed', button.dataset.preset === preset ? 'true' : 'false');
  });
  const widthInput = view.querySelector('input[name="width"]');
  const heightInput = view.querySelector('input[name="height"]');
  if (widthInput instanceof HTMLInputElement && document.activeElement !== widthInput) {
    widthInput.value = formatInchesAsFeet(board.width);
  }
  if (heightInput instanceof HTMLInputElement && document.activeElement !== heightInput) {
    heightInput.value = formatInchesAsFeet(board.height);
  }
  const sizeLabel = view.querySelector('[data-size-label]');
  if (sizeLabel) sizeLabel.textContent = `${formatBoardSize(board)} · ${board.width}×${board.height} in`;
  const missionButton = view.querySelector('[data-action="mission-toggle"]');
  if (missionButton) missionButton.setAttribute('aria-pressed', state.working.mission.visible ? 'true' : 'false');
  const fitButton = view.querySelector('[data-action="zoom-fit"]');
  if (fitButton) fitButton.setAttribute('aria-pressed', session.fit ? 'true' : 'false');
  const warningsHost = view.querySelector('[data-warnings]');
  if (warningsHost) warningsHost.innerHTML = warningsMarkup(warnings);
  const hint = view.querySelector('[data-hint]');
  if (hint instanceof HTMLElement) hint.hidden = state.working.placements.length > 0;
  paintTools(view);
  paintSelection(view);
  paintTray(view);
}

function paintTools(view: HTMLElement): void {
  const tools = view.querySelector('[data-mission-tools]');
  if (!(tools instanceof HTMLElement)) return;
  const visible = getState().working.mission.visible;
  tools.hidden = !visible;
  const scroll = view.querySelector('[data-board-scroll]');
  if (scroll instanceof HTMLElement) scroll.style.touchAction = visible && session.tool !== 'select' ? 'none' : '';
  tools.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => {
    button.setAttribute('aria-pressed', button.dataset.tool === session.tool ? 'true' : 'false');
  });
  const help = view.querySelector('[data-tool-help]');
  if (help) help.textContent = TOOL_HELP[session.tool];
}

function paintSelection(view: HTMLElement): void {
  const bar = view.querySelector('[data-selection]');
  if (!(bar instanceof HTMLElement)) return;
  const active = document.activeElement;
  if (active instanceof HTMLInputElement && bar.contains(active)) return;
  const selection = session.selection;
  if (!selection) {
    bar.hidden = true;
    bar.innerHTML = '';
    return;
  }
  const state = getState();
  bar.hidden = false;
  bar.innerHTML = selectionMarkup(selection, state);
}

function paintTray(view: HTMLElement): void {
  const tray = view.querySelector('[data-tray]');
  if (!(tray instanceof HTMLElement)) return;
  const left = tray.scrollLeft;
  const state = getState();
  if (state.tiles.length === 0) {
    tray.innerHTML = `<p class="empty-inline">No tiles yet. <button type="button" class="btn" data-action="goto-library">Open the library</button></p>`;
    return;
  }
  const cards = state.tiles
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id))
    .map((tile) => trayCard(tile, state.photoUrls, state.working.placements));
  tray.innerHTML = cards.join('');
  tray.scrollLeft = left;
}

function trayCard(tile: TileDefinition, photoUrls: Record<string, string>, placements: { tileId: string }[]): string {
  const usage = usageFor(tile, placements);
  const blocked = !canPlace(tile, placements).ok;
  const tone = usage.overAllocated ? 'over' : usage.remaining <= 0 ? 'full' : 'ok';
  const photo = tile.photoId ? (photoUrls[tile.photoId] ?? null) : null;
  return `<div class="tray-card${blocked ? ' is-blocked' : ''}" data-tray-tile="${escapeHtml(tile.id)}" tabindex="0" role="button" aria-label="${escapeHtml(tile.name)}, ${usage.used} of ${usage.owned} on the board. Tap to place or drag onto the grid.">
    ${renderTileThumbnail(tile, photo)}
    <span class="tray-name">${escapeHtml(tile.name)}</span>
    <span class="usage ${tone}">${usage.used}/${usage.owned}</span>
  </div>`;
}

function selectionMarkup(selection: Selection, state: ReturnType<typeof getState>): string {
  const nudges = `
    <button type="button" class="btn" data-action="nudge" data-dx="-1" data-dy="0" aria-label="Nudge left">←</button>
    <button type="button" class="btn" data-action="nudge" data-dx="1" data-dy="0" aria-label="Nudge right">→</button>
    <button type="button" class="btn" data-action="nudge" data-dx="0" data-dy="-1" aria-label="Nudge up">↑</button>
    <button type="button" class="btn" data-action="nudge" data-dx="0" data-dy="1" aria-label="Nudge down">↓</button>
    <button type="button" class="btn danger" data-action="delete-selection">Remove</button>`;
  if (selection.kind === 'placement') {
    const placement = state.working.placements.find((item) => item.id === selection.id);
    const tile = state.tiles.find((item) => item.id === placement?.tileId);
    const usage = tile ? usageFor(tile, state.working.placements) : null;
    const name = tile?.name ?? 'Missing tile';
    const count = usage ? ` · ${usage.used}/${usage.owned}` : '';
    return `<p class="selection-label">${escapeHtml(name)}${count}</p><div class="selection-actions"><button type="button" class="btn" data-action="rotate">Rotate</button>${nudges}</div>`;
  }
  if (selection.kind === 'objective') {
    const objective = state.working.mission.objectives.find((item) => item.id === selection.id);
    return `<label class="selection-label">Objective <input data-field="objective-label" maxlength="24" value="${escapeHtml(objective?.label ?? '')}" /></label><div class="selection-actions">${nudges}</div>`;
  }
  if (selection.kind === 'zone') {
    const zone = state.working.mission.zones.find((item) => item.id === selection.id);
    const name = zone?.side === 'b' ? 'Side B' : 'Side A';
    return `<p class="selection-label">${name}</p><div class="selection-actions">${nudges}</div>`;
  }
  if (selection.kind === 'door') {
    const door = state.working.mission.doors.find((item) => item.id === selection.id);
    const label = door?.open ? 'Open' : 'Closed';
    return `<p class="selection-label">Door · ${label}</p><div class="selection-actions"><button type="button" class="btn" data-action="toggle-door">${door?.open ? 'Mark closed' : 'Mark open'}</button><button type="button" class="btn" data-action="rotate">Rotate</button>${nudges}</div>`;
  }
  return `<p class="selection-label">LOS blocker</p><div class="selection-actions">${nudges}</div>`;
}

function warningsMarkup(warnings: BoardWarning[]): string {
  if (warnings.length === 0) return '';
  const overlaps = warnings.filter((warning) => warning.type === 'overlap').length;
  const off = warnings.filter((warning) => warning.type === 'out-of-bounds').length;
  const parts: string[] = [];
  if (off) parts.push(`${off} off the board`);
  if (overlaps) parts.push(`${overlaps} overlap${overlaps === 1 ? '' : 's'}`);
  const items = warnings.map((warning) => `<li>${escapeHtml(warning.message)}</li>`).join('');
  return `<details class="warnings"><summary>${parts.join(', ')}</summary><ul>${items}</ul></details>`;
}

function measurePpi(scroll: HTMLElement, boardWidth: number, boardHeight: number): number {
  if (!session.fit) return session.pxPerInch;
  const width = Math.max(80, scroll.clientWidth - 8);
  const height = Math.max(80, scroll.clientHeight - 8);
  const byWidth = width / Math.max(boardWidth, 1);
  const byHeight = height / Math.max(boardHeight, 1);
  return Math.max(2, Math.min(64, Math.min(byWidth, byHeight)));
}

function pruneSelection(state: ReturnType<typeof getState>): void {
  const selection = session.selection;
  if (!selection) return;
  const mission = state.working.mission;
  const exists =
    (selection.kind === 'placement' && state.working.placements.some((item) => item.id === selection.id)) ||
    (selection.kind === 'objective' && mission.objectives.some((item) => item.id === selection.id)) ||
    (selection.kind === 'zone' && mission.zones.some((item) => item.id === selection.id)) ||
    (selection.kind === 'door' && mission.doors.some((item) => item.id === selection.id)) ||
    (selection.kind === 'blocker' && mission.blockers.some((item) => item.id === selection.id));
  if (!exists) session.selection = null;
}

function hitTest(target: Element): Selection | null {
  const objective = target.closest('[data-objective-id]');
  if (objective) return { kind: 'objective', id: objective.getAttribute('data-objective-id') ?? '' };
  const door = target.closest('[data-door-id]');
  if (door) return { kind: 'door', id: door.getAttribute('data-door-id') ?? '' };
  const blocker = target.closest('[data-blocker-id]');
  if (blocker) return { kind: 'blocker', id: blocker.getAttribute('data-blocker-id') ?? '' };
  const placement = target.closest('[data-placement-id]');
  if (placement) return { kind: 'placement', id: placement.getAttribute('data-placement-id') ?? '' };
  const zone = target.closest('[data-zone-id]');
  if (zone) return { kind: 'zone', id: zone.getAttribute('data-zone-id') ?? '' };
  return null;
}

function originOf(selection: Selection): { x: number; y: number } | null {
  const working = getState().working;
  if (selection.kind === 'placement') {
    const item = working.placements.find((entry) => entry.id === selection.id);
    return item ? { x: item.x, y: item.y } : null;
  }
  if (selection.kind === 'objective') {
    const item = working.mission.objectives.find((entry) => entry.id === selection.id);
    return item ? { x: item.x, y: item.y } : null;
  }
  if (selection.kind === 'zone') {
    const item = working.mission.zones.find((entry) => entry.id === selection.id);
    return item ? { x: item.x, y: item.y } : null;
  }
  if (selection.kind === 'door') {
    const item = working.mission.doors.find((entry) => entry.id === selection.id);
    return item ? { x: item.x, y: item.y } : null;
  }
  const blocker = working.mission.blockers.find((entry) => entry.id === selection.id);
  return blocker ? { x: blocker.x, y: blocker.y } : null;
}

function nudge(dx: number, dy: number): void {
  const selection = session.selection;
  if (!selection) return;
  const origin = originOf(selection);
  if (!origin) return;
  const x = origin.x + dx;
  const y = origin.y + dy;
  if (selection.kind === 'placement') movePlacement(selection.id, x, y);
  else if (selection.kind === 'objective') moveObjective(selection.id, x, y);
  else if (selection.kind === 'zone') moveZone(selection.id, x, y);
  else if (selection.kind === 'door') moveDoor(selection.id, x, y);
  else moveBlocker(selection.id, x, y);
}

function removeSelection(): void {
  const selection = session.selection;
  if (!selection) return;
  session.selection = null;
  if (selection.kind === 'placement') deletePlacement(selection.id);
  else if (selection.kind === 'objective') deleteObjective(selection.id);
  else if (selection.kind === 'zone') deleteZone(selection.id);
  else if (selection.kind === 'door') deleteDoor(selection.id);
  else deleteBlocker(selection.id);
}

function commitMove(drag: MoveDrag): void {
  const selection = drag.selection;
  if (selection.kind === 'placement') movePlacement(selection.id, drag.previewX, drag.previewY);
  else if (selection.kind === 'objective') moveObjective(selection.id, drag.previewX, drag.previewY);
  else if (selection.kind === 'zone') moveZone(selection.id, drag.previewX, drag.previewY);
  else if (selection.kind === 'door') moveDoor(selection.id, drag.previewX, drag.previewY);
  else moveBlocker(selection.id, drag.previewX, drag.previewY);
}

function placeClean(tileId: string): void {
  const state = getState();
  const tile = state.tiles.find((item) => item.id === tileId);
  if (!tile) return;
  const check = canPlace(tile, state.working.placements);
  if (!check.ok) {
    showStatus(check.reason ?? 'No copies left to place.');
    return;
  }
  const occupied = placementRects(state.tiles, state.working.placements).map((box) => box.rect);
  const slot = firstOpenSlot(tile.width, tile.height, 0, occupied, state.working.board);
  if (!slot) {
    showStatus('No open space. Drag the tile onto the board instead.');
    return;
  }
  const id = createId();
  session.selection = { kind: 'placement', id };
  const result = placeTile(tileId, slot.x, slot.y, id);
  if (!result.ok) {
    session.selection = null;
    showStatus(result.reason);
  }
}

function dropNew(tileId: string, svg: SVGSVGElement, clientX: number, clientY: number): void {
  const tile = getState().tiles.find((item) => item.id === tileId);
  const point = clientToBoard(svg, clientX, clientY);
  if (!tile || !point) return;
  const size = rotatedSize(tile.width, tile.height, 0);
  const origin = snapTopLeft(point.x - size.width / 2, point.y - size.height / 2);
  const id = createId();
  session.selection = { kind: 'placement', id };
  const result = placeTile(tile.id, origin.x, origin.y, id);
  if (!result.ok) {
    session.selection = null;
    showStatus(result.reason);
  }
}

function makeGhost(tileId: string): HTMLElement | null {
  const tile = getState().tiles.find((item) => item.id === tileId);
  if (!tile) return null;
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.textContent = tile.name;
  const scroll = document.querySelector('[data-board-scroll]');
  const board = getState().working.board;
  const ppi = scroll instanceof HTMLElement ? measurePpi(scroll, board.width, board.height) : 10;
  ghost.style.width = `${Math.max(56, tile.width * ppi)}px`;
  ghost.style.height = `${Math.max(44, tile.height * ppi)}px`;
  document.body.appendChild(ghost);
  return ghost;
}

function clientToBoard(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } | null {
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const local = point.matrixTransform(matrix.inverse());
  return { x: local.x, y: local.y };
}

function overSvg(svg: SVGSVGElement, clientX: number, clientY: number): boolean {
  const rect = svg.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function capture(view: HTMLElement, pointerId: number): void {
  try {
    view.setPointerCapture(pointerId);
  } catch {
    // The pointer can already be gone on a very fast tap.
  }
}
