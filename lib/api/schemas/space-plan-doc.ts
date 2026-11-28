/**
 * 内部 plan-doc 端点 schema（P1a，仅实时服务调用）。
 *
 * 契约见 docs/plan-p1-collab-spec.md §4 与 realtime 侧的约定：
 *   yjsState = base64(Y.encodeStateAsUpdate(doc))；materialized 的 id/dayId 是 Yjs 里的字符串；
 *   presence 是「当前在线快照」；source = debounce | disconnect。
 */
import { z } from 'zod'

const NullableTextSchema = (max: number) => z.string().max(max).nullable().optional()

export const MaterializedDaySchema = z.object({
  id: z.string().max(64).nullable().optional(),
  date: z.string().max(40).nullable().optional(),
  title: NullableTextSchema(120),
  theme: NullableTextSchema(60),
  summary: NullableTextSchema(5000),
})

export const MaterializedItemSchema = z.object({
  id: z.string().max(64).nullable().optional(),
  dayId: z.string().max(64).nullable().optional(),
  kind: z.string().max(20).nullable().optional(),
  startAt: z.string().max(40).nullable().optional(),
  endAt: z.string().max(40).nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  place: NullableTextSchema(200),
  costCents: z.coerce.number().int().min(0).max(1_000_000_000).nullable().optional(),
  note: NullableTextSchema(5000),
  done: z.boolean().nullable().optional(),
  doneBy: NullableTextSchema(255),
  sortOrder: z.coerce.number().int().min(0).max(999).nullable().optional(),
  mediaIds: z.array(z.coerce.number().int().positive()).max(50).nullable().optional(),
})

export const PlanPresenceSchema = z.object({
  userId: z.coerce.number().int().positive(),
  username: z.string().max(255),
  nickname: z.string().max(255).nullable().optional(),
  editingItemId: z.coerce.number().int().positive().nullable().optional(),
  cursor: z.coerce.number().int().min(0).nullable().optional(),
  clientId: z.string().max(64).nullable().optional(),
})

export const PlanDocSyncSchema = z.object({
  planId: z.coerce.number().int().positive().optional(),
  // base64 字符上限 6M（≈4.5MB 字节）；服务层再按 DOC_STATE_MAX_BYTES=4MB 卡原始字节
  yjsState: z.string().max(6_000_000).default(''),
  materialized: z.object({
    days: z.array(MaterializedDaySchema).max(60).optional(),
    items: z.array(MaterializedItemSchema).max(2000).optional(),
    meta: z.record(z.string(), z.unknown()).nullable().optional(),
  }),
  presence: z.array(PlanPresenceSchema).max(100).optional(),
  source: z.string().max(20).nullable().optional(),
  clientId: z.string().max(64).nullable().optional(),
  sentAt: z.string().max(40).nullable().optional(),
})
