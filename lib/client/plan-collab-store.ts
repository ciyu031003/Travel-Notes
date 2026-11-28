/**
 * 计划编辑器状态层：REST 数据 + Yjs 文档 + 乐观更新 + 行级冲突处理。
 *
 * 三个来源怎么排优先级：
 *   1. 进入页面先用 GET 详情（REST）渲染 —— 秒开，不依赖 WS；
 *   2. 文档就绪后以 **Y.Doc 为准**（文本以 CRDT 合并，短字段以文档里的值为准）；
 *   3. 所有 REST 写响应都合并回文档（applyItemRow）—— 文档里永远有「全部天 + 全部块」，
 *      否则 realtime 物化会删掉缺失的行（docs/realtime-collab.md §6）。
 *
 * 订阅粒度：days / 每一天的块列表 / 每一块 / 进度统计 / 在线态分开通知，
 * 打字时只重渲染那一块（和正在编辑的面板），不会整页刷新。
 */
import type {
  CollabStatus,
  PlanConflictInfo,
  PlanDayRow,
  PlanDetailPayload,
  PlanItemKind,
  PlanItemRow,
  PlanPeer,
  PlanRecord,
  CollabUser,
} from './plan-collab-types'
import type { CollabTokenInfo, PlanCollabClient, PlanTextField } from './plan-collab'
import type { Text as YText } from 'yjs'

export interface PlanGap {
  dayId: number
  itemId: number | null
  /** 缺口说明（用于「缺 2 项」与滚动定位） */
  label: string
}

export interface PlanStats {
  dayCount: number
  total: number
  filled: number
  done: number
  gapCount: number
  /** 0-100：已填块占比 */
  percent: number
  firstGap: PlanGap | null
  gaps: PlanGap[]
}

export interface UpdateItemPatch {
  kind?: PlanItemKind
  startAt?: string | null
  endAt?: string | null
  costCents?: number | null
  mediaIds?: number[]
}

export interface CreateItemInput {
  dayId: number
  kind?: PlanItemKind
  title?: string
  startAt?: string | null
  costCents?: number | null
  place?: string | null
  note?: string | null
}

export interface ConvertResult {
  travelId: number
  travelSlug: string | null
  alreadyConverted: boolean
  published: boolean
}

export type WriteResult =
  | { ok: true; item: PlanItemRow }
  | { ok: false; conflict: PlanConflictInfo; error: string }

export class PlanStoreError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'PlanStoreError'
    this.status = status
  }
}

const TITLE_PLACEHOLDER = '待定'
const ENGINE_PLACEHOLDER_NOTE = /^引擎占位/

/** 「这一块算填过了吗」：标题不是占位、且不是原封不动的引擎占位 */
export function isItemFilled(item: Pick<PlanItemRow, 'title' | 'place' | 'note'>): boolean {
  const title = (item.title || '').trim()
  if (!title || title === TITLE_PLACEHOLDER) return false
  const place = (item.place || '').trim()
  const note = (item.note || '').trim()
  const untouchedPlace = !place || place.includes(TITLE_PLACEHOLDER)
  const untouchedNote = !note || ENGINE_PLACEHOLDER_NOTE.test(note)
  return !(untouchedPlace && untouchedNote)
}

function sameItem(a: PlanItemRow, b: PlanItemRow): boolean {
  return (
    a.id === b.id &&
    a.dayId === b.dayId &&
    a.kind === b.kind &&
    a.startAt === b.startAt &&
    a.endAt === b.endAt &&
    a.title === b.title &&
    a.place === b.place &&
    a.costCents === b.costCents &&
    a.note === b.note &&
    a.done === b.done &&
    a.doneBy === b.doneBy &&
    a.sortOrder === b.sortOrder &&
    a.version === b.version &&
    a.updatedBy === b.updatedBy &&
    a.mediaIds.length === b.mediaIds.length &&
    a.mediaIds.every((id, index) => id === b.mediaIds[index])
  )
}

function sameDay(a: PlanDayRow, b: PlanDayRow): boolean {
  return (
    a.id === b.id &&
    a.date === b.date &&
    a.title === b.title &&
    a.theme === b.theme &&
    a.summary === b.summary &&
    a.sortOrder === b.sortOrder
  )
}

