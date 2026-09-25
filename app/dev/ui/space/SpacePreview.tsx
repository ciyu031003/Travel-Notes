'use client'

import { useState } from 'react'
import {
  Heart, UsersRound, Users, MountainSnow, Sparkles, MapPin, Images, Camera,
  ChevronRight, UserPlus, Settings2, Check, Plus,
} from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import { Button } from '@/components/mobile/Button'
import { Pill } from '@/components/mobile/Pills'
import { IconBadge } from '@/components/mobile/IconBadge'
import { SegmentedControl } from '@/components/mobile/SegmentedControl'
import {
  SPACE_TYPES,
  spaceTypeIconOf,
  spaceTypeLabelOf,
  spaceTypeToneOf,
} from '@/lib/mobile/space-system'
import { SpaceThemeScope } from '@/components/space/SpaceThemeScope'
import { SpaceCard } from '@/components/space/SpaceCard'
import { SpaceTypePicker } from '@/components/space/SpaceTypePicker'
import { SpaceAvatarStack } from '@/components/space/SpaceAvatarStack'
import { SpaceActivityFeed } from '@/components/space/SpaceActivityFeed'

/**
 * 空间模块预览台（/dev/ui/space）—— 五套主题并列评审用。
 *
 * 为什么单独做一页：真实空间页一次只能看到**一种**主题，无法回答
 * 「五套配色是否清新淡雅、是否互相区分、是否还是一个 App」这三个问题。
 * 这里用**静态 fixture**并列渲染五个空间 —— 不连数据库、不需要登录
 * （`/dev/ui/*` 在非生产环境是公开路径，见 `lib/public-paths.ts`），
 * 评审配色时不必先造数据。
 *
 * 生产构建下一律 404（见 page.tsx），不会把开发工具暴露到线上。
 */

/* ── 演示数据（虚构，仅用于评审视觉） ───────────────────────────────── */

const FIXTURES = [
  {
    spaceType: 'COUPLE',
    name: '我们的小家',
    description: '从第一次穷游到现在的每一次出发',
    myRole: 'OWNER',
    memberCount: 2,
    travelCount: 7,
    albumCount: 4,
    memoryCount: 63,
    mediaCount: 412,
    updatedAt: new Date(Date.now() - 3600_000 * 5).toISOString(),
    members: [
      { username: 'yuanabd', nickname: '阿远', avatarUrl: null, role: 'OWNER' },
      { username: 'xiaoyu', nickname: '小鱼', avatarUrl: null, role: 'MEMBER' },
    ],
  },
  {
    spaceType: 'FAMILY',
    name: '全家出行记',
    description: '爸妈、我和妹妹的假期',
    myRole: 'MEMBER',
    memberCount: 4,
    travelCount: 3,
    albumCount: 2,
    memoryCount: 28,
    mediaCount: 196,
    updatedAt: new Date(Date.now() - 86400_000 * 2).toISOString(),
    members: [
      { username: 'mama', nickname: '妈妈', avatarUrl: null, role: 'OWNER' },
      { username: 'yuanabd', nickname: '阿远', avatarUrl: null, role: 'MEMBER' },
      { username: 'baba', nickname: '爸爸', avatarUrl: null, role: 'MEMBER' },
      { username: 'meimei', nickname: '妹妹', avatarUrl: null, role: 'VIEWER' },
    ],
  },
  {
    spaceType: 'FRIENDS',
    name: '老友出发',
    description: '每年一次，谁都不许缺席',
    myRole: 'MEMBER',
    memberCount: 6,
    travelCount: 5,
    albumCount: 3,
    memoryCount: 41,
    mediaCount: 288,
    updatedAt: new Date(Date.now() - 86400_000 * 9).toISOString(),
    members: [
      { username: 'laowang', nickname: '老王', avatarUrl: null, role: 'OWNER' },
      { username: 'yuanabd', nickname: '阿远', avatarUrl: null, role: 'MEMBER' },
      { username: 'ahu', nickname: '阿虎', avatarUrl: null, role: 'MEMBER' },
      { username: 'xiaomei', nickname: '小美', avatarUrl: null, role: 'MEMBER' },
      { username: 'dabai', nickname: '大白', avatarUrl: null, role: 'MEMBER' },
      { username: 'qiuqiu', nickname: '球球', avatarUrl: null, role: 'MEMBER' },
    ],
  },
  {
    spaceType: 'SOLO',
    name: '一个人的地图',
    description: '独旅时写给自己看的东西',
    myRole: 'OWNER',
    memberCount: 1,
    travelCount: 12,
    albumCount: 6,
    memoryCount: 97,
    mediaCount: 534,
    updatedAt: new Date(Date.now() - 86400_000 * 21).toISOString(),
    members: [{ username: 'yuanabd', nickname: '阿远', avatarUrl: null, role: 'OWNER' }],
  },
  {
    spaceType: 'OTHER',
    name: '还没想好',
    description: null,
    myRole: 'OWNER',
    memberCount: 1,
    travelCount: 0,
    albumCount: 0,
    memoryCount: 0,
    mediaCount: 0,
    updatedAt: new Date(Date.now() - 60000 * 30).toISOString(),
    members: [{ username: 'yuanabd', nickname: '阿远', avatarUrl: null, role: 'OWNER' }],
  },
] as const

