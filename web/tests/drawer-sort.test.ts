import { describe, expect, it } from 'vitest';
import {
  applyDrawerSort,
  compareByPinyin,
  createDrawerComparator,
  nextDrawerSort,
  qualityLevelValue,
  type DrawerSort,
} from '../src/ui/drawer-sort';
import type { CatalogItem } from '../src/domain/types';

function item(name: string, extra: Partial<CatalogItem> = {}): CatalogItem {
  return { id: name, name, category: 'equipment', sources: [], ...extra };
}

describe('compareByPinyin', () => {
  it('sorts by pinyin, not by code point', () => {
    // 码点序：巴(U+5DF4) < 安(U+5B89) 为假 —— 实际码点 安(0x5B89) < 巴(0x5DF4) < 敖(0x6556)
    // 拼音序：安(an) < 敖(ao) < 巴(ba)，敖 必须排在 巴 之前
    const sorted = ['巴', '安', '敖'].sort(compareByPinyin);
    expect(sorted).toEqual(['安', '敖', '巴']);
  });
});

describe('nextDrawerSort', () => {
  it('starts with asc when clicking a new column', () => {
    expect(nextDrawerSort(null, 'name')).toEqual({ key: 'name', dir: 'asc' });
    expect(nextDrawerSort({ key: 'type', dir: 'desc' }, 'quality')).toEqual({ key: 'quality', dir: 'asc' });
  });

  it('cycles asc → desc → null on repeated clicks of the same column', () => {
    const asc: DrawerSort = { key: 'name', dir: 'asc' };
    expect(nextDrawerSort(asc, 'name')).toEqual({ key: 'name', dir: 'desc' });
    expect(nextDrawerSort({ key: 'name', dir: 'desc' }, 'name')).toBeNull();
  });
});

describe('qualityLevelValue', () => {
  it('reads the upper bound of a level range', () => {
    expect(qualityLevelValue({ itemLevelMax: 1420, itemLevelMin: 1380 })).toBe(1420);
    expect(qualityLevelValue({ itemLevel: 965 })).toBe(965);
  });

  it('returns null when no level data exists', () => {
    expect(qualityLevelValue({})).toBeNull();
    expect(qualityLevelValue({ itemLevelMin: undefined, itemLevelMax: undefined })).toBeNull();
  });
});

describe('applyDrawerSort', () => {
  const fixtures = [
    item('百万军中', { subtype: '长兵类', itemLevelMax: 100 }),
    item('安家落户', { subtype: '帽子', itemLevelMax: 300 }),
    item('敖包相会', { subtype: '长兵类', itemLevelMax: 200 }),
    item('无名之物'), // 无类型、无装等
  ];

  it('sorts by pinyin in asc mode', () => {
    const sorted = applyDrawerSort(fixtures, { key: 'name', dir: 'asc' });
    expect(sorted.map((i) => i.name)).toEqual(['安家落户', '敖包相会', '百万军中', '无名之物']);
  });

  it('reverses in desc mode', () => {
    const sorted = applyDrawerSort(fixtures, { key: 'name', dir: 'desc' });
    expect(sorted.map((i) => i.name)).toEqual(['无名之物', '百万军中', '敖包相会', '安家落户']);
  });

  it('returns the original array untouched when sort is null', () => {
    expect(applyDrawerSort(fixtures, null)).toBe(fixtures);
  });

  it('sorts by type with empty subtypes last (both directions)', () => {
    const asc = applyDrawerSort(fixtures, { key: 'type', dir: 'asc' });
    expect(asc.map((i) => i.name)).toEqual(['安家落户', '敖包相会', '百万军中', '无名之物']);
    const desc = applyDrawerSort(fixtures, { key: 'type', dir: 'desc' });
    expect(desc[desc.length - 1].name).toBe('无名之物');
  });

  it('sorts by quality level descending first, missing values last (both directions)', () => {
    const desc = applyDrawerSort(fixtures, { key: 'quality', dir: 'desc' });
    expect(desc.map((i) => i.name)).toEqual(['安家落户', '敖包相会', '百万军中', '无名之物']);
    const asc = applyDrawerSort(fixtures, { key: 'quality', dir: 'asc' });
    expect(asc.map((i) => i.name)).toEqual(['百万军中', '敖包相会', '安家落户', '无名之物']);
  });

  it('keeps ties stable by pinyin', () => {
    const tied = [item('巴山'), item('安河'), item('敖包')].map((i) => ({ ...i, subtype: '同类型' }));
    const sorted = applyDrawerSort(tied, { key: 'type', dir: 'asc' });
    expect(sorted.map((i) => i.name)).toEqual(['安河', '敖包', '巴山']);
  });

  it('comparator is pure and never mutates input order', () => {
    const original = [...fixtures];
    const comparator = createDrawerComparator({ key: 'quality', dir: 'desc' });
    [...fixtures].sort(comparator);
    expect(fixtures.map((i) => i.name)).toEqual(original.map((i) => i.name));
  });
});
