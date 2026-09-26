'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, KeyRound, Users, Sparkles } from '@/lib/mobile/icon-system'
import { Icon } from '@/components/mobile/Icon'
import { LargeTitle } from '@/components/mobile/LargeTitle'
import { Button } from '@/components/mobile/Button'
import { BottomSheet } from '@/components/mobile/BottomSheet'
import { EmptyState } from '@/components/mobile/EmptyState'
import { Field, FieldTextarea } from '@/components/mobile/Field'
import { LoaderBlock } from '@/components/mobile/Loader'
import { apiUrl } from '@/lib/api-base'
import { spaceDetailHref } from '@/lib/routes'
import { SPACE_TYPE_NAME_HINTS, SPACE_ROLE_LABELS } from '@/lib/mobile/space-system'
import { SpaceCard, SpaceSectionHeader, type SpaceCardData } from './SpaceCard'
import { SpaceThemeScope } from './SpaceThemeScope'
import { SpaceTypePicker } from './SpaceTypePicker'

/**
 * 我的空间（列表 / 切换器 / 创建 / 加入）。
 *
 * 架构决定（方案 §9-1 采用「B」）：**不引入全局「当前空间」**。
 * 本页只做「进入某个空间的视角聚合」，`/travel`、`/album` 仍保持「我的全部」语义 ——
 * 否则「我的旅行」的含义会随进入哪个空间而漂移，回归风险远大于收益。
 *
 * 主题作用域：页面本身保持中性（品牌色），**每张卡片自带自己的 data-space**。
 * 这是「五套主题不像五个 App」的关键 —— 列表里同时出现五种配色仍然是一个 App，
 * 因为中性层、间距、圆角、字号完全一致，只有卡片内部的 7 个空间令牌不同。
 */
