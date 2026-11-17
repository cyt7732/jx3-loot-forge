/** 更新日志条目（由构建期 parse-changelog.mjs 解析 CHANGELOG.md 后经 define 注入） */
export type ChangelogSection = {
  title: string;
  items: string[];
};

export type ChangelogEntry = {
  version: string;
  date: string;
  summary: string;
  sections: ChangelogSection[];
};

/** 更新日志显示范围：仅最新一版 / 全部 / 从最新到指定版本（含） */
export type ChangelogSelection = 'latest' | 'all' | string;

/** Keep a Changelog 英文分节标题 → 界面中文标签，未映射的标题原样显示 */
export const SECTION_LABELS: Record<string, string> = {
  Added: '新功能',
  Changed: '改进',
  Fixed: '修复',
  Removed: '移除',
  Deprecated: '弃用',
  Security: '安全',
  Performance: '性能',
  Build: '构建',
  Data: '数据',
  Docs: '文档',
  Tests: '测试',
};

export function sectionLabel(title: string): string {
  return SECTION_LABELS[title] ?? title;
}

export const CHANGELOG_ENTRIES: ChangelogEntry[] = __CHANGELOG__ as ChangelogEntry[];

/**
 * 按显示范围裁剪更新日志条目（entries 顺序为最新在前）。
 * - 'latest'：仅第一条（最新版本）
 * - 'all'：全部条目
 * - 版本号（如 '1.6.3'）：仅显示该版本这一条；版本不存在时退化为仅最新一条
 */
export function visibleChangelogEntries(entries: ChangelogEntry[], selection: ChangelogSelection): ChangelogEntry[] {
  if (selection === 'latest') return entries.slice(0, 1);
  if (selection === 'all') return entries;
  const selected = entries.find((entry) => entry.version === selection);
  return selected ? [selected] : entries.slice(0, 1);
}

/**
 * 渲染更新日志条目的内联 Markdown（当前仅 **粗体** 与 `行内代码`）。
 * 返回 React 可直接使用的结构化 token 流，避免 dangerouslySetInnerHTML。
 */
export type InlineToken =
  | { kind: 'text'; value: string }
  | { kind: 'strong'; value: string }
  | { kind: 'code'; value: string };

export function parseInlineMarkdown(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const pattern = /(\*\*([^*]+)\*\*)|(`([^`]+)`)/gu;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) tokens.push({ kind: 'text', value: text.slice(cursor, start) });
    if (match[2] !== undefined) tokens.push({ kind: 'strong', value: match[2] });
    else if (match[4] !== undefined) tokens.push({ kind: 'code', value: match[4] });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) tokens.push({ kind: 'text', value: text.slice(cursor) });
  return tokens;
}
