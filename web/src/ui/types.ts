import type {
  CatalogDifficultyGroup,
  CatalogItem,
  CatalogLevelGroup,
  CatalogMap,
  ImportMode,
  ImportPreview,
  ItemCategory,
  ParsedManagedConfig,
} from '../domain/types';

export type ThemeMode = 'light' | 'dark';

export type ViewItem = CatalogItem & {
  isCustom: boolean;
  customOverride: boolean;
  systemSeed: boolean;
  historical: boolean;
};

export type ImportDraft = {
  filename: string;
  parsed: ParsedManagedConfig;
  mode: ImportMode;
  preview: ImportPreview;
};

export type DialogName = 'custom' | 'workspace' | 'import' | 'emptyExportWarning' | 'changelog' | null;

export type Toast = { tone: 'success' | 'warning' | 'error'; message: string; id?: number } | null;

export type ItemDisposition = 'none' | 'autoSell' | 'protect';

export type FocusedScope =
  | { type: 'all' }
  | { type: 'custom' }
  | { type: 'level'; id: string; name: string; era?: string; eraName?: string; level: number | null; mapIds: number[] }
  | { type: 'difficulty'; levelName: string; label: string; mapIds: number[] }
  | { type: 'map'; mapId: number; name: string; difficulty: string; levelName?: string }
  | { type: 'boss'; mapId: number; mapName: string; bossName: string; levelName?: string };

/** 侧栏副本树使用的年代分组视图（含难度子分组） */
export type ScopeLevelGroup = CatalogLevelGroup & {
  maps: CatalogMap[];
  difficultyGroups: Array<CatalogDifficultyGroup & { maps: CatalogMap[] }>;
  levelMatches: boolean;
};

/** 分类策略直选表中每一行分类的统计摘要 */
export type CategorySummary = {
  category: ItemCategory;
  total: number;
  skipLootCount: number;
  autoSellCount: number;
  protectCount: number;
  noneCount: number;
};

export type DrawerStateView = 'all' | 'configured' | 'unconfigured' | 'protected';

export type ExportKind = 'combined' | 'pickup' | 'sell';
