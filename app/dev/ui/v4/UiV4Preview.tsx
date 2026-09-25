'use client'

import { useState } from 'react'
import {
  Heart, MapPin, Lock, User, Users, Sunrise, Moon,
  Pencil, Trash2, Download, Plus, Sparkles, Check, Images, Route,
} from 'lucide-react'
import { Button } from '@/components/mobile/Button'
import { Field, FieldTextarea, FieldSelect } from '@/components/mobile/Field'
import { Switch } from '@/components/mobile/Switch'
import { Checkbox } from '@/components/mobile/Checkbox'
import { ChoiceCard, ChoiceGroup } from '@/components/mobile/ChoiceCard'
import { SegmentedControl } from '@/components/mobile/SegmentedControl'
import { Loader, LoaderBlock } from '@/components/mobile/Loader'
import { LargeTitle } from '@/components/mobile/LargeTitle'
import { IconButton } from '@/components/mobile/IconButton'
import { IconBadge } from '@/components/mobile/IconBadge'
import { EmptyState } from '@/components/mobile/EmptyState'
import { toast } from '@/lib/mobile/toast-store'
import { TRAVEL_TYPE_LABELS } from '@/lib/mobile/icon-system'

/**
 * M5 组件预览台（/dev/ui/v4）
 * ---------------------------------------------------------------------------
 * 目的：在**不改动任何线上组件**的前提下，把本方案新增/升级的组件在浅色与暗色
 * 两种主题下平铺出来，供确认后再做全局替换。
 *
 * 覆盖：Button / Field / Switch / Checkbox / ChoiceCard / SegmentedControl /
 *       Loader / 卡片分级 / 纹理 / 新增 token。
 */
