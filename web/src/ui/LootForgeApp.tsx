'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildCatalogItems,
  CATALOG_LEVEL_GROUPS,
  catalogSnapshot,
  groupMapsByDifficulty,
  groupMapsByLevel,
  getLevelGroup,
  loadCatalogSnapshot,
} from '../catalog';
import { buildExportBatch } from '../config/exporter';
import { parseManagedConfig, previewImport, validateItemName } from '../config/importer';
import {
  APP_NAME,
  APP_NAME_EN,
  APP_VERSION,
  AUTHOR,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  DEFAULT_PROTECTED_ITEMS,
} from '../domain/constants';
import {
  applyChanges,
  cloneState,
  createCategoryActionRules,
  createEmptyBulkRules,
  createEquipmentBulkRules,
  createInitialWorkspace,
  normalizeItemName,
  previewBulkRules,
  removeCustomItemFromWorkspace,
  setStateField,
  stateMapFromWorkspace,
  workspaceWithStateMap,
} from '../domain/state';
import type {
  BatchActionType,
  BulkRuleSet,
  CatalogItem,
  CatalogMap,
  CatalogSnapshot,
  ImportMode,
  ImportPreview,
  ItemCategory,
  ItemState,
  ParsedManagedConfig,
  StateField,
  Workspace,
} from '../domain/types';
import { assertGbkEncodable, decodeGbk } from '../encoding/gbk';
import {
  clearCatalogOverride,
  loadCatalogOverride,
  parseCatalogDataPack,
  saveCatalogOverride,
  selectCatalogSnapshot,
} from '../storage/catalog';
import {
  assertFileSizeWithinLimit,
  executeDebouncedSave,
  exportWorkspaceBackup,
  handleWorkspaceInitialization,
  MAX_DATA_PACK_BYTES,
  readWorkspaceBackupFile,
  resetWorkspace,
} from '../storage/workspace';
import logoImg from '../assets/logo.jpg';
import { downloadBytes, downloadText } from '../utils/download';

const CUSTOM_SCOPE_ID = -1;

type ViewItem = CatalogItem & {
  isCustom: boolean;
  customOverride: boolean;
  systemSeed: boolean;
  historical: boolean;
};

type ImportDraft = {
  filename: string;
  parsed: ParsedManagedConfig;
  mode: ImportMode;
  preview: ImportPreview;
};

type DialogName = 'custom' | 'workspace' | 'import' | null;
type Toast = { tone: 'success' | 'warning' | 'error'; message: string } | null;
type ItemDisposition = 'none' | 'autoSell' | 'protect';

const CATEGORY_ICONS: Record<ItemCategory, string> = {
  equipment: '⚔️',
  equipmentExchange: '🎫',
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
  other: '📦',
};
const STATE_LABELS: Record<StateField, string> = {
  skipLoot: '跳过拾取',
  autoSell: '自动出售',
  protect: '保护不出售',
};
function sourceKey(mapId: number, bossName: string): string {
  return `${mapId}:${encodeURIComponent(bossName)}`;
}

function stateSummary(state: ItemState): string {
  const labels = [state.skipLoot && '跳过拾取', state.autoSell && '自动出售', state.protect && '保护不出售'].filter(Boolean);
  return labels.length ? labels.join('、') : '未配置';
}

function itemDisposition(state: ItemState): ItemDisposition {
  if (state.autoSell) return 'autoSell';
  if (state.protect) return 'protect';
  return 'none';
}


