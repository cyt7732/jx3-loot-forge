import {
  APP_VERSION,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  DEFAULT_FILTERS,
  DEFAULT_PROTECTED_ITEMS,
  DEFAULT_SELL_ITEMS,
  EMPTY_ITEM_STATE,
} from './constants';
import type {
  BatchActionType,
  BulkPreview,
  BulkRuleSet,
  CatalogItem,
  CustomItem,
  ItemCategory,
  ItemState,
  RuleDirective,
  StateChange,
  StateField,
  Workspace,
} from './types';

export function normalizeItemName(name: string): string {
  return name.normalize('NFC');
}

export function cloneState(state: ItemState | undefined): ItemState {
  return state ? { ...state } : { ...EMPTY_ITEM_STATE };
}

export function assertValidState(state: ItemState): void {
  if (typeof state.skipLoot !== 'boolean' || typeof state.autoSell !== 'boolean' || typeof state.protect !== 'boolean') {
    throw new Error('物品状态格式无效。');
  }
  if (state.autoSell && state.protect) {
    throw new Error('“自动出售”和“保护不出售”不能同时开启。');
  }
}

export function setStateField(state: ItemState, field: StateField, enabled: boolean): ItemState {
  const next = { ...state, [field]: enabled };
  if (field === 'autoSell' && enabled) next.protect = false;
  if (field === 'protect' && enabled) next.autoSell = false;
  assertValidState(next);
  return next;
}

export function createInitialWorkspace(catalogVersion: string, now = new Date()): Workspace {
  const timestamp = now.toISOString();
  const stateMap = new Map<string, ItemState>();

  // 1. 21 项默认推荐保护物品
  for (const name of DEFAULT_PROTECTED_ITEMS) {
    stateMap.set(normalizeItemName(name), { skipLoot: false, autoSell: false, protect: true });
  }

  // 2. 19 项插件默认自动出售物品
  for (const name of DEFAULT_SELL_ITEMS) {
    const key = normalizeItemName(name);
    const existing = stateMap.get(key) ?? { skipLoot: false, autoSell: false, protect: false };
    stateMap.set(key, { ...existing, autoSell: true, protect: false });
  }

  const itemStates: Array<[string, ItemState]> = Array.from(stateMap.entries());

  // 3. 将默认保护和默认出售物品注册到用户自定义物品库中，确保在前端界面直观展示与自由管理
  const customItems: CustomItem[] = [
    ...DEFAULT_PROTECTED_ITEMS.map((name) => ({
      id: normalizeItemName(name),
      name,
      category: 'specialDrop' as ItemCategory,
      note: '插件推荐保护',
      createdAt: timestamp,
    })),
    ...DEFAULT_SELL_ITEMS.map((name) => ({
      id: normalizeItemName(name),
      name,
      category: 'other' as ItemCategory,
      note: '插件默认出售',
      createdAt: timestamp,
    })),
  ];

  const customOverrides = customItems.map((item) => item.id);

  return {
    schemaVersion: 1,
    appVersion: APP_VERSION,
    catalogVersion,
    initializedAt: timestamp,
    updatedAt: timestamp,
    itemStates,
    customItems,
    customOverrides,
    selectedMapIds: [],
    selectedBossKeys: [],
    expandedGroups: [],
    favoriteScopes: [],
    filters: { ...DEFAULT_FILTERS },
    ui: { bulkPanelOpen: true, sidebarCollapsed: false },
  };
}

export function stateMapFromWorkspace(workspace: Workspace): Map<string, ItemState> {
  const map = new Map<string, ItemState>();
  for (const [id, state] of workspace.itemStates) {
    const normalized = normalizeItemName(id);
    const cloned = cloneState(state);
    assertValidState(cloned);
    map.set(normalized, cloned);
  }
  return map;
}

export function workspaceWithStateMap(workspace: Workspace, map: Map<string, ItemState>): Workspace {
  const itemStates = [...map.entries()]
    .filter(([, state]) => state.skipLoot || state.autoSell || state.protect)
    .sort(([a], [b]) => compareCodePoints(a, b))
    .map(([id, state]) => [id, cloneState(state)] as [string, ItemState]);
  return { ...workspace, itemStates, updatedAt: new Date().toISOString() };
}

