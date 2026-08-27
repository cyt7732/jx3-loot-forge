import { beforeEach, describe, expect, it } from 'vitest';
import standardCatalog from '../src/catalog/catalog.std.json';
import {
  DEFAULT_PROTECTED_ITEMS,
  DEFAULT_SELL_ITEMS,
  WORKSPACE_STORAGE_KEY,
} from '../src/domain/constants';
import {
  createCategoryActionRules,
  createInitialWorkspace,
  normalizeItemName,
  previewBulkRules,
  removeCustomItemFromWorkspace,
  stateMapFromWorkspace,
} from '../src/domain/state';
import { buildExportBatch } from '../src/config/exporter';
import {
  assertFileSizeWithinLimit,
  executeDebouncedSave,
  exportWorkspaceBackup,
  handleWorkspaceInitialization,
  importWorkspaceBackup,
  loadWorkspace,
  MAX_DATA_PACK_BYTES,
  PersistenceNotification,
  readWorkspaceBackupFile,
  saveWorkspace,
  validateWorkspace,
} from '../src/storage/workspace';
import { buildCatalogItems } from '../src/catalog';
import type { CatalogItem, CatalogSnapshot } from '../src/domain/types';

// Mock simple localStorage for tests in Node environment
const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, value: string) => {
    mockStorage[key] = value;
  },
  removeItem: (key: string) => {
    delete mockStorage[key];
  },
  clear: () => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
  },
};

(globalThis as unknown as { window?: { localStorage: typeof mockLocalStorage } }).window = {
  localStorage: mockLocalStorage,
};

