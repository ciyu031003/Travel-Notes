/* ============================================================
   0. 基础工具与图标
   ============================================================ */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const app = $('#app');
const layerRoot = $('#layer-root');
const toastRoot = $('#toast-root');

const ICONS = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  compass: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/>',
  bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  'map-pin': '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  'book-open': '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  'chevron-left': '<polyline points="15 18 9 12 15 6"/>',
  'chevron-right': '<polyline points="9 18 15 12 9 6"/>',
  'chevron-down': '<polyline points="6 9 12 15 18 9"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  'arrow-right': '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  sparkles: '<path d="m12 3-1.9 5.1L5 10l5.1 1.9L12 17l1.9-5.1L19 10l-5.1-1.9z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 17h4"/><path d="M17 3h4"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
  'cloud-off': '<path d="M22.61 16.95A5 5 0 0 0 18 10h-1.26a8 8 0 0 0-7.05-6M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3"/><line x1="1" y1="1" x2="23" y2="23"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  award: '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
  'trending-up': '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  'map': '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>',
  'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  'bar-chart': '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
  'align-left': '<line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/>',
  'more-horizontal': '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  'user-plus': '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>',
  'user-minus': '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/>'
};
function icon(name, cls = 'w-5 h-5', filled = false) {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.info}</svg>`;
}
const esc = (value = '') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => Number(n || 0).toLocaleString('zh-CN');
const todayText = () => '11月15日 · 周日';

/* ============================================================
   1. Mock 数据（只用于前端演示，无后端依赖）
   ============================================================ */
const IMG = {
  road: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=900&q=80&auto=format&fit=crop',
  sea: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=900&q=80&auto=format&fit=crop',
  boat: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=900&q=80&auto=format&fit=crop',
  lake: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=900&q=80&auto=format&fit=crop',
  van: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=900&q=80&auto=format&fit=crop',
  bay: 'https://images.unsplash.com/photo-1528127269322-539801943592?w=900&q=80&auto=format&fit=crop',
  town: 'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?w=900&q=80&auto=format&fit=crop',
  hike: 'https://images.unsplash.com/photo-1526772662000-3f88f10405ff?w=900&q=80&auto=format&fit=crop',
  dusk: 'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?w=900&q=80&auto=format&fit=crop',
  balloon: 'https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=900&q=80&auto=format&fit=crop'
};

const DB = {
  user: {
    id: 1, name: '林屿', handle: 'linyu', accountId: 'TN-2609',
    bio: '把走过的路，变成值得记住的故事。',
    avatar: IMG.balloon, cover: IMG.lake,
    stats: { trips: 12, places: 28, photos: 486, days: 46, favorites: 18 }
  },
  trips: [
    {
      id: 1, title: '大理的风，吹了五天', location: '云南 · 大理',
      startDate: '2026-10-02', endDate: '2026-10-06', status: 'active', type: 'COUPLE',
      companion: '和阿澈', cover: IMG.road, photos: 36, days: 5,
      budget: 5000, spent: 2860, spaceId: 1, province: '云南', city: '大理',
      description: '没有把行程排满。早起看苍山，傍晚去洱海边等风，晚上在古城吃一碗热米线。',
      itinerary: [
        { date: '10-02', week: '周五', label: '10.02', title: '抵达古城，慢慢安顿', items: [
          { time: '14:20', type: 'plane', title: '抵达大理站', place: '大理站', note: '预约了接站，车程约 40 分钟', expense: 120 },
          { time: '17:30', type: 'map-pin', title: '入住古城民宿', place: '人民路附近', note: '放下行李，去巷子里散步', expense: 580 }
        ]},
        { date: '10-03', week: '周六', label: '10.03', title: '环洱海西岸', items: [
          { time: '09:00', type: 'camera', title: '龙龛码头看晨雾', place: '洱海生态廊道', note: '风大，记得带外套', expense: 0 },
          { time: '14:00', type: 'route', title: '骑行走廊道', place: '才村 → 喜洲', note: '租了两辆自行车', expense: 80 }
        ]},
        { date: '10-04', week: '周日', label: '10.04', title: '喜洲与海舌公园', items: [
          { time: '10:00', type: 'map-pin', title: '喜洲古镇', place: '喜洲', note: '吃了喜洲粑粑', expense: 46 },
          { time: '16:30', type: 'camera', title: '海舌公园日落', place: '海舌生态公园', note: '当天最满意的一组照片', expense: 0 }
        ]},
        { date: '10-05', week: '周一', label: '10.05', title: '苍山脚下的一天', items: [
          { time: '09:30', type: 'hike', title: '寂照庵', place: '苍山', note: '在山里吃了一顿素斋', expense: 60 }
        ]},
        { date: '10-06', week: '周二', label: '10.06', title: '回程前再去一次海边', items: [
          { time: '08:30', type: 'camera', title: '才村晨光', place: '才村码头', note: '把没说完的话留在风里', expense: 0 }
        ]}
      ],
      memories: [
        { id: 1, day: '10.03', title: '风把头发吹乱了', content: '在洱海边坐了很久。阿澈说，旅行最好的部分就是不赶时间。', mood: '平静', photos: [IMG.boat, IMG.sea], visibility: '公开' },
        { id: 2, day: '10.04', title: '喜洲的傍晚', content: '巷子里的光很软，买了一块刚出炉的粑粑。', mood: '幸福', photos: [IMG.town], visibility: '同行者' }
      ],
      expenses: [
        { id: 1, category: '交通', title: '高铁往返', amount: 860, date: '10.02', payer: '我' },
        { id: 2, category: '住宿', title: '古城民宿 4 晚', amount: 1160, date: '10.02', payer: '阿澈' },
        { id: 3, category: '餐饮', title: '古城与喜洲', amount: 420, date: '10.04', payer: '我' },
        { id: 4, category: '体验', title: '自行车与门票', amount: 240, date: '10.03', payer: '我' },
        { id: 5, category: '其他', title: '零碎支出', amount: 180, date: '10.05', payer: '阿澈' }
      ]
    },
    {
      id: 2, title: '泉州，半城烟火半城仙', location: '福建 · 泉州',
      startDate: '2026-05-01', endDate: '2026-05-04', status: 'done', type: 'FRIENDS',
      companion: '和大学同学', cover: IMG.town, photos: 42, days: 4,
      budget: 3200, spent: 2980, spaceId: null, province: '福建', city: '泉州',
      description: '走了很多巷子，也吃了很多顿。',
      itinerary: [{ date: '05-01', week: '周五', label: '05.01', title: '西街与开元寺', items: [{ time: '10:00', type: 'map-pin', title: '开元寺', place: '西街', note: '', expense: 0 }] }],
      memories: [{ id: 3, day: '05.02', title: '巷子里的南音', content: '路过一间小店，听完了半首南音。', mood: '惊喜', photos: [IMG.town], visibility: '公开' }],
      expenses: [{ id: 6, category: '交通', title: '动车', amount: 520, date: '05.01', payer: '我' }]
    },
    {
      id: 3, title: '在阿勒泰等一场雪', location: '新疆 · 阿勒泰',
      startDate: '2025-12-20', endDate: '2025-12-26', status: 'done', type: 'ALONE',
      companion: '独自出发', cover: IMG.lake, photos: 58, days: 7,
      budget: 7600, spent: 7120, spaceId: null, province: '新疆', city: '阿勒泰',
      description: '一个人去看雪，也一个人吃了很多顿热汤面。',
      itinerary: [{ date: '12-21', week: '周日', label: '12.21', title: '抵达禾木', items: [{ time: '13:00', type: 'map-pin', title: '禾木村', place: '禾木', note: '雪很深', expense: 0 }] }],
      memories: [{ id: 4, day: '12.22', title: '雪落在木屋上', content: '安静得只能听见脚踩雪地的声音。', mood: '平静', photos: [IMG.lake], visibility: '公开' }],
      expenses: [{ id: 7, category: '交通', title: '机票', amount: 2380, date: '12.20', payer: '我' }]
    }
  ],
  albums: [
    { id: 1, title: '大理 · 苍山洱海', date: '2026.10', photos: 36, cover: IMG.road, locked: false, type: '情侣', tripId: 1 },
    { id: 2, title: '我们的纪念日', date: '2023.06.20', photos: 18, cover: IMG.sea, locked: true, type: '情侣', tripId: null },
    { id: 3, title: '泉州 · 古城慢走', date: '2026.05', photos: 42, cover: IMG.town, locked: false, type: '朋友', tripId: 2 },
    { id: 4, title: '阿勒泰的冬天', date: '2025.12', photos: 58, cover: IMG.lake, locked: false, type: '独旅', tripId: 3 }
  ],
  posts: [
    {
      id: 1, author: { name: '阿澈', handle: 'ache', avatar: IMG.balloon },
      title: '在洱海边等一场日落', location: '云南 · 大理', dateRange: '10月2日 – 10月6日',
      days: 5, photos: 36, cover: IMG.sea, type: 'COUPLE', time: '2 小时前',
      summary: '把行程删掉一半以后，才真正看见大理。风、云、湖面，还有不赶时间的我们。',
      likes: 128, comments: 23, favorites: 41, liked: false, saved: true,
      chapters: [
        { date: '10.02', title: '抵达古城', text: '没有安排景点，先去吃了一碗热米线。', photos: [IMG.road, IMG.town] },
        { date: '10.03', title: '环洱海西岸', text: '骑到风最大的地方，停下来看了很久。', photos: [IMG.boat, IMG.sea, IMG.lake] }
      ]
    },
    {
      id: 2, author: { name: '林屿', handle: 'linyu', avatar: IMG.balloon },
      title: '泉州，半城烟火半城仙', location: '福建 · 泉州', dateRange: '5月1日 – 5月4日',
      days: 4, photos: 42, cover: IMG.town, type: 'FRIENDS', time: '昨天',
      summary: '从西街走到海边，在巷子里听完半首南音。',
      likes: 86, comments: 12, favorites: 19, liked: true, saved: false,
      chapters: [{ date: '05.01', title: '西街', text: '人多，但巷子一转就安静了。', photos: [IMG.town, IMG.road] }]
    },
    {
      id: 3, author: { name: '南枝', handle: 'nanzhi', avatar: IMG.dusk },
      title: '一个人去阿勒泰看雪', location: '新疆 · 阿勒泰', dateRange: '12月20日 – 12月26日',
      days: 7, photos: 58, cover: IMG.lake, type: 'ALONE', time: '3 天前',
      summary: '雪落下来的时候，世界突然变得很轻。',
      likes: 203, comments: 31, favorites: 76, liked: false, saved: false,
      chapters: [{ date: '12.21', title: '禾木', text: '木屋、炊烟、雪地，像走进一张旧明信片。', photos: [IMG.lake, IMG.dusk] }]
    }
  ],
  comments: {
    1: [
      { id: 1, user: '南枝', avatar: IMG.dusk, text: '这张日落的颜色太好了，像电影。', time: '1 小时前', likes: 4, liked: false },
      { id: 2, user: '阿澈', avatar: IMG.balloon, text: '下次还想再去一次。', time: '40 分钟前', likes: 2, liked: false }
    ],
    2: [{ id: 3, user: '小满', avatar: IMG.town, text: '泉州真的适合慢慢走。', time: '昨天', likes: 1, liked: false }],
    3: [{ id: 4, user: '林屿', avatar: IMG.balloon, text: '一个人也很浪漫。', time: '2 天前', likes: 7, liked: false }]
  },
  spaces: [
    { id: 1, name: '山与海之间', type: 'COUPLE', typeLabel: '情侣空间', role: 'OWNER', members: 2, travels: 4, albums: 3, memories: 32, photos: 186, cover: IMG.road, desc: '两个人一起更新的旅行清单。', memberList: [{ name: '林屿', role: '主人', avatar: IMG.balloon }, { name: '阿澈', role: '成员', avatar: IMG.balloon }], activity: [{ user: '阿澈', text: '更新了大理行程', time: '今天 14:20' }, { user: '林屿', text: '上传了 12 张照片', time: '昨天 21:08' }] },
    { id: 2, name: '周末出发小分队', type: 'FRIENDS', typeLabel: '朋友空间', role: 'MEMBER', members: 5, travels: 2, albums: 2, memories: 18, photos: 94, cover: IMG.van, desc: '每个周五晚上决定去哪里。', memberList: [{ name: '小满', role: '主人', avatar: IMG.town }, { name: '林屿', role: '成员', avatar: IMG.balloon }], activity: [{ user: '小满', text: '创建了泉州相册', time: '3 天前' }] }
  ],
  moments: [
    { id: 1, text: '回程的高铁上，把这次旅行的照片整理完了。最喜欢的是风把头发吹乱的那张。', time: '昨天 21:20', mood: '平静' },
    { id: 2, text: '计划下一次去海边。只订一张票，不订返程。', time: '11月10日', mood: '期待' }
  ],
  notifications: [
    { id: 1, user: '阿澈', text: '赞了你的旅行「泉州，半城烟火半城仙」', time: '10 分钟前', unread: true, avatar: IMG.balloon },
    { id: 2, user: '南枝', text: '评论了你的旅行：这张日落的颜色太好了', time: '1 小时前', unread: true, avatar: IMG.dusk },
    { id: 3, user: '小满', text: '关注了你', time: '昨天', unread: false, avatar: IMG.town },
    { id: 4, user: '系统', text: '你的旅行画册已生成，可以翻开看看', time: '2 天前', unread: false, avatar: IMG.town }
  ],
  anniversaries: [
    { id: 1, title: '第一次一起旅行', date: '2023-06-20', days: 17, recurring: true },
    { id: 2, title: '阿澈的生日', date: '2026-12-08', days: 23, recurring: false }
  ],
  preferences: { companion: 'COUPLE', delights: ['日出日落', '当地小店'], cautions: ['怕晒', '不吃香菜'] }
};

const TYPE_LABEL = { ALONE: '独旅', COUPLE: '情侣', FAMILY: '家庭', FRIENDS: '朋友', BFF: '闺蜜 / 兄弟', GROUP: '结伴', OTHER: '其他' };
const CATEGORY_LABEL = { 交通: '交通', 住宿: '住宿', 餐饮: '餐饮', 体验: '体验', 购物: '购物', 其他: '其他' };

let state = {
  route: 'home',
  params: {},
  loggedIn: true,
  theme: 'light',
  journeyFilter: 'all',
  journeyTab: 'all',
  tripTab: 'overview',
  albumMode: 'book',
  albumFilter: '全部',
  circleTab: 'recommended',
  circleFilter: '全部',
  spaceTab: 'content',
  searchQuery: '',
  unlockedAlbums: new Set(),
  syncing: false,
  selectedDay: 'all'
};

/* ============================================================
   2. 路由与通用 UI
   ============================================================ */
function parseRoute() {
  const raw = (location.hash || '#/home').replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(queryPart));
  const key = parts[0] || 'home';
  if (key === 'trip' && parts[1]) params.id = Number(parts[1]);
  if (key === 'post' && parts[1]) params.id = Number(parts[1]);
  if (key === 'space' && parts[1]) params.id = Number(parts[1]);
  if (key === 'album' && parts[1]) params.id = Number(parts[1]);
  if (key === 'user' && parts[1]) params.id = Number(parts[1]);
  state.route = key;
  state.params = params;
  if (params.tab && ['overview','itinerary','album','expense'].includes(params.tab)) state.tripTab = params.tab;
  if (params.mode && ['book','gallery','star'].includes(params.mode)) state.albumMode = params.mode;
  return { key, params };
}
function go(path) {
  location.hash = path.startsWith('#') ? path : '#/' + path.replace(/^\//, '');
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function back(fallback = 'home') {
  if (history.length > 1) history.back();
  else go(fallback);
}
function showTabbar(route) {
  return ['home', 'journeys', 'circle', 'me'].includes(route);
}
function activeTab(route) {
  if (route === 'home') return 'home';
  if (['journeys','trip','albums','album','timeline','moments','dashboard','search'].includes(route)) return 'journeys';
  if (['circle','post','user'].includes(route)) return 'circle';
  if (['me','spaces','space','settings','notifications','favorites','sync'].includes(route)) return 'me';
  return 'home';
}

const img = (src, alt = '', cls = 'img-cover') =>
  `<img src="${src}" alt="${esc(alt)}" class="${cls}" loading="lazy" decoding="async" onerror="this.style.display='none';this.parentElement.classList.add('img-fallback')">`;

const avatar = (src, size = 40, cls = '') =>
  `<span class="avatar ${cls}" style="width:${size}px;height:${size}px">${img(src, '', 'img-cover')}</span>`;

function statusPill(status) {
  return status === 'active'
    ? `<span class="pill pill-accent">进行中</span>`
    : `<span class="pill pill-primary">已归档</span>`;
}
function tripTypeLabel(type) { return TYPE_LABEL[type] || '旅行'; }

function emptyState(iconName, title, desc, action = '') {
  return `<div class="empty">
    <div class="empty-icon">${icon(iconName, 'w-7 h-7')}</div>
    <p class="empty-title">${esc(title)}</p>
    <p class="empty-desc">${esc(desc)}</p>
    ${action ? `<div class="mt-4">${action}</div>` : ''}
  </div>`;
}

function pageHeader(title, { backTo = '', right = '', subtitle = '' } = {}) {
  return `<header class="topbar">
    <div class="navbar">
      <div class="navbar-side">${backTo ? `<button class="icon-btn" data-action="back" data-fallback="${backTo}" aria-label="返回">${icon('chevron-left', 'w-6 h-6')}</button>` : ''}</div>
      <div class="navbar-title">${esc(title)}</div>
      <div class="navbar-side">${right}</div>
    </div>
    ${subtitle ? `<p class="px-5 pb-3 -mt-1 text-[11px] faint">${esc(subtitle)}</p>` : ''}
  </header>`;
}

function tabbar(active) {
  const items = [
    { key: 'home', label: '首页', icon: 'home', path: 'home' },
    { key: 'journeys', label: '旅程', icon: 'route', path: 'journeys' }
  ];
  const rightItems = [
    { key: 'circle', label: '旅行圈', icon: 'compass', path: 'circle' },
    { key: 'me', label: '我的', icon: 'user', path: 'me' }
  ];
  return `<nav class="tabbar" aria-label="主导航">
    <div class="tab-grid">
      ${items.map(it => `<button class="tab-item ${active === it.key ? 'active' : ''}" data-go="${it.path}">
        ${icon(it.icon, 'w-[21px] h-[21px]')}<span>${it.label}</span>
      </button>`).join('')}
      <button class="tab-fab-wrap" data-action="open-record" aria-label="记录">
        <span class="tab-fab">${icon('plus', 'w-6 h-6')}</span><span>记录</span>
      </button>
      ${rightItems.map(it => `<button class="tab-item ${active === it.key ? 'active' : ''}" data-go="${it.path}">
        ${icon(it.icon, 'w-[21px] h-[21px]')}<span>${it.label}</span>
      </button>`).join('')}
    </div>
  </nav>`;
}

function toast(message, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  toastRoot.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 240); }, 1900);
}

function openSheet(title, body, { footer = '', wide = false } = {}) {
  layerRoot.innerHTML = `<div class="sheet-mask" data-close-layer></div>
    <section class="sheet-panel ${wide ? 'sm:max-w-[430px]' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grip"></div>
      <button class="icon-btn sheet-close" data-close-layer aria-label="关闭">${icon('x', 'w-5 h-5')}</button>
      <h2 class="sheet-title">${esc(title)}</h2>
      <div class="mt-4">${body}</div>
      ${footer ? `<div class="mt-4">${footer}</div>` : ''}
    </section>`;
}
function closeLayer() { layerRoot.innerHTML = ''; }

function openDialog({ title, message, confirmText = '确定', destructive = false, onConfirm }) {
  layerRoot.innerHTML = `<div class="modal-mask" data-close-layer></div>
    <section class="modal-panel" role="dialog" aria-modal="true">
      <h3 class="text-[17px] font-bold">${esc(title)}</h3>
      <p class="text-[13px] leading-6 muted mt-2">${esc(message)}</p>
      <div class="flex gap-2 mt-5">
        <button class="btn btn-outline flex-1" data-close-layer>取消</button>
        <button class="btn ${destructive ? 'btn-danger' : 'btn-primary'} flex-1" id="dialog-confirm">${esc(confirmText)}</button>
      </div>
    </section>`;
  $('#dialog-confirm').onclick = () => { closeLayer(); onConfirm?.(); };
}

function openActionSheet(title, items) {
  openSheet(title, `<div class="space-y-1">${items.map(it => `
    <button class="action-row ${it.danger ? 'danger' : ''}" data-action-sheet-item="${esc(it.key)}">
      <span class="action-icon">${icon(it.icon || 'chevron-right', 'w-5 h-5')}</span>
      <span class="min-w-0 flex-1"><span class="block text-[15px] font-semibold">${esc(it.label)}</span>${it.hint ? `<span class="block text-[11px] faint mt-0.5">${esc(it.hint)}</span>` : ''}</span>
    </button>`).join('')}</div>`);
  layerRoot.querySelectorAll('[data-action-sheet-item]').forEach(btn => {
    btn.onclick = () => {
      const item = items.find(x => x.key === btn.dataset.actionSheetItem);
      closeLayer();
      item?.onClick?.();
    };
  });
}

function openPhoto(src, title = '照片') {
  layerRoot.innerHTML = `<div class="modal-mask" data-close-layer style="background:rgba(2,10,8,.94)"></div>
    <div class="fixed inset-0 z-[82] flex flex-col" role="dialog" aria-modal="true">
      <div class="safe-top px-3 flex items-center justify-between text-white">
        <button class="icon-btn !text-white" data-close-layer>${icon('x', 'w-6 h-6')}</button>
        <span class="text-sm font-semibold">${esc(title)}</span>
        <button class="icon-btn !text-white" data-action="photo-comment">${icon('message', 'w-5 h-5')}</button>
      </div>
      <div class="flex-1 flex items-center justify-center px-3 py-6"><img src="${src}" alt="${esc(title)}" class="max-h-full max-w-full object-contain rounded-xl"></div>
      <div class="px-5 pb-[calc(24px+var(--safe-bottom))] text-center text-white/65 text-[11px]">点击右上角留言 · 留言仅与当前照片绑定</div>
    </div>`;
}

function postCard(post, hero = false) {
  return `<article class="post-card ${hero ? 'rise' : ''}">
    <button class="post-cover block w-full text-left" data-go="post/${post.id}">
      ${img(post.cover, post.title)}
      <span class="absolute left-3 top-3 z-[2] pill" style="background:rgba(255,255,255,.88);color:#142521">${tripTypeLabel(post.type)}</span>
      <span class="absolute right-3 top-3 z-[2] pill" style="background:rgba(5,20,17,.42);color:#fff">${post.days} 天 · ${post.photos} 张</span>
      <div class="absolute inset-x-0 bottom-0 z-[2] p-4 text-white">
        <p class="text-[11px] text-white/75">${esc(post.location)} · ${esc(post.dateRange)}</p>
        <h3 class="text-[19px] font-bold leading-snug mt-1 line-2">${esc(post.title)}</h3>
      </div>
    </button>
    <div class="post-head">
      ${avatar(post.author.avatar, 30)}
      <div class="min-w-0 flex-1"><p class="text-[12px] font-semibold">${esc(post.author.name)}</p><p class="text-[10px] faint">${esc(post.time)}</p></div>
      <span class="text-[10px] faint">${esc(post.location)}</span>
    </div>
    <div class="post-body"><p class="text-[12px] leading-5 muted line-2">${esc(post.summary)}</p></div>
    <div class="post-actions">
      <button class="action-pill ${post.liked ? 'on' : ''}" data-action="like" data-id="${post.id}">${icon('heart', 'w-[18px] h-[18px]', post.liked)}<span data-like-count="${post.id}">${post.likes}</span></button>
      <button class="action-pill" data-action="comments" data-id="${post.id}">${icon('message', 'w-[18px] h-[18px]')}<span data-comment-count="${post.id}">${post.comments}</span></button>
      <button class="action-pill ${post.saved ? 'saved' : ''}" data-action="save" data-id="${post.id}">${icon('bookmark', 'w-[18px] h-[18px]', post.saved)}<span data-save-count="${post.id}">${post.favorites}</span></button>
      <button class="action-pill ml-auto" data-action="share" data-id="${post.id}">${icon('share', 'w-[18px] h-[18px]')}</button>
    </div>
  </article>`;
}

function tripCard(trip) {
  return `<article class="card overflow-hidden">
    <button class="flex gap-3 p-3 w-full text-left" data-go="trip/${trip.id}">
      <span class="relative w-[96px] h-[102px] rounded-[14px] overflow-hidden flex-none">${img(trip.cover, trip.title)}</span>
      <span class="min-w-0 flex-1 py-1">
        <span class="flex items-center gap-2">${statusPill(trip.status)}<span class="text-[10px] faint">${esc(trip.companion)}</span></span>
        <span class="block text-[16px] font-bold mt-2 leading-snug line-1">${esc(trip.title)}</span>
        <span class="block text-[11px] faint mt-1">${esc(trip.location)} · ${trip.days} 天 · ${trip.photos} 张照片</span>
        ${trip.status === 'active' ? `<span class="block mt-2.5"><span class="progress-soft"><i style="width:${Math.round(trip.spent / trip.budget * 100)}%"></i></span></span>` : ''}
        <span class="block text-[10px] ${trip.status === 'active' ? 'text-[var(--primary-strong)]' : 'faint'} mt-1.5">${trip.status === 'active' ? '继续记录这趟旅程' : '打开旅行档案'} ${icon('chevron-right', 'inline w-3 h-3')}</span>
      </span>
    </button>
    ${trip.status === 'active' ? `<div class="flex gap-2 px-3 pb-3">
      <button class="btn btn-sm btn-secondary flex-1" data-action="quick-memory" data-id="${trip.id}">${icon('edit', 'w-4 h-4')}记一笔</button>
      <button class="btn btn-sm btn-outline flex-1" data-action="quick-photo" data-id="${trip.id}">${icon('camera', 'w-4 h-4')}传照片</button>
    </div>` : ''}
  </article>`;
}

/* ============================================================
   3. 首页
   ============================================================ */
function viewHome() {
  const active = DB.trips.find(t => t.status === 'active');
  const done = DB.trips.filter(t => t.status === 'done');
  return `<div class="screen">
    <header class="px-5 safe-top pb-4 flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <p class="eyebrow">${todayText()}</p>
        <h1 class="text-[26px] font-bold tracking-[-.03em] mt-1">下午好，${esc(DB.user.name)}</h1>
        <p class="text-[12px] faint mt-1">下一段旅程，想从哪里开始？</p>
      </div>
      <button class="icon-btn soft" data-go="search" aria-label="搜索">${icon('search', 'w-5 h-5')}</button>
      <button class="relative" data-go="notifications" aria-label="通知">
        ${avatar(DB.user.avatar, 40)}
        ${DB.notifications.some(n => n.unread) ? '<span class="absolute right-0 top-0 w-2.5 h-2.5 rounded-full bg-[var(--danger)] ring-2 ring-[var(--bg)]"></span>' : ''}
      </button>
    </header>

    <main class="px-5 pb-8 space-y-6">
      ${active ? `<section class="hero-card rise">
        <div class="hero-img h-[292px]">
          ${img(active.cover, active.title)}
          <div class="hero-shade"></div>
          <div class="absolute inset-x-0 top-0 p-4 flex items-center justify-between">
            <span class="pill" style="background:rgba(255,255,255,.9);color:#142521">${icon('sparkles', 'w-3.5 h-3.5')} 进行中 · 第 3 天</span>
            <button class="icon-btn !text-white" style="background:rgba(5,20,17,.28);backdrop-filter:blur(8px)" data-go="trip/${active.id}" aria-label="打开旅程">${icon('arrow-right', 'w-5 h-5')}</button>
          </div>
          <div class="absolute inset-x-0 bottom-0 p-5 text-white">
            <p class="text-[11px] text-white/75">${esc(active.location)} · ${esc(active.companion)}</p>
            <h2 class="text-[26px] font-bold leading-tight mt-1">${esc(active.title)}</h2>
            <div class="flex items-center justify-between text-[11px] text-white/75 mt-3 mb-1.5">
              <span>旅程进度</span><span>${active.days} 天 · 已记录 ${active.memories.length + active.itinerary.length} 项</span>
            </div>
            <div class="progress"><i style="width:64%"></i></div>
            <div class="grid grid-cols-2 gap-2 mt-4">
              <button class="btn btn-lg" style="background:#fff;color:#0b5f59" data-action="quick-memory" data-id="${active.id}">${icon('edit', 'w-4 h-4')}继续记录</button>
              <button class="btn btn-lg" style="background:rgba(255,255,255,.16);color:#fff;border:1px solid rgba(255,255,255,.35)" data-go="trip/${active.id}?tab=itinerary">${icon('calendar', 'w-4 h-4')}查看行程</button>
            </div>
          </div>
        </div>
      </section>` : ''}

      <section>
        <div class="grid grid-cols-4 gap-2">
          ${[
            { icon: 'edit', label: '记一笔', action: 'open-record-memory' },
            { icon: 'camera', label: '传照片', action: 'open-record-photo' },
            { icon: 'wallet', label: '记花费', action: 'open-record-expense' },
            { icon: 'plane', label: '新旅程', action: 'new-trip' }
          ].map(it => `<button class="card flex flex-col items-center gap-2 py-3 active:scale-[.98] transition" data-action="${it.action}">
            <span class="w-10 h-10 rounded-[13px] flex items-center justify-center" style="background:var(--primary-soft);color:var(--primary-strong)">${icon(it.icon, 'w-5 h-5')}</span>
            <span class="text-[11px] font-semibold">${it.label}</span>
          </button>`).join('')}
        </div>
      </section>

      <section class="card p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="eyebrow">TRAVEL FOOTPRINT</p>
            <h2 class="section-title mt-1">我的旅行足迹</h2>
          </div>
          <button class="section-link" data-go="journeys">${icon('map', 'w-3.5 h-3.5')}看地图</button>
        </div>
        <div class="grid grid-cols-3 gap-2 mt-4">
          <div class="text-center"><b class="text-[22px] tnum">8</b><span class="block text-[10px] faint mt-0.5">点亮省份</span></div>
          <div class="text-center border-x border-[var(--line)]"><b class="text-[22px] tnum">28</b><span class="block text-[10px] faint mt-0.5">走过城市</span></div>
          <div class="text-center"><b class="text-[22px] tnum">46</b><span class="block text-[10px] faint mt-0.5">在路上 · 天</span></div>
        </div>
        <div class="map-card mt-4" data-go="journeys">
          <div class="absolute inset-0 opacity-70" style="background-image:radial-gradient(circle,color-mix(in srgb,var(--primary) 18%,transparent) 1px,transparent 1px);background-size:14px 14px"></div>
          <div class="map-route" style="left:22%;top:30%;width:42%;height:36%"></div>
          <div class="map-route" style="left:46%;top:18%;width:30%;height:58%;transform:rotate(18deg)"></div>
          <span class="map-dot" style="left:24%;top:48%"></span><span class="map-dot big" style="left:39%;top:36%"></span>
          <span class="map-dot" style="left:58%;top:28%"></span><span class="map-dot" style="left:68%;top:57%"></span>
          <div class="absolute left-4 bottom-3 z-[2]">
            <p class="text-[12px] font-semibold">云南 · 福建 · 新疆</p>
            <p class="text-[10px] faint mt-0.5">最近点亮：大理</p>
          </div>
          <span class="absolute right-4 bottom-3 z-[2] text-[11px] font-semibold text-[var(--primary-strong)]">查看全部 ${icon('chevron-right', 'inline w-3 h-3')}</span>
        </div>
      </section>

      <section class="flex gap-3">
        <div class="card p-4 flex-1">
          <div class="flex items-center gap-2 text-[var(--primary-strong)]">${icon('calendar', 'w-4 h-4')}<span class="text-[11px] font-bold">重要日子</span></div>
          <p class="text-[14px] font-semibold mt-3">第一次一起旅行</p>
          <div class="flex items-end gap-1 mt-2"><b class="text-[28px] leading-none tnum">${DB.anniversaries[0].days}</b><span class="text-[11px] faint mb-0.5">天后</span></div>
          <p class="text-[10px] faint mt-1">2023.06.20 · 每年纪念</p>
        </div>
        <button class="card p-4 flex-1 text-left" data-go="spaces">
          <div class="flex items-center gap-2 text-[var(--primary-strong)]">${icon('users', 'w-4 h-4')}<span class="text-[11px] font-bold">空间动态</span></div>
          <p class="text-[14px] font-semibold mt-3 line-1">山与海之间</p>
          <p class="text-[11px] faint mt-1 leading-5 line-2">阿澈更新了大理行程 · 2 人共同记录</p>
          <span class="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--primary-strong)] mt-2">去看看 ${icon('arrow-right', 'w-3 h-3')}</span>
        </button>
      </section>

      <section>
        <div class="section-head">
          <h2 class="section-title">最近旅程</h2>
          <button class="section-link" data-go="journeys">全部 ${icon('arrow-right', 'w-3.5 h-3.5')}</button>
        </div>
        <div class="flex gap-3 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
          ${done.map(trip => `<button class="w-[236px] flex-none text-left" data-go="trip/${trip.id}">
            <div class="relative h-[148px] rounded-[18px] overflow-hidden">${img(trip.cover, trip.title)}
              <div class="absolute inset-0" style="background:linear-gradient(to top,rgba(5,20,17,.72),transparent 60%)"></div>
              <div class="absolute inset-x-0 bottom-0 p-3.5 text-white"><p class="text-[10px] text-white/70">${esc(trip.location)}</p><p class="text-[15px] font-bold mt-0.5 line-1">${esc(trip.title)}</p></div>
            </div>
          </button>`).join('')}
          <button class="w-[150px] flex-none rounded-[18px] border border-dashed border-[var(--line-strong)] flex flex-col items-center justify-center text-[var(--text-3)]" data-go="new-trip">
            ${icon('plus', 'w-6 h-6')}<span class="text-[11px] font-semibold mt-2">记录新旅程</span>
          </button>
        </div>
      </section>

      <section>
        <div class="section-head"><h2 class="section-title">最近碎碎念</h2><button class="section-link" data-go="moments">查看全部</button></div>
        <div class="space-y-2">
          ${DB.moments.slice(0,2).map(m => `<div class="card p-4">
            <p class="text-[13px] leading-6">${esc(m.text)}</p>
            <div class="flex items-center gap-2 mt-3 text-[10px] faint"><span>${esc(m.time)}</span><span>·</span><span>${esc(m.mood || '此刻')}</span></div>
          </div>`).join('')}
        </div>
      </section>
    </main>
  </div>`;
}

/* ============================================================
   4. 旅程列表
   ============================================================ */
function viewJourneys() {
  const filter = state.journeyFilter;
  const list = DB.trips.filter(t => filter === 'all' || t.status === filter);
  return `<div class="screen">
    <header class="px-5 safe-top pb-3 flex items-center gap-3">
      <div class="min-w-0 flex-1"><p class="eyebrow">MY JOURNEYS</p><h1 class="text-[25px] font-bold tracking-[-.03em] mt-1">我的旅程</h1></div>
      <button class="icon-btn soft" data-go="search" aria-label="搜索旅程">${icon('search', 'w-5 h-5')}</button>
      <button class="btn btn-sm btn-primary" data-go="new-trip">${icon('plus', 'w-4 h-4')}新建</button>
    </header>
    <main class="px-5 space-y-4 pb-8">
      <div class="card p-4">
        <div class="flex items-center justify-between">
          <div><p class="text-[12px] font-semibold">12 段旅程 · 8 个省份</p><p class="text-[10px] faint mt-1">累计在路上 46 天</p></div>
          <button class="btn btn-sm btn-secondary" data-go="albums">${icon('book-open', 'w-4 h-4')}旅行画册</button>
        </div>
        <div class="map-card mt-3" style="min-height:122px" data-go="journeys?mode=map">
          <div class="absolute inset-0 opacity-75" style="background-image:radial-gradient(circle,color-mix(in srgb,var(--primary) 18%,transparent) 1px,transparent 1px);background-size:13px 13px"></div>
          <span class="map-dot big" style="left:30%;top:44%"></span><span class="map-dot" style="left:53%;top:56%"></span><span class="map-dot" style="left:73%;top:34%"></span>
          <div class="absolute inset-x-3 bottom-3 flex items-center justify-between"><span class="text-[11px] font-semibold">足迹地图</span><span class="text-[10px] font-semibold text-[var(--primary-strong)]">按省份查看 ${icon('chevron-right', 'inline w-3 h-3')}</span></div>
        </div>
      </div>

      <div class="seg">
        ${[['all','全部'],['active','进行中'],['done','已归档']].map(([key,label]) => `<button class="seg-btn ${filter === key ? 'active' : ''}" data-journey-filter="${key}">${label}</button>`).join('')}
      </div>

      <div class="space-y-3">
        ${list.length ? list.map(tripCard).join('') : emptyState('route', '没有符合条件的旅程', '换个筛选条件，或者记录一段新的出发。', `<button class="btn btn-primary" data-go="new-trip">${icon('plus','w-4 h-4')}新建旅程</button>`)}
      </div>

      <section>
        <div class="section-head"><h2 class="section-title">旅行画册</h2><button class="section-link" data-go="albums">全部画册</button></div>
        <div class="grid grid-cols-3 gap-3">
          ${DB.albums.slice(0,3).map(a => `<button class="text-left" data-action="open-album" data-id="${a.id}">
            <div class="book-cover">${img(a.cover, a.title)}</div>
            <p class="text-[11px] font-semibold mt-2 line-1">${esc(a.title)}</p>
            <p class="text-[9px] faint mt-0.5">${a.photos} 张照片</p>
          </button>`).join('')}
        </div>
      </section>
    </main>
  </div>`;
}

/* ============================================================
   5. 旅程详情（总览 / 行程 / 相册 / 花销）
   ============================================================ */
function viewTrip() {
  const trip = DB.trips.find(t => t.id === Number(state.params.id)) || DB.trips[0];
  const tab = state.tripTab || 'overview';
  const tabs = [['overview','总览'],['itinerary','行程'],['album','相册'],['expense','花销']];
  return `<div class="screen no-tabbar has-actionbar">
    <section class="relative h-[308px] overflow-hidden">
      ${img(trip.cover, trip.title)}
      <div class="absolute inset-0" style="background:linear-gradient(to top,rgba(5,20,17,.84),rgba(5,20,17,.05) 66%)"></div>
      <div class="absolute inset-x-0 top-0 safe-top px-3 flex items-center justify-between">
        <button class="icon-btn text-white" style="background:rgba(5,20,17,.3);backdrop-filter:blur(8px)" data-action="back" data-fallback="journeys" aria-label="返回">${icon('chevron-left','w-6 h-6')}</button>
        <div class="flex gap-1">
          <button class="icon-btn text-white" style="background:rgba(5,20,17,.3);backdrop-filter:blur(8px)" data-action="share-trip" data-id="${trip.id}" aria-label="分享">${icon('share','w-5 h-5')}</button>
          <button class="icon-btn text-white" style="background:rgba(5,20,17,.3);backdrop-filter:blur(8px)" data-action="trip-more" data-id="${trip.id}" aria-label="更多">${icon('more','w-5 h-5')}</button>
        </div>
      </div>
      <div class="absolute inset-x-0 bottom-0 p-5 text-white">
        <div class="flex items-center gap-2">${statusPill(trip.status)}<span class="text-[11px] text-white/75">${esc(trip.location)} · ${esc(trip.companion)}</span></div>
        <h1 class="text-[28px] font-bold leading-tight tracking-[-.03em] mt-2">${esc(trip.title)}</h1>
        <p class="text-[11px] text-white/70 mt-1">${trip.startDate.replaceAll('-','.')} – ${trip.endDate.replaceAll('-','.')} · ${trip.days} 天</p>
      </div>
    </section>

    <main class="relative z-10 -mt-4 rounded-t-[24px] bg-[var(--bg)] pb-5">
      <div class="px-5 pt-4">
        <div class="stat-mini">
          <div><b>${trip.itinerary.reduce((s,d)=>s+d.items.length,0)}</b><span>行程安排</span></div>
          <div><b>${trip.photos}</b><span>旅行照片</span></div>
          <div><b>¥${money(trip.spent)}</b><span>已记录花销</span></div>
        </div>
      </div>

      <div class="sticky top-0 z-30 mt-3 px-5 py-3 bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] backdrop-blur-lg">
        <div class="seg">
          ${tabs.map(([key,label]) => `<button class="seg-btn ${tab === key ? 'active' : ''}" data-trip-tab="${key}">${label}</button>`).join('')}
        </div>
      </div>

      <div class="px-5">
        ${tab === 'overview' ? tripOverview(trip) : ''}
        ${tab === 'itinerary' ? tripItinerary(trip) : ''}
        ${tab === 'album' ? tripAlbum(trip) : ''}
        ${tab === 'expense' ? tripExpense(trip) : ''}
      </div>
    </main>

    <div class="fixed left-1/2 -translate-x-1/2 bottom-0 z-40 w-full max-w-[430px] px-4 pt-3 pb-[calc(12px+var(--safe-bottom))] glass border-t border-[var(--line)]">
      <div class="flex gap-2">
        <button class="btn btn-primary btn-lg flex-1" data-action="quick-memory" data-id="${trip.id}">${icon('edit','w-4 h-4')}记一笔</button>
        <button class="btn btn-outline btn-lg flex-1" data-action="add-itinerary" data-id="${trip.id}">${icon('plus','w-4 h-4')}加行程</button>
      </div>
    </div>
  </div>`;
}

function tripOverview(trip) {
  const next = trip.itinerary.flatMap((d) => d.items.map((it) => ({...it, day:d}))).find(x => x.place);
  const latest = trip.memories[0];
  return `<div class="space-y-5 pb-4">
    <p class="text-[13px] leading-6 muted">${esc(trip.description)}</p>

    <section class="card p-4">
      <div class="section-head !mb-3"><h2 class="text-[14px] font-bold">下一站</h2><button class="section-link" data-trip-tab="itinerary">完整行程</button></div>
      <div class="flex items-start gap-3">
        <span class="w-11 h-11 rounded-[14px] flex items-center justify-center flex-none" style="background:var(--primary-soft);color:var(--primary-strong)">${icon('map-pin','w-5 h-5')}</span>
        <div class="min-w-0 flex-1">
          <p class="text-[10px] faint">${esc(next?.day.label || '')} · ${esc(next?.time || '')}</p>
          <p class="text-[15px] font-semibold mt-0.5">${esc(next?.title || '安排下一段行程')}</p>
          <p class="text-[11px] faint mt-1">${esc(next?.place || '还没有计划')}</p>
        </div>
        <button class="icon-btn" data-action="add-itinerary" data-id="${trip.id}">${icon('plus','w-5 h-5')}</button>
      </div>
    </section>

    <section>
      <div class="section-head"><h2 class="section-title">旅行照片</h2><button class="section-link" data-trip-tab="album">全部 ${trip.photos} 张</button></div>
      <div class="photo-grid">
        ${[trip.cover, IMG.boat, IMG.sea, IMG.town, IMG.lake].map((src,i)=>`<button class="photo-tile" data-action="open-photo" data-src="${src}" data-title="${esc(trip.title)} · 照片 ${i+1}">${img(src,'')}</button>`).join('')}
      </div>
    </section>

    <section class="card p-4">
      <div class="section-head !mb-2"><h2 class="text-[14px] font-bold">旅行花销</h2><button class="section-link" data-trip-tab="expense">记一笔</button></div>
      <div class="flex items-end gap-2"><b class="text-[26px] tnum">¥${money(trip.spent)}</b><span class="text-[11px] faint mb-1">/ 预算 ¥${money(trip.budget)}</span></div>
      <div class="progress-soft mt-3"><i style="width:${Math.round(trip.spent/trip.budget*100)}%"></i></div>
      <div class="flex justify-between text-[10px] faint mt-2"><span>已用 ${Math.round(trip.spent/trip.budget*100)}%</span><span>剩余 ¥${money(trip.budget-trip.spent)}</span></div>
    </section>

    ${latest ? `<section class="card p-4">
      <div class="section-head !mb-2"><h2 class="text-[14px] font-bold">最近记录</h2><span class="text-[10px] faint">${esc(latest.day)} · ${esc(latest.mood)}</span></div>
      <p class="text-[14px] font-semibold">${esc(latest.title)}</p>
      <p class="text-[12px] leading-5 muted mt-1">${esc(latest.content)}</p>
      <div class="flex gap-1.5 mt-3">${latest.photos.slice(0,3).map(src=>`<button class="w-[52px] h-[52px] rounded-lg overflow-hidden" data-action="open-photo" data-src="${src}" data-title="${esc(latest.title)}">${img(src,'')}</button>`).join('')}</div>
    </section>` : ''}

    <button class="w-full card p-4 flex items-center gap-3 text-left" data-go="spaces">
      <span class="w-10 h-10 rounded-[13px] flex items-center justify-center" style="background:var(--accent-soft);color:#986000">${icon('users','w-5 h-5')}</span>
      <span class="min-w-0 flex-1"><span class="block text-[13px] font-semibold">放在「山与海之间」空间</span><span class="block text-[10px] faint mt-0.5">成员都能查看并一起编辑这趟旅行</span></span>
      ${icon('chevron-right','w-4 h-4 text-[var(--text-3)]')}
    </button>
  </div>`;
}

function tripItinerary(trip) {
  const days = state.selectedDay === 'all' ? trip.itinerary : trip.itinerary.filter((_,i)=>String(i)===String(state.selectedDay));
  return `<div class="space-y-4 pb-4">
    <div class="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
      <button class="day-chip ${state.selectedDay==='all'?'active':''}" data-day-select="all"><b>全部</b><span>${trip.days} 天</span></button>
      ${trip.itinerary.map((d,i)=>`<button class="day-chip ${String(state.selectedDay)===String(i)?'active':''}" data-day-select="${i}"><b>${esc(d.label)}</b><span>${esc(d.week)}</span></button>`).join('')}
    </div>
    ${days.map(d => `<section>
      <div class="flex items-center justify-between mb-3"><div><h2 class="text-[15px] font-bold">${esc(d.label)} · ${esc(d.title)}</h2><p class="text-[10px] faint mt-0.5">${esc(d.week)} · ${d.items.length} 个安排</p></div><button class="btn btn-sm btn-secondary" data-action="add-itinerary" data-id="${trip.id}" data-day="${esc(d.label)}">${icon('plus','w-4 h-4')}添加</button></div>
      <div class="timeline">
        ${d.items.map(it=>`<div class="timeline-item">
          <span class="timeline-dot">${icon(it.type,'w-3.5 h-3.5')}</span>
          <div class="card p-3.5">
            <div class="flex items-start gap-2"><div class="min-w-0 flex-1"><div class="flex items-center gap-2"><span class="text-[10px] font-bold text-[var(--primary-strong)]">${esc(it.time)}</span>${it.expense ? `<span class="pill pill-primary">¥${money(it.expense)}</span>` : ''}</div><p class="text-[14px] font-semibold mt-1">${esc(it.title)}</p><p class="text-[11px] faint mt-0.5">${esc(it.place)}</p>${it.note ? `<p class="text-[11px] muted mt-1.5 leading-5">${esc(it.note)}</p>` : ''}</div><button class="icon-btn !w-9 !h-9" data-action="itinerary-actions" data-id="${trip.id}" data-day="${esc(d.label)}" data-title="${esc(it.title)}">${icon('more','w-4 h-4')}</button></div>
          </div>
        </div>`).join('')}
      </div>
    </section>`).join('')}
    <button class="btn btn-outline btn-block" data-action="add-day" data-id="${trip.id}">${icon('calendar','w-4 h-4')}再加一天</button>
  </div>`;
}

function tripAlbum(trip) {
  const photos = [trip.cover, IMG.boat, IMG.sea, IMG.town, IMG.lake, IMG.road, IMG.dusk, IMG.hike, IMG.van];
  return `<div class="pb-4">
    <div class="flex items-center gap-2">
      <button class="btn btn-primary" data-action="upload-photos" data-id="${trip.id}">${icon('camera','w-4 h-4')}上传照片</button>
      <span class="text-[11px] faint">共 ${trip.photos} 张 · 自动生成画册</span>
    </div>
    <div class="photo-grid mt-4">
      ${photos.map((src,i)=>`<button class="photo-tile" data-action="open-photo" data-src="${src}" data-title="${esc(trip.title)} · ${i+1}">${img(src,'')}${i===0?`<span class="absolute left-2 top-2 pill" style="background:rgba(5,20,17,.6);color:#fff">封面</span>`:''}</button>`).join('')}
    </div>
    <button class="w-full card p-4 mt-4 flex items-center gap-3 text-left" data-action="open-book" data-id="${trip.id}">
      <span class="w-10 h-10 rounded-[13px] flex items-center justify-center" style="background:var(--primary-soft);color:var(--primary-strong)">${icon('book-open','w-5 h-5')}</span>
      <span class="min-w-0 flex-1"><span class="block text-[13px] font-semibold">在翻页画册中阅读</span><span class="block text-[10px] faint mt-0.5">按天排版 · 可切换三种画册主题</span></span>
      ${icon('chevron-right','w-4 h-4 text-[var(--text-3)]')}
    </button>
  </div>`;
}

function tripExpense(trip) {
  const categories = Object.entries(trip.expenses.reduce((acc,e)=>{acc[e.category]=(acc[e.category]||0)+e.amount;return acc;},{})).sort((a,b)=>b[1]-a[1]);
  return `<div class="space-y-4 pb-4">
    <section class="card p-4">
      <div class="flex items-center justify-between"><h2 class="text-[14px] font-bold">花销概览</h2><button class="section-link" data-action="set-budget" data-id="${trip.id}">改预算</button></div>
      <div class="flex items-end gap-2 mt-2"><b class="text-[30px] tnum">¥${money(trip.spent)}</b><span class="text-[11px] faint mb-1.5">/ ¥${money(trip.budget)}</span></div>
      <div class="progress-soft mt-3"><i style="width:${Math.round(trip.spent/trip.budget*100)}%"></i></div>
      <div class="flex justify-between text-[10px] faint mt-2"><span>剩余 ¥${money(trip.budget-trip.spent)}</span><span>${Math.round(trip.spent/trip.budget*100)}%</span></div>
      <div class="grid grid-cols-4 gap-1.5 mt-4">
        ${categories.slice(0,4).map(([cat,val])=>`<div class="rounded-xl soft p-2.5 text-center"><p class="text-[10px] faint">${esc(cat)}</p><p class="text-[12px] font-bold mt-0.5">¥${money(val)}</p></div>`).join('')}
      </div>
    </section>
    <div class="flex items-center justify-between"><h2 class="section-title">全部明细</h2><button class="btn btn-sm btn-primary" data-action="add-expense" data-id="${trip.id}">${icon('plus','w-4 h-4')}记一笔</button></div>
    <div class="list-group">
      ${trip.expenses.map(e=>`<button class="list-row" data-action="expense-actions" data-id="${e.id}" data-trip="${trip.id}">
        <span class="list-icon">${icon(e.category==='交通'?'plane':e.category==='住宿'?'home':e.category==='餐饮'?'wallet':e.category==='体验'?'camera':'image','w-4 h-4')}</span>
        <span class="list-main"><span class="list-title">${esc(e.title)}</span><span class="list-sub">${esc(e.category)} · ${esc(e.date)} · ${esc(e.payer)}付款</span></span>
        <span class="text-[14px] font-bold tnum">¥${money(e.amount)}</span>
      </button>`).join('')}
    </div>
    <div class="flex flex-wrap gap-2 justify-center pt-1">
      ${categories.map(([cat,val])=>`<span class="chip">${esc(cat)} ¥${money(val)}</span>`).join('')}
    </div>
  </div>`;
}

/* ============================================================
   6. 旅行画册
   ============================================================ */
function viewAlbums() {
  const mode = state.albumMode;
  const filtered = state.albumFilter === '全部' ? DB.albums : DB.albums.filter(a => a.type === state.albumFilter);
  return `<div class="screen">
    <header class="px-5 safe-top pb-3 flex items-center gap-3">
      <button class="icon-btn soft" data-action="back" data-fallback="journeys">${icon('chevron-left','w-5 h-5')}</button>
      <div class="min-w-0 flex-1"><p class="eyebrow">TRAVEL BOOKS</p><h1 class="text-[25px] font-bold tracking-[-.03em] mt-1">旅行画册</h1></div>
      <button class="btn btn-sm btn-secondary" data-action="new-album">${icon('plus','w-4 h-4')}新相册</button>
    </header>
    <main class="px-5 space-y-4 pb-8">
      <div class="seg">
        ${[['book','画册'],['gallery','纪念相册'],['star','星图']].map(([key,label])=>`<button class="seg-btn ${mode===key?'active':''}" data-album-mode="${key}">${label}</button>`).join('')}
      </div>

      ${mode === 'book' ? `<section class="hero-card">
        <div class="relative h-[250px]">${img(DB.albums[0].cover,'大理画册')}<div class="hero-shade"></div>
          <div class="absolute inset-x-0 bottom-0 p-5 text-white"><p class="text-[11px] text-white/75">2026 · 秋</p><h2 class="text-[24px] font-bold mt-1">大理 · 苍山洱海</h2><p class="text-[11px] text-white/70 mt-1">5 天 · 36 张照片 · 2 条回忆</p><button class="btn btn-sm mt-3" style="background:#fff;color:#0b5f59" data-action="open-book" data-id="1">${icon('book-open','w-4 h-4')}翻开画册</button></div>
        </div>
      </section>
      <section>
        <div class="section-head"><h2 class="section-title">全部画册</h2><span class="text-[10px] faint">${DB.albums.length} 本</span></div>
        <div class="grid grid-cols-2 gap-4">
          ${DB.albums.map(a=>`<button class="text-left" data-action="open-book" data-id="${a.tripId||1}">
            <div class="book-cover">${img(a.cover,a.title)}<div class="absolute inset-x-0 bottom-0 p-3 text-white z-[3]"><p class="text-[12px] font-bold line-1">${esc(a.title)}</p><p class="text-[9px] text-white/70 mt-0.5">${esc(a.date)} · ${a.photos} 张</p></div></div>
          </button>`).join('')}
        </div>
      </section>` : ''}

      ${mode === 'gallery' ? `<div class="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
        ${['全部','情侣','朋友','独旅'].map(f=>`<button class="chip ${state.albumFilter===f?'active':''}" data-album-filter="${f}">${f}</button>`).join('')}
      </div>
      <div class="grid grid-cols-2 gap-3">
        ${filtered.map(a=>`<button class="text-left" data-action="open-album" data-id="${a.id}">
          <div class="relative aspect-[4/5] rounded-[18px] overflow-hidden">${img(a.cover,a.title)}<div class="absolute inset-0" style="background:linear-gradient(to top,rgba(5,20,17,.7),transparent 58%)"></div>
            ${a.locked?`<span class="absolute right-2 top-2 w-8 h-8 rounded-full flex items-center justify-center text-white" style="background:rgba(5,20,17,.46);backdrop-filter:blur(8px)">${icon('lock','w-4 h-4')}</span>`:''}
            <div class="absolute inset-x-0 bottom-0 p-3.5 text-white"><p class="text-[13px] font-bold line-1">${esc(a.title)}</p><p class="text-[9px] text-white/70 mt-1">${esc(a.type)} · ${a.photos} 张照片</p></div>
          </div>
        </button>`).join('')}
      </div>
      ${filtered.length===0?emptyState('image','没有符合条件的相册','换个类型筛选看看。'):''}
      <button class="w-full border border-dashed border-[var(--line-strong)] rounded-[18px] py-5 flex items-center justify-center gap-2 text-[12px] font-semibold text-[var(--text-2)]" data-action="new-album">${icon('plus','w-4 h-4')}新建纪念相册</button>` : ''}

      ${mode === 'star' ? `<section class="card p-5">
        <div class="flex items-center justify-between"><div><p class="eyebrow">STAR MAP</p><h2 class="section-title mt-1">旅行星图</h2></div><span class="pill pill-primary">走过 8 城</span></div>
        <div class="relative h-[260px] mt-4 rounded-[18px] overflow-hidden" style="background:radial-gradient(circle at 50% 50%,#143d37,#081a17 70%)">
          <div class="absolute inset-0 opacity-60" style="background-image:radial-gradient(circle,#fff 1px,transparent 1px);background-size:26px 26px"></div>
          <span class="review-star" style="position:absolute;left:26%;top:34%"></span><span class="review-star" style="position:absolute;left:52%;top:22%;width:11px;height:11px"></span><span class="review-star" style="position:absolute;left:68%;top:52%"></span><span class="review-star" style="position:absolute;left:38%;top:66%"></span><span class="review-star" style="position:absolute;left:78%;top:30%"></span>
          <div class="absolute left-4 bottom-4 text-white"><p class="text-[12px] font-semibold">大理 / 泉州 / 阿勒泰</p><p class="text-[10px] text-white/55 mt-1">旅行的光点会按照片数量浮起</p></div>
        </div>
        <div class="grid grid-cols-3 gap-2 mt-4"><div class="stat-box"><b>8</b><span>城市</span></div><div class="stat-box"><b>46</b><span>天数</span></div><div class="stat-box"><b>486</b><span>照片</span></div></div>
      </section>
      <div class="space-y-2">${DB.albums.map(a=>`<button class="w-full list-group p-3.5 flex items-center gap-3 text-left" data-action="open-album" data-id="${a.id}"><span class="w-12 h-12 rounded-xl overflow-hidden">${img(a.cover,a.title)}</span><span class="flex-1"><span class="block text-[13px] font-semibold">${esc(a.title)}</span><span class="block text-[10px] faint mt-0.5">${esc(a.date)} · ${a.photos} 张照片</span></span>${icon('chevron-right','w-4 h-4 text-[var(--text-3)]')}</button>`).join('')}</div>` : ''}
    </main>
  </div>`;
}

function viewAlbumDetail() {
  const album = DB.albums.find(a=>a.id===Number(state.params.id)) || DB.albums[0];
  if (album.locked && !state.unlockedAlbums.has(album.id)) {
    return `<div class="screen no-tabbar">${pageHeader(album.title,{backTo:'albums'})}<main class="px-5 py-8">${emptyState('lock','相册已上锁','输入纪念日作为解锁密码后查看照片。',`<button class="btn btn-primary" data-action="open-album" data-id="${album.id}">${icon('lock','w-4 h-4')}解锁相册</button>`)}</main></div>`;
  }
  return `<div class="screen no-tabbar">
    ${pageHeader(album.title,{backTo:'albums',right:`<button class="icon-btn" data-action="album-more" data-id="${album.id}">${icon('more','w-5 h-5')}</button>`})}
    <main class="px-5 py-4 space-y-4">
      <div class="relative h-[260px] rounded-[22px] overflow-hidden">${img(album.cover,album.title)}<div class="hero-shade"></div><div class="absolute inset-x-0 bottom-0 p-5 text-white"><p class="text-[11px] text-white/70">${esc(album.type)} · ${esc(album.date)}</p><h1 class="text-[24px] font-bold mt-1">${esc(album.title)}</h1><p class="text-[11px] text-white/70 mt-1">${album.photos} 张照片 · 按日期自动归档</p></div></div>
      <div class="flex gap-2"><button class="btn btn-primary flex-1" data-action="upload-album-photo" data-id="${album.id}">${icon('camera','w-4 h-4')}添加照片</button><button class="btn btn-outline flex-1" data-action="share-album" data-id="${album.id}">${icon('share','w-4 h-4')}分享</button></div>
      <div class="photo-grid">${[album.cover,IMG.boat,IMG.sea,IMG.town,IMG.lake,IMG.road,IMG.dusk,IMG.hike,IMG.van].map((src,i)=>`<button class="photo-tile" data-action="open-photo" data-src="${src}" data-title="${esc(album.title)} · ${i+1}">${img(src,'')}</button>`).join('')}</div>
      <p class="text-center text-[10px] faint pt-1">点击照片可查看大图与留言</p>
    </main>
  </div>`;
}

function openUnlockSheet(album) {
  openSheet('相册已上锁', `<div class="text-center">
    <div class="w-14 h-14 rounded-[18px] flex items-center justify-center mx-auto" style="background:var(--primary-soft);color:var(--primary-strong)">${icon('lock','w-7 h-7')}</div>
    <p class="text-[13px] muted mt-3">输入纪念日作为解锁密码</p>
    <form data-form="unlock-album" data-id="${album.id}" class="text-left mt-4 form-stack">
      <label class="field"><span class="field-label">解锁密码</span><input class="input" name="password" placeholder="如 2023-06-20" autofocus></label>
      <p class="hint text-center">支持 YYYY-MM-DD / YYYY/MM/DD 格式 · Demo 密码：2023-06-20</p>
      <button class="btn btn-primary btn-block" type="submit">${icon('lock','w-4 h-4')}解锁相册</button>
    </form>
  </div>`);
}

function openBookViewer(tripId = 1) {
  const trip = DB.trips.find(t=>t.id===Number(tripId)) || DB.trips[0];
  layerRoot.innerHTML = `<div class="modal-mask" data-close-layer style="background:rgba(5,20,17,.92)"></div>
    <div class="fixed inset-0 z-[82] flex flex-col text-white">
      <div class="safe-top px-3 flex items-center justify-between"><button class="icon-btn !text-white" data-close-layer>${icon('x','w-6 h-6')}</button><span class="text-[12px] text-white/70">${esc(trip.title)}</span><button class="icon-btn !text-white" data-action="book-theme">${icon('sun','w-5 h-5')}</button></div>
      <div class="flex-1 flex items-center justify-center px-4">
        <div class="w-full max-w-[350px] rounded-[8px] overflow-hidden shadow-2xl" style="background:#fbf7ef;color:#24312e">
          <div class="relative h-[205px]">${img(trip.cover,trip.title)}<div class="absolute inset-0" style="background:linear-gradient(to top,rgba(36,49,46,.62),transparent 60%)"></div><div class="absolute inset-x-0 bottom-0 p-5 text-white"><p class="text-[10px] tracking-[.2em] uppercase">Chapter 01</p><h2 class="text-[24px] font-bold mt-1">${esc(trip.title)}</h2><p class="text-[10px] text-white/70 mt-1">${esc(trip.location)} · ${trip.days} 天</p></div></div>
          <div class="p-5"><p class="text-[12px] leading-6" style="color:#5b675f">${esc(trip.description)}</p><div class="flex items-center justify-between mt-4 pt-3" style="border-top:1px solid #e7dfd2"><span class="text-[10px]" style="color:#8b968f">2026.10 · 甜途画册</span><span class="text-[10px] font-bold" style="color:#0f766e">01 / 05</span></div></div>
        </div>
      </div>
      <div class="px-5 pb-[calc(22px+var(--safe-bottom))] flex items-center justify-center gap-4"><button class="icon-btn !text-white" data-action="book-prev">${icon('chevron-left','w-6 h-6')}</button><span class="text-[11px] text-white/60">左右滑动或点击翻页</span><button class="icon-btn !text-white" data-action="book-next">${icon('chevron-right','w-6 h-6')}</button></div>
    </div>`;
}

/* ============================================================
   7. 旅行圈
   ============================================================ */
function viewCircle() {
  const sorted = [...DB.posts].sort((a,b)=> state.circleTab==='hot' ? b.likes-a.likes : b.id-a.id);
  const filtered = state.circleFilter==='全部' ? sorted : sorted.filter(p=>TYPE_LABEL[p.type]===state.circleFilter);
  return `<div class="screen">
    <header class="px-5 safe-top pb-3 flex items-center gap-3">
      <div class="min-w-0 flex-1"><p class="eyebrow">TRAVEL CIRCLE</p><h1 class="text-[25px] font-bold tracking-[-.03em] mt-1">旅行圈</h1></div>
      <button class="icon-btn soft" data-go="search">${icon('search','w-5 h-5')}</button>
      <button class="relative icon-btn soft" data-go="notifications">${icon('bell','w-5 h-5')}${DB.notifications.some(n=>n.unread)?'<span class="absolute right-[9px] top-[9px] w-2 h-2 rounded-full bg-[var(--danger)]"></span>':''}</button>
    </header>
    <main class="px-5 space-y-4 pb-8">
      <div class="seg">${[['recommended','推荐'],['latest','最新'],['hot','热门'],['following','关注']].map(([k,l])=>`<button class="seg-btn ${state.circleTab===k?'active':''}" data-circle-tab="${k}">${l}</button>`).join('')}</div>
      <div class="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
        ${['全部','独旅','情侣','朋友','家庭'].map(f=>`<button class="chip ${state.circleFilter===f?'active':''}" data-circle-filter="${f}">${f}</button>`).join('')}
      </div>
      ${filtered.length ? `<div class="flex items-center gap-2"><span class="text-[12px] font-semibold">${state.circleTab==='following'?'关注的旅途':'为你推荐'}</span><span class="h-px flex-1 bg-[var(--line)]"></span><span class="text-[10px] faint">共 ${filtered.length} 篇</span></div>${filtered.map((p,i)=>postCard(p,i===0)).join('')}` : emptyState('compass','这里还没有旅行故事','换个筛选条件，或者去记录自己的下一段旅程。',`<button class="btn btn-primary" data-go="new-trip">记录一次旅行</button>`)}
    </main>
  </div>`;
}

function viewPost() {
  const post = DB.posts.find(p=>p.id===Number(state.params.id)) || DB.posts[0];
  const comments = DB.comments[post.id] || [];
  return `<div class="screen no-tabbar">
    <section class="relative h-[320px]">${img(post.cover,post.title)}<div class="absolute inset-0" style="background:linear-gradient(to top,rgba(5,20,17,.78),transparent 65%)"></div>
      <div class="absolute inset-x-0 top-0 safe-top px-3 flex items-center justify-between"><button class="icon-btn text-white" style="background:rgba(5,20,17,.28);backdrop-filter:blur(8px)" data-action="back" data-fallback="circle">${icon('chevron-left','w-6 h-6')}</button><button class="icon-btn text-white" style="background:rgba(5,20,17,.28);backdrop-filter:blur(8px)" data-action="post-more" data-id="${post.id}">${icon('more','w-5 h-5')}</button></div>
      <div class="absolute inset-x-0 bottom-0 p-5 text-white"><div class="flex items-center gap-2"><span class="pill" style="background:rgba(255,255,255,.9);color:#142521">${tripTypeLabel(post.type)}</span><span class="text-[10px] text-white/70">${esc(post.location)} · ${esc(post.dateRange)}</span></div><h1 class="text-[26px] font-bold leading-tight mt-2">${esc(post.title)}</h1></div>
    </section>
    <main class="px-5 -mt-3 relative z-10">
      <div class="card p-4">
        <button class="flex items-center gap-3 w-full text-left" data-go="user/${post.author.handle==='linyu'?'me':2}">${avatar(post.author.avatar,42)}<span class="flex-1"><span class="block text-[14px] font-semibold">${esc(post.author.name)}</span><span class="block text-[10px] faint mt-0.5">@${esc(post.author.handle)} · ${esc(post.time)}</span></span><span class="btn btn-sm btn-secondary">关注</span></button>
        <p class="text-[13px] leading-6 muted mt-4">${esc(post.summary)}</p>
        <div class="flex items-center gap-3 mt-4 pt-3 border-t border-[var(--line)] text-[11px] faint"><span>${post.days} 天旅程</span><span>·</span><span>${post.photos} 张照片</span><span>·</span><span>${post.comments} 条评论</span></div>
      </div>
      <div class="flex items-center justify-around card p-2 mt-3">
        <button class="action-pill ${post.liked?'on':''}" data-action="like" data-id="${post.id}">${icon('heart','w-5 h-5',post.liked)}<span data-like-count="${post.id}">${post.likes}</span></button>
        <button class="action-pill" data-action="comments" data-id="${post.id}">${icon('message','w-5 h-5')}<span data-comment-count="${post.id}">${post.comments}</span></button>
        <button class="action-pill ${post.saved?'saved':''}" data-action="save" data-id="${post.id}">${icon('bookmark','w-5 h-5',post.saved)}<span data-save-count="${post.id}">${post.favorites}</span></button>
        <button class="action-pill" data-action="share" data-id="${post.id}">${icon('share','w-5 h-5')}</button>
      </div>
      <div class="space-y-5 py-5">
        ${post.chapters.map(ch=>`<section><div class="flex items-center gap-2"><span class="pill pill-primary">${esc(ch.date)}</span><h2 class="text-[15px] font-bold">${esc(ch.title)}</h2></div><p class="text-[12px] leading-6 muted mt-2">${esc(ch.text)}</p><div class="photo-grid mt-3">${ch.photos.map(src=>`<button class="photo-tile" data-action="open-photo" data-src="${src}" data-title="${esc(ch.title)}">${img(src,'')}</button>`).join('')}</div></section>`).join('')}
      </div>
      <section class="card p-4 mb-6">
        <div class="section-head !mb-2"><h2 class="text-[14px] font-bold">评论 ${post.comments}</h2><button class="section-link" data-action="comments" data-id="${post.id}">查看全部</button></div>
        ${comments.slice(0,2).map(c=>`<div class="flex gap-2.5 py-2"><span class="avatar" style="width:30px;height:30px">${img(c.avatar,'')}</span><div class="min-w-0 flex-1"><p class="text-[11px] font-semibold">${esc(c.user)}</p><p class="text-[12px] leading-5 muted mt-0.5">${esc(c.text)}</p></div></div>`).join('')}
        <button class="mt-2 w-full rounded-xl soft px-3 py-2.5 text-left text-[12px] faint" data-action="comments" data-id="${post.id}">写下你的评论…</button>
      </section>
    </main>
  </div>`;
}

function openComments(postId) {
  const post = DB.posts.find(p=>p.id===Number(postId));
  const comments = DB.comments[postId] || [];
  openSheet(`评论 ${post.comments}`, `<div class="space-y-4">
    <div class="space-y-3">${comments.map(c=>`<div class="flex gap-3"><span class="avatar" style="width:34px;height:34px">${img(c.avatar,'')}</span><div class="min-w-0 flex-1"><div class="flex items-center gap-2"><span class="text-[12px] font-semibold">${esc(c.user)}</span><span class="text-[9px] faint">${esc(c.time)}</span></div><p class="text-[12px] leading-5 muted mt-1">${esc(c.text)}</p><button class="action-pill !p-0 !min-h-[28px] mt-1 ${c.liked?'on':''}" data-action="like-comment" data-post="${postId}" data-id="${c.id}">${icon('heart','w-3.5 h-3.5',c.liked)} ${c.likes}</button></div></div>`).join('')}</div>
    <form data-form="comment" data-id="${postId}" class="flex gap-2 pt-3 border-t border-[var(--line)]"><input class="input flex-1" name="content" placeholder="写下你的评论…" autocomplete="off"><button class="btn btn-primary" type="submit">${icon('send','w-4 h-4')}</button></form>
  </div>`);
}

/* ============================================================
   8. 用户主页与协作空间
   ============================================================ */
function viewUser() {
  const isMe = Number.isNaN(Number(state.params.id)) || Number(state.params.id) === 1;
  const profile = isMe ? { name:DB.user.name, handle:DB.user.handle, avatar:DB.user.avatar } : DB.posts[0].author;
  const posts = isMe ? DB.posts.filter(p=>p.author.handle==='linyu') : DB.posts.slice(0,2);
  return `<div class="screen no-tabbar">
    ${pageHeader('旅行者主页',{backTo:'circle'})}
    <main class="px-5 py-5">
      <section class="flex items-center gap-4">
        ${avatar(profile.avatar,78)}
        <div class="min-w-0 flex-1"><h1 class="text-[22px] font-bold">${esc(profile.name)}</h1><p class="text-[11px] faint mt-1">@${esc(profile.handle)} · TN-2609</p><p class="text-[12px] muted mt-2 leading-5">${isMe?esc(DB.user.bio):'喜欢海，也喜欢不赶时间的旅行。'}</p></div>
      </section>
      <div class="grid grid-cols-3 gap-2 mt-5"><button class="stat-box" data-action="open-people" data-kind="trips"><b>${isMe?12:18}</b><span>旅行</span></button><button class="stat-box" data-action="open-people" data-kind="followers"><b>${isMe?52:126}</b><span>关注者</span></button><button class="stat-box" data-action="open-people" data-kind="following"><b>32</b><span>正在关注</span></button></div>
      <div class="flex gap-2 mt-4"><button class="btn btn-primary flex-1" data-action="follow-user">${icon('user-plus','w-4 h-4')}关注</button><button class="btn btn-outline flex-1" data-action="block-user">屏蔽</button></div>
      <div class="section-head mt-6"><h2 class="section-title">公开的旅行</h2><span class="text-[10px] faint">${posts.length} 篇</span></div>
      <div class="space-y-4">${posts.map(p=>postCard(p)).join('')}</div>
    </main>
  </div>`;
}

function viewSpaces() {
  return `<div class="screen">
    ${pageHeader('我的空间',{backTo:'me',right:`<button class="icon-btn" data-action="create-space">${icon('plus','w-5 h-5')}</button>`})}
    <main class="px-5 py-4 space-y-4 pb-8">
      <div class="flex gap-2"><button class="btn btn-primary flex-1" data-action="create-space">${icon('plus','w-4 h-4')}创建空间</button><button class="btn btn-outline" data-action="join-space">${icon('users','w-4 h-4')}邀请码加入</button></div>
      <div class="grid grid-cols-2 gap-3"><div class="stat-box"><b>2</b><span>我的空间</span></div><div class="stat-box"><b>7</b><span>共同成员</span></div></div>
      <section><div class="section-head"><h2 class="section-title">共享空间</h2><span class="text-[10px] faint">${DB.spaces.length} 个</span></div>
        <div class="space-y-3">${DB.spaces.map(s=>`<button class="space-card w-full text-left" data-go="space/${s.id}">${img(s.cover,s.name)}<div class="space-card-content"><div class="flex items-center justify-between"><span class="pill" style="background:rgba(255,255,255,.18);color:#fff">${esc(s.typeLabel)}</span><span class="text-[10px] text-white/60">${s.members} 位成员</span></div><div class="mt-auto"><h3 class="text-[20px] font-bold">${esc(s.name)}</h3><p class="text-[11px] text-white/70 mt-1 line-1">${esc(s.desc)}</p><div class="flex gap-3 text-[10px] text-white/70 mt-3"><span>${s.travels} 段旅行</span><span>${s.albums} 本相册</span><span>${s.memories} 条回忆</span></div></div></div></button>`).join('')}</div>
      </section>
      <section class="card p-4"><div class="flex items-center gap-2 text-[var(--primary-strong)]">${icon('info','w-4 h-4')}<span class="text-[11px] font-bold">空间权限</span></div><p class="text-[11px] leading-5 muted mt-2">主人可以邀请伙伴和调整成员；成员可以一起编辑旅行与相册；访客只能查看共享内容。</p></section>
    </main>
  </div>`;
}

function viewSpace() {
  const space = DB.spaces.find(s=>s.id===Number(state.params.id)) || DB.spaces[0];
  const tab = state.spaceTab;
  const trips = DB.trips.filter(t=>t.spaceId===space.id);
  return `<div class="screen no-tabbar">
    <section class="relative h-[232px] overflow-hidden">${img(space.cover,space.name)}<div class="absolute inset-0" style="background:linear-gradient(to top,rgba(4,38,33,.9),rgba(4,38,33,.22))"></div>
      <div class="absolute inset-x-0 top-0 safe-top px-3 flex items-center justify-between"><button class="icon-btn text-white" data-action="back" data-fallback="spaces">${icon('chevron-left','w-6 h-6')}</button><div class="flex gap-1"><button class="icon-btn text-white" data-action="invite-space" data-id="${space.id}">${icon('user-plus','w-5 h-5')}</button><button class="icon-btn text-white" data-action="space-more" data-id="${space.id}">${icon('more','w-5 h-5')}</button></div></div>
      <div class="absolute inset-x-0 bottom-0 p-5 text-white"><span class="pill" style="background:rgba(255,255,255,.18);color:#fff">${esc(space.typeLabel)} · 我是${space.role==='OWNER'?'主人':'成员'}</span><h1 class="text-[26px] font-bold mt-2">${esc(space.name)}</h1><p class="text-[11px] text-white/70 mt-1">${esc(space.desc)}</p><div class="flex items-center gap-2 mt-3"><div class="flex -space-x-2">${space.memberList.map(m=>`<span class="avatar ring-2 ring-[#123] " style="width:26px;height:26px">${img(m.avatar,'')}</span>`).join('')}</div><span class="text-[10px] text-white/60">${space.members} 位成员</span></div></div>
    </section>
    <main class="px-5 py-4">
      <div class="stat-mini"><div><b>${space.travels}</b><span>旅行</span></div><div><b>${space.albums}</b><span>相册</span></div><div><b>${space.photos}</b><span>照片</span></div></div>
      <div class="seg mt-4">${[['content','内容'],['activity','动态'],['members','成员']].map(([k,l])=>`<button class="seg-btn ${tab===k?'active':''}" data-space-tab="${k}">${l}</button>`).join('')}</div>
      <div class="mt-4">
        ${tab==='content'?`<div class="space-y-5">
          <section><div class="section-head"><h2 class="section-title">一起记录的旅行</h2><button class="section-link" data-go="new-trip">记录一次</button></div><div class="space-y-3">${trips.length?trips.map(tripCard).join(''):emptyState('route','空间里还没有旅行','把一次旅行放进这个空间，成员就能一起编辑。',`<button class="btn btn-primary" data-go="new-trip">新建旅行</button>`)}</div></section>
          <section><div class="section-head"><h2 class="section-title">一起经营的相册</h2><button class="section-link" data-go="albums">全部</button></div><div class="grid grid-cols-2 gap-3">${DB.albums.slice(0,2).map(a=>`<button class="text-left" data-action="open-album" data-id="${a.id}"><div class="relative aspect-[4/3] rounded-[16px] overflow-hidden">${img(a.cover,a.title)}</div><p class="text-[11px] font-semibold mt-2">${esc(a.title)}</p></button>`).join('')}</div></section>
          <section class="card p-4"><div class="section-head !mb-2"><h2 class="text-[14px] font-bold">最近的共同回忆</h2><span class="text-[10px] faint">${space.memories} 条</span></div>${DB.trips[0].memories.slice(0,1).map(m=>`<p class="text-[13px] font-semibold">${esc(m.title)}</p><p class="text-[11px] leading-5 muted mt-1">${esc(m.content)}</p>`).join('')}</section>
        </div>`:''}
        ${tab==='activity'?`<div class="list-group">${space.activity.map(a=>`<div class="list-row"><span class="list-icon">${icon('sparkles','w-4 h-4')}</span><span class="list-main"><span class="list-title">${esc(a.user)} ${esc(a.text)}</span><span class="list-sub">${esc(a.time)}</span></span></div>`).join('')}</div>`:''}
        ${tab==='members'?`<div class="space-y-3">${space.memberList.map(m=>`<div class="card p-3.5 flex items-center gap-3">${avatar(m.avatar,38)}<div class="flex-1"><p class="text-[13px] font-semibold">${esc(m.name)}</p><p class="text-[10px] faint mt-0.5">${esc(m.role)}</p></div>${space.role==='OWNER'&&m.role!=='主人'?`<button class="btn btn-sm btn-outline" data-action="member-actions" data-name="${esc(m.name)}">管理</button>`:`<span class="pill pill-primary">${esc(m.role)}</span>`}</div>`).join('')}<button class="btn btn-outline btn-block" data-action="invite-space" data-id="${space.id}">${icon('user-plus','w-4 h-4')}邀请伙伴</button></div>`:''}
      </div>
    </main>
  </div>`;
}

/* ============================================================
   9. 我的
   ============================================================ */
function viewMe() {
  return `<div class="screen">
    <header class="px-5 safe-top pb-3 flex items-center gap-3">
      <div class="min-w-0 flex-1"><p class="eyebrow">MY ARCHIVE</p><h1 class="text-[25px] font-bold tracking-[-.03em] mt-1">我的</h1></div>
      <button class="relative icon-btn soft" data-go="notifications">${icon('bell','w-5 h-5')}${DB.notifications.some(n=>n.unread)?'<span class="absolute right-[9px] top-[9px] w-2 h-2 rounded-full bg-[var(--danger)]"></span>':''}</button>
      <button class="icon-btn soft" data-go="settings">${icon('settings','w-5 h-5')}</button>
    </header>
    <main class="px-5 space-y-5 pb-8">
      <section class="relative h-[224px] rounded-[22px] overflow-hidden">${img(DB.user.cover,'我的旅行档案')}<div class="absolute inset-0" style="background:linear-gradient(to top,rgba(5,20,17,.74),transparent 64%)"></div>
        <button class="absolute right-3 top-3 icon-btn text-white" style="background:rgba(5,20,17,.3);backdrop-filter:blur(8px)" data-action="edit-profile">${icon('edit','w-4 h-4')}</button>
        <div class="absolute inset-x-0 bottom-0 p-4 text-white flex items-end gap-3">${avatar(DB.user.avatar,62)}<div class="min-w-0 flex-1"><h2 class="text-[21px] font-bold">${esc(DB.user.name)}</h2><p class="text-[10px] text-white/65 mt-0.5">@${esc(DB.user.handle)} · ID ${esc(DB.user.accountId)}</p><p class="text-[11px] text-white/80 mt-1 line-1">${esc(DB.user.bio)}</p></div></div>
      </section>
      <div class="stat-mini"><div><b>${DB.user.stats.trips}</b><span>次旅行</span></div><div><b>${DB.user.stats.places}</b><span>个地方</span></div><div><b>${DB.user.stats.photos}</b><span>张照片</span></div></div>
      <div class="grid grid-cols-2 gap-2"><button class="btn btn-primary" data-go="new-trip">${icon('plane','w-4 h-4')}记录一次旅行</button><button class="btn btn-secondary" data-go="albums">${icon('book-open','w-4 h-4')}旅行画册</button></div>

      <section>
        <div class="grid grid-cols-4 gap-2">
          ${[
            {icon:'bookmark',label:'收藏',path:'favorites',badge:DB.user.stats.favorites},
            {icon:'bell',label:'通知',path:'notifications',badge:DB.notifications.filter(n=>n.unread).length},
            {icon:'users',label:'空间',path:'spaces',badge:''},
            {icon:'bar-chart',label:'看板',path:'dashboard',badge:''}
          ].map(it=>`<button class="card py-3 flex flex-col items-center gap-1.5" data-go="${it.path}"><span class="relative w-9 h-9 rounded-xl flex items-center justify-center" style="background:var(--primary-soft);color:var(--primary-strong)">${icon(it.icon,'w-4.5 h-4.5')}${it.badge?`<span class="absolute -right-1 -top-1 min-w-[16px] h-4 px-1 rounded-full bg-[var(--danger)] text-white text-[9px] flex items-center justify-center">${it.badge}</span>`:''}</span><span class="text-[10px] font-semibold">${it.label}</span></button>`).join('')}
        </div>
      </section>

      <section><div class="section-head"><h2 class="section-title">我的内容</h2></div><div class="list-group">
        ${[
          {icon:'route',title:'我的旅程',sub:'12 段旅程 · 46 天',path:'journeys'},
          {icon:'book-open',title:'旅行画册',sub:'按旅行与城市自动成册',path:'albums'},
          {icon:'calendar',title:'时间线',sub:'按年份回看旅程与回忆',path:'timeline'},
          {icon:'align-left',title:'碎碎念',sub:'生活里的灵光与小确幸',path:'moments'}
        ].map(it=>`<button class="list-row" data-go="${it.path}"><span class="list-icon">${icon(it.icon,'w-4 h-4')}</span><span class="list-main"><span class="list-title">${it.title}</span><span class="list-sub">${it.sub}</span></span>${icon('chevron-right','w-4 h-4 text-[var(--text-3)]')}</button>`).join('')}
      </div></section>

      <section><div class="section-head"><h2 class="section-title">记录与同步</h2></div><div class="list-group">
        ${[
          {icon:'users',title:'我的空间',sub:'情侣 / 朋友 / 家庭一起记录',path:'spaces'},
          {icon:'map-pin',title:'旅行足迹',sub:'8 个省份 · 28 个城市',path:'journeys'},
          {icon:'cloud',title:'数据与同步',sub:'离线队列 2 项待同步',path:'sync'},
          {icon:'download',title:'导出记忆档案',sub:'JSON / Markdown / 原图 ZIP',action:'export-archive'}
        ].map(it=>`<button class="list-row" ${it.path?`data-go="${it.path}"`:`data-action="${it.action}"`}><span class="list-icon">${icon(it.icon,'w-4 h-4')}</span><span class="list-main"><span class="list-title">${it.title}</span><span class="list-sub">${it.sub}</span></span>${icon('chevron-right','w-4 h-4 text-[var(--text-3)]')}</button>`).join('')}
      </div></section>

      <section><div class="section-head"><h2 class="section-title">设置</h2></div><div class="list-group">
        <button class="list-row" data-go="settings"><span class="list-icon">${icon('settings','w-4 h-4')}</span><span class="list-main"><span class="list-title">账号设置</span><span class="list-sub">昵称、密码、邮箱与偏好</span></span>${icon('chevron-right','w-4 h-4 text-[var(--text-3)]')}</button>
        <button class="list-row" data-action="toggle-theme"><span class="list-icon">${icon(state.theme==='dark'?'sun':'moon','w-4 h-4')}</span><span class="list-main"><span class="list-title">外观主题</span><span class="list-sub">${state.theme==='dark'?'深色模式':'浅色模式'}</span></span><span class="text-[11px] faint">切换</span></button>
        <button class="list-row h-danger" data-action="logout"><span class="list-icon" style="background:var(--danger-soft);color:var(--danger)">${icon('logout','w-4 h-4')}</span><span class="list-main"><span class="list-title">退出登录</span><span class="list-sub">清空本地会话</span></span></button>
      </div></section>
      <p class="text-center text-[10px] faint">甜途 · v1.29.1 · 用足迹丈量中国</p>
    </main>
  </div>`;
}

function viewNotifications() {
  return `<div class="screen">${pageHeader('我的通知',{backTo:'me',right:`<button class="text-[11px] font-semibold text-[var(--primary-strong)]" data-action="mark-all-read">全部已读</button>`})}
    <main class="px-5 py-4">${DB.notifications.length?`<div class="list-group">${DB.notifications.map(n=>`<button class="list-row" data-action="notification-click" data-id="${n.id}"><span class="relative">${avatar(n.avatar,38)}${n.unread?'<span class="absolute -right-0.5 -top-0.5 w-2.5 h-2.5 rounded-full bg-[var(--danger)] ring-2 ring-[var(--surface)]"></span>':''}</span><span class="list-main"><span class="list-title text-[13px] leading-5"><b>${esc(n.user)}</b> ${esc(n.text)}</span><span class="list-sub mt-1">${esc(n.time)}</span></span></button>`).join('')}</div>`:emptyState('bell','暂无通知','有人赞、评论或收藏你的旅行时，会出现在这里。')}</main>
  </div>`;
}

function viewFavorites() {
  return `<div class="screen">${pageHeader('我的收藏',{backTo:'me'})}
    <main class="px-5 py-4"><div class="seg mb-4"><button class="seg-btn active">旅行故事</button><button class="seg-btn" data-action="toast" data-text="相册收藏保持现有入口">相册</button></div><div class="space-y-4">${DB.posts.filter(p=>p.saved||p.id===1).map(p=>postCard(p)).join('')}</div></main>
  </div>`;
}

/* ============================================================
   10. 时间线 / 碎碎念 / 数据看板 / 搜索
   ============================================================ */
function viewTimeline() {
  const years = [
    { year: 2026, items: [
      { date:'10.02', type:'trip', title:'大理的风，吹了五天', sub:'云南 · 大理 · 5 天 · 36 张照片', cover:IMG.road, id:1 },
      { date:'05.01', type:'trip', title:'泉州，半城烟火半城仙', sub:'福建 · 泉州 · 4 天 · 42 张照片', cover:IMG.town, id:2 }
    ]},
    { year: 2025, items: [
      { date:'12.20', type:'trip', title:'在阿勒泰等一场雪', sub:'新疆 · 阿勒泰 · 7 天 · 58 张照片', cover:IMG.lake, id:3 },
      { date:'08.17', type:'memory', title:'第一次在海边看日出', sub:'那天的云很轻，浪声盖过了说话声。', cover:IMG.sea, id:0 }
    ]}
  ];
  return `<div class="screen">${pageHeader('走过的时光',{backTo:'me',right:`<span class="text-[10px] faint">2 段旅程 · 1 条回忆</span>`})}
    <main class="px-5 py-5">${years.map(y=>`<section class="relative pl-7 pb-8"><div class="absolute left-0 top-0 bottom-0 w-px bg-[var(--line-strong)]"></div><div class="flex items-center gap-2 mb-4"><span class="w-4 h-4 rounded-full border-4 border-[var(--bg)] bg-[var(--primary)] -ml-[31px]"></span><h2 class="text-[19px] font-bold">${y.year}</h2></div><div class="space-y-4">${y.items.map(it=>`<button class="w-full card overflow-hidden text-left" ${it.type==='trip'?`data-go="trip/${it.id}"`:''}><div class="flex gap-3 p-3">${it.cover?`<span class="w-[72px] h-[78px] rounded-xl overflow-hidden flex-none">${img(it.cover,it.title)}</span>`:''}<span class="min-w-0 flex-1"><span class="pill ${it.type==='trip'?'pill-primary':'pill-accent'}">${it.type==='trip'?'旅程':'回忆'}</span><span class="block text-[13px] font-semibold mt-2 line-1">${esc(it.title)}</span><span class="block text-[10px] faint mt-1 line-2">${esc(it.sub)}</span><span class="block text-[10px] faint mt-1">${esc(it.date)}</span></span></div></button>`).join('')}</div></section>`).join('')}</main>
  </div>`;
}

function viewMoments() {
  return `<div class="screen">${pageHeader('碎碎念',{backTo:'me',right:`<button class="icon-btn" data-action="write-moment">${icon('plus','w-5 h-5')}</button>`})}
    <main class="px-5 py-4 space-y-3">${DB.moments.map(m=>`<article class="card p-4"><p class="text-[13px] leading-6">${esc(m.text)}</p><div class="flex items-center gap-2 mt-3"><span class="pill pill-primary">${esc(m.mood)}</span><span class="text-[10px] faint">${esc(m.time)}</span><button class="ml-auto text-[10px] faint" data-action="delete-moment" data-id="${m.id}">删除</button></div></article>`).join('')}</main>
  </div>`;
}

function viewDashboard() {
  const types = [['情侣',45,'var(--primary)'],['朋友',30,'var(--accent)'],['独旅',25,'#8b5cf6']];
  return `<div class="screen">${pageHeader('数据看板',{backTo:'me'})}
    <main class="px-5 py-4 space-y-5">
      <section class="card p-4"><p class="eyebrow">MY TRAVEL MEMORY</p><h2 class="text-[20px] font-bold mt-1">我的旅行记忆空间</h2><p class="text-[11px] leading-5 muted mt-1">走过的省份、写下的文字、拍下的照片，都在这里。</p><div class="grid grid-cols-3 gap-2 mt-4"><div class="stat-box"><b>8</b><span>点亮省份</span></div><div class="stat-box"><b>12</b><span>旅行记录</span></div><div class="stat-box"><b>486</b><span>照片</span></div></div></section>
      <section class="card p-4"><div class="section-head"><h2 class="text-[14px] font-bold">我的旅行足迹</h2><button class="section-link" data-go="journeys">去旅行记录</button></div><div class="map-card" style="min-height:180px"><div class="absolute inset-0 opacity-70" style="background-image:radial-gradient(circle,color-mix(in srgb,var(--primary) 18%,transparent) 1px,transparent 1px);background-size:15px 15px"></div><span class="map-dot big" style="left:30%;top:38%"></span><span class="map-dot" style="left:52%;top:58%"></span><span class="map-dot" style="left:72%;top:34%"></span></div></section>
      <section class="card p-4"><h2 class="text-[14px] font-bold">省份打卡</h2><div class="flex flex-wrap gap-2 mt-3">${['云南','福建','新疆','浙江','四川','广东','海南','青海'].map(p=>`<span class="chip chip-soft">${p}</span>`).join('')}</div></section>
      <section class="card p-4"><h2 class="text-[14px] font-bold">内容构成</h2><div class="space-y-3 mt-3">${[['旅行记录',12,'var(--primary)'],['旅行照片',486,'var(--accent)'],['回忆',32,'#8b5cf6']].map(([l,v,c])=>`<div><div class="flex justify-between text-[11px] mb-1.5"><span>${l}</span><span class="font-semibold">${v}</span></div><div class="progress-soft"><i style="width:${Math.min(100,Number(v)/5)}%;background:${c}"></i></div></div>`).join('')}</div></section>
      <section class="card p-4"><h2 class="text-[14px] font-bold">旅行类型</h2><div class="flex gap-2 mt-3">${types.map(([l,p,c])=>`<div class="flex-1 rounded-xl p-3 text-center" style="background:var(--surface-2)"><span class="block text-[18px] font-bold" style="color:${c}">${p}%</span><span class="text-[10px] faint">${l}</span></div>`).join('')}</div></section>
    </main>
  </div>`;
}

function viewSearch() {
  const q = state.searchQuery;
  const results = q ? DB.trips.filter(t => [t.title,t.location,t.description,t.companion].join(' ').includes(q)) : [];
  return `<div class="screen">${pageHeader('搜索',{backTo:'home'})}
    <main class="px-5 py-4">
      <form data-form="search" class="flex items-center gap-2 rounded-2xl px-3.5 py-1.5" style="background:var(--surface-2)">
        ${icon('search','w-5 h-5 text-[var(--text-3)]')}<input id="search-input" name="query" value="${esc(q)}" class="flex-1 h-11 bg-transparent text-[15px]" placeholder="搜索城市、地点或关键词" autofocus><button class="btn btn-sm btn-primary" type="submit">搜索</button>
      </form>
      ${!q?`<div class="mt-5"><p class="text-[12px] muted">试试热门标签</p><div class="flex flex-wrap gap-2 mt-3">${['大理','泉州','海边','独旅','情侣','雪','古城'].map(t=>`<button class="chip" data-search-tag="${t}">${icon('search','w-3.5 h-3.5')}${t}</button>`).join('')}</div></div>`:''}
      ${q&&!results.length?emptyState('map-pin','未找到相关内容',`没有匹配「${esc(q)}」的旅行记录。`):''}
      ${results.length?`<div class="mt-5 space-y-3"><p class="text-[11px] faint">找到 ${results.length} 条旅行记录</p>${results.map(tripCard).join('')}</div>`:''}
      ${!q?`<div class="mt-8"><div class="section-head"><h2 class="section-title">继续浏览</h2></div><div class="grid grid-cols-2 gap-3"><button class="card p-4 text-left" data-go="journeys">${icon('route','w-5 h-5 text-[var(--primary-strong)]')}<p class="text-[13px] font-semibold mt-2">我的旅程</p><p class="text-[10px] faint mt-1">按地图与省份查找</p></button><button class="card p-4 text-left" data-go="circle">${icon('compass','w-5 h-5 text-[var(--primary-strong)]')}<p class="text-[13px] font-semibold mt-2">旅行圈</p><p class="text-[10px] faint mt-1">发现大家的旅行</p></button></div></div>`:''}
    </main>
  </div>`;
}

/* ============================================================
   11. 账号设置 / 同步 / 登录
   ============================================================ */
function viewSettings() {
  return `<div class="screen">${pageHeader('账号设置',{backTo:'me'})}
    <main class="px-5 py-4 space-y-5">
      <section><div class="section-head"><h2 class="section-title">资料</h2></div><div class="list-group">
        <button class="list-row" data-action="edit-profile"><span class="list-icon">${icon('user','w-4 h-4')}</span><span class="list-main"><span class="list-title">昵称与签名</span><span class="list-sub">${esc(DB.user.name)} · ${esc(DB.user.bio)}</span></span>${icon('chevron-right','w-4 h-4 text-[var(--text-3)]')}</button>
        <button class="list-row" data-action="edit-avatar"><span class="list-icon">${icon('camera','w-4 h-4')}</span><span class="list-main"><span class="list-title">头像与档案头图</span><span class="list-sub">上传、裁剪与更换</span></span>${icon('chevron-right','w-4 h-4 text-[var(--text-3)]')}</button>
      </div></section>
      <section><div class="section-head"><h2 class="section-title">安全</h2></div><div class="list-group">
        <button class="list-row" data-action="change-password"><span class="list-icon">${icon('lock','w-4 h-4')}</span><span class="list-main"><span class="list-title">修改密码</span><span class="list-sub">至少 8 位字符</span></span>${icon('chevron-right','w-4 h-4 text-[var(--text-3)]')}</button>
        <button class="list-row" data-action="bind-email"><span class="list-icon">${icon('message','w-4 h-4')}</span><span class="list-main"><span class="list-title">绑定邮箱</span><span class="list-sub">用于验证码找回密码</span></span>${icon('chevron-right','w-4 h-4 text-[var(--text-3)]')}</button>
      </div></section>
      <section><div class="section-head"><h2 class="section-title">偏好</h2></div><div class="list-group">
        <button class="list-row" data-action="preference-survey"><span class="list-icon">${icon('sparkles','w-4 h-4')}</span><span class="list-main"><span class="list-title">旅行偏好</span><span class="list-sub">同行风格 · 惊喜 · 需要留意</span></span>${icon('chevron-right','w-4 h-4 text-[var(--text-3)]')}</button>
        <button class="list-row" data-action="toggle-theme"><span class="list-icon">${icon(state.theme==='dark'?'sun':'moon','w-4 h-4')}</span><span class="list-main"><span class="list-title">外观主题</span><span class="list-sub">${state.theme==='dark'?'深色模式':'浅色模式'}</span></span><span class="text-[11px] faint">切换</span></button>
      </div></section>
      <section><div class="section-head"><h2 class="section-title">关于</h2></div><div class="list-group">
        <button class="list-row" data-action="check-version"><span class="list-icon">${icon('info','w-4 h-4')}</span><span class="list-main"><span class="list-title">检查更新</span><span class="list-sub">当前版本 v1.29.1</span></span><span class="pill pill-primary">最新</span></button>
        <button class="list-row" data-action="logout"><span class="list-icon" style="background:var(--danger-soft);color:var(--danger)">${icon('logout','w-4 h-4')}</span><span class="list-main"><span class="list-title h-danger">退出登录</span><span class="list-sub">清空本地会话</span></span></button>
      </div></section>
    </main>
  </div>`;
}

function viewSync() {
  return `<div class="screen">${pageHeader('数据与同步',{backTo:'me'})}
    <main class="px-5 py-4 space-y-4">
      <section class="card p-4"><div class="flex items-center gap-3"><span class="w-11 h-11 rounded-2xl flex items-center justify-center" style="background:var(--primary-soft);color:var(--primary-strong)">${icon('cloud','w-5 h-5')}</span><div class="flex-1"><p class="text-[14px] font-semibold">${state.syncing?'正在同步…':'已连接云端'}</p><p class="text-[10px] faint mt-1">上次同步：刚刚</p></div><span class="pill pill-primary">在线</span></div><div class="progress-soft mt-4"><i style="width:${state.syncing?'68%':'100%'}"></i></div></section>
      <section class="card p-4"><div class="section-head !mb-2"><h2 class="text-[14px] font-bold">待同步内容</h2><span class="pill pill-accent">2 项</span></div><div class="list-group !border-0"><div class="list-row !px-0"><span class="list-icon">${icon('edit','w-4 h-4')}</span><span class="list-main"><span class="list-title">大理 · 新回忆</span><span class="list-sub">等待上传 · 本地已保存</span></span></div><div class="list-row !px-0"><span class="list-icon">${icon('image','w-4 h-4')}</span><span class="list-main"><span class="list-title">3 张旅行照片</span><span class="list-sub">等待上传 · 本地已缓存</span></span></div></div></section>
      <button class="btn btn-primary btn-block btn-lg" data-action="sync-now">${icon(state.syncing?'refresh':'cloud','w-4 h-4')}${state.syncing?'同步中…':'立即同步'}</button>
      <div class="offline-banner">${icon('cloud-off','w-4 h-4')}离线时仍可记录，联网后会自动同步；编辑待同步内容前会先完成上传。</div>
      <button class="btn btn-outline btn-block" data-action="toast" data-text="同步冲突处理规则已保留：以最后一次修改为准">查看同步规则</button>
    </main>
  </div>`;
}

function viewAuth() {
  return `<div class="screen no-tabbar" style="background:linear-gradient(160deg,var(--bg),var(--primary-soft))">
    <div class="px-6 safe-top py-10 min-h-dvh flex flex-col">
      <div class="mt-8"><span class="w-14 h-14 rounded-[18px] flex items-center justify-center text-white" style="background:var(--primary)">${icon('compass','w-7 h-7')}</span><h1 class="text-[30px] font-bold tracking-[-.04em] mt-6">甜途</h1><p class="text-[13px] muted mt-2">把走过的路，变成值得记住的故事。</p></div>
      <form data-form="login" class="card p-5 mt-8 space-y-4">
        <div class="seg"><button type="button" class="seg-btn active">登录</button><button type="button" class="seg-btn" data-action="register">注册</button></div>
        <label class="field"><span class="field-label">用户名</span><input class="input" name="username" value="linyu" placeholder="请输入用户名"></label>
        <label class="field"><span class="field-label">密码</span><input class="input" name="password" type="password" value="12345678" placeholder="请输入密码"></label>
        <div class="flex items-center justify-between text-[11px] faint"><label class="flex items-center gap-2"><input type="checkbox" checked>记住我</label><button type="button" data-action="forgot-password">忘记密码？</button></div>
        <button class="btn btn-primary btn-block btn-lg" type="submit">登录并进入</button>
      </form>
      <div class="mt-auto pt-8 text-center text-[10px] faint">继续即表示同意隐私与数据使用说明<br>甜途 v1.29.1</div>
    </div>
  </div>`;
}

/* ============================================================
   12. 新建旅程
   ============================================================ */
function viewNewTrip() {
  return `<div class="screen no-tabbar has-actionbar">
    ${pageHeader('新建旅程',{backTo:'home'})}
    <main class="px-5 py-4">
      <div class="flex items-center gap-2 mb-5"><span class="w-6 h-6 rounded-full bg-[var(--primary)] text-white text-[11px] flex items-center justify-center font-bold">1</span><span class="text-[11px] font-semibold">去哪</span><span class="flex-1 h-px bg-[var(--line-strong)]"></span><span class="w-6 h-6 rounded-full bg-[var(--surface-2)] text-[var(--text-3)] text-[11px] flex items-center justify-center font-bold">2</span><span class="text-[11px] faint">什么时候</span><span class="flex-1 h-px bg-[var(--line-strong)]"></span><span class="w-6 h-6 rounded-full bg-[var(--surface-2)] text-[var(--text-3)] text-[11px] flex items-center justify-center font-bold">3</span><span class="text-[11px] faint">记录</span></div>
      <form data-form="new-trip" class="form-stack">
        <label class="field"><span class="field-label">目的地</span><div class="relative">${icon('map-pin','w-5 h-5 absolute left-3 top-3.5 text-[var(--primary-strong)]')}<input class="input !pl-11" name="location" placeholder="例如：云南 · 大理" value="云南 · 大理" autofocus></div></label>
        <div class="sheet-form-grid"><label class="field"><span class="field-label">开始日期</span><input class="input" type="date" name="startDate" value="2026-11-20"></label><label class="field"><span class="field-label">结束日期</span><input class="input" type="date" name="endDate" value="2026-11-24"></label></div>
        <label class="field"><span class="field-label">旅程名称</span><input class="input" name="title" placeholder="例如：去有风的地方" value="去有风的地方"></label>
        <div class="field"><span class="field-label">这次和谁一起</span><div class="grid grid-cols-3 gap-2">${[['ALONE','独旅'],['COUPLE','情侣'],['FRIENDS','朋友'],['FAMILY','家庭'],['BFF','闺蜜 / 兄弟'],['GROUP','结伴']].map(([v,l],i)=>`<label class="chip justify-center ${i===1?'active':''}"><input type="radio" name="type" value="${v}" class="hidden" ${i===1?'checked':''}>${l}</label>`).join('')}</div></div>
        <label class="field"><span class="field-label">同行者（可选）</span><input class="input" name="companion" placeholder="例如：和阿澈"></label>
        <label class="field"><span class="field-label">放进哪个空间（可选）</span><select class="select" name="spaceId"><option value="">仅自己</option>${DB.spaces.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select><span class="hint">放进空间后，空间成员可以一起查看和编辑。</span></label>
        <div class="field"><span class="field-label">封面照片</span><button type="button" class="relative h-[150px] rounded-[16px] overflow-hidden" data-action="pick-cover">${img(IMG.road,'旅程封面')}<span class="absolute inset-0 flex items-center justify-center text-white" style="background:rgba(5,20,17,.28)"><span class="btn btn-sm" style="background:rgba(255,255,255,.9);color:#142523">${icon('camera','w-4 h-4')}选择封面</span></span></button></div>
        <p class="hint">创建后会直接进入旅程详情。目的地和日期可以先定，之后再补行程、照片与花销。</p>
      </form>
    </main>
    <div class="fixed left-1/2 -translate-x-1/2 bottom-0 z-40 w-full max-w-[430px] px-4 pt-3 pb-[calc(12px+var(--safe-bottom))] glass border-t border-[var(--line)]">
      <button class="btn btn-primary btn-lg btn-block" data-action="submit-form" data-form-target="new-trip">${icon('plane','w-4 h-4')}开始记录</button>
    </div>
  </div>`;
}

/* ============================================================
   13. 记录中心与各类表单
   ============================================================ */
function openRecordMenu() {
  openActionSheet('记录此刻', [
    { key:'trip', icon:'plane', label:'新建旅程', hint:'先定目的地和日期，再慢慢补齐', onClick:()=>go('new-trip') },
    { key:'memory', icon:'edit', label:'写一条回忆', hint:'文字、心情与照片记在同一天', onClick:()=>openMemoryForm() },
    { key:'photos', icon:'camera', label:'上传照片', hint:'一次最多 9 张，自动归档到旅程', onClick:()=>openPhotoForm() },
    { key:'expense', icon:'wallet', label:'记一笔花销', hint:'支持绑定到具体行程', onClick:()=>openExpenseForm() },
    { key:'moment', icon:'align-left', label:'碎碎念', hint:'不归属于某次旅行的小心情', onClick:()=>openMomentForm() }
  ]);
}

function tripOptions() {
  return DB.trips.map(t=>`<option value="${t.id}">${esc(t.title)}</option>`).join('');
}
function openMemoryForm(tripId = DB.trips[0].id) {
  const trip = DB.trips.find(t=>t.id===Number(tripId)) || DB.trips[0];
  openSheet('写一条回忆', `<form data-form="memory" class="form-stack">
    <label class="field"><span class="field-label">属于哪趟旅程</span><select class="select" name="tripId">${tripOptions()}</select></label>
    <label class="field"><span class="field-label">哪一天</span><select class="select" name="day">${trip.itinerary.map(d=>`<option value="${esc(d.label)}">${esc(d.label)} · ${esc(d.title)}</option>`).join('')}</select></label>
    <label class="field"><span class="field-label">标题</span><input class="input" name="title" placeholder="例如：在洱海边等到一场日落"></label>
    <label class="field"><span class="field-label">写点什么</span><textarea class="textarea" name="content" placeholder="此刻的风、遇到的人、没有说完的话…"></textarea></label>
    <div class="field"><span class="field-label">心情</span><div class="flex flex-wrap gap-2">${['开心','平静','幸福','惊喜','想念','累'].map((m,i)=>`<label class="chip ${i===1?'active':''}"><input type="radio" name="mood" value="${m}" class="hidden" ${i===1?'checked':''}>${m}</label>`).join('')}</div></div>
    <div class="field"><span class="field-label">谁能看到</span><div class="grid grid-cols-2 gap-2"><label class="chip justify-center active"><input type="radio" name="visibility" value="同行者" class="hidden" checked>仅自己和同行者</label><label class="chip justify-center"><input type="radio" name="visibility" value="公开" class="hidden">公开到旅行圈</label></div></div>
    <div class="field"><span class="field-label">照片 <span class="font-normal faint">最多 9 张</span></span><button type="button" class="h-24 rounded-2xl border border-dashed border-[var(--line-strong)] flex flex-col items-center justify-center gap-1 text-[var(--text-3)]" data-action="fake-pick-photo">${icon('camera','w-6 h-6')}<span class="text-[10px]">添加照片</span></button></div>
    <button class="btn btn-primary btn-lg btn-block" type="submit">${icon('check','w-4 h-4')}保存回忆</button>
  </form>`);
  const select = layerRoot.querySelector('select[name="tripId"]'); if(select) select.value = String(trip.id);
}

function openPhotoForm(tripId = DB.trips[0].id) {
  openSheet('上传照片', `<form data-form="photos" class="form-stack">
    <label class="field"><span class="field-label">加到哪趟旅程</span><select class="select" name="tripId">${tripOptions()}</select></label>
    <div class="grid grid-cols-3 gap-2">${[IMG.road,IMG.sea,IMG.town].map(src=>`<div class="aspect-square rounded-xl overflow-hidden">${img(src,'')}</div>`).join('')}<button type="button" class="aspect-square rounded-xl border border-dashed border-[var(--line-strong)] flex flex-col items-center justify-center gap-1 text-[var(--text-3)]" data-action="fake-pick-photo">${icon('plus','w-5 h-5')}<span class="text-[10px]">继续添加</span></button></div>
    <p class="hint">一次最多 9 张；上传后会自动生成缩略图与画册排版。</p>
    <button class="btn btn-primary btn-lg btn-block" type="submit">${icon('camera','w-4 h-4')}上传并归档</button>
  </form>`);
}

function openExpenseForm(tripId = DB.trips[0].id) {
  const trip = DB.trips.find(t=>t.id===Number(tripId)) || DB.trips[0];
  openSheet('记一笔花销', `<form data-form="expense" class="form-stack">
    <label class="field"><span class="field-label">属于哪趟旅程</span><select class="select" name="tripId">${tripOptions()}</select></label>
    <label class="field"><span class="field-label">金额（元）</span><input class="input" name="amount" type="number" inputmode="decimal" placeholder="例如 128"></label>
    <div class="field"><span class="field-label">分类</span><div class="grid grid-cols-3 gap-2">${['交通','住宿','餐饮','体验','购物','其他'].map((c,i)=>`<label class="chip justify-center ${i===2?'active':''}"><input type="radio" name="category" value="${c}" class="hidden" ${i===2?'checked':''}>${c}</label>`).join('')}</div></div>
    <label class="field"><span class="field-label">说明</span><input class="input" name="title" placeholder="例如：机场大巴"></label>
    <div class="sheet-form-grid"><label class="field"><span class="field-label">日期</span><input class="input" name="date" placeholder="10.03" value="10.03"></label><label class="field"><span class="field-label">付款人</span><input class="input" name="payer" placeholder="可选" value="我"></label></div>
    <label class="field"><span class="field-label">绑定行程（可选）</span><select class="select" name="itinerary"><option value="">不绑定，只计入总花销</option>${trip.itinerary.flatMap(d=>d.items.map(it=>`<option>${esc(d.label)} ${esc(it.time)} ${esc(it.title)}</option>`)).join('')}</select></label>
    <button class="btn btn-primary btn-lg btn-block" type="submit">${icon('check','w-4 h-4')}保存</button>
  </form>`);
}

function openItineraryForm(tripId = DB.trips[0].id, dayLabel = '') {
  const trip = DB.trips.find(t=>t.id===Number(tripId)) || DB.trips[0];
  openSheet('添加行程', `<form data-form="itinerary" data-id="${trip.id}" class="form-stack">
    <label class="field"><span class="field-label">哪一天</span><select class="select" name="day">${trip.itinerary.map(d=>`<option value="${esc(d.label)}">${esc(d.label)} · ${esc(d.title)}</option>`).join('')}</select></label>
    <div class="sheet-form-grid"><label class="field"><span class="field-label">时间</span><input class="input" name="time" placeholder="09:30"></label><label class="field"><span class="field-label">类型</span><select class="select" name="type"><option value="map-pin">地点</option><option value="camera">拍照</option><option value="plane">交通</option><option value="wallet">用餐</option><option value="hike">徒步</option></select></label></div>
    <label class="field"><span class="field-label">行程名称</span><input class="input" name="title" placeholder="例如：去洱海边看日落"></label>
    <label class="field"><span class="field-label">地点</span><input class="input" name="place" placeholder="例如：才村码头"></label>
    <label class="field"><span class="field-label">备注</span><textarea class="textarea" name="note" placeholder="交通、预约、注意事项…"></textarea></label>
    <button class="btn btn-primary btn-lg btn-block" type="submit">${icon('plus','w-4 h-4')}添加行程</button>
  </form>`);
  const select = layerRoot.querySelector('select[name="day"]'); if(select && dayLabel) select.value = dayLabel;
}

function openMomentForm() {
  openSheet('写下此刻', `<form data-form="moment" class="form-stack"><label class="field"><span class="field-label">碎碎念</span><textarea class="textarea !min-h-[140px]" name="content" placeholder="生活里的灵光、随想与小确幸…"></textarea></label><div class="field"><span class="field-label">心情</span><div class="flex flex-wrap gap-2">${['开心','平静','期待','想念','累'].map((m,i)=>`<label class="chip ${i===1?'active':''}"><input type="radio" name="mood" value="${m}" class="hidden" ${i===1?'checked':''}>${m}</label>`).join('')}</div></div><button class="btn btn-primary btn-lg btn-block" type="submit">发布</button></form>`);
}

function openNewAlbumForm() {
  openSheet('新建纪念相册', `<form data-form="new-album" class="form-stack"><label class="field"><span class="field-label">相册名称</span><input class="input" name="title" placeholder="例如：2026 年的秋天"></label><label class="field"><span class="field-label">描述（可选）</span><textarea class="textarea" name="desc" placeholder="这本相册用来记录什么？"></textarea></label><label class="field"><span class="field-label">关联旅程（可选）</span><select class="select" name="tripId"><option value="">不关联</option>${tripOptions()}</select></label><button class="btn btn-primary btn-lg btn-block" type="submit">创建相册</button></form>`);
}

function openCreateSpaceForm() {
  openSheet('创建空间', `<form data-form="create-space" class="form-stack"><div class="field"><span class="field-label">空间类型</span><div class="grid grid-cols-2 gap-2">${[['COUPLE','情侣空间'],['FRIENDS','朋友空间'],['FAMILY','家庭空间'],['ALONE','个人空间']].map(([v,l],i)=>`<label class="chip justify-center ${i===0?'active':''}"><input type="radio" name="type" value="${v}" class="hidden" ${i===0?'checked':''}>${l}</label>`).join('')}</div></div><label class="field"><span class="field-label">空间名称</span><input class="input" name="name" placeholder="例如：山与海之间"></label><label class="field"><span class="field-label">简介</span><textarea class="textarea" name="desc" placeholder="一句话说明这个空间用来记录什么"></textarea></label><button class="btn btn-primary btn-lg btn-block" type="submit">创建空间</button></form>`);
}

function openJoinSpaceForm() {
  openSheet('输入邀请码加入', `<form data-form="join-space" class="form-stack"><label class="field"><span class="field-label">邀请码</span><input class="input text-center tracking-[.2em] uppercase" name="code" placeholder="7XK2-M9PQ"></label><p class="hint">加入后默认为成员，可以一起编辑旅行与相册。</p><button class="btn btn-primary btn-lg btn-block" type="submit">加入空间</button></form>`);
}

function openInviteSheet(spaceId) {
  openSheet('邀请伙伴', `<div class="space-y-4"><div class="sheet-form-grid"><label class="field"><span class="field-label">邀请角色</span><select class="select"><option>成员 · 可一起编辑</option><option>访客 · 只能查看</option></select></label><label class="field"><span class="field-label">有效期</span><select class="select"><option>7 天</option><option>3 天</option><option>30 天</option></select></label></div><div class="card p-4 text-center"><p class="text-[11px] faint">邀请码</p><p class="text-[24px] font-bold tracking-[.18em] mt-1">7XK2-M9PQ</p><p class="text-[10px] faint mt-1">剩余 6 天 · 仅可使用一次</p><div class="flex gap-2 mt-3"><button class="btn btn-sm btn-secondary flex-1" data-action="copy-invite">${icon('share','w-4 h-4')}复制链接</button><button class="btn btn-sm btn-primary flex-1" data-action="copy-invite">${icon('check','w-4 h-4')}复制邀请码</button></div></div><div class="section-head !mb-1"><h2 class="text-[13px] font-bold">邀请记录</h2></div><div class="list-group"><div class="list-row"><span class="list-icon">${icon('clock','w-4 h-4')}</span><span class="list-main"><span class="list-title">MEMBER · 7 天</span><span class="list-sub">待使用 · 创建于今天</span></span><span class="pill pill-accent">待使用</span></div><div class="list-row"><span class="list-icon">${icon('check','w-4 h-4')}</span><span class="list-main"><span class="list-title">VIEWER · 3 天</span><span class="list-sub">已被使用 · 2 天前</span></span><span class="pill pill-primary">已使用</span></div></div></div>`);
}

function openProfileForm() {
  openSheet('编辑资料', `<form data-form="profile" class="form-stack"><label class="field"><span class="field-label">昵称</span><input class="input" name="nickname" value="${esc(DB.user.name)}" maxlength="24"></label><label class="field"><span class="field-label">个性签名</span><textarea class="textarea" name="bio" maxlength="120">${esc(DB.user.bio)}</textarea></label><p class="hint">账号名 @${esc(DB.user.handle)} 不在此处修改。</p><button class="btn btn-primary btn-lg btn-block" type="submit">保存资料</button></form>`);
}

function openRegisterForm() {
  openSheet('注册新账号', `<form data-form="register" class="form-stack"><label class="field"><span class="field-label">用户名</span><input class="input" name="username" placeholder="请输入用户名"></label><label class="field"><span class="field-label">密码</span><input class="input" type="password" name="password" placeholder="至少 8 位字符"></label><label class="field"><span class="field-label">确认密码</span><input class="input" type="password" name="confirm" placeholder="再次输入密码"></label><p class="hint">注册后会进入偏好问卷，可随时跳过。</p><button class="btn btn-primary btn-lg btn-block" type="submit">注册并进入</button></form>`);
}

function openPasswordForm() {
  openSheet('修改密码', `<form data-form="password" class="form-stack"><label class="field"><span class="field-label">当前密码</span><input class="input" name="current" type="password" placeholder="输入当前密码"></label><label class="field"><span class="field-label">新密码</span><input class="input" name="next" type="password" placeholder="至少 8 位字符"></label><label class="field"><span class="field-label">确认新密码</span><input class="input" name="confirm" type="password" placeholder="再次输入新密码"></label><button class="btn btn-primary btn-lg btn-block" type="submit">更新密码</button></form>`);
}

function openEmailForm() {
  openSheet('绑定邮箱', `<form data-form="email" class="form-stack"><label class="field"><span class="field-label">邮箱地址</span><input class="input" name="email" type="email" placeholder="example@email.com"></label><label class="field"><span class="field-label">验证码</span><div class="flex gap-2"><input class="input flex-1" name="code" placeholder="6 位验证码"><button type="button" class="btn btn-outline" data-action="toast" data-text="验证码已发送（Demo 验证码 123456）">发送验证码</button></div></label><p class="hint">绑定后可通过邮箱找回密码。Demo 环境验证码为 123456。</p><button class="btn btn-primary btn-lg btn-block" type="submit">绑定邮箱</button></form>`);
}

function openPreferenceForm() {
  openSheet('旅行偏好', `<form data-form="preference" class="form-stack"><div class="field"><span class="field-label">通常和谁出发</span><div class="grid grid-cols-2 gap-2">${[['ALONE','独旅'],['COUPLE','情侣'],['FRIENDS','朋友'],['FAMILY','家庭']].map(([v,l],i)=>`<label class="chip justify-center ${i===1?'active':''}"><input type="radio" name="companion" value="${v}" class="hidden" ${i===1?'checked':''}>${l}</label>`).join('')}</div></div><div class="field"><span class="field-label">会让你惊喜</span><div class="flex flex-wrap gap-2">${['日出日落','当地小店','徒步','博物馆','海边'].map(t=>`<label class="chip"><input type="checkbox" name="delights" value="${t}" class="hidden">${t}</label>`).join('')}</div></div><div class="field"><span class="field-label">需要特别留意</span><div class="flex flex-wrap gap-2">${['怕晒','不吃香菜','晕车','早起困难'].map(t=>`<label class="chip"><input type="checkbox" name="cautions" value="${t}" class="hidden">${t}</label>`).join('')}</div><p class="hint">这些偏好只会作为行程页提示，不会自动修改你的行程。</p></div><button class="btn btn-primary btn-lg btn-block" type="submit">保存偏好</button></form>`);
}

function openExportSheet() {
  openSheet('导出记忆档案', `<div class="space-y-4"><label class="field"><span class="field-label">选择旅行</span><select class="select">${tripOptions()}</select></label><div class="field"><span class="field-label">导出形式</span><div class="grid grid-cols-2 gap-2"><label class="chip justify-center active"><input type="radio" name="format" class="hidden" checked>分享卡片</label><label class="chip justify-center"><input type="radio" name="format" class="hidden">完整档案 ZIP</label></div></div><div class="card p-4"><div class="flex items-center gap-3"><span class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:var(--primary-soft);color:var(--primary-strong)">${icon('file-text','w-4 h-4')}</span><div><p class="text-[12px] font-semibold">分享卡片（HTML）</p><p class="text-[10px] faint mt-0.5">自包含单文件，适合分享与留档</p></div></div><p class="text-[10px] faint mt-3">完整档案包含 JSON、Markdown 与原图 ZIP。导出时会让你选择保存位置。</p></div><button class="btn btn-primary btn-lg btn-block" data-action="do-export">${icon('download','w-4 h-4')}导出</button></div>`);
}

