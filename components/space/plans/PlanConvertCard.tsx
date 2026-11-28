'use client'

/**
 * 底部转换卡（页面最下方，不在中部）。
 *
 * 视觉：柔和液态玻璃 + 樱花粉 → 晚霞红渐变（颜色全部在 plan-collab.css 里 token 化，
 * 组件只挂类名）。三态（任务 §6）：
 *   · incomplete：还差 N 项 → 点按滚动到第一个缺口；
 *   · ready：一键生成旅行记录（可勾选同时公开到旅行圈）；
 *   · converted：已生成 → 「去看旅行记录 →」。
 *
 * 转换是幂等接口：重复点击返回 alreadyConverted，不会建第二条旅行。
 */
import { useState } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/mobile/Icon'
import { ArrowLeft, Check, CheckCircle2, Plane, Sparkles } from '@/lib/mobile/icon-system'
import { toast } from '@/lib/mobile/toast-store'
import { travelDetailHref } from '@/lib/routes'
import { usePlanRecord, usePlanStats, usePlanStore } from './plan-collab-context'

export function PlanConvertCard({ canEdit, onScrollToGap }: { canEdit: boolean; onScrollToGap: () => void }) {
  const store = usePlanStore()
  const plan = usePlanRecord()
  const stats = usePlanStats()
  const [publish, setPublish] = useState(false)
  const [converting, setConverting] = useState(false)
  const [error, setError] = useState('')
  const [publishedNow, setPublishedNow] = useState(false)
  const [requestedPublish, setRequestedPublish] = useState(false)

  const converted = plan.convertedTravelId != null
  const travelHref = plan.convertedTravelSlug ? travelDetailHref(plan.convertedTravelSlug) : null
  const ready = stats.total > 0 && stats.gapCount === 0
  const missingLabel =
    stats.gapCount > 0
      ? stats.firstGap?.itemId == null
        ? stats.firstGap?.label || '还有几天没有安排'
        : `缺 ${stats.gapCount} 项，先补「${stats.firstGap?.label || '第一项'}」`
      : ''

  const convert = async () => {
    if (converting) return
    setConverting(true)
    setError('')
    setRequestedPublish(publish)
    try {
      const result = await store.convert(publish)
      setPublishedNow(result.published)
      toast.success(result.alreadyConverted ? '这条计划已经转过了' : '已生成旅行记录')
    } catch (err) {
      setError(err instanceof Error ? err.message : '转换失败，请稍后重试')
    } finally {
      setConverting(false)
    }
  }

  return (
    <section className="plan-convert-card" aria-labelledby="plan-convert-title">
      <div className="plan-convert-glow" aria-hidden="true" />
      <div className="plan-convert-inner">
        <p className="plan-convert-eyebrow">
          <Icon icon={Sparkles} size="sm" />
          {converted ? '旅行记录已就绪' : '收尾'}
        </p>

        {converted ? (
          <>
            <h2 id="plan-convert-title" className="plan-convert-title">
              已成旅行记录
            </h2>
            <p className="plan-convert-desc">
              每天的行程、地点、花销都带过去了。想补照片和回忆，去旅行记录里继续。
            </p>
            {publishedNow ? (
              <p className="plan-convert-published">
                <Icon icon={CheckCircle2} size="sm" />
                已同时公开到旅行圈
              </p>
            ) : requestedPublish ? (
              <p className="plan-convert-published">
                <Icon icon={CheckCircle2} size="sm" />
                已勾选公开到旅行圈（发布链路就绪后生效）
              </p>
            ) : null}
            <div className="plan-convert-actions">
              {travelHref ? (
                <Link href={travelHref} className="plan-convert-link">
                  去看旅行记录
                  <Icon icon={Plane} size="sm" />
                </Link>
              ) : (
                <span className="plan-convert-desc">旅行记录已生成，可在「我的旅行」里查看。</span>
              )}
            </div>
          </>
        ) : (
          <>
            <h2 id="plan-convert-title" className="plan-convert-title">
              {ready ? '行程填满了，生成旅行记录' : `还差 ${stats.gapCount} 项就能生成`}
            </h2>
            <p className="plan-convert-desc">
              {ready
                ? `${stats.dayCount} 天 · ${stats.total} 个安排已填好。生成后每天的时间轴、地点、花销都会带过去。`
                : missingLabel || '先把每天的安排填上内容，再一键生成。'}
            </p>

            <div className="plan-convert-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stats.percent} aria-label={`已填 ${stats.filled}/${stats.total} 项`}>
              <span className="plan-convert-progress-fill" style={{ transform: `scaleX(${stats.percent / 100})` }} />
            </div>
            <p className="plan-convert-progress-label">
              已填 {stats.filled}/{stats.total} 项
              {stats.total > 0 && <span className="plan-convert-progress-pct">{stats.percent}%</span>}
            </p>

            <button
              type="button"
              role="switch"
              aria-checked={publish}
              className="plan-convert-switch-row"
              onClick={() => setPublish((value) => !value)}
            >
              <span className="plan-convert-switch" data-on={publish ? 'true' : undefined} aria-hidden="true">
                <span className="plan-convert-switch-thumb" />
              </span>
              <span className="plan-convert-switch-text">
                <span className="plan-convert-switch-label">同时公开到旅行圈</span>
                <span className="plan-convert-switch-hint">生成后这条旅行会出现在旅行圈，可随时取消</span>
              </span>
            </button>

            {error && (
              <p className="plan-convert-error" role="alert">
                {error}
              </p>
            )}

            <div className="plan-convert-actions">
              {ready ? (
                <button
                  type="button"
                  className="plan-convert-cta"
                  disabled={!canEdit || converting}
                  onClick={() => void convert()}
                >
                  <Icon icon={Sparkles} size="sm" />
                  {converting ? '正在生成…' : '一键生成旅行记录'}
                </button>
              ) : (
                <button
                  type="button"
                  className="plan-convert-cta is-ghost"
                  disabled={!canEdit}
                  onClick={onScrollToGap}
                >
                  <Icon icon={ArrowLeft} size="sm" className="rotate-180" />
                  去补齐第一项
                </button>
              )}
            </div>
            {!canEdit && (
              <p className="plan-convert-viewer-hint">只有空间成员能把计划生成旅行记录。</p>
            )}
            <ul className="plan-convert-points">
              <li>
                <Icon icon={Check} size="sm" />
                每天的时间轴与类型会变成旅行记录的行程项
              </li>
              <li>
                <Icon icon={Check} size="sm" />
                花销、备注、照片都会带上
              </li>
            </ul>
          </>
        )}
      </div>
    </section>
  )
}