describe('P0-01 & P1-04: Storage Resilience, Quarantine, and Read-Only Protection', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it('returns initial workspace when localStorage is empty', () => {
    const ws = loadWorkspace('test-cat');
    expect(ws.schemaVersion).toBe(1);
    expect(ws.catalogVersion).toBe('test-cat');
  });

  it('quarantines corrupt JSON and reports successful backup key without wiping data', () => {
    const corruptedRaw = '{ bad json: invalid ...';
    mockLocalStorage.setItem(WORKSPACE_STORAGE_KEY, corruptedRaw);

    expect(() => loadWorkspace('test-cat')).toThrow(/本地工作区数据异常.*已自动隔离备份至/u);

    // Verify the original key is still untouched
    expect(mockLocalStorage.getItem(WORKSPACE_STORAGE_KEY)).toBe(corruptedRaw);

    // Verify a quarantine backup key exists with the exact raw corrupted content
    const quarantineKey = Object.keys(mockStorage).find((k) => k.startsWith(`${WORKSPACE_STORAGE_KEY}:corrupted:`));
    expect(quarantineKey).toBeDefined();
    expect(mockLocalStorage.getItem(quarantineKey!)).toBe(corruptedRaw);
  });

  it('accurately reports backup failure when quarantine setItem throws', () => {
    const corruptedRaw = '{ bad json: invalid ...';
    mockLocalStorage.setItem(WORKSPACE_STORAGE_KEY, corruptedRaw);

    const originalSetItem = mockLocalStorage.setItem;
    mockLocalStorage.setItem = (key: string, value: string) => {
      if (key.includes(':corrupted:')) {
        throw new Error('QuotaExceededError');
      }
      mockStorage[key] = value;
    };

    expect(() => loadWorkspace('test-cat')).toThrow(/隔离备份写入失败，原存储数据仍保留/u);

    // Original data must still be intact
    expect(mockLocalStorage.getItem(WORKSPACE_STORAGE_KEY)).toBe(corruptedRaw);

    mockLocalStorage.setItem = originalSetItem;
  });

  it('quarantines invalid schema workspace and throws without wiping data', () => {
    const invalidSchemaRaw = JSON.stringify({ schemaVersion: 999, invalid: true });
    mockLocalStorage.setItem(WORKSPACE_STORAGE_KEY, invalidSchemaRaw);

    expect(() => loadWorkspace('test-cat')).toThrow(/不支持的工作区版本/u);

    const quarantineKey = Object.keys(mockStorage).find((k) => k.startsWith(`${WORKSPACE_STORAGE_KEY}:corrupted:`));
    expect(quarantineKey).toBeDefined();
    expect(mockLocalStorage.getItem(quarantineKey!)).toBe(invalidSchemaRaw);
  });

  it('safely catches errors and returns false in saveWorkspace on storage failure', () => {
    const ws = createInitialWorkspace('test-cat');
    const originalSetItem = mockLocalStorage.setItem;
    mockLocalStorage.setItem = () => {
      throw new Error('QuotaExceededError');
    };

    const saved = saveWorkspace(ws);
    expect(saved).toBe(false);

    mockLocalStorage.setItem = originalSetItem;
  });

  it('executes handleWorkspaceInitialization on corrupted data: disables persistence, protects original data, and triggers notification', () => {
    const corruptedRaw = '{ bad json: invalid ...';
    mockLocalStorage.setItem(WORKSPACE_STORAGE_KEY, corruptedRaw);

    const notifications: PersistenceNotification[] = [];
    const result = handleWorkspaceInitialization('test-cat', (notif) => {
      notifications.push(notif);
    });

    expect(result.persistenceEnabled).toBe(false);
    expect(result.workspace.catalogVersion).toBe('test-cat');
    expect(notifications).toHaveLength(1);
    expect(notifications[0].tone).toBe('error');
    expect(notifications[0].message).toContain('已启用只读保护，未覆盖本地存储');
    expect(notifications[0].message).toContain('已自动隔离备份至');

    // Verify localStorage original data is untouched
    expect(mockLocalStorage.getItem(WORKSPACE_STORAGE_KEY)).toBe(corruptedRaw);

    // Verify executeDebouncedSave strictly prevents any write when persistenceEnabled === false
    const saveResult = executeDebouncedSave(result.workspace, result.persistenceEnabled, true);
    expect(saveResult).toBe(false);
    // Original data remains untouched
    expect(mockLocalStorage.getItem(WORKSPACE_STORAGE_KEY)).toBe(corruptedRaw);
  });

  it('executes executeDebouncedSave on storage failure: returns false and triggers exact error notification', () => {
    const ws = createInitialWorkspace('test-cat');
    const originalSetItem = mockLocalStorage.setItem;
    mockLocalStorage.setItem = () => {
      throw new Error('QuotaExceededError');
    };

    const notifications: PersistenceNotification[] = [];
    const saveResult = executeDebouncedSave(ws, true, true, (notif) => {
      notifications.push(notif);
    });

    expect(saveResult).toBe(false);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].tone).toBe('error');
    expect(notifications[0].message).toBe('工作区保存失败，请检查浏览器存储空间或隐私权限设置。');

    mockLocalStorage.setItem = originalSetItem;
  });
});