const ACTIVITY = [
  { id: 1, username: '小鱼', action: 'CREATE', resourceType: 'Travel', resourceId: '12', metadata: '{"title":"大理 5 天"}', createdAt: new Date(Date.now() - 3600_000 * 3).toISOString() },
  { id: 2, username: '阿远', action: 'UPLOAD_MEDIA', resourceType: 'Media', resourceId: '88', metadata: '{"title":"洱海"}', createdAt: new Date(Date.now() - 86400_000).toISOString() },
  { id: 3, username: '小鱼', action: 'UPDATE_PERMISSIONS', resourceType: 'SpaceMember', resourceId: '3', metadata: '{"member":"阿虎","from":"VIEWER","to":"MEMBER"}', createdAt: new Date(Date.now() - 86400_000 * 2).toISOString() },
  { id: 4, username: '老王', action: 'INVITE_MEMBER', resourceType: 'SpaceInvite', resourceId: '3', metadata: '{}', createdAt: new Date(Date.now() - 86400_000 * 4).toISOString() },
  { id: 5, username: '阿远', action: 'CREATE', resourceType: 'Memory', resourceId: '501', metadata: '{"title":"在洱海边看日落"}', createdAt: new Date(Date.now() - 86400_000 * 6).toISOString() },
]

/* ── 预览区块 ─────────────────────────────────────────────────────── */

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-3">
        <h2 className="text-[15px] font-semibold text-[var(--social-text)]">{title}</h2>
        {note && <p className="mt-1 text-[13px] leading-5 text-[var(--social-muted)]">{note}</p>}
      </div>
      {children}
    </section>
  )
}

/** 色板条：把某个空间的 7 个令牌全部摊开，便于逐项核对 */
function ThemeSwatch({ type }: { type: string }) {
  const cells: Array<[string, string]> = [
    ['9', 'bg-[var(--space-accent)]'],
    ['11', 'bg-[var(--space-accent-strong)]'],
    ['3/4', 'bg-[var(--space-accent-soft)]'],
    ['6', 'bg-[var(--space-hairline)]'],
    ['a', 'bg-[var(--space-hero-a)]'],
    ['b', 'bg-[var(--space-hero-b)]'],
  ]
  return (
    <SpaceThemeScope type={type}>
      <div className="rounded-[var(--m-radius-card)] bg-[var(--social-surface)] p-3 ring-1 ring-[var(--social-line)]">
        <div className="flex items-center gap-2">
          <Icon icon={spaceTypeIconOf(type)} size="sm" tone="inherit" className="text-[var(--space-accent-strong)]" />
          <span className="text-[13px] font-semibold text-[var(--space-accent-text)]">{spaceTypeLabelOf(type)}</span>
          <code className="ml-auto text-[11px] text-[var(--social-faint)]">data-space={type}</code>
        </div>
        <div className="mt-2.5 grid grid-cols-6 gap-1">
          {cells.map(([label, cls]) => (
            <div key={label}>
              <div className={`h-9 rounded-[10px] ring-1 ring-[var(--social-line)] ${cls}`} />
              <p className="mt-1 text-center text-[11px] text-[var(--social-faint)]">{label}</p>
            </div>
          ))}
        </div>
        {/* 列序与令牌一一对应，避免小标签被截断成 "acc.." */}
        <p className="mt-1.5 text-[11px] leading-4 text-[var(--social-faint)]">
          accent-9 · accent-strong-11 · accent-soft-3/4 · hairline-6 · hero-a · hero-b
        </p>
        {/* 实测：CTA 填充 + 标签文字（对比度见研究报告，亮色 5.26–6.07 / 暗色 9.53–11.10） */}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className="whitespace-nowrap rounded-full bg-[var(--space-accent-strong)] px-3 py-1.5 text-[13px] font-semibold text-[var(--space-on-accent)]">
            主 CTA
          </span>
          <span className="whitespace-nowrap rounded-full bg-[var(--space-accent-soft)] px-2.5 py-1 text-[13px] font-medium text-[var(--space-accent-text)]">
            淡染标签
          </span>
          <span className="text-[11px] text-[var(--social-faint)]">on-accent 已按明暗反转</span>
        </div>
      </div>
    </SpaceThemeScope>
  )
}

