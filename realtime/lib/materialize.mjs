/**
 * Y.Doc → 物化 JSON（P1a 内部端点 POST body 的 materialized 字段）。
 *
 * 文档结构（与客户端同一份，见 docs/plan-p1-collab-spec.md §2）：
 *   days : Y.Array<Y.Map>  { id, date, title, theme, summary }
 *   items: Y.Map<Y.Map>    key = itemId；字段含 mediaIds( Y.Array<number> )
 *   meta : Y.Map           { departureCity, ... }
 *
 * 同段文字双光标：title / note / place 是 Y.Text，这里统一转成普通 string 再回传。
 */
import * as Y from 'yjs';

const toFiniteInt = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

const toTrimmedStringOrNull = (value) => {
  if (value == null) return null;
  const s = String(value);
  return s.length === 0 ? null : s;
};

/**
 * 把 Yjs 值递归转成可 JSON 序列化的普通值。
 * Y.Text → string；Y.Array → array；Y.Map → object；其余原样返回。
 */
export function toPlainValue(value) {
  if (value == null) return value;
  if (value instanceof Y.Text) return value.toString();
  if (value instanceof Y.Array) return value.toArray().map(toPlainValue);
  if (value instanceof Y.Map) {
    const out = {};
    value.forEach((v, k) => {
      out[String(k)] = toPlainValue(v);
    });
    return out;
  }
  if (Array.isArray(value)) return value.map(toPlainValue);
  if (typeof value === 'object') {
    // 兼容客户端写入的普通对象（非 Y.Map），避免把 Y 类型之外的 object 丢成 "[object Object]"
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toPlainValue(v);
    return out;
  }
  return value;
}

const asPlainObject = (value) => {
  const plain = toPlainValue(value);
  return plain && typeof plain === 'object' && !Array.isArray(plain) ? plain : {};
};

const textOf = (value) => {
  if (value == null) return '';
  if (value instanceof Y.Text) return value.toString();
  if (typeof value === 'string') return value;
  const plain = toPlainValue(value);
  return plain == null ? '' : String(plain);
};

const asTextOrNull = (value) => {
  if (value == null) return null;
  const s = textOf(value);
  return s.length === 0 ? null : s;
};

const dateToString = (value) => {
  if (value == null) return null;
  if (typeof value === 'string') return value.length > 0 ? value : null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  return null;
};

const mediaIdsOf = (value) => {
  if (value == null) return [];
  const list = value instanceof Y.Array ? value.toArray() : Array.isArray(value) ? value : [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const n = toFiniteInt(toPlainValue(raw));
    if (n == null || n <= 0 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
};

/**
 * 物化整篇计划文档。
 * @param {import('yjs').Doc} doc
 * @returns {{ days: object[], items: object[], meta: Record<string, unknown> }}
 */
export function materializeDoc(doc) {
  const daysArray = doc.getArray('days');
  const itemsMap = doc.getMap('items');
  const metaMap = doc.getMap('meta');

  const days = [];
  daysArray.forEach((dayValue, index) => {
    const day = asPlainObject(dayValue);
    days.push({
      id: toTrimmedStringOrNull(day.id) ?? `day-${index}`,
      date: dateToString(day.date),
      title: asTextOrNull(day.title),
      theme: asTextOrNull(day.theme),
      summary: asTextOrNull(day.summary),
      // 数组顺序即展示顺序（契约 §2），sortOrder 由服务端按数组下标补齐
      sortOrder: index,
    });
  });

  const items = [];
  const perDayCounter = new Map();
  itemsMap.forEach((itemValue, key) => {
    const item = asPlainObject(itemValue);
    const id = toTrimmedStringOrNull(item.id) ?? String(key);
    const dayId = toTrimmedStringOrNull(item.dayId);
    const dayKey = dayId ?? '';
    const nextIndex = perDayCounter.get(dayKey) ?? 0;
    perDayCounter.set(dayKey, nextIndex + 1);

    const explicitOrder = toFiniteInt(item.sortOrder);
    items.push({
      id,
      dayId,
      kind: (toTrimmedStringOrNull(item.kind) ?? 'SPOT').toUpperCase(),
      startAt: dateToString(item.startAt),
      endAt: dateToString(item.endAt),
      title: textOf(item.title),
      place: asTextOrNull(item.place),
      costCents: toFiniteInt(item.costCents),
      note: asTextOrNull(item.note),
      done: item.done === true,
      doneBy: toTrimmedStringOrNull(item.doneBy),
      sortOrder: explicitOrder ?? nextIndex,
      mediaIds: mediaIdsOf(item.mediaIds),
    });
  });

  // 按「天顺序 + 天内 sortOrder」稳定排序，便于 P1a 直接落库
  const dayOrder = new Map(days.map((day, index) => [day.id, index]));
  items.sort((a, b) => {
    const da = dayOrder.has(a.dayId) ? dayOrder.get(a.dayId) : Number.MAX_SAFE_INTEGER;
    const db = dayOrder.has(b.dayId) ? dayOrder.get(b.dayId) : Number.MAX_SAFE_INTEGER;
    if (da !== db) return da - db;
    return a.sortOrder - b.sortOrder;
  });

  const meta = asPlainObject(metaMap);

  return { days, items, meta };
}

/** 轻量摘要，用于日志与 /rooms 调试端点，避免每次打全量 JSON。 */
export function summarizeDoc(doc) {
  const rows = materializeDoc(doc);
  return { days: rows.days.length, items: rows.items.length, metaKeys: Object.keys(rows.meta).length };
}
