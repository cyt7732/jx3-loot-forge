import type { CatalogItem, ItemCategory } from '../domain/types';
import { formatItemLevel } from './display';

/** 抽屉排序键：物品名（拼音）/ 类型 / 品质等级（装等）。 */
export type DrawerSortKey = 'name' | 'type' | 'quality';
export type DrawerSortDir = 'asc' | 'desc';
export type DrawerSort = { key: DrawerSortKey; dir: DrawerSortDir } | null;

/** 每页物品条数（与 .drawer-item-list 的 min-height 锚定值联动，改这里需同步 CSS）。 */
export const DRAWER_PAGE_SIZE = 20;

/** 中文拼音序 collator：安(an) < 敖(ao) < 巴(ba)，而码点序是 巴 < 安 < 敖。 */
const pinyinCollator = new Intl.Collator('zh-Hans-CN', { sensitivity: 'base' });

export function compareByPinyin(left: string, right: string): number {
  return pinyinCollator.compare(left, right);
}

/** 品质等级列的实际语义：装等数值（itemLevelMax 优先），缺失返回 null。 */
export function qualityLevelValue(item: Pick<CatalogItem, 'itemLevel' | 'itemLevelMin' | 'itemLevelMax'>): number | null {
  const value = formatItemLevel(item);
  if (!value) return null;
  // 区间值（如 "1380–1420"）取上限参与排序
  const upper = value.includes('–') ? Number(value.split('–')[1]) : Number(value);
  return Number.isFinite(upper) ? upper : null;
}

/**
 * 表头点击的三态循环：asc → desc → null（恢复默认序）。
 * 点击新列时从 asc 开始。
 */
export function nextDrawerSort(current: DrawerSort, key: DrawerSortKey): DrawerSort {
  if (!current || current.key !== key) return { key, dir: 'asc' };
  if (current.dir === 'asc') return { key, dir: 'desc' };
  return null;
}

type SortItem = CatalogItem & { category: ItemCategory };

/** 生成指定排序键的比较器；所有键的平局都用名称拼音序兜底，保证稳定。 */
export function createDrawerComparator(sort: NonNullable<DrawerSort>): (left: SortItem, right: SortItem) => number {
  const tie = (left: SortItem, right: SortItem) => compareByPinyin(left.name, right.name);

  if (sort.key === 'name') {
    return (left, right) => compareByPinyin(left.name, right.name);
  }

  if (sort.key === 'type') {
    // 类型字符串（subtype），空值排尾；同类型内按名称拼音序
    return (left, right) => {
      const leftType = left.subtype ?? '';
      const rightType = right.subtype ?? '';
      if (!leftType && !rightType) return tie(left, right);
      if (!leftType) return 1;
      if (!rightType) return -1;
      const byType = pinyinCollator.compare(leftType, rightType);
      return byType !== 0 ? byType : tie(left, right);
    };
  }

  // quality：装等数值；缺失排尾；asc 与 desc 都把缺失放最后
  return (left, right) => {
    const leftValue = qualityLevelValue(left);
    const rightValue = qualityLevelValue(right);
    if (leftValue === null && rightValue === null) return tie(left, right);
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;
    const diff = leftValue - rightValue;
    return diff !== 0 ? diff : tie(left, right);
  };
}

/** 应用排序（含方向反转；null 直接原样返回）。缺失值（装等/类型为空）无论方向都排尾。 */
export function applyDrawerSort<T extends SortItem>(items: T[], sort: DrawerSort): T[] {
  if (!sort) return items;
  const comparator = createDrawerComparator(sort);
  const sorted = [...items].sort(comparator);
  if (sort.dir !== 'desc') return sorted;
  if (sort.key === 'name') return sorted.reverse(); // 名称列无缺失概念
  // 反转时保持「缺失排尾」：单次遍历分组，非缺失组反转，缺失组留在尾部
  const present: T[] = [];
  const missing: T[] = [];
  for (const item of sorted) {
    const hasValue = sort.key === 'type' ? Boolean(item.subtype) : qualityLevelValue(item) !== null;
    (hasValue ? present : missing).push(item);
  }
  return [...present.reverse(), ...missing];
}
