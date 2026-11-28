/**
 * 计划实时协同客户端（P2 · L3 Yjs）。
 *
 * 职责：把 REST 的 days/items 结构装进一份 Y.Doc，并把文档通过
 * y-websocket（collab-token 返回的 wsUrl/room）与 y-indexeddb（离线）接起来。
 * 文档结构严格按 docs/plan-p1-collab-spec.md §2：
 *
 *   days : Y.Array<Y.Map>  { id, date, title, theme, summary }
 *   items: Y.Map<Y.Map>    { id, dayId, kind, startAt, endAt, title(Y.Text),
 *                            place(Y.Text), costCents, note(Y.Text), done, doneBy,
 *                            sortOrder, mediaIds(Y.Array<number>), version }
 *   meta : Y.Map
 *
 * 设计要点：
 *   · title / place / note 是 **Y.Text**：两个人在同一段文字里同时打字，光标不打架；
 *     其余短字段是普通值（Y.Map LWW），与 REST 的 version 乐观锁配合；
 *   · REST 写的响应通过 applyItemRow 合并回文档 —— 文档与数据库不会各存一份真相：
 *     文档里永远包含「全部天 + 全部块」，否则 realtime 物化时会把缺的行删掉；
 *   · 首次进入先用 REST 详情渲染（秒开），文档就绪后再以文档为准；
 *   · 离线（WS 未连上）时文本编辑仍然写本地 IndexedDB，联网后 CRDT 自动合并。
 *
 * 本文件只在浏览器执行（由 store 动态 import），不参与 SSR。
 */
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { IndexeddbPersistence } from 'y-indexeddb'
import type {
  CollabStatus,
  CollabUser,
  PlanDayRow,
  PlanItemKind,
  PlanItemRow,
  PlanPeer,
} from './plan-collab-types'

export type PlanTextField = 'title' | 'place' | 'note'
export const PLAN_TEXT_FIELDS: PlanTextField[] = ['title', 'place', 'note']

export interface CollabTokenInfo {
  token: string
  wsUrl: string
  room: string
}

export interface PlanCollabClientOptions {
  planId: number
  user: CollabUser
  /** 由调用方实现：POST /api/spaces/[id]/plans/[planId]/collab-token */
  fetchToken: () => Promise<CollabTokenInfo>
  /** 连接状态变化（connecting/live/offline），UI 用来显示「已连接/离线」 */
  onStatus?: (status: CollabStatus) => void
}

const IDB_LOAD_TIMEOUT_MS = 1200
const SYNC_TIMEOUT_MS = 2600
/** 关闭码 4400/4401 是永久性拒绝（bad message / token 过期），换 token 后手动重连 */
const PERMANENT_CLOSE_MIN = 4400
const PERMANENT_CLOSE_MAX = 4499

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeText(value: string): Y.Text {
  const text = new Y.Text()
  if (value) text.insert(0, value)
  return text
}

function makeNumberArray(values: number[]): Y.Array<number> {
  const array = new Y.Array<number>()
  if (values.length > 0) array.insert(0, values)
  return array
}

