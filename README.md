# Zone Mortalis Map Builder

A local, phone-friendly planner for Horus Heresy Zone Mortalis games. Track the tiles your group owns, drag them onto a gridded table, mark the mission, and print a pull list. Everything stays in this browser. There is no account and no server.

One grid square is one inch. Board presets are a 4×4 ft table (48×48 in) and a 6×4 ft table (72×48 in). A custom size is set in feet.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). On a phone, use the same URL on your Wi-Fi, or just resize the desktop window.

```bash
npm test
npm run build
```

`npm test` runs the unit tests once. `npm run build` typechecks and writes a static site to `dist/`. Hosting that folder is intentionally out of scope.

## Using it

The app has three tabs.

**Library.** Add, edit, or delete tiles. Each tile has a name, a footprint in grid squares, how many the group owns, and any of these tags: corridor, room, junction, door, elevation. A tile is either stock or unique.

- Stock tiles can have an overhead photo. Without one, the board draws an outline from the tags.
- Unique tiles cannot be saved until they have an overhead photo and a maker or source. The photo is what gets drawn on the board, fitted inside the footprint.

**Board.** Drag a tile from the tray onto the grid, or tap it to drop it in the first open space. Tap a placed tile to rotate it 90 degrees. The selection bar also rotates, nudges, and removes the selected piece. The tray shows `used/owned`. You cannot place more copies than the group owns. Tiles that hang off the table or overlap another tile stay where you put them and are listed as warnings.

Turn on **Mission layer** to mark the mission without using up tiles:

- Objectives, numbered as you drop them. Rename the selected one.
- Deployment rectangles for Side A and Side B.
- Doors you can toggle open or closed, and rotate.
- Line-of-sight blockers.

**Pack.** Name the board in the header, then save it. Saved layouts can be loaded, renamed, or deleted. The working board is also written to this browser as you edit, so a refresh keeps it. Pack includes:

- A pull list: each tile on the board and how many to take, next to how many you own.
- PNG export of the board (mission layer included when it is visible).
- A print view. Use the browser’s print dialog and choose Save as PDF.
- JSON export and import of the library (photos included) and saved layouts. Import matches items by id, so a later import updates those records instead of duplicating them.

Door *tiles* in the library are physical pieces you own. Mission doors are marks on the overlay. They are not the same thing.

Photos are resized before they are stored. The practical cap is 8 MB per chosen file.

## MVP

- Tile library with stock and unique tiles, footprints, owned quantity, tags, and overhead photos.
- Board presets (4×4 ft, 6×4 ft) and a custom size, with a 1 inch snap grid.
- Drag from the library tray, tap-to-rotate, delete, and a used/owned counter that blocks extra copies.
- Out-of-bounds and overlap warnings.
- Toggleable mission overlay: objectives, two deployment sides, doors with an open/closed toggle, and LOS blockers.
- Named layouts stored locally (list, load, rename, delete).
- PNG export, a print-friendly view for PDF, a pull list, and JSON import/export of the library and layouts.

## Data

The library, photos, saved layouts, and the board you are editing live in IndexedDB in this browser (`zone-mortalis-map-builder`). Nothing is uploaded. Export JSON if you want a copy on another device. Clearing site data deletes the library.

## Tests

Unit tests cover inventory limits, unique-tile photo validation, grid snapping and rotation, pull lists, JSON import checks, and the board SVG. They do not drive the browser.

## Roadmap

- Read-only share links. That needs somewhere to host a layout, which this app deliberately does not do.
- A random layout generator that uses only tiles the group owns.

## Project layout

- `src/core` — inventory, validation, snapping, rotation, pull list, and the JSON format. No DOM.
- `src/persistence` — IndexedDB, photo blobs, and downloads.
- `src/render` — SVG board, print sheet, and PNG export.
- `src/state` — the in-memory store that writes through to IndexedDB.
- `src/ui` — library, board, and pack screens.
- `tests` — Vitest unit tests.
