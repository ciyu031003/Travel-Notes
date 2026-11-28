'use client'

/**
 * 绑定 Y.Text 的输入框 + **远端光标渲染**（L3 同段文字双光标）。
 *
 * 为什么不是普通受控 textarea：
 *   · 文本的真源是 Y.Text，两个客户端可以同时在同一段里打字，本地不能整段回写
 *     （否则对方的字会被覆盖）—— 这里按「最小 diff」把本地输入 translate 成
 *     ytext.insert/delete，远端更新再按同法映射回光标位置；
 *   · 远端插入符用「测量镜」定位：一个与输入框同款字体/内边距的隐藏 div 渲染
 *     光标前的文本，读 marker 的 offsetTop/offsetLeft，再叠一个绝对定位的彩色插入符。
 *     这样不需要 contenteditable，也不用引入编辑器依赖，IME（中文输入）沿用浏览器原生。
 *
 * 配色：awareness 里只放槽位号（user.slot），颜色由 CSS 的 [data-slot] 决定，
 * tsx 里不出现裸色值（设计规范第 1 条）。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Text as YText, Transaction, YTextEvent } from 'yjs'
import { usePlanCursors, usePlanItem, usePlanStore } from './plan-collab-context'
import type { PlanTextField } from '@/lib/client/plan-collab'
import { cn } from '@/lib/utils'

export interface CollabTextAreaProps {
  itemId: number
  field: PlanTextField
  label: string
  placeholder?: string
  /** 多行（备注）或单行（标题/地点） */
  multiline?: boolean
  rows?: number
  maxLength?: number
  /** 文档尚未就绪时展示的只读文案 */
  fallbackValue?: string
  className?: string
}

interface CaretPosition {
  clientId: number
  top: number
  left: number
  height: number
  slot: number
  name: string
}

/** 远端改动后，把本地选区映射到新文本上（前后缀 diff，够用且不会跳到行首） */
function adjustSelection(oldValue: string, newValue: string, start: number, end: number): [number, number] {
  let prefix = 0
  while (prefix < oldValue.length && prefix < newValue.length && oldValue[prefix] === newValue[prefix]) prefix += 1
  let suffix = 0
  while (
    suffix < oldValue.length - prefix &&
    suffix < newValue.length - prefix &&
    oldValue[oldValue.length - 1 - suffix] === newValue[newValue.length - 1 - suffix]
  ) {
    suffix += 1
  }
  const oldChangedEnd = oldValue.length - suffix
  const newChangedEnd = newValue.length - suffix
  const map = (position: number): number => {
    if (position <= prefix) return position
    if (position >= oldChangedEnd) return position + (newChangedEnd - oldChangedEnd)
    return newChangedEnd
  }
  return [map(start), map(end)]
}

function peerName(slotUser: { nickname: string | null; username: string } | null): string {
  if (!slotUser) return '有人'
  return slotUser.nickname || slotUser.username || '有人'
}

