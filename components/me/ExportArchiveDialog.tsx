'use client'

import { useCallback, useEffect, useState } from 'react'
import { X, FileDown, Image as ImageIcon, type LucideIcon } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { apiUrl } from '@/lib/api-base'
import { toast } from '@/lib/mobile/toast-store'
import { hapticLight } from '@/lib/mobile/haptics'
import { cn } from '@/lib/utils'

/**
 * 导出记忆档案（2026-10-15 重做）
 * ============================================================================
 * 需求：居中弹窗，让用户选①导出哪一次旅行 ②导出成什么形式 ③保存到哪。
 *
 * 两种形式：
 *  · **旅行卡片（HTML）**：自包含单文件，打开就是一张漂亮的长卡片，适合分享/留档；
 *  · **完整档案（ZIP）**：结构化 JSON + Markdown + 原图，适合备份与再导入。
 *
 * 保存位置：优先用 File System Access API（showSaveFilePicker）让用户**明确选路径**；
 * 系统不支持时退化为常规下载 —— 此时由系统/浏览器弹出保存询问，
 * 所以文案要说明"接下来会让你选择保存位置"，避免用户以为没反应。
 */

interface TravelOption { slug: string; title: string; date?: string; cover?: string }

/** File System Access API 的最小类型（TS 的 lib.dom 尚未包含 showSaveFilePicker） */
interface SaveFilePickerWindow extends Window {
  showSaveFilePicker?: (opts: {
    suggestedName?: string
    types?: { description?: string; accept: Record<string, string[]> }[]
  }) => Promise<{ createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }> }>
}

