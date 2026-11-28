/**
 * 单个计划房间：Y.Doc + awareness 转发 + 800ms 防抖持久化 + 断连 flush。
 *
 * 协议与 y-websocket v3 客户端一致（消息类型：0 sync、1 awareness、2 auth、3 queryAwareness）。
 * 服务端不参与编辑：文档权威副本来自 app 的 SpacePlanDoc 快照（GET 内部端点），
 * 之后所有变更由 CRDT 合并，再按防抖回传（POST 内部端点）。
 *
 * 设计要点：
 *  - 文档更新（doc 'update'）直接广播给其它连接，并触发防抖保存；
 *  - awareness（光标/正在编辑哪一块）只做内存转发，落库仅在连接/断开时（契约 §4）；
 *  - 最后一个客户端断开时立刻 flush 一次（source=disconnect），然后把房间留在内存里等 TTL 回收；
 *  - 保存失败按 COLLAB_SAVE_RETRY_DELAYS_MS 重试，重试耗尽后仍标记 dirty 并稍后再试（数据不丢在内存里）。
 */
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import { materializeDoc, summarizeDoc } from './materialize.mjs';

export const MESSAGE_SYNC = 0;
export const MESSAGE_AWARENESS = 1;
export const MESSAGE_AUTH = 2;
export const MESSAGE_QUERY_AWARENESS = 3;

const WS_OPEN = 1;

/** 从 awareness update 字节里读出涉及的 clientID（用于断连时清理 presence）。 */
export function readAwarenessClientIds(update) {
  const decoder = decoding.createDecoder(update);
  const count = decoding.readVarUint(decoder);
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    ids.push(decoding.readVarUint(decoder)); // clientID
    decoding.readVarUint(decoder); // clock
    decoding.readVarString(decoder); // JSON state（null 表示离开）
  }
  return ids;
}

const encodeSyncUpdate = (update) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeUpdate(encoder, update);
  return encoding.toUint8Array(encoder);
};

const encodeAwarenessMessage = (update) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(encoder, update);
  return encoding.toUint8Array(encoder);
};