/* ============================================================
   14. 动作分发
   ============================================================ */
function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = state.theme;
  render();
  toast(state.theme === 'dark' ? '已切换深色模式' : '已切换浅色模式');
}

function handleAction(action, el) {
  const id = Number(el.dataset.id || 0);
  switch (action) {
    case 'back': back(el.dataset.fallback || 'home'); break;
    case 'open-record': openRecordMenu(); break;
    case 'open-record-memory': openMemoryForm(); break;
    case 'open-record-photo': openPhotoForm(); break;
    case 'open-record-expense': openExpenseForm(); break;
    case 'new-trip': go('new-trip'); break;
    case 'quick-memory': openMemoryForm(id); break;
    case 'quick-photo': openPhotoForm(id); break;
    case 'add-itinerary': openItineraryForm(id, el.dataset.day || ''); break;
    case 'add-expense': openExpenseForm(id); break;
    case 'upload-photos': openPhotoForm(id); break;
    case 'open-photo': openPhoto(el.dataset.src, el.dataset.title || '照片'); break;
    case 'photo-comment': openPhotoCommentSheet(); break;
    case 'open-book': openBookViewer(id || 1); break;
    case 'book-prev': toast('已经是第一页'); break;
    case 'book-next': toast('继续翻页 · 下一章'); break;
    case 'book-theme': toast('已切换画册主题'); break;
    case 'share-trip': toast('分享链接已复制'); break;
    case 'trip-more': openTripActions(id); break;
    case 'itinerary-actions': openActionSheet(el.dataset.title, [
      { key:'edit', icon:'edit', label:'编辑这条行程', onClick:()=>openItineraryForm(id, el.dataset.day) },
      { key:'delete', icon:'trash', label:'删除这条行程', danger:true, onClick:()=>toast('已删除（Demo）') }
    ]); break;
    case 'add-day': toast('已添加一天，可在行程里继续安排'); break;
    case 'set-budget': openBudgetForm(id); break;
    case 'expense-actions': openActionSheet('花销操作', [
      { key:'edit', icon:'edit', label:'编辑这笔花销', onClick:()=>openExpenseForm(Number(el.dataset.trip)) },
      { key:'delete', icon:'trash', label:'删除这笔花销', danger:true, onClick:()=>toast('已删除（Demo）') }
    ]); break;
    case 'open-album': {
      const album = DB.albums.find(a=>a.id===id);
      if (album?.locked && !state.unlockedAlbums.has(id)) openUnlockSheet(album);
      else go('album/' + id);
      break;
    }
    case 'new-album': openNewAlbumForm(); break;
    case 'album-more': openActionSheet('相册操作', [{key:'edit',icon:'edit',label:'编辑相册',onClick:()=>toast('编辑相册（Demo）')},{key:'delete',icon:'trash',label:'删除相册',danger:true,onClick:()=>openDialog({title:'删除这本相册？',message:'相册内的照片会一并移出，操作不可恢复。',destructive:true,confirmText:'删除',onConfirm:()=>{toast('已删除（Demo）');go('albums')}})}]); break;
    case 'upload-album-photo': openPhotoForm(DB.albums.find(a=>a.id===id)?.tripId || 1); break;
    case 'share-album': toast('相册分享链接已复制'); break;
    case 'like': {
      const post = DB.posts.find(p=>p.id===id); if(!post) break;
      post.liked = !post.liked; post.likes += post.liked ? 1 : -1;
      $$(`[data-like-count="${id}"]`).forEach(n=>n.textContent = post.likes);
      $$(`[data-action="like"][data-id="${id}"]`).forEach(btn=>{btn.classList.toggle('on',post.liked);const svg=btn.querySelector('svg');if(svg)svg.setAttribute('fill',post.liked?'currentColor':'none');});
      toast(post.liked?'已点赞':'已取消点赞'); break;
    }
    case 'save': {
      const post = DB.posts.find(p=>p.id===id); if(!post) break;
      post.saved = !post.saved; post.favorites += post.saved ? 1 : -1;
      $$(`[data-save-count="${id}"]`).forEach(n=>n.textContent = post.favorites);
      $$(`[data-action="save"][data-id="${id}"]`).forEach(btn=>{btn.classList.toggle('saved',post.saved);const svg=btn.querySelector('svg');if(svg)svg.setAttribute('fill',post.saved?'currentColor':'none');});
      toast(post.saved?'已收藏':'已取消收藏'); break;
    }
    case 'comments': openComments(id); break;
    case 'share': toast('分享链接已复制'); break;
    case 'post-more': openActionSheet('这篇旅行', [{key:'report',icon:'info',label:'举报这篇旅行',onClick:()=>openReportForm()},{key:'block',icon:'user-minus',label:'屏蔽作者',danger:true,onClick:()=>toast('已屏蔽作者，TA 的内容不再出现')},{key:'copy',icon:'share',label:'复制链接',onClick:()=>toast('链接已复制')}]); break;
    case 'like-comment': {
      const postId = Number(el.dataset.post); const cid = Number(el.dataset.id); const c = DB.comments[postId]?.find(x=>x.id===cid); if(!c) break; c.liked=!c.liked; c.likes+=c.liked?1:-1; openComments(postId); break;
    }
    case 'open-people': openPeopleSheet(el.dataset.kind); break;
    case 'follow-user': el.textContent='已关注'; el.classList.remove('btn-primary'); el.classList.add('btn-secondary'); toast('已关注'); break;
    case 'block-user': openDialog({title:'屏蔽这位旅行者？',message:'TA 的公开内容将不再出现在你的旅行圈里，可随时取消。',confirmText:'屏蔽',destructive:true,onConfirm:()=>toast('已屏蔽')}); break;
    case 'create-space': openCreateSpaceForm(); break;
    case 'join-space': openJoinSpaceForm(); break;
    case 'invite-space': openInviteSheet(id); break;
    case 'space-more': openActionSheet('空间操作', [{key:'settings',icon:'settings',label:'空间设置',onClick:()=>toast('空间设置（Demo）')},{key:'leave',icon:'logout',label:'退出空间',danger:true,onClick:()=>openDialog({title:'退出这个空间？',message:'退出后将无法查看空间内的共享内容。',confirmText:'退出',destructive:true,onConfirm:()=>{toast('已退出空间');go('spaces')}})}]); break;
    case 'member-actions': openActionSheet(el.dataset.name, [{key:'role',icon:'user',label:'设为访客',onClick:()=>toast('成员角色已更新')},{key:'remove',icon:'user-minus',label:'移出空间',danger:true,onClick:()=>openDialog({title:`移出「${el.dataset.name}」？`,message:'TA 将立即失去空间内所有内容的访问权。',confirmText:'移出',destructive:true,onConfirm:()=>toast('已移出空间')})}]); break;
    case 'edit-profile': openProfileForm(); break;
    case 'edit-avatar': openSheet('更换头像与头图', `<div class="space-y-3"><button class="action-row" data-action="toast" data-text="已打开相册选择器（Demo）"><span class="action-icon">${icon('camera','w-4 h-4')}</span><span class="flex-1"><span class="block text-[14px] font-semibold">更换头像</span><span class="block text-[10px] faint">建议使用正方形图片</span></span></button><button class="action-row" data-action="toast" data-text="已打开头图选择器（Demo）"><span class="action-icon">${icon('image','w-4 h-4')}</span><span class="flex-1"><span class="block text-[14px] font-semibold">更换档案头图</span><span class="block text-[10px] faint">支持调整焦点位置</span></span></button></div>`); break;
    case 'change-password': openPasswordForm(); break;
    case 'bind-email': openEmailForm(); break;
    case 'preference-survey': openPreferenceForm(); break;
    case 'check-version': toast('已是最新版本 v1.29.1'); break;
    case 'toggle-theme': toggleTheme(); break;
    case 'logout': openDialog({title:'退出登录？',message:'本地会话会被清空，离线未同步内容仍保留在本机。',confirmText:'退出',destructive:true,onConfirm:()=>{state.loggedIn=false;go('auth')}}); break;
    case 'export-archive': openExportSheet(); break;
    case 'do-export': closeLayer(); toast('正在导出分享卡片…'); setTimeout(()=>toast('导出完成（Demo）'),900); break;
    case 'mark-all-read': DB.notifications.forEach(n=>n.unread=false); render(); toast('已全部标为已读'); break;
    case 'notification-click': { const n=DB.notifications.find(x=>x.id===id); if(n)n.unread=false; go(n?.text.includes('评论')?'post/1':'post/1'); break; }
    case 'write-moment': openMomentForm(); break;
    case 'delete-moment': DB.moments=DB.moments.filter(m=>m.id!==id); render(); toast('已删除'); break;
    case 'sync-now': state.syncing=true; render(); toast('开始同步…'); setTimeout(()=>{state.syncing=false;render();toast('同步完成');},1200); break;
    case 'pick-cover': toast('已选择封面（Demo）'); break;
    case 'fake-pick-photo': toast('已添加照片（Demo）'); break;
    case 'copy-invite': toast('已复制到剪贴板'); break;
    case 'register': openRegisterForm(); break;
    case 'forgot-password': openSheet('找回密码', `<form data-form="forgot" class="form-stack"><label class="field"><span class="field-label">绑定邮箱</span><input class="input" type="email" name="email" placeholder="example@email.com"></label><label class="field"><span class="field-label">验证码</span><div class="flex gap-2"><input class="input flex-1" name="code" placeholder="6 位验证码"><button type="button" class="btn btn-outline" data-action="toast" data-text="验证码已发送（Demo 123456）">发送</button></div></label><button class="btn btn-primary btn-lg btn-block" type="submit">下一步</button></form>`); break;
    case 'submit-form': { const f=document.querySelector(`[data-form="${el.dataset.formTarget}"]`); f?.requestSubmit(); break; }
    case 'toast': toast(el.dataset.text || '操作完成'); break;
    default: break;
  }
}

