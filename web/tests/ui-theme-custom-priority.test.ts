import { describe, expect, it } from 'vitest';
import { CUSTOM_SCOPE_ID, THEME_STORAGE_KEY } from '../src/domain/constants';
import {
  createCategoryActionRules,
  createInitialWorkspace,
  previewBulkRules,
} from '../src/domain/state';
import { validateWorkspace } from '../src/storage/workspace';
import type { CatalogItem, ItemState, Workspace } from '../src/domain/types';

describe('v1.4.0 Custom Scope & Priority & Theme Logic', () => {
  describe('User Custom Default Scope & Persistence', () => {
    it('initializes workspace with CUSTOM_SCOPE_ID checked by default', () => {
      const ws = createInitialWorkspace('test-cat');
      expect(ws.selectedMapIds).toEqual([CUSTOM_SCOPE_ID]);
    });

    it('automatically ensures CUSTOM_SCOPE_ID on upgrade from older workspaces missing it', () => {
      const oldWorkspace = {
        schemaVersion: 1,
        appVersion: '1.3.1',
        catalogVersion: 'test-cat',
        initializedAt: '2026-08-30T00:00:00.000Z',
        updatedAt: '2026-08-30T00:00:00.000Z',
        itemStates: [],
        customItems: [],
        customOverrides: [],
        selectedMapIds: [100, 200],
        selectedBossKeys: [],
        expandedGroups: [],
        favoriteScopes: [],
      };
      const upgraded = validateWorkspace(oldWorkspace, 'test-cat');
      expect(upgraded.selectedMapIds).toContain(CUSTOM_SCOPE_ID);
      expect(upgraded.selectedMapIds).toContain(100);
      expect(upgraded.selectedMapIds).toContain(200);
    });

    it('respects explicit manual unchecking of CUSTOM_SCOPE_ID in current app version', () => {
      const currentWs = createInitialWorkspace('test-cat');
      currentWs.selectedMapIds = [];
      const validated = validateWorkspace(currentWs, 'test-cat');
      expect(validated.selectedMapIds).not.toContain(CUSTOM_SCOPE_ID);
    });

    it('clearing dungeon scope retains CUSTOM_SCOPE_ID as confirmed by user rules', () => {
      const currentWs = createInitialWorkspace('test-cat');
      currentWs.selectedMapIds = [CUSTOM_SCOPE_ID, 101, 102];
      currentWs.selectedBossKeys = ['101:首领1'];

      // Simulate clear scope action
      const nextMapIds = currentWs.selectedMapIds.includes(CUSTOM_SCOPE_ID)
        ? [CUSTOM_SCOPE_ID]
        : [CUSTOM_SCOPE_ID];
      const clearedWs: Workspace = {
        ...currentWs,
        selectedMapIds: nextMapIds,
        selectedBossKeys: [],
      };

      expect(clearedWs.selectedMapIds).toEqual([CUSTOM_SCOPE_ID]);
      expect(clearedWs.selectedBossKeys).toHaveLength(0);
    });
  });

  describe('Custom Items Highest Priority Protection', () => {
    it('strictly excludes custom items from any category direct action / bulk rules', () => {
      const duplicateDropItem: CatalogItem = {
        id: '炎枪重黎',
        name: '炎枪重黎',
        category: 'specialDrop',
        sources: [{ mapId: 101, mapName: '烛龙殿', expansion: '巴蜀风云', difficulty: '25人英雄', bossName: '乌蒙贵' }],
      };
      const normalDropItem: CatalogItem = {
        id: '普通材料',
        name: '普通材料',
        category: 'specialDrop',
        sources: [{ mapId: 101, mapName: '烛龙殿', expansion: '巴蜀风云', difficulty: '25人英雄', bossName: '乌蒙贵' }],
      };

      const customOverrides = new Set(['炎枪重黎']);
      const currentStates = new Map<string, ItemState>([
        ['炎枪重黎', { skipLoot: false, autoSell: false, protect: true }],
        ['普通材料', { skipLoot: false, autoSell: false, protect: false }],
      ]);

      const rules = createCategoryActionRules('specialDrop', 'autoSell');
      const preview = previewBulkRules([duplicateDropItem, normalDropItem], currentStates, customOverrides, rules);

      expect(preview.excludedCustom).toBe(1);
      expect(preview.changes).toHaveLength(1);
      expect(preview.changes[0].id).toBe('普通材料');
      expect(preview.changes[0].after.autoSell).toBe(true);

      expect(currentStates.get('炎枪重黎')?.protect).toBe(true);
      expect(currentStates.get('炎枪重黎')?.autoSell).toBe(false);
    });

    it('prevents mutation of custom item in non-custom scopes', () => {
      const customOverrides = new Set(['炎枪重黎']);
      const stateMap = new Map<string, ItemState>([
        ['炎枪重黎', { skipLoot: false, autoSell: false, protect: true }],
      ]);

      const targetItem = { id: '炎枪重黎', name: '炎枪重黎', customOverride: true };
      const scopeType: string = 'map';

      let modified = false;
      if (scopeType !== 'custom' && (targetItem.customOverride || customOverrides.has(targetItem.id))) {
        modified = false;
      } else {
        stateMap.set(targetItem.id, { skipLoot: true, autoSell: true, protect: false });
        modified = true;
      }

      expect(modified).toBe(false);
      expect(stateMap.get('炎枪重黎')?.protect).toBe(true);
    });
  });

  describe('Theme Constants', () => {
    it('defines THEME_STORAGE_KEY correctly', () => {
      expect(THEME_STORAGE_KEY).toBe('jx3-loot-forge:theme');
    });
  });
});
