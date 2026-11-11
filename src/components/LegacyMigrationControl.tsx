import { History, LoaderCircle } from 'lucide-react'
import type { LegacyMigrationStatus } from '../types'

type LegacyMigrationControlProps = {
  status: LegacyMigrationStatus | null
  running: boolean
  onRun(): void
}

export function LegacyMigrationControl({ status, running, onRun }: LegacyMigrationControlProps) {
  const description = status?.needsBrowserStorageRepair
    ? '恢复此前的本地角色、项目与工作区状态。此操作会替换 Oyama 当前基于浏览器存储的工作区数据，完成后需要重启应用。'
    : status?.migrated
      ? '此前 MiniMax Studio 的配置文件已导入。只有当首次导入之后旧应用又新增了文件，才需要再次运行。'
      : status?.available
        ? '把此前 MiniMax Studio 的配置文件导入 Oyama。绝不会替换现有的 Oyama 数据。'
        : '这台电脑上没有找到此前 MiniMax Studio 的配置文件。'

  return <div className="legacy-migration-settings">
    <div>
      <strong>旧版 Studio 数据</strong>
      <small>{description}</small>
      {status?.repairError && <p className="settings-note warning" role="alert">上一次恢复未能完成：{status.repairError}。重试前请先关闭其他 Oyama 窗口。你此前的配置文件仍保持原样。</p>}
    </div>
    <button type="button" className="secondary-button" disabled={!status?.available || running} onClick={onRun}>
      {running ? <LoaderCircle className="spin" size={15} /> : <History size={15} />}
      {running ? '正在导入…' : status?.needsBrowserStorageRepair ? '恢复项目与角色' : status?.migrated ? '再次导入缺失数据' : '导入旧版数据'}
    </button>
  </div>
}