function openTripActions(tripId) {
  openActionSheet('旅程操作', [
    {key:'edit',icon:'edit',label:'编辑旅程信息',onClick:()=>toast('编辑旅程（Demo）')},
    {key:'space',icon:'users',label:'移动到共享空间',onClick:()=>openSheet('放到哪里？', `<div class="space-y-2"><button class="action-row" data-action="toast" data-text="已设为仅自己可见"><span class="action-icon">${icon('user','w-4 h-4')}</span><span class="flex-1"><span class="block text-[14px] font-semibold">仅自己</span><span class="block text-[10px] faint">不放进任何空间</span></span></button>${DB.spaces.map(s=>`<button class="action-row" data-action="toast" data-text="已移动到「${esc(s.name)}」"><span class="action-icon">${icon('users','w-4 h-4')}</span><span class="flex-1"><span class="block text-[14px] font-semibold">${esc(s.name)}</span><span class="block text-[10px] faint">${esc(s.typeLabel)} · ${s.members} 位成员</span></span></button>`).join('')}</div>`)},
    {key:'archive',icon:'check-circle',label:'完成并归档',onClick:()=>{const t=DB.trips.find(x=>x.id===tripId);if(t)t.status='done';toast('旅程已归档');go('journeys')}},
    {key:'delete',icon:'trash',label:'删除旅程',danger:true,onClick:()=>openDialog({title:'删除这趟旅程？',message:'旅程内的行程、照片、回忆与花销都会一并删除，操作不可恢复。',confirmText:'删除',destructive:true,onConfirm:()=>{DB.trips=DB.trips.filter(x=>x.id!==tripId);toast('已删除');go('journeys')}})}
  ]);
}

