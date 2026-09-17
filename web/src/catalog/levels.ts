import type {
  CatalogDifficultyGroup,
  CatalogDifficultyGroupId,
  CatalogEra,
  CatalogEraId,
  CatalogItem,
  CatalogLevelGroup,
  CatalogLevelGroupId,
  CatalogMap,
} from '../domain/types';

export type LevelGroup = CatalogLevelGroup;
export type LevelGroupId = CatalogLevelGroupId;
export type DifficultyGroup = CatalogDifficultyGroup;
export type DifficultyGroupId = CatalogDifficultyGroupId;

export const ERA_DEFINITIONS: Record<CatalogEraId, CatalogEra> = {
  yu: {
    id: 'yu',
    name: '鱼历',
    badge: '鱼历',
    description: '等级压缩新时代 (Lv.50~)',
    order: 1,
  },
  wei: {
    id: 'wei',
    name: '炜历',
    badge: '炜历',
    description: '经典前尘时代 (Lv.70~Lv.130)',
    order: 2,
  },
};

const levelGroup = (
  id: Exclude<CatalogLevelGroupId, 'unknown'>,
  level: number,
  expansions: readonly string[],
  era: CatalogEraId = 'wei',
): CatalogLevelGroup => {
  const eraInfo = ERA_DEFINITIONS[era];
  const title = expansions[0] ?? `Lv.${level}`;
  const label = `『${title}』（${eraInfo.name} Lv.${level}）`;
  return {
    id,
    era,
    eraName: eraInfo.name,
    level,
    name: title,
    title,
    label,
    expansions,
  };
};

/**
 * The canonical chronological level order used by the catalog tree.
 * Yu Era (Lv.50) is ordered first as the latest epoch, followed by the Wei Era (Lv.130 down to Lv.70).
 */
export const LEVEL_GROUPS = [
  levelGroup('yu-50', 50, ['苍生铸世', '鱼历50级', '鱼历新时代', '鱼历全新时代'], 'yu'),
  levelGroup('lv-130', 130, ['丝路风语'], 'wei'),
  levelGroup('lv-120', 120, ['横刀断浪'], 'wei'),
  levelGroup('lv-110', 110, ['奉天证道'], 'wei'),
  levelGroup('lv-100', 100, ['世外蓬莱'], 'wei'),
  levelGroup('lv-95', 95, ['剑胆琴心', '风骨霸刀', '日月凌空', '重制版'], 'wei'),
  levelGroup('lv-90', 90, ['安史之乱', '苍雪龙城', '血战天策', '逐鹿中原'], 'wei'),
  levelGroup('lv-80', 80, ['巴蜀风云', '日月明尊', '一代宗师', '烛火燎天'], 'wei'),
  levelGroup('lv-70', 70, ['风起稻香'], 'wei'),
] as const satisfies readonly CatalogLevelGroup[];

export const CATALOG_LEVEL_GROUPS = LEVEL_GROUPS;

export const UNKNOWN_LEVEL_GROUP: CatalogLevelGroup = {
  id: 'unknown',
  era: 'unknown',
  eraName: '未知纪元',
  level: null,
  name: '未知版本',
  title: '未知版本',
  label: '『未知版本』（未知等级）',
  expansions: [],
};

const LEVEL_GROUP_BY_EXPANSION = new Map<string, CatalogLevelGroup>();
for (const group of LEVEL_GROUPS) {
  for (const expansion of group.expansions) LEVEL_GROUP_BY_EXPANSION.set(expansion, group);
}

function fallbackLevelGroup(expansion: string): CatalogLevelGroup {
  if (!expansion) return UNKNOWN_LEVEL_GROUP;
  const label = `『${expansion}』（未知等级）`;
  return {
    ...UNKNOWN_LEVEL_GROUP,
    name: expansion,
    title: expansion,
    label,
    expansions: [expansion],
  };
}

/** Find the canonical level group for an expansion without dropping unknown versions. */
export function getLevelGroup(expansion: string | null | undefined): CatalogLevelGroup {
  const normalized = typeof expansion === 'string' ? expansion.trim() : '';
  return LEVEL_GROUP_BY_EXPANSION.get(normalized) ?? fallbackLevelGroup(normalized);
}

export const findLevelGroup = getLevelGroup;
export const findLevelGroupByExpansion = getLevelGroup;

export type MapsByLevel<TMap extends Pick<CatalogMap, 'expansion'>> = CatalogLevelGroup & {
  maps: TMap[];
};

function copyLevelGroup(group: CatalogLevelGroup): CatalogLevelGroup {
  return { ...group, expansions: [...group.expansions] };
}

function unknownGroupForMaps<TMap extends Pick<CatalogMap, 'expansion'>>(maps: readonly TMap[]): CatalogLevelGroup {
  const expansions = [...new Set(maps.map((map) => map.expansion.trim() || '未知版本'))];
  if (expansions.length === 1 && expansions[0] !== '未知版本') return fallbackLevelGroup(expansions[0]);
  return { ...UNKNOWN_LEVEL_GROUP, expansions };
}