function Section({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className="border-t border-[var(--m-line)] px-5 py-8">
      <h2 className="m-title-2">{title}</h2>
      {note && <p className="m-caption mt-1 text-[var(--m-muted)]">{note}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <code className="m-caption w-24 shrink-0 text-[var(--m-faint)]">{label}</code>
      {children}
    </div>
  )
}

/** 新增 / 修复的 token。kind='shadow' 的取值是 box-shadow，必须用 box-shadow 演示，
 *  用 background 演示会是一片空白（误导）。 */
const NEW_TOKENS: Array<{ token: string; label: string; kind: 'color' | 'shadow' }> = [
  { token: '--m-elev-1', label: '卡片抬升', kind: 'shadow' },
  { token: '--m-elev-2', label: '悬浮层', kind: 'shadow' },
  { token: '--m-elev-3', label: '面板（= m-shadow-lg 修复）', kind: 'shadow' },
  { token: '--m-on-accent', label: '强调底文字（修复）', kind: 'color' },
  { token: '--m-cta-bg', label: 'CTA 填充（过 AA）', kind: 'color' },
  { token: '--m-ring', label: '焦点环', kind: 'shadow' },
  { token: '--m-success', label: '成功', kind: 'color' },
  { token: '--m-warning', label: '警告', kind: 'color' },
  { token: '--m-danger', label: '危险（5 合 1）', kind: 'color' },
]

export default function UiV4Preview() {
  const [dark, setDark] = useState(false)
  const [sw1, setSw1] = useState(true)
  const [sw2, setSw2] = useState(false)
  const [ck1, setCk1] = useState(true)
  const [ck2, setCk2] = useState(false)
  const [choice, setChoice] = useState('COUPLE')
  const [seg, setSeg] = useState<'all' | 'photo' | 'note'>('all')
  const [loading, setLoading] = useState(false)
  const [text, setText] = useState('')
  const [email, setEmail] = useState('not-an-email')
  const [seg2, setSeg2] = useState<'a' | 'b' | 'c'>('a')

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
  }

  return (
    <div className="min-h-screen bg-[var(--m-bg)] pb-24 text-[var(--m-text)]">
      <LargeTitle
        title="M5 组件预览"
        subtitle="/dev/ui/v4 · 新增与升级组件 · 仅开发环境"
        back="/dev/ui"
        trailing={
          <IconButton
            icon={dark ? Sunrise : Moon}
            label={dark ? '切到浅色' : '切到深色'}
            variant="plain"
            onClick={toggleTheme}
          />
        }
      />

      <div className="m-gutter">
        <p className="m-caption rounded-[var(--m-radius-control)] bg-[var(--m-accent-soft)] p-3 text-[var(--m-accent-strong)]">
          这是预览台：以上组件尚未接入任何线上页面。确认后才会做全局替换。
          用右上角按钮切换明暗主题逐项核对。
        </p>
      </div>

      {/* ── Button ── */}
      <Section
        title="Button（新增）"
        note="此前移动端没有 Button：CTA 被内联复制 5 处，登录页主按钮是 chip 加 !important 顶出来的。"
      >
        <div className="space-y-4">
          <Row label="variant">
            <Button variant="primary">主操作</Button>
            <Button variant="secondary">次操作</Button>
            <Button variant="ghost">文字按钮</Button>
            <Button variant="danger" icon={Trash2}>删除</Button>
          </Row>
          <Row label="size">
            <Button size="sm">sm 36</Button>
            <Button size="md">md 44</Button>
            <Button size="lg">lg 52</Button>
          </Row>
          <Row label="icon">
            <Button icon={Plus}>记录旅行</Button>
            <Button variant="secondary" icon={Download}>导出</Button>
            <Button variant="ghost" icon={Pencil} iconPosition="trailing">编辑</Button>
          </Row>
          <Row label="state">
            <Button
              loading={loading}
              onClick={() => {
                setLoading(true)
                window.setTimeout(() => setLoading(false), 1800)
              }}
            >
              {loading ? '保存中' : '点我看 loading'}
            </Button>
            <Button disabled>禁用</Button>
            <Button variant="secondary" disabled>禁用</Button>
          </Row>
          <div className="space-y-3">
            <code className="m-caption block text-[var(--m-faint)]">block + round</code>
            <Button block round size="lg" icon={Plus}>撑满 + 胶囊（首页主 CTA 形态）</Button>
            <Button block variant="secondary" size="lg" icon={Images}>撑满次级</Button>
          </div>
        </div>
      </Section>

      {/* ── Field ── */}
      <Section
        title="Field（新增）"
        note="登录页此前并存 3 套输入框实现；旅行新建页有 4 处重复手写类串。此组件收敛为唯一入口。"
      >
        <div className="space-y-5">
          <Field
            label="用户名"
            required
            name="username"
            placeholder="请输入用户名"
            leadingIcon={User}
          />
          <Field
            label="密码"
            name="password"
            type="password"
            placeholder="请输入密码"
            leadingIcon={Lock}
            hint="密码将加密存储"
          />
          <Field
            label="邮箱"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error="邮箱格式不正确"
            leadingIcon={Sparkles}
          />
          <Field label="已禁用" name="disabled" placeholder="不可编辑" disabled />
          <FieldTextarea
            label="旅途感受"
            name="note"
            placeholder="写下此刻的心情…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            hint="最多 500 字"
          />
          <FieldSelect label="出行方式" name="transport" defaultValue="TRAIN">
            <option value="PLANE">飞机</option>
            <option value="TRAIN">火车</option>
            <option value="CAR">自驾</option>
            <option value="SHIP">轮船</option>
          </FieldSelect>
        </div>
      </Section>

      {/* ── Switch / Checkbox ── */}
      <Section title="Switch / Checkbox（升级 / 新增）" note="Switch API 不变，新增 bare 模式；均带 light 触觉。">
        <div className="space-y-3">
          <Switch
            checked={sw1}
            onCheckedChange={setSw1}
            label="深色模式跟随系统"
            description="开启后随系统设置自动切换"
          />
          <Switch
            checked={sw2}
            onCheckedChange={setSw2}
            label="离线缓存照片"
            description="仅 Wi-Fi 下预下载"
          />
          <Switch checked disabled onCheckedChange={() => {}} label="已禁用" />

          <div className="m-card flex items-center justify-between p-4">
            <span className="m-body">行内 bare 开关（ListRow 右侧）</span>
            <Switch bare checked={sw1} onCheckedChange={setSw1} label="行内开关" />
          </div>

          <div className="mt-2 space-y-2">
            <Checkbox
              checked={ck1}
              onCheckedChange={setCk1}
              label="全选本次旅行的照片"
              description="共 38 张"
            />
            <Checkbox
              checked={ck2}
              onCheckedChange={setCk2}
              label="同步到云端"
              description="关闭则仅保存在本机"
            />
            <Checkbox checked={false} disabled onCheckedChange={() => {}} label="已禁用" />
            <div className="flex items-center gap-4 pt-2">
              <span className="m-caption text-[var(--m-muted)]">bare（照片网格用）：</span>
              <Checkbox bare checked={ck1} onCheckedChange={setCk1} label="选中" />
              <Checkbox bare checked={false} onCheckedChange={() => {}} label="未选" />
            </div>
          </div>
        </div>
      </Section>

      {/* ── ChoiceCard ── */}
      <Section title="ChoiceCard（新增）" note="带说明的多选一：旅行关系 / 同步策略 / 相册模式。">
        <ChoiceGroup
          label="旅行关系"
          value={choice}
          onChange={setChoice}
          options={[
            { value: 'ALONE', title: TRAVEL_TYPE_LABELS.ALONE, description: '一个人的旅途', icon: User },
            { value: 'COUPLE', title: TRAVEL_TYPE_LABELS.COUPLE, description: '两个人的旅程', icon: Heart },
            { value: 'FRIENDS', title: TRAVEL_TYPE_LABELS.FRIENDS, description: '和朋友一起出发', icon: Users },
            { value: 'FAMILY', title: TRAVEL_TYPE_LABELS.FAMILY, description: '和家人同行', icon: MapPin, disabled: true },
          ]}
        />
        <div className="mt-4">
          <ChoiceCard
            selected={false}
            onSelect={() => {}}
            title="单张卡片（无图标）"
            description="不传 icon 时左侧不占位"
          />
        </div>
      </Section>

      {/* ── SegmentedControl ── */}
      <Section title="SegmentedControl（升级）" note="新增图标支持；命中区从 36px 提到 44px（规范 §8 下限）。">
        <div className="space-y-4">
          <SegmentedControl
            value={seg}
            onChange={setSeg}
            options={[
              { value: 'all', label: '全部' },
              { value: 'photo', label: '照片' },
              { value: 'note', label: '文字' },
            ]}
          />
          <SegmentedControl
            value={seg2}
            onChange={setSeg2}
            options={[
              { value: 'a', label: '画册', icon: Images },
              { value: 'b', label: '银河', icon: Sparkles },
              { value: 'c', label: '足迹', icon: Route },
            ]}
          />
        </div>
      </Section>

      {/* ── Loader ── */}
      <Section title="Loader（新增）" note="规范唯一允许无限动画的场景；reduced-motion 下完全静止。">
        <div className="space-y-6">
          <Row label="dots">
            <Loader variant="dots" size="sm" />
            <Loader variant="dots" size="md" />
            <Loader variant="dots" size="lg" />
          </Row>
          <Row label="ring">
            <Loader variant="ring" size="sm" />
            <Loader variant="ring" size="md" />
            <Loader variant="ring" size="lg" />
          </Row>
          <Row label="ripple">
            <Loader variant="ripple" size="sm" />
            <Loader variant="ripple" size="md" />
            <Loader variant="ripple" size="lg" />
          </Row>
          <div className="m-card">
            <LoaderBlock label="正在翻开这本旅行相册…" />
          </div>
        </div>
      </Section>

      {/* ── Toast ── */}
      <Section title="Toast 2.0（升级）" note="色板从 iOS 冷色系统色收敛到 --m-*；关闭按钮提到 40px；新增进度条与操作按钮。">
        <div className="flex flex-wrap gap-3">
          <Button size="sm" variant="secondary" onClick={() => toast.success('已保存')}>
            成功
          </Button>
          <Button size="sm" variant="secondary" onClick={() => toast.error('网络异常，请重试')}>
            错误
          </Button>
          <Button size="sm" variant="secondary" onClick={() => toast.info('已加入同步队列')}>
            信息
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              toast.info('已删除 1 张照片', {
                duration: 5000,
                progress: true,
                action: { label: '撤销', onClick: () => toast.success('已撤销') },
              })
            }
          >
            进度 + 撤销
          </Button>
        </div>
      </Section>

      {/* ── 卡片分级与纹理 ── */}
      <Section title="卡片分级 / 纹理" note="三级抬升替代散落的 shadow-[...]；纹理为纯 CSS，0 图片请求。">
        <div className="space-y-4">
          <div className="m-card-flat p-4">
            <p className="m-body font-semibold">m-card-flat · 无投影</p>
            <p className="m-caption mt-1 text-[var(--m-muted)]">列表内嵌、不抢层次</p>
          </div>
          <div className="m-card p-4">
            <p className="m-body font-semibold">m-card · L1</p>
            <p className="m-caption mt-1 text-[var(--m-muted)]">默认卡片</p>
          </div>
          <div className="m-card-raised p-4">
            <p className="m-body font-semibold">m-card-raised · L2</p>
            <p className="m-caption mt-1 text-[var(--m-muted)]">需要浮起来的内容</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="m-pattern-dot flex h-24 items-center justify-center rounded-[var(--m-radius-card)] border border-[var(--m-line)]">
              <span className="m-caption text-[var(--m-muted)]">点阵</span>
            </div>
            <div className="m-pattern-grid flex h-24 items-center justify-center rounded-[var(--m-radius-card)] border border-[var(--m-line)]">
              <span className="m-caption text-[var(--m-muted)]">细网格</span>
            </div>
          </div>
          <div className="m-hero-surface flex h-24 items-center justify-center rounded-[var(--m-radius-card)]">
            <span className="m-caption text-[var(--m-muted)]">--m-grad-hero（受控渐变 1/3）</span>
          </div>
          <div className="relative h-28 overflow-hidden rounded-[var(--m-radius-card)]">
            <div className="m-hero-surface h-full w-full" />
            <div className="m-scrim absolute inset-x-0 bottom-0 p-3">
              <span className="m-caption text-white">--m-grad-scrim（受控渐变 2/3）</span>
            </div>
          </div>
        </div>
      </Section>

      {/* ── 空态 ── */}
      <Section title="EmptyState + 纹理底" note="空态可选加纹理底，避免大面积纯色。">
        <div className="m-card overflow-hidden">
          <div className="m-pattern-dot">
            <EmptyState
              icon={MapPin}
              title="还没有旅行记录"
              description="去旅行地图点亮第一个省份，开始记录你的故事。"
              action={
                <Button icon={Plus} onClick={() => toast.info('演示：跳转新建旅行')}>
                  记录一次旅行
                </Button>
              }
            />
          </div>
        </div>
      </Section>

      {/* ── 新 token ── */}
      <Section title="新增 / 修复的 token" note="全部为增量，既有 token 取值未改动。">
        <div className="grid grid-cols-2 gap-3">
          {NEW_TOKENS.map(({ token, label, kind }) => (
            <div key={token} className="m-card-flat flex items-center gap-3 p-3">
              <span
                className="h-8 w-8 shrink-0 rounded-[10px] border border-[var(--m-line)] bg-[var(--m-surface-solid)]"
                style={
                  kind === 'shadow'
                    ? { boxShadow: `var(${token})` }
                    : { background: `var(${token})` }
                }
              />
              <span className="min-w-0">
                <code className="m-caption block truncate">{token}</code>
                <span className="m-caption block text-[var(--m-muted)]">{label}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="m-caption text-[var(--m-muted)]">焦点环演示（Tab 到按钮）：</span>
          <Button variant="secondary" size="sm" icon={Check}>Focus 我</Button>
          <IconBadge icon={Heart} tone="blush" size="lg" shape="circle" />
        </div>
      </Section>

      <div className="px-5">
        <p className="m-caption text-[var(--m-muted)]">
          确认此视觉方向后，才会进入 P0 全局替换（接入 5 处 CTA + 登录页字段 + 修 D1–D6）。
        </p>
      </div>
    </div>
  )
}
