/**
 * v3.1 M4-D3：结构化日志（JSON 行，便于日志采集/告警）。
 * 用法：log('info', 'moderation', 'handleReport', { reportId, action })
 * 输出：{"ts":"...","level":"info","module":"...","event":"...","...fields"}
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export function log(level: LogLevel, module: string, event: string, fields?: Record<string, unknown>): void {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    module,
    event,
    ...(fields || {}),
  }
  const line = JSON.stringify(entry)
  // 结构化日志走 stdout（Docker 收集）；error 同时保留 stack 语义
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (module: string, event: string, fields?: Record<string, unknown>) => log('debug', module, event, fields),
  info: (module: string, event: string, fields?: Record<string, unknown>) => log('info', module, event, fields),
  warn: (module: string, event: string, fields?: Record<string, unknown>) => log('warn', module, event, fields),
  error: (module: string, event: string, fields?: Record<string, unknown>) => log('error', module, event, fields),
}