/** 空间详情页的头部 + 统计 + 一段内容（真实页面的缩影） */
function DetailSnippet({ type, name, description, stats, members }: {
  type: string
  name: string
  description: string | null
  stats: Array<[string, number, typeof MapPin]>
  members: Array<{ username: string; nickname: string | null; avatarUrl: string | null; role: string }>
}) {
  return (
    <SpaceThemeScope type={type}>
      <article className="overflow-hidden rounded-[var(--m-radius-card)] bg-[var(--social-surface)] ring-1 ring-[var(--social-line)]">
        {/* 头图 */}
        <div className="space-hero px-4 pb-4 pt-4">
          <div className="flex items-start justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--social-surface-90)]/70 px-2.5 py-1 text-[11px] font-semibold text-[var(--space-accent-text)] backdrop-blur">
              <Icon icon={spaceTypeIconOf(type)} size="sm" />
              {spaceTypeLabelOf(type)}
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--social-surface-90)]/60 text-[var(--space-accent-text)]">
              <Icon icon={Settings2} size="sm" />
            </span>
          </div>
          <h3 className="mt-4 text-[18px] font-bold leading-6 text-[var(--space-accent-text)]">{name}</h3>
          {description && (
            <p className="mt-1 text-[13px] leading-4 text-[var(--space-accent-text)] opacity-85">{description}</p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <SpaceAvatarStack members={members} max={5} size="sm" />
            <span className="text-[11px] text-[var(--space-accent-text)] opacity-85">{members.length} 位成员</span>
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[var(--space-accent-strong)] px-3 py-1.5 text-[11px] font-semibold text-[var(--space-on-accent)]">
              <Icon icon={UserPlus} size="sm" />
              邀请
            </span>
          </div>
        </div>

        {/* 统计 */}
        <div className="grid grid-cols-4 gap-1.5 px-4 pt-3">
          {stats.map(([label, value, icon]) => (
            <div key={label} className="rounded-[12px] bg-[var(--social-surface-60)] py-2 text-center">
              <Icon icon={icon} size="sm" className="mx-auto text-[var(--space-accent-strong)]" />
              <div className="mt-0.5 text-[15px] font-semibold leading-5 tabular-nums text-[var(--social-text)]">{value}</div>
              <div className="text-[11px] text-[var(--social-faint)]">{label}</div>
            </div>
          ))}
        </div>

        {/* 内容行 */}
        <div className="space-y-1.5 px-4 pb-4 pt-3">
          {[
            ['大理 5 天', '2026/3/12 · 情侣 · 小鱼 创建'],
            ['洱海骑行', '2026/3/13 · 阿远 最近修改'],
          ].map(([title, meta]) => (
            <div key={title} className="flex items-center gap-2.5 rounded-[12px] bg-[var(--social-surface-60)] px-3 py-2.5">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[12px] bg-[var(--space-accent-soft)] text-[var(--space-accent-strong)]">
                <Icon icon={MapPin} size="sm" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-[var(--social-text)]">{title}</span>
                <span className="block truncate text-[11px] text-[var(--social-faint)]">{meta}</span>
              </span>
              <Icon icon={ChevronRight} size="sm" tone="faint" />
            </div>
          ))}
        </div>
      </article>
    </SpaceThemeScope>
  )
}