function sortItems(items: PlanItemRow[]): PlanItemRow[] {
  return [...items].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.id - b.id
  })
}

function sameArray<T>(a: ReadonlyArray<T>, b: ReadonlyArray<T>, eq: (x: T, y: T) => boolean): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) if (!eq(a[i], b[i])) return false
  return true
}

const EMPTY_ITEMS: ReadonlyArray<PlanItemRow> = []

export class PlanCollabStore {
  readonly spaceId: number
  readonly planId: number
  readonly canEdit: boolean
  readonly user: CollabUser

  private plan: PlanRecord
  private readonly initialDetail: PlanDetailPayload
  private client: PlanCollabClient | null = null
  private connected = false

  private listeners = new Map<string, Set<() => void>>()

  private daysSnapshot: ReadonlyArray<PlanDayRow> = []
  private itemSnapshots = new Map<number, PlanItemRow>()
  private daySnapshots = new Map<number, ReadonlyArray<PlanItemRow>>()
  private statsSnapshot: PlanStats = {
    dayCount: 0,
    total: 0,
    filled: 0,
    done: 0,
    gapCount: 0,
    percent: 0,
    firstGap: null,
    gaps: [],
  }
  private planSnapshot: PlanRecord
  private peersSnapshot: ReadonlyArray<PlanPeer> = []
  private cursorSnapshot: ReadonlyArray<PlanPeer> = []
  private statusSnapshot: CollabStatus = 'idle'
  private recomputeQueued = false
  private destroyed = false

  constructor(options: {
    spaceId: number
    planId: number
    canEdit: boolean
    user: CollabUser
    detail: PlanDetailPayload
  }) {
    this.spaceId = options.spaceId
    this.planId = options.planId
    this.canEdit = options.canEdit
    this.user = options.user
    this.initialDetail = options.detail
    this.plan = options.detail.plan
    this.planSnapshot = this.plan
    this.daysSnapshot = [...options.detail.days].sort((a, b) => a.sortOrder - b.sortOrder)
    for (const item of options.detail.items) this.itemSnapshots.set(item.id, item)
    this.syncStatus('offline')
    this.rebuild()
  }

  /* ── 订阅原语 ────────────────────────────────────────────────────── */

  subscribe(key: string, listener: () => void): () => void {
    let set = this.listeners.get(key)
    if (!set) {
      set = new Set()
      this.listeners.set(key, set)
    }
    set.add(listener)
    return () => {
      set?.delete(listener)
    }
  }

  private emit(key: string): void {
    const set = this.listeners.get(key)
    if (!set) return
    for (const listener of Array.from(set)) listener()
  }

  subscribeDays(listener: () => void): () => void {
    return this.subscribe('days', listener)
  }
  subscribeDay(dayId: number, listener: () => void): () => void {
    return this.subscribe(`day:${dayId}`, listener)
  }
  subscribeItem(itemId: number, listener: () => void): () => void {
    return this.subscribe(`item:${itemId}`, listener)
  }
  subscribeStats(listener: () => void): () => void {
    return this.subscribe('stats', listener)
  }
  subscribePlan(listener: () => void): () => void {
    return this.subscribe('plan', listener)
  }
  subscribePeers(listener: () => void): () => void {
    return this.subscribe('peers', listener)
  }
  subscribeCursors(listener: () => void): () => void {
    return this.subscribe('cursors', listener)
  }
  subscribeStatus(listener: () => void): () => void {
    return this.subscribe('status', listener)
  }

  getDays(): ReadonlyArray<PlanDayRow> {
    return this.daysSnapshot
  }
  getDay(dayId: number): PlanDayRow | null {
    return this.daysSnapshot.find((day) => day.id === dayId) ?? null
  }
  getDayItems(dayId: number): ReadonlyArray<PlanItemRow> {
    return this.daySnapshots.get(dayId) ?? EMPTY_ITEMS
  }
  getItem(itemId: number): PlanItemRow | null {
    return this.itemSnapshots.get(itemId) ?? null
  }
  getStats(): PlanStats {
    return this.statsSnapshot
  }
  getPlan(): PlanRecord {
    return this.planSnapshot
  }
  getPeers(): ReadonlyArray<PlanPeer> {
    return this.peersSnapshot
  }
  getCursors(): ReadonlyArray<PlanPeer> {
    return this.cursorSnapshot
  }
  getStatus(): CollabStatus {
    return this.statusSnapshot
  }
  isCollabReady(): boolean {
    return this.connected
  }
  getInitialPresence() {
    return this.initialDetail.presence
  }
  getMembers() {
    return this.initialDetail.members
  }

