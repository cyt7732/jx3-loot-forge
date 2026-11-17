import { STATE_LABELS } from './display';
import { Modal } from './primitives';
import { stateSummary } from './display';
import type { ImportDraft } from './types';
import type { ImportMode } from '../domain/types';

export function EmptyExportWarningDialog({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title="未选择导出范围" eyebrow="导出确认" onClose={onClose}>
      <p className="modal-copy">当前未在左侧勾选任何副本、Boss 或自定义条目。</p>
      <div className="empty-warning-box" role="alert">
        <div className="warning-icon">⚠️</div>
        <div className="warning-text">
          <strong>将导出空规则配置文件</strong>
          <p>若继续操作，生成的文件将不包含任何策略规则。导入游戏后不会产生任何自动拾取过滤或自动出售效果。</p>
        </div>
      </div>
      <p className="storage-note">💡 如需导出对应策略，请先在左侧目录中勾选需要导出的副本，或点击【全选老本】一键圈选。</p>
      <div className="modal-actions">
        <button className="button primary" type="button" autoFocus onClick={onClose}>返回勾选范围</button>
        <button
          className="button ghost danger-text"
          type="button"
          onClick={onConfirm}
        >
          仍要导出空白文件
        </button>
      </div>
    </Modal>
  );
}

export function CustomItemsDialog({
  onClose,
  customInput,
  onCustomInputChange,
  onAdd,
}: {
  onClose: () => void;
  customInput: string;
  onCustomInputChange: (value: string) => void;
  onAdd: () => void;
}) {
  return (
    <Modal title="添加自定义物品" eyebrow="自定义物品库" onClose={onClose}>
      <p className="modal-copy">输入您想自定义管理的物品名称（每行一个）。添加后可在左侧【✨ 用户自定义】范围中单独配置其拾取与出售策略。</p>
      <textarea className="custom-textarea" value={customInput} onChange={(event) => onCustomInputChange(event.target.value)} rows={9} placeholder={'例如：\n水长生 ·雪银莲\n特殊装备\n金缕衣'} autoFocus />
      <div className="modal-actions"><button className="button ghost" type="button" onClick={onClose}>取消</button><button className="button primary" type="button" onClick={onAdd}>添加到物品库</button></div>
    </Modal>
  );
}

export function WorkspaceDialog({
  onClose,
  onExportBackup,
  onImportBackup,
  onCheckUpdate,
  onImportDataPack,
  showRestoreEmbedded,
  onRestoreEmbedded,
  onReset,
}: {
  onClose: () => void;
  onExportBackup: () => void;
  onImportBackup: () => void;
  onCheckUpdate: () => void;
  onImportDataPack: () => void;
  showRestoreEmbedded: boolean;
  onRestoreEmbedded: () => void;
  onReset: () => void;
}) {
  return (
    <Modal title="本地设置与数据" eyebrow="设置与数据管理" onClose={onClose}>
      <div className="workspace-actions-list">
        <button type="button" onClick={onExportBackup}>
          <strong>导出全部设置备份</strong>
          <small>将当前的拾取/出售策略、自定义物品及副本收藏保存为本地备份文件 (.json)</small>
        </button>
        <button type="button" onClick={onImportBackup}>
          <strong>导入设置备份</strong>
          <small>换电脑、换浏览器或移动文件后，一键还原之前的全部设置与自定义库</small>
        </button>
        <button type="button" onClick={onCheckUpdate}>
          <strong>检查副本掉落库更新</strong>
          <small>连接网络检查是否有最新版本的官方副本掉落数据</small>
        </button>
        <button type="button" onClick={onImportDataPack}>
          <strong>导入离线数据包</strong>
          <small>手动载入官方最新的副本掉落数据库文件（适合无网络环境）</small>
        </button>
        {showRestoreEmbedded && (
          <button type="button" onClick={onRestoreEmbedded}>
            <strong>恢复初始副本数据</strong>
            <small>保留当前个性化设置，仅将副本掉落库还原为本程序自带的默认版本</small>
          </button>
        )}
        <button className="danger-row" type="button" onClick={onReset}>
          <strong>清空并恢复默认设置</strong>
          <small>清除所有个性化配置与自选记录，恢复系统推荐的默认珍品保护规则</small>
        </button>
      </div>

      <p className="storage-note">💡 提示：您的所有设置都会实时自动保存在当前浏览器中，关闭页面不会丢失。建议在配置满意后导出备份文件，方便随时在其他设备一键恢复。</p>
    </Modal>
  );
}

export function ImportConfigDialog({
  draft,
  onClose,
  onChangeMode,
  onApply,
}: {
  draft: ImportDraft;
  onClose: () => void;
  onChangeMode: (mode: ImportMode) => void;
  onApply: () => void;
}) {
  return (
    <Modal title="导入游戏配置文件" eyebrow="配置导入" onClose={onClose}>
      <p className="modal-copy"><strong>{draft.filename}</strong> · 已识别策略：{draft.preview.declared.map((field) => STATE_LABELS[field]).join('、')}</p>
      <div className="mode-switch">
        <button className={draft.mode === 'merge' ? 'active' : ''} type="button" onClick={() => onChangeMode('merge')}>
          <strong>合并模式 (推荐)</strong>
          <small>保留现有设置，仅叠加导入文件中的新规则</small>
        </button>
        <button className={draft.mode === 'replace' ? 'active' : ''} type="button" onClick={() => onChangeMode('replace')}>
          <strong>覆盖模式</strong>
          <small>清空现有的拾取/出售规则，完全以该文件为准</small>
        </button>
      </div>
      <div className="preview-stats">
        <span><strong>{draft.preview.changes.length}</strong> 项规则变更</span>
        <span><strong>{draft.preview.unknownNames.length}</strong> 项加入自定义库</span>
        <span><strong>{draft.preview.conflictsResolved}</strong> 项自动处理保护冲突</span>
      </div>
      <div className="diff-list">{draft.preview.changes.slice(0, 100).map((change) => <div key={change.id}><strong>{change.name}</strong><span>{stateSummary(change.before)} → {stateSummary(change.after)}</span></div>)}</div>
      <div className="modal-actions"><button className="button ghost" type="button" onClick={onClose}>取消</button><button className="button primary" type="button" onClick={onApply}>确认应用到工坊</button></div>
    </Modal>
  );
}
