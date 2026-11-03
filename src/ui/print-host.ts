import { renderPrintHtml } from '../render/print';
import { getState } from '../state/store';

export function updatePrintSheet(): void {
  const root = document.getElementById('print-sheet');
  if (!root || !getState().loaded) return;
  root.innerHTML = renderPrintHtml(getState());
}