  /* ── 协同接入 ────────────────────────────────────────────────────── */

  /** 动态加载 Yjs 客户端并接入（只在浏览器、只在 canEdit 时调用） */
  async startCollab(fetchToken: () => Promise<CollabTokenInfo>): Promise<void> {
    if (!this.canEdit) return
    if (this.client) return
    // StrictMode 会 mount → unmount → mount：destroy 过也要能重新接上
    this.destroyed = false
    this.syncStatus('connecting')
    const mod = await import('./plan-collab')
    if (this.destroyed) return
    const client = new mod.PlanCollabClient({
      planId: this.planId,
      user: this.user,
      fetchToken,
      onStatus: (status) => this.syncStatus(status),
    })
    this.client = client
    client.onDocChange(() => this.scheduleRecompute())
    client.onSync(() => {
      // 迟到的服务端快照：把 REST 里还没进文档的行补上（幂等）
      client.seed(this.initialDetail.days, this.initialDetail.items, this.initialDetail.plan.planMeta)
      this.scheduleRecompute()
    })
    client.onAwarenessChange(() => this.refreshPeers())
    client.start()
    await client.whenReady()
    if (this.destroyed) return
    client.seed(this.initialDetail.days, this.initialDetail.items, this.initialDetail.plan.planMeta)
    this.connected = true
    this.rebuild()
  }

  /** 文本字段绑到 Y.Text；文档未就绪时返回 null（UI 退回只读/本地输入） */
  getItemText(itemId: number, field: PlanTextField): YText | null {
    return this.client?.getItemText(itemId, field) ?? null
  }
  setEditing(itemId: number | null, field: PlanTextField | null): void {
    this.client?.setEditing(itemId, field)
  }
  setCursor(cursor: number | null, cursorEnd: number | null): void {
    this.client?.setCursor(cursor, cursorEnd)
  }
  clearEditing(): void {
    this.client?.clearEditing()
  }
  retryConnection(): void {
    this.client?.retry()
  }

  private syncStatus(status: CollabStatus): void {
    if (this.statusSnapshot === status) return
    this.statusSnapshot = status
    this.emit('status')
  }

  private refreshPeers(): void {
    const client = this.client
    if (!client) return
    const peers = client.getPeers()
    const stable = (list: PlanPeer[]) =>
      list
        .map((peer) => `${peer.clientId}:${peer.user?.id ?? 0}:${peer.editingItemId ?? ''}:${peer.editingField ?? ''}`)
        .sort()
        .join('|')
    const nextStable = stable(peers)
    if (nextStable !== stable([...this.peersSnapshot])) {
      this.peersSnapshot = peers
      this.emit('peers')
    }
    this.cursorSnapshot = peers
    this.emit('cursors')
  }

  /* ── 文档 → 视图快照（按块/按天比较，避免整页重渲染） ─────────────── */

  private scheduleRecompute(): void {
    if (this.recomputeQueued || this.destroyed) return
    this.recomputeQueued = true
    queueMicrotask(() => {
      this.recomputeQueued = false
      if (!this.destroyed) this.rebuild()
    })
  }

  private readDays(): PlanDayRow[] {
    if (this.client && this.client.hasDays()) {
      return this.client.getDays().sort((a, b) => a.sortOrder - b.sortOrder)
    }
    return [...this.initialDetail.days].sort((a, b) => a.sortOrder - b.sortOrder)
  }

  private readItems(): PlanItemRow[] {
    if (this.client && this.client.hasDays()) {
      return this.client.getItems()
    }
    return Array.from(this.itemSnapshots.values())
  }

