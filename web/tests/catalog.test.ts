import { describe, expect, it } from 'vitest';
import {
  DIFFICULTY_GROUPS,
  ERA_DEFINITIONS,
  LEVEL_GROUPS,
  classifyMapDifficulty,
  findLevelGroup,
  getCurrentSeasonGroup,
  getLegacyEquipment,
  getLegacyMaps,
  groupMapsByDifficulty,
  groupMapsByLevel,
  isLegacyLevelGroup,
} from '../src/catalog';
import { selectCatalogSnapshot, validateCatalogSnapshot } from '../src/storage/catalog';
import type { CatalogItem, CatalogMap, CatalogSnapshot } from '../src/domain/types';

async function catalogFixture(overrides: Partial<CatalogSnapshot> = {}): Promise<CatalogSnapshot> {
  const snapshot: CatalogSnapshot = {
    schemaVersion: 1,
    client: 'std',
    catalogVersion: 'fixture',
    generatedAt: '2026-08-23T00:00:00.000Z',
    contentHash: '',
    source: 'fixture',
    stats: { maps: 1, bosses: 1, drops: 1, uniqueItems: 1 },
    completeness: {
      status: 'complete', expectedMapCount: 1, fetchedMapCount: 1,
      metadataMissing: 0, metadataMismatch: 0, failures: [],
    },
    maps: [{ mapId: 1, name: '副本', expansion: '版本', difficulty: '难度', bossNames: ['首领'], itemIds: ['物品'] }],
    items: [{ id: '物品', name: '物品', category: 'equipment', sources: [{ mapId: 1, mapName: '副本', expansion: '版本', difficulty: '难度', bossName: '首领' }] }],
    ...overrides,
  };
  const hashInput = JSON.stringify({ ...snapshot, catalogVersion: '', generatedAt: '', contentHash: '' });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hashInput));
  snapshot.contentHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return snapshot;
}

describe('catalog data-pack validation', () => {
  it('accepts a complete self-consistent snapshot with a stable content hash', async () => {
    const snapshot = await catalogFixture();
    await expect(validateCatalogSnapshot(snapshot)).resolves.toBe(snapshot);
    const recrawled = await catalogFixture({ generatedAt: '2026-08-24T00:00:00.000Z' });
    expect(recrawled.contentHash).toBe(snapshot.contentHash);
  });

  it('rejects a snapshot that claims complete while fetched maps or failures disagree', async () => {
    const partial = await catalogFixture({
      completeness: { status: 'complete', expectedMapCount: 2, fetchedMapCount: 1, metadataMissing: 0, metadataMismatch: 0, failures: ['MapID 2 failed'] },
    });
    await expect(validateCatalogSnapshot(partial)).rejects.toThrow('完整性');
  });

  it('rejects dangling map item references even when the hash is self-consistent', async () => {
    const dangling = await catalogFixture({
      maps: [{ mapId: 1, name: '副本', expansion: '版本', difficulty: '难度', bossNames: ['首领'], itemIds: ['不存在'] }],
    });
    await expect(validateCatalogSnapshot(dangling)).rejects.toThrow('不存在的物品');
  });
});

describe('catalog startup selection', () => {
  it('uses the embedded catalog when there is no override', async () => {
    const embedded = await catalogFixture();
    expect(selectCatalogSnapshot(embedded, null)).toEqual({ snapshot: embedded, usedOverride: false });
  });

  it('keeps an override with the same content hash', async () => {
    const embedded = await catalogFixture();
    const override = await catalogFixture({ generatedAt: 'invalid-date' });
    expect(override.contentHash).toBe(embedded.contentHash);
    expect(selectCatalogSnapshot(embedded, override)).toEqual({ snapshot: override, usedOverride: true });
  });

  it('rejects older or equally dated overrides with different content', async () => {
    const embedded = await catalogFixture({ generatedAt: '2026-08-24T00:00:00.000Z' });
    const older = await catalogFixture({ generatedAt: '2026-08-23T00:00:00.000Z', items: [{ id: '物品', name: '旧物品', category: 'equipment', sources: [{ mapId: 1, mapName: '副本', expansion: '版本', difficulty: '难度', bossName: '首领' }] }] });
    const sameTime = await catalogFixture({ generatedAt: embedded.generatedAt, items: [{ id: '物品', name: '同日物品', category: 'equipment', sources: [{ mapId: 1, mapName: '副本', expansion: '版本', difficulty: '难度', bossName: '首领' }] }] });
    expect(older.contentHash).not.toBe(embedded.contentHash);
    expect(sameTime.contentHash).not.toBe(embedded.contentHash);
    expect(selectCatalogSnapshot(embedded, older)).toEqual({ snapshot: embedded, usedOverride: false });
    expect(selectCatalogSnapshot(embedded, sameTime)).toEqual({ snapshot: embedded, usedOverride: false });
  });

  it('keeps an override with a later generated time', async () => {
    const embedded = await catalogFixture({ generatedAt: '2026-08-24T00:00:00.000Z' });
    const newer = await catalogFixture({ generatedAt: '2026-08-25T00:00:00.000Z', items: [{ id: '物品', name: '新物品', category: 'equipment', sources: [{ mapId: 1, mapName: '副本', expansion: '版本', difficulty: '难度', bossName: '首领' }] }] });
    expect(selectCatalogSnapshot(embedded, newer)).toEqual({ snapshot: newer, usedOverride: true });
  });

  it('treats missing or invalid dates as untrusted when hashes differ', async () => {
    const embedded = await catalogFixture({ generatedAt: '2026-08-24T00:00:00.000Z' });
    const invalid = await catalogFixture({ generatedAt: 'not-a-date', items: [{ id: '物品', name: '未知时间物品', category: 'equipment', sources: [{ mapId: 1, mapName: '副本', expansion: '版本', difficulty: '难度', bossName: '首领' }] }] });
    const missing = await catalogFixture({ generatedAt: '', items: [{ id: '物品', name: '无时间物品', category: 'equipment', sources: [{ mapId: 1, mapName: '副本', expansion: '版本', difficulty: '难度', bossName: '首领' }] }] });
    expect(selectCatalogSnapshot(embedded, invalid)).toEqual({ snapshot: embedded, usedOverride: false });
    expect(selectCatalogSnapshot(embedded, missing)).toEqual({ snapshot: embedded, usedOverride: false });
  });
});

