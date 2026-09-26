/**
 * 本地 SQLite **行结构兼容**回归 —— 本项目最严重的一个历史缺陷。
 *
 * 事实（从插件源码确认，不是猜测）：
 *   · Android：`Database.selectSQL()` 用 `row.put(colName, value)` 构造 `JSObject`，
 *     所以 `query()` 返回的 `values` 是**按列名索引的对象数组**；
 *     插件 JS 层的 `reorderRows()` 只处理 iOS 的 `ios_columns`，Android 原样返回。
 *   · Web（jeep-sqlite）/测试：`values` 是**值数组**。
 *
 * 而 `toRows()` 原先写的是 `v.filter(r => Array.isArray(r))` —— 在 Android 上
 * **每一行都被过滤掉，所有本地查询静默返回空数组**。后果贯穿整条产品链路：
 *   · 本地兜底读不到 → 详情页「本机也没有它的离线副本」
 *   · 列表本地缓存为空 → 「没有用户自己建立的旅行记录」
 *   · **同步队列 list() 恒为空 → SyncEngine 认为无待上传项 → 用户创作永远上不了云**
 *     （线上库 Travel=0 的最终原因）
 *   · 列自省恒为 null → 自愈逻辑形同虚设
 *
 * 契约：两种行结构都必须被正确归一化；按列名取值不受对象键序影响。
 */
import { describe, it, expect } from 'vitest'
import { toRows, rowGet } from '@/lib/modules/offline/native/sqlite-db'

describe('toRows · Android（对象行）', () => {
  it('列名对象行必须被保留（曾经被整行丢弃 → 本地读全空）', () => {
    const res = {
      values: [
        { id: 'aaaa-1', title: '大理 5 天', slug: 'da-li', remoteId: 42 },
        { id: 'bbbb-2', title: '南京 3 天', slug: 'nan-jing', remoteId: null },
      ],
    }
    const rows = toRows(res)
    expect(rows).toHaveLength(2)
    expect(rowGet(rows[0], 'title')).toBe('大理 5 天')
    expect(rowGet(rows[1], 'slug')).toBe('nan-jing')
  })

  it('按列名取值**不受键序影响**（键序与 SELECT 列序不同也要取对）', () => {
    // 故意把键顺序打乱：名称 ↔ 值 的对应关系必须靠列名，而不是位置
    const res = { values: [{ slug: 'wrong-order', id: 'x', title: '标题' }] }
    const rows = toRows(res)
    expect(rowGet(rows[0], 'id')).toBe('x')
    expect(rowGet(rows[0], 'title')).toBe('标题')
    expect(rowGet(rows[0], 'slug')).toBe('wrong-order')
  })

  it('列名存在于对象但值为 null/0/空串时按列名返回原值（不能被下标回退搞错）', () => {
    const rows = toRows({ values: [{ remoteId: null, deleted: 0, note: '' }] })
    expect(rowGet(rows[0], 'remoteId')).toBeNull()
    expect(rowGet(rows[0], 'deleted')).toBe(0)
    expect(rowGet(rows[0], 'note')).toBe('')
  })

  it('聚合别名列（COUNT(*) AS c）按列名取得到', () => {
    const rows = toRows({ values: [{ c: 3 }] })
    expect(Number(rowGet(rows[0], 'c', 0))).toBe(3)
  })
})

describe('toRows · Web/旧实现（数组行）', () => {
  it('纯值数组行原样保留', () => {
    const rows = toRows({ values: [['a', 1], ['b', 2]] })
    expect(rows).toHaveLength(2)
    expect(rowGet(rows[0], 'anything', 0)).toBe('a')
    expect(rowGet(rows[1], 'anything', 1)).toBe(2)
  })

  it('带列名首行的数组结果会剔除首行，并挂上列名映射', () => {
    const rows = toRows({ values: [['id', 'title'], ['x1', '标题一']] })
    expect(rows).toHaveLength(1)
    expect(rowGet(rows[0], 'id')).toBe('x1')
    expect(rowGet(rows[0], 'title')).toBe('标题一')
  })

  it('空结果 / 缺 values 返回空数组', () => {
    expect(toRows({ values: [] })).toEqual([])
    expect(toRows({})).toEqual([])
    // @ts-expect-error 故意传坏值
    expect(toRows(undefined)).toEqual([])
  })
})

describe('rowGet 回退语义', () => {
  it('对象行没有该列名时回退到下标', () => {
    const rows = toRows({ values: [{ a: 'A', b: 'B' }] })
    expect(rowGet(rows[0], 'missing', 1)).toBe('B')
    expect(rowGet(rows[0], 'missing', 9)).toBeUndefined()
  })

  it('空行安全返回 undefined', () => {
    expect(rowGet(undefined, 'id')).toBeUndefined()
    expect(rowGet(null, 'id')).toBeUndefined()
  })
})