describe('P0-02: Default Items Lifecycle & Zero-Ghost Export Prevention (40 Items Parameterized)', () => {
  const allDefaultItems = [...DEFAULT_PROTECTED_ITEMS, ...DEFAULT_SELL_ITEMS];

  it('verifies 40 total default items (21 protected + 19 sell)', () => {
    expect(DEFAULT_PROTECTED_ITEMS).toHaveLength(21);
    expect(DEFAULT_SELL_ITEMS).toHaveLength(19);
    expect(allDefaultItems).toHaveLength(40);
  });

  it.each(allDefaultItems)('removes "%s" via removeCustomItemFromWorkspace and ensures zero export residue', (itemName) => {
    const id = normalizeItemName(itemName);
    const initialWs = createInitialWorkspace('test-cat');
    const initialMap = stateMapFromWorkspace(initialWs);

    // Assert it starts present in workspace and stateMap
    expect(initialMap.has(id)).toBe(true);
    expect(initialWs.customItems.some((item) => item.id === id)).toBe(true);
    expect(initialWs.customOverrides.includes(id)).toBe(true);

    // Execute the exact domain function that UI uses
    const updatedWs = removeCustomItemFromWorkspace(initialWs, id);
    const updatedMap = stateMapFromWorkspace(updatedWs);

    // Assert it is removed from stateMap, customItems, and customOverrides
    expect(updatedMap.has(id)).toBe(false);
    expect(updatedWs.customItems.some((item) => item.id === id)).toBe(false);
    expect(updatedWs.customOverrides.includes(id)).toBe(false);

    // Assert it is completely absent from all export batches
    const updatedNamedStates = [...updatedMap.entries()].map(([key, state]) => ({ name: key, state }));
    const batch = buildExportBatch(updatedNamedStates);

    expect(batch.combined.text).not.toContain(`[${JSON.stringify(itemName)}]=true`);
    expect(batch.sell.text).not.toContain(`[${JSON.stringify(itemName)}]=true`);
    expect(batch.pickup.text).not.toContain(`[${JSON.stringify(itemName)}]=true`);
  });

  it('buildCatalogItems returns exactly the snapshot items without injecting fake sources: [] items', () => {
    const mockSnapshot: CatalogSnapshot = {
      schemaVersion: 1,
      client: 'std',
      catalogVersion: 'snap-1',
      generatedAt: '2026-08-27T00:00:00Z',
      contentHash: 'abc',
      source: 'test',
      stats: { maps: 0, bosses: 0, drops: 0, uniqueItems: 0 },
      maps: [],
      items: [{ id: '官方掉落剑', name: '官方掉落剑', category: 'equipment', sources: [{ mapId: 1, mapName: '副本', expansion: '丝路风语', difficulty: '25人普通', bossName: '首领' }] }],
    };

    const items = buildCatalogItems(mockSnapshot);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('官方掉落剑');
  });

  // Dynamically extract the 8 official drops that match DEFAULT_PROTECTED_ITEMS from actual catalog.std.json
  const realCatalogItems = standardCatalog.items as CatalogItem[];
  const protectedNameSet = new Set<string>(DEFAULT_PROTECTED_ITEMS);
  const official8CatalogItems = realCatalogItems.filter((item) => protectedNameSet.has(item.name));

  it('verifies exactly 8 default protected items exist in real catalog.std.json', () => {
    expect(official8CatalogItems).toHaveLength(8);
    const equipmentNames = official8CatalogItems.filter((i) => i.category === 'equipment').map((i) => i.name);
    const petNames = official8CatalogItems.filter((i) => i.category === 'pet').map((i) => i.name);
    expect(equipmentNames.sort()).toEqual(['圆月双角', '炎枪重黎', '腾空'].sort());
    expect(petNames.sort()).toEqual(['秋声烛影', '秋声烛影·鸿', '金红狩命', '金红狩命·鸿', '钧天·鸿'].sort());
  });

  it.each(official8CatalogItems)('dynamically allows official item "$name" ($category) to be batch managed after custom override removal', (item) => {
    const initialWs = createInitialWorkspace('test-cat');
    // Ensure item starts with custom override in workspace
    expect(initialWs.customOverrides.includes(item.id)).toBe(true);

    // Call domain removal function to "restore official batch management"
    const updatedWs = removeCustomItemFromWorkspace(initialWs, item.id);
    expect(updatedWs.customOverrides.includes(item.id)).toBe(false);

    // Test previewBulkRules on this official catalog item with updated customOverrides
    const currentStates = new Map([
      [item.id, { skipLoot: false, autoSell: false, protect: false }],
    ]);
    const rules = createCategoryActionRules(item.category, 'autoSell');
    const preview = previewBulkRules([item], currentStates, new Set(updatedWs.customOverrides), rules);

    expect(preview.excludedCustom).toBe(0);
    expect(preview.changes).toHaveLength(1);
    expect(preview.changes[0].id).toBe(item.id);
    expect(preview.changes[0].after.autoSell).toBe(true);
  });

  it('preserves category and note in customItems during validateWorkspace', () => {
    const ws = createInitialWorkspace('test-cat');
    const validated = validateWorkspace(ws, 'test-cat');

    const protectedItem = validated.customItems.find((item) => item.name === '炎枪重黎');
    expect(protectedItem).toBeDefined();
    expect(protectedItem?.category).toBe('specialDrop');
    expect(protectedItem?.note).toBe('插件推荐保护');

    const sellItem = validated.customItems.find((item) => item.name === '金叶子');
    expect(sellItem).toBeDefined();
    expect(sellItem?.category).toBe('other');
    expect(sellItem?.note).toBe('插件默认出售');
  });
});