export const ORIGIN_LEVEL_GROUPS: readonly CatalogLevelGroup[] = [
  {
    id: 'lv-95',
    era: 'unknown',
    eraName: '',
    level: 95,
    name: '剑胆琴心',
    title: '剑胆琴心',
    label: '『剑胆琴心』（Lv.95）',
    expansions: ['剑胆琴心', '风骨霸刀', '日月凌空', '重制版'],
  },
  {
    id: 'lv-90',
    era: 'unknown',
    eraName: '',
    level: 90,
    name: '安史之乱',
    title: '安史之乱',
    label: '『安史之乱』（Lv.90）',
    expansions: ['安史之乱', '苍雪龙城', '血战天策', '逐鹿中原'],
  },
  {
    id: 'lv-80',
    era: 'unknown',
    eraName: '',
    level: 80,
    name: '巴蜀风云',
    title: '巴蜀风云',
    label: '『巴蜀风云』（Lv.80）',
    expansions: ['巴蜀风云', '日月明尊', '一代宗师', '烛火燎天'],
  },
  {
    id: 'lv-70',
    era: 'unknown',
    eraName: '',
    level: 70,
    name: '风起稻香',
    title: '风起稻香',
    label: '『风起稻香』（Lv.70）',
    expansions: ['风起稻香'],
  },
];

/**
 * Group maps in the fixed level order. All canonical buckets are returned,
 * including empty ones; an unknown bucket is appended only when it contains
 * maps so that imported/future data remains visible.
 */
export function groupMapsByLevel<TMap extends Pick<CatalogMap, 'expansion'>>(
  maps: readonly TMap[],
  client: 'std' | 'origin' = 'std',
): MapsByLevel<TMap>[] {
  const groups = client === 'origin' ? ORIGIN_LEVEL_GROUPS : LEVEL_GROUPS;
  const buckets = new Map<CatalogLevelGroupId, TMap[]>();
  for (const group of groups) buckets.set(group.id, []);
  const unknownMaps: TMap[] = [];

  for (const map of maps) {
    const group = getLevelGroup(map.expansion);
    if (group.id === 'unknown' || !buckets.has(group.id)) unknownMaps.push(map);
    else buckets.get(group.id)?.push(map);
  }

  const result = groups.map((group) => ({
    ...copyLevelGroup(group),
    maps: buckets.get(group.id) ?? [],
  }));
  if (unknownMaps.length > 0) result.push({ ...unknownGroupForMaps(unknownMaps), maps: unknownMaps });
  return result;
}

/**
 * 获取当前活跃的最新赛季等级组。
 * 优先在数据中查找第一个有地图的已知等级组（按时间线最新排序）；若无地图则返回时间线首个等级组。
 */
export function getCurrentSeasonGroup<TMap extends Pick<CatalogMap, 'expansion'>>(
  maps: readonly TMap[],
  client?: 'std' | 'origin',
): MapsByLevel<TMap>;
export function getCurrentSeasonGroup(client?: 'std' | 'origin'): CatalogLevelGroup;
export function getCurrentSeasonGroup<TMap extends Pick<CatalogMap, 'expansion'>>(
  mapsOrClient?: readonly TMap[] | 'std' | 'origin',
  clientArg?: 'std' | 'origin',
): MapsByLevel<TMap> | CatalogLevelGroup {
  const maps = Array.isArray(mapsOrClient) ? mapsOrClient : undefined;
  const client = (typeof mapsOrClient === 'string' ? mapsOrClient : clientArg) ?? 'std';
  // 旗舰端当前处于丝路风语赛季（lv-130），苍生铸世（yu-50）为前瞻植入阶段，默认与活跃赛季锁定为 lv-130
  const defaultGroup = client === 'origin'
    ? ORIGIN_LEVEL_GROUPS[0]
    : (LEVEL_GROUPS.find((g) => g.id === 'lv-130') ?? LEVEL_GROUPS[1]);

  if (maps && maps.length > 0) {
    const grouped = groupMapsByLevel(maps, client);
    if (client !== 'origin') {
      const activeSeason = grouped.find((g) => g.id === 'lv-130' && g.maps.length > 0);
      if (activeSeason) return activeSeason;
    }
    const activeFirst = grouped.find((g) => g.id !== 'unknown' && g.id !== 'yu-50' && g.maps.length > 0);
    if (activeFirst) return activeFirst;
    return { ...copyLevelGroup(defaultGroup), maps: [] };
  }
  return defaultGroup;
}

/**
 * 判断指定等级组是否属于历史前尘老本（即非当前活跃赛季且非未来前瞻赛季）。
 */
export function isLegacyLevelGroup(
  group: Pick<CatalogLevelGroup, 'id'>,
  currentSeasonId?: CatalogLevelGroupId,
): boolean {
  if (group.id === 'unknown' || group.id === 'yu-50') return false;
  const activeId = currentSeasonId ?? (LEVEL_GROUPS.find((g) => g.id === 'lv-130')?.id ?? LEVEL_GROUPS[1].id);
  return group.id !== activeId;
}