const normalizeIntOrNull = (value) => {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

export class Room {
  /**
   * @param {{
   *   name: string,
   *   planId: number,
   *   config: object,
   *   persistence: { submitPlanDoc: Function, buildPlanDocPayload: Function },
   *   loadSnapshot: (planId: number) => Promise<{ state: Uint8Array|null, source: string, revision?: number, lastEventId?: number }>,
   *   logger: object,
   *   onEvict?: (room: Room) => void,
   * }} opts
   */
  constructor({ name, planId, config, persistence, loadSnapshot, logger, onEvict }) {
    this.name = name;
    this.planId = planId;
    this.config = config;
    this.persistence = persistence;
    this.loadSnapshot = loadSnapshot;
    this.logger = logger;
    this.onEvict = onEvict;

    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.awareness.setLocalState(null); // 服务端本身不显示为在线用户

    /** @type {Set<any>} ws 连接 */
    this.conns = new Set();
    this.readyState = 'loading';
    this.pending = [];
    this.dirty = false;
    this.permanentFailure = false;
    this.everHadClients = false;
    this.saveCount = 0;
    this.saveAttempts = 0;
    this.lastSavedAt = 0;
    this.lastSaveError = null;
    this.revision = 0;
    this.lastEventId = 0;
    this.snapshotSource = 'none';
    this.createdAt = Date.now();
    this.lastActivityAt = Date.now();
    this.closed = false;
    this.shuttingDown = false;
    this.inflight = null;
    this.queuedFlush = null;
    this.pendingReason = null;
    this._saveTimer = null;
    this._idleTimer = null;

    this.doc.on('update', this._onDocUpdate);
    this.awareness.on('update', this._onAwarenessUpdate);
  }

  async init() {
    let loaded = null;
    try {
      loaded = await this.loadSnapshot(this.planId);
    } catch (err) {
      this.snapshotSource = 'load-failed';
      this.logger.warn(
        `[room ${this.name}] 读取 DB 快照失败，降级为空文档（客户端本地 y-indexeddb 仍可收敛）: ${err?.message || err}`,
      );
    }
    if (loaded?.state && loaded.state.length > 0) {
      Y.applyUpdate(this.doc, loaded.state, 'initial-load');
      this.snapshotSource = loaded.source ?? 'app';
      this.revision = Number(loaded.revision) || 0;
      this.lastEventId = Number(loaded.lastEventId) || 0;
      this.logger.info(
        `[room ${this.name}] 快照已载入 bytes=${loaded.state.length} revision=${this.revision} lastEventId=${this.lastEventId}`,
      );
    } else if (this.snapshotSource !== 'load-failed') {
      this.snapshotSource = 'empty';
      this.logger.info(`[room ${this.name}] 无 DB 快照（新计划或未同步过），从空文档开始`);
    }

    this.readyState = 'ready';
    const pending = this.pending;
    this.pending = [];
    for (const task of pending) {
      try {
        task();
      } catch (err) {
        this.logger.warn(`[room ${this.name}] 处理连接积压消息失败: ${err?.message || err}`);
      }
    }
    return this;
  }

  get clientCount() {
    return this.conns.size;
  }

  /** 服务端视角的在线状态（用于 /rooms 调试端点与回传 presence）。 */
  presenceSnapshot() {
    const byUser = new Map();
    for (const [clientId, state] of this.awareness.getStates()) {
      if (!state || typeof state !== 'object' || !state.user) continue;
      const userId = normalizeIntOrNull(state.user.id);
      if (userId == null || userId <= 0) continue;
      byUser.set(userId, {
        userId,
        username: typeof state.user.username === 'string' ? state.user.username : '',
        nickname: typeof state.user.nickname === 'string' ? state.user.nickname : null,
        editingItemId: normalizeIntOrNull(state.editingItemId),
        cursor: normalizeIntOrNull(state.cursor),
        clientId: String(clientId),
      });
    }
    return [...byUser.values()];
  }

  info() {
    return {
      room: this.name,
      planId: this.planId,
      clients: this.conns.size,
      readyState: this.readyState,
      snapshotSource: this.snapshotSource,
      presence: this.presenceSnapshot(),
      dirty: this.dirty,
      inflight: Boolean(this.inflight),
      pendingSave: Boolean(this._saveTimer),
      pendingReason: this.pendingReason,
      permanentFailure: this.permanentFailure,
      saveCount: this.saveCount,
      saveAttempts: this.saveAttempts,
      lastSavedAt: this.lastSavedAt ? new Date(this.lastSavedAt).toISOString() : null,
      lastSaveError: this.lastSaveError,
      revision: this.revision,
      lastEventId: this.lastEventId,
      doc: summarizeDoc(this.doc),
      createdAt: new Date(this.createdAt).toISOString(),
    };
  }

  // ---------------------------------------------------------------- 连接生命周期

  attach(conn) {
    if (this.closed) {
      try {
        conn.close(1012, 'room closed');
      } catch {
        /* noop */
      }
      return;
    }
    this.conns.add(conn);
    this.everHadClients = true;
    this.lastActivityAt = Date.now();
    conn.controlledIds = new Set();
    this._clearIdleTimer();
    // 新成员本身不立刻写库：客户端随后会 setLocalState（awareness added）或开始编辑，
    // 那时才产生持久化需求，避免「只是打开看了一眼」也 POST 一次。
    const run = () => this._onAttached(conn);
    if (this.readyState === 'ready') run();
    else this.pending.push(run);

    this.logger.info(`[room ${this.name}] attach user=${conn.userId ?? '?'} clients=${this.conns.size}`);
  }

  _onAttached(conn) {
    if (this.closed) return;
    this.logger.debug(`[ws] attach send step1 ready=${this.readyState} conns=${this.conns.size}`);
    // 把服务端已知状态推给客户端：sync step1 + 当前 presence 快照
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    this._send(conn, encoding.toUint8Array(encoder));

    const states = this.awareness.getStates();
    if (states.size > 0) {
      const ids = [...states.keys()];
      this._send(conn, encodeAwarenessMessage(awarenessProtocol.encodeAwarenessUpdate(this.awareness, ids)));
    }
  }

  detach(conn, { code = 1000, reason = '' } = {}) {
    if (!this.conns.delete(conn)) return;
    const controlled = conn.controlledIds ? [...conn.controlledIds] : [];
    if (conn.controlledIds) conn.controlledIds.clear();
    if (controlled.length > 0) {
      awarenessProtocol.removeAwarenessStates(this.awareness, controlled, null);
    }
    this.lastActivityAt = Date.now();
    this.logger.info(
      `[room ${this.name}] detach user=${conn.userId ?? '?'} code=${code}${reason ? ` reason=${reason}` : ''} clients=${this.conns.size}`,
    );

    if (this.closed || this.shuttingDown) return;

    if (this.conns.size === 0) {
      this._clearSaveTimer();
      if (this.dirty) {
        // 契约 §4：断连时立刻回传一次（source=disconnect）
        this.pendingReason = 'disconnect';
        this._flushSafely('disconnect');
      }
      this._armIdleTimer();
    } else if (this.dirty) {
      this._scheduleSave('presence', this.config.presenceSaveDebounceMs);
    }
  }

  // ---------------------------------------------------------------- 协议消息

  handleMessage(conn, data) {
    if (this.closed) return;
    if (this.readyState !== 'ready') {
      this.pending.push(() => this.handleMessage(conn, data));
      return;
    }
    const decoder = decoding.createDecoder(new Uint8Array(data));
    const encoder = encoding.createEncoder();
    const messageType = decoding.readVarUint(decoder);

    this.logger.debug(
      `[ws] recv room=${this.name} user=${conn.userId ?? '?'} type=${messageType} bytes=${data.byteLength ?? data.length ?? '?'}`,
    );

    switch (messageType) {
      case MESSAGE_SYNC: {
        // 回复帧必须以 messageSync 开头（与 y-websocket 服务端实现一致），
        // 否则客户端会把 syncStep2 误读成 awareness 消息。
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        const syncType = syncProtocol.readSyncMessage(decoder, encoder, this.doc, conn);
        const hasReply = encoding.length(encoder) > 1;
        this.logger.debug(`[ws] sync sub=${syncType} reply=${hasReply} encoderLen=${encoding.length(encoder)}`);
        if (hasReply) {
          this._send(conn, encoding.toUint8Array(encoder));
        }
        break;
      }
      case MESSAGE_AWARENESS: {
        const update = decoding.readVarUint8Array(decoder);
        if (conn.controlledIds) {
          for (const clientId of readAwarenessClientIds(update)) conn.controlledIds.add(clientId);
        }
        awarenessProtocol.applyAwarenessUpdate(this.awareness, update, conn);
        break;
      }
      case MESSAGE_QUERY_AWARENESS: {
        const ids = [...this.awareness.getStates().keys()];
        if (ids.length > 0) {
          this._send(conn, encodeAwarenessMessage(awarenessProtocol.encodeAwarenessUpdate(this.awareness, ids)));
        }
        break;
      }
      case MESSAGE_AUTH:
        // 鉴权在 HTTP upgrade 阶段完成，这里忽略客户端的 auth 消息
        break;
      default:
        throw new Error(`未知的 WebSocket 消息类型: ${messageType}`);
    }
  }

  _onDocUpdate = (update, origin) => {
    if (origin === 'initial-load') return; // 从 DB 载入不是用户编辑
    this.dirty = true;
    this.lastActivityAt = Date.now();
    this._scheduleSave('debounce', this.config.saveDebounceMs);
    if (origin && origin !== 'initial-load') {
      // 来自某个连接的编辑：广播给其它连接（origin 自己已收到 sync 回复）
      const message = encodeSyncUpdate(update);
      for (const conn of this.conns) {
        if (conn === origin) continue;
        this._send(conn, message);
      }
    }
  };

  _onAwarenessUpdate = ({ added, updated, removed }, origin) => {
    const changed = added.concat(updated, removed);
    if (changed.length === 0) return;
    this.lastActivityAt = Date.now();
    const message = encodeAwarenessMessage(awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed));
    for (const conn of this.conns) {
      if (conn === origin) continue;
      this._send(conn, message);
    }
    // 只有成员进出（added/removed）才需要落库 presence；
    // 纯光标移动 / editingItemId 变化只在内存转发，避免每 1.2s 一次 MySQL upsert。
    if (added.length > 0 || removed.length > 0) {
      this.dirty = true;
      this._scheduleSave('presence', this.config.presenceSaveDebounceMs);
    }
  };

  _send(conn, payload) {
    try {
      if (conn.readyState === WS_OPEN) conn.send(payload);
    } catch (err) {
      this.logger.warn(`[room ${this.name}] 发送失败: ${err?.message || err}`);
    }
  }

  // ---------------------------------------------------------------- 持久化

  _scheduleSave(reason, delayMs = this.config.saveDebounceMs) {
    if (this.closed || this.shuttingDown) return;
    if (reason === 'disconnect') this.pendingReason = 'disconnect';
    else if (this.pendingReason !== 'disconnect') this.pendingReason = reason;

    if (this._saveTimer) {
      if (delayMs >= this._saveTimer.delayMs) return; // 已有更早的排期
      clearTimeout(this._saveTimer.id);
      this._saveTimer = null;
    }
    const timer = { delayMs };
    timer.id = setTimeout(() => {
      this._saveTimer = null;
      const pendingReason = this.pendingReason ?? 'debounce';
      this.pendingReason = null;
      this._flushSafely(pendingReason);
    }, Math.max(0, delayMs));
    timer.id.unref?.();
    this._saveTimer = timer;
  }

  _clearSaveTimer() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer.id);
      this._saveTimer = null;
    }
  }

  _clearIdleTimer() {
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
  }

  _armIdleTimer() {
    this._clearIdleTimer();
    if (this.closed || this.conns.size > 0) return;
    this._idleTimer = setTimeout(async () => {
      this._idleTimer = null;
      if (this.closed || this.conns.size > 0) return;
      this.logger.info(`[room ${this.name}] 空闲超过 ${this.config.roomIdleTtlMs}ms，卸载房间`);
      try {
        if (this.dirty) await this.flush('disconnect');
      } catch (err) {
        this.logger.warn(`[room ${this.name}] 卸载前保存失败: ${err?.message || err}`);
      } finally {
        this.onEvict?.(this);
      }
    }, this.config.roomIdleTtlMs);
    this._idleTimer.unref?.();
  }

  /** 不关心结果的 flush（定时器/断连触发），保证不会产生 unhandledRejection。 */
  _flushSafely(reason) {
    this.flush(reason).catch((err) => {
      this.logger.error(`[save] plan=${this.planId} flush 异常 source=${reason}: ${err?.message || err}`);
    });
  }

  /**
   * 立即保存一次（同一时刻只有一个 inflight）。
   * @returns {Promise<{ ok: boolean, attempts?: number, error?: string, skipped?: boolean }>}
   */
  async flush(reason = 'debounce') {
    if (this.closed) return { ok: false, skipped: true, error: 'room_closed' };
    if (this.inflight) {
      this.queuedFlush = this.queuedFlush ?? { reason };
      return this.inflight;
    }
    this._clearSaveTimer();
    const run = this._saveOnce(reason);
    this.inflight = run;
    try {
      return await run;
    } finally {
      this.inflight = null;
      const queued = this.queuedFlush;
      this.queuedFlush = null;
      if (queued && this.dirty) {
        this._flushSafely(queued.reason);
      } else if (this.dirty && !this.closed && !this.permanentFailure) {
        // 永久性失败（如 4xx：计划不存在）不自动空转重试，等下一次编辑/连接再触发
        const empty = this.conns.size === 0;
        this._scheduleSave(empty ? 'disconnect' : 'debounce', empty ? this.config.saveRetryLaterMs : this.config.saveDebounceMs);
      }
    }
  }

  async _saveOnce(reason) {
    const startedAt = Date.now();
    const state = Y.encodeStateAsUpdate(this.doc);
    const materialized = materializeDoc(this.doc);
    const presence = this.presenceSnapshot();
    const payload = this.persistence.buildPlanDocPayload({
      planId: this.planId,
      yjsStateBase64: Buffer.from(state).toString('base64'),
      materialized,
      presence,
      source: reason === 'disconnect' ? 'disconnect' : 'debounce',
      clientId: this.config.instanceId,
      sentAt: new Date().toISOString(),
    });

    this.dirty = false;
    this.permanentFailure = false;
    this.saveAttempts += 1;
    const result = await this.persistence.submitPlanDoc(payload);

    if (result.ok) {
      this.saveCount += 1;
      this.lastSavedAt = Date.now();
      this.lastSaveError = null;
      const revision = Number(result.body?.revision);
      if (Number.isFinite(revision)) this.revision = revision;
      const lastEventId = Number(result.body?.lastEventId ?? result.body?.eventId);
      if (Number.isFinite(lastEventId)) this.lastEventId = lastEventId;
      this.logger.info(
        `[save] plan=${this.planId} source=${payload.source} ok attempts=${result.attempts} bytes=${state.length} days=${materialized.days.length} items=${materialized.items.length} presence=${presence.length} revision=${this.revision} lastEventId=${this.lastEventId} took=${Date.now() - startedAt}ms`,
      );
    } else {
      this.dirty = true;
      this.lastSaveError = result.error || 'unknown';
      // 4xx 属于配置/数据问题，重试无意义：标记永久失败，避免房间空转刷日志
      this.permanentFailure = Boolean(result.status && result.status < 500 && ![408, 425, 429].includes(result.status));
      this.logger.error(
        `[save] plan=${this.planId} source=${payload.source} FAILED attempts=${result.attempts} error=${this.lastSaveError} permanent=${this.permanentFailure} took=${Date.now() - startedAt}ms`,
      );
    }
    return result;
  }

  // ---------------------------------------------------------------- 关闭

  async shutdown() {
    if (this.closed) return;
    this.shuttingDown = true;
    this._clearSaveTimer();
    this._clearIdleTimer();
    try {
      if (this.dirty || this.everHadClients) await this.flush('disconnect');
    } catch (err) {
      this.logger.warn(`[room ${this.name}] 关闭前保存失败: ${err?.message || err}`);
    }
    this.close();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this._clearSaveTimer();
    this._clearIdleTimer();
    this.doc.off('update', this._onDocUpdate);
    this.awareness.off('update', this._onAwarenessUpdate);
    try {
      this.awareness.destroy();
    } catch {
      /* noop */
    }
    try {
      this.doc.destroy();
    } catch {
      /* noop */
    }
    this.conns.clear();
  }
}