  /** 重建快照：只对真正变了的块/天发通知 */
  private rebuild(): void {
    const nextDays = this.readDays()
    if (!sameArray(this.daysSnapshot, nextDays, sameDay)) {
      this.daysSnapshot = nextDays
      this.emit('days')
    }

    const nextItems = new Map<number, PlanItemRow>()
    for (const item of this.readItems()) nextItems.set(item.id, item)

    const changed = new Set<number>()
    nextItems.forEach((item, id) => {
      const prev = this.itemSnapshots.get(id)
      if (!prev || !sameItem(prev, item)) {
        this.itemSnapshots.set(id, item)
        changed.add(id)
      }
    })
    for (const id of Array.from(this.itemSnapshots.keys())) {
      if (!nextItems.has(id)) {
        this.itemSnapshots.delete(id)
        changed.add(id)
      }
    }
    for (const id of Array.from(changed)) this.emit(`item:${id}`)

    // 按天分组（用 itemSnapshots，保证同一块对象引用稳定）
    const grouped = new Map<number, PlanItemRow[]>()
    for (const day of this.daysSnapshot) grouped.set(day.id, [])
    this.itemSnapshots.forEach((item) => {
      const list = grouped.get(item.dayId)
      if (list) list.push(item)
      else grouped.set(item.dayId, [item])
    })
    const touchedDayIds = Array.from(new Set(Array.from(grouped.keys()).concat(Array.from(this.daySnapshots.keys()))))
    for (const dayId of touchedDayIds) {
      const next = sortItems(grouped.get(dayId) ?? [])
      const prev = this.daySnapshots.get(dayId) ?? EMPTY_ITEMS
      const sameRefs = prev.length === next.length && prev.every((item, index) => item === next[index])
      if (!sameRefs) {
        this.daySnapshots.set(dayId, next)
        this.emit(`day:${dayId}`)
      }
    }

    // 统计（进度 / 缺口）——只有数字变化时才通知
    const stats = this.computeStats()
    const prevStats = this.statsSnapshot
    if (
      stats.total !== prevStats.total ||
      stats.filled !== prevStats.filled ||
      stats.done !== prevStats.done ||
      stats.dayCount !== prevStats.dayCount ||
      stats.gapCount !== prevStats.gapCount ||
      stats.firstGap?.dayId !== prevStats.firstGap?.dayId ||
      stats.firstGap?.itemId !== prevStats.firstGap?.itemId
    ) {
      this.statsSnapshot = stats
      this.emit('stats')
    }
  }

  private computeStats(): PlanStats {
    const gaps: PlanGap[] = []
    let total = 0
    let filled = 0
    let done = 0
    for (const day of this.daysSnapshot) {
      const items = this.daySnapshots.get(day.id) ?? []
      if (items.length === 0) {
        gaps.push({ dayId: day.id, itemId: null, label: `第 ${day.sortOrder + 1} 天还没有安排` })
        continue
      }
      for (const item of items) {
        total += 1
        if (isItemFilled(item)) filled += 1
        else gaps.push({ dayId: day.id, itemId: item.id, label: item.title || '还没填内容的安排' })
        if (item.done) done += 1
      }
    }
    return {
      dayCount: this.daysSnapshot.length,
      total,
      filled,
      done,
      gapCount: gaps.length,
      percent: total === 0 ? 0 : Math.round((filled / total) * 100),
      firstGap: gaps[0] ?? null,
      gaps,
    }
  }

  /* ── REST 写操作 ─────────────────────────────────────────────────── */

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(path, {
      credentials: 'include',
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const message = typeof json.error === 'string' ? json.error : `请求失败（${res.status}）`
      const error = new PlanStoreError(message, res.status) as PlanStoreError & { payload?: Record<string, unknown> }
      error.payload = json
      throw error
    }
    return json as T
  }

  private applyRow(row: PlanItemRow): void {
    if (this.client) this.client.applyItemRow(row)
    this.scheduleRecompute()
  }

  async createItem(input: CreateItemInput): Promise<PlanItemRow> {
    const body = {
      dayId: input.dayId,
      kind: input.kind ?? 'SPOT',
      title: input.title,
      startAt: input.startAt ?? undefined,
      costCents: input.costCents ?? undefined,
      place: input.place ?? undefined,
      note: input.note ?? undefined,
    }
    const json = await this.request<{ item: PlanItemRow }>(
      `/api/spaces/${this.spaceId}/plans/${this.planId}/items`,
      { method: 'POST', body: JSON.stringify(body) },
    )
    if (json.item) this.applyRow(json.item)
    return json.item
  }

