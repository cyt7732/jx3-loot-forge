import { useEffect, useMemo, useRef, useState } from 'react';
import { APP_VERSION } from '../domain/constants';
import {
  CHANGELOG_ENTRIES,
  parseInlineMarkdown,
  sectionLabel,
  visibleChangelogEntries,
  type ChangelogEntry,
  type ChangelogSelection,
} from '../changelog';
import { Modal } from './primitives';

function InlineText({ text }: { text: string }) {
  const tokens = useMemo(() => parseInlineMarkdown(text), [text]);
  return (
    <>
      {tokens.map((token, index) => {
        if (token.kind === 'strong') return <strong key={index}>{token.value}</strong>;
        if (token.kind === 'code') return <code key={index}>{token.value}</code>;
        return <span key={index}>{token.value}</span>;
      })}
    </>
  );
}

function scopeButtonLabel(selection: ChangelogSelection): string {
  if (selection === 'latest') return '最新版本';
  if (selection === 'all') return '全部版本';
  return `v${selection}`;
}

function ChangelogEntryBlock({ entry, isCurrent }: { entry: ChangelogEntry; isCurrent: boolean }) {
  return (
    <article className="cl-entry">
      <header className="cl-entry-head">
        <span className="cl-version">v{entry.version}</span>
        <span className="cl-date">{entry.date}</span>
        {isCurrent && <span className="cl-current-badge">当前版本</span>}
      </header>
      {entry.summary && <p className="cl-summary"><InlineText text={entry.summary} /></p>}
      {entry.sections.map((section) => (
        <section className="cl-section" key={section.title}>
          <h3 className="cl-section-title">
            {sectionLabel(section.title)}
            <span className="cl-count">{section.items.length}</span>
          </h3>
          <ul className="cl-items">
            {section.items.map((item, index) => (
              <li key={index}><InlineText text={item} /></li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}

export function ChangelogDialog({ onClose }: { onClose: () => void }) {
  const entries = CHANGELOG_ENTRIES;
  const [selection, setSelection] = useState<ChangelogSelection>('latest');
  const [menuOpen, setMenuOpen] = useState(false);
  const scopeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (scopeRef.current && !scopeRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const visibleEntries = useMemo(() => visibleChangelogEntries(entries, selection), [entries, selection]);

  const choose = (next: ChangelogSelection) => {
    setSelection(next);
    setMenuOpen(false);
  };

  return (
    <Modal
      title={`v${APP_VERSION} 更新内容`}
      eyebrow="更新日志"
      onClose={onClose}
      className="changelog-card"
      headerExtra={(
        <div className="cl-scope" ref={scopeRef}>
          <button
            type="button"
            className="cl-scope-btn"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            title="选择显示的更新日志范围"
          >
            {scopeButtonLabel(selection)} <span aria-hidden="true">▾</span>
          </button>
          {menuOpen && (
            <div className="cl-scope-popover" role="listbox" aria-label="显示的更新日志范围">
              <button type="button" role="option" aria-selected={selection === 'latest'} className={`cl-scope-item ${selection === 'latest' ? 'active' : ''}`} onClick={() => choose('latest')}>
                {selection === 'latest' && <span className="cl-scope-check">✓</span>} 最新版本
              </button>
              <button type="button" role="option" aria-selected={selection === 'all'} className={`cl-scope-item ${selection === 'all' ? 'active' : ''}`} onClick={() => choose('all')}>
                {selection === 'all' && <span className="cl-scope-check">✓</span>} 全部版本
              </button>
              <div className="cl-scope-divider" />
              {entries.map((entry) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={selection === entry.version}
                  className={`cl-scope-item ${selection === entry.version ? 'active' : ''}`}
                  key={entry.version}
                  onClick={() => choose(entry.version)}
                >
                  {(selection === entry.version) && <span className="cl-scope-check">✓</span>}
                  v{entry.version} <span className="cl-scope-date">· {entry.date}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    >
      {entries.length === 0 ? (
        <p className="modal-copy">暂无更新日志数据。</p>
      ) : (
        <div className="cl-list">
          {visibleEntries.map((entry, index) => (
            <ChangelogEntryBlock entry={entry} isCurrent={index === 0} key={entry.version} />
          ))}
        </div>
      )}
      <div className="modal-actions">
        <button className="button primary" type="button" onClick={onClose}>关闭</button>
      </div>
    </Modal>
  );
}