export function CollabTextArea({
  itemId,
  field,
  label,
  placeholder,
  multiline = false,
  rows = 2,
  maxLength,
  fallbackValue,
  className,
}: CollabTextAreaProps) {
  const store = usePlanStore()
  // 订阅这一块：远端改文本时 item 快照会变，这里跟着重渲染（textarea 的值由 observe 维护）
  usePlanItem(itemId)
  const cursors = usePlanCursors()
  const ytext: YText | null = store.getItemText(itemId, field)

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const mirrorRef = useRef<HTMLDivElement | null>(null)
  const mirrorTextRef = useRef<HTMLSpanElement | null>(null)
  const mirrorMarkerRef = useRef<HTMLSpanElement | null>(null)
  const composingRef = useRef(false)
  const [positions, setPositions] = useState<CaretPosition[]>([])

  const peersHere = cursors.filter(
    (peer) => peer.editingItemId === itemId && peer.editingField === field && peer.cursor != null,
  )

  /** 测量每个远端插入符在输入框内的像素位置 */
  const measure = useCallback(() => {
    const el = textareaRef.current
    const mirror = mirrorRef.current
    const mirrorText = mirrorTextRef.current
    const marker = mirrorMarkerRef.current
    if (!el || !mirror || !mirrorText || !marker) return
    const peers = cursors.filter(
      (peer) => peer.editingItemId === itemId && peer.editingField === field && typeof peer.cursor === 'number',
    )
    if (peers.length === 0) {
      setPositions((prev) => (prev.length === 0 ? prev : []))
      return
    }
    const computed = window.getComputedStyle(el)
    const lineHeight = Number.parseFloat(computed.lineHeight) || 24
    const value = el.value
    const next: CaretPosition[] = peers.map((peer) => {
      const cursor = Math.max(0, Math.min(value.length, peer.cursor ?? 0))
      mirrorText.textContent = value.slice(0, cursor)
      const top = marker.offsetTop - el.scrollTop
      const left = marker.offsetLeft - el.scrollLeft
      return {
        clientId: peer.clientId,
        top,
        left,
        height: lineHeight,
        slot: peer.user?.slot ?? 0,
        name: peerName(peer.user),
      }
    })
    setPositions((prev) => {
      if (prev.length === next.length && prev.every((p, i) => p.clientId === next[i].clientId && p.top === next[i].top && p.left === next[i].left)) {
        return prev
      }
      return next
    })
  }, [cursors, itemId, field])

  // Y.Text → textarea：初始化 + 远端更新
  useEffect(() => {
    const el = textareaRef.current
    if (!ytext || !el) return
    el.value = ytext.toString()
    const onRemoteChange = (event: YTextEvent, transaction: Transaction) => {
      if (transaction.local) return
      if (composingRef.current) return
      const next = ytext.toString()
      if (el.value === next) return
      const [start, end] = adjustSelection(el.value, next, el.selectionStart ?? 0, el.selectionEnd ?? 0)
      el.value = next
      try {
        el.setSelectionRange(start, end)
      } catch {
        // 输入框可能已失焦/卸载
      }
      measure()
    }
    ytext.observe(onRemoteChange)
    measure()
    return () => {
      ytext.unobserve(onRemoteChange)
    }
  }, [ytext, measure])

  // 远端光标移动 / 本地文本变化时重新测量（依赖 measure：它随 cursors 变化换新引用）
  useLayoutEffect(() => {
    measure()
  }, [measure])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    const onScroll = () => measure()
    el.addEventListener('scroll', onScroll, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure())
    observer?.observe(el)
    return () => {
      el.removeEventListener('scroll', onScroll)
      observer?.disconnect()
    }
  }, [measure])

  /** 本地输入 → 最小 diff 写入 Y.Text（不整段覆盖，否则会抹掉对方正在打的字） */
  const commitLocalValue = useCallback(
    (next: string) => {
      if (!ytext) return
      const previous = ytext.toString()
      if (next === previous) return
      let prefix = 0
      while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) prefix += 1
      let suffix = 0
      while (
        suffix < previous.length - prefix &&
        suffix < next.length - prefix &&
        previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
      ) {
        suffix += 1
      }
      const removeLength = previous.length - prefix - suffix
      const insertText = next.slice(prefix, next.length - suffix)
      ytext.doc?.transact(() => {
        if (removeLength > 0) ytext.delete(prefix, removeLength)
        if (insertText) ytext.insert(prefix, insertText)
      })
      measure()
    },
    [ytext, measure],
  )

  const broadcastCursor = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    store.setCursor(el.selectionStart, el.selectionEnd)
  }, [store])

  if (!ytext) {
    return (
      <div className={cn('plan-collab-readonly', className)}>
        <span className="plan-collab-readonly-label">{label}</span>
        <span className="plan-collab-readonly-value">{fallbackValue || placeholder || '—'}</span>
        <span className="plan-collab-readonly-hint">协同通道连接中，稍后可直接编辑这一段</span>
      </div>
    )
  }

  return (
    <div className={cn('plan-collab-field-wrap', className)}>
      <div className="plan-collab-field-head">
        <label className="plan-collab-field-label" htmlFor={`plan-field-${itemId}-${field}`}>
          {label}
        </label>
        {peersHere.length > 0 && (
          <span className="plan-field-peers" aria-live="polite">
            {peersHere.slice(0, 3).map((peer) => (
              <span key={peer.clientId} className="plan-field-peers-dot" data-slot={peer.user?.slot ?? 0} aria-hidden="true" />
            ))}
            {peersHere.length === 1 ? `${peerName(peersHere[0].user)}正在改这段` : `${peersHere.length} 人正在改这段`}
          </span>
        )}
      </div>

      <div className="plan-collab-input-box">
        <div className="plan-collab-mirror" aria-hidden="true" ref={mirrorRef}>
          <span ref={mirrorTextRef} />
          <span className="plan-collab-mirror-marker" ref={mirrorMarkerRef} />
        </div>
        <textarea
          id={`plan-field-${itemId}-${field}`}
          ref={textareaRef}
          className={cn('plan-collab-input', multiline ? 'is-multiline' : 'is-singleline')}
          rows={multiline ? rows : 1}
          placeholder={placeholder}
          maxLength={maxLength}
          aria-label={`${label}（多人可同时编辑）`}
          onFocus={() => {
            store.setEditing(itemId, field)
            store.setCursor(textareaRef.current?.selectionStart ?? 0, textareaRef.current?.selectionEnd ?? 0)
            measure()
          }}
          onBlur={() => {
            store.setEditing(null, null)
            store.setCursor(null, null)
            setPositions((prev) => (prev.length === 0 ? prev : []))
          }}
          onInput={(event) => {
            if (composingRef.current) return
            commitLocalValue(event.currentTarget.value)
            broadcastCursor()
          }}
          onCompositionStart={() => {
            composingRef.current = true
          }}
          onCompositionEnd={(event) => {
            composingRef.current = false
            commitLocalValue(event.currentTarget.value)
            broadcastCursor()
            measure()
          }}
          onSelect={broadcastCursor}
          onKeyUp={broadcastCursor}
        />
        <div className="plan-remote-carets" aria-hidden="true">
          {positions.map((position) => (
            <span
              key={position.clientId}
              className="plan-remote-caret"
              data-slot={position.slot}
              style={{ top: position.top, left: position.left, height: position.height }}
            >
              <span className="plan-remote-caret-label">{position.name}</span>
            </span>
          ))}
        </div>
      </div>

    </div>
  )
}
