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
  APP_VERSION,
  CATEGORY_LABELS,
  DEFAULT_PROTECTED_ITEMS,
} from '../domain/constants';
import {
  applyChanges,
  cloneState,
  createEmptyBulkRules,
  createInitialWorkspace,
  normalizeItemName,
  previewBulkRules,
  setStateField,
  stateMapFromWorkspace,
  workspaceWithStateMap,
} from '../domain/state';
import type {
  BulkPreview,
  BulkRuleSet,
  CatalogItem,
  CatalogMap,
  CatalogSnapshot,
  ImportMode,
  ImportPreview,
  ItemCategory,
  ItemState,
  ParsedManagedConfig,
  RuleDirective,
  StateField,
  Workspace,
} from '../domain/types';
import { assertGbkEncodable, decodeGbk } from '../encoding/gbk';
import {
  clearCatalogOverride,
  loadCatalogOverride,
  parseCatalogDataPack,
  saveCatalogOverride,
} from '../storage/catalog';
import {
  exportWorkspaceBackup,
  importWorkspaceBackup,
  loadWorkspace,
  resetWorkspace,
  saveWorkspace,
} from '../storage/workspace';
import { downloadBytes, downloadText } from '../utils/download';

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

type DialogName = 'custom' | 'workspace' | 'import' | 'bulk' | null;
type Toast = { tone: 'success' | 'warning' | 'error'; message: string } | null;
type ItemDisposition = 'none' | 'autoSell' | 'protect';
type BulkDisposition = 'unchanged' | ItemDisposition;
type BulkPreviewContext = { label: string; targetCount: number; resetRules: boolean } | null;

const PAGE_SIZE = 100;
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as ItemCategory[];
const QUALITY_OPTIONS = [1, 2, 3, 4, 5] as const;
const QUALITY_LABELS: Record<number, string> = {
  1: '白',
  2: '绿',
  3: '蓝',
  4: '紫',
  5: '橙',
};
const SLOT_LABELS: Record<string, string> = {
  weapon: '武器',
  ranged: '暗器',
  head: '帽子',
  chest: '上衣',
  wrists: '护腕',
  belt: '腰带',
  legs: '下装',
  feet: '鞋子',
  necklace: '项链',
  pendant: '腰坠',
  ring: '戒指',
  waist_ornament: '腰部挂件',
  back_ornament: '背部挂件',
  unknown: '其他部位',
};
const STATE_LABELS: Record<StateField, string> = {
  skipLoot: '跳过拾取',
  autoSell: '自动出售',
  protect: '保护不出售',
};
const DIRECTIVE_LABELS: Record<RuleDirective, string> = {
  unchanged: '保持',
  enable: '开启',
  disable: '关闭',
};
function sourceKey(mapId: number, bossName: string): string {
  return `${mapId}:${encodeURIComponent(bossName)}`;
}

function stateSummary(state: ItemState): string {
  const labels = [state.skipLoot && '跳过', state.autoSell && '出售', state.protect && '保护'].filter(Boolean);
  return labels.length ? labels.join('、') : '未配置';
}

function itemDisposition(state: ItemState): ItemDisposition {
  if (state.autoSell) return 'autoSell';
  if (state.protect) return 'protect';
  return 'none';
}

function createEquipmentBulkRules(disposition: Exclude<ItemDisposition, 'none'> | 'none'): BulkRuleSet {
  const rules = createEmptyBulkRules();
  if (disposition === 'autoSell') {
    rules.equipment.autoSell = 'enable';
    rules.equipment.protect = 'disable';
  } else if (disposition === 'protect') {
    rules.equipment.autoSell = 'disable';
    rules.equipment.protect = 'enable';
  } else {
    rules.equipment.autoSell = 'disable';
    rules.equipment.protect = 'disable';
  }
  return rules;
}