function textOf(value: unknown): string {
  if (value instanceof Y.Text) return value.toString()
  if (typeof value === 'string') return value
  return ''
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

function stringOrNull(value: unknown): string | null {
  if (value == null) return null
  const s = String(value)
  return s.length === 0 ? null : s
}

function itemToYMap(item: PlanItemRow): Y.Map<unknown> {
  const map = new Y.Map<unknown>()
  map.set('id', String(item.id))
  map.set('dayId', String(item.dayId))
  map.set('kind', item.kind)
  map.set('startAt', item.startAt)
  map.set('endAt', item.endAt)
  map.set('title', makeText(item.title || ''))
  map.set('place', makeText(item.place || ''))
  map.set('note', makeText(item.note || ''))
  map.set('costCents', item.costCents)
  map.set('done', item.done === true)
  map.set('doneBy', item.doneBy)
  map.set('sortOrder', item.sortOrder)
  map.set('mediaIds', makeNumberArray(item.mediaIds ?? []))
  map.set('version', item.version)
  map.set('updatedBy', item.updatedBy)
  return map
}

/** 用 REST 行覆盖文档里的短字段 + Y.Text（forceText=true 时连文本一起替换，仅用于「采用对方版本」） */
function syncMapFromRow(map: Y.Map<unknown>, row: PlanItemRow, forceText: boolean): void {
  const setIfChanged = (key: string, next: unknown) => {
    const current = map.get(key)
    if (current !== next) map.set(key, next)
  }
  setIfChanged('id', String(row.id))
  setIfChanged('dayId', String(row.dayId))
  setIfChanged('kind', row.kind)
  setIfChanged('startAt', row.startAt)
  setIfChanged('endAt', row.endAt)
  setIfChanged('costCents', row.costCents)
  setIfChanged('done', row.done === true)
  setIfChanged('doneBy', row.doneBy)
  setIfChanged('sortOrder', row.sortOrder)
  setIfChanged('version', row.version)
  setIfChanged('updatedBy', row.updatedBy)

  const texts: Array<[PlanTextField, string]> = [
    ['title', row.title || ''],
    ['place', row.place || ''],
    ['note', row.note || ''],
  ]
  for (const [field, next] of texts) {
    const current = map.get(field)
    if (current instanceof Y.Text) {
      if (forceText) {
        const currentText = current.toString()
        if (currentText !== next) {
          current.delete(0, current.length)
          if (next) current.insert(0, next)
        }
      } else if (current.length === 0 && next) {
        // 只补空文本：已有内容以 Yjs 为准，避免把本地正在打的字覆盖掉
        current.insert(0, next)
      }
    } else if (next) {
      map.set(field, makeText(next))
    }
  }

  const media = map.get('mediaIds')
  const nextMedia = row.mediaIds ?? []
  if (media instanceof Y.Array) {
    const current = media.toArray()
    const same = current.length === nextMedia.length && current.every((id, index) => id === nextMedia[index])
    if (!same) {
      media.delete(0, media.length)
      if (nextMedia.length > 0) media.insert(0, nextMedia)
    }
  } else {
    map.set('mediaIds', makeNumberArray(nextMedia))
  }
}

export class PlanCollabClient {
  readonly planId: number
  readonly doc: Y.Doc = new Y.Doc()
  private readonly user: CollabUser
  private readonly fetchToken: () => Promise<CollabTokenInfo>
  private readonly onStatus?: (status: CollabStatus) => void

  private idb: IndexeddbPersistence | null = null
  private provider: WebsocketProvider | null = null
  private status: CollabStatus = 'idle'
  private synced = false
  private started = false
  private destroyed = false
  private resolveReady: (() => void) | null = null
  private readonly readyPromise: Promise<void>

  private readonly docListeners = new Set<() => void>()
  private readonly syncListeners = new Set<() => void>()
  private readonly statusListeners = new Set<(status: CollabStatus) => void>()
  private readonly awarenessListeners = new Set<() => void>()

  constructor(options: PlanCollabClientOptions) {
    this.planId = options.planId
    this.user = options.user
    this.fetchToken = options.fetchToken
    this.onStatus = options.onStatus
    this.readyPromise = new Promise<void>((resolve) => {
      this.resolveReady = resolve
    })
    this.handleDocUpdate = this.handleDocUpdate.bind(this)
    this.handleAwarenessChange = this.handleAwarenessChange.bind(this)
    this.doc.on('update', this.handleDocUpdate)
  }

  /** 文档就绪（IDB 已载入 + 至少尝试过一次服务端同步）；不会 reject */
  whenReady(): Promise<void> {
    return this.readyPromise
  }

  start(): void {
    if (this.started) return
    this.started = true
    void this.bootstrap()
  }

  private async bootstrap(): Promise<void> {
    this.setStatus('connecting')
    try {
      this.idb = new IndexeddbPersistence(`plan-${this.planId}`, this.doc)
      await Promise.race([this.idb.whenSynced.catch(() => undefined), sleep(IDB_LOAD_TIMEOUT_MS)])
    } catch {
      this.idb = null
    }
    try {
      const token = await this.fetchToken()
      this.createProvider(token)
    } catch {
      this.setStatus('offline')
    }
    await Promise.race([this.waitFirstSync(), sleep(SYNC_TIMEOUT_MS)])
    this.resolveReady?.()
    this.resolveReady = null
  }

  private waitFirstSync(): Promise<void> {
    if (this.synced) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const unsubscribe = this.onSync(() => {
        unsubscribe()
        resolve()
      })
    })
  }

  private createProvider(token: CollabTokenInfo): void {
    if (this.destroyed) return
    const provider = new WebsocketProvider(token.wsUrl, token.room, this.doc, {
      connect: true,
      params: { token: token.token },
      // 4400–4499 是永久关闭：不能让 y-websocket 无限重连旧 token
      shouldReconnect: (event: CloseEvent) => {
        if (event.code >= PERMANENT_CLOSE_MIN && event.code <= PERMANENT_CLOSE_MAX) {
          void this.reconnectWithFreshToken()
          return false
        }
        return true
      },
    })
    this.provider = provider
    const awareness = provider.awareness
    awareness.setLocalStateField('user', this.user)
    awareness.setLocalStateField('editingItemId', null)
    awareness.setLocalStateField('editingField', null)
    awareness.setLocalStateField('cursor', null)
    awareness.setLocalStateField('cursorEnd', null)
    awareness.on('change', this.handleAwarenessChange)

    provider.on('status', () => this.refreshConnectionStatus())
    provider.on('sync', (isSynced: boolean) => {
      this.synced = isSynced
      this.refreshConnectionStatus()
      if (isSynced) for (const listener of Array.from(this.syncListeners)) listener()
    })
  }

  private async reconnectWithFreshToken(): Promise<void> {
    if (this.destroyed) return
    this.setStatus('offline')
    try {
      const token = await this.fetchToken()
      if (this.destroyed || !this.provider) return
      this.provider.params = { ...this.provider.params, token: token.token }
      this.provider.connect()
      this.setStatus('connecting')
    } catch {
      // 保持 offline，下次用户手动重试或页面重进
    }
  }

  private refreshConnectionStatus(): void {
    const provider = this.provider
    if (!provider) return
    if (provider.wsconnected && this.synced) this.setStatus('live')
    else if (provider.wsconnected || provider.wsconnecting) this.setStatus('connecting')
    else this.setStatus('offline')
  }

  private setStatus(next: CollabStatus): void {
    if (this.status === next) return
    this.status = next
    for (const listener of Array.from(this.statusListeners)) listener(next)
    this.onStatus?.(next)
  }

  getStatus(): CollabStatus {
    return this.status
  }

  /** 手动重试连接（离线横幅上的「重试」） */
  retry(): void {
    if (this.destroyed) return
    if (!this.provider) {
      void this.bootstrap()
      return
    }
    void this.reconnectWithFreshToken()
  }

  private handleDocUpdate(): void {
    for (const listener of Array.from(this.docListeners)) listener()
  }

  private handleAwarenessChange(): void {
    for (const listener of Array.from(this.awarenessListeners)) listener()
  }

  onDocChange(listener: () => void): () => void {
    this.docListeners.add(listener)
    return () => this.docListeners.delete(listener)
  }

  onSync(listener: () => void): () => void {
    this.syncListeners.add(listener)
    return () => this.syncListeners.delete(listener)
  }

  onStatusChange(listener: (status: CollabStatus) => void): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  onAwarenessChange(listener: () => void): () => void {
    this.awarenessListeners.add(listener)
    return () => this.awarenessListeners.delete(listener)
  }

  /* ── 文档读写 ─────────────────────────────────────────────────────── */

  private daysArray(): Y.Array<Y.Map<unknown>> {
    return this.doc.getArray<Y.Map<unknown>>('days')
  }

  private itemsMap(): Y.Map<Y.Map<unknown>> {
    return this.doc.getMap<Y.Map<unknown>>('items')
  }

  /** 文档里是否已经有天（= 已 seed 或服务端快照已有内容） */
  hasDays(): boolean {
    return this.daysArray().length > 0
  }

  /**
   * 用 REST 详情补齐文档：只补缺的天/块（幂等）。
   * 首次进入时文档为空 → 全量落；之后 server 端新增的块也会被补进来。
   */
  seed(days: PlanDayRow[], items: PlanItemRow[], planMeta: Record<string, unknown> | null): void {
    if (this.destroyed) return
    const yDays = this.daysArray()
    const yItems = this.itemsMap()
    const yMeta = this.doc.getMap('meta')
    this.doc.transact(() => {
      const existingDayIds = new Set<string>()
      yDays.forEach((day) => existingDayIds.add(String(day.get('id'))))
      const sortedDays = [...days].sort((a, b) => a.sortOrder - b.sortOrder)
      for (const day of sortedDays) {
        const id = String(day.id)
        if (existingDayIds.has(id)) continue
        existingDayIds.add(id)
        const map = new Y.Map<unknown>()
        map.set('id', id)
        map.set('date', day.date)
        map.set('title', day.title)
        map.set('theme', day.theme)
        map.set('summary', day.summary)
        yDays.push([map])
      }
      for (const item of items) {
        const key = String(item.id)
        if (yItems.has(key)) continue
        yItems.set(key, itemToYMap(item))
      }
      if (planMeta) {
        for (const [key, value] of Object.entries(planMeta)) {
          if (value === undefined) continue
          if (yMeta.get(key) === undefined) yMeta.set(key, value)
        }
      }
    })
    this.dedupeDays()
  }

  /**
   * 两个客户端同时 seed 会让 Y.Array 里出现重复的天（CRDT 里两次 push 都会保留）：
   * 按 id 去重，保留第一次出现的那份。幂等、可重复调用。
   */
  dedupeDays(): void {
    const yDays = this.daysArray()
    const seen = new Set<string>()
    const duplicates: number[] = []
    yDays.forEach((day, index) => {
      const id = String(day.get('id') ?? '')
      if (!id) return
      if (seen.has(id)) duplicates.push(index)
      else seen.add(id)
    })
    if (duplicates.length === 0) return
    this.doc.transact(() => {
      for (const index of duplicates.reverse()) yDays.delete(index, 1)
    })
  }

  getDays(): PlanDayRow[] {
    const planId = this.planId
    const days: PlanDayRow[] = []
    this.daysArray().forEach((map, index) => {
      days.push({
        id: Number(map.get('id')),
        planId,
        date: stringOrNull(map.get('date')),
        title: stringOrNull(map.get('title')),
        theme: stringOrNull(map.get('theme')),
        summary: stringOrNull(map.get('summary')),
        sortOrder: index,
        version: 0,
        updatedBy: null,
        updatedAt: '',
      })
    })
    return days
  }

  getItems(): PlanItemRow[] {
    const items: PlanItemRow[] = []
    this.itemsMap().forEach((map) => {
      items.push(this.readItem(map))
    })
    return items
  }

  getItem(itemId: number): PlanItemRow | null {
    const map = this.itemsMap().get(String(itemId))
    return map ? this.readItem(map) : null
  }

  private readItem(map: Y.Map<unknown>): PlanItemRow {
    const dayId = numberOrNull(map.get('dayId')) ?? 0
    return {
      id: numberOrNull(map.get('id')) ?? 0,
      dayId,
      kind: (stringOrNull(map.get('kind')) ?? 'SPOT') as PlanItemKind,
      startAt: stringOrNull(map.get('startAt')),
      endAt: stringOrNull(map.get('endAt')),
      title: textOf(map.get('title')),
      place: stringOrNull(textOf(map.get('place'))) === null ? null : textOf(map.get('place')),
      costCents: numberOrNull(map.get('costCents')),
      note: stringOrNull(textOf(map.get('note'))),
      done: map.get('done') === true,
      doneBy: stringOrNull(map.get('doneBy')),
      sortOrder: numberOrNull(map.get('sortOrder')) ?? 0,
      version: numberOrNull(map.get('version')) ?? 0,
      updatedBy: stringOrNull(map.get('updatedBy')),
      updatedAt: '',
      mediaIds: this.readMediaIds(map.get('mediaIds')),
    }
  }

  private readMediaIds(value: unknown): number[] {
    if (value instanceof Y.Array) {
      return value.toArray().map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
    }
    if (Array.isArray(value)) return value.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
    return []
  }

  getItemText(itemId: number, field: PlanTextField): Y.Text | null {
    const map = this.itemsMap().get(String(itemId))
    const value = map?.get(field)
    return value instanceof Y.Text ? value : null
  }

  /** REST 行合并进文档：缺的块补建，已有的块只改短字段（text 默认只补空） */
  applyItemRow(row: PlanItemRow, options: { forceText?: boolean } = {}): void {
    if (this.destroyed) return
    if (!row || !Number.isInteger(row.id) || row.id <= 0) return
    const items = this.itemsMap()
    const key = String(row.id)
    const existing = items.get(key)
    if (!existing) {
      items.set(key, itemToYMap(row))
      return
    }
    this.doc.transact(() => {
      syncMapFromRow(existing, row, options.forceText === true)
    })
  }

  removeItemRow(itemId: number): void {
    if (this.destroyed) return
    this.itemsMap().delete(String(itemId))
  }

  /** 跨天移动：只改 dayId/sortOrder，不碰文本 */
  applyItemMove(itemId: number, dayId: number, sortOrder: number, version?: number): void {
    if (this.destroyed) return
    const map = this.itemsMap().get(String(itemId))
    if (!map) return
    this.doc.transact(() => {
      map.set('dayId', String(dayId))
      map.set('sortOrder', sortOrder)
      if (typeof version === 'number') map.set('version', version)
    })
  }

  applyDayRow(row: PlanDayRow): void {
    if (this.destroyed) return
    const days = this.daysArray()
    let found: Y.Map<unknown> | null = null
    days.forEach((day) => {
      if (String(day.get('id')) === String(row.id)) found = day
    })
    this.doc.transact(() => {
      if (found) {
        const map = found as Y.Map<unknown>
        const set = (key: string, next: unknown) => {
          if (map.get(key) !== next) map.set(key, next)
        }
        set('date', row.date)
        set('title', row.title)
        set('theme', row.theme)
        set('summary', row.summary)
        return
      }
      const map = new Y.Map<unknown>()
      map.set('id', String(row.id))
      map.set('date', row.date)
      map.set('title', row.title)
      map.set('theme', row.theme)
      map.set('summary', row.summary)
      days.push([map])
    })
  }

  /* ── awareness（谁在编辑哪一块 / 同段文字光标） ─────────────────────── */

  setLocalUser(user: CollabUser): void {
    this.provider?.awareness.setLocalStateField('user', user)
  }

  setEditing(itemId: number | null, field: PlanTextField | null): void {
    const awareness = this.provider?.awareness
    if (!awareness) return
    awareness.setLocalStateField('editingItemId', itemId)
    awareness.setLocalStateField('editingField', field)
  }

  setCursor(cursor: number | null, cursorEnd: number | null): void {
    const awareness = this.provider?.awareness
    if (!awareness) return
    awareness.setLocalStateField('cursor', cursor)
    awareness.setLocalStateField('cursorEnd', cursorEnd)
  }

  /** 页面不可见时把「正在编辑」清掉，避免别人看到幽灵光标 */
  clearEditing(): void {
    this.setEditing(null, null)
    this.setCursor(null, null)
  }

  getPeers(): PlanPeer[] {
    const awareness = this.provider?.awareness
    if (!awareness) return []
    const localId = awareness.clientID
    const peers: PlanPeer[] = []
    awareness.getStates().forEach((state, clientId) => {
      if (clientId === localId) return
      const raw = state as Record<string, unknown>
      const user = (raw.user ?? null) as CollabUser | null
      if (!user || typeof user !== 'object') return
      peers.push({
        clientId,
        user,
        editingItemId: numberOrNull(raw.editingItemId),
        editingField: typeof raw.editingField === 'string' ? raw.editingField : null,
        cursor: numberOrNull(raw.cursor),
        cursorEnd: numberOrNull(raw.cursorEnd),
      })
    })
    return peers
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.docListeners.clear()
    this.syncListeners.clear()
    this.statusListeners.clear()
    this.awarenessListeners.clear()
    try {
      this.provider?.awareness.off('change', this.handleAwarenessChange)
      this.provider?.destroy()
    } catch {
      // provider 可能从未建立
    }
    this.provider = null
    try {
      this.idb?.destroy()
    } catch {
      // IndexedDB 已关闭
    }
    this.idb = null
    try {
      this.doc.off('update', this.handleDocUpdate)
      this.doc.destroy()
    } catch {
      // doc 已销毁
    }
  }
}