function openPeopleSheet(kind = 'followers') {
  const people = [{name:'南枝',desc:'走过 18 段旅程',avatar:IMG.dusk},{name:'阿澈',desc:'你们的共同空间：山与海之间',avatar:IMG.balloon},{name:'小满',desc:'泉州 · 朋友空间',avatar:IMG.town},{name:'远山',desc:'喜欢一个人去北方',avatar:IMG.hike}];
  const rows = people.map(p => '<button class="list-row" data-action="toast" data-text="已打开 ' + esc(p.name) + ' 的主页（Demo）"><span>' + avatar(p.avatar, 38) + '</span><span class="list-main"><span class="list-title">' + esc(p.name) + '</span><span class="list-sub">' + esc(p.desc) + '</span></span><span class="btn btn-sm btn-secondary">查看</span></button>').join('');
  openSheet(kind === 'following' ? '正在关注' : '关注者', '<div class="list-group">' + rows + '</div>');
}

function openReportForm() {
  openSheet('举报这篇旅行', `<form data-form="report" class="form-stack"><label class="field"><span class="field-label">举报原因</span><textarea class="textarea" name="reason" placeholder="请填写举报原因，如不当内容、广告、侵犯隐私等"></textarea></label><button class="btn btn-danger btn-lg btn-block" type="submit">提交举报</button></form>`);
}

