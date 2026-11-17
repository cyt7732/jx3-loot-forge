/**
 * 把仓库根目录的 Keep a Changelog 风格 Markdown 解析为结构化条目，
 * 供构建期注入前端（vite define），运行时零解析成本。
 *
 * 支持的形态（与 CHANGELOG.md 实际格式一致）：
 *   ## [1.6.4] - 2026-11-17      ← 版本标题（版本号与日期）
 *   综述段落…                    ← 紧随标题的正文段落 = summary
 *   ### Fixed                    ← 分节标题（英文原样保留，前端做中文映射）
 *   - **条目**：描述；            ← 分节内的列表条目
 *
 * 空分节（如 `### Fixed` 下没有条目）会被跳过；文件开头的引言块（无版本标题）不产生条目。
 */

/**
 * @param {string} markdown
 * @returns {Array<{ version: string, date: string, summary: string, sections: Array<{ title: string, items: string[] }> }>}
 */
export function parseChangelog(markdown) {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
  const entries = [];
  let current = null;
  let currentSection = null;
  let pendingSummary = [];

  const flushSummary = () => {
    if (!current) return;
    const text = pendingSummary.join('\n').trim();
    if (text && !current.summary) current.summary = text;
    pendingSummary = [];
  };

  const flushSection = () => {
    flushSummary();
    if (current && currentSection) {
      if (currentSection.items.length > 0) current.sections.push(currentSection);
      currentSection = null;
    }
  };

  const versionHeader = /^##\s+\[([^\]]+)\]\s+-\s+(\S+)/u;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    const headerMatch = versionHeader.exec(line);
    if (headerMatch) {
      flushSection();
      current = { version: headerMatch[1].trim(), date: headerMatch[2].trim(), summary: '', sections: [] };
      entries.push(current);
      continue;
    }

    if (!current) continue; // 文件头部的「# 更新日志」与说明行

    const sectionMatch = /^###\s+(.+)$/u.exec(line);
    if (sectionMatch) {
      flushSection();
      currentSection = { title: sectionMatch[1].trim(), items: [] };
      continue;
    }

    const itemMatch = /^[-*]\s+(.+)$/u.exec(line);
    if (itemMatch && currentSection) {
      flushSummary();
      currentSection.items.push(itemMatch[1].trim());
      continue;
    }

    if (line.trim() === '') {
      flushSummary();
      continue;
    }

    if (!currentSection) pendingSummary.push(line.trim());
  }
  flushSection();

  return entries;
}