export default function SpacePreview() {
  const [dark, setDark] = useState(false)
  const [activeType, setActiveType] = useState<string>('COUPLE')
  const [pickerValue, setPickerValue] = useState<string>('FRIENDS')

  const toggleTheme = (next: string) => {
    const isDark = next === 'dark'
    setDark(isDark)
    // 与全站主题开关同一套机制：html.dark
    document.documentElement.classList.toggle('dark', isDark)
  }

  return (
    <div className="min-h-screen bg-[var(--social-bg)] pb-20">
      <div className="mx-auto max-w-[1180px] px-5 py-8">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.08em] text-[var(--social-muted)]">DEV · PREVIEW</p>
            <h1 className="mt-1 text-[24px] font-bold text-[var(--social-text)]">空间模块 · 五套主题预览</h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--social-muted)]">
              五类空间各一套低彩度主题（色源 Radix Colors · MIT）。中性层、间距、圆角、字号、
              品牌赤陶全部共享，<strong className="text-[var(--social-text)]">只有 7 个令牌随空间变化</strong>
              —— 这是「五种空间配色不同、但仍是同一个 App」的全部机制。
              色值与环境对比度见 <code className="text-[11px]">docs/design/空间类型配色系统-研究报告.md</code>。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <SegmentedControl
              value={dark ? 'dark' : 'light'}
              onChange={toggleTheme}
              options={[
                { value: 'light', label: '浅色' },
                { value: 'dark', label: '深色' },
              ]}
            />
          </div>
        </header>

        {/* ① 令牌全摊开 */}
        <Section
          title="① 七令牌色板（浅色 / 深色随右上角切换）"
          note="accent 9 只作装饰与大色块；CTA 一律用 accent-strong 11 级 + on-accent —— Radix 9 级对白字只有 1.43–1.48，不达 AA。"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {SPACE_TYPES.map((t) => (
              <ThemeSwatch key={t} type={t} />
            ))}
          </div>
        </Section>

        {/* ② 空间卡片列表 */}
        <Section
          title="② 空间列表卡片（真实组件 SpaceCard）"
          note="页面保持中性品牌色，每张卡片自带 data-space —— 列表里同时出现五种配色仍是一个 App。"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FIXTURES.map((f) => (
              <SpaceThemeScope key={f.spaceType} type={f.spaceType}>
                <SpaceCard
                  space={{
                    id: 1,
                    name: f.name,
                    slug: 'demo',
                    description: f.description,
                    spaceType: f.spaceType,
                    myRole: f.myRole,
                    memberCount: f.memberCount,
                    travelCount: f.travelCount,
                    albumCount: f.albumCount,
                    memoryCount: f.memoryCount,
                    mediaCount: f.mediaCount,
                    updatedAt: f.updatedAt,
                    members: f.members as never,
                  }}
                />
              </SpaceThemeScope>
            ))}
          </div>
        </Section>

        {/* ③ 类型选择器 */}
        <Section
          title="③ 创建空间时的类型选择（真实组件 SpaceTypePicker）"
          note="每张卡片用它自己的主题色预览条渲染 —— 用户在创建时就能看到「选了这个，空间长什么样」，省掉一屏纯文案说明。"
        >
          <div className="max-w-[420px]">
            <SpaceTypePicker value={pickerValue} onChange={setPickerValue} />
          </div>
        </Section>

        {/* ④ 详情页缩影 */}
        <Section
          title="④ 空间详情页缩影（真实组件 SpaceDetail 的头图 / 统计 / 内容行）"
          note="头图渐变是主题色唯一的大面积用武之地，高度受控（真实页面 ≤ 屏 35%），渐变上的文字一律用 accent-text。"
        >
          <div className="mb-3 flex flex-wrap gap-1.5">
            {SPACE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setActiveType(t)}
                className={
                  activeType === t
                    ? 'rounded-full bg-[var(--social-text)] px-3 py-1.5 text-[13px] font-medium text-[var(--social-bg)]'
                    : 'rounded-full bg-[var(--social-surface)] px-3 py-1.5 text-[13px] text-[var(--social-muted)] ring-1 ring-[var(--social-line)]'
                }
              >
                {spaceTypeLabelOf(t)}
              </button>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {FIXTURES.filter((f) => f.spaceType === activeType).map((f) => (
              <DetailSnippet
                key={f.spaceType}
                type={f.spaceType}
                name={f.name}
                description={f.description}
                members={f.members as never}
                stats={[
                  ['旅行', f.travelCount, MapPin],
                  ['相册', f.albumCount, Images],
                  ['回忆', f.memoryCount, Sparkles],
                  ['照片', f.mediaCount, Camera],
                ]}
              />
            ))}
            <div className="rounded-[var(--m-radius-card)] bg-[var(--social-surface)] p-4 ring-1 ring-[var(--social-line)]">
              <p className="mb-3 text-[13px] font-semibold text-[var(--social-text)]">空间动态（读 AuditLog，零改库）</p>
              <SpaceActivityFeed items={ACTIVITY} />
            </div>
          </div>
        </Section>

        {/* ⑤ 类型徽标 + 克制用色示范 */}
        <Section
          title="⑤ 徽标与图标（暖色 tone 体系，与主题色分工）"
          note="徽标继续走全站统一的暖色 tone（accent/sun/blush/clay/neutral），主题色只用于空间内部的强调面 —— 两套不混用。"
        >
          <div className="flex flex-wrap items-center gap-2">
            {SPACE_TYPES.map((t) => (
              <Pill key={t} icon={spaceTypeIconOf(t)} tone={spaceTypeToneOf(t)}>
                {spaceTypeLabelOf(t)}
              </Pill>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {[Heart, UsersRound, Users, MountainSnow, Sparkles].map((ic, i) => (
              <IconBadge key={i} icon={ic} tone={(['blush', 'sun', 'accent', 'clay', 'neutral'] as const)[i]} size="lg" />
            ))}
          </div>
          <div className="mt-4 max-w-[420px] rounded-[var(--m-radius-card)] bg-[var(--social-surface)] p-4 ring-1 ring-[var(--social-line)]">
            <p className="mb-3 text-[13px] font-semibold text-[var(--social-text)]">一屏只有一个实心 CTA</p>
            <div className="flex gap-2">
              <Button icon={Plus} block>创建空间</Button>
              <Button variant="secondary" icon={Check}>已完成</Button>
            </div>
          </div>
        </Section>

        {/* ⑥ 约束自检 */}
        <Section title="⑥ 用色纪律（每套主题上线前逐条自查）">
          <ul className="space-y-1.5 text-[13px] leading-5 text-[var(--social-muted)]">
            {[
              '单屏内 --space-accent* 像素和 ≤ 屏面积 15%',
              '彩色只出现在：主 CTA / 激活态 / 关键数字 / 内容图；不用于页面底、卡片底、分隔线、正文',
              '每屏最多 1 个实心 CTA（accent-strong）',
              'accent-soft 只作小面积标签底，单块 ≤ 屏 4%（暗色 ≤ 8%）',
              'hero 渐变仅限头图区，高度 ≤ 屏 35%',
              '品牌赤陶仍出现在全局层（Logo / 导航 / 设置），切空间不丢品牌',
              '控件边界用共享 --social-line；空间色发丝线只作纯装饰；聚焦环不随空间变色',
            ].map((t) => (
              <li key={t} className="flex items-start gap-1.5">
                <Icon icon={Check} size="sm" className="mt-0.5 shrink-0 text-[var(--social-muted)]" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Section>

        <p className="text-center text-[11px] text-[var(--social-faint)]">
          演示数据为虚构，仅用于视觉评审 · 本页生产构建下一律 404
        </p>
      </div>
    </div>
  )
}