export default function SpaceListClient({ initialSpaces }: { initialSpaces?: SpaceCardData[] }) {
  const router = useRouter()
  const [spaces, setSpaces] = useState<SpaceCardData[]>(initialSpaces || [])
  const [loading, setLoading] = useState(!initialSpaces)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  // 创建
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [spaceType, setSpaceType] = useState('COUPLE')
  const [submitting, setSubmitting] = useState(false)

  // 加入
  const [joinOpen, setJoinOpen] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(apiUrl('/api/spaces'), { credentials: 'include' })
      const j = await res.json()
      if (res.ok) setSpaces(j.spaces || [])
      else setError(j.error || '加载空间失败')
    } catch {
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!initialSpaces) void load()
  }, [initialSpaces, load])

  // 邀请链接直达：/space?join=CODE（邀请面板复制的就是这个地址）
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('join')
    if (code) {
      setJoinCode(code.toUpperCase())
      setJoinOpen(true)
    }
  }, [])

  const showToast = (text: string) => {
    setToast(text)
    window.setTimeout(() => setToast(''), 2600)
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    setError('')
    try {
      // slug 不再由前端生成：中文名派生不出 ASCII slug 时由服务端回退随机值
      const res = await fetch(apiUrl('/api/spaces'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined, spaceType }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || '创建失败')
      setName('')
      setDescription('')
      setCreateOpen(false)
      showToast('空间已创建，去邀请伙伴一起记录吧')
      await load()
      if (j.slug) router.push(spaceDetailHref(j.slug))
    } catch (err: any) {
      setError(err.message || '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  const join = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = joinCode.trim()
    if (!code) return
    setJoining(true)
    setError('')
    try {
      const res = await fetch(apiUrl('/api/spaces/join'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || '加入失败')
      setJoinCode('')
      setJoinOpen(false)
      showToast(`已加入「${j.spaceName || '空间'}」`)
      await load()
    } catch (err: any) {
      setError(err.message || '加入失败')
    } finally {
      setJoining(false)
    }
  }

  // 分组：有别人的空间 = 共享；只有自己的 = 个人（真库里 34 个空间全是自动创建的单人 SOLO，
  // 不分组会让用户看到一屏同名卡片）
  const shared = spaces.filter((s) => (s.memberCount ?? 0) > 1)
  const personal = spaces.filter((s) => (s.memberCount ?? 0) <= 1)

  return (
    <div className="m-gutter pb-24 pt-2">
      <LargeTitle title="我的空间" back="/me" subtitle="一起记录，各自上色" />

      {/* 主操作区：一屏只有一个实心 CTA（创建），加入走次级按钮 */}
      <div className="mt-4 flex items-center gap-2">
        <Button icon={Plus} block onClick={() => { setError(''); setCreateOpen(true) }}>
          创建空间
        </Button>
        <Button
          variant="secondary"
          icon={KeyRound}
          onClick={() => { setError(''); setJoinOpen(true) }}
          aria-label="输入邀请码加入空间"
        >
          邀请码加入
        </Button>
      </div>

      {error && !createOpen && !joinOpen && (
        <p className="mt-3 text-center text-[13px] text-[var(--danger-soft)]">{error}</p>
      )}

      {loading ? (
        <LoaderBlock label="正在加载空间…" />
      ) : spaces.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={Sparkles}
          title="还没有空间"
          description="创建一个空间，把旅行、相册和回忆放进去，邀请 TA 一起经营。"
          action={
            <Button icon={Plus} onClick={() => setCreateOpen(true)}>
              创建第一个空间
            </Button>
          }
        />
      ) : (
        <>
          {shared.length > 0 && (
            <section className="mt-6">
              <SpaceSectionHeader title="共享空间" count={shared.length} />
              <div className="mt-3 space-y-3">
                {shared.map((s) => (
                  <SpaceThemeScope key={s.id} type={s.spaceType}>
                    <SpaceCard space={s} />
                  </SpaceThemeScope>
                ))}
              </div>
            </section>
          )}

          {personal.length > 0 && (
            <section className="mt-6">
              <SpaceSectionHeader title="只有我" count={personal.length} />
              <div className="mt-3 space-y-3">
                {personal.map((s) => (
                  <SpaceThemeScope key={s.id} type={s.spaceType}>
                    <SpaceCard space={{ ...s, isDefault: !s.description || s.description.includes('自动创建') }} />
                  </SpaceThemeScope>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* ── 创建空间 ── */}
      <BottomSheet open={createOpen} onClose={() => setCreateOpen(false)} title="创建空间">
        <form onSubmit={create} className="space-y-4">
          <div>
            <p className="mb-2 text-[13px] font-medium text-[var(--m-text)]">这是什么空间？</p>
            <SpaceTypePicker
              value={spaceType}
              onChange={setSpaceType}
              disabled={submitting}
            />
            <p className="mt-2 text-[13px] text-[var(--m-muted)]">
              选好类型后，这个空间会用它自己的配色 —— 五种都清新淡雅，明暗两套都做了对比度校核。
            </p>
          </div>

          <Field
            label="空间名称"
            name="space-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={SPACE_TYPE_NAME_HINTS[spaceType] || '给这个空间起个名字'}
            maxLength={200}
          />

          <FieldTextarea
            label="简介"
            name="space-desc"
            hint="可选，一句话说明这个空间用来记录什么"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="例如：2026 年全家的出行记录"
            maxLength={500}
          />

          {error && <p className="text-[13px] text-[var(--danger-soft)]">{error}</p>}

          <Button type="submit" block size="lg" loading={submitting} disabled={!name.trim()}>
            创建空间
          </Button>
        </form>
      </BottomSheet>

      {/* ── 邀请码加入 ── */}
      <BottomSheet open={joinOpen} onClose={() => setJoinOpen(false)} title="输入邀请码加入">
        <form onSubmit={join} className="space-y-4">
          <Field
            label="邀请码"
            name="join-code"
            required
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="形如 7XK2-M9PQ"
            className="text-center"
            hint={`${SPACE_ROLE_LABELS.MEMBER}可一起编辑旅行与相册`}
          />
          {error && <p className="text-[13px] text-[var(--danger-soft)]">{error}</p>}
          <Button type="submit" block size="lg" loading={joining} disabled={!joinCode.trim()}>
            加入空间
          </Button>
        </form>
      </BottomSheet>

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[96] -translate-x-1/2 rounded-full bg-[var(--social-text)]/90 px-5 py-2.5 text-[13px] text-[var(--social-bg)] backdrop-blur">
          <span className="flex items-center gap-1.5">
            <Icon icon={Users} size="sm" />
            {toast}
          </span>
        </div>
      )}
    </div>
  )
}