function shanghaiDateStamp(now = new Date()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatCatalogVersion(version: string): string {
  if (!version || version === 'loading') return 'Data.载入中…';
  const match = /^(?:20)?(\d{2})(\d{2})(\d{2})/u.exec(version);
  const dateSuffix = match ? `${match[1]}${match[2]}${match[3]}` : version.slice(0, 6);
  return `Data.丝路风语-${dateSuffix}`;
}

function downloadBatchFile(file: { filename: string; bytes: Uint8Array }): void {
  downloadBytes(file.filename, file.bytes);
}

export function LootForgeApp() {
  const [activeSnapshot, setActiveSnapshot] = useState(catalogSnapshot);
  const [embeddedSnapshot, setEmbeddedSnapshot] = useState<CatalogSnapshot | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>(() => createInitialWorkspace(catalogSnapshot.catalogVersion));
  const [hydrated, setHydrated] = useState(false);
  const [persistenceEnabled, setPersistenceEnabled] = useState(false);
  const [catalogIndexed, setCatalogIndexed] = useState(false);
  const [scopeQuery, setScopeQuery] = useState('');
  const [dialog, setDialog] = useState<DialogName>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [importDraft, setImportDraft] = useState<ImportDraft | null>(null);
  const [customInput, setCustomInput] = useState('');
  const [undoWorkspace, setUndoWorkspace] = useState<Workspace | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<ItemCategory | null>(null);
  const [drawerQuery, setDrawerQuery] = useState('');
  const [drawerStateView, setDrawerStateView] = useState<'all' | 'configured' | 'unconfigured' | 'protected'>('all');
  const [drawerPage, setDrawerPage] = useState(1);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const configInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const dataPackInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [exportMenuOpen]);

  useEffect(() => {
    let cancelled = false;
    let cancelIndexing: () => void = () => undefined;
    const initialize = async () => {
      try {
        const [embedded, override] = await Promise.all([
          loadCatalogSnapshot(),
          loadCatalogOverride().catch(() => null),
        ]);
        if (cancelled) return;
        const selection = selectCatalogSnapshot(embedded, override);
        setEmbeddedSnapshot(embedded);
        setActiveSnapshot(selection.snapshot);
        const { workspace: restoredWorkspace, persistenceEnabled: isPersistent } = handleWorkspaceInitialization(
          selection.snapshot.catalogVersion,
          (notif) => setToast(notif),
        );
        setWorkspace(selection.usedOverride
          ? { ...restoredWorkspace, catalogVersion: selection.snapshot.catalogVersion, updatedAt: new Date().toISOString() }
          : restoredWorkspace);
        setPersistenceEnabled(isPersistent);
        setHydrated(true);

        const markIndexed = () => {
          if (!cancelled) setCatalogIndexed(true);
        };
        if (typeof window.requestIdleCallback === 'function') {
          const idle = window.requestIdleCallback(markIndexed, { timeout: 150 });
          cancelIndexing = () => window.cancelIdleCallback(idle);
        } else {
          const idle = window.setTimeout(markIndexed, 0);
          cancelIndexing = () => window.clearTimeout(idle);
        }
      } catch (error) {
        if (!cancelled) {
          // On catalog initialization failure, DO NOT enable persistence to prevent wiping user's localStorage
          setPersistenceEnabled(false);
          setHydrated(true);
          setToast({ tone: 'error', message: `初始化加载失败：${error instanceof Error ? error.message : String(error)}。已启用只读保护，未覆盖本地存储。` });
        }
      }
    };
    void initialize();
    return () => {
      cancelled = true;
      cancelIndexing();
    };
  }, []);

  const activeCatalogItems = useMemo(() => (catalogIndexed ? buildCatalogItems(activeSnapshot) : []), [activeSnapshot, catalogIndexed]);

  useEffect(() => {
    if (!hydrated || !persistenceEnabled) return;
    const timer = window.setTimeout(() => {
      executeDebouncedSave(workspace, persistenceEnabled, hydrated, (notif) => setToast(notif));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [workspace, hydrated, persistenceEnabled]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('.modal-card button, .modal-card input, .modal-card textarea, .modal-card select')?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setDialog(null);
        return;
      }
      if (event.key !== 'Tab') return;
      const modal = document.querySelector<HTMLElement>('.modal-card');
      const focusable = modal ? [...modal.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')] : [];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      previous?.focus();
    };
  }, [dialog]);

  const stateMap = useMemo(() => stateMapFromWorkspace(workspace), [workspace]);
  const customOverrides = useMemo(() => new Set(workspace.customOverrides), [workspace.customOverrides]);
  const catalogIdSet = useMemo(() => new Set(activeCatalogItems.map((item) => item.id)), [activeCatalogItems]);
  const protectedSeedSet = useMemo(() => new Set(DEFAULT_PROTECTED_ITEMS.map(normalizeItemName)), []);

  const allItems = useMemo<ViewItem[]>(() => {
    const byId = new Map<string, ViewItem>();
    for (const item of activeCatalogItems) {
      byId.set(item.id, {
        ...item,
        isCustom: false,
        customOverride: customOverrides.has(item.id),
        systemSeed: protectedSeedSet.has(item.id),
        historical: false,
      });
    }
    for (const custom of workspace.customItems) {
      const existing = byId.get(custom.id);
      if (existing) {
        byId.set(custom.id, {
          ...existing,
          category: custom.category ?? existing.category,
          isCustom: true,
          customOverride: true,
        });
      } else {
        byId.set(custom.id, {
          id: custom.id,
          name: custom.name,
          category: custom.category ?? 'other',
          subtype: custom.note ?? '自定义物品',
          sources: [],
          isCustom: true,
          customOverride: true,
          systemSeed: protectedSeedSet.has(custom.id),
          historical: false,
        });
      }
    }
    for (const [id, state] of stateMap) {
      if (!byId.has(id) && (state.skipLoot || state.autoSell || state.protect)) {
        byId.set(id, {
          id,
          name: id,
          category: 'unknown',
          subtype: '历史状态（已从当前目录移除）',
          sources: [],
          isCustom: false,
          customOverride: false,
          systemSeed: false,
          historical: true,
        });
      }
    }
    return [...byId.values()];
  }, [activeCatalogItems, customOverrides, protectedSeedSet, stateMap, workspace.customItems]);

  const selectedMaps = useMemo(() => new Set(workspace.selectedMapIds), [workspace.selectedMapIds]);
  const selectedBosses = useMemo(() => new Set(workspace.selectedBossKeys), [workspace.selectedBossKeys]);
  const hasScope = selectedMaps.size > 0 || selectedBosses.size > 0;

  const mapSelection = (map: CatalogMap) => {
    if (selectedMaps.has(map.mapId)) return { full: true, partial: false };
    const selectedBossCount = map.bossNames.reduce((count, boss) => count + (selectedBosses.has(sourceKey(map.mapId, boss)) ? 1 : 0), 0);
    return {
      full: map.bossNames.length > 0 && selectedBossCount === map.bossNames.length,
      partial: selectedBossCount > 0 && selectedBossCount < map.bossNames.length,
    };
  };

  const mapsSelection = (maps: CatalogMap[]) => {
    const selectedMapCount = maps.filter((map) => selectedMaps.has(map.mapId)).length;
    const fullCount = maps.filter((map) => mapSelection(map).full).length;
    const partial = maps.some((map) => mapSelection(map).partial);
    return {
      selectedMapCount,
      full: maps.length > 0 && fullCount === maps.length,
      partial: partial || (fullCount > 0 && fullCount < maps.length),
    };
  };

  const levelGroups = useMemo(() => {
    const query = scopeQuery.trim();
    return groupMapsByLevel(activeSnapshot.maps)
      .map((levelGroup) => {
        const levelMatches = !query
          || levelGroup.label.includes(query)
          || levelGroup.name.includes(query)
          || levelGroup.expansions.some((expansion) => expansion.includes(query));
        const difficultyGroups = groupMapsByDifficulty(levelGroup.maps)
          .map((difficultyGroup) => {
            const difficultyMatches = !query
              || levelMatches
              || difficultyGroup.label.includes(query)
              || difficultyGroup.name.includes(query)
              || difficultyGroup.difficulties.some((difficulty) => difficulty.includes(query));
            const maps = difficultyGroup.maps.filter((map) => difficultyMatches
              || map.name.includes(query)
              || map.difficulty.includes(query)
              || map.bossNames.some((boss) => boss.includes(query)));
            return { ...difficultyGroup, maps };
          })
          .filter((difficultyGroup) => difficultyGroup.maps.length > 0);
        return { ...levelGroup, maps: difficultyGroups.flatMap((group) => group.maps), difficultyGroups };
      })
      .filter((group) => group.maps.length > 0);
  }, [activeSnapshot.maps, scopeQuery]);

  const customCount = useMemo(() => {
    return allItems.filter((item) => item.isCustom || item.customOverride || item.historical).length;
  }, [allItems]);

  const sourceMatchesScope = (item: ViewItem): boolean => {
    const isCustomItem = Boolean(item.isCustom || item.customOverride || item.historical);
    if (!hasScope) return isCustomItem;
    const matchesCustom = selectedMaps.has(CUSTOM_SCOPE_ID) && isCustomItem;
    const matchesSource = item.sources.some((source) => selectedMaps.has(source.mapId) || selectedBosses.has(sourceKey(source.mapId, source.bossName)));
    return matchesCustom || matchesSource;
  };

  const availableCategories = useMemo(() => {
    const counts = Object.fromEntries(CATEGORY_ORDER.map((category) => [category, 0])) as Record<ItemCategory, number>;
    for (const item of allItems) {
      if (!sourceMatchesScope(item)) continue;
      counts[item.category] += 1;
    }
    return CATEGORY_ORDER.filter((category) => counts[category] > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems, hasScope, selectedMaps, selectedBosses]);

  const scopedItems = useMemo(() => {
    return allItems.filter((item) => sourceMatchesScope(item));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems, hasScope, selectedMaps, selectedBosses]);

  const scopeStats = useMemo(() => {
    let skipLoot = 0;
    let autoSell = 0;
    let protect = 0;
    let sourceLinks = 0;
    let repeatedNames = 0;
    for (const item of scopedItems) {
      const state = stateMap.get(item.id);
      if (state?.skipLoot) skipLoot += 1;
      if (state?.autoSell) autoSell += 1;
      if (state?.protect) protect += 1;
      sourceLinks += item.sources.length;
      if (item.sources.length > 1) repeatedNames += 1;
    }
    return { skipLoot, autoSell, protect, sourceLinks, repeatedNames };
  }, [scopedItems, stateMap]);

  const DRAWER_PAGE_SIZE = 20;

  const drawerItems = useMemo(() => {
    if (!expandedCategory) return [];
    const query = drawerQuery.trim().normalize('NFC');
    return allItems.filter((item) => {
      if (item.category !== expandedCategory) return false;
      if (!sourceMatchesScope(item)) return false;
      if (query && !item.name.normalize('NFC').includes(query) && !item.sources.some((source) => `${source.expansion}${source.mapName}${source.bossName}`.includes(query))) return false;
      const state = cloneState(stateMap.get(item.id));
      if (drawerStateView === 'configured' && !state.skipLoot && !state.autoSell && !state.protect) return false;
      if (drawerStateView === 'unconfigured' && (state.skipLoot || state.autoSell || state.protect)) return false;
      if (drawerStateView === 'protected' && !state.protect) return false;
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedCategory, drawerQuery, drawerStateView, allItems, stateMap, hasScope, selectedMaps, selectedBosses]);

  const drawerTotalPages = Math.max(1, Math.ceil(drawerItems.length / DRAWER_PAGE_SIZE));
  const currentDrawerPage = Math.min(drawerPage, drawerTotalPages);
  const visibleDrawerItems = drawerItems.slice((currentDrawerPage - 1) * DRAWER_PAGE_SIZE, currentDrawerPage * DRAWER_PAGE_SIZE);

  const commitStateMap = (nextMap: Map<string, ItemState>, keepUndo = true) => {
    if (keepUndo) setUndoWorkspace(workspace);
    setWorkspace((current) => workspaceWithStateMap(current, nextMap));
  };

  const toggleItemState = (item: ViewItem, field: StateField) => {
    const next = new Map(stateMap);
    const before = cloneState(next.get(item.id));
    next.set(item.id, setStateField(before, field, !before[field]));
    commitStateMap(next);
  };

  const setItemDisposition = (item: ViewItem, disposition: ItemDisposition) => {
    const next = new Map(stateMap);
    let nextState = cloneState(next.get(item.id));
    if (disposition === 'autoSell') {
      nextState = setStateField(nextState, 'protect', false);
      nextState = setStateField(nextState, 'autoSell', true);
    } else if (disposition === 'protect') {
      nextState = setStateField(nextState, 'autoSell', false);
      nextState = setStateField(nextState, 'protect', true);
    } else {
      nextState = setStateField(nextState, 'autoSell', false);
      nextState = setStateField(nextState, 'protect', false);
    }
    next.set(item.id, nextState);
    commitStateMap(next);
  };

  const toggleMap = (mapId: number) => {
    setWorkspace((current) => {
      const selected = new Set(current.selectedMapIds);
      if (selected.has(mapId)) selected.delete(mapId); else selected.add(mapId);
      return {
        ...current,
        selectedMapIds: [...selected],
        selectedBossKeys: current.selectedBossKeys.filter((key) => !key.startsWith(`${mapId}:`)),
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const toggleBoss = (mapId: number, bossName: string) => {
    const key = sourceKey(mapId, bossName);
    setWorkspace((current) => {
      const bosses = new Set(current.selectedBossKeys);
      if (bosses.has(key)) bosses.delete(key); else bosses.add(key);
      return {
        ...current,
        selectedMapIds: current.selectedMapIds.filter((id) => id !== mapId),
        selectedBossKeys: [...bosses],
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const toggleMapGroup = (maps: CatalogMap[]) => {
    setWorkspace((current) => {
      const selected = new Set(current.selectedMapIds);
      const bosses = new Set(current.selectedBossKeys);
      const allSelected = maps.length > 0 && maps.every((map) => selected.has(map.mapId)
        || (map.bossNames.length > 0 && map.bossNames.every((boss) => bosses.has(sourceKey(map.mapId, boss)))));
      for (const map of maps) {
        if (allSelected) selected.delete(map.mapId);
        else selected.add(map.mapId);
      }
      const mapIds = new Set(maps.map((map) => map.mapId));
      return {
        ...current,
        selectedMapIds: [...selected],
        selectedBossKeys: [...bosses].filter((key) => !mapIds.has(Number(key.split(':')[0]))),
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const currentScopeLabel = useMemo(() => {
    if (!hasScope) return '尚未选择范围';
    const parts: string[] = [];
    if (selectedMaps.has(CUSTOM_SCOPE_ID)) parts.push('✨ 用户自定义');
    const officialMaps = [...selectedMaps].filter((id) => id !== CUSTOM_SCOPE_ID);
    if (officialMaps.length > 0) parts.push(`${officialMaps.length} 个副本`);
    if (selectedBosses.size > 0) parts.push(`${selectedBosses.size} 个 Boss`);
    if (parts.length === 0) return '尚未选择范围';
    return parts.join(' + ');
  }, [hasScope, selectedBosses.size, selectedMaps]);

  const categoryWorkbenchSummaries = useMemo(() => {
    const summaryMap = new Map<ItemCategory, {
      category: ItemCategory;
      total: number;
      skipLootCount: number;
      autoSellCount: number;
      protectCount: number;
      noneCount: number;
    }>();

    for (const cat of availableCategories) {
      summaryMap.set(cat, {
        category: cat,
        total: 0,
        skipLootCount: 0,
        autoSellCount: 0,
        protectCount: 0,
        noneCount: 0,
      });
    }

    for (const item of allItems) {
      if (!sourceMatchesScope(item)) continue;
      const entry = summaryMap.get(item.category);
      if (!entry) continue;
      entry.total += 1;
      const state = stateMap.get(item.id);
      if (state?.skipLoot) entry.skipLootCount += 1;
      if (state?.autoSell) entry.autoSellCount += 1;
      else if (state?.protect) entry.protectCount += 1;
      else entry.noneCount += 1;
    }

    return availableCategories.map((cat) => summaryMap.get(cat)!).filter((s) => s && s.total > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems, availableCategories, hasScope, selectedMaps, selectedBosses, stateMap]);

  const applyCategoryDirectAction = (category: ItemCategory, action: BatchActionType) => {
    const scopedCategoryOfficial = allItems.filter((item) => (
      item.category === category
      && !item.customOverride
      && !item.historical
      && sourceMatchesScope(item)
    ));
    const rules = createCategoryActionRules(category, action);
    const preview = previewBulkRules(scopedCategoryOfficial, stateMap, customOverrides, rules);
    if (preview.changes.length === 0) {
      setToast({ tone: 'warning', message: `【${CATEGORY_LABELS[category]}】已处于目标策略状态，无需更改。` });
      return;
    }
    const actionLabel: Record<BatchActionType, string> = {
      autoSell: '设为自动出售',
      protect: '设为保护不出售',
      none: '清除出售策略',
      skipLoot: '设为跳过拾取',
      unskipLoot: '恢复正常拾取',
      clearAll: '清除全部策略',
    };
    commitStateMap(applyChanges(stateMap, preview.changes));
    setToast({ tone: 'success', message: `已将【${CATEGORY_LABELS[category]}】(${preview.changes.length}项) ${actionLabel[action]}，可随时撤销。` });
  };

  const applyScopePreset = (kind: 'farming' | 'clear' | 'lowerLevels') => {
    if (!hasScope && kind !== 'lowerLevels') {
      setToast({ tone: 'warning', message: '请先在左侧勾选要配置的副本或版本范围。' });
      return;
    }
    const scopedAllOfficial = allItems.filter((item) => (
      !item.customOverride
      && !item.historical
      && sourceMatchesScope(item)
    ));

    if (kind === 'lowerLevels') {
      const officialEquipment = allItems.filter((item) => item.category === 'equipment' && !item.customOverride && !item.historical);
      const maxLevel = Math.max(...CATALOG_LEVEL_GROUPS.map((group) => group.level ?? Number.NEGATIVE_INFINITY));
      const lowerLevelEquipment = officialEquipment.filter((item) => {
        const sourceLevels = item.sources.map((source) => getLevelGroup(source.expansion).level).filter((level): level is number => level !== null);
        return sourceLevels.length > 0 && Math.max(...sourceLevels) < maxLevel;
      });
      const preview = previewBulkRules(lowerLevelEquipment, stateMap, customOverrides, createEquipmentBulkRules('autoSell'));
      if (preview.changes.length === 0) {
        setToast({ tone: 'warning', message: '所有历史低等级装备已处于自动出售状态。' });
        return;
      }
      commitStateMap(applyChanges(stateMap, preview.changes));
      setToast({ tone: 'success', message: `已将 ${preview.changes.length} 项历史旧版本装备设为自动出售，可随时撤销。` });
      return;
    }

    let rules: BulkRuleSet;
    let desc = '';
    if (kind === 'farming') {
      rules = createEmptyBulkRules();
      rules.equipment.autoSell = 'enable';
      rules.equipment.protect = 'disable';
      rules.equipmentExchange.skipLoot = 'enable';
      rules.specialDrop.protect = 'enable';
      rules.specialDrop.autoSell = 'disable';
      rules.pet.protect = 'enable';
      rules.pet.autoSell = 'disable';
      rules.bigIron.protect = 'enable';
      rules.bigIron.autoSell = 'disable';
      rules.furniture.protect = 'enable';
      rules.furniture.autoSell = 'disable';
      desc = '推荐预设 (旧装备全卖 + 牌子跳过 + 珍稀保护)';
    } else {
      rules = createEmptyBulkRules();
      for (const cat of CATEGORY_ORDER) {
        rules[cat].autoSell = 'disable';
        rules[cat].protect = 'disable';
        rules[cat].skipLoot = 'disable';
      }
      desc = '清空当前范围策略';
    }
    const preview = previewBulkRules(scopedAllOfficial, stateMap, customOverrides, rules);
    if (preview.changes.length === 0) {
      setToast({ tone: 'warning', message: `当前范围已符合【${desc}】，无变更项。` });
      return;
    }
    commitStateMap(applyChanges(stateMap, preview.changes));
    setToast({ tone: 'success', message: `已在当前范围应用【${desc}】(${preview.changes.length}项变更)，可随时撤销。` });
  };

  const addCustomItems = () => {
    try {
      const lines = customInput.replace(/\r/gu, '').split('\n').filter((line) => line.length > 0);
      if (lines.length === 0) throw new Error('请至少输入一个物品名称。');
      if (lines.length > 1000) throw new Error('单次最多添加 1000 个自定义物品。');
      const ids = new Set(workspace.customItems.map((item) => item.id));
      const nextItems = [...workspace.customItems];
      const overrides = new Set(workspace.customOverrides);
      const now = new Date().toISOString();
      for (const name of lines) {
        if (!name.trim()) throw new Error('物品名称不能只包含空格。');
        validateItemName(name);
        assertGbkEncodable(name);
        const id = normalizeItemName(name);
        if (!ids.has(id)) {
          nextItems.push({ id, name, createdAt: now });
          ids.add(id);
        }
        overrides.add(id);
      }
      setWorkspace((current) => ({ ...current, customItems: nextItems, customOverrides: [...overrides], updatedAt: now }));
      setCustomInput('');
      setDialog(null);
      setToast({ tone: 'success', message: `已添加 ${lines.length} 个自定义物品；批量规则不会影响它们。` });
    } catch (error) {
      setToast({ tone: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const removeCustomOverride = (id: string) => {
    setUndoWorkspace(workspace);
    setWorkspace((current) => removeCustomItemFromWorkspace(current, id));
  };

  const removeHistoricalState = (id: string) => {
    const nextMap = new Map(stateMap);
    nextMap.delete(id);
    commitStateMap(nextMap);
  };

  const createNamedStates = () => {
    const names = new Map(allItems.map((item) => [item.id, item.name]));
    return [...stateMap.entries()].map(([id, state]) => ({ name: names.get(id) ?? id, state }));
  };

  const exportFiles = (kind: 'combined' | 'pickup' | 'sell' = 'combined') => {
    try {
      if (!catalogIndexed) throw new Error('数据目录仍在建立索引，请稍候再导出。');
      const batch = buildExportBatch(createNamedStates());
      if (kind === 'combined') {
        downloadBatchFile(batch.combined);
      } else if (kind === 'pickup') {
        downloadBatchFile(batch.pickup);
      } else if (kind === 'sell') {
        downloadBatchFile(batch.sell);
      }
      setToast({ tone: 'success', message: `配置已生成：${batch.fingerprint}` });
    } catch (error) {
      setToast({ tone: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const handleConfigFile = async (file: File) => {
    try {
      if (!file.name.endsWith('.us.jx3dat')) throw new Error('配置文件后缀必须是 .us.jx3dat。');
      if (file.size > 5 * 1024 * 1024) throw new Error('配置文件超过 5 MiB 限制。');
      const source = decodeGbk(new Uint8Array(await file.arrayBuffer()));
      const parsed = parseManagedConfig(source);
      const mode: ImportMode = 'merge';
      const preview = previewImport(parsed, mode, stateMap, activeCatalogItems);
      setImportDraft({ filename: file.name, parsed, mode, preview });
      setDialog('import');
    } catch (error) {
      setToast({ tone: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      if (configInputRef.current) configInputRef.current.value = '';
    }
  };

  const changeImportMode = (mode: ImportMode) => {
    if (!importDraft) return;
    setImportDraft({ ...importDraft, mode, preview: previewImport(importDraft.parsed, mode, stateMap, activeCatalogItems) });
  };

  const applyImport = () => {
    if (!importDraft) return;
    const now = new Date().toISOString();
    const unknownIds = new Set(importDraft.preview.unknownNames.map(normalizeItemName));
    const customItems = [...workspace.customItems];
    const existingCustom = new Set(customItems.map((item) => item.id));
    for (const name of importDraft.preview.unknownNames) {
      const id = normalizeItemName(name);
      if (!existingCustom.has(id)) customItems.push({ id, name, createdAt: now });
    }
    const nextMap = applyChanges(stateMap, importDraft.preview.changes);
    setUndoWorkspace(workspace);
    setWorkspace((current) => ({
      ...workspaceWithStateMap(current, nextMap),
      customItems,
      customOverrides: [...new Set([...current.customOverrides, ...unknownIds])],
      updatedAt: now,
    }));
    setDialog(null);
    setToast({ tone: 'success', message: `已从 ${importDraft.filename} 导入 ${importDraft.preview.changes.length} 项变更。` });
  };

  const importBackupFile = async (file: File) => {
    try {
      const restored = await readWorkspaceBackupFile(file, activeSnapshot.catalogVersion);
      setUndoWorkspace(workspace);
      setWorkspace(restored);
      setDialog(null);
      setToast({ tone: 'success', message: '工作区备份已恢复。' });
    } catch (error) {
      setToast({ tone: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = '';
    }
  };

  const activateCatalog = async (snapshot: CatalogSnapshot, message: string) => {
    await saveCatalogOverride(snapshot);
    setActiveSnapshot(snapshot);
    setCatalogIndexed(true);
    setWorkspace((current) => ({ ...current, catalogVersion: snapshot.catalogVersion, updatedAt: new Date().toISOString() }));
    setDialog(null);
    setToast({ tone: 'success', message });
  };

  const importDataPackFile = async (file: File) => {
    try {
      assertFileSizeWithinLimit(file, MAX_DATA_PACK_BYTES, '数据包');
      const snapshot = await parseCatalogDataPack(await file.text());
      await activateCatalog(snapshot, `数据目录已更新到 ${snapshot.catalogVersion}。`);
    } catch (error) {
      setToast({ tone: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      if (dataPackInputRef.current) dataPackInputRef.current.value = '';
    }
  };

  const checkCatalogUpdate = async () => {
    try {
      if (window.location.protocol === 'file:') {
        throw new Error('离线版默认不联网；请下载数据包后使用“导入数据包”。');
      }
      const manifestUrl = new URL('./data/manifest.json', window.location.href);
      const manifestResponse = await fetch(manifestUrl, { cache: 'no-store' });
      if (!manifestResponse.ok) throw new Error(`更新清单请求失败（HTTP ${manifestResponse.status}）。`);
      const manifest = await manifestResponse.json() as { contentHash?: string; catalogVersion?: string; snapshotUrl?: string };
      if (manifest.contentHash === activeSnapshot.contentHash) {
        setToast({ tone: 'success', message: '当前已经是最新数据目录。' });
        return;
      }
      if (!manifest.snapshotUrl || !window.confirm(`发现数据目录 ${manifest.catalogVersion ?? '新版本'}，现在下载并校验吗？`)) return;
      const snapshotResponse = await fetch(new URL(manifest.snapshotUrl, manifestUrl), { cache: 'no-store' });
      if (!snapshotResponse.ok) throw new Error(`数据包请求失败（HTTP ${snapshotResponse.status}）。`);
      const snapshot = await parseCatalogDataPack(await snapshotResponse.text());
      await activateCatalog(snapshot, `数据目录已更新到 ${snapshot.catalogVersion}。`);
    } catch (error) {
      setToast({ tone: 'warning', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const restoreEmbeddedCatalog = async () => {
    if (!embeddedSnapshot) return;
    await clearCatalogOverride();
    setActiveSnapshot(embeddedSnapshot);
    setCatalogIndexed(true);
    setWorkspace((current) => ({ ...current, catalogVersion: embeddedSnapshot.catalogVersion, updatedAt: new Date().toISOString() }));
    setToast({ tone: 'success', message: '已恢复随离线包附带的数据目录。' });
  };

  const doResetWorkspace = () => {
    if (!window.confirm('确定重置整个工作区吗？物品状态、自定义物品和筛选偏好都会清除。')) return;
    setUndoWorkspace(workspace);
    setWorkspace(resetWorkspace(activeSnapshot.catalogVersion));
    setDialog(null);
    setToast({ tone: 'warning', message: '工作区已恢复首次启动状态。' });
  };

  const saveFavoriteScope = () => {
    if (!hasScope) {
      setToast({ tone: 'warning', message: '当前是全部范围，请先选择副本或 Boss。' });
      return;
    }
    const name = window.prompt('给当前副本组合起个名字：');
    if (!name?.trim()) return;
    setWorkspace((current) => ({
      ...current,
      favoriteScopes: [...current.favoriteScopes, { id: crypto.randomUUID(), name: name.trim(), mapIds: [...current.selectedMapIds], bossKeys: [...current.selectedBossKeys] }],
      updatedAt: new Date().toISOString(),
    }));
  };

  const restoreFavorite = (id: string) => {
    const favorite = workspace.favoriteScopes.find((entry) => entry.id === id);
    if (!favorite) return;
    setWorkspace((current) => ({ ...current, selectedMapIds: [...favorite.mapIds], selectedBossKeys: [...(favorite.bossKeys ?? [])], updatedAt: new Date().toISOString() }));
  };

  return (
    <main className="app-shell">
      <input ref={configInputRef} hidden type="file" accept=".us.jx3dat" onChange={(event) => event.target.files?.[0] && void handleConfigFile(event.target.files[0])} />
      <input ref={backupInputRef} hidden type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && void importBackupFile(event.target.files[0])} />
      <input ref={dataPackInputRef} hidden type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && void importDataPackFile(event.target.files[0])} />

      <header className="topbar">
        <div className="brand-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-logo" src={typeof logoImg === 'string' ? logoImg : logoImg.src} alt={APP_NAME} />
          <div className="brand-meta">
            <div className="brand-line">
              <h1>{APP_NAME}</h1>
              <span className="version-pill" title={`工坊软件版本：v${APP_VERSION}`}>v{APP_VERSION}</span>
              <span className="data-version-pill" title={`副本数据库版本：${activeSnapshot.catalogVersion}（共 ${activeSnapshot.stats.maps} 个副本 · ${activeSnapshot.stats.uniqueItems.toLocaleString('zh-CN')} 件物品）`}>
                {formatCatalogVersion(activeSnapshot.catalogVersion)}
              </span>
            </div>
            <div className="brand-sub">
              <span className="brand-en">{APP_NAME_EN}</span>
              <span className="brand-dot">·</span>
              <span className="brand-author" title={`开发者/作者：${AUTHOR}`}>by {AUTHOR}</span>
              <span className="brand-dot">·</span>
              <span className="brand-tagline">全副本掉落智能管理与配置工坊</span>
            </div>
          </div>
        </div>
        <div className="header-actions">
          <span className="data-badge" title={activeSnapshot.contentHash}><i /> {catalogIndexed ? `旗舰端 · ${activeSnapshot.stats.uniqueItems.toLocaleString('zh-CN')} 项` : '目录载入中…'}</span>
          {undoWorkspace && (
            <button
              className="button ghost undo-btn"
              type="button"
              title="撤销最近一次批量或单项变更"
              onClick={() => {
                setWorkspace(undoWorkspace);
                setUndoWorkspace(null);
                setToast({ tone: 'success', message: '已撤销最近一次变更。' });
              }}
            >
              ↶ 撤销变更
            </button>
          )}
          <button className="button ghost" type="button" onClick={() => setDialog('custom')}>＋ 自定义物品</button>
          <button className="button ghost" type="button" onClick={() => setDialog('workspace')}>工作区</button>
          <button className="button ghost" type="button" onClick={() => configInputRef.current?.click()}>导入配置</button>

          <div className="export-split-group" ref={exportMenuRef}>
            <button
              className="button primary export-main-btn"
              type="button"
              disabled={!catalogIndexed}
              title="一键生成同时包含跳过拾取与自动出售的合一配置文件（游戏内一键导入，全部生效）"
              onClick={() => exportFiles('combined')}
            >
              ⚡ 导出合一配置
            </button>
            <button
              className={`button primary export-dropdown-btn ${exportMenuOpen ? 'open' : ''}`}
              type="button"
              disabled={!catalogIndexed}
              aria-label="展开更多导出选项"
              title="更多导出选项"
              onClick={() => setExportMenuOpen((open) => !open)}
            >
              ▾
            </button>
            {exportMenuOpen && (
              <div className="export-menu-popover" role="menu">
                <button
                  type="button"
                  className="export-menu-item featured"
                  onClick={() => { exportFiles('combined'); setExportMenuOpen(false); }}
                >
                  <span className="menu-icon">⚡</span>
                  <div>
                    <strong>导出合一配置 (推荐)</strong>
                    <small>跳过拾取 + 自动出售合为 1 个文件，游戏内一键导入</small>
                  </div>
                </button>
                <div className="export-menu-divider" />
                <button
                  type="button"
                  className="export-menu-item"
                  onClick={() => { exportFiles('pickup'); setExportMenuOpen(false); }}
                >
                  <span className="menu-icon">📥</span>
                  <div>
                    <strong>仅导出跳过拾取</strong>
                    <small>仅生成 MY_GKPLoot 插件配置</small>
                  </div>
                </button>
                <button
                  type="button"
                  className="export-menu-item"
                  onClick={() => { exportFiles('sell'); setExportMenuOpen(false); }}
                >
                  <span className="menu-icon">💰</span>
                  <div>
                    <strong>仅导出自动出售</strong>
                    <small>仅生成 MY_AutoSell 插件配置</small>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar glass-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">DROP SCOPE</span><h2>选择副本范围</h2></div>
            <button className="icon-button" type="button" aria-label="保存当前副本组合" onClick={saveFavoriteScope}>☆</button>
          </div>
          <label className="search-box"><span aria-hidden="true">⌕</span><input value={scopeQuery} onChange={(event) => setScopeQuery(event.target.value)} placeholder="搜索版本、副本或 Boss" /></label>
          {workspace.favoriteScopes.length > 0 && (
            <select className="favorite-select" defaultValue="" onChange={(event) => { restoreFavorite(event.target.value); event.currentTarget.value = ''; }} aria-label="载入收藏组合">
              <option value="" disabled>载入收藏组合…</option>
              {workspace.favoriteScopes.map((favorite) => <option value={favorite.id} key={favorite.id}>{favorite.name}</option>)}
            </select>
          )}
          <div className="scope-actions">
            <button type="button" onClick={() => setWorkspace((current) => ({ ...current, selectedMapIds: activeSnapshot.maps.map((map) => map.mapId), selectedBossKeys: [] }))}>全选副本</button>
            <button type="button" title="清除左侧的副本和 Boss 选择，主区显示完整目录" aria-label="清除范围并查看全部副本" onClick={() => setWorkspace((current) => ({ ...current, selectedMapIds: [], selectedBossKeys: [] }))}>清除范围</button>
          </div>
          <nav className="dungeon-tree" aria-label="副本范围">
            <div className={`tree-group custom-scope-group ${selectedMaps.has(CUSTOM_SCOPE_ID) ? 'active' : ''}`}>
              <div
                className="custom-scope-row"
                onClick={() => toggleMap(CUSTOM_SCOPE_ID)}
                role="button"
                tabIndex={0}
                title="选择所有用户手动添加、自定义覆盖及导入的历史条目"
              >
                <button
                  className={`tree-check ${selectedMaps.has(CUSTOM_SCOPE_ID) ? 'checked' : ''}`}
                  type="button"
                  aria-pressed={selectedMaps.has(CUSTOM_SCOPE_ID)}
                  aria-label="切换用户自定义范围"
                  onClick={(e) => { e.stopPropagation(); toggleMap(CUSTOM_SCOPE_ID); }}
                >
                  {selectedMaps.has(CUSTOM_SCOPE_ID) ? '✓' : ''}
                </button>
                <div className="custom-scope-meta">
                  <strong>✨ 用户自定义</strong>
                  <small>手动添加 / 外部导入 / 历史条目</small>
                </div>
                <span className="custom-scope-badge">{customCount} 项</span>
              </div>
            </div>

            {levelGroups.map((levelGroup) => {
              const levelSelection = mapsSelection(levelGroup.maps);
              return (
                <details className="tree-group level-group" key={levelGroup.id} open={scopeQuery ? true : undefined}>
                  <summary className={levelSelection.full || levelSelection.partial ? 'active' : ''}>
                    <button className={`tree-check ${levelSelection.full ? 'checked' : levelSelection.partial ? 'partial' : ''}`} type="button" aria-pressed={levelSelection.full} aria-label={`切换${levelGroup.label}全部副本`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); toggleMapGroup(levelGroup.maps); }}>{levelSelection.full ? '✓' : levelSelection.partial ? '−' : ''}</button>
                    <span>{levelGroup.label}</span><small>{levelSelection.selectedMapCount}/{levelGroup.maps.length}</small><b>⌄</b>
                  </summary>
                  <div className="tree-children difficulty-children">
                    {levelGroup.difficultyGroups.map((difficultyGroup) => {
                      const difficultySelection = mapsSelection(difficultyGroup.maps);
                      return (
                        <details className="difficulty-node" key={difficultyGroup.id} open={scopeQuery ? true : undefined}>
                          <summary className={`tree-parent ${difficultySelection.full || difficultySelection.partial ? 'active' : ''}`}>
                            <button className={`tree-check ${difficultySelection.full ? 'checked' : difficultySelection.partial ? 'partial' : ''}`} type="button" aria-pressed={difficultySelection.full} aria-label={`切换${levelGroup.label}${difficultyGroup.label}全部副本`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); toggleMapGroup(difficultyGroup.maps); }}>{difficultySelection.full ? '✓' : difficultySelection.partial ? '−' : ''}</button>
                            <span>{difficultyGroup.label}</span><small>{difficultySelection.selectedMapCount}/{difficultyGroup.maps.length}</small><b>⌄</b>
                          </summary>
                          <div className="tree-children map-children">
                            {difficultyGroup.maps.map((map) => {
                              const mapState = mapSelection(map);
                              return (
                                <details className="map-node" key={map.mapId}>
                                  <summary className={mapState.full || mapState.partial ? 'active' : ''}>
                                    <button className={`tree-check ${mapState.full ? 'checked' : mapState.partial ? 'partial' : ''}`} type="button" aria-pressed={mapState.full} aria-label={`切换${map.name}${map.difficulty}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); toggleMap(map.mapId); }}>{mapState.full ? '✓' : mapState.partial ? '−' : ''}</button>
                                    <span><strong>{map.name}</strong><em>{map.difficulty}</em></span><small>{map.bossNames.length} Boss</small><b>⌄</b>
                                  </summary>
                                  <div className="boss-list">
                                    {map.bossNames.map((boss) => {
                                      const selected = selectedBosses.has(sourceKey(map.mapId, boss));
                                      return <button className={selected ? 'selected' : ''} type="button" key={boss} aria-pressed={selected} onClick={() => toggleBoss(map.mapId, boss)}>{boss}</button>;
                                    })}
                                  </div>
                                </details>
                              );
                            })}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </nav>
        </aside>

        <section className="main-column">
          <div className="summary-grid">
            <article className="summary-card glass-panel gold">
              <span>当前匹配物品</span>
              <strong>{scopedItems.length.toLocaleString('zh-CN')}</strong>
              <small>{hasScope ? `${scopeStats.sourceLinks.toLocaleString('zh-CN')} 处掉落来源 · ${scopeStats.repeatedNames.toLocaleString('zh-CN')} 个同名物品` : '请在左侧勾选副本范围以开始配置'}</small>
            </article>
            <article className="summary-card glass-panel blue">
              <span>跳过拾取</span>
              <strong>{scopeStats.skipLoot}</strong>
              <small>独立过滤 · 掉落不拾取</small>
            </article>
            <article className="summary-card glass-panel split-sell">
              <span>出售策略</span>
              <div className="split-numbers">
                <span className="sell-stat"><b className="status-dot red" /> 出售 <strong>{scopeStats.autoSell}</strong></span>
                <span className="protect-stat"><b className="status-dot green" /> 保护 <strong>{scopeStats.protect}</strong></span>
              </div>
              <small>互斥单选 · 游戏内自动处理</small>
            </article>
          </div>

          <section className="workbench-panel glass-panel">
            <div className="section-heading workbench-heading">
              <div>
                <span className="eyebrow">CATEGORY STRATEGY</span>
                <h2>已选范围 · 分类策略直选</h2>
                <p>为当前范围（<strong>{currentScopeLabel}</strong>）下的各类物品一键设置拾取与出售策略；点击分类名称可展开物品明细。</p>
              </div>
              {hasScope && (
                <div className="workbench-quick-presets">
                  <button className="button primary compact" type="button" onClick={() => applyScopePreset('farming')} title="将当前范围的所有装备设为自动出售、装备兑换牌设为跳过拾取、珍稀特殊物品设为保护">
                    ⚡ 推荐预设 (旧装备全卖 + 牌子跳过 + 珍稀保护)
                  </button>
                  <button className="button ghost compact danger-btn" type="button" onClick={() => applyScopePreset('clear')} title="清除当前范围下所有物品的出售与拾取策略，恢复未处理状态">
                    🧹 清空当前范围策略
                  </button>
                </div>
              )}
            </div>

            {!hasScope ? (
              <div className="empty-workbench-guide">
                <span className="guide-icon">👈</span>
                <div>
                  <strong>请在左侧勾选副本或版本范围</strong>
                  <p>在左侧选择要配置的历史版本或具体副本（支持多选，或直接点击左侧上方的“全选副本”）；勾选后，此处将即时呈现对应范围内的所有物品分类供您一键快速配置策略。</p>
                </div>
              </div>
            ) : (
              <div className="category-strategy-table" role="table" aria-label="分类策略控制列表">
                <div className="cat-strat-row cat-strat-head" role="row">
                  <div className="col-cat">物品分类</div>
                  <div className="col-skip">拾取过滤</div>
                  <div className="col-sell">出售策略</div>
                </div>
                {categoryWorkbenchSummaries.map((catSummary) => {
                  const { category, total, skipLootCount, autoSellCount, protectCount, noneCount } = catSummary;
                  const allAutoSell = total > 0 && autoSellCount === total;
                  const partialAutoSell = autoSellCount > 0 && autoSellCount < total;
                  const allProtect = total > 0 && protectCount === total;
                  const partialProtect = protectCount > 0 && protectCount < total;
                  const allNone = total > 0 && noneCount === total;
                  const partialNone = noneCount > 0 && noneCount < total;
                  const allSkip = total > 0 && skipLootCount === total;
                  const partialSkip = skipLootCount > 0 && skipLootCount < total;
                  const allUnskip = total > 0 && skipLootCount === 0;
                  const partialUnskip = total - skipLootCount > 0 && total - skipLootCount < total;
                  const isExpanded = expandedCategory === category;

                  return (
                    <div className={`cat-strat-group ${isExpanded ? 'is-expanded' : ''}`} key={category}>
                      <div className="cat-strat-row" role="row">
                        <div
                          className="col-cat cat-info-cell"
                          onClick={() => {
                            setExpandedCategory((curr) => (curr === category ? null : category));
                            setDrawerQuery('');
                            setDrawerPage(1);
                          }}
                          role="button"
                          tabIndex={0}
                          title="点击展开/收起该分类下的物品明细"
                        >
                          <span className="cat-icon">{CATEGORY_ICONS[category]}</span>
                          <div className="cat-name-box">
                            <strong>{CATEGORY_LABELS[category]}</strong>
                            <span className="cat-count-badge">{total} 项</span>
                          </div>
                          <span className={`drawer-toggle-arrow ${isExpanded ? 'open' : ''}`}>
                            {isExpanded ? '▴ 收起' : '▾ 明细'}
                          </span>
                        </div>

                        <div className="col-skip">
                          <div className="seg-control skip-seg" role="group" aria-label="拾取策略">
                            <button
                              type="button"
                              className={`seg-btn skipLoot ${allSkip ? 'active' : ''}`}
                              onClick={(e) => { e.stopPropagation(); applyCategoryDirectAction(category, 'skipLoot'); }}
                              title={`一键将当前范围全部 ${total} 项【${CATEGORY_LABELS[category]}】设为跳过拾取`}
                            >
                              跳过拾取{partialSkip ? <small>({skipLootCount})</small> : ''}
                            </button>
                            <button
                              type="button"
                              className={`seg-btn unskip ${allUnskip ? 'active' : ''}`}
                              onClick={(e) => { e.stopPropagation(); applyCategoryDirectAction(category, 'unskipLoot'); }}
                              title={`清除当前范围【${CATEGORY_LABELS[category]}】的跳过标记，恢复正常拾取`}
                            >
                              正常拾取{partialUnskip ? <small>({total - skipLootCount})</small> : ''}
                            </button>
                          </div>
                        </div>

                        <div className="col-sell">
                          <div className="seg-control sell-seg" role="group" aria-label="出售策略">
                            <button
                              type="button"
                              className={`seg-btn autoSell ${allAutoSell ? 'active' : ''}`}
                              onClick={(e) => { e.stopPropagation(); applyCategoryDirectAction(category, 'autoSell'); }}
                              title={`一键将当前范围全部 ${total} 项【${CATEGORY_LABELS[category]}】设为自动出售`}
                            >
                              自动出售{partialAutoSell ? <small>({autoSellCount})</small> : ''}
                            </button>
                            <button
                              type="button"
                              className={`seg-btn protect ${allProtect ? 'active' : ''}`}
                              onClick={(e) => { e.stopPropagation(); applyCategoryDirectAction(category, 'protect'); }}
                              title={`一键将当前范围全部 ${total} 项【${CATEGORY_LABELS[category]}】设为保护不出售`}
                            >
                              保护不出售{partialProtect ? <small>({protectCount})</small> : ''}
                            </button>
                            <button
                              type="button"
                              className={`seg-btn none ${allNone ? 'active' : ''}`}
                              onClick={(e) => { e.stopPropagation(); applyCategoryDirectAction(category, 'none'); }}
                              title={`清除当前范围【${CATEGORY_LABELS[category]}】的出售/保护策略`}
                            >
                              未处理{partialNone ? <small>({noneCount})</small> : ''}
                            </button>
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="cat-drawer-container">
                          <div className="cat-drawer-sticky-header">
                            <div className="cat-drawer-toolbar">
                              <label className="drawer-search-box">
                                <span>⌕</span>
                                <input
                                  value={drawerQuery}
                                  onChange={(e) => { setDrawerQuery(e.target.value); setDrawerPage(1); }}
                                  placeholder={`在【${CATEGORY_LABELS[category]}】中搜索物品名称或 Boss...`}
                                />
                                {drawerQuery && <button type="button" className="drawer-clear-btn" onClick={() => { setDrawerQuery(''); setDrawerPage(1); }}>×</button>}
                              </label>
                              <select
                                className="drawer-select"
                                value={drawerStateView}
                                onChange={(e) => { setDrawerStateView(e.target.value as 'all' | 'configured' | 'unconfigured' | 'protected'); setDrawerPage(1); }}
                              >
                                <option value="all">全部状态</option>
                                <option value="configured">只看已配置</option>
                                <option value="unconfigured">只看未配置</option>
                                <option value="protected">只看已保护</option>
                              </select>
                              <span className="drawer-count-info">
                                {drawerItems.length > 0 ? `${(currentDrawerPage - 1) * DRAWER_PAGE_SIZE + 1}–${Math.min(currentDrawerPage * DRAWER_PAGE_SIZE, drawerItems.length)} / 共 ${drawerItems.length} 项` : '0 项'}
                              </span>
                              <button
                                type="button"
                                className="button ghost compact"
                                onClick={() => setExpandedCategory(null)}
                              >
                                收起 ▴
                              </button>
                            </div>

                            <div className="item-row item-head" role="row">
                              <span>物品与来源</span>
                              <span>品质 / 装等</span>
                              <span>跳过拾取</span>
                              <span>出售策略</span>
                            </div>
                          </div>

                          <div className="drawer-item-list" role="table" aria-label={`${CATEGORY_LABELS[category]}物品列表`}>
                            {visibleDrawerItems.map((item) => {
                              const state = cloneState(stateMap.get(item.id));
                              const source = item.sources[0];
                              return (
                                <div className={`item-row ${item.customOverride ? 'custom-row' : ''} ${item.historical ? 'historical-row' : ''}`} role="row" key={item.id}>
                                  <div className="item-name">
                                    <strong>
                                      {item.name}
                                      {item.systemSeed && <span className="seed-badge">推荐保护</span>}
                                      {item.customOverride && <span className="custom-badge">自定义</span>}
                                      {item.historical && <span className="history-badge">历史</span>}
                                    </strong>
                                    <small title={item.sources.map((entry) => `${entry.expansion} / ${entry.mapName} / ${entry.bossName}`).join('\n')}>
                                      {source ? `${source.expansion} · ${source.mapName} · ${source.bossName}${item.sources.length > 1 ? ` 等 ${item.sources.length} 个来源` : ''}` : item.subtype ?? '手动维护'}
                                    </small>
                                    {item.customOverride && <button className="text-action" type="button" onClick={() => removeCustomOverride(item.id)}>{catalogIdSet.has(item.id) ? '恢复官方批量管理' : '移出自定义库'}</button>}
                                    {item.historical && <button className="text-action" type="button" onClick={() => removeHistoricalState(item.id)}>清除历史状态并停止导出</button>}
                                  </div>
                                  <span className={`category-pill quality-${item.qualityMax ?? item.quality ?? 0}`}>
                                    {item.subtype ? `${item.subtype} · ` : ''}{item.itemLevelMax ? `${item.itemLevelMin === item.itemLevelMax ? item.itemLevelMax : `${item.itemLevelMin}–${item.itemLevelMax}`}品` : `品质 ${item.qualityMax ?? item.quality ?? 0}`}
                                  </span>
                                  <StateButton state={state} onClick={() => toggleItemState(item, 'skipLoot')} />
                                  <DispositionSelector disposition={itemDisposition(state)} onChange={(disposition) => setItemDisposition(item, disposition)} />
                                </div>
                              );
                            })}
                            {visibleDrawerItems.length === 0 && (
                              <div className="empty-state compact">
                                <strong>没有匹配的物品</strong>
                                <p>请尝试调整搜索关键词或状态筛选。</p>
                              </div>
                            )}
                          </div>

                          {drawerTotalPages > 1 && (
                            <div className="pagination">
                              <button type="button" disabled={currentDrawerPage <= 1} onClick={() => setDrawerPage((v) => Math.max(1, v - 1))}>上一页</button>
                              <span>第 {currentDrawerPage} / {drawerTotalPages} 页</span>
                              <button type="button" disabled={currentDrawerPage >= drawerTotalPages} onClick={() => setDrawerPage((v) => Math.min(drawerTotalPages, v + 1))}>下一页</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </section>
      </div>

      {dialog && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}>
        {dialog === 'custom' && <Modal title="添加自定义物品" eyebrow="自定义物品库" onClose={() => setDialog(null)}>
          <p className="modal-copy">输入您想自定义管理的物品名称（每行一个）。添加后可在左侧【✨ 用户自定义】范围中单独配置其拾取与出售策略。</p>
          <textarea className="custom-textarea" value={customInput} onChange={(event) => setCustomInput(event.target.value)} rows={9} placeholder={'例如：\n水长生 ·雪银莲\n特殊装备\n金缕衣'} autoFocus />
          <div className="modal-actions"><button className="button ghost" type="button" onClick={() => setDialog(null)}>取消</button><button className="button primary" type="button" onClick={addCustomItems}>添加到物品库</button></div>
        </Modal>}

        {dialog === 'workspace' && <Modal title="本地设置与数据" eyebrow="设置与数据管理" onClose={() => setDialog(null)}>
          <div className="workspace-actions-list">
            <button type="button" onClick={() => downloadText(`剑网3掉落工坊-设置备份_${shanghaiDateStamp()}.json`, exportWorkspaceBackup(workspace))}>
              <strong>导出全部设置备份</strong>
              <small>将当前的拾取/出售策略、自定义物品及副本收藏保存为本地备份文件 (.json)</small>
            </button>
            <button type="button" onClick={() => backupInputRef.current?.click()}>
              <strong>导入设置备份</strong>
              <small>换电脑、换浏览器或移动文件后，一键还原之前的全部设置与自定义库</small>
            </button>
            <button type="button" onClick={() => void checkCatalogUpdate()}>
              <strong>检查副本掉落库更新</strong>
              <small>连接网络检查是否有最新版本的官方副本掉落数据</small>
            </button>
            <button type="button" onClick={() => dataPackInputRef.current?.click()}>
              <strong>导入离线数据包</strong>
              <small>手动载入官方最新的副本掉落数据库文件（适合无网络环境）</small>
            </button>
            {embeddedSnapshot && activeSnapshot.contentHash !== embeddedSnapshot.contentHash && (
              <button type="button" onClick={() => void restoreEmbeddedCatalog()}>
                <strong>恢复初始副本数据</strong>
                <small>保留当前个性化设置，仅将副本掉落库还原为本程序自带的默认版本</small>
              </button>
            )}
            <button className="danger-row" type="button" onClick={doResetWorkspace}>
              <strong>清空并恢复默认设置</strong>
              <small>清除所有个性化配置与自选记录，恢复系统推荐的默认珍品保护规则</small>
            </button>
          </div>
          <p className="storage-note">💡 提示：您的所有设置都会实时自动保存在当前浏览器中，关闭页面不会丢失。建议在配置满意后导出备份文件，方便随时在其他设备一键恢复。</p>
        </Modal>}

        {dialog === 'import' && importDraft && <Modal title="导入游戏配置文件" eyebrow="配置导入" onClose={() => setDialog(null)}>
          <p className="modal-copy"><strong>{importDraft.filename}</strong> · 已识别策略：{importDraft.preview.declared.map((field) => STATE_LABELS[field]).join('、')}</p>
          <div className="mode-switch">
            <button className={importDraft.mode === 'merge' ? 'active' : ''} type="button" onClick={() => changeImportMode('merge')}>
              <strong>合并模式 (推荐)</strong>
              <small>保留现有设置，仅叠加导入文件中的新规则</small>
            </button>
            <button className={importDraft.mode === 'replace' ? 'active' : ''} type="button" onClick={() => changeImportMode('replace')}>
              <strong>覆盖模式</strong>
              <small>清空现有的拾取/出售规则，完全以该文件为准</small>
            </button>
          </div>
          <div className="preview-stats">
            <span><strong>{importDraft.preview.changes.length}</strong> 项规则变更</span>
            <span><strong>{importDraft.preview.unknownNames.length}</strong> 项加入自定义库</span>
            <span><strong>{importDraft.preview.conflictsResolved}</strong> 项自动处理保护冲突</span>
          </div>
          <div className="diff-list">{importDraft.preview.changes.slice(0, 100).map((change) => <div key={change.id}><strong>{change.name}</strong><span>{stateSummary(change.before)} → {stateSummary(change.after)}</span></div>)}</div>
          <div className="modal-actions"><button className="button ghost" type="button" onClick={() => setDialog(null)}>取消</button><button className="button primary" type="button" onClick={applyImport}>确认应用到工坊</button></div>
        </Modal>}
      </div>}

      {toast && <div className={`toast ${toast.tone}`} role="status" aria-live="polite">{toast.message}<button type="button" aria-label="关闭提示" onClick={() => setToast(null)}>×</button></div>}
    </main>
  );
}

function StateButton({ state, onClick }: { state: ItemState; onClick: () => void }) {
  const enabled = state.skipLoot;
  return (
    <button
      className={`state-toggle skipLoot ${enabled ? 'checked' : ''}`}
      aria-pressed={enabled}
      aria-label={`跳过拾取：${enabled ? '已开启' : '未开启'}`}
      onClick={onClick}
      type="button"
      title={enabled ? '已加入跳过拾取名单（掉落时不拾取）' : '未跳过（掉落时正常拾取）'}
    >
      <i />
      <span>{enabled ? '已跳过' : '正常拾取'}</span>
    </button>
  );
}

function DispositionSelector({ disposition, onChange }: { disposition: ItemDisposition; onChange: (disposition: ItemDisposition) => void }) {
  const options: Array<[ItemDisposition, string, string]> = [
    ['none', '未处理', '不自动出售，也不加入保护名单'],
    ['autoSell', '自动出售', '加入自动出售名单 (MY_AutoSell.tSellItem)'],
    ['protect', '保护不出售', '加入保护名单，防止被误卖 (MY_AutoSell.tProtectItem)'],
  ];
  return (
    <div className="segmented disposition-selector" role="group" aria-label="出售策略">
      {options.map(([value, label, desc]) => (
        <button
          className={`disposition-option ${value} ${disposition === value ? 'on' : ''}`}
          type="button"
          key={value}
          aria-pressed={disposition === value}
          title={`出售策略：${label}（${desc}）`}
          onClick={() => onChange(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Modal({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode }) {
  return <section className="modal-card glass-panel" role="dialog" aria-modal="true" aria-labelledby={`dialog-${eyebrow}`}>
    <header><div><span className="eyebrow">{eyebrow}</span><h2 id={`dialog-${eyebrow}`}>{title}</h2></div><button className="modal-close" type="button" onClick={onClose} aria-label="关闭">×</button></header>
    {children}
  </section>;
}