function shanghaiDateStamp(now = new Date()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function downloadBatchFile(file: { filename: string; bytes: Uint8Array }): void {
  downloadBytes(file.filename, file.bytes);
}

export function LootForgeApp() {
  const [activeSnapshot, setActiveSnapshot] = useState(catalogSnapshot);
  const [embeddedSnapshot, setEmbeddedSnapshot] = useState<CatalogSnapshot | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>(() => createInitialWorkspace(catalogSnapshot.catalogVersion));
  const [hydrated, setHydrated] = useState(false);
  const [catalogIndexed, setCatalogIndexed] = useState(false);
  const [scopeQuery, setScopeQuery] = useState('');
  const [dialog, setDialog] = useState<DialogName>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [bulkRules, setBulkRules] = useState<BulkRuleSet>(() => createEmptyBulkRules());
  const [bulkPreview, setBulkPreview] = useState<BulkPreview | null>(null);
  const [bulkPreviewContext, setBulkPreviewContext] = useState<BulkPreviewContext>(null);
  const [importDraft, setImportDraft] = useState<ImportDraft | null>(null);
  const [customInput, setCustomInput] = useState('');
  const [page, setPage] = useState(1);
  const [undoWorkspace, setUndoWorkspace] = useState<Workspace | null>(null);
  const configInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const dataPackInputRef = useRef<HTMLInputElement>(null);

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
        setEmbeddedSnapshot(embedded);
        setActiveSnapshot(override ?? embedded);
        const restoredWorkspace = loadWorkspace(embedded.catalogVersion);
        setWorkspace(override
          ? { ...restoredWorkspace, catalogVersion: override.catalogVersion, updatedAt: new Date().toISOString() }
          : restoredWorkspace);
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
          setHydrated(true);
          setToast({ tone: 'error', message: error instanceof Error ? error.message : String(error) });
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
    if (hydrated) saveWorkspace(workspace);
  }, [workspace, hydrated]);

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
        byId.set(custom.id, { ...existing, isCustom: true, customOverride: true });
      } else {
        byId.set(custom.id, {
          id: custom.id,
          name: custom.name,
          category: 'unknown',
          subtype: '自定义物品',
          sources: [],
          isCustom: true,
          customOverride: true,
          systemSeed: false,
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

  const availableSlots = useMemo(() => {
    const slots = new Set<string>();
    for (const item of activeCatalogItems) {
      for (const slot of item.slots ?? (item.slot ? [item.slot] : [])) slots.add(slot);
    }
    return [...slots].sort((left, right) => (SLOT_LABELS[left] ?? left).localeCompare(SLOT_LABELS[right] ?? right, 'zh-CN'));
  }, [activeCatalogItems]);

  const sourceMatchesScope = (item: ViewItem): boolean => {
    if (!hasScope || item.isCustom || item.systemSeed || item.historical) return true;
    return item.sources.some((source) => selectedMaps.has(source.mapId) || selectedBosses.has(sourceKey(source.mapId, source.bossName)));
  };

  const filteredItems = useMemo(() => {
    const query = workspace.filters.query.normalize('NFC');
    return allItems.filter((item) => {
      if (!sourceMatchesScope(item)) return false;
      if (query && !item.name.normalize('NFC').includes(query) && !item.sources.some((source) => `${source.expansion}${source.mapName}${source.bossName}`.includes(query))) return false;
      if (workspace.filters.categories.length > 0 && !workspace.filters.categories.includes(item.category)) return false;
      const qualityMin = item.qualityMin ?? item.quality;
      const qualityMax = item.qualityMax ?? item.quality;
      if (workspace.filters.qualities.length > 0 && !workspace.filters.qualities.some((quality) => qualityMin !== undefined && qualityMax !== undefined && quality >= qualityMin && quality <= qualityMax)) return false;
      const itemSlots = item.slots ?? (item.slot ? [item.slot] : []);
      if (workspace.filters.slots.length > 0 && !workspace.filters.slots.some((slot) => itemSlots.includes(slot))) return false;
      const levelMin = item.itemLevelMin ?? item.itemLevel;
      const levelMax = item.itemLevelMax ?? item.itemLevel;
      if (workspace.filters.itemLevelMin !== null && (levelMax === undefined || levelMax < workspace.filters.itemLevelMin)) return false;
      if (workspace.filters.itemLevelMax !== null && (levelMin === undefined || levelMin > workspace.filters.itemLevelMax)) return false;
      const state = cloneState(stateMap.get(item.id));
      if (workspace.filters.stateView === 'configured' && !state.skipLoot && !state.autoSell && !state.protect) return false;
      if (workspace.filters.stateView === 'unconfigured' && (state.skipLoot || state.autoSell || state.protect)) return false;
      if (workspace.filters.stateView === 'protected' && !state.protect) return false;
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems, hasScope, selectedMaps, selectedBosses, workspace.filters, stateMap]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleItems = filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const scopeStats = useMemo(() => {
    let skipLoot = 0;
    let autoSell = 0;
    let protect = 0;
    let sourceLinks = 0;
    let repeatedNames = 0;
    for (const item of filteredItems) {
      const state = stateMap.get(item.id);
      if (state?.skipLoot) skipLoot += 1;
      if (state?.autoSell) autoSell += 1;
      if (state?.protect) protect += 1;
      sourceLinks += item.sources.length;
      if (item.sources.length > 1) repeatedNames += 1;
    }
    return { skipLoot, autoSell, protect, sourceLinks, repeatedNames };
  }, [filteredItems, stateMap]);

  const categoryCounts = useMemo(() => {
    const counts = Object.fromEntries(CATEGORY_ORDER.map((category) => [category, 0])) as Record<ItemCategory, number>;
    for (const item of filteredItems) {
      if (!item.customOverride && !item.systemSeed && !item.historical) counts[item.category] += 1;
    }
    return counts;
  }, [filteredItems]);

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

  const updateFilter = <K extends keyof Workspace['filters']>(key: K, value: Workspace['filters'][K]) => {
    setPage(1);
    setWorkspace((current) => ({ ...current, filters: { ...current.filters, [key]: value }, updatedAt: new Date().toISOString() }));
  };

  const toggleCategoryFilter = (category: ItemCategory) => {
    const selected = new Set(workspace.filters.categories);
    if (selected.has(category)) selected.delete(category); else selected.add(category);
    updateFilter('categories', [...selected]);
  };

  const toggleQualityFilter = (quality: number) => {
    const selected = new Set(workspace.filters.qualities);
    if (selected.has(quality)) selected.delete(quality); else selected.add(quality);
    updateFilter('qualities', [...selected]);
  };

  const cycleRule = (category: ItemCategory, field: StateField) => {
    const order: RuleDirective[] = ['unchanged', 'enable', 'disable'];
    setBulkRules((current) => {
      const directive = current[category][field];
      return { ...current, [category]: { ...current[category], [field]: order[(order.indexOf(directive) + 1) % order.length] } };
    });
  };

  const bulkDisposition = (category: ItemCategory): BulkDisposition => {
    const rules = bulkRules[category];
    if (rules.autoSell === 'unchanged' && rules.protect === 'unchanged') return 'unchanged';
    if (rules.autoSell === 'enable' && rules.protect !== 'enable') return 'autoSell';
    if (rules.protect === 'enable' && rules.autoSell !== 'enable') return 'protect';
    if (rules.autoSell === 'disable' && rules.protect === 'disable') return 'none';
    return 'unchanged';
  };

  const setBulkDisposition = (category: ItemCategory, disposition: BulkDisposition) => {
    setBulkRules((current) => {
      const next = { ...current[category] };
      if (disposition === 'unchanged') {
        next.autoSell = 'unchanged';
        next.protect = 'unchanged';
      } else if (disposition === 'autoSell') {
        next.autoSell = 'enable';
        next.protect = 'disable';
      } else if (disposition === 'protect') {
        next.autoSell = 'disable';
        next.protect = 'enable';
      } else {
        next.autoSell = 'disable';
        next.protect = 'disable';
      }
      return { ...current, [category]: next };
    });
  };

  const openPreviewFor = (items: ViewItem[], rules: BulkRuleSet, label: string, resetRules = false) => {
    const preview = previewBulkRules(items, stateMap, customOverrides, rules);
    setBulkPreview(preview);
    setBulkPreviewContext({ label, targetCount: items.length, resetRules });
    setDialog('bulk');
  };

  const openBulkPreview = () => {
    const scopedItems = filteredItems.filter((item) => !item.systemSeed && !item.historical);
    openPreviewFor(scopedItems, bulkRules, '按类型批量规则', true);
  };

  const openQuickBulkPreview = (kind: 'lowerLevels' | 'scopeAutoSell' | 'scopeProtect' | 'scopeNone') => {
    const officialEquipment = allItems.filter((item) => item.category === 'equipment' && !item.customOverride && !item.systemSeed && !item.historical);
    const scopedEquipment = officialEquipment.filter(sourceMatchesScope);
    const maxLevel = Math.max(...CATALOG_LEVEL_GROUPS.map((group) => group.level ?? Number.NEGATIVE_INFINITY));
    const lowerLevelEquipment = officialEquipment.filter((item) => {
      const sourceLevels = item.sources.map((source) => getLevelGroup(source.expansion).level).filter((level): level is number => level !== null);
      return sourceLevels.length > 0 && Math.max(...sourceLevels) < maxLevel;
    });
    const presets: Record<typeof kind, { items: ViewItem[]; disposition: ItemDisposition; label: string }> = {
      lowerLevels: { items: lowerLevelEquipment, disposition: 'autoSell', label: '除当前最高等级外的所有等级装备 → 自动出售' },
      scopeAutoSell: { items: scopedEquipment, disposition: 'autoSell', label: '当前选择范围的装备 → 自动出售' },
      scopeProtect: { items: scopedEquipment, disposition: 'protect', label: '当前选择范围的装备 → 保护不出售' },
      scopeNone: { items: scopedEquipment, disposition: 'none', label: '当前选择范围的装备 → 不做特殊处理' },
    };
    const preset = presets[kind];
    openPreviewFor(preset.items, createEquipmentBulkRules(preset.disposition), preset.label);
  };

  const applyBulkPreview = () => {
    if (!bulkPreview) return;
    commitStateMap(applyChanges(stateMap, bulkPreview.changes));
    if (bulkPreviewContext?.resetRules) setBulkRules(createEmptyBulkRules());
    setBulkPreviewContext(null);
    setDialog(null);
    setToast({ tone: 'success', message: `已应用 ${bulkPreview.changes.length} 项变更，并保留一步撤销。` });
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
    const nextMap = new Map(stateMap);
    if (!catalogIdSet.has(id)) nextMap.delete(id);
    setUndoWorkspace(workspace);
    setWorkspace((current) => ({
      ...workspaceWithStateMap(current, nextMap),
      customItems: current.customItems.filter((item) => item.id !== id),
      customOverrides: current.customOverrides.filter((value) => value !== id),
      updatedAt: new Date().toISOString(),
    }));
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

  const exportFiles = (kind: 'pickup' | 'sell' | 'both') => {
    try {
      if (!catalogIndexed) throw new Error('数据目录仍在建立索引，请稍候再导出。');
      const batch = buildExportBatch(createNamedStates());
      if (kind === 'pickup' || kind === 'both') downloadBatchFile(batch.pickup);
      if (kind === 'sell') downloadBatchFile(batch.sell);
      if (kind === 'both') downloadBatchFile(batch.sell);
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
      const restored = importWorkspaceBackup(await file.text(), activeSnapshot.catalogVersion);
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
          <div className="brand-mark" aria-hidden="true">铸</div>
          <div>
            <div className="brand-line"><h1>{APP_NAME}</h1><span className="version-pill">v{APP_VERSION}</span></div>
          </div>
        </div>
        <div className="header-actions">
          <span className="data-badge" title={activeSnapshot.contentHash}><i /> {catalogIndexed ? `旗舰端 · ${activeSnapshot.stats.uniqueItems.toLocaleString('zh-CN')} 项` : '目录载入中…'}</span>
          <button className="button ghost" type="button" onClick={() => setDialog('workspace')}>工作区</button>
          <button className="button ghost" type="button" onClick={() => configInputRef.current?.click()}>导入配置</button>
          <button className="button primary" type="button" disabled={!catalogIndexed} onClick={() => exportFiles('both')}>导出文件</button>
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
          <div className="sidebar-footnote">
            <span>数据快照</span><strong>{activeSnapshot.catalogVersion}</strong>
            <small>{hasScope ? `${selectedMaps.size} 副本 · ${selectedBosses.size} Boss 精选` : '当前查看全部副本'}</small>
          </div>
        </aside>

        <section className="main-column">
          <div className="summary-grid">
            <article className="summary-card glass-panel gold"><span>当前筛选</span><strong>{filteredItems.length.toLocaleString('zh-CN')}</strong><small>{scopeStats.sourceLinks.toLocaleString('zh-CN')} 个来源关联 · {scopeStats.repeatedNames.toLocaleString('zh-CN')} 个多来源同名</small></article>
            <article className="summary-card glass-panel blue"><span>跳过拾取</span><strong>{scopeStats.skipLoot}</strong><small>生成拾取过滤</small></article>
            <article className="summary-card glass-panel red"><span>自动出售</span><strong>{scopeStats.autoSell}</strong><small>与保护严格互斥</small></article>
            <article className="summary-card glass-panel green"><span>保护不出售</span><strong>{scopeStats.protect}</strong><small>首次基线可编辑</small></article>
          </div>

          <section className="filter-panel glass-panel">
            <div className="filter-line">
              <label className="item-search wide"><span>⌕</span><input value={workspace.filters.query} onChange={(event) => updateFilter('query', event.target.value)} placeholder="搜索物品、版本、副本或 Boss" /></label>
              <select value={workspace.filters.stateView} onChange={(event) => updateFilter('stateView', event.target.value as Workspace['filters']['stateView'])}>
                <option value="all">全部状态</option><option value="configured">只看已配置</option><option value="unconfigured">只看未配置</option><option value="protected">只看已保护</option>
              </select>
              <button className="button ghost compact" type="button" onClick={() => setDialog('custom')}>＋ 自定义物品</button>
            </div>
            <div className="filter-chips">
              {CATEGORY_ORDER.map((category) => <button className={workspace.filters.categories.includes(category) ? 'active' : ''} type="button" key={category} onClick={() => toggleCategoryFilter(category)}>{CATEGORY_LABELS[category]}</button>)}
              <span className="filter-divider" />
              {QUALITY_OPTIONS.map((quality) => <button className={`quality-filter quality-${quality} ${workspace.filters.qualities.includes(quality) ? 'active' : ''}`} type="button" key={quality} onClick={() => toggleQualityFilter(quality)}>{QUALITY_LABELS[quality]}色</button>)}
              <select className="slot-filter" value={workspace.filters.slots[0] ?? ''} onChange={(event) => updateFilter('slots', event.target.value ? [event.target.value] : [])} aria-label="按装备部位筛选">
                <option value="">全部部位</option>
                {availableSlots.map((slot) => <option value={slot} key={slot}>{SLOT_LABELS[slot] ?? slot}</option>)}
              </select>
              <span className="filter-divider" />
              <label>装等 ≥ <input type="number" min="0" value={workspace.filters.itemLevelMin ?? ''} onChange={(event) => updateFilter('itemLevelMin', event.target.value ? Number(event.target.value) : null)} /></label>
              <label>≤ <input type="number" min="0" value={workspace.filters.itemLevelMax ?? ''} onChange={(event) => updateFilter('itemLevelMax', event.target.value ? Number(event.target.value) : null)} /></label>
            </div>
          </section>

          <section className="rules-panel glass-panel">
            <div className="section-heading">
              <div><span className="eyebrow">BULK RULES</span><h2>按类型快速设置</h2><p>作用于当前范围与筛选；自定义物品和系统基线项始终排除。</p></div>
              <div className="section-actions"><button className="button ghost compact" type="button" onClick={() => setBulkRules(createEmptyBulkRules())}>重置规则</button><button className="button primary compact" type="button" onClick={openBulkPreview}>预览并应用</button></div>
            </div>
            <div className="rule-matrix" role="table" aria-label="物品类型批量规则">
              <div className="matrix-row matrix-head" role="row"><span>物品类型</span><span>跳过拾取</span><span>出售策略</span></div>
              {CATEGORY_ORDER.map((category) => (
                <div className="matrix-row" role="row" key={category}>
                  <strong>{CATEGORY_LABELS[category]}<small>{categoryCounts[category]} 项</small></strong>
                  {(() => {
                    const directive = bulkRules[category].skipLoot;
                    return <button className={`rule-directive ${directive} skipLoot`} type="button" aria-label={`${CATEGORY_LABELS[category]}跳过拾取：${DIRECTIVE_LABELS[directive]}`} onClick={() => cycleRule(category, 'skipLoot')}>{DIRECTIVE_LABELS[directive]}</button>;
                  })()}
                  <div className="segmented bulk-strategy" role="group" aria-label={`${CATEGORY_LABELS[category]}出售策略`}>
                    {([
                      ['unchanged', '保持现状'],
                      ['none', '未处理'],
                      ['autoSell', '自动出售'],
                      ['protect', '保护不出售'],
                    ] as const).map(([disposition, label]) => (
                      <button className={`bulk-strategy-option ${bulkDisposition(category) === disposition ? 'on' : ''} ${disposition}`} type="button" key={disposition} aria-pressed={bulkDisposition(category) === disposition} onClick={() => setBulkDisposition(category, disposition)}>{label}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <details className="quick-config">
              <summary><span><strong>快速配置</strong><small>先生成差异预览，确认后原子应用，可撤销</small></span><b>⌄</b></summary>
              <div className="quick-config-grid">
                <button type="button" onClick={() => openQuickBulkPreview('lowerLevels')}><strong>低等级装备</strong><span>除当前最高等级外的所有等级 → 自动出售</span></button>
                <button type="button" onClick={() => openQuickBulkPreview('scopeAutoSell')}><strong>当前范围</strong><span>当前选择范围的装备 → 自动出售</span></button>
                <button type="button" onClick={() => openQuickBulkPreview('scopeProtect')}><strong>当前范围</strong><span>当前选择范围的装备 → 保护不出售</span></button>
                <button type="button" onClick={() => openQuickBulkPreview('scopeNone')}><strong>清除策略</strong><span>当前选择范围的装备 → 不做特殊处理</span></button>
              </div>
            </details>
            <div className="rule-note"><span>!</span> 新目录物品不会自动继承批量规则；“开启自动出售/保护”会原子关闭其互斥状态。</div>
          </section>

          <section className="items-panel glass-panel">
            <div className="section-heading item-heading">
              <div><span className="eyebrow">ITEM STATES</span><h2>物品状态</h2><p>游戏配置按精确名称全局生效；跨副本同名仅保存一份状态。</p></div>
              <span className="range-count">{filteredItems.length ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filteredItems.length)}` : '0'} / {filteredItems.length}</span>
            </div>
            <div className="item-table" role="table" aria-label="物品状态列表">
              <div className="item-row item-head" role="row"><span>物品与来源</span><span>类型 / 品质</span><span>跳过拾取</span><span>出售策略</span></div>
              {visibleItems.map((item) => {
                const state = cloneState(stateMap.get(item.id));
                const source = item.sources[0];
                return (
                  <div className={`item-row ${item.customOverride ? 'custom-row' : ''} ${item.historical ? 'historical-row' : ''}`} role="row" key={item.id}>
                    <div className="item-name">
                      <strong>{item.name}{item.systemSeed && <span className="seed-badge">保护基线</span>}{item.customOverride && <span className="custom-badge">自定义</span>}{item.historical && <span className="history-badge">历史</span>}</strong>
                      <small title={item.sources.map((entry) => `${entry.expansion} / ${entry.mapName} / ${entry.bossName}`).join('\n')}>{source ? `${source.expansion} · ${source.mapName} · ${source.bossName}${item.sources.length > 1 ? ` 等 ${item.sources.length} 个来源` : ''}` : item.subtype ?? '手动维护'}</small>
                      {item.customOverride && <button className="text-action" type="button" onClick={() => removeCustomOverride(item.id)}>{catalogIdSet.has(item.id) ? '恢复官方批量管理' : '移出自定义库'}</button>}
                      {item.historical && <button className="text-action" type="button" onClick={() => removeHistoricalState(item.id)}>清除历史状态并停止导出</button>}
                    </div>
                    <span className={`category-pill quality-${item.qualityMax ?? item.quality ?? 0}`}>{CATEGORY_LABELS[item.category]}{item.subtype ? ` · ${item.subtype}` : ''}{item.itemLevelMax ? ` · ${item.itemLevelMin === item.itemLevelMax ? item.itemLevelMax : `${item.itemLevelMin}–${item.itemLevelMax}`}` : ''}</span>
                    <StateButton field="skipLoot" state={state} onClick={() => toggleItemState(item, 'skipLoot')} />
                    <DispositionSelector disposition={itemDisposition(state)} onChange={(disposition) => setItemDisposition(item, disposition)} />
                  </div>
                );
              })}
              {visibleItems.length === 0 && <div className="empty-state"><strong>没有匹配的物品</strong><p>调整副本范围或筛选条件后再试。</p></div>}
            </div>
            {totalPages > 1 && <div className="pagination"><button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</button><span>第 {currentPage} / {totalPages} 页</span><button type="button" disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>下一页</button></div>}
          </section>
        </section>
      </div>

      <footer className="export-dock glass-panel">
        <div><span className="fingerprint-dot" /><p><strong>{!catalogIndexed ? '正在建立目录索引…' : hydrated ? '配置已自动保存在本地' : '正在恢复本地工作区…'}</strong><small>{undoWorkspace ? '最近一次变更可以撤销' : '同一批导出共享指纹与时间戳'}</small></p>{undoWorkspace && <button className="text-button" type="button" onClick={() => { setWorkspace(undoWorkspace); setUndoWorkspace(null); setToast({ tone: 'success', message: '已撤销最近一次变更。' }); }}>撤销</button>}</div>
        <div className="dock-actions"><button className="button ghost" type="button" disabled={!catalogIndexed} onClick={() => exportFiles('pickup')}>下载跳过拾取</button><button className="button ghost" type="button" disabled={!catalogIndexed} onClick={() => exportFiles('sell')}>下载自动出售</button><button className="button primary" type="button" disabled={!catalogIndexed} onClick={() => exportFiles('both')}>两个都下载</button></div>
      </footer>

      {dialog && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}>
        {dialog === 'custom' && <Modal title="添加自定义物品" eyebrow="CUSTOM ITEMS" onClose={() => setDialog(null)}>
          <p className="modal-copy">每行一个精确物品名称。自定义物品不分类，永远不受任何批量规则影响，三个状态需要在物品表中逐项设置。</p>
          <textarea className="custom-textarea" value={customInput} onChange={(event) => setCustomInput(event.target.value)} rows={9} placeholder={'例如：\n水长生 ·雪银莲\n我的自定义物品'} autoFocus />
          <div className="modal-actions"><button className="button ghost" type="button" onClick={() => setDialog(null)}>取消</button><button className="button primary" type="button" onClick={addCustomItems}>添加到物品库</button></div>
        </Modal>}

        {dialog === 'workspace' && <Modal title="本地工作区" eyebrow="LOCAL WORKSPACE" onClose={() => setDialog(null)}>
          <div className="workspace-actions-list">
            <button type="button" onClick={() => downloadText(`剑网3掉落工坊-工作区_${shanghaiDateStamp()}.json`, exportWorkspaceBackup(workspace))}><strong>导出工作区备份</strong><small>保存全部状态、自定义物品、范围和筛选偏好</small></button>
            <button type="button" onClick={() => backupInputRef.current?.click()}><strong>导入工作区备份</strong><small>跨域名或移动离线文件后恢复上次状态</small></button>
            <button type="button" onClick={() => void checkCatalogUpdate()}><strong>检查数据更新</strong><small>在线版读取项目 manifest；离线版不会自动联网</small></button>
            <button type="button" onClick={() => dataPackInputRef.current?.click()}><strong>导入数据包</strong><small>校验 SHA-256 和完整性后保存到本机 IndexedDB</small></button>
            {embeddedSnapshot && activeSnapshot.contentHash !== embeddedSnapshot.contentHash && <button type="button" onClick={() => void restoreEmbeddedCatalog()}><strong>恢复内置数据目录</strong><small>保留物品选择，只切回随当前版本附带的快照</small></button>}
            <button className="danger-row" type="button" onClick={doResetWorkspace}><strong>重置工作区</strong><small>恢复 21 项首次保护基线，清除其他本地选择</small></button>
          </div>
          <p className="storage-note">清除浏览器 HTTP 缓存通常不会删除这里的数据；只有清除站点数据或主动重置才会移除。不同域名和不同 file:// 路径不会自动共享工作区。</p>
        </Modal>}

        {dialog === 'bulk' && bulkPreview && <Modal title="确认批量变更" eyebrow="DIFF PREVIEW" onClose={() => setDialog(null)}>
          {bulkPreviewContext && <p className="modal-copy"><strong>{bulkPreviewContext.label}</strong> · 目标 {bulkPreviewContext.targetCount.toLocaleString('zh-CN')} 项；确认后保留一步撤销。</p>}
          <div className="preview-stats"><span><strong>{bulkPreview.changes.length}</strong> 项改变</span><span><strong>{bulkPreview.excludedCustom}</strong> 项自定义排除</span><span><strong>{bulkPreview.conflictsResolved}</strong> 个互斥处理</span></div>
          <div className="diff-list">
            {bulkPreview.changes.slice(0, 120).map((change) => <div key={change.id}><strong>{change.name}</strong><span>{stateSummary(change.before)} → {stateSummary(change.after)}</span></div>)}
            {bulkPreview.changes.length > 120 && <p>另有 {bulkPreview.changes.length - 120} 项变更未展开显示。</p>}
            {bulkPreview.changes.length === 0 && <div className="empty-state compact"><strong>没有状态需要改变</strong></div>}
          </div>
          <div className="modal-actions"><button className="button ghost" type="button" onClick={() => setDialog(null)}>返回修改</button><button className="button primary" type="button" onClick={applyBulkPreview} disabled={bulkPreview.changes.length === 0}>确认应用</button></div>
        </Modal>}

        {dialog === 'import' && importDraft && <Modal title="导入配置预览" eyebrow="SAFE IMPORT" onClose={() => setDialog(null)}>
          <p className="modal-copy"><strong>{importDraft.filename}</strong> · 已识别 {importDraft.preview.declared.map((field) => STATE_LABELS[field]).join('、')}</p>
          <div className="mode-switch"><button className={importDraft.mode === 'merge' ? 'active' : ''} type="button" onClick={() => changeImportMode('merge')}><strong>合并</strong><small>文件未出现的名称保持不变</small></button><button className={importDraft.mode === 'replace' ? 'active' : ''} type="button" onClick={() => changeImportMode('replace')}><strong>替换</strong><small>清空文件已声明的目标表后应用</small></button></div>
          <div className="preview-stats"><span><strong>{importDraft.preview.changes.length}</strong> 项改变</span><span><strong>{importDraft.preview.unknownNames.length}</strong> 项进入自定义库</span><span><strong>{importDraft.preview.conflictsResolved}</strong> 个保护优先冲突</span></div>
          <div className="diff-list">{importDraft.preview.changes.slice(0, 100).map((change) => <div key={change.id}><strong>{change.name}</strong><span>{stateSummary(change.before)} → {stateSummary(change.after)}</span></div>)}</div>
          <div className="modal-actions"><button className="button ghost" type="button" onClick={() => setDialog(null)}>取消</button><button className="button primary" type="button" onClick={applyImport}>确认导入</button></div>
        </Modal>}
      </div>}

      {toast && <div className={`toast ${toast.tone}`} role="status" aria-live="polite">{toast.message}<button type="button" aria-label="关闭提示" onClick={() => setToast(null)}>×</button></div>}
    </main>
  );
}

function StateButton({ field, state, onClick }: { field: StateField; state: ItemState; onClick: () => void }) {
  const enabled = state[field];
  const inactiveLabels: Record<StateField, string> = { skipLoot: '不跳过', autoSell: '不出售', protect: '未保护' };
  const activeLabels: Record<StateField, string> = { skipLoot: '已跳过', autoSell: '自动卖', protect: '已保护' };
  return <button className={`state-toggle ${field} ${enabled ? 'checked' : ''}`} aria-pressed={enabled} aria-label={`${STATE_LABELS[field]}：${enabled ? '开启' : '关闭'}`} onClick={onClick} type="button"><i />{enabled ? activeLabels[field] : inactiveLabels[field]}</button>;
}

function DispositionSelector({ disposition, onChange }: { disposition: ItemDisposition; onChange: (disposition: ItemDisposition) => void }) {
  const options: Array<[ItemDisposition, string]> = [
    ['none', '未处理'],
    ['autoSell', '自动出售'],
    ['protect', '保护不出售'],
  ];
  return (
    <div className="segmented disposition-selector" role="group" aria-label="出售策略">
      {options.map(([value, label]) => (
        <button className={`disposition-option ${value} ${disposition === value ? 'on' : ''}`} type="button" key={value} aria-pressed={disposition === value} title={`出售策略：${label}`} onClick={() => onChange(value)}>{label}</button>
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
