export const TILE_TAGS = ['corridor', 'room', 'junction', 'door', 'elevation'] as const;

export type TileTag = (typeof TILE_TAGS)[number];

export type TileKind = 'stock' | 'unique';

/** Clockwise quarter turns. 0 keeps the tile's stored width × height. */
export type Rotation = 0 | 90 | 180 | 270;

export type Side = 'a' | 'b';

export interface TileDefinition {
  id: string;
  name: string;
  kind: TileKind;
  /** Footprint in grid squares. One square is one inch. */
  width: number;
  height: number;
  quantity: number;
  tags: TileTag[];
  /** Maker or source. Required for unique tiles. */
  maker: string;
  photoId: string | null;
  updatedAt: number;
}

export interface PlacedTile {
  id: string;
  tileId: string;
  /** Top-left grid square after snapping. */
  x: number;
  y: number;
  rotation: Rotation;
}

export interface ObjectiveMarker {
  id: string;
  /** Cell whose center holds the marker. */
  x: number;
  y: number;
  label: string;
}

export interface DeploymentZone {
  id: string;
  side: Side;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DoorMarker {
  id: string;
  x: number;
  y: number;
  rotation: Rotation;
  /** Length in grid squares along the door's axis. */
  span: number;
  open: boolean;
}

export interface LosBlocker {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MissionState {
  visible: boolean;
  objectives: ObjectiveMarker[];
  zones: DeploymentZone[];
  doors: DoorMarker[];
  blockers: LosBlocker[];
}

export interface BoardSize {
  /** Table size in inches. Grid squares are 1 inch. */
  width: number;
  height: number;
}

export interface LayoutData {
  id: string;
  name: string;
  board: BoardSize;
  placements: PlacedTile[];
  mission: MissionState;
  updatedAt: number;
}

/** The board currently being edited. Persisted locally, separate from named saves. */
export interface WorkingLayout {
  /** Named layout this board was loaded from, if any. */
  sourceId: string | null;
  name: string;
  board: BoardSize;
  placements: PlacedTile[];
  mission: MissionState;
  /** True when the board differs from the named layout it was loaded from. */
  dirty: boolean;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
