import type { ReactNode } from 'react';
import type { ItemState } from '../domain/types';
import type { ItemDisposition, Toast } from './types';

export function ChevronIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`tree-chevron-icon ${className}`}
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="2 4 6 8 10 4" />
    </svg>
  );
}

export function Modal({ title, eyebrow, onClose, headerExtra, className, children }: { title: string; eyebrow: string; onClose: () => void; headerExtra?: ReactNode; className?: string; children: ReactNode }) {
  return <section className={`modal-card glass-panel ${className ?? ''}`} role="dialog" aria-modal="true" aria-labelledby={`dialog-${eyebrow}`}>
    <header>
      <div><span className="eyebrow">{eyebrow}</span><h2 id={`dialog-${eyebrow}`}>{title}</h2></div>
      {headerExtra}
      <button className="modal-close" type="button" onClick={onClose} aria-label="关闭">×</button>
    </header>
    {children}
  </section>;
}

export function StateButton({ state, onClick, locked, lockedTitle, className }: { state: ItemState; onClick: () => void; locked?: boolean; lockedTitle?: string; className?: string }) {
  const enabled = state.skipLoot;
  return (
    <button
      className={`state-toggle skipLoot ${enabled ? 'checked' : ''} ${locked ? 'is-locked' : ''} ${className ?? ''}`}
      aria-pressed={enabled}
      aria-label={`跳过拾取：${enabled ? '已开启' : '未开启'}`}
      onClick={onClick}
      type="button"
      title={locked ? lockedTitle : (enabled ? '已加入跳过拾取名单（掉落时不拾取）' : '未跳过（掉落时正常拾取）')}
    >
      <i />
      <span>{enabled ? '已跳过' : '正常拾取'}</span>
      {locked && <span className="lock-indicator" title="自定义最高优先级">🔒</span>}
    </button>
  );
}

export function DispositionSelector({ disposition, onChange, locked, lockedTitle, className }: { disposition: ItemDisposition; onChange: (disposition: ItemDisposition) => void; locked?: boolean; lockedTitle?: string; className?: string }) {
  const options: Array<[ItemDisposition, string, string]> = [
    ['none', '未处理', '不自动出售，也不加入保护名单'],
    ['autoSell', '自动出售', '加入自动出售名单 (MY_AutoSell.tSellItem)'],
    ['protect', '保护不出售', '加入保护名单，防止被误卖 (MY_AutoSell.tProtectItem)'],
  ];
  return (
    <div className={`segmented disposition-selector ${locked ? 'is-locked' : ''} ${className ?? ''}`} role="group" aria-label="出售策略">
      {options.map(([value, label, desc]) => (
        <button
          className={`disposition-option ${value} ${disposition === value ? 'on' : ''}`}
          type="button"
          key={value}
          aria-pressed={disposition === value}
          title={locked ? lockedTitle : `出售策略：${label}（${desc}）`}
          onClick={() => onChange(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function ToastCard({ toast, onClose }: { toast: NonNullable<Toast>; onClose: () => void }) {
  return (
    <div className="toast-container" key={toast.id ?? toast.message}>
      <div className={`toast-card ${toast.tone}`} role="status" aria-live="polite">
        <div className={`toast-icon-badge ${toast.tone}`}>
          {toast.tone === 'success' ? '✓' : toast.tone === 'warning' ? '⚡' : '✕'}
        </div>
        <div className="toast-content">
          <span className="toast-text">{toast.message}</span>
        </div>
        <button
          type="button"
          className="toast-close-btn"
          aria-label="关闭提示"
          onClick={onClose}
        >
          ✕
        </button>
        <div className={`toast-progress-bar ${toast.tone}`} />
      </div>
    </div>
  );
}
