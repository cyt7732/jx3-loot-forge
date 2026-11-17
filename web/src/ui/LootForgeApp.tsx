'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildCatalogItems,
  catalogSnapshot,
  getCurrentSeasonGroup,
  getLegacyEquipment,
  getLegacyMaps,
  groupMapsByDifficulty,
  groupMapsByLevel,
  loadCatalogSnapshot,
} from '../catalog';
import { buildExportBatch } from '../config/exporter';
import { parseManagedConfig, previewImport, validateItemName } from '../config/importer';
import { ChangelogDialog } from './ChangelogDialog';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  CLIENT_STORAGE_KEY,
  CUSTOM_SCOPE_ID,
  DEFAULT_PROTECTED_ITEMS,
  THEME_STORAGE_KEY,
  type GameClient,
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
  CatalogMap,
  CatalogSnapshot,
  ItemCategory,
  ItemState,
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
  saveWorkspace,
  MAX_DATA_PACK_BYTES,
  readWorkspaceBackupFile,
  resetWorkspace,
} from '../storage/workspace';
import { downloadText } from '../utils/download';
import { CategoryTable } from './CategoryTable';
import { CustomItemsDialog, EmptyExportWarningDialog, ImportConfigDialog, WorkspaceDialog } from './Dialogs';
import { downloadBatchFile, shanghaiDateStamp } from './display';
import { ScopeTree } from './ScopeTree';
import { ToastCard } from './primitives';
import { TopBar } from './TopBar';
import type {
  DialogName,
  DrawerStateView,
  ExportKind,
  FocusedScope,
  ImportDraft,
  ItemDisposition,
  ScopeLevelGroup,
  ThemeMode,
  Toast,
  ViewItem,
} from './types';

