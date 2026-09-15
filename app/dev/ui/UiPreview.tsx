'use client'

/**
 * 组件预览台（仅开发环境）
 * ---------------------------------------------------------------------------
 * 路径：/dev/ui   → 生产构建下返回 404（见 page.tsx 的 notFound 守卫）
 *
 * 为什么需要它：重构前「改一个组件不知道影响了哪些页面」，也没有地方
 * 一次性看到组件的全部状态。本页把移动端设计系统的所有组件、全部状态、
 * 字阶与色板平铺在一屏，作为：
 *   1. 开发时的对照台（改 token 立刻看全站效果）
 *   2. 图标迁移（251 处）的验证基准
 *   3. 设计评审的截图源
 */
import { useState } from 'react'
import {
  MapPin, Route, Compass, User, Heart, HeartHandshake, Users, UsersRound, Users2,
  CalendarDays, Images, Camera, BookOpen, MessageCircle, Sparkles, ChartColumn, Bell,
  Landmark, UtensilsCrossed, BedDouble, Ticket, ShoppingBag, CircleEllipsis,
  Volleyball, Footprints, SportShoe, Bike, Waves, Mountain, MountainSnow, TentTree, Dumbbell, PersonStanding,
  Plane, TrainFront, CarFront, Ship, Plus, X, ChevronRight, ArrowRight, WifiOff,
} from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { IconBadge } from '@/components/mobile/IconBadge'
import { IconButton } from '@/components/mobile/IconButton'
import { Pill, TravelTypePill, ActivityPill, ItineraryChip } from '@/components/mobile/Pills'
import { ListSection, ListRow } from '@/components/mobile/ListRow'
import { StatBlock, StatRow } from '@/components/mobile/StatBlock'
import { LargeTitle } from '@/components/mobile/LargeTitle'
import { EmptyState } from '@/components/mobile/EmptyState'
import { Skeleton, SkeletonCard, SkeletonLines } from '@/components/mobile/Skeleton'
import {
  ACTIVITY_KINDS, ACTIVITY_LABELS,
  BADGE_TONES,
  ITINERARY_TYPES, ITINERARY_LABELS,
  TRAVEL_TYPE_LABELS, TRANSPORT_KINDS, TRANSPORT_LABELS, TRANSPORT_ICON,
  type IconSize, type IconTone, type BadgeTone,
} from '@/lib/mobile/icon-system'

const FONT_SCALE = [
  { cls: 'm-display', name: 'm-display', spec: '32/38 · 700' },
  { cls: 'm-title-1', name: 'm-title-1', spec: '24/30 · 700' },
  { cls: 'm-title-2', name: 'm-title-2', spec: '18/24 · 650' },
  { cls: 'm-body', name: 'm-body', spec: '15/22 · 400' },
  { cls: 'm-caption', name: 'm-caption', spec: '13/18 · 400' },
  { cls: 'm-label', name: 'm-label', spec: '11/14 · 600' },
  { cls: 'm-tab-label', name: 'm-tab-label', spec: '11/14 · 500' },
  { cls: 'm-stat', name: 'm-stat', spec: '32/32 · 700' },
]

const COLOR_TOKENS = [
  ['--m-bg', '页面底'],
  ['--m-bg-soft', '暖底'],
  ['--m-surface-solid', '卡片'],
  ['--m-surface-2', '次级填充'],
  ['--m-text', '主文字'],
  ['--m-muted', '次文字'],
  ['--m-faint', '最弱'],
  ['--m-accent', '强调'],
  ['--m-accent-strong', '强调(文字)'],
  ['--m-accent-soft', '强调(浅底)'],
  ['--m-sun', '暖黄'],
  ['--m-blush', '腮红'],
  ['--m-clay', '深陶'],
  ['--m-success', '成功'],
  ['--m-warning', '警告'],
  ['--m-danger', '错误'],
]