function openBudgetForm(tripId) {
  const trip = DB.trips.find(t=>t.id===tripId);
  openSheet('旅行预算', `<form data-form="budget" data-id="${tripId}" class="form-stack"><label class="field"><span class="field-label">预算（元）</span><input class="input" type="number" name="budget" value="${trip?.budget||''}" placeholder="例如 5000"></label><button class="btn btn-primary btn-lg btn-block" type="submit">保存预算</button>${trip?.budget?`<button type="button" class="btn btn-ghost btn-block" data-action="toast" data-text="已清空预算">清空预算</button>`:''}</form>`);
}

function openPhotoCommentSheet() {
  openSheet('照片留言', `<div class="space-y-3"><div class="space-y-3"><div class="flex gap-2.5"><span class="avatar" style="width:30px;height:30px">${img(IMG.dusk,'')}</span><div><p class="text-[11px] font-semibold">阿澈</p><p class="text-[12px] muted mt-0.5">这里的风一定很好听。</p></div></div><div class="flex gap-2.5"><span class="avatar" style="width:30px;height:30px">${img(IMG.balloon,'')}</span><div><p class="text-[11px] font-semibold">林屿</p><p class="text-[12px] muted mt-0.5">下次还要再来。</p></div></div></div><form data-form="photo-comment" class="flex gap-2 pt-3 border-t border-[var(--line)]"><input class="input flex-1" name="content" placeholder="写下一句留言…"><button class="btn btn-primary" type="submit">${icon('send','w-4 h-4')}</button></form></div>`);
}

