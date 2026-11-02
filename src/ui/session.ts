export type Tab = 'library' | 'board' | 'pack';

export type Tool = 'select' | 'objective' | 'zone-a' | 'zone-b' | 'door' | 'los';

export type Selection =
  | { kind: 'placement'; id: string }
  | { kind: 'objective'; id: string }
  | { kind: 'zone'; id: string }
  | { kind: 'door'; id: string }
  | { kind: 'blocker'; id: string };

export const session = {
  tab: 'board' as Tab,
  tool: 'select' as Tool,
  selection: null as Selection | null,
  fit: true,
  pxPerInch: 12,
};