const ICON_TONES: IconTone[] = ['inherit', 'text', 'muted', 'faint', 'accent', 'success', 'warning', 'danger']
const ICON_SIZES: IconSize[] = ['sm', 'md', 'lg']

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-[var(--m-line)] px-5 py-8">
      <h2 className="m-title-2">{title}</h2>
      {note && <p className="m-caption mt-1 text-[var(--m-muted)]">{note}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

export default function DevUiPage() {
  const [tone, setTone] = useState<BadgeTone>('accent')

  return (
    <div className="min-h-screen bg-[var(--m-bg)] pb-24 text-[var(--m-text)]">
      <LargeTitle
        title="组件预览台"
        subtitle="/dev/ui · 仅开发环境 · 移动端设计系统全部组件与状态"
        trailing={<IconButton icon={Sparkles} label="示例图标按钮" variant="plain" />}
      />

      {/* ── 字阶 ── */}
      <Section title="字阶（7 档 + Tab 专用）" note="规范：一个页面最多 2 个大标题级别">
        <div className="space-y-4">
          {FONT_SCALE.map((f) => (
            <div key={f.cls} className="flex items-baseline gap-4">
              <code className="m-caption w-28 shrink-0 text-[var(--m-muted)]">{f.name}</code>
              <span className={`${f.cls} min-w-0 flex-1 truncate`}>把走过的路变成故事</span>
              <code className="m-caption shrink-0 text-[var(--m-faint)]">{f.spec}</code>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 色板 ── */}
      <Section title="色彩 token" note="禁止在组件内写裸 hex；彩色面积 ≤ 15%">
        <div className="grid grid-cols-2 gap-3">
          {COLOR_TOKENS.map(([token, label]) => (
            <div key={token} className="m-card-flat flex items-center gap-3 p-3">
              <span
                className="h-8 w-8 shrink-0 rounded-[10px] border border-[var(--m-line)]"
                style={{ background: `var(${token})` }}
              />
              <span className="min-w-0">
                <code className="m-caption block truncate text-[var(--m-text)]">{token}</code>
                <span className="m-caption block text-[var(--m-muted)]">{label}</span>
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 图标尺寸/描边/色调 ── */}
      <Section title="图标：3 档尺寸 × 2 档描边" note="需要更大视觉重量时放大容器，不要放大图标">
        <div className="flex flex-wrap items-end gap-6">
          {ICON_SIZES.map((s) => (
            <div key={s} className="text-center">
              <Icon icon={MapPin} size={s} tone="accent" />
              <p className="m-caption mt-2 text-[var(--m-muted)]">{s}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          {ICON_TONES.map((t) => (
            <span key={t} className="flex items-center gap-2">
              <Icon icon={Heart} tone={t} />
              <code className="m-caption text-[var(--m-muted)]">{t}</code>
            </span>
          ))}
        </div>
      </Section>

      {/* ── IconBadge ── */}
      <Section title="IconBadge：暖色圆润容器" note="替代硬编码彩色方块；前景色按 WCAG AA 校核">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {BADGE_TONES.map((t) => (
              <span key={t} className="flex flex-col items-center gap-1.5">
                <IconBadge icon={Camera} tone={t} />
                <code className="m-caption text-[var(--m-muted)]">{t}</code>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {ICON_SIZES.map((s) => (
              <span key={s} className="flex flex-col items-center gap-1.5">
                <IconBadge icon={BookOpen} tone="accent" size={s} />
                <code className="m-caption text-[var(--m-muted)]">size {s}</code>
              </span>
            ))}
            <span className="flex flex-col items-center gap-1.5">
              <IconBadge icon={Heart} tone="blush" size="lg" shape="circle" />
              <code className="m-caption text-[var(--m-muted)]">circle</code>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="m-caption text-[var(--m-muted)]">交互切换：</span>
            {BADGE_TONES.map((t) => (
              <button key={t} type="button" onClick={() => setTone(t)} className="m-pressable">
                <IconBadge icon={Sparkles} tone={t} size="sm" />
              </button>
            ))}
            <span className="m-caption text-[var(--m-muted)]">当前 {tone}</span>
          </div>
        </div>
      </Section>

      {/* ── IconButton ── */}
      <Section title="IconButton：内建 44px 触达" note="必填 label（图标按钮没有可见文字）">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex flex-col items-center gap-1.5">
            <IconButton icon={X} label="plain" variant="plain" />
            <code className="m-caption text-[var(--m-muted)]">plain</code>
          </span>
          <span className="flex flex-col items-center gap-1.5">
            <IconButton icon={X} label="surface" variant="surface" />
            <code className="m-caption text-[var(--m-muted)]">surface</code>
          </span>
          <span className="flex flex-col items-center gap-1.5">
            <IconButton icon={X} label="glass" variant="glass" />
            <code className="m-caption text-[var(--m-muted)]">glass</code>
          </span>
          <span className="flex flex-col items-center gap-1.5">
            <IconButton icon={Plus} label="accent" variant="accent" />
            <code className="m-caption text-[var(--m-muted)]">accent</code>
          </span>
          <span className="flex flex-col items-center gap-1.5">
            <IconButton icon={X} label="disabled" variant="surface" disabled />
            <code className="m-caption text-[var(--m-muted)]">disabled</code>
          </span>
        </div>
      </Section>

      {/* ── 行程项类型 ── */}
      <Section title="行程项类型（ItineraryItem.type）" note="此前 6 类被硬编码成同一个 MapPin">
        <div className="flex flex-wrap gap-2">
          {ITINERARY_TYPES.map((t) => (
            <ItineraryChip key={t} type={t}>
              {ITINERARY_LABELS[t]}
            </ItineraryChip>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <ItineraryChip type="SPOT" locationName="浅草寺">浅草寺</ItineraryChip>
          <ItineraryChip type="ACTIVITY" locationName="代代木公园">打了一场球</ItineraryChip>
        </div>
      </Section>

      {/* ── 活动类型（球类/走路/散步…）── */}
      <Section title="活动类型（球类运动 · 徒步 · 散步 …）" note="用户要求：暖色调 + 圆润">
        <div className="flex flex-wrap gap-2">
          {ACTIVITY_KINDS.map((k) => (
            <ActivityPill key={k} kind={k} />
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          {ACTIVITY_KINDS.map((k, i) => (
            <IconBadge
              key={k}
              icon={[Volleyball, Footprints, SportShoe, Bike, Waves, Mountain, MountainSnow, TentTree, Dumbbell, Camera, ShoppingBag, Ticket][i]}
              tone={BADGE_TONES[i % BADGE_TONES.length]}
              size="sm"
            />
          ))}
          <span className="m-caption text-[var(--m-muted)]">{ACTIVITY_LABELS.STROLL} 等 12 类</span>
        </div>
      </Section>

      {/* ── 旅行关系类型 ── */}
      <Section title="旅行关系类型（TravelType）" note="此前仅有纯文字 pill 且用冷色；现为暖色 + 图标">
        <div className="flex flex-wrap gap-2">
          {Object.keys(TRAVEL_TYPE_LABELS).map((t) => (
            <TravelTypePill key={t} type={t} />
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          {[User, Heart, UsersRound, Users, HeartHandshake, Users2, CircleEllipsis].map((Ic, i) => (
            <IconBadge key={i} icon={Ic} tone={BADGE_TONES[i % BADGE_TONES.length]} size="sm" />
          ))}
        </div>
      </Section>

      {/* ── 出行方式 ── */}
      <Section title="出行方式">
        <div className="flex flex-wrap gap-2">
          {TRANSPORT_KINDS.map((k) => (
            <Pill key={k} icon={TRANSPORT_ICON[k]} tone="neutral">
              {TRANSPORT_LABELS[k]}
            </Pill>
          ))}
        </div>
      </Section>

      {/* ── Pill 基础 ── */}
      <Section title="Pill 基础（5 暖色 × 2 尺寸）">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {BADGE_TONES.map((t) => (
              <Pill key={t} icon={MapPin} tone={t}>{t}</Pill>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {BADGE_TONES.map((t) => (
              <Pill key={t} icon={MapPin} tone={t} size="sm">{t} sm</Pill>
            ))}
          </div>
        </div>
      </Section>

      {/* ── ListRow ── */}
      <Section title="ListSection / ListRow" note="统一功能入口行；行高 64，图标位 40">
        <ListSection className="!px-0" title="更多玩法">
          <ListRow icon={CalendarDays} tone="accent" title="时间线" description="按年份回顾每一段旅程" href="/timeline" />
          <ListRow icon={MessageCircle} tone="sun" title="碎碎念" description="写下此刻想说的话" href="/moments" />
          <ListRow icon={ChartColumn} tone="clay" title="数据看板" description="足迹与照片的全部沉淀" href="/dashboard" />
          <ListRow icon={Bell} tone="neutral" title="通知" trailing={<Pill tone="blush" size="sm">3</Pill>} />
        </ListSection>
      </Section>

      {/* ── StatBlock ── */}
      <Section title="StatBlock / StatRow">
        <div className="m-card grid grid-cols-2 gap-4 p-4">
          <StatBlock value={12} unit="个省份" label="已点亮足迹" icon={MapPin} href="/travel" />
          <StatBlock value={38} unit="篇旅行" label="收藏沿途记忆" icon={Route} href="/travel" />
        </div>
        <StatRow
          className="mt-4"
          items={[
            { value: 38, unit: '篇旅途' },
            { value: 12, unit: '个省' },
            { value: 27, unit: '个城市' },
          ]}
        />
      </Section>

      {/* ── 空态 / 骨架 ── */}
      <Section title="EmptyState（图标 + 标题 + 说明 + 单一 CTA）">
        <div className="m-card">
          <EmptyState
            icon={WifiOff}
            title="还没有旅行记录"
            description="去旅行地图点亮第一个省份，开始记录你的故事。"
            action={
              <button type="button" className="m-press m-body inline-flex h-12 items-center gap-2 rounded-full bg-[var(--m-accent)] px-5 font-semibold text-white">
                <Icon icon={Plus} size="sm" />
                记录一次旅行
              </button>
            }
          />
        </div>
        <div className="mt-4 space-y-3">
          <SkeletonCard />
          <Skeleton className="h-4 w-40" />
          <SkeletonLines lines={3} />
        </div>
      </Section>

      {/* ── 导航图标语义 ── */}
      <Section title="导航图标语义（去重后）" note="MapPin 只表示「地点」，不再兼表省份/旅行/足迹">
        <div className="flex flex-wrap gap-5">
          {[
            ['首页', Compass, 'Tab'],
            ['旅行', Route, 'Tab'],
            ['旅行圈', User, 'Tab'],
            ['地点', MapPin, '唯一'],
            ['画册', Images, '唯一'],
            ['足迹', Landmark, '唯一'],
          ].map(([label, Ic, note]) => (
            <span key={label as string} className="flex flex-col items-center gap-1.5">
              <Icon icon={Ic as typeof MapPin} size="lg" tone="accent" />
              <span className="m-caption text-[var(--m-text)]">{label as string}</span>
              <span className="m-caption text-[var(--m-faint)]">{note as string}</span>
            </span>
          ))}
        </div>
      </Section>

      <div className="px-5">
        <p className="m-caption text-[var(--m-muted)]">
          规范详见 <code>docs/design/移动端设计规范.md</code>；一致性检查 <code>node scripts/check-design-tokens.mjs</code>。
        </p>
      </div>
    </div>
  )
}
