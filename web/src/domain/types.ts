export type Client = 'std';

export type ItemCategory =
  | 'equipment'
  | 'equipmentExchange'
  | 'material'
  | 'specialDrop'
  | 'recipe'
  | 'furniture'
  | 'smallIron'
  | 'bigIron'
  | 'smallEnchant'
  | 'bigEnchant'
  | 'consumable'
  | 'task'
  | 'currency'
  | 'pet'
  | 'other'
  | 'unknown';

export type StateField = 'skipLoot' | 'autoSell' | 'protect';
export type RuleDirective = 'unchanged' | 'enable' | 'disable';

export type ItemState = {
  skipLoot: boolean;
  autoSell: boolean;
  protect: boolean;
};

export type CatalogSource = {
  mapId: number;
  mapName: string;
  expansion: string;
  difficulty: string;
  bossName: string;
};

export type CatalogItem = {
  id: string;
  name: string;
  category: ItemCategory;
  subtype?: string;
  typeLabels?: string[];
  quality?: number;
  qualityMin?: number;
  qualityMax?: number;
  itemLevel?: number;
  itemLevelMin?: number;
  itemLevelMax?: number;
  slot?: string;
  slots?: string[];
  classification?: 'metadata' | 'name-fallback' | 'type-label' | 'type-label-other-rule' | 'type-label-missing-fallback' | 'unknown';
  sources: CatalogSource[];
};

export type CatalogMap = {
  mapId: number;
  name: string;
  expansion: string;
  difficulty: string;
  bossNames: string[];
  itemIds: string[];
};

export type CatalogLevelGroupId =
  | 'lv-130'
  | 'lv-120'
  | 'lv-110'
  | 'lv-100'
  | 'lv-95'
  | 'lv-90'
  | 'lv-80'
  | 'lv-70'
  | 'unknown';

export type CatalogLevelGroup = {
  id: CatalogLevelGroupId;
  level: number | null;
  name: string;
  title: string;
  label: string;
  expansions: readonly string[];
};

export type CatalogDifficultyGroupId =
  | 'five'
  | '10-normal'
  | '10-hero'
  | '10-challenge'
  | '25-normal'
  | '25-hero'
  | '25-challenge'
  | 'other';

export type CatalogDifficultyGroup = {
  id: CatalogDifficultyGroupId;
  name: string;
  label: string;
  difficulties: readonly string[];
};

export type CatalogSnapshot = {
  schemaVersion: 1;
  client: Client;
  catalogVersion: string;
  generatedAt: string;
  contentHash: string;
  source: string;
  stats: {
    maps: number;
    bosses: number;
    drops: number;
    uniqueItems: number;
  };
  completeness?: {
    status: 'complete' | 'partial';
    expectedMapCount: number;
    fetchedMapCount: number;
    metadataMissing: number;
    metadataMismatch: number;
    failures: string[];
  };
  maps: CatalogMap[];
  items: CatalogItem[];
};

export type CustomItem = {
  id: string;
  name: string;
  createdAt: string;
};

export type FavoriteScope = {
  id: string;
  name: string;
  mapIds: number[];
  bossKeys?: string[];
};

export type WorkspaceFilters = {
  query: string;
  categories: ItemCategory[];
  qualities: number[];
  slots: string[];
  itemLevelMin: number | null;
  itemLevelMax: number | null;
  stateView: 'all' | 'configured' | 'unconfigured' | 'protected';
};

export type WorkspaceV1 = {
  schemaVersion: 1;
  appVersion: string;
  catalogVersion: string;
  initializedAt: string;
  updatedAt: string;
  itemStates: Array<[string, ItemState]>;
  customItems: CustomItem[];
  customOverrides: string[];
  selectedMapIds: number[];
  selectedBossKeys: string[];
  expandedGroups: string[];
  favoriteScopes: FavoriteScope[];
  filters: WorkspaceFilters;
  ui: {
    bulkPanelOpen: boolean;
    sidebarCollapsed: boolean;
  };
};

export type Workspace = WorkspaceV1;

export type BulkRuleSet = Record<ItemCategory, Record<StateField, RuleDirective>>;

export type StateChange = {
  id: string;
  name: string;
  before: ItemState;
  after: ItemState;
  reasons: string[];
};

export type BulkPreview = {
  changes: StateChange[];
  excludedCustom: number;
  conflictsResolved: number;
};

export type ImportMode = 'merge' | 'replace';

export type ParsedManagedConfig = {
  declared: Set<StateField>;
  skipLoot: string[];
  autoSell: string[];
  protect: string[];
  ignoredFields: string[];
};

export type ImportPreview = {
  mode: ImportMode;
  changes: StateChange[];
  unknownNames: string[];
  declared: StateField[];
  conflictsResolved: number;
};
