import { MANAGED_PATHS, RESERVED_MARKER_PATTERNS } from '../domain/constants';
import { cloneState, normalizeItemName, setStateField } from '../domain/state';
import type {
  CatalogItem,
  ImportMode,
  ImportPreview,
  ItemState,
  ParsedManagedConfig,
  StateChange,
  StateField,
} from '../domain/types';
import { getField, parseLuaChunk, type LuaValue } from './lua-parser';

const MAX_NAMES = 100_000;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;

function isReservedMarker(value: string): boolean {
  return RESERVED_MARKER_PATTERNS.some((pattern) => pattern.test(value));
}

function parseTarget(value: LuaValue, path: string): string[] {
  if (value.kind !== 'table') throw new Error(`${path} 必须是包装表。`);
  const data = getField(value, 'd');
  const version = getField(value, 'v');
  if (!data || data.kind !== 'table') throw new Error(`${path}.d 必须是物品表。`);
  if (!version || version.kind !== 'string') throw new Error(`${path}.v 必须是字符串。`);
  if (data.fields.length > MAX_NAMES) throw new Error(`${path} 超过 ${MAX_NAMES} 项限制。`);
  const names: string[] = [];
  for (const field of data.fields) {
    if (field.value.kind !== 'boolean') throw new Error(`${path} 中“${field.key}”的值必须是布尔值。`);
    if (!field.value.value || isReservedMarker(field.key)) continue;
    validateItemName(field.key);
    names.push(field.key);
  }
  return names;
}

export function validateItemName(name: string): void {
  const length = [...name].length;
  if (length < 1 || length > 128) throw new Error('物品名称长度必须为 1–128 个字符。');
  if (CONTROL_CHARACTERS.test(name)) throw new Error(`物品名称“${name}”包含控制字符。`);
  if (isReservedMarker(name)) throw new Error('项目指纹是保留名称，不能作为自定义物品。');
}

export function parseManagedConfig(source: string): ParsedManagedConfig {
  const root = parseLuaChunk(source);
  const byPath = new Map(root.fields.map((field) => [field.key, field.value]));
  const declared = new Set<StateField>();
  const output: ParsedManagedConfig = {
    declared,
    skipLoot: [],
    autoSell: [],
    protect: [],
    ignoredFields: root.fields.map((field) => field.key).filter((key) => !Object.values(MANAGED_PATHS).includes(key as never)),
  };

  for (const field of ['skipLoot', 'autoSell', 'protect'] as StateField[]) {
    const path = MANAGED_PATHS[field];
    const value = byPath.get(path);
    if (!value) continue;
    declared.add(field);
    output[field] = parseTarget(value, path);
  }
  if (declared.size === 0) throw new Error('文件不包含受支持的配置表。');
  return output;
}

export function previewImport(
  parsed: ParsedManagedConfig,
  mode: ImportMode,
  currentStates: Map<string, ItemState>,
  catalogItems: CatalogItem[],
): ImportPreview {
  const namesById = new Map(catalogItems.map((item) => [item.id, item.name]));
  const incoming = new Map<string, { name: string; fields: Set<StateField> }>();
  for (const field of ['skipLoot', 'autoSell', 'protect'] as StateField[]) {
    for (const name of parsed[field]) {
      const id = normalizeItemName(name);
      const entry = incoming.get(id) ?? { name, fields: new Set<StateField>() };
      entry.fields.add(field);
      incoming.set(id, entry);
    }
  }

  const affected = new Set<string>(incoming.keys());
  if (mode === 'replace') {
    for (const [id, state] of currentStates) {
      if ([...parsed.declared].some((field) => state[field])) affected.add(id);
    }
  }

  const changes: StateChange[] = [];
  let conflictsResolved = 0;
  for (const id of affected) {
    const before = cloneState(currentStates.get(id));
    let after = cloneState(before);
    const entry = incoming.get(id);
    if (mode === 'replace') {
      for (const field of parsed.declared) after = setStateField(after, field, false);
    }
    if (entry) {
      if (entry.fields.has('skipLoot')) after = setStateField(after, 'skipLoot', true);
      if (entry.fields.has('autoSell')) after = setStateField(after, 'autoSell', true);
      if (entry.fields.has('protect')) {
        if (after.autoSell || entry.fields.has('autoSell')) conflictsResolved += 1;
        after = setStateField(after, 'protect', true);
      }
    }
    if (before.skipLoot !== after.skipLoot || before.autoSell !== after.autoSell || before.protect !== after.protect) {
      changes.push({ id, name: entry?.name ?? namesById.get(id) ?? id, before, after, reasons: [`导入（${mode}）`] });
    }
  }

  const unknownNames = [...incoming.entries()].filter(([id]) => !namesById.has(id)).map(([, entry]) => entry.name);
  return { mode, changes, unknownNames, declared: [...parsed.declared], conflictsResolved };
}