/* ============================================================
   15. 表单提交
   ============================================================ */
function formValue(form, name) { return form.elements[name]?.value?.trim?.() ?? ''; }
function formRadio(form, name) { return form.querySelector(`input[name="${name}"]:checked`)?.value || ''; }

document.addEventListener('submit', event => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const kind = form.dataset.form;
  const id = Number(form.dataset.id || 0);

  if (kind === 'new-trip') {
    const location = formValue(form,'location') || '未命名目的地';
    const startDate = formValue(form,'startDate') || '2026-11-20';
    const endDate = formValue(form,'endDate') || startDate;
    const title = formValue(form,'title') || location;
    const days = Math.max(1, Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1);
    const trip = { id: Date.now(), title, location, startDate, endDate, status:'active', type:formRadio(form,'type')||'COUPLE', companion:formValue(form,'companion')||'独自出发', cover:IMG.road, photos:0, days, budget:0, spent:0, spaceId:Number(formValue(form,'spaceId'))||null, province:'', city:'', description:'刚刚开始记录的旅程。', itinerary:[{date:startDate.slice(5),week:'待定',label:startDate.slice(5),title:'抵达与安顿',items:[]}], memories:[], expenses:[] };
    DB.trips.unshift(trip); state.selectedDay='all'; toast('旅程已创建'); go('trip/'+trip.id); return;
  }
  if (kind === 'memory') {
    const trip = DB.trips.find(t=>t.id===Number(formValue(form,'tripId'))) || DB.trips[0];
    const title = formValue(form,'title');
    if (!title) { toast('给这条回忆写个标题吧','error'); return; }
    trip.memories.unshift({id:Date.now(),day:formValue(form,'day')||'今天',title,content:formValue(form,'content'),mood:formRadio(form,'mood')||'此刻',photos:[IMG.boat,IMG.sea],visibility:formRadio(form,'visibility')||'同行者'});
    closeLayer(); render(); toast('回忆已保存'); return;
  }
  if (kind === 'photos') {
    const trip = DB.trips.find(t=>t.id===Number(formValue(form,'tripId'))) || DB.trips[0];
    trip.photos += 3; closeLayer(); render(); toast('3 张照片已上传并归档'); return;
  }
  if (kind === 'expense') {
    const trip = DB.trips.find(t=>t.id===Number(formValue(form,'tripId'))) || DB.trips[0];
    const amount = Number(formValue(form,'amount'));
    if (!amount || amount <= 0) { toast('请输入有效金额','error'); return; }
    trip.expenses.unshift({id:Date.now(),category:formRadio(form,'category')||'其他',title:formValue(form,'title')||'旅行花销',amount,date:formValue(form,'date')||'今天',payer:formValue(form,'payer')||'我'});
    trip.spent += amount; closeLayer(); render(); toast('已记一笔 ¥'+money(amount)); return;
  }
  if (kind === 'itinerary') {
    const trip = DB.trips.find(t=>t.id===id) || DB.trips[0];
    const dayLabel = formValue(form,'day');
    const day = trip.itinerary.find(d=>d.label===dayLabel) || trip.itinerary[0];
    const title = formValue(form,'title');
    if (!title) { toast('请输入行程名称','error'); return; }
    day.items.push({time:formValue(form,'time')||'待定',type:formValue(form,'type')||'map-pin',title,place:formValue(form,'place')||'',note:formValue(form,'note')||'',expense:0});
    closeLayer(); render(); toast('行程已添加'); return;
  }
  if (kind === 'moment') {
    const content = formValue(form,'content');
    if (!content) { toast('写点什么再发布吧','error'); return; }
    DB.moments.unshift({id:Date.now(),text:content,time:'刚刚',mood:formRadio(form,'mood')||'此刻'}); closeLayer(); render(); toast('已发布碎碎念'); return;
  }
  if (kind === 'comment') {
    const content = formValue(form,'content');
    if (!content) return;
    const post = DB.posts.find(p=>p.id===id); if(!post) return;
    DB.comments[id] = DB.comments[id] || [];
    DB.comments[id].push({id:Date.now(),user:DB.user.name,avatar:DB.user.avatar,text:content,time:'刚刚',likes:0,liked:false});
    post.comments += 1; closeLayer(); render(); toast('评论已发布'); return;
  }
  if (kind === 'new-album') {
    const title = formValue(form,'title'); if(!title){toast('请输入相册名称','error');return;}
    DB.albums.unshift({id:Date.now(),title,date:'2026.11',photos:0,cover:IMG.dusk,locked:false,type:'其他',tripId:Number(formValue(form,'tripId'))||null});
    closeLayer(); render(); toast('相册已创建'); return;
  }
  if (kind === 'create-space') {
    const name = formValue(form,'name'); if(!name){toast('请输入空间名称','error');return;}
    const type=formRadio(form,'type')||'COUPLE'; const typeLabel={COUPLE:'情侣空间',FRIENDS:'朋友空间',FAMILY:'家庭空间',ALONE:'个人空间'}[type]||'共享空间';
    DB.spaces.unshift({id:Date.now(),name,type,typeLabel,role:'OWNER',members:1,travels:0,albums:0,memories:0,photos:0,cover:IMG.road,desc:formValue(form,'desc')||'一起记录，各自上色。',memberList:[{name:DB.user.name,role:'主人',avatar:DB.user.avatar}],activity:[]});
    closeLayer(); render(); toast('空间已创建，去邀请伙伴吧'); return;
  }
  if (kind === 'join-space') { const code=formValue(form,'code'); if(!code){toast('请输入邀请码','error');return;} closeLayer(); toast('已加入空间「山与海之间」'); go('space/1'); return; }
  if (kind === 'profile') { DB.user.name=formValue(form,'nickname')||DB.user.name; DB.user.bio=formValue(form,'bio')||DB.user.bio; closeLayer(); render(); toast('资料已保存'); return; }
  if (kind === 'register') { const username=formValue(form,'username'), password=formValue(form,'password'), confirm=formValue(form,'confirm'); if(!username){toast('请输入用户名','error');return;} if(password.length<8){toast('密码至少需要 8 位','error');return;} if(password!==confirm){toast('两次输入的密码不一致','error');return;} DB.user.name=username; state.loggedIn=true; closeLayer(); toast('注册成功'); go('home'); return; }
  if (kind === 'password') { const next=formValue(form,'next'), confirm=formValue(form,'confirm'); if(next.length<8){toast('新密码至少需要 8 位','error');return;} if(next!==confirm){toast('两次输入的密码不一致','error');return;} closeLayer(); toast('密码已更新'); return; }
  if (kind === 'email') { const email=formValue(form,'email'); if(!email.includes('@')){toast('请输入有效邮箱','error');return;} closeLayer(); toast('邮箱绑定成功'); return; }
  if (kind === 'preference') { DB.preferences.companion=formRadio(form,'companion')||'COUPLE'; closeLayer(); toast('旅行偏好已保存'); return; }
  if (kind === 'unlock-album') { const pwd=formValue(form,'password').replaceAll('/','-').replace('年','-').replace('月','-').replace('日',''); if(pwd==='2023-06-20'){state.unlockedAlbums.add(id);closeLayer();go('album/'+id);toast('相册已解锁');}else{toast('密码不正确，请重试','error');} return; }
  if (kind === 'budget') { const t=DB.trips.find(x=>x.id===id); const b=Number(formValue(form,'budget')); if(t&&b>0){t.budget=b;closeLayer();render();toast('预算已更新');} return; }
  if (kind === 'search') { state.searchQuery=formValue(form,'query'); render(); setTimeout(()=>$('#search-input')?.focus(),20); return; }
  if (kind === 'report') { closeLayer(); toast('举报已提交，等待处理'); return; }
  if (kind === 'photo-comment') { const c=formValue(form,'content'); if(!c)return; closeLayer(); toast('留言已发送'); return; }
  if (kind === 'forgot') { closeLayer(); toast('验证码验证成功，请设置新密码（Demo）'); return; }
  if (kind === 'login') { state.loggedIn=true; toast('欢迎回来'); go('home'); return; }
});

