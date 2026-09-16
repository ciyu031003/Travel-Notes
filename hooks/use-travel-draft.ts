'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from '@/lib/mobile/toast-store'
import { createTravel } from '@/lib/modules/offline/travel-write'
import {
  EMPTY_TRAVEL_DRAFT,
  MAX_COMPANIONS,
  evaluateDateRange,
  isTitlePristine,
  suggestTitles,
  validateDraft,
  type TravelDraft,
} from '@/lib/modules/travel/draft'

/**
 * 新建旅行 · 表单状态与提交（弹窗与全屏页共用）
 *
 * 从 TravelComposer 里抽出来，是为了让「弹窗」和「全屏页」两套外壳共用同一份逻辑，
 * 避免两处各写一遍校验/提交（原实现已经出现两套几乎重复的 JSX）。
 */

const DRAFT_KEY = 'travel-composer-draft'

export interface SubmitOutcome {
  /** 成功（含离线本地保存） */
  ok: boolean
  /** 云端创建成功后的 slug；离线为 null */
  slug: string | null
  /** 是否离线本地保存 */
  local: boolean
}

export function useTravelDraft(enabled: boolean) {
  const [draft, setDraft] = useState<TravelDraft>(EMPTY_TRAVEL_DRAFT)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  /** 表单是否已被用户改过（用于决定要不要覆盖标题） */
  const touchedRef = useRef(false)

  const patch = useCallback((p: Partial<TravelDraft>) => {
    touchedRef.current = true
    setDraft((d) => ({ ...d, ...p }))
  }, [])

  /** 系统驱动更新（标题建议、草稿恢复）：不算"用户改过" */
  const patchSystem = useCallback((p: Partial<TravelDraft>) => {
    setDraft((d) => ({ ...d, ...p }))
  }, [])

  const reset = useCallback(() => {
    setDraft(EMPTY_TRAVEL_DRAFT)
    setSuggestions([])
    setError('')
    touchedRef.current = false
  }, [])

  /* ---------------- 草稿：会中写，返回还在 ---------------- */
  useEffect(() => {
    if (!enabled) return
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as { draft?: TravelDraft; titlePristine?: boolean; suggestions?: string[] }
      if (saved?.draft) {
        setDraft({ ...EMPTY_TRAVEL_DRAFT, ...saved.draft })
        setSuggestions(saved.suggestions ?? [])
        // 恢复时也要恢复"标题是否 pristine"，否则用户改过的标题会被建议覆盖
        touchedRef.current = saved.titlePristine === false
      }
    } catch {
      // 忽略
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ draft, titlePristine: !touchedRef.current, suggestions }),
      )
    } catch {
      // 忽略
    }
  }, [draft, suggestions, enabled])

  const clearDraft = useCallback(() => {
    try {
      sessionStorage.removeItem(DRAFT_KEY)
    } catch {
      // 忽略
    }
  }, [])

  /* ---------------- 由目的地 + 天数派生标题 ---------------- */
  useEffect(() => {
    const days = evaluateDateRange(draft.startDate, draft.endDate).days
    const next = suggestTitles(draft.location, days)
    setSuggestions((prev) => {
      // 标题处于 pristine 状态时跟随建议；用户改过就不动
      if (isTitlePristine(draft.title, prev)) {
        setDraft((d) => (isTitlePristine(d.title, prev) ? { ...d, title: next[0] ?? '' } : d))
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.location, draft.startDate, draft.endDate])

  /* ---------------- 同行者 ---------------- */
  const addCompanion = useCallback((name: string, relation: string) => {
    const n = name.trim().slice(0, 40)
    if (!n) return
    setDraft((d) => {
      if (d.companions.length >= MAX_COMPANIONS) return d
      if (d.companions.some((c) => c.name === n)) return d
      return { ...d, companions: [...d.companions, { name: n, relation: relation.trim().slice(0, 20) }] }
    })
    touchedRef.current = true
  }, [])

  const removeCompanion = useCallback((index: number) => {
    setDraft((d) => ({ ...d, companions: d.companions.filter((_, i) => i !== index) }))
    touchedRef.current = true
  }, [])

  /* ---------------- 校验 / 提交 ---------------- */
  const validation = useMemo(() => validateDraft(draft), [draft])

  const submit = useCallback(async (): Promise<SubmitOutcome> => {
    if (submitting) return { ok: false, slug: null, local: false }
    if (!validation.canSubmit) {
      setError(validation.blocker ?? '表单填写不完整')
      return { ok: false, slug: null, local: false }
    }
    setSubmitting(true)
    setError('')
    const r = await createTravel({
      title: draft.title.trim(),
      description: draft.description.trim() || undefined,
      location: draft.location.trim() || undefined,
      startDate: draft.startDate || undefined,
      endDate: draft.endDate || undefined,
      travelType: draft.travelType as never,
      companions: draft.companions.length > 0 ? draft.companions : undefined,
      isPublic: draft.isPublic,
    })
    setSubmitting(false)

    if (!r.ok) {
      const msg = r.error || '创建失败'
      setError(msg)
      toast.error(msg)
      return { ok: false, slug: null, local: false }
    }

    clearDraft()
    const local = r.local === true
    toast.success(local ? '已保存到本地，联网后自动上传' : '旅行已创建')
    return { ok: true, slug: r.slug ?? null, local }
  }, [submitting, validation, draft, clearDraft])

  return {
    draft,
    patch,
    patchSystem,
    reset,
    suggestions,
    submitting,
    error,
    setError,
    validation,
    addCompanion,
    removeCompanion,
    submit,
  }
}
