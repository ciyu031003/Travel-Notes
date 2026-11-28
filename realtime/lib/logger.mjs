/**
 * 极简结构化日志：一行一条，带 ISO 时间戳与服务前缀，方便 docker logs / journalctl 过滤。
 * 不引第三方依赖，保持 realtime 服务最小安装体积。
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

function formatArg(arg) {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.stack || arg.message;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

export function createLogger({ level = 'info', prefix = 'collab', sink = console } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;

  const emit = (lvl, args) => {
    if ((LEVELS[lvl] ?? 20) < threshold) return;
    const line = `[${new Date().toISOString()}] [${prefix}] [${lvl}] ${args.map(formatArg).join(' ')}`;
    if (lvl === 'error' || lvl === 'warn') sink.error(line);
    else sink.log(line);
  };

  return {
    level,
    debug: (...args) => emit('debug', args),
    info: (...args) => emit('info', args),
    warn: (...args) => emit('warn', args),
    error: (...args) => emit('error', args),
    child: (childPrefix) => createLogger({ level, prefix: `${prefix}:${childPrefix}`, sink }),
  };
}