export function removeCustomItemFromWorkspace(workspace: Workspace, id: string): Workspace {
  const normalizedId = normalizeItemName(id);
  const nextMap = stateMapFromWorkspace(workspace);
  nextMap.delete(normalizedId);
  return {
    ...workspaceWithStateMap(workspace, nextMap),
    customItems: workspace.customItems.filter((item) => item.id !== normalizedId),
    customOverrides: workspace.customOverrides.filter((value) => value !== normalizedId),
    updatedAt: new Date().toISOString(),
  };
}

export function compareCodePoints(a: string, b: string): number {
  const aPoints = [...a].map((value) => value.codePointAt(0) ?? 0);
  const bPoints = [...b].map((value) => value.codePointAt(0) ?? 0);
  const length = Math.min(aPoints.length, bPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (aPoints[index] !== bPoints[index]) return aPoints[index] - bPoints[index];
  }
  return aPoints.length - bPoints.length;
}

export function createEmptyBulkRules(): BulkRuleSet {
  return Object.fromEntries(CATEGORY_ORDER.map((category) => [category, {
    skipLoot: 'unchanged',
    autoSell: 'unchanged',
    protect: 'unchanged',
  }])) as BulkRuleSet;
}

export function createCategoryActionRules(category: ItemCategory | 'all', action: BatchActionType): BulkRuleSet {
  const rules = createEmptyBulkRules();
  const targetCategories = category === 'all' ? CATEGORY_ORDER : [category];
  for (const cat of targetCategories) {
    if (action === 'autoSell') {
      rules[cat].autoSell = 'enable';
      rules[cat].protect = 'disable';
    } else if (action === 'protect') {
      rules[cat].autoSell = 'disable';
      rules[cat].protect = 'enable';
    } else if (action === 'none') {
      rules[cat].autoSell = 'disable';
      rules[cat].protect = 'disable';
    } else if (action === 'skipLoot') {
      rules[cat].skipLoot = 'enable';
    } else if (action === 'unskipLoot') {
      rules[cat].skipLoot = 'disable';
    } else if (action === 'clearAll') {
      rules[cat].autoSell = 'disable';
      rules[cat].protect = 'disable';
      rules[cat].skipLoot = 'disable';
    }
  }
  return rules;
}

export function createEquipmentBulkRules(disposition: 'autoSell' | 'protect' | 'none'): BulkRuleSet {
  const rules = createEmptyBulkRules();
  if (disposition === 'autoSell') {
    rules.equipment.autoSell = 'enable';
    rules.equipment.protect = 'disable';
  } else if (disposition === 'protect') {
    rules.equipment.autoSell = 'disable';
    rules.equipment.protect = 'enable';
  } else {
    rules.equipment.autoSell = 'disable';
    rules.equipment.protect = 'disable';
  }
  return rules;
}

function applyDirective(state: ItemState, field: StateField, directive: RuleDirective): ItemState {
  if (directive === 'unchanged') return state;
  return setStateField(state, field, directive === 'enable');
}

export function previewBulkRules(
  items: CatalogItem[],
  currentStates: Map<string, ItemState>,
  customOverrides: Set<string>,
  rules: BulkRuleSet,
): BulkPreview {
  const changes: StateChange[] = [];
  let excludedCustom = 0;
  let conflictsResolved = 0;

  for (const item of items) {
    if (customOverrides.has(item.id)) {
      excludedCustom += 1;
      continue;
    }
    const before = cloneState(currentStates.get(item.id));
    const directives = rules[item.category];
    let after = before;
    const reasons: string[] = [];

    for (const field of ['skipLoot', 'autoSell', 'protect'] as StateField[]) {
      const directive = directives[field];
      if (directive === 'unchanged') continue;
      const previousOther = field === 'autoSell' ? after.protect : field === 'protect' ? after.autoSell : false;
      after = applyDirective(after, field, directive);
      if (previousOther && directive === 'enable' && (field === 'autoSell' || field === 'protect')) conflictsResolved += 1;
      reasons.push(`${CATEGORY_LABELS[item.category]}：${field}=${directive}`);
    }

    if (before.skipLoot !== after.skipLoot || before.autoSell !== after.autoSell || before.protect !== after.protect) {
      changes.push({ id: item.id, name: item.name, before, after, reasons });
    }
  }

  return { changes, excludedCustom, conflictsResolved };
}

export function applyChanges(current: Map<string, ItemState>, changes: StateChange[]): Map<string, ItemState> {
  const next = new Map(current);
  for (const change of changes) {
    assertValidState(change.after);
    next.set(change.id, cloneState(change.after));
  }
  return next;
}
