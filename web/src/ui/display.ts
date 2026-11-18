import type { CatalogItem, ItemCategory, ItemState, StateField } from '../domain/types';
import { downloadBytes } from '../utils/download';
import type { ItemDisposition } from './types';
import equipmentIcon from '../assets/category-icons/equipment.png';
import equipmentExchangeIcon from '../assets/category-icons/equipmentExchange.png';
import specialWeaponIcon from '../assets/category-icons/specialWeapon.png';
import materialIcon from '../assets/category-icons/material.png';
import specialDropIcon from '../assets/category-icons/specialDrop.png';
import recipeIcon from '../assets/category-icons/recipe.png';
import furnitureIcon from '../assets/category-icons/furniture.png';
import smallIronIcon from '../assets/category-icons/smallIron.png';
import bigIronIcon from '../assets/category-icons/bigIron.png';
import smallEnchantIcon from '../assets/category-icons/smallEnchant.png';
import bigEnchantIcon from '../assets/category-icons/bigEnchant.png';
import petIcon from '../assets/category-icons/pet.png';
import unknownIcon from '../assets/category-icons/unknown.png';
import consumableIcon from '../assets/category-icons/consumable.png';
import taskIcon from '../assets/category-icons/task.png';
import currencyIcon from '../assets/category-icons/currency.png';
import companionIcon from '../assets/category-icons/companion.png';
import otherIcon from '../assets/category-icons/other.png';

/**
 * 分类图标取自剑网3官方图标库（https://icon.jx3box.com/icon/<IconID>.png），
 * 多为对应分类的代表性物品图标，已固化为本地资源以保证离线单文件版可用：
 * 装备=i7884、兑换牌=元元帽、特效武器=炎枪重黎、材料=i7530、特殊掉落=星云踏月骓、
 * 书籍=剑舞诀、家具=九天阖闾、小铁=天外陨铁、大铁=醉月玄晶、宠物=兔每每、
 * 消耗品=下品长生丸、货币=金叶子、侠客养成=冰心诀秘卷、小/大附魔=磨石与附魔道具、
 * 任务物品=任务卷轴、其他=背包、未分类=杂艺卷轴。
 */
export const CATEGORY_ICONS: Record<ItemCategory, string> = {
  equipment: equipmentIcon,
  equipmentExchange: equipmentExchangeIcon,
  specialWeapon: specialWeaponIcon,
  material: materialIcon,
  specialDrop: specialDropIcon,
  recipe: recipeIcon,
  furniture: furnitureIcon,
  smallIron: smallIronIcon,
  bigIron: bigIronIcon,
  smallEnchant: smallEnchantIcon,
  bigEnchant: bigEnchantIcon,
  pet: petIcon,
  unknown: unknownIcon,
  consumable: consumableIcon,
  task: taskIcon,
  currency: currencyIcon,
  companion: companionIcon,
  other: otherIcon,
};

export const STATE_LABELS: Record<StateField, string> = {
  skipLoot: '跳过拾取',
  autoSell: '自动出售',
  protect: '保护不出售',
};

export function sourceKey(mapId: number, bossName: string): string {
  return `${mapId}:${encodeURIComponent(bossName)}`;
}

export function stateSummary(state: ItemState): string {
  const labels = [state.skipLoot && '跳过拾取', state.autoSell && '自动出售', state.protect && '保护不出售'].filter(Boolean);
  return labels.length ? labels.join('、') : '未配置';
}

export function itemDisposition(state: ItemState): ItemDisposition {
  if (state.autoSell) return 'autoSell';
  if (state.protect) return 'protect';
  return 'none';
}

export function itemQualityClass(item: Pick<CatalogItem, 'quality' | 'qualityMin' | 'qualityMax'>): string | undefined {
  const value = item.qualityMax ?? item.quality ?? item.qualityMin;
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const quality = Math.min(5, Math.max(0, Math.round(value)));
  return `q-${quality}`;
}

export function formatItemLevel(item: Pick<CatalogItem, 'itemLevel' | 'itemLevelMin' | 'itemLevelMax'>): string {
  const min = item.itemLevelMin ?? item.itemLevel;
  const max = item.itemLevelMax ?? item.itemLevel;
  if (typeof max !== 'number' || !Number.isFinite(max)) return '';
  if (typeof min === 'number' && Number.isFinite(min) && min !== max) return `${min}–${max}`;
  return String(max);
}

export function itemMetaText(item: Pick<CatalogItem, 'subtype' | 'itemLevel' | 'itemLevelMin' | 'itemLevelMax'>): string {
  const parts: string[] = [];
  if (item.subtype) parts.push(item.subtype);
  const level = formatItemLevel(item);
  if (level) parts.push(`品质等级 ${level}`);
  return parts.join(' · ');
}

/** 分类明细的两组展示数据：类型（subtype）与品质等级，供物品抽屉拆成两个独立泡泡 */
export function itemMetaParts(item: Pick<CatalogItem, 'subtype' | 'itemLevel' | 'itemLevelMin' | 'itemLevelMax'>): { type: string; qualityLevel: string } {
  return {
    type: item.subtype ?? '',
    qualityLevel: formatItemLevel(item),
  };
}

export function shanghaiDateStamp(now = new Date()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function downloadBatchFile(file: { filename: string; bytes: Uint8Array }): void {
  downloadBytes(file.filename, file.bytes);
}