export default function ExportArchiveDialog({ onClose }: { onClose: () => void }) {
  const [travels, setTravels] = useState<TravelOption[]>([])
  const [loading, setLoading] = useState(true)
  const [slug, setSlug] = useState<string>("")
  const [format, setFormat] = useState<"card" | "zip">("card")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(apiUrl('/api/travels'), { credentials: 'include' })
        const json = await res.json().catch(() => null)
        const list: TravelOption[] = Array.isArray(json?.posts)
          ? json.posts.map((p: any) => ({ slug: p.slug, title: p.title, date: p.date, cover: p.cover })).filter((p: TravelOption) => p.slug)
          : []
        if (!alive) return
        setTravels(list)
        setSlug(list[0]?.slug ?? "")
      } catch {
        if (alive) toast.error('读取旅行列表失败')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  /** 用系统保存对话框写文件；不支持则返回 false 由调用方退化为下载 */
  const saveWithPicker = useCallback(async (blob: Blob, suggestedName: string, mime: string, ext: string) => {
    const w = window as SaveFilePickerWindow
    if (typeof w.showSaveFilePicker !== "function") return false
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName,
        types: [{ description: "导出文件", accept: { [mime]: [ext] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return true
    } catch (e) {
      // 用户取消不算失败
      const err = e as Error
      if (err?.name === "AbortError") return true
      return false
    }
  }, [])

  /** 退化为普通下载（由浏览器/系统弹出保存询问） */
  const download = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 4000)
  }, [])

  const runExport = useCallback(async () => {
    if (busy) return
    if (format === "card" && !slug) { toast.error("请先选择要导出的旅行"); return }
    void hapticLight()
    setBusy(true)
    try {
      if (format === "card") {
        const res = await fetch(apiUrl("/api/export/card?slug=" + encodeURIComponent(slug)), { credentials: "include" })
        if (!res.ok) {
          const j = await res.json().catch(() => null)
          throw new Error(j?.error || "生成失败")
        }
        const html = await res.text()
        const title = travels.find((t) => t.slug === slug)?.title || "travel"
        const filename = title.slice(0, 40).replace(/[\\/:*?"<>|]/g, "_") + "-旅行卡片.html"
        const blob = new Blob([html], { type: "text/html;charset=utf-8" })
        const saved = await saveWithPicker(blob, filename, "text/html", ".html")
        if (!saved) { download(blob, filename); toast.success('已开始下载，请选择保存位置') }
        else toast.success('已保存旅行卡片')
        onClose()
        return
      }
      // ZIP 完整档案
      const res = await fetch(apiUrl("/api/export/archive"), { credentials: "include" })
      if (!res.ok) throw new Error("导出失败")
      const blob = await res.blob()
      const filename = "tiantu-archive.zip"
      const saved = await saveWithPicker(blob, filename, "application/zip", ".zip")
      if (!saved) { download(blob, filename); toast.success('已开始下载，请选择保存位置') }
      else toast.success('已保存完整档案')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '导出失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }, [busy, download, format, onClose, saveWithPicker, slug, travels])

  return (
    <div className="fixed inset-0 z-[135] flex items-center justify-center px-5" role="dialog" aria-modal="true" aria-label="导出记忆档案">
      <div className="absolute inset-0 bg-black/45" onClick={busy ? undefined : onClose} />
      <div className="relative flex max-h-[82dvh] w-full max-w-sm flex-col overflow-hidden rounded-3xl bg-[var(--m-surface-solid)] shadow-[var(--m-shadow-lg)]">
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <h3 className="m-title-2 font-semibold text-[var(--m-text)]">导出记忆档案</h3>
          <button type="button" onClick={onClose} disabled={busy} aria-label="关闭" className="m-pressable rounded-full p-2 text-[var(--m-muted)] disabled:opacity-40">
            <Icon icon={X} size="sm" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          {/* 形式 */}
          <p className="m-field-label">导出形式</p>
          <div className="mt-2 space-y-2">
            <FormatOption
              active={format === "card"}
              icon={ImageIcon}
              title="旅行卡片（HTML）"
              hint="单文件长卡片，打开即看，适合分享与留档"
              onClick={() => setFormat("card")}
            />
            <FormatOption
              active={format === "zip"}
              icon={FileDown}
              title="完整档案（ZIP）"
              hint="结构化数据 + 文字叙事 + 原图，适合备份"
              onClick={() => setFormat("zip")}
            />
          </div>

          {/* 旅行选择（仅卡片需要） */}
          {format === "card" && (
            <div className="mt-4">
              <p className="m-field-label">选择旅行</p>
              {loading ? (
                <p className="py-4 text-center text-[13px] text-[var(--m-muted)]">正在读取…</p>
              ) : travels.length === 0 ? (
                <p className="py-4 text-center text-[13px] text-[var(--m-muted)]">还没有可导出的旅行</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {travels.map((t) => {
                    const active = t.slug === slug
                    return (
                      <li key={t.slug}>
                        <button
                          type="button"
                          onClick={() => { void hapticLight(); setSlug(t.slug) }}
                          aria-pressed={active}
                          className={cn(
                            "m-pressable flex min-h-[52px] w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left transition-colors",
                            active ? "bg-[var(--m-accent-soft)]" : "bg-[var(--m-surface-2)]",
                          )}
                        >
                          <span className={cn(
                            "flex h-5 w-5 flex-none items-center justify-center rounded-full border-2",
                            active ? "border-[var(--m-accent)]" : "border-[var(--m-line)]",
                          )}>
                            {active && <span className="h-2.5 w-2.5 rounded-full bg-[var(--m-accent)]" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={cn("m-body block truncate", active ? "font-semibold text-[var(--m-accent-strong)]" : "text-[var(--m-text)]")}>
                              {t.title}
                            </span>
                            {t.date && <span className="m-caption mt-0.5 block truncate text-[var(--m-muted)]">{String(t.date).slice(0, 10)}</span>}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          <p className="m-caption mt-4 text-[var(--m-muted)]">
            点击导出后会让你选择保存位置；若系统不支持选择，则由浏览器下载并询问保存。
          </p>
        </div>

        <div className="flex gap-3 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-4">
          <button type="button" onClick={onClose} disabled={busy} className="m-pressable min-h-[48px] rounded-2xl px-4 text-[15px] font-medium text-[var(--m-muted)] ring-1 ring-[var(--m-line)] disabled:opacity-40">
            取消
          </button>
          <button
            type="button"
            onClick={() => { void runExport() }}
            disabled={busy || (format === "card" && !slug)}
            className="m-press m-btn-primary min-h-[48px] flex-1 rounded-2xl text-[15px] font-semibold disabled:opacity-40"
          >
            {busy ? "正在导出…" : "导出"}
          </button>
        </div>
      </div>
    </div>
  )
}

function FormatOption({
  active, icon, title, hint, onClick,
}: {
  active: boolean
  icon: LucideIcon
  title: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "m-pressable flex w-full items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors",
        active ? "border-[var(--m-accent)] bg-[var(--m-accent-soft)]" : "border-[var(--m-line)] bg-[var(--m-surface-solid)]",
      )}
    >
      <Icon icon={icon} size="sm" tone={active ? "accent" : "muted"} />
      <span className="min-w-0 flex-1">
        <span className={cn("m-body block font-medium", active ? "text-[var(--m-accent-strong)]" : "text-[var(--m-text)]")}>{title}</span>
        <span className="m-caption mt-0.5 block text-[var(--m-muted)]">{hint}</span>
      </span>
    </button>
  )
}