/* ============================================================
   16. 渲染入口与事件绑定
   ============================================================ */
function render() {
  const { key } = parseRoute();
  if (!state.loggedIn && key !== 'auth') { location.hash = '#/auth'; return; }
  if (key === 'trip' && !state.params.tab) state.tripTab = 'overview';
  if (key !== 'trip') state.selectedDay = 'all';

  let html = '';
  switch (key) {
    case 'auth': html = viewAuth(); break;
    case 'journeys': html = viewJourneys(); break;
    case 'trip': html = viewTrip(); break;
    case 'albums': html = viewAlbums(); break;
    case 'album': html = viewAlbumDetail(); break;
    case 'circle': html = viewCircle(); break;
    case 'post': html = viewPost(); break;
    case 'user': html = viewUser(); break;
    case 'spaces': html = viewSpaces(); break;
    case 'space': html = viewSpace(); break;
    case 'me': html = viewMe(); break;
    case 'notifications': html = viewNotifications(); break;
    case 'favorites': html = viewFavorites(); break;
    case 'timeline': html = viewTimeline(); break;
    case 'moments': html = viewMoments(); break;
    case 'dashboard': html = viewDashboard(); break;
    case 'search': html = viewSearch(); break;
    case 'settings': html = viewSettings(); break;
    case 'sync': html = viewSync(); break;
    case 'new-trip': html = viewNewTrip(); break;
    default: html = viewHome(); break;
  }

  app.innerHTML = html + (showTabbar(key) ? tabbar(activeTab(key)) : '');
  document.documentElement.dataset.theme = state.theme;
  window.scrollTo({ top: 0, behavior: 'instant' });
}

