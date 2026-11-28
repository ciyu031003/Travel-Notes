import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { materializeDoc, summarizeDoc, toPlainValue } from '../lib/materialize.mjs';

function buildDoc() {
  const doc = new Y.Doc();
  const days = doc.getArray('days');
  const items = doc.getMap('items');
  const meta = doc.getMap('meta');

  const day1 = new Y.Map();
  day1.set('id', 'd1');
  day1.set('date', '2026-12-01');
  const day1Title = new Y.Text();
  day1Title.insert(0, '第一天·上海出发');
  day1.set('title', day1Title);
  day1.set('theme', '出发日');
  const day1Summary = new Y.Text();
  day1Summary.insert(0, '两个半小时的飞行');
  day1.set('summary', day1Summary);

  const day2 = new Y.Map();
  day2.set('id', 'd2');
  day2.set('date', '2026-12-02');
  day2.set('title', '第二天·胡同');
  day2.set('theme', null);

  const item1 = new Y.Map();
  item1.set('id', 'i1');
  item1.set('dayId', 'd1');
  item1.set('kind', 'transport');
  item1.set('title', new Y.Text('虹桥 → 首都机场'));
  item1.set('startAt', '2026-12-01T01:30:00.000Z');
  item1.set('endAt', null);
  item1.set('costCents', '88000'); // 客户端可能写成字符串
  item1.set('done', false);
  item1.set('sortOrder', 0);
  const media = new Y.Array();
  media.insert(0, [101, 102, 102, -1, '103']);
  item1.set('mediaIds', media);

  const item2 = new Y.Map();
  item2.set('id', 'i2');
  item2.set('dayId', 'd1');
  item2.set('kind', 'FOOD');
  item2.set('title', '午餐：小笼包');
  item2.set('note', new Y.Text('记得预订'));
  item2.set('place', '南翔馒头店');
  item2.set('done', true);
  item2.set('doneBy', 'alice');
  item2.set('sortOrder', 5);

  const item3 = new Y.Map();
  item3.set('id', 'i3');
  item3.set('dayId', 'd2');
  item3.set('kind', 'SPOT');
  item3.set('title', '南锣鼓巷');

  doc.transact(() => {
    days.push([day1, day2]);
    items.set('i1', item1);
    items.set('i2', item2);
    items.set('i3', item3);
    meta.set('departureCity', '上海');
    meta.set('transportMode', 'FLIGHT');
    meta.set('interests', new Y.Array());
  });
  return doc;
}

describe('materializeDoc', () => {
  it('空文档返回空数组而不是报错（兼容老计划）', () => {
    const doc = new Y.Doc();
    expect(materializeDoc(doc)).toEqual({ days: [], items: [], meta: {} });
    expect(summarizeDoc(doc)).toEqual({ days: 0, items: 0, metaKeys: 0 });
    doc.destroy();
  });

  it('Y.Text 转 string，day 顺序即 sortOrder', () => {
    const doc = buildDoc();
    const rows = materializeDoc(doc);
    expect(rows.days).toHaveLength(2);
    expect(rows.days[0]).toMatchObject({
      id: 'd1',
      date: '2026-12-01',
      title: '第一天·上海出发',
      theme: '出发日',
      summary: '两个半小时的飞行',
      sortOrder: 0,
    });
    expect(rows.days[1]).toMatchObject({ id: 'd2', title: '第二天·胡同', theme: null, sortOrder: 1 });
    doc.destroy();
  });

  it('items 按天顺序 + 天内 sortOrder 排序，字段归一化', () => {
    const doc = buildDoc();
    const rows = materializeDoc(doc);
    expect(rows.items.map((item) => item.id)).toEqual(['i1', 'i2', 'i3']);
    expect(rows.items[0]).toMatchObject({
      id: 'i1',
      dayId: 'd1',
      kind: 'TRANSPORT',
      title: '虹桥 → 首都机场',
      startAt: '2026-12-01T01:30:00.000Z',
      endAt: null,
      costCents: 88000,
      done: false,
      doneBy: null,
      sortOrder: 0,
      mediaIds: [101, 102, 103],
    });
    expect(rows.items[1]).toMatchObject({
      id: 'i2',
      kind: 'FOOD',
      title: '午餐：小笼包',
      note: '记得预订',
      place: '南翔馒头店',
      done: true,
      doneBy: 'alice',
      sortOrder: 5,
    });
    expect(rows.items[2]).toMatchObject({ id: 'i3', dayId: 'd2', sortOrder: 0, mediaIds: [] });
    doc.destroy();
  });

  it('meta 转普通对象（含嵌套 Y.Array）', () => {
    const doc = buildDoc();
    const rows = materializeDoc(doc);
    expect(rows.meta.departureCity).toBe('上海');
    expect(rows.meta.transportMode).toBe('FLIGHT');
    expect(rows.meta.interests).toEqual([]);
    expect(summarizeDoc(doc)).toMatchObject({ days: 2, items: 3 });
    doc.destroy();
  });

  it('缺 id 时兜底（day 用下标、item 用 map key）', () => {
    const doc = new Y.Doc();
    const day = new Y.Map();
    doc.getArray('days').push([day]);
    const item = new Y.Map();
    item.set('title', '无 id 的块');
    doc.getMap('items').set('key-9', item);
    const rows = materializeDoc(doc);
    expect(rows.days[0].id).toBe('day-0');
    expect(rows.items[0]).toMatchObject({ id: 'key-9', dayId: null, kind: 'SPOT', title: '无 id 的块' });
    doc.destroy();
  });

  it('toPlainValue 递归处理 Y 类型与普通对象', () => {
    const doc = new Y.Doc();
    const root = doc.getMap('root');
    const text = new Y.Text();
    root.set('text', text);
    text.insert(0, 'hi');
    expect(toPlainValue(text)).toBe('hi');
    expect(toPlainValue([text, { nested: text }])).toEqual(['hi', { nested: 'hi' }]);
    expect(toPlainValue(root)).toEqual({ text: 'hi' });
    doc.destroy();
  });
});
