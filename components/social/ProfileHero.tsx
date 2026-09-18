'use client'

import { useState } from 'react'
import { Camera, Check, Images, Loader2, PenLine, Route } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { CountUp } from '@/components/mobile/CountUp'
import { apiUrl } from '@/lib/api-base'
import { coverObjectPosition } from '@/lib/modules/social/profile-cover'

/**
 * 「我的」页档案头图区（R1 重写）。
 *
 * 结构（自上而下，同一张卡内）：
 *   ┌ 风景头图（用户上传，16:10）── 图上叠暖色暗调蒙版 + 两个小动作
 *   ├ 不透明层：头像（上浮压住头图）+ 名号 / ID / 签名
 *   ├ 三统计：次旅行 · 个地方 · 张照片（唯一三个指标，不做更多）
 *   └ 两个主动作：记录一次旅行 / 打开旅行画册
 *
 * 三条来自调研报告的做法（均为 MIT，见 docs/design/移动端三轮优化方案 §10）：
 *  ① 封面暗色蒙版（notus-nextjs `pages/profile.js` 的 `opacity-50 bg-black`）：
 *     用户上传的图亮度不可控，没有蒙版时图上的白字会彻底消失。
 *  ② 头像上沿压进封面 + 页面背景色描边环（bluesky `Profile/Header/index.tsx`：
 *     `top:110 / 94×94 / borderWidth:2 / borderColor=页面背景色`）——比纯阴影在杂乱照片上更稳。
 *  ③ 焦点自选（LycheeOrg/Lychee `AlbumHeaderImage.vue`）：只存两个 float，
 *     渲染成 `object-position`，避免横幅照居中把主体（人/地标）裁掉。
 *
 * 统计与名字**一律不在图上**：这是可读性最强、也最不容易出错的分层。
 */

export interface ProfileHeroData {
  username: string
  displayName: string
  accountId: string | null
  bio: string
  avatarUrl: string | null
  coverUrl: string | null
  coverFocusX: number | null
  coverFocusY: number | null
  stats: { travelCount: number; placeCount: number; photoCount: number }
  provinceCount: number
}