/**
 * 筛选属于前尘老副本的地图（自动排除当前活跃最新赛季及尚未公测的前瞻版本）。
 */
export function getLegacyMaps<TMap extends Pick<CatalogMap, 'expansion'>>(
  maps: readonly TMap[],
): TMap[] {
  const currentSeason = getCurrentSeasonGroup(maps);
  return maps.filter((map) => {
    const group = getLevelGroup(map.expansion);
    return group.id !== 'unknown' && group.id !== currentSeason.id && group.id !== 'yu-50';
  });
}

/**
 * 筛选所有来源均属于前尘老本的装备（不含当前活跃赛季及前瞻版本掉落）。
 */
export function getLegacyEquipment<TItem extends Pick<CatalogItem, 'sources' | 'category'>>(
  items: readonly TItem[],
  maps?: readonly Pick<CatalogMap, 'expansion'>[],
): TItem[] {
  const currentSeason = maps && maps.length > 0 ? getCurrentSeasonGroup(maps) : getCurrentSeasonGroup();
  return items.filter((item) => {
    if (item.category !== 'equipment') return false;
    if (!item.sources || item.sources.length === 0) return false;
    const groups = item.sources.map((s) => getLevelGroup(s.expansion));
    const hasKnownSources = groups.some((g) => g.id !== 'unknown');
    if (!hasKnownSources) return false;
    return groups.every((g) => g.id === 'unknown' || (g.id !== currentSeason.id && g.id !== 'yu-50'));
  });
}

const difficultyGroup = (
  id: CatalogDifficultyGroupId,
  label: string,
  difficulties: readonly string[],
): CatalogDifficultyGroup => ({ id, name: label, label, difficulties });

/** The canonical difficulty order; callers may filter buckets whose maps are empty. */
export const DIFFICULTY_GROUPS = [
  difficultyGroup('five', '5人秘境', ['5人普通', '5人英雄', '5人挑战', '历程5人普通', '5人家园']),
  difficultyGroup('10-normal', '10人普通秘境', ['10人普通']),
  difficultyGroup('10-hero', '10人英雄秘境', ['10人英雄']),
  difficultyGroup('10-challenge', '10人挑战秘境', ['10人挑战']),
  difficultyGroup('25-normal', '25人普通秘境', ['25人普通']),
  difficultyGroup('25-hero', '25人英雄秘境', ['25人英雄']),
  difficultyGroup('25-challenge', '25人挑战秘境', ['25人挑战']),
  difficultyGroup('other', '其他秘境', []),
] as const satisfies readonly CatalogDifficultyGroup[];

export const CATALOG_DIFFICULTY_GROUPS = DIFFICULTY_GROUPS;

const DIFFICULTY_TO_GROUP = new Map<string, CatalogDifficultyGroupId>();
for (const group of DIFFICULTY_GROUPS) {
  for (const difficulty of group.difficulties) DIFFICULTY_TO_GROUP.set(difficulty, group.id);
}

/** Classify a raw difficulty while retaining unsupported values in `other`. */
export function classifyMapDifficulty(difficulty: string | null | undefined): CatalogDifficultyGroupId {
  const normalized = typeof difficulty === 'string' ? difficulty.trim() : '';
  return DIFFICULTY_TO_GROUP.get(normalized) ?? 'other';
}

export function getDifficultyGroup(difficulty: string | null | undefined): CatalogDifficultyGroup {
  const id = classifyMapDifficulty(difficulty);
  return DIFFICULTY_GROUPS.find((group) => group.id === id) ?? DIFFICULTY_GROUPS[DIFFICULTY_GROUPS.length - 1];
}

export const findDifficultyGroup = getDifficultyGroup;

export type MapsByDifficulty<TMap extends Pick<CatalogMap, 'difficulty' | 'mapId'>> = CatalogDifficultyGroup & {
  maps: TMap[];
};

function sortMapsByMapIdDescending<TMap extends Pick<CatalogMap, 'mapId'>>(maps: readonly TMap[]): TMap[] {
  return maps
    .map((map, index) => ({ map, index }))
    .sort((left, right) => right.map.mapId - left.map.mapId || left.index - right.index)
    .map(({ map }) => map);
}

/** Group maps in the fixed difficulty order, preserving empty buckets. */
export function groupMapsByDifficulty<TMap extends Pick<CatalogMap, 'difficulty' | 'mapId'>>(
  maps: readonly TMap[],
): MapsByDifficulty<TMap>[] {
  const buckets = new Map<CatalogDifficultyGroupId, TMap[]>();
  for (const group of DIFFICULTY_GROUPS) buckets.set(group.id, []);

  for (const map of maps) buckets.get(classifyMapDifficulty(map.difficulty))?.push(map);

  return DIFFICULTY_GROUPS.map((group) => ({
    ...group,
    difficulties: [...group.difficulties],
    maps: group.id === 'five' || group.id === 'other'
      ? buckets.get(group.id) ?? []
      : sortMapsByMapIdDescending(buckets.get(group.id) ?? []),
  }));
}
