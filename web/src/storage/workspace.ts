import { APP_VERSION, WORKSPACE_STORAGE_KEY } from '../domain/constants';
import { assertValidState, createInitialWorkspace, normalizeItemName } from '../domain/state';
import type { Workspace } from '../domain/types';

const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

export function loadWorkspace(catalogVersion: string): Workspace {
  if (typeof window === 'undefined') return createInitialWorkspace(catalogVersion);
  const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
  if (!raw) return createInitialWorkspace(catalogVersion);
  try {
    return validateWorkspace(JSON.parse(raw), catalogVersion);
  } catch {
    return createInitialWorkspace(catalogVersion);
  }
}

export function saveWorkspace(workspace: Workspace): void {
  if (typeof window === 'undefined') return;
  const validated = validateWorkspace(workspace, workspace.catalogVersion);
  window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(validated));
}

export function resetWorkspace(catalogVersion: string): Workspace {
  const next = createInitialWorkspace(catalogVersion);
  saveWorkspace(next);
  return next;
}

export function exportWorkspaceBackup(workspace: Workspace): string {
  return JSON.stringify({ format: 'jx3-loot-forge-workspace', exportedAt: new Date().toISOString(), workspace }, null, 2);
}

export function importWorkspaceBackup(text: string, catalogVersion: string): Workspace {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw new Error('工作区备份超过 5 MiB 限制。');
  const parsed = JSON.parse(text) as { format?: unknown; workspace?: unknown };
  if (parsed.format !== 'jx3-loot-forge-workspace') throw new Error('不是 JX3 Loot Forge 工作区备份。');
  return validateWorkspace(parsed.workspace, catalogVersion);
}

export function validateWorkspace(value: unknown, catalogVersion: string): Workspace {
  if (!value || typeof value !== 'object') throw new Error('工作区结构无效。');
  const source = value as Partial<Workspace>;
  if (source.schemaVersion !== 1 || !Array.isArray(source.itemStates) || !Array.isArray(source.customItems)) {
    throw new Error('不支持的工作区版本。');
  }

  const ids = new Set<string>();
  const itemStates = source.itemStates.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') throw new Error('工作区物品状态无效。');
    const id = normalizeItemName(entry[0]);
    if (ids.has(id)) throw new Error(`工作区包含重复物品：${id}`);
    ids.add(id);
    assertValidState(entry[1]);
    return [id, { ...entry[1] }] as Workspace['itemStates'][number];
  });

  return {
    schemaVersion: 1,
    appVersion: APP_VERSION,
    catalogVersion,
    initializedAt: typeof source.initializedAt === 'string' ? source.initializedAt : new Date().toISOString(),
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : new Date().toISOString(),
    itemStates,
    customItems: source.customItems.filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string').map((item) => ({ ...item, id: normalizeItemName(item.id) })),
    customOverrides: Array.isArray(source.customOverrides) ? source.customOverrides.filter((id): id is string => typeof id === 'string').map(normalizeItemName) : [],
    selectedMapIds: Array.isArray(source.selectedMapIds) ? source.selectedMapIds.filter((id): id is number => Number.isSafeInteger(id)) : [],
    selectedBossKeys: Array.isArray(source.selectedBossKeys) ? source.selectedBossKeys.filter((id): id is string => typeof id === 'string') : [],
    expandedGroups: Array.isArray(source.expandedGroups) ? source.expandedGroups.filter((id): id is string => typeof id === 'string') : [],
    favoriteScopes: Array.isArray(source.favoriteScopes) ? source.favoriteScopes
      .filter((scope) => scope && typeof scope.id === 'string' && typeof scope.name === 'string' && Array.isArray(scope.mapIds))
      .map((scope) => ({ ...scope, bossKeys: Array.isArray(scope.bossKeys) ? scope.bossKeys.filter((key): key is string => typeof key === 'string') : [] })) : [],
    filters: source.filters && typeof source.filters === 'object' ? { ...createInitialWorkspace(catalogVersion).filters, ...source.filters } : createInitialWorkspace(catalogVersion).filters,
    ui: source.ui && typeof source.ui === 'object' ? { ...createInitialWorkspace(catalogVersion).ui, ...source.ui } : createInitialWorkspace(catalogVersion).ui,
  };
}
