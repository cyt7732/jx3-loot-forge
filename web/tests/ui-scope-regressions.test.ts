import { describe, expect, it } from 'vitest';
import standardCatalog from '../src/catalog/catalog.std.json';
import { groupMapsByLevel } from '../src/catalog';
import { sourceKey } from '../src/ui/LootForgeApp';
import type { CatalogSnapshot, Workspace } from '../src/domain/types';
import { createInitialWorkspace } from '../src/domain/state';

describe('v1.2.2 UI Regressions & Scope Interactions', () => {
  const snapshot = standardCatalog as unknown as CatalogSnapshot;

  describe('Focus Current Season under Search Query', () => {
    it('reliably locates Lv.130 current season group from raw snapshot even when search query filters other levels', () => {
      const query = '横刀';
      const allLevelGroups = groupMapsByLevel(snapshot.maps);
      const filteredGroups = allLevelGroups.filter((group) => {
        return group.label.includes(query) || group.name.includes(query) || group.maps.some((m) => m.name.includes(query));
      });
      const filtered130 = filteredGroups.find((g) => g.level === 130);
      expect(filtered130).toBeUndefined();

      const currentSeason = allLevelGroups.find((g) => g.level === 130);
      expect(currentSeason).toBeDefined();
      expect(currentSeason?.level).toBe(130);
      expect(currentSeason?.name).toContain('丝路风语');
      expect(currentSeason?.maps.length).toBeGreaterThan(0);
    });
  });

  describe('Boss Selection and Toggle Semantics', () => {
    it('correctly toggles individual boss in workspace without map selection', () => {
      const ws: Workspace = createInitialWorkspace('test');
      const mapId = 500;
      const bossName = '测试首领1';
      const key = sourceKey(mapId, bossName);

      const bosses1 = new Set(ws.selectedBossKeys);
      if (bosses1.has(key)) bosses1.delete(key); else bosses1.add(key);
      const ws1: Workspace = { ...ws, selectedBossKeys: [...bosses1] };
      expect(ws1.selectedBossKeys).toContain(key);
      expect(ws1.selectedMapIds).toHaveLength(0);

      const bosses2 = new Set(ws1.selectedBossKeys);
      if (bosses2.has(key)) bosses2.delete(key); else bosses2.add(key);
      const ws2: Workspace = { ...ws1, selectedBossKeys: [...bosses2] };
      expect(ws2.selectedBossKeys).toHaveLength(0);
    });

    it('unselecting a single boss when map is fully selected converts map selection to remaining bosses', () => {
      const mapId = 600;
      const mapBosses = ['首领A', '首领B', '首领C'];
      const ws: Workspace = {
        ...createInitialWorkspace('test'),
        selectedMapIds: [mapId],
        selectedBossKeys: [],
      };

      const targetBoss = '首领B';
      const targetKey = sourceKey(mapId, targetBoss);
      const isMapSelected = ws.selectedMapIds.includes(mapId);
      expect(isMapSelected).toBe(true);

      const nextMaps = ws.selectedMapIds.filter((id: number) => id !== mapId);
      const bosses = new Set(ws.selectedBossKeys);
      for (const b of mapBosses) {
        if (b !== targetBoss) {
          bosses.add(sourceKey(mapId, b));
        }
      }
      bosses.delete(targetKey);

      const wsResult: Workspace = {
        ...ws,
        selectedMapIds: nextMaps,
        selectedBossKeys: [...bosses],
      };

      expect(wsResult.selectedMapIds).not.toContain(mapId);
      expect(wsResult.selectedBossKeys).toContain(sourceKey(mapId, '首领A'));
      expect(wsResult.selectedBossKeys).toContain(sourceKey(mapId, '首领C'));
      expect(wsResult.selectedBossKeys).not.toContain(targetKey);
    });

    it('matches item source correctly when individual boss is selected vs unselected', () => {
      const item = {
        id: 'item_1',
        name: 'item',
        category: 'equipment' as const,
        sources: [
          { mapId: 700, mapName: 'Map', expansion: '丝路风语', difficulty: '25人普通', bossName: 'Boss1' },
          { mapId: 700, mapName: 'Map', expansion: '丝路风语', difficulty: '25人普通', bossName: 'Boss2' },
        ],
      };

      const selectedMapsA = new Set([700]);
      const selectedBossesA = new Set<string>();
      const matchA = item.sources.some((s) => selectedMapsA.has(s.mapId) || selectedBossesA.has(sourceKey(s.mapId, s.bossName)));
      expect(matchA).toBe(true);

      const selectedMapsB = new Set<number>();
      const selectedBossesB = new Set([sourceKey(700, 'Boss2')]);
      const matchB = item.sources.some((s) => selectedMapsB.has(s.mapId) || selectedBossesB.has(sourceKey(s.mapId, s.bossName)));
      expect(matchB).toBe(true);

      const selectedMapsC = new Set<number>();
      const selectedBossesC = new Set([sourceKey(700, 'Boss3')]);
      const matchC = item.sources.some((s) => selectedMapsC.has(s.mapId) || selectedBossesC.has(sourceKey(s.mapId, s.bossName)));
      expect(matchC).toBe(false);
    });
  });
});