  /**
   * 改块的短字段（kind/时间/花销/照片）。文本字段走 Y.Text，不在这里。
   *
   * 409 处理：如果服务端版本比本地新（常见于「自己刚打的字被 realtime 物化」），
   * 先用服务端最新 version 自动重试一次；仍然冲突才把「对方的版本」交给 UI。
   */
  async updateItem(itemId: number, patch: UpdateItemPatch): Promise<WriteResult> {
    const current = this.itemSnapshots.get(itemId)
    if (!current) throw new PlanStoreError('这一块不存在，可能已被其他人删除', 404)
    try {
      const item = await this.patchRaw(itemId, patch, current.version)
      this.applyRow(item)
      return { ok: true, item }
    } catch (error) {
      const conflict = this.conflictInfoOf(error, itemId, patch, current.version)
      if (!conflict) throw error
      // 版本被推进过（通常是自己的文本改动刚被 realtime 物化）：用最新 version 重试一次
      const latest = this.itemSnapshots.get(itemId)
      if (latest && latest.version > current.version) {
        try {
          const item = await this.patchRaw(itemId, patch, latest.version)
          this.applyRow(item)
          return { ok: true, item }
        } catch (retryError) {
          const retryConflict = this.conflictInfoOf(retryError, itemId, patch, latest.version)
          if (!retryConflict) throw retryError
          return { ok: false, conflict: retryConflict, error: '刚被别人改过' }
        }
      }
      return { ok: false, conflict, error: '刚被别人改过' }
    }
  }

  private async patchRaw(itemId: number, patch: UpdateItemPatch, version: number): Promise<PlanItemRow> {
    const json = await this.request<{ item: PlanItemRow }>(
      `/api/spaces/${this.spaceId}/plans/${this.planId}/items/${itemId}`,
      { method: 'PATCH', body: JSON.stringify({ ...patch, version }) },
    )
    return json.item
  }

  private conflictInfoOf(error: unknown, itemId: number, patch: UpdateItemPatch, version: number): PlanConflictInfo | null {
    if (!(error instanceof PlanStoreError)) return null
    const payload = (error as PlanStoreError & { payload?: Record<string, unknown> }).payload
    const current = payload?.current
    if (error.status === 409 && current && typeof current === 'object') {
      return { itemId, current: current as PlanItemRow, expected: version, patch }
    }
    return null
  }

  /** 冲突后「采用对方的版本」：文本与短字段都用服务端当前行覆盖 */
  acceptServerRow(conflict: PlanConflictInfo): void {
    const existing = this.itemSnapshots.get(conflict.itemId)
    // 409 的 current 是行级快照；补上 id/dayId 兜底，绝不把畸形行写进文档（会污染物化）
    const row: PlanItemRow = {
      ...(existing ?? conflict.current),
      ...conflict.current,
      id: conflict.itemId,
      dayId: existing?.dayId ?? conflict.current.dayId,
    }
    if (this.client) this.client.applyItemRow(row, { forceText: true })
    else this.itemSnapshots.set(row.id, row)
    this.scheduleRecompute()
  }

  /** 冲突后「保留我的」：用对方最新 version 重写一遍我的短字段 */
  async retryWithPatch(conflict: PlanConflictInfo): Promise<WriteResult> {
    try {
      const item = await this.patchRaw(conflict.itemId, conflict.patch as UpdateItemPatch, conflict.current.version)
      this.applyRow(item)
      return { ok: true, item }
    } catch (error) {
      const next = this.conflictInfoOf(error, conflict.itemId, conflict.patch as UpdateItemPatch, conflict.current.version)
      if (!next) throw error
      return { ok: false, conflict: next, error: '这条又被人改过了' }
    }
  }

  /** 本地先落（乐观更新），REST 成功后用服务端行校正；失败回滚 */
  private applyOptimisticRow(row: PlanItemRow): void {
    if (this.client) this.client.applyItemRow(row)
    else this.itemSnapshots.set(row.id, row)
    this.scheduleRecompute()
  }

