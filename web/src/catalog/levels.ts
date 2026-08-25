import type {
  CatalogDifficultyGroup,
  CatalogDifficultyGroupId,
  CatalogLevelGroup,
  CatalogLevelGroupId,
  CatalogMap,
} from '../domain/types';

export type LevelGroup = CatalogLevelGroup;
export type LevelGroupId = CatalogLevelGroupId;
export type DifficultyGroup = CatalogDifficultyGroup;
export type DifficultyGroupId = CatalogDifficultyGroupId;

const levelGroup = (
  id: Exclude<CatalogLevelGroupId, 'unknown'>,
  level: number,
  expansions: readonly string[],
): CatalogLevelGroup => {
  // The first expansion is the game's canonical name for the level. Other
  // expansions stay in the mapping as second-level versions, but must not
  // make the top-level navigation label unwieldy.
  const title = expansions[0] ?? `Lv.${level}`;
  const label = `『${title}』（Lv.${level}）`;
  return { id, level, name: title, title, label, expansions };
};

/**
 * The canonical level order used by the catalog tree. Expansion names stay
 * intact here because they are the second-level version labels in the UI.
 */
export const LEVEL_GROUPS = [
  levelGroup('lv-130', 130, ['丝路风语']),
  levelGroup('lv-120', 120, ['横刀断浪']),
  levelGroup('lv-110', 110, ['奉天证道']),
  levelGroup('lv-100', 100, ['世外蓬莱']),
  levelGroup('lv-95', 95, ['剑胆琴心', '风骨霸刀', '日月凌空', '重制版']),
  levelGroup('lv-90', 90, ['安史之乱', '苍雪龙城', '血战天策', '逐鹿中原']),
  levelGroup('lv-80', 80, ['巴蜀风云', '日月明尊', '一代宗师', '烛火燎天']),
  levelGroup('lv-70', 70, ['风起稻香']),
] as const satisfies readonly CatalogLevelGroup[];

export const CATALOG_LEVEL_GROUPS = LEVEL_GROUPS;

export const UNKNOWN_LEVEL_GROUP: CatalogLevelGroup = {
  id: 'unknown',
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

/**
 * Group maps in the fixed level order. All eight canonical buckets are
 * returned, including empty ones; an unknown bucket is appended only when it
 * contains maps so that imported/future data remains visible.
 */
export function groupMapsByLevel<TMap extends Pick<CatalogMap, 'expansion'>>(
  maps: readonly TMap[],
): MapsByLevel<TMap>[] {
  const buckets = new Map<CatalogLevelGroupId, TMap[]>();
  for (const group of LEVEL_GROUPS) buckets.set(group.id, []);
  const unknownMaps: TMap[] = [];

  for (const map of maps) {
    const group = getLevelGroup(map.expansion);
    if (group.id === 'unknown') unknownMaps.push(map);
    else buckets.get(group.id)?.push(map);
  }

  const result = LEVEL_GROUPS.map((group) => ({
    ...copyLevelGroup(group),
    maps: buckets.get(group.id) ?? [],
  }));
  if (unknownMaps.length > 0) result.push({ ...unknownGroupForMaps(unknownMaps), maps: unknownMaps });
  return result;
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
