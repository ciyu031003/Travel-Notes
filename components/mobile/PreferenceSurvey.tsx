'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Check, ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react'
import { Button } from './Button'
import { ChoiceCard } from './ChoiceCard'
import { Icon } from './Icon'
import { apiUrl } from '@/lib/api-base'
import { hapticLight, hapticSuccess, hapticSelection } from '@/lib/mobile/haptics'
import { toast } from '@/lib/mobile/toast-store'
import { ONBOARD_DONE_EVENT, ONBOARD_STORAGE_KEY } from './Onboarding'
import {
  PREFERENCE_CAUTIONS,
  PREFERENCE_COMPANION_STYLES,
  PREFERENCE_DELIGHTS,
  PREFERENCE_VETOES,
  shouldShowPreferenceSurvey,
  type CompanionStyle,
} from '@/lib/modules/user/preferences'

/**
 * 新用户偏好问卷（3 屏，可跳过）
 *
 * 需求（用户拍板）：**新用户注册成功并登录时弹出一次；完成或跳过后，后续不再弹出。**
 *
 * 三个关键设计：
 *  1. **只弹一次靠服务端字段**（`User.preferencesCompletedAt`），不靠 localStorage ——
 *     换设备、重装 App 都不会再弹（localStorage 做不到，且问卷结果本身要跟账号走）。
 *  2. **只在首页弹**，且必须等首启引导（Onboarding）退场后再上 —— 两个全屏模态叠加
 *     会把用户堵在里面出不来（深链首次打开也会被挡住）。
 *  3. **任何一步都能跳过**：跳过也写完成时间戳（幂等锚点），不阻塞主流程。
 *
 * 收集结果的实际用途见 lib/modules/user/preferences.ts：
 * 新建旅行的默认同行者类型 + 行程页签的注意事项提示。
 */

type Step = 0 | 1 | 2