  async toggleItem(itemId: number): Promise<PlanItemRow> {
    const current = this.itemSnapshots.get(itemId)
    if (!current) throw new PlanStoreError('这一块不存在，可能已被其他人删除', 404)
    const optimistic: PlanItemRow = {
      ...current,
      done: !current.done,
      doneBy: !current.done ? this.user.username : null,
    }
    this.applyOptimisticRow(optimistic)
    try {
      const json = await this.request<{ item: PlanItemRow }>(
        `/api/spaces/${this.spaceId}/plans/${this.planId}/items/${itemId}/toggle`,
        { method: 'POST', body: JSON.stringify({}) },
      )
      this.applyRow(json.item)
      return json.item
    } catch (error) {
      this.applyOptimisticRow(current)
      throw error
    }
  }

  async moveItem(itemId: number, dayId: number): Promise<void> {
    const current = this.itemSnapshots.get(itemId)
    if (!current) throw new PlanStoreError('这一块不存在，可能已被其他人删除', 404)
    // 乐观：先在文档里挪过去（跨天后立刻出现在目标天）
    if (this.client) this.client.applyItemMove(itemId, dayId, current.sortOrder)
    this.scheduleRecompute()
    try {
      const json = await this.request<{ item: PlanItemRow }>(
        `/api/spaces/${this.spaceId}/plans/${this.planId}/items/${itemId}/move`,
        { method: 'POST', body: JSON.stringify({ dayId }) },
      )
      if (this.client && json.item) {
        this.client.applyItemMove(itemId, json.item.dayId, json.item.sortOrder, json.item.version)
      } else if (json.item) {
        this.applyRow(json.item)
      }
      this.scheduleRecompute()
    } catch (error) {
      if (this.client) this.client.applyItemMove(itemId, current.dayId, current.sortOrder, current.version)
      else this.applyRow(current)
      throw error
    }
  }

  /** 外部的 plan 对象（如 SpacePlanComposer 保存后的响应）同步进 store */
  applyPlanRecord(plan: PlanRecord): void {
    this.plan = plan
    this.planSnapshot = plan
    this.emit('plan')
  }

  async deleteItem(itemId: number): Promise<void> {
    const current = this.itemSnapshots.get(itemId)
    if (!current) return
    await this.request(`/api/spaces/${this.spaceId}/plans/${this.planId}/items/${itemId}?version=${current.version}`, {
      method: 'DELETE',
    })
    if (this.client) this.client.removeItemRow(itemId)
    this.itemSnapshots.delete(itemId)
    this.scheduleRecompute()
  }

  /** 计划级字段（标题/日期/状态等）：走 PATCH，响应会带完整 plan */
  async patchPlan(payload: Record<string, unknown>): Promise<PlanRecord> {
    const json = await this.request<{ plan: PlanRecord }>(
      `/api/spaces/${this.spaceId}/plans/${this.planId}`,
      { method: 'PATCH', body: JSON.stringify(payload) },
    )
    this.plan = json.plan
    this.planSnapshot = json.plan
    this.emit('plan')
    return json.plan
  }

  /** 一键转成旅行记录（body { publish }，P3 完善后端；先按契约接） */
  async convert(publish: boolean): Promise<ConvertResult> {
    const json = await this.request<{
      travelId: number
      travelSlug: string | null
      alreadyConverted: boolean
      published?: boolean
      plan?: PlanRecord
    }>(`/api/spaces/${this.spaceId}/plans/${this.planId}/convert`, {
      method: 'POST',
      body: JSON.stringify({ publish }),
    })
    if (json.plan) {
      this.plan = json.plan
      this.planSnapshot = json.plan
      this.emit('plan')
    }
    return {
      travelId: json.travelId,
      travelSlug: json.travelSlug,
      alreadyConverted: json.alreadyConverted === true,
      published: json.published === true,
    }
  }

  /** 重新拉详情（用于「刷新一下」/冲突后对账），会重建本地快照 */
  async refresh(): Promise<void> {
    const json = await this.request<PlanDetailPayload>(
      `/api/spaces/${this.spaceId}/plans/${this.planId}`,
    )
    this.plan = json.plan
    this.planSnapshot = json.plan
    this.emit('plan')
    if (this.client) {
      this.client.seed(json.days, json.items, json.plan.planMeta)
    } else {
      this.daysSnapshot = [...json.days].sort((a, b) => a.sortOrder - b.sortOrder)
      for (const item of json.items) this.itemSnapshots.set(item.id, item)
    }
    this.rebuild()
  }

  destroy(): void {
    this.destroyed = true
    this.client?.destroy()
    this.client = null
    this.listeners.clear()
  }
}