function mapFixture(mapId: number, expansion: string, difficulty: string): CatalogMap {
  return { mapId, name: `副本${mapId}`, expansion, difficulty, bossNames: [], itemIds: [] };
}

describe('catalog level and difficulty grouping', () => {
  it('defines Yu Era and Wei Era correctly', () => {
    expect(ERA_DEFINITIONS.yu).toMatchObject({ id: 'yu', name: '鱼历', badge: '鱼历' });
    expect(ERA_DEFINITIONS.wei).toMatchObject({ id: 'wei', name: '炜历', badge: '炜历' });
  });

  it('keeps the level groups ordered chronologically with Yu and Wei eras', () => {
    expect(LEVEL_GROUPS.map((group) => ({ id: group.id, level: group.level, era: group.era }))).toEqual([
      { id: 'yu-50', level: 50, era: 'yu' },
      { id: 'lv-130', level: 130, era: 'wei' },
      { id: 'lv-120', level: 120, era: 'wei' },
      { id: 'lv-110', level: 110, era: 'wei' },
      { id: 'lv-100', level: 100, era: 'wei' },
      { id: 'lv-95', level: 95, era: 'wei' },
      { id: 'lv-90', level: 90, era: 'wei' },
      { id: 'lv-80', level: 80, era: 'wei' },
      { id: 'lv-70', level: 70, era: 'wei' },
    ]);

    expect(findLevelGroup('丝路风语').label).toBe('『丝路风语』（炜历 Lv.130）');
    expect(findLevelGroup('丝路风语').era).toBe('wei');
    expect(findLevelGroup('丝路风语').eraName).toBe('炜历');

    expect(findLevelGroup('风骨霸刀').level).toBe(95);
    expect(findLevelGroup('风骨霸刀').era).toBe('wei');
    expect(findLevelGroup('风骨霸刀').label).toBe('『剑胆琴心』（炜历 Lv.95）');

    expect(findLevelGroup('苍生铸世').era).toBe('yu');
    expect(findLevelGroup('苍生铸世').eraName).toBe('鱼历');
    expect(findLevelGroup('苍生铸世').label).toBe('『苍生铸世』（鱼历 Lv.50）');
    expect(findLevelGroup('鱼历50级').label).toBe('『苍生铸世』（鱼历 Lv.50）');
  });

  it('correctly determines current season and legacy maps without pure number bugs', () => {
    // 场景 1：当前数据包只有 130 级及以下炜历副本
    const weiMaps = [
      mapFixture(101, '丝路风语', '25人英雄'),
      mapFixture(102, '横刀断浪', '25人英雄'),
      mapFixture(103, '风起稻香', '5人普通'),
    ];
    const currentSeasonWei = getCurrentSeasonGroup(weiMaps);
    expect(currentSeasonWei.id).toBe('lv-130');
    expect(isLegacyLevelGroup(currentSeasonWei, currentSeasonWei.id)).toBe(false);

    const legacyMapsWei = getLegacyMaps(weiMaps);
    expect(legacyMapsWei.map((m) => m.mapId)).toEqual([102, 103]);

    // 场景 2：未来引入了鱼历 50 级新副本（苍生铸世）
    const yuAndWeiMaps = [
      mapFixture(201, '苍生铸世', '25人英雄'),
      mapFixture(101, '丝路风语', '25人英雄'),
      mapFixture(102, '横刀断浪', '25人英雄'),
    ];
    const currentSeasonYu = getCurrentSeasonGroup(yuAndWeiMaps);
    expect(currentSeasonYu.id).toBe('yu-50');
    expect(currentSeasonYu.name).toBe('苍生铸世');
    expect(currentSeasonYu.era).toBe('yu');

    // 关键断言：即使 50 < 130，鱼历 50 级是当前赛季，丝路风语 130 级正确成为老本！
    const legacyMapsYu = getLegacyMaps(yuAndWeiMaps);
    expect(legacyMapsYu.map((m) => m.mapId)).toEqual([101, 102]);
  });

  it('correctly filters legacy equipment drops', () => {
    const maps = [
      mapFixture(101, '丝路风语', '25人英雄'),
      mapFixture(102, '横刀断浪', '25人英雄'),
    ];
    const items: CatalogItem[] = [
      { id: '130装备', name: '130装备', category: 'equipment', sources: [{ mapId: 101, mapName: '丝路本', expansion: '丝路风语', difficulty: '25人英雄', bossName: 'Boss' }] },
      { id: '120装备', name: '120装备', category: 'equipment', sources: [{ mapId: 102, mapName: '横刀本', expansion: '横刀断浪', difficulty: '25人英雄', bossName: 'Boss' }] },
      { id: '材料', name: '材料', category: 'material', sources: [{ mapId: 102, mapName: '横刀本', expansion: '横刀断浪', difficulty: '25人英雄', bossName: 'Boss' }] },
    ];
    const legacyEquip = getLegacyEquipment(items, maps);
    expect(legacyEquip.map((i) => i.id)).toEqual(['120装备']);
  });

  it('keeps unknown expansions in a safe fallback bucket', () => {
    const unknown = mapFixture(999, '未来未录入版本', '2人副本');
    const groups = groupMapsByLevel([unknown]);
    const fallback = groups.find((group) => group.id === 'unknown');
    expect(fallback?.maps).toEqual([unknown]);
    expect(fallback?.expansions).toEqual(['未来未录入版本']);
    expect(findLevelGroup('未来未录入版本')).toMatchObject({ id: 'unknown', era: 'unknown', eraName: '未知纪元', label: '『未来未录入版本』（未知等级）' });
  });

  it('classifies five-person variants together and leaves unsupported difficulties in other', () => {
    expect(classifyMapDifficulty('5人普通')).toBe('five');
    expect(classifyMapDifficulty('5人英雄')).toBe('five');
    expect(classifyMapDifficulty('5人挑战')).toBe('five');
    expect(classifyMapDifficulty('历程5人普通')).toBe('five');
    expect(classifyMapDifficulty('5人家园')).toBe('five');
    expect(classifyMapDifficulty('2人副本')).toBe('other');
  });

  it('returns the fixed difficulty order and allows callers to filter empty buckets', () => {
    const maps = [
      mapFixture(1, '丝路风语', '25人挑战'),
      mapFixture(2, '丝路风语', '10人英雄'),
      mapFixture(3, '丝路风语', '5人家园'),
      mapFixture(4, '丝路风语', '2人副本'),
    ];
    const groups = groupMapsByDifficulty(maps);
    expect(groups.map((group) => group.id)).toEqual(DIFFICULTY_GROUPS.map((group) => group.id));
    expect(groups.filter((group) => group.maps.length).map((group) => group.id)).toEqual(['five', '10-hero', '25-challenge', 'other']);
    expect(groups.map((group) => group.label)).toEqual([
      '5人秘境', '10人普通秘境', '10人英雄秘境', '10人挑战秘境',
      '25人普通秘境', '25人英雄秘境', '25人挑战秘境', '其他秘境',
    ]);
  });

  it('sorts 10/25-person maps by descending MapID while preserving five-person and other input order', () => {
    const maps = [
      mapFixture(101, '丝路风语', '10人普通'),
      mapFixture(303, '丝路风语', '10人普通'),
      mapFixture(202, '丝路风语', '25人英雄'),
      mapFixture(404, '丝路风语', '25人英雄'),
      mapFixture(505, '丝路风语', '5人普通'),
      mapFixture(606, '丝路风语', '5人普通'),
      mapFixture(707, '丝路风语', '2人副本'),
      mapFixture(808, '丝路风语', '2人副本'),
    ];
    const groups = groupMapsByDifficulty(maps);

    expect(groups.find((group) => group.id === '10-normal')?.maps.map((map) => map.mapId)).toEqual([303, 101]);
    expect(groups.find((group) => group.id === '25-hero')?.maps.map((map) => map.mapId)).toEqual([404, 202]);
    expect(groups.find((group) => group.id === 'five')?.maps.map((map) => map.mapId)).toEqual([505, 606]);
    expect(groups.find((group) => group.id === 'other')?.maps.map((map) => map.mapId)).toEqual([707, 808]);
  });
});
