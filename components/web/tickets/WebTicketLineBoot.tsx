'use client'

/**
 * 桌面票据夹（吊绳时间线）· 首帧 / 代码块加载骨架
 * ============================================================================
 * WebTicketLine 改成了 dynamic({ ssr:false })（P1-4：移动端不再下载吊绳树 +
 * TicketTilt + web-tickets.css）。代价是桌面端「断点确定 → 代码块到达」之间
 * 有一小段空白：SSR 里的移动端 DOM 在 ≥1024 被 .wt-mobile-only 藏掉了，
 * 而吊绳版还没到。这块骨架就是那段空白的占位。
 *
 * 为什么用 Tailwind 的 hidden / lg:block 而不是新开一个 CSS 文件：
 *  · 只有桌面需要它，<1024 必须一个像素都不出现（移动端 DOM 与改动前一致）；
 *  · 纯 CSS 断点闸门 —— 媒体查询不生效时它整体可见，也不会让桌面变成空白；
 *  · 颜色走 --m-* 语义 token（亮/暗主题自动跟随），不写裸色值与字号魔术数。
 */
export default function WebTicketLineBoot() {
  return (
    <div
      className="hidden min-h-dvh bg-[var(--m-bg)] text-[var(--m-text)] lg:block"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">正在挂起票据…</span>
      <div className="mx-auto w-full max-w-[1440px] px-6 py-10" aria-hidden="true">
        {/* 顶部：标题区 + 收纳总览面板（与 .wt-hero 同形） */}
        <div className="flex flex-wrap items-end justify-between gap-8 border-b border-[var(--m-line)] pb-8">
          <div className="flex min-w-0 flex-1 basis-[320px] flex-col items-start gap-3.5">
            <span className="h-2.5 w-44 rounded-full bg-[var(--m-surface-2)]" />
            <span className="h-9 w-2/3 max-w-[24rem] rounded-2xl bg-[var(--m-surface-2)]" />
            <span className="h-9 w-1/3 max-w-[14rem] rounded-2xl bg-[var(--m-surface-2)]" />
            <span className="mt-2 h-3.5 w-full max-w-[34rem] rounded-full bg-[var(--m-surface-2)]" />
            <span className="h-3.5 w-3/5 max-w-[24rem] rounded-full bg-[var(--m-surface-2)]" />
            <div className="mt-3 flex gap-3">
              <span className="h-12 w-36 rounded-full bg-[var(--m-surface-2)]" />
              <span className="h-12 w-28 rounded-full bg-[var(--m-surface-2)]" />
            </div>
          </div>

          <div className="flex w-full max-w-[22rem] flex-col gap-4 rounded-3xl border border-[var(--m-line)] bg-[var(--m-surface)] p-5">
            <span className="h-2.5 w-24 rounded-full bg-[var(--m-surface-2)]" />
            <div className="grid grid-cols-3 gap-3">
              <span className="h-12 rounded-xl bg-[var(--m-surface-2)]" />
              <span className="h-12 rounded-xl bg-[var(--m-surface-2)]" />
              <span className="h-12 rounded-xl bg-[var(--m-surface-2)]" />
            </div>
            <span className="h-px w-full bg-[var(--m-line)]" />
            <span className="h-3 w-4/5 rounded-full bg-[var(--m-surface-2)]" />
          </div>
        </div>

        {/* 两根吊绳（每年一根）：年份头 + 挂在上面的票 */}
        {[0, 1].map((line) => (
          <div key={line} className="mt-9">
            <div className="flex items-center gap-4">
              <span className="h-6 w-20 rounded-lg bg-[var(--m-surface-2)]" />
              <span className="h-3 w-16 rounded-full bg-[var(--m-surface-2)]" />
              <span className="h-px flex-1 bg-[var(--m-line)]" />
            </div>
            <div className="mt-6 flex gap-6 overflow-hidden">
              {[0, 1, 2].map((card) => (
                <span
                  key={card}
                  className="h-56 w-44 shrink-0 rounded-3xl border border-[var(--m-line)] bg-[var(--m-surface)]"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