export function PreferenceSurvey() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState<Step>(0)
  const [companionStyle, setCompanionStyle] = useState<CompanionStyle | null>(null)
  const [delights, setDelights] = useState<string[]>([])
  const [vetoes, setVetoes] = useState<string[]>([])
  const [cautions, setCautions] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const isHome = pathname === '/'

  /** 首启引导是否已退场（未退场时问卷不上场，避免两个全屏模态叠加） */
  const onboardingDone = useCallback((): boolean => {
    try {
      return localStorage.getItem(ONBOARD_STORAGE_KEY) === '1'
    } catch {
      // localStorage 不可用（隐私模式等）：不展示，避免每次刷新都弹
      return false
    }
  }, [])

  useEffect(() => {
    if (!isHome || !onboardingDone()) return
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch(apiUrl('/api/me'), { credentials: 'include' })
        if (!res.ok) return
        const j = await res.json().catch(() => null)
        // /api/me 统一包一层 { success, data }（见 lib/api-response.ts 的 ok()）
        const profile = j?.data ?? j
        // 未登录 / 已做过 / 拿不到资料：都不弹
        if (cancelled || !profile?.username) return
        if (shouldShowPreferenceSurvey({ preferencesCompletedAt: profile.preferencesCompletedAt })) {
          setVisible(true)
        }
      } catch {
        // 网络失败静默：问卷不是主流程，不该因为一次请求失败就打扰用户
      }
    }
    void check()
    const onOnboardDone = () => void check()
    window.addEventListener(ONBOARD_DONE_EVENT, onOnboardDone)
    return () => {
      cancelled = true
      window.removeEventListener(ONBOARD_DONE_EVENT, onOnboardDone)
    }
  }, [isHome, onboardingDone])

  const toggle = useCallback((list: string[], value: string, setter: (next: string[]) => void) => {
    void hapticSelection()
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  }, [])

  const submit = useCallback(
    async (skipped: boolean) => {
      setSaving(true)
      try {
        const res = await fetch(apiUrl('/api/me/preferences'), {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companionStyle, delights, vetoes, cautions, skipped }),
        })
        if (!res.ok) throw new Error('保存失败')
        if (!skipped) void hapticSuccess()
        setVisible(false)
      } catch {
        // 保存失败也要放行：不能因为一次网络错误把用户永久挡在问卷里
        toast.error('偏好保存失败，已跳过（可稍后再填）')
        setVisible(false)
      } finally {
        setSaving(false)
      }
    },
    [companionStyle, delights, vetoes, cautions],
  )

  const stepTitle = useMemo(
    () =>
      ['这趟旅行，你想和谁一起出发？', '旅行中遇到什么，会让你惊喜或扫兴？', '还有什么需要特别留意？'][step],
    [step],
  )

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-[var(--m-bg)] text-[var(--m-text)] md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="偏好问卷"
    >
      {/* 顶栏：进度 + 跳过 */}
      <div
        className="flex items-center gap-2 px-4 pb-2"
        style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}
      >
        <span className="m-caption tabular-nums text-[var(--m-muted)]">
          {step + 1} / 3
        </span>
        <div className="flex flex-1 items-center gap-1.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={
                'h-1.5 flex-1 rounded-full transition-all duration-300 ' +
                (i <= step ? 'bg-[var(--m-accent)]' : 'bg-[var(--m-faint)]')
              }
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => void submit(true)}
          disabled={saving}
          className="m-pressable flex h-11 items-center gap-1 rounded-full px-3 text-[var(--m-muted)]"
          aria-label="跳过问卷"
        >
          <span className="m-caption">跳过</span>
          <Icon icon={X} size="sm" />
        </button>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto px-6 pb-4">
        <h2 className="m-title-2 mt-2 flex items-start gap-2">
          <Icon icon={Sparkles} size="md" className="mt-0.5 shrink-0 text-[var(--m-accent-strong)]" />
          {stepTitle}
        </h2>
        <p className="m-caption mt-1.5 text-[var(--m-faint)]">帮我们把默认值设成你喜欢的样子，随时可以跳过</p>

        {step === 0 && (
          <div className="mt-5 flex flex-col gap-2">
            {PREFERENCE_COMPANION_STYLES.map((o) => (
              <ChoiceCard
                key={o.value}
                selected={companionStyle === o.value}
                onSelect={() => setCompanionStyle(o.value)}
                title={o.label}
                description={o.hint}
              />
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="mt-5 space-y-5">
            <div>
              <p className="m-field-label">会让你惊喜</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {PREFERENCE_DELIGHTS.map((o) => (
                  <Toggle
                    key={o.value}
                    label={o.label}
                    active={delights.includes(o.value)}
                    onClick={() => toggle(delights, o.value, setDelights)}
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="m-field-label">最让你扫兴</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {PREFERENCE_VETOES.map((o) => (
                  <Toggle
                    key={o.value}
                    label={o.label}
                    active={vetoes.includes(o.value)}
                    onClick={() => toggle(vetoes, o.value, setVetoes)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mt-5">
            <p className="m-field-label">需要特别留意（可多选）</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PREFERENCE_CAUTIONS.map((o) => (
                <Toggle
                  key={o.value}
                  label={o.label}
                  active={cautions.includes(o.value)}
                  onClick={() => toggle(cautions, o.value, setCautions)}
                />
              ))}
            </div>
            <p className="m-caption mt-3 text-[var(--m-faint)]">
              选中后，行程页会提醒你留意这些点（不会自动改你的行程）
            </p>
          </div>
        )}
      </div>

      {/* 底部：上一步 / 下一步 */}
      <div className="px-6 pb-[max(24px,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3">
          {step > 0 && (
            <Button
              variant="ghost"
              size="lg"
              icon={ChevronLeft}
              disabled={saving}
              onClick={() => {
                void hapticLight()
                setStep((s) => (s - 1) as Step)
              }}
            >
              上一步
            </Button>
          )}
          <Button
            className="flex-1"
            size="lg"
            block
            loading={saving}
            icon={step === 2 ? Check : ChevronRight}
            iconPosition={step === 2 ? 'leading' : 'trailing'}
            onClick={() => {
              if (step < 2) {
                void hapticLight()
                setStep((s) => (s + 1) as Step)
                return
              }
              void submit(false)
            }}
          >
            {step === 2 ? '完成' : '下一步'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** 多选项：走 m-chip 胶囊，选中态用强调色（与行程类型/可见性选择同构） */
function Toggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={active}
      onClick={onClick}
      className={'m-chip ' + (active ? 'm-chip-active' : '')}
    >
      {active && <Icon icon={Check} size="sm" />}
      {label}
    </button>
  )
}

export default PreferenceSurvey
