import { describe, expect, it } from 'vitest';
import {
  DIFFICULTY_GROUPS,
  LEVEL_GROUPS,
  classifyMapDifficulty,
  findLevelGroup,
  groupMapsByDifficulty,
  groupMapsByLevel,
} from '../src/catalog';
import { validateCatalogSnapshot } from '../src/storage/catalog';
import type { CatalogMap, CatalogSnapshot } from '../src/domain/types';

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

function mapFixture(mapId: number, expansion: string, difficulty: string): CatalogMap {
  return { mapId, name: `副本${mapId}`, expansion, difficulty, bossNames: [], itemIds: [] };
}

describe('catalog level and difficulty grouping', () => {
  it('keeps the eight level groups and their expansion mappings in descending order', () => {
    expect(LEVEL_GROUPS.map((group) => group.level)).toEqual([130, 120, 110, 100, 95, 90, 80, 70]);
    expect(LEVEL_GROUPS.map((group) => [...group.expansions])).toEqual([
      ['丝路风语'],
      ['横刀断浪'],
      ['奉天证道'],
      ['世外蓬莱'],
      ['剑胆琴心', '风骨霸刀', '日月凌空', '重制版'],
      ['安史之乱', '苍雪龙城', '血战天策', '逐鹿中原'],
      ['巴蜀风云', '日月明尊', '一代宗师', '烛火燎天'],
      ['风起稻香'],
    ]);
    expect(findLevelGroup('丝路风语').label).toBe('『丝路风语』（Lv.130）');
    expect(findLevelGroup('风骨霸刀').level).toBe(95);
    expect(findLevelGroup('风骨霸刀').label).toBe('『剑胆琴心』（Lv.95）');
  });

  it('keeps unknown expansions in a safe fallback bucket', () => {
    const unknown = mapFixture(999, '未来版本', '2人副本');
    const groups = groupMapsByLevel([unknown]);
    const fallback = groups.find((group) => group.id === 'unknown');
    expect(fallback?.maps).toEqual([unknown]);
    expect(fallback?.expansions).toEqual(['未来版本']);
    expect(findLevelGroup('未来版本')).toMatchObject({ id: 'unknown', label: '『未来版本』（未知等级）' });
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
});