describe('P3-01: File Input Size Guards & Complete Roundtrip Validation', () => {
  it('throws error when importing oversized workspace backup string', () => {
    const hugeText = 'a'.repeat(6 * 1024 * 1024);
    expect(() => importWorkspaceBackup(hugeText, 'test-cat')).toThrow(/工作区备份超过 5 MiB 限制/u);
  });

  it('rejects oversized file BEFORE reading text content in readWorkspaceBackupFile', async () => {
    let textCalled = false;
    const oversizedFile = {
      size: 6 * 1024 * 1024,
      text: async () => {
        textCalled = true;
        return 'dummy content';
      },
    };

    await expect(readWorkspaceBackupFile(oversizedFile, 'test-cat')).rejects.toThrow(/工作区备份超过 5 MiB 限制/u);
    // Verifies file.text() is NEVER invoked, avoiding memory peak
    expect(textCalled).toBe(false);
  });

  it('reads text content when file size is within 5 MiB limit', async () => {
    let textCalled = false;
    const validWs = createInitialWorkspace('test-cat');
    const validRaw = exportWorkspaceBackup(validWs);
    const validFile = {
      size: 1024,
      text: async () => {
        textCalled = true;
        return validRaw;
      },
    };

    const restored = await readWorkspaceBackupFile(validFile, 'test-cat');
    expect(textCalled).toBe(true);
    expect(restored.catalogVersion).toBe('test-cat');
    expect(restored.customItems).toHaveLength(40);
  });

  it('rejects data pack when file size exceeds 25 MiB limit', () => {
    const oversizedDataPack = { size: 26 * 1024 * 1024 };
    expect(() => assertFileSizeWithinLimit(oversizedDataPack, MAX_DATA_PACK_BYTES, '数据包')).toThrow(/数据包超过 25 MiB 限制/u);

    const validDataPack = { size: 20 * 1024 * 1024 };
    expect(() => assertFileSizeWithinLimit(validDataPack, MAX_DATA_PACK_BYTES, '数据包')).not.toThrow();
  });

  it('preserves complete workspace state across export/import roundtrip (whole object deep equality)', () => {
    const ws = createInitialWorkspace('test-cat');
    ws.customOverrides.push('自定义项A');
    ws.filters.qualities = [4, 5];
    ws.selectedMapIds = [101, 102];
    ws.selectedBossKeys = ['101:首领1'];
    ws.expandedGroups = ['丝路风语:25人英雄'];
    ws.favoriteScopes = [{ id: 'fav-1', name: '常用', mapIds: [101], bossKeys: ['101:首领1'] }];
    ws.ui.bulkPanelOpen = true;
    ws.ui.sidebarCollapsed = true;
    ws.itemStates.push(['自定义项A', { skipLoot: false, autoSell: true, protect: false }]);

    const exported = exportWorkspaceBackup(ws);
    const restored = importWorkspaceBackup(exported, 'test-cat');

    // Complete whole-object deep structural equality across all fields
    expect(restored).toEqual(validateWorkspace(ws, 'test-cat'));
  });
});
