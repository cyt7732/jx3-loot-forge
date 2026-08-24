export type Client = 'std';

export type ItemCategory =
  | 'equipment'
  | 'material'
  | 'recipe'
  | 'consumable'
  | 'currency'
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
  quality?: number;
  qualityMin?: number;
  qualityMax?: number;
  itemLevel?: number;
  itemLevelMin?: number;
  itemLevelMax?: number;
  slot?: string;
  slots?: string[];
  classification?: 'metadata' | 'name-fallback' | 'unknown';
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
