import type { ItemCategory, ItemState, WorkspaceFilters } from './types';

export const APP_NAME = '剑网3掉落工坊';
export const APP_VERSION = '0.2.1';
export const AUTHOR = '凌千羽·龙争虎斗';
export const CLIENT = 'std' as const;
export const WORKSPACE_STORAGE_KEY = 'jx3-loot-forge:workspace:v1';

export const EMPTY_ITEM_STATE: ItemState = Object.freeze({
  skipLoot: false,
  autoSell: false,
  protect: false,
});

export const DEFAULT_FILTERS: WorkspaceFilters = Object.freeze({
  query: '',
  categories: [],
  qualities: [],
  slots: [],
  itemLevelMin: null,
  itemLevelMax: null,
  stateView: 'all',
});

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  equipment: '装备',
  material: '材料',
  recipe: '秘籍',
  consumable: '消耗品',
  currency: '货币 / 兑换',
  other: '其他',
  unknown: '未分类',
};

export const DEFAULT_PROTECTED_ITEMS = [
  '炎枪重黎',
  '腾空',
  '圆月双角',
  '五项斩',
  '麒王逐魂',
  '金红狩命',
  '秋声烛影',
  '旧禅镇',
  '相映红',
  '石剑·溟灵',
  '秋露白',
  '曳影残剑',
  '赐清平',
  '卦预乾坤',
  '朝露昙华',
  '夜话白鹭·鸿',
  '金红狩命·鸿',
  '秋声烛影·鸿',
  '钧天·鸿',
  '水长生 ·雪银莲',
  '溯·鸿',
] as const;

export const LEGACY_DEFAULT_SELL_ITEMS = [
  '下品长生丸', '下品凝神丸', '戏虎图·四', '戏虎图·三', '戏虎图·二', '戏虎图·一',
  '剑客行·残页', '破碎的金玄玉', '大片真银叶子', '真银叶子', '银叶子·试炼之地',
  '银叶子', '大片金叶子', '金粉末', '金叶子·美人图', '金叶子', '金条', '金砖', '金块',
] as const;

export const MANAGED_PATHS = {
  skipLoot: 'MY_GKPLoot.tAutoPickupFilters',
  autoSell: 'MY_AutoSell.tSellItem',
  protect: 'MY_AutoSell.tProtectItem',
} as const;

export const RESERVED_MARKER_PATTERNS = [
  /^『剑网3掉落工坊』 v\d+\.\d+\.\d+ by 凌千羽·龙争虎斗 <\d{8}_\d{6}>$/u,
  /^【剑网3掉落工坊\|by 凌千羽@龙争虎斗\|跳过拾取\|\d{8}-\d{6}】$/u,
  /^【剑网3掉落工坊\|by 凌千羽@龙争虎斗\|自动出售\|\d{8}-\d{6}】$/u,
  /^『JX3 Loot Forge』 v\d+\.\d+\.\d+ by 凌千羽·龙争虎斗 <\d{8}_\d{6}>$/u,
  /^【JX3 Loot Forge\|by 凌千羽@龙争虎斗\|跳过拾取\|\d{8}-\d{6}】$/u,
  /^【JX3 Loot Forge\|by 凌千羽@龙争虎斗\|自动出售\|\d{8}-\d{6}】$/u,
] as const;
