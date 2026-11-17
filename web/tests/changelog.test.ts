import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseChangelog } from '../scripts/parse-changelog.mjs';
import {
  CHANGELOG_ENTRIES,
  parseInlineMarkdown,
  sectionLabel,
  visibleChangelogEntries,
  type ChangelogEntry,
} from '../src/changelog';
import { APP_VERSION } from '../src/domain/constants';

const FIXTURE = `# 更新日志

本文件遵循 Keep a Changelog 风格。

## [1.6.5] - 2026-11-17

新增更新日志弹窗。

### Added

- **点击版本号**：弹出新版更新内容弹窗；
- 构建期注入 \`CHANGELOG.md\`。

### Fixed

## [1.6.4] - 2026-11-16

双端修复版本。

### Fixed

- **缘起端无法导入数据包**：校验硬编码问题；
- 跨端数据污染：分端槽位。
`;

function parseFixture(): ChangelogEntry[] {
  return parseChangelog(FIXTURE) as ChangelogEntry[];
}

describe('parseChangelog', () => {
  it('parses version headers, summaries, sections and items', () => {
    const entries = parseFixture();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ version: '1.6.5', date: '2026-11-17', summary: '新增更新日志弹窗。' });
    expect(entries[0].sections).toHaveLength(1);
    expect(entries[0].sections[0].title).toBe('Added');
    expect(entries[0].sections[0].items).toEqual(['**点击版本号**：弹出新版更新内容弹窗；', '构建期注入 `CHANGELOG.md`。']);
    expect(entries[1]).toMatchObject({ version: '1.6.4', date: '2026-11-16' });
    expect(entries[1].sections[0].items).toHaveLength(2);
  });

  it('skips empty sections and the intro block without a version header', () => {
    const entries = parseFixture();
    // 1.6.5 的空 Fixed 分节被丢弃
    expect(entries[0].sections.every((section) => section.items.length > 0)).toBe(true);
    // 文件头部的引言不产生条目，首条版本正确
    expect(entries[0].version).toBe('1.6.5');
  });

  it('parses the real CHANGELOG.md with at least 25 entries and matches the app version', () => {
    const markdown = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8');
    const entries = parseChangelog(markdown);
    expect(entries.length).toBeGreaterThanOrEqual(25);
    expect(entries[0].version).toBe(APP_VERSION);
    for (const entry of entries) {
      expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/u);
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      expect(entry.sections.every((section) => section.items.length > 0)).toBe(true);
    }
  });
});

describe('visibleChangelogEntries', () => {
  const entries = parseFixture();

  it('returns only the newest entry for latest', () => {
    expect(visibleChangelogEntries(entries, 'latest')).toEqual([entries[0]]);
  });

  it('returns everything for all', () => {
    expect(visibleChangelogEntries(entries, 'all')).toEqual(entries);
  });

  it('returns entries from newest down to the selected version inclusive', () => {
    expect(visibleChangelogEntries(entries, '1.6.4')).toEqual([entries[1]]);
  });

  it('shows only the selected single version, not a cumulative range', () => {
    const visible = visibleChangelogEntries(entries, '1.6.4');
    expect(visible).toHaveLength(1);
    expect(visible[0].version).toBe('1.6.4');
    expect(visible.some((entry) => entry.version === '1.6.5')).toBe(false);
  });

  it('falls back to the newest entry when the version does not exist', () => {
    expect(visibleChangelogEntries(entries, '9.9.9')).toEqual([entries[0]]);
  });
});

describe('changelog presentation helpers', () => {
  it('maps known section titles to Chinese labels and keeps unknown ones', () => {
    expect(sectionLabel('Added')).toBe('新功能');
    expect(sectionLabel('Fixed')).toBe('修复');
    expect(sectionLabel('Known Limitations')).toBe('Known Limitations');
  });

  it('parses inline markdown into text, strong and code tokens', () => {
    expect(parseInlineMarkdown('**加粗** 与 `代码` 混排')).toEqual([
      { kind: 'strong', value: '加粗' },
      { kind: 'text', value: ' 与 ' },
      { kind: 'code', value: '代码' },
      { kind: 'text', value: ' 混排' },
    ]);
    expect(parseInlineMarkdown('无标记文本')).toEqual([{ kind: 'text', value: '无标记文本' }]);
  });

  it('exposes the injected changelog matching the current app version', () => {
    expect(CHANGELOG_ENTRIES.length).toBeGreaterThan(0);
    expect(CHANGELOG_ENTRIES[0].version).toBe(APP_VERSION);
  });
});