// 兼容历史导入路径：sourceKey 此前直接从本模块导出
export { sourceKey } from './display';

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
  const [drawerStateView, setDrawerStateView] = useState<DrawerStateView>('all');
  const [drawerPage, setDrawerPage] = useState(1);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [pendingExportKind, setPendingExportKind] = useState<ExportKind>('combined');
  const [focusedScope, setFocusedScope] = useState<FocusedScope>({ type: 'all' });
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'dark';
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  const [client, setClient] = useState<GameClient>(() => {
    if (typeof window === 'undefined') return 'std';
    try {
      const saved = localStorage.getItem(CLIENT_STORAGE_KEY) as GameClient | null;
      return saved === 'origin' ? 'origin' : 'std';
    } catch {
      return 'std';
    }
  });

  const exportMenuRef = useRef<HTMLDivElement>(null);
  const configInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const dataPackInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme);
      const meta = document.querySelector('meta[name="color-scheme"]');
      if (meta) meta.setAttribute('content', theme);
    } catch {
      // 忽略 DOM 属性同步异常
    }
  }, [theme]);

  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-client', client);
    } catch {
      // 忽略 DOM 属性同步异常
    }
  }, [client]);

  const toggleTheme = () => {
    const nextTheme: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      document.documentElement.setAttribute('data-theme', nextTheme);
      const meta = document.querySelector('meta[name="color-scheme"]');
      if (meta) meta.setAttribute('content', nextTheme);
    } catch {
      // 忽略存储异常
    }
  };

  const switchClient = async (targetClient: GameClient) => {
    if (targetClient === client) return;
    try {
      if (hydrated && persistenceEnabled) {
        saveWorkspace(workspace, client);
      }
      setClient(targetClient);
      localStorage.setItem(CLIENT_STORAGE_KEY, targetClient);
      document.documentElement.setAttribute('data-client', targetClient);

      const [nextEmbedded, nextOverride] = await Promise.all([
        loadCatalogSnapshot(targetClient),
        loadCatalogOverride(targetClient).catch(() => null),
      ]);
      // 与启动路径保持一致：导入的数据包若比内置数据新，同样优先生效
      const selection = selectCatalogSnapshot(nextEmbedded, nextOverride);
      setEmbeddedSnapshot(nextEmbedded);
      setActiveSnapshot(selection.snapshot);

      const { workspace: restoredWorkspace, persistenceEnabled: isPersistent } = handleWorkspaceInitialization(
        selection.snapshot.catalogVersion,
        (notif) => setToast(notif),
        targetClient,
      );
      setWorkspace(restoredWorkspace);
      setPersistenceEnabled(isPersistent);
      setFocusedScope({ type: 'all' });
      setToast({
        tone: 'success',
        message: `已切换至「${targetClient === 'origin' ? '缘起怀旧服' : '旗舰正式服'}」数据`,
      });
    } catch (error) {
      setToast({
        tone: 'error',
        message: `切换客户端失败：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };

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
    const handleCatalogUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ client: GameClient; catalogVersion: string; snapshot: CatalogSnapshot }>;
      if (customEvent.detail?.client === client) {
        setToast({
          tone: 'success',
          message: `官方数据包已静默升级至「${customEvent.detail.catalogVersion}」，刷新页面即可应用最新数据。`,
        });
      }
    };
    window.addEventListener('jx3-catalog-updated', handleCatalogUpdated);
    return () => window.removeEventListener('jx3-catalog-updated', handleCatalogUpdated);
  }, [client]);

  useEffect(() => {
    let cancelled = false;
    let cancelIndexing: () => void = () => undefined;
    const initialize = async () => {
      try {
        const initialClient = client;
        const [embedded, override] = await Promise.all([
          loadCatalogSnapshot(initialClient),
          loadCatalogOverride(initialClient).catch(() => null),
        ]);
        if (cancelled) return;
        const selection = selectCatalogSnapshot(embedded, override);
        setEmbeddedSnapshot(embedded);
        setActiveSnapshot(selection.snapshot);
        const { workspace: restoredWorkspace, persistenceEnabled: isPersistent } = handleWorkspaceInitialization(
          selection.snapshot.catalogVersion,
          (notif) => setToast(notif),
          initialClient,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeCatalogItems = useMemo(() => (catalogIndexed ? buildCatalogItems(activeSnapshot) : []), [activeSnapshot, catalogIndexed]);

  useEffect(() => {
    if (!hydrated || !persistenceEnabled) return;
    const timer = window.setTimeout(() => {
      executeDebouncedSave(workspace, persistenceEnabled, hydrated, (notif) => setToast(notif), client);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [workspace, hydrated, persistenceEnabled, client]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
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
  const hasDungeonScope = useMemo(() => [...selectedMaps].some((id) => id !== CUSTOM_SCOPE_ID) || selectedBosses.size > 0, [selectedMaps, selectedBosses]);

  const levelGroups = useMemo<ScopeLevelGroup[]>(() => {
    const query = scopeQuery.trim();
    return groupMapsByLevel(activeSnapshot.maps, client)
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
        return { ...levelGroup, maps: difficultyGroups.flatMap((group) => group.maps), difficultyGroups, levelMatches };
      })
      .filter((group) => {
        if (!query) return true;
        return group.maps.length > 0 || group.levelMatches;
      });
  }, [activeSnapshot.maps, client, scopeQuery]);

  const customCount = useMemo(() => {
    return allItems.filter((item) => item.isCustom || item.customOverride || item.historical).length;
  }, [allItems]);

  const sourceMatchesExportScope = (item: ViewItem): boolean => {
    const isCustomItem = Boolean(item.isCustom || item.customOverride || item.historical);
    if (!hasScope) return isCustomItem;
    const matchesCustom = selectedMaps.has(CUSTOM_SCOPE_ID) && isCustomItem;
    const matchesSource = item.sources.some((source) => selectedMaps.has(source.mapId) || selectedBosses.has(`${source.mapId}:${encodeURIComponent(source.bossName)}`));
    return matchesCustom || matchesSource;
  };

  const sourceMatchesViewScope = (item: ViewItem): boolean => {
    const isCustomItem = Boolean(item.isCustom || item.customOverride || item.historical);
    if (focusedScope.type === 'custom') {
      return isCustomItem;
    }
    if (focusedScope.type === 'level') {
      const levelMapSet = new Set(focusedScope.mapIds);
      return item.sources.some((source) => levelMapSet.has(source.mapId));
    }
    if (focusedScope.type === 'difficulty') {
      const diffMapSet = new Set(focusedScope.mapIds);
      return item.sources.some((source) => diffMapSet.has(source.mapId));
    }
    if (focusedScope.type === 'map') {
      return item.sources.some((source) => source.mapId === focusedScope.mapId);
    }
    if (focusedScope.type === 'boss') {
      return item.sources.some((source) => source.mapId === focusedScope.mapId && source.bossName === focusedScope.bossName);
    }
    return sourceMatchesExportScope(item);
  };

  const hasScopeInView = focusedScope.type !== 'all' || hasDungeonScope;

  const availableCategories = useMemo(() => {
    const counts = Object.fromEntries(CATEGORY_ORDER.map((category) => [category, 0])) as Record<ItemCategory, number>;
    for (const item of allItems) {
      if (!sourceMatchesViewScope(item)) continue;
      counts[item.category] += 1;
    }
    return CATEGORY_ORDER.filter((category) => counts[category] > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems, hasScope, selectedMaps, selectedBosses, focusedScope]);

  const scopedItems = useMemo(() => {
    return allItems.filter((item) => sourceMatchesViewScope(item));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems, hasScope, selectedMaps, selectedBosses, focusedScope]);

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

  const drawerItems = useMemo(() => {
    if (!expandedCategory) return [];
    const query = drawerQuery.trim().normalize('NFC');
    return allItems.filter((item) => {
      if (item.category !== expandedCategory) return false;
      if (!sourceMatchesViewScope(item)) return false;
      if (query && !item.name.normalize('NFC').includes(query) && !item.sources.some((source) => `${source.expansion}${source.mapName}${source.bossName}`.includes(query))) return false;
      const state = cloneState(stateMap.get(item.id));
      if (drawerStateView === 'configured' && !state.skipLoot && !state.autoSell && !state.protect) return false;
      if (drawerStateView === 'unconfigured' && (state.skipLoot || state.autoSell || state.protect)) return false;
      if (drawerStateView === 'protected' && !state.protect) return false;
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedCategory, drawerQuery, drawerStateView, allItems, stateMap, hasScope, selectedMaps, selectedBosses, focusedScope]);

  const drawerTotalPages = Math.max(1, Math.ceil(drawerItems.length / 20));
  const currentDrawerPage = Math.min(drawerPage, drawerTotalPages);
  const visibleDrawerItems = drawerItems.slice((currentDrawerPage - 1) * 20, currentDrawerPage * 20);

  const commitStateMap = (nextMap: Map<string, ItemState>, keepUndo = true) => {
    if (keepUndo) setUndoWorkspace(workspace);
    setWorkspace((current) => workspaceWithStateMap(current, nextMap));
  };

  const toggleItemState = (item: ViewItem, field: StateField) => {
    if (focusedScope.type !== 'custom' && (item.customOverride || customOverrides.has(item.id))) {
      setToast({
        tone: 'warning',
        message: `“${item.name}”已在【用户自定义】中维护（享有最高优先级），副本内设置不生效。如需修改请前往【用户自定义】。`,
      });
      return;
    }
    const next = new Map(stateMap);
    const before = cloneState(next.get(item.id));
    next.set(item.id, setStateField(before, field, !before[field]));
    commitStateMap(next);
  };

  const setItemDisposition = (item: ViewItem, disposition: ItemDisposition) => {
    if (focusedScope.type !== 'custom' && (item.customOverride || customOverrides.has(item.id))) {
      setToast({
        tone: 'warning',
        message: `“${item.name}”已在【用户自定义】中维护（享有最高优先级），副本内设置不生效。如需修改请前往【用户自定义】。`,
      });
      return;
    }
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

  const toggleBoss = (mapId: number, bossName: string, mapBossNames?: string[]) => {
    const key = `${mapId}:${encodeURIComponent(bossName)}`;
    setWorkspace((current) => {
      const isMapSelected = current.selectedMapIds.includes(mapId);
      const bosses = new Set(current.selectedBossKeys);

      if (isMapSelected) {
        const nextMaps = current.selectedMapIds.filter((id) => id !== mapId);
        const mapBosses = mapBossNames ?? activeSnapshot.maps.find((m) => m.mapId === mapId)?.bossNames ?? [];
        for (const b of mapBosses) {
          if (b !== bossName) {
            bosses.add(`${mapId}:${encodeURIComponent(b)}`);
          }
        }
        bosses.delete(key);
        return {
          ...current,
          selectedMapIds: nextMaps,
          selectedBossKeys: [...bosses],
          updatedAt: new Date().toISOString(),
        };
      }

      if (bosses.has(key)) {
        bosses.delete(key);
      } else {
        bosses.add(key);
      }
      return {
        ...current,
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
        || (map.bossNames.length > 0 && map.bossNames.every((boss) => bosses.has(`${map.mapId}:${encodeURIComponent(boss)}`))));
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
    if (focusedScope.type === 'custom') return '✨ 用户自定义物品';
    if (focusedScope.type === 'level') {
      const eraPart = focusedScope.eraName ? `${focusedScope.eraName} · ` : '';
      return `『${focusedScope.name}』${focusedScope.level !== null ? ` (${eraPart}Lv.${focusedScope.level})` : ''}`;
    }
    if (focusedScope.type === 'difficulty') return `『${focusedScope.levelName}』· ${focusedScope.label}`;
    if (focusedScope.type === 'map') return `${focusedScope.name} (${focusedScope.difficulty})`;
    if (focusedScope.type === 'boss') return `${focusedScope.mapName} · ${focusedScope.bossName}`;
    if (!hasScope) return '尚未选择范围';
    const parts: string[] = [];
    if (selectedMaps.has(CUSTOM_SCOPE_ID)) parts.push('✨ 用户自定义');
    const officialMaps = [...selectedMaps].filter((id) => id !== CUSTOM_SCOPE_ID);
    if (officialMaps.length > 0) parts.push(`${officialMaps.length} 个副本`);
    if (selectedBosses.size > 0) parts.push(`${selectedBosses.size} 个 Boss`);
    if (parts.length === 0) return '尚未选择范围';
    return parts.join(' + ');
  }, [focusedScope, hasScope, selectedBosses.size, selectedMaps]);

  const isCurrentScopeChecked = useMemo(() => {
    if (focusedScope.type === 'all') return true;
    if (focusedScope.type === 'custom') return selectedMaps.has(CUSTOM_SCOPE_ID);
    if (focusedScope.type === 'level' || focusedScope.type === 'difficulty') {
      return focusedScope.mapIds.length > 0 && focusedScope.mapIds.every((id) => selectedMaps.has(id));
    }
    if (focusedScope.type === 'map') return selectedMaps.has(focusedScope.mapId);
    if (focusedScope.type === 'boss') return selectedBosses.has(`${focusedScope.mapId}:${encodeURIComponent(focusedScope.bossName)}`) || selectedMaps.has(focusedScope.mapId);
    return false;
  }, [focusedScope, selectedMaps, selectedBosses]);

  const checkCurrentFocusedScope = () => {
    if (focusedScope.type === 'all') return;
    if (focusedScope.type === 'custom') {
      if (!selectedMaps.has(CUSTOM_SCOPE_ID)) toggleMap(CUSTOM_SCOPE_ID);
      setToast({ tone: 'success', message: '已勾选【用户自定义】用于导出' });
      return;
    }
    if (focusedScope.type === 'level' || focusedScope.type === 'difficulty') {
      setWorkspace((current) => {
        const nextMaps = new Set(current.selectedMapIds);
        for (const id of focusedScope.mapIds) nextMaps.add(id);
        return { ...current, selectedMapIds: [...nextMaps], updatedAt: new Date().toISOString() };
      });
      setToast({ tone: 'success', message: `已勾选【${focusedScope.type === 'level' ? focusedScope.name : focusedScope.label}】全部副本用于导出` });
      return;
    }
    if (focusedScope.type === 'map') {
      if (!selectedMaps.has(focusedScope.mapId)) toggleMap(focusedScope.mapId);
      setToast({ tone: 'success', message: `已勾选【${focusedScope.name}】用于导出` });
      return;
    }
    if (focusedScope.type === 'boss') {
      if (!selectedBosses.has(`${focusedScope.mapId}:${encodeURIComponent(focusedScope.bossName)}`) && !selectedMaps.has(focusedScope.mapId)) {
        toggleBoss(focusedScope.mapId, focusedScope.bossName);
      }
      setToast({ tone: 'success', message: `已勾选【${focusedScope.bossName}】用于导出` });
    }
  };

  const uncheckCurrentFocusedScope = () => {
    if (focusedScope.type === 'all') return;
    if (focusedScope.type === 'custom') {
      if (selectedMaps.has(CUSTOM_SCOPE_ID)) toggleMap(CUSTOM_SCOPE_ID);
      setToast({ tone: 'success', message: '已取消勾选【用户自定义】' });
      return;
    }
    if (focusedScope.type === 'level' || focusedScope.type === 'difficulty') {
      setWorkspace((current) => {
        const nextMaps = new Set(current.selectedMapIds);
        for (const id of focusedScope.mapIds) nextMaps.delete(id);
        const mapIds = new Set(focusedScope.mapIds);
        return {
          ...current,
          selectedMapIds: [...nextMaps],
          selectedBossKeys: current.selectedBossKeys.filter((key) => !mapIds.has(Number(key.split(':')[0]))),
          updatedAt: new Date().toISOString(),
        };
      });
      setToast({ tone: 'success', message: `已取消勾选【${focusedScope.type === 'level' ? focusedScope.name : focusedScope.label}】` });
      return;
    }
    if (focusedScope.type === 'map') {
      if (selectedMaps.has(focusedScope.mapId)) toggleMap(focusedScope.mapId);
      setToast({ tone: 'success', message: `已取消勾选【${focusedScope.name}】` });
      return;
    }
    if (focusedScope.type === 'boss') {
      toggleBoss(focusedScope.mapId, focusedScope.bossName);
      setToast({ tone: 'success', message: `已取消勾选【${focusedScope.bossName}】` });
    }
  };

  const handleSelectAllOldMaps = () => {
    const lowerLevelMaps = getLegacyMaps(activeSnapshot.maps);
    setWorkspace((current) => ({
      ...current,
      selectedMapIds: [
        ...(current.selectedMapIds.includes(CUSTOM_SCOPE_ID) ? [CUSTOM_SCOPE_ID] : []),
        ...lowerLevelMaps.map((map) => map.mapId),
      ],
      selectedBossKeys: [],
      updatedAt: new Date().toISOString(),
    }));
    setToast({ tone: 'success', message: `已勾选前尘老本用于导出（共 ${lowerLevelMaps.length} 个副本，涵盖炜历全部历史秘境）` });
  };

  const handleFocusCurrentSeason = () => {
    const currentSeason = getCurrentSeasonGroup(activeSnapshot.maps);
    if (currentSeason) {
      setScopeQuery('');
      setFocusedScope({
        type: 'level',
        id: currentSeason.id,
        name: currentSeason.name,
        era: currentSeason.era,
        eraName: currentSeason.eraName,
        level: currentSeason.level,
        mapIds: currentSeason.maps.map((m) => m.mapId),
      });
      setToast({ tone: 'success', message: `已聚焦查看【${currentSeason.label}】副本策略` });
    }
  };

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
      if (!sourceMatchesViewScope(item)) continue;
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
  }, [allItems, availableCategories, hasScope, selectedMaps, selectedBosses, stateMap, focusedScope]);

  const applyCategoryDirectAction = (category: ItemCategory, action: BatchActionType) => {
    const scopedCategoryOfficial = allItems.filter((item) => (
      item.category === category
      && !item.customOverride
      && !item.historical
      && sourceMatchesViewScope(item)
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
    if (!hasScopeInView && kind !== 'lowerLevels') {
      setToast({ tone: 'warning', message: '请先在左侧选择要配置的副本或版本范围。' });
      return;
    }
    const scopedAllOfficial = allItems.filter((item) => (
      !item.customOverride
      && !item.historical
      && sourceMatchesViewScope(item)
    ));

    if (kind === 'lowerLevels') {
      const officialEquipment = allItems.filter((item) => item.category === 'equipment' && !item.customOverride && !item.historical);
      const lowerLevelEquipment = getLegacyEquipment(officialEquipment, activeSnapshot.maps);
      const preview = previewBulkRules(lowerLevelEquipment, stateMap, customOverrides, createEquipmentBulkRules('autoSell'));
      if (preview.changes.length === 0) {
        setToast({ tone: 'warning', message: '所有历史旧版本装备已处于自动出售状态。' });
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
      rules.specialWeapon.protect = 'enable';
      rules.specialWeapon.autoSell = 'disable';
      rules.specialDrop.protect = 'enable';
      rules.specialDrop.autoSell = 'disable';
      rules.pet.protect = 'enable';
      rules.pet.autoSell = 'disable';
      rules.bigIron.protect = 'enable';
      rules.bigIron.autoSell = 'disable';
      rules.furniture.protect = 'enable';
      rules.furniture.autoSell = 'disable';
      desc = '推荐预设';
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
    const exportItems = allItems.filter(sourceMatchesExportScope);
    const targetIdSet = new Set(exportItems.map((item) => item.id));
    return [...stateMap.entries()]
      .filter(([id, state]) => targetIdSet.has(id) && (state.skipLoot || state.autoSell || state.protect))
      .map(([id, state]) => ({ name: names.get(id) ?? id, state }));
  };

  const executeExport = (kind: ExportKind = 'combined', force = false) => {
    try {
      if (!catalogIndexed) throw new Error('数据目录仍在建立索引，请稍候再导出。');
      const hasExportSelection = selectedMaps.size > 0 || selectedBosses.size > 0;
      if (!hasExportSelection && !force) {
        setPendingExportKind(kind);
        setDialog('emptyExportWarning');
        return;
      }
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

  const exportFiles = (kind: ExportKind = 'combined') => {
    executeExport(kind, false);
  };

  const exportFromMenu = (kind: ExportKind) => {
    exportFiles(kind);
    setExportMenuOpen(false);
  };

  const handleConfigFile = async (file: File) => {
    try {
      if (!file.name.endsWith('.us.jx3dat')) throw new Error('配置文件后缀必须是 .us.jx3dat。');
      if (file.size > 5 * 1024 * 1024) throw new Error('配置文件超过 5 MiB 限制。');
      const source = decodeGbk(new Uint8Array(await file.arrayBuffer()));
      const parsed = parseManagedConfig(source);
      const mode: ImportDraft['mode'] = 'merge';
      const preview = previewImport(parsed, mode, stateMap, activeCatalogItems);
      setImportDraft({ filename: file.name, parsed, mode, preview });
      setDialog('import');
    } catch (error) {
      setToast({ tone: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      if (configInputRef.current) configInputRef.current.value = '';
    }
  };

  const changeImportMode = (mode: ImportDraft['mode']) => {
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
    await saveCatalogOverride(client, snapshot);
    setActiveSnapshot(snapshot);
    setCatalogIndexed(true);
    setWorkspace((current) => ({ ...current, catalogVersion: snapshot.catalogVersion, updatedAt: new Date().toISOString() }));
    setDialog(null);
    setToast({ tone: 'success', message });
  };

  const importDataPackFile = async (file: File) => {
    try {
      assertFileSizeWithinLimit(file, MAX_DATA_PACK_BYTES, '数据包');
      const snapshot = await parseCatalogDataPack(await file.text(), client);
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
      const manifestUrl = new URL(`./data/manifest.${client}.json`, window.location.href);
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
      const snapshot = await parseCatalogDataPack(await snapshotResponse.text(), client);
      await activateCatalog(snapshot, `数据目录已更新到 ${snapshot.catalogVersion}。`);
    } catch (error) {
      setToast({ tone: 'warning', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const restoreEmbeddedCatalog = async () => {
    if (!embeddedSnapshot) return;
    await clearCatalogOverride(client);
    setActiveSnapshot(embeddedSnapshot);
    setCatalogIndexed(true);
    setWorkspace((current) => ({ ...current, catalogVersion: embeddedSnapshot.catalogVersion, updatedAt: new Date().toISOString() }));
    setToast({ tone: 'success', message: '已恢复随离线包附带的数据目录。' });
  };

  const doResetWorkspace = () => {
    if (!window.confirm('确定重置整个工作区吗？物品状态、自定义物品和筛选偏好都会清除。')) return;
    setUndoWorkspace(workspace);
    setWorkspace(resetWorkspace(activeSnapshot.catalogVersion, client));
    setDialog(null);
    setToast({ tone: 'warning', message: '工作区已恢复首次启动状态。' });
  };

  return (
    <main className="app-shell">
      <input ref={configInputRef} hidden type="file" accept=".us.jx3dat" onChange={(event) => event.target.files?.[0] && void handleConfigFile(event.target.files[0])} />
      <input ref={backupInputRef} hidden type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && void importBackupFile(event.target.files[0])} />
      <input ref={dataPackInputRef} hidden type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && void importDataPackFile(event.target.files[0])} />

      <TopBar
        client={client}
        activeSnapshot={activeSnapshot}
        catalogIndexed={catalogIndexed}
        theme={theme}
        undoAvailable={Boolean(undoWorkspace)}
        hasScope={hasScope}
        currentScopeLabel={currentScopeLabel}
        exportMenuOpen={exportMenuOpen}
        exportMenuRef={exportMenuRef}
        onSwitchClient={(target) => void switchClient(target)}
        onUndo={() => {
          if (!undoWorkspace) return;
          setWorkspace(undoWorkspace);
          setUndoWorkspace(null);
          setToast({ tone: 'success', message: '已撤销最近一次变更。' });
        }}
        onToggleTheme={toggleTheme}
        onOpenDialog={setDialog}
        onImportConfig={() => configInputRef.current?.click()}
        onExport={exportFromMenu}
        onToggleExportMenu={() => setExportMenuOpen((open) => !open)}
      />

      <div className="workspace">
        <aside className="sidebar glass-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">DROP SCOPE</span><h2>选择副本范围</h2></div>
          </div>
          <label className="search-box"><span aria-hidden="true">⌕</span><input value={scopeQuery} onChange={(event) => setScopeQuery(event.target.value)} placeholder="搜索版本、副本或 Boss" /></label>
          <div className="scope-actions">
            <button
              type="button"
              title="一键勾选历史前尘老副本用于导出（自动排除当前最新活跃赛季）"
              onClick={handleSelectAllOldMaps}
            >
              全选老本
            </button>
            <button
              type="button"
              title="全选所有赛季与年代副本用于导出"
              onClick={() => {
                setWorkspace((current) => ({
                  ...current,
                  selectedMapIds: [
                    CUSTOM_SCOPE_ID,
                    ...activeSnapshot.maps.map((map) => map.mapId),
                  ],
                  selectedBossKeys: [],
                  updatedAt: new Date().toISOString(),
                }));
                setToast({ tone: 'success', message: `已勾选全部副本用于导出（共 ${activeSnapshot.maps.length} 个副本）` });
              }}
            >
              全选所有
            </button>
            <button
              type="button"
              title="清除左侧所有副本和 Boss 的勾选标记，保留用户自定义勾选，主区显示完整目录"
              aria-label="清除范围并查看全部副本"
              onClick={() => {
                setWorkspace((current) => ({
                  ...current,
                  selectedMapIds: current.selectedMapIds.includes(CUSTOM_SCOPE_ID) ? [CUSTOM_SCOPE_ID] : [],
                  selectedBossKeys: [],
                  updatedAt: new Date().toISOString(),
                }));
                setFocusedScope({ type: 'all' });
              }}
            >
              清除范围
            </button>
          </div>
          <div className="scope-rule-hint" role="note">
            <span className="hint-badge">💡 导出规则</span>
            <span>仅<strong>勾选（✓）</strong>的副本与物品会写入配置文件；未勾选内容即使已配置策略也不会导出。</span>
          </div>
          <ScopeTree
            levelGroups={levelGroups}
            client={client}
            searchActive={Boolean(scopeQuery.trim())}
            selectedMaps={selectedMaps}
            selectedBosses={selectedBosses}
            focusedScope={focusedScope}
            customCount={customCount}
            setFocusedScope={setFocusedScope}
            onToggleMap={toggleMap}
            onToggleBoss={toggleBoss}
            onToggleMapGroup={toggleMapGroup}
          />
        </aside>

        <section className="main-column">
          <div className="summary-grid">
            <article className="summary-card glass-panel gold">
              <span>当前匹配物品</span>
              <strong>{scopedItems.length.toLocaleString('zh-CN')}</strong>
              <small>{hasScopeInView ? `${scopeStats.sourceLinks.toLocaleString('zh-CN')} 处掉落来源 · ${scopeStats.repeatedNames.toLocaleString('zh-CN')} 个同名物品` : '请在左侧选择年代或副本以开始配置'}</small>
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
            {focusedScope.type !== 'all' && (
              <div className="focus-scope-banner">
                <div className="focus-scope-info">
                  <span className="focus-badge">⚡ 当前聚焦编辑</span>
                  <strong>{currentScopeLabel}</strong>
                  <span className="focus-export-status">
                    {isCurrentScopeChecked ? (
                      <span className="export-status-tag checked">✓ 已勾选导出</span>
                    ) : (
                      <span className="export-status-tag unchecked">未勾选导出</span>
                    )}
                  </span>
                </div>
                <div className="focus-scope-actions">
                  {isCurrentScopeChecked ? (
                    <button type="button" className="button ghost compact uncheck-scope-btn" onClick={uncheckCurrentFocusedScope} title="将当前编辑的年代/副本/Boss从导出范围中取消勾选">
                      ✕ 取消勾选本项
                    </button>
                  ) : (
                    <button type="button" className="button ghost compact check-scope-btn" onClick={checkCurrentFocusedScope} title="将当前编辑的年代/副本/Boss加入到右侧导出范围中">
                      ✓ 勾选本项用于导出
                    </button>
                  )}
                  <button type="button" className="button ghost compact exit-focus-btn" onClick={() => setFocusedScope({ type: 'all' })} title="退出单选聚焦模式，查看所有勾选的副本">
                    ✕ 查看全部范围
                  </button>
                </div>
              </div>
            )}

            <div className="section-heading workbench-heading">
              <div className="workbench-heading-content">
                <span className="eyebrow">CATEGORY STRATEGY</span>
                <h2>
                  {focusedScope.type !== 'all'
                    ? `专属策略直选 · ${currentScopeLabel}`
                    : hasScope
                      ? `已选范围 · 分类策略直选（已选 ${selectedMaps.size} 个副本）`
                      : '分类策略直选'}
                </h2>
                <p>
                  {focusedScope.type !== 'all' ? (
                    <>正在单独定制本范围策略，已配置规则全局自动保存；勾选左侧方框即可加入导出名单。</>
                  ) : hasScope ? (
                    <>为当前勾选的 <strong>{currentScopeLabel}</strong> 批量设置策略；<strong>导出文件以左侧勾选框标记的范围为准</strong>。</>
                  ) : (
                    <>请在左侧选择要配置的年代或副本，或使用下方快捷入口一键载入配置。</>
                  )}
                </p>
              </div>
              {hasScopeInView && (
                <div className="workbench-quick-presets">
                  <button className="button primary compact" type="button" onClick={() => applyScopePreset('farming')} title="推荐预设：旧装备全卖 + 牌子跳过 + 珍稀保护（仅对当前范围生效，已配置策略全局持久保存）">
                    ⚡ 推荐预设
                  </button>
                  <button className="button ghost compact danger-btn" type="button" onClick={() => applyScopePreset('clear')} title="清除当前范围下所有物品的出售与拾取策略，恢复未处理状态">
                    🧹 清空当前范围策略
                  </button>
                </div>
              )}
            </div>

            {!hasScopeInView ? (
              <div className="empty-workbench-card">
                <div className="empty-card-header">
                  <span className="empty-card-icon">🧭</span>
                  <div className="empty-card-text">
                    <h3>尚未选择副本范围</h3>
                    <p>请在左侧点击或勾选要配置的年代与副本；您也可以通过快捷入口一键载入：</p>
                  </div>
                </div>
                <div className="empty-card-actions">
                  <button
                    type="button"
                    className="button primary empty-quick-btn"
                    onClick={handleSelectAllOldMaps}
                    title="一键圈选所有历史前尘老秘境（涵盖炜历全系列，自动排除最新赛季秘境）"
                  >
                    🏰 一键全选前尘老本
                  </button>
                  <button
                    type="button"
                    className="button ghost empty-quick-btn"
                    onClick={handleFocusCurrentSeason}
                    title="聚焦配置当前最新赛季秘境"
                  >
                    🎯 聚焦当前赛季
                  </button>
                </div>
              </div>
            ) : (
              <CategoryTable
                summaries={categoryWorkbenchSummaries}
                expandedCategory={expandedCategory}
                onExpandCategory={(category) => {
                  setExpandedCategory((curr) => (curr === category ? null : category));
                  setDrawerQuery('');
                  setDrawerPage(1);
                }}
                onApplyAction={applyCategoryDirectAction}
                drawerQuery={drawerQuery}
                drawerStateView={drawerStateView}
                drawerItems={drawerItems}
                visibleDrawerItems={visibleDrawerItems}
                currentDrawerPage={currentDrawerPage}
                drawerTotalPages={drawerTotalPages}
                stateMap={stateMap}
                customOverrides={customOverrides}
                catalogIdSet={catalogIdSet}
                customScopeActive={focusedScope.type === 'custom'}
                onDrawerQueryChange={(query) => {
                  setDrawerQuery(query);
                  setDrawerPage(1);
                }}
                onDrawerStateViewChange={(view) => {
                  setDrawerStateView(view);
                  setDrawerPage(1);
                }}
                onCollapse={() => setExpandedCategory(null)}
                onPageChange={setDrawerPage}
                onToggleItem={toggleItemState}
                onSetDisposition={setItemDisposition}
                onRemoveCustomOverride={removeCustomOverride}
                onRemoveHistoricalState={removeHistoricalState}
              />
            )}
          </section>
        </section>
      </div>

      {dialog && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}>
        {dialog === 'emptyExportWarning' && (
          <EmptyExportWarningDialog
            onClose={() => setDialog(null)}
            onConfirm={() => {
              setDialog(null);
              executeExport(pendingExportKind ?? 'combined', true);
            }}
          />
        )}

        {dialog === 'custom' && (
          <CustomItemsDialog
            onClose={() => setDialog(null)}
            customInput={customInput}
            onCustomInputChange={setCustomInput}
            onAdd={addCustomItems}
          />
        )}

        {dialog === 'workspace' && (
          <WorkspaceDialog
            onClose={() => setDialog(null)}
            onExportBackup={() => downloadText(`剑网3掉落工坊-设置备份_${shanghaiDateStamp()}.json`, exportWorkspaceBackup(workspace))}
            onImportBackup={() => backupInputRef.current?.click()}
            onCheckUpdate={() => void checkCatalogUpdate()}
            onImportDataPack={() => dataPackInputRef.current?.click()}
            showRestoreEmbedded={Boolean(embeddedSnapshot) && activeSnapshot.contentHash !== embeddedSnapshot?.contentHash}
            onRestoreEmbedded={() => void restoreEmbeddedCatalog()}
            onReset={doResetWorkspace}
          />
        )}

        {dialog === 'changelog' && (
          <ChangelogDialog onClose={() => setDialog(null)} />
        )}

        {dialog === 'import' && importDraft && (
          <ImportConfigDialog
            draft={importDraft}
            onClose={() => setDialog(null)}
            onChangeMode={changeImportMode}
            onApply={applyImport}
          />
        )}
      </div>}

      {toast && <ToastCard toast={toast} onClose={() => setToast(null)} />}
    </main>
  );
}