document.addEventListener('click', event => {
  const close = event.target.closest('[data-close-layer]');
  if (close) { closeLayer(); return; }

  const goEl = event.target.closest('[data-go]');
  if (goEl) { event.preventDefault(); go(goEl.dataset.go); return; }

  const actionEl = event.target.closest('[data-action]');
  if (actionEl) { event.preventDefault(); handleAction(actionEl.dataset.action, actionEl); return; }

  const tripTab = event.target.closest('[data-trip-tab]');
  if (tripTab) { state.tripTab = tripTab.dataset.tripTab; go(`trip/${state.params.id}?tab=${state.tripTab}`); return; }

  const dayEl = event.target.closest('[data-day-select]');
  if (dayEl) { state.selectedDay = dayEl.dataset.daySelect; render(); return; }

  const albumMode = event.target.closest('[data-album-mode]');
  if (albumMode) { state.albumMode = albumMode.dataset.albumMode; go(`albums?mode=${state.albumMode}`); return; }

  const albumFilter = event.target.closest('[data-album-filter]');
  if (albumFilter) { state.albumFilter = albumFilter.dataset.albumFilter; render(); return; }

  const circleTab = event.target.closest('[data-circle-tab]');
  if (circleTab) { state.circleTab = circleTab.dataset.circleTab; render(); return; }

  const circleFilter = event.target.closest('[data-circle-filter]');
  if (circleFilter) { state.circleFilter = circleFilter.dataset.circleFilter; render(); return; }

  const spaceTab = event.target.closest('[data-space-tab]');
  if (spaceTab) { state.spaceTab = spaceTab.dataset.spaceTab; render(); return; }

  const journeyFilter = event.target.closest('[data-journey-filter]');
  if (journeyFilter) { state.journeyFilter = journeyFilter.dataset.journeyFilter; render(); return; }

  const searchTag = event.target.closest('[data-search-tag]');
  if (searchTag) { state.searchQuery = searchTag.dataset.searchTag; render(); setTimeout(()=>$('#search-input')?.focus(),20); return; }
});

document.addEventListener('change', event => {
  const input = event.target.closest('.chip input');
  if (!input) return;
  const group = input.closest('.field') || input.closest('.grid');
  if (input.type === 'radio') {
    $$('.chip', group).forEach(label => label.classList.remove('active'));
    input.closest('.chip')?.classList.add('active');
  } else {
    input.closest('.chip')?.classList.toggle('active', input.checked);
  }
});

window.addEventListener('hashchange', render);
window.addEventListener('scroll', () => {
  $$('.topbar').forEach(bar => bar.classList.toggle('scrolled', window.scrollY > 4));
}, { passive: true });

if (!location.hash) location.hash = '#/home';
render();