export default function ProfileHero({
  data,
  uploadingCover,
  uploadingAvatar,
  onPickAvatar,
  onPickCover,
  onEditProfile,
  onRecordTravel,
  onOpenAlbum,
}: {
  data: ProfileHeroData
  uploadingCover?: boolean
  uploadingAvatar?: boolean
  onPickAvatar: () => void
  onPickCover: () => void
  onEditProfile: () => void
  onRecordTravel: () => void
  onOpenAlbum: () => void
}) {
  const [sheet, setSheet] = useState<'avatar' | 'cover' | null>(null)
  const [focus, setFocus] = useState<{ x: number | null; y: number | null }>({
    x: data.coverFocusX,
    y: data.coverFocusY,
  })
  const [savingFocus, setSavingFocus] = useState(false)

  const hasCover = !!data.coverUrl
  const objectPosition = coverObjectPosition(focus.x, focus.y)

  /** 焦点即时保存（只改坐标，不重传图片）；传 null 表示恢复居中 */
  const saveFocus = async (x: number | null, y: number | null) => {
    setFocus({ x, y })
    setSavingFocus(true)
    try {
      await fetch(apiUrl('/api/me/cover'), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ focusX: x, focusY: y }),
      })
    } catch {
      // 静默：焦点是锦上添花，失败不打断用户
    } finally {
      setSavingFocus(false)
    }
  }

  return (
    <section className="overflow-hidden rounded-[1.6rem] bg-[var(--social-surface)] ring-1 ring-[var(--social-line)]">
      {/* ── 头图 ───────────────────────────────────────────── */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[var(--social-surface2)]">
        {hasCover ? (
          // eslint-disable-next-line @next/next/no-img-element -- 头图由本项目的上传接口生成固定尺寸变体，无需 next/image 再优化
          <img
            data-testid="profile-cover"
            src={data.coverUrl as string}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition }}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[linear-gradient(160deg,var(--social-surface2),var(--social-surface))] text-[var(--social-faint)]">
            <Icon icon={Images} size="lg" />
            <p className="px-8 text-center text-xs">上传一张风景照，作为你的旅行档案封面</p>
          </div>
        )}

        {/* 暗色蒙版：保证图上白字可读（用户图亮度不可控） */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(to top, rgba(0,0,0,.55), rgba(0,0,0,.12) 55%, rgba(0,0,0,.28))',
          }}
        />

        {/* 图上动作：只放两个小图标，不堆文字 */}
        <div className="absolute right-3 top-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onEditProfile}
            aria-label="编辑资料"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition active:scale-95"
          >
            <Icon icon={PenLine} size="sm" />
          </button>
          <button
            type="button"
            onClick={() => (hasCover ? setSheet('cover') : onPickCover())}
            disabled={uploadingCover}
            aria-label={hasCover ? '更换头图' : '上传头图'}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition active:scale-95 disabled:opacity-60"
          >
            {uploadingCover ? (
              <Icon icon={Loader2} size="sm" className="animate-spin" />
            ) : (
              <Icon icon={Camera} size="sm" />
            )}
          </button>
        </div>
      </div>

      {/* ── 身份区（不透明层，头像压住头图下缘） ─────────────── */}
      <div className="relative px-5 pb-5">
        <div className="flex items-end gap-4">
          <div className="relative -mt-7">
            <button
              type="button"
              onClick={() => (hasCover || data.avatarUrl ? setSheet('avatar') : onPickAvatar())}
              aria-label="更换头像"
              className="block h-[88px] w-[88px] overflow-hidden rounded-full bg-[var(--social-accent-soft)] ring-4 ring-[var(--social-surface)] transition active:scale-95"
            >
              {data.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- 头像已由 /api/me/avatar 生成 256px 变体
                <img
                  data-testid="profile-avatar"
                  src={data.avatarUrl}
                  alt={data.displayName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[30px] font-semibold text-[var(--social-accent)]">
                  {data.displayName.slice(0, 1)}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={onPickAvatar}
              disabled={uploadingAvatar}
              aria-label="上传头像"
              className="absolute -bottom-0.5 -right-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--social-accent)] text-[var(--social-on-accent)] ring-2 ring-[var(--social-surface)] transition active:scale-95 disabled:opacity-60"
            >
              {uploadingAvatar ? (
                <Icon icon={Loader2} size="sm" className="animate-spin" />
              ) : (
                <Icon icon={Camera} size="sm" />
              )}
            </button>
          </div>

          <div className="min-w-0 flex-1 pb-1">
            <h2 className="truncate text-[24px] font-semibold leading-tight tracking-tight">{data.displayName}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--social-muted)]">
              <span>@{data.username}</span>
              {data.accountId && (
                <span className="rounded-full bg-[var(--social-accent-soft)] px-2 py-0.5 text-[var(--social-accent)]">
                  ID {data.accountId}
                </span>
              )}
            </div>
          </div>
        </div>

        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-[var(--social-muted)]">「{data.bio}」</p>

        {/* ── 三统计（唯一指标：次旅行 / 个地方 / 张照片） ──── */}
        <div className="mt-5 grid grid-cols-3 divide-x divide-[var(--social-line)] rounded-[1.2rem] bg-[var(--social-surface-50)] py-4 ring-1 ring-[var(--social-line)]">
          {(
            [
              ['次旅行', data.stats.travelCount],
              ['个地方', data.stats.placeCount],
              ['张照片', data.stats.photoCount],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="text-center">
              <CountUp value={value} className="text-[26px] font-semibold tabular-nums tracking-tight" />
              <div className="mt-0.5 text-xs text-[var(--social-muted)]">{label}</div>
            </div>
          ))}
        </div>
        {data.provinceCount > 0 && (
          <p className="mt-2 text-center text-[11px] text-[var(--social-faint)]">
            足迹点亮 {data.provinceCount} 个省份
          </p>
        )}

        {/* ── 两个主动作 ─────────────────────────────────── */}
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onRecordTravel}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--social-accent)] text-sm font-semibold text-[var(--social-on-accent)] transition active:scale-[0.98]"
          >
            <Icon icon={Route} size="sm" />
            记录一次旅行
          </button>
          <button
            type="button"
            onClick={onOpenAlbum}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--social-surface)] text-sm font-semibold ring-1 ring-[var(--social-line)] transition active:scale-[0.98]"
          >
            <Icon icon={Images} size="sm" tone="accent" />
            旅行画册
          </button>
        </div>
      </div>

      {/* ── 「换图片 / 选焦点」面板 ─────────────────────────── */}
      {sheet && (
        <div
          className="fixed inset-0 z-[96] flex items-end justify-center"
          role="dialog"
          aria-modal="true"
          aria-label={sheet === 'cover' ? '档案头图' : '头像'}
        >
          <div className="absolute inset-0 bg-black/45" onClick={() => setSheet(null)} />
          <div className="relative max-h-[86dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[var(--social-surface)] px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-4">
            <h3 className="text-[16px] font-semibold">{sheet === 'cover' ? '档案头图' : '头像'}</h3>

            <button
              type="button"
              onClick={() => {
                const target = sheet
                setSheet(null)
                if (target === 'cover') onPickCover()
                else onPickAvatar()
              }}
              className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-[var(--social-surface-50)] px-4 py-3.5 text-left ring-1 ring-[var(--social-line)] active:scale-[0.99]"
            >
              <Icon icon={Camera} size="md" tone="accent" />
              <span className="text-sm font-medium">换一张图片</span>
            </button>

            {sheet === 'cover' && data.coverUrl && (
              <FocusGrid
                coverUrl={data.coverUrl}
                objectPosition={objectPosition}
                focus={focus}
                saving={savingFocus}
                onPick={saveFocus}
                onReset={() => void saveFocus(null, null)}
              />
            )}

            <button
              type="button"
              onClick={() => setSheet(null)}
              className="mt-4 h-11 w-full rounded-full text-sm text-[var(--social-muted)] ring-1 ring-[var(--social-line)]"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

/** 3×3 九宫格焦点选择：点哪一格，画面重点就移到哪（只存两个 0-1 的 float） */
function FocusGrid({
  coverUrl,
  objectPosition,
  focus,
  saving,
  onPick,
  onReset,
}: {
  coverUrl: string
  objectPosition: string
  focus: { x: number | null; y: number | null }
  saving: boolean
  onPick: (x: number, y: number) => void
  onReset: () => void
}) {  return (
    <div className="mt-2 rounded-2xl bg-[var(--social-surface-50)] p-3 ring-1 ring-[var(--social-line)]">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-medium">画面重点在哪？</p>
          <p className="mt-0.5 text-[11px] text-[var(--social-faint)]">点一格，头图会跟着调整裁切位置</p>
        </div>
        {saving && <Icon icon={Loader2} size="sm" className="animate-spin text-[var(--social-faint)]" />}
      </div>

      <div className="relative mt-2 overflow-hidden rounded-xl">
        {/* eslint-disable-next-line @next/next/no-img-element -- 焦点预览用已上传变体，不需要再优化 */}
        <img
          src={coverUrl}
          alt=""
          className="aspect-[16/10] w-full object-cover"
          style={{ objectPosition }}
        />
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
          {[0, 1, 2].flatMap((row) =>
            [0, 1, 2].map((col) => {
              const x = (col + 0.5) / 3
              const y = (row + 0.5) / 3
              const active = isActiveCell(focus.x, focus.y, col, row)
              return (
                <button
                  key={`${row}-${col}`}
                  type="button"
                  onClick={() => onPick(x, y)}
                  aria-label={`焦点 第${row + 1}行 第${col + 1}列`}
                  aria-pressed={active}
                  className="flex items-center justify-center border border-white/25 transition active:bg-white/25"
                >
                  {active && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--social-accent)] text-[var(--social-on-accent)]">
                      <Icon icon={Check} size="sm" />
                    </span>
                  )}
                </button>
              )
            }),
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onReset}
        className="mt-2 text-[11px] text-[var(--social-faint)] underline-offset-2 hover:underline"
      >
        恢复居中
      </button>
    </div>
  )
}

/** 当前焦点是否落在第 col/row 格（用于打勾） */
function isActiveCell(focusX: number | null, focusY: number | null, col: number, row: number): boolean {
  if (focusX == null || focusY == null) return false
  return Math.floor(focusX * 3) === col && Math.floor(focusY * 3) === row
}
