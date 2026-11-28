/**
 * 甜途 · 旅行计划实时协同服务（P1b）
 *
 *   ws(s)://<host>:1234/collab/plan-<planId>?token=<collab-token>
 *   GET     /health      存活/统计（docker healthcheck 用）
 *   GET     /rooms       调试：房间、在线人数、presence、保存游标
 *
 * 独立进程，不挂在 Next.js 下（App Router 无长连接能力，且 Capacitor 静态壳复用同一协议）。
 * 详细契约/部署/回滚见 docs/realtime-collab.md。
 */
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { loadConfig } from './lib/config.mjs';
import { createLogger } from './lib/logger.mjs';
import { createPersistence, createSnapshotLoader, buildPlanDocPayload } from './lib/persistence.mjs';
import { verifyCollabToken, parsePlanIdFromRoom, roomNameForPlan } from './lib/token.mjs';
import { Room } from './lib/room.mjs';

const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_BAD_MESSAGE = 4400;
const CLOSE_TRY_AGAIN = 1013;

export function createCollabServer(config, { logger = createLogger({ level: config.logLevel, prefix: 'collab' }) } = {}) {
  for (const warning of config.warnings ?? []) logger.warn(warning);

  const persistence = createPersistence({
    appInternalUrl: config.appInternalUrl,
    secret: config.secret,
    logger: logger.child('persist'),
    timeoutMs: config.saveTimeoutMs,
    retryDelaysMs: config.saveRetryDelaysMs,
  });
  const loadSnapshot = createSnapshotLoader({
    appInternalUrl: config.appInternalUrl,
    secret: config.secret,
    logger: logger.child('snapshot'),
    timeoutMs: config.saveTimeoutMs,
  });

  /** @type {Map<string, Room>} */
  const rooms = new Map();
  const startedAt = Date.now();
  let shuttingDown = false;

  const acquireRoom = async (planId) => {
    const name = roomNameForPlan(planId);
    const existing = rooms.get(name);
    if (existing) return existing;

    const room = new Room({
      name,
      planId,
      config,
      persistence: { submitPlanDoc: persistence.submitPlanDoc, buildPlanDocPayload },
      loadSnapshot,
      logger: logger.child(`room-${planId}`),
      onEvict: (target) => {
        rooms.delete(target.name);
        target.close();
        logger.info(`[room] 已卸载 ${target.name}，当前房间数=${rooms.size}`);
      },
    });
    rooms.set(name, room); // 先入表：并发连接共享同一个初始化中的房间
    try {
      await room.init();
    } catch (err) {
      rooms.delete(name);
      room.close();
      throw err;
    }
    return room;
  };

  const resolveRoomAndToken = (url) => {
    // 支持 /collab/plan-42?token=... 与 /collab?room=plan-42&token=...
    const pathname = url.pathname.replace(/\/+$/, '');
    let room = null;
    if (pathname.startsWith('/collab/')) {
      const rest = pathname.slice('/collab/'.length);
      room = decodeURIComponent(rest.split('/')[0] || '');
    } else if (pathname === '/collab' || pathname === '') {
      room = url.searchParams.get('room');
    } else {
      return { kind: 'not-found' };
    }
    const token = url.searchParams.get('token') ?? undefined;
    return { kind: 'collab', room, token };
  };

  const handleUpgrade = (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url ?? '/', 'http://collab.local');
    } catch {
      socket.destroy();
      return;
    }

    const resolved = resolveRoomAndToken(url);
    if (resolved.kind === 'not-found') {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    const auth = verifyCollabToken(resolved.token, config.secret, { clockSkewSeconds: config.clockSkewSeconds });
    const failAuth = (reason) => {
      logger.warn(`[auth] 拒绝连接 reason=${reason} room=${resolved.room ?? '-'} ip=${req.socket.remoteAddress ?? '-'}`);
      // 先完成握手再 close(4401)：y-websocket 客户端据此把 4400-4499 视为「重连也没用」并停止重试
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.close(CLOSE_UNAUTHORIZED, `unauthorized: ${reason}`);
      });
    };

    if (shuttingDown) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    if (!auth.ok) {
      failAuth(auth.reason);
      return;
    }
    if (resolved.room && parsePlanIdFromRoom(resolved.room) !== auth.planId) {
      failAuth('room_plan_mismatch');
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      void handleConnection(ws, req, auth);
    });
  };

  const handleConnection = async (ws, req, auth) => {
    let room = null;
    const queued = [];
    let closed = false;

    ws.on('message', (data) => {
      if (closed) return;
      if (!room) {
        queued.push(data);
        return;
      }
      try {
        room.handleMessage(ws, data);
      } catch (err) {
        logger.warn(`[ws] plan=${auth.planId} 收到非法消息，关闭连接: ${err?.message || err}`);
        try {
          ws.close(CLOSE_BAD_MESSAGE, 'bad message');
        } catch {
          /* noop */
        }
      }
    });
    ws.on('error', (err) => {
      logger.warn(`[ws] plan=${auth.planId} user=${auth.userId} socket error: ${err?.message || err}`);
      try {
        ws.terminate();
      } catch {
        /* noop */
      }
    });

    ws.userId = auth.userId;
    ws.planId = auth.planId;
    ws.clientIp = req.socket.remoteAddress;

    const pingTimer = setInterval(() => {
      if (ws.readyState === 1) {
        try {
          ws.ping();
        } catch {
          /* noop */
        }
      }
    }, config.pingIntervalMs);
    pingTimer.unref?.();

    ws.on('close', (code, reasonBuf) => {
      closed = true;
      clearInterval(pingTimer);
      if (room) room.detach(ws, { code, reason: reasonBuf?.toString?.() ?? '' });
    });

    try {
      room = await acquireRoom(auth.planId);
    } catch (err) {
      logger.error(`[ws] plan=${auth.planId} 房间初始化失败: ${err?.message || err}`);
      try {
        ws.close(CLOSE_TRY_AGAIN, 'room init failed');
      } catch {
        /* noop */
      }
      return;
    }

    if (closed || ws.readyState !== 1) {
      // 初始化期间客户端已断开
      return;
    }

    room.attach(ws);
    for (const data of queued) {
      try {
        room.handleMessage(ws, data);
      } catch (err) {
        logger.warn(`[ws] plan=${auth.planId} 积压消息处理失败: ${err?.message || err}`);
        try {
          ws.close(CLOSE_BAD_MESSAGE, 'bad message');
        } catch {
          /* noop */
        }
        break;
      }
    }
  };

  const httpServer = http.createServer((req, res) => {
    const sendJson = (status, body) => {
      const text = JSON.stringify(body);
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(text);
    };

    let url;
    try {
      url = new URL(req.url ?? '/', 'http://collab.local');
    } catch {
      sendJson(400, { ok: false, error: 'bad_url' });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      const clients = [...rooms.values()].reduce((sum, room) => sum + room.clientCount, 0);
      sendJson(200, {
        ok: true,
        service: config.serviceName,
        version: process.env.npm_package_version ?? '1.0.0',
        instanceId: config.instanceId,
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        rooms: rooms.size,
        clients,
        appInternalUrl: config.appInternalUrl,
        saveDebounceMs: config.saveDebounceMs,
        secretConfigured: Boolean(config.secret),
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/rooms') {
      const roomFilter = url.searchParams.get('room');
      const list = [...rooms.values()]
        .filter((room) => !roomFilter || room.name === roomFilter)
        .map((room) => room.info());
      sendJson(200, {
        ok: true,
        total: list.length,
        rooms: list,
      });
      return;
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/collab')) {
      sendJson(200, {
        ok: true,
        service: config.serviceName,
        message: 'Yjs collab endpoint: ws://<host>/collab/plan-<planId>?token=<collab-token>',
      });
      return;
    }

    sendJson(404, { ok: false, error: 'not_found' });
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: config.maxPayloadBytes, perMessageDeflate: false });
  httpServer.on('upgrade', handleUpgrade);
  // 兜底：不要让单个 socket/协议错误把进程带走
  wss.on('error', (err) => logger.error('[wss] 服务端错误:', err));
  httpServer.on('error', (err) => logger.error('[http] 服务端错误:', err));

  const shutdown = async (reason) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`[shutdown] 收到 ${reason}，开始刷盘 ${rooms.size} 个房间...`);
    httpServer.close();
    for (const ws of wss.clients) {
      try {
        ws.close(1001, 'server shutting down');
      } catch {
        /* noop */
      }
    }
    const flushed = Promise.allSettled([...rooms.values()].map((room) => room.shutdown()));
    // 最多等 8s：避免 app 不可达时 SIGTERM 卡住容器（未 flush 的内容由客户端本地快照兜底）
    await Promise.race([flushed, new Promise((resolve) => setTimeout(resolve, 8000))]);
    logger.info('[shutdown] 完成');
  };

  return {
    httpServer,
    wss,
    rooms,
    shutdown,
    listen: () =>
      new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(config.port, config.host, () => {
          httpServer.off('error', reject);
          logger.info(
            `[boot] listening ws://${config.host}:${config.port}/collab  appInternalUrl=${config.appInternalUrl} saveDebounceMs=${config.saveDebounceMs}`,
          );
          resolve();
        });
      }),
  };
}

const isEntrypoint = (() => {
  try {
    return process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
  } catch {
    return false;
  }
})();

if (isEntrypoint) {
  const logger = createLogger({ level: process.env.COLLAB_LOG_LEVEL || 'info', prefix: 'collab' });
  let config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    logger.error(err.message);
    process.exit(1);
  }
  const app = createCollabServer(config, { logger });
  const stop = (signal) => {
    void app.shutdown(signal).finally(() => {
      setTimeout(() => process.exit(0), 50);
    });
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('unhandledRejection', (err) => {
    logger.error('[crash] unhandledRejection', err);
  });
  process.on('uncaughtException', (err) => {
    logger.error('[crash] uncaughtException', err);
    stop('uncaughtException');
  });

  app.listen().catch((err) => {
    logger.error(`[boot] 监听 ${config.host}:${config.port} 失败: ${err?.message || err}`);
    process.exit(1);
  });
}
