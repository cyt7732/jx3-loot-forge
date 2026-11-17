import type { CatalogItem, ItemCategory, ItemState, StateField } from '../domain/types';
import { downloadBytes } from '../utils/download';
import type { ItemDisposition } from './types';

export const CATEGORY_ICONS: Record<ItemCategory, string> = {
  equipment: '⚔️',
  equipmentExchange: '🎫',
  specialWeapon: '🗡️',
  material: '🪵',
  specialDrop: '💎',
  recipe: '📜',
  furniture: '🪑',
  smallIron: '⛏️',
  bigIron: '🔥',
  smallEnchant: '✨',
  bigEnchant: '🌟',
  pet: '🐾',
  unknown: '📦',
  consumable: '🧪',
  task: '📜',
  currency: '🪙',
  companion: '🥋',
  other: '📦',
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

export function shanghaiDateStamp(now = new Date()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function downloadBatchFile(file: { filename: string; bytes: Uint8Array }): void {
  downloadBytes(file.filename, file.bytes);
}
