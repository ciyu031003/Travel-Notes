/** 后台设置页共享的消息提示类型（拆分前是 page.tsx 内的内联类型）。 */
export type SettingsMessageType = 'success' | 'error' | 'info'

export interface SettingsMessage {
  type: SettingsMessageType
  text: string
}

/** 各 Tab 向上抛提示：null 表示清空当前提示（与原实现一致）。 */
export type OnSettingsMessage = (message: SettingsMessage | null) => void

/** Tab 的公共 props：提示走 props 共享，其余状态由各 Tab 自管。 */
export interface SettingsTabProps {
  onMessage: OnSettingsMessage
}
