'use client'

/**
 * 桌面画册墙 · 首帧中性骨架 / 渲染失败兜底
 * ============================================================================
 * 为什么需要它（P0：桌面首帧整页空白）
 * ---------------------------------------------------------------------------
 * 桌面视口判定是 `useDesktopViewport()`，SSR / 水合首帧返回 null（断点未知）。
 * 之前这一帧押的是「先渲染移动端 TravelBook，再用 .wa-hide-on-desktop 把它藏掉」——
 * 那个类只在 @media (min-width:1024px) 里 display:none，于是桌面首帧只剩空白：
 * 没有骨架、没有内容；JS 没执行时更是永久空白。
 *
 * 现在的契约：**null（断点未知）时只渲染这块中性骨架** ——
 *  · 纯 CSS 布局（grid auto-fill + flex-wrap），不依赖任何断点，任何宽度都不会塌；
 *  · 不写字号魔术值、不写裸色值，颜色全部走 --m-* 语义 token（于是亮/暗主题自动跟随），
 *    亮色下与桌面画册墙的暖象牙、暗色下与墨色画布同色系，接上真内容时不会「闪一下白」；
 *  · 不做流光/脉冲动画：这一帧可能只存在十几毫秒，动画反而像故障。
 *
 * 同一块骨架同时给 `dynamic(import(...), { loading })` 用：代码块到达前看到的
 * 也是它，桌面从骨架 → 画册墙自己的卡片骨架是连续的同形过渡（不跳高度）。
 */
export default function AlbumWallBoot({ label = '正在装订画册…' }: { label?: string }) {
  return (
    <div
      className="min-h-dvh bg-[var(--m-bg)] text-[var(--m-text)]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">{label}</span>
      <div className="mx-auto w-full max-w-[1440px] px-6 py-8" aria-hidden="true">
        {/* 顶部：标题区 + 右侧玻璃面板（与 .wa-hero 的 7/5 分栏同形） */}
        <div className="flex flex-wrap items-end justify-between gap-8 border-b border-[var(--m-line)] pb-7">
          <div className="flex min-w-0 flex-1 basis-[320px] flex-col items-start gap-3.5">
            <span className="h-2.5 w-36 rounded-full bg-[var(--m-surface-2)]" />
            <span className="h-9 w-3/5 max-w-[22rem] rounded-2xl bg-[var(--m-surface-2)]" />
            <span className="mt-2 h-3.5 w-full max-w-[30rem] rounded-full bg-[var(--m-surface-2)]" />
            <span className="h-3.5 w-2/3 max-w-[22rem] rounded-full bg-[var(--m-surface-2)]" />
            <div className="mt-3 flex gap-3">
              <span className="h-12 w-36 rounded-full bg-[var(--m-surface-2)]" />
              <span className="h-12 w-28 rounded-full bg-[var(--m-surface-2)]" />
            </div>
          </div>

          <div className="flex w-full max-w-[22rem] flex-col gap-4 rounded-3xl border border-[var(--m-line)] bg-[var(--m-surface)] p-5">
            <span className="h-2.5 w-24 rounded-full bg-[var(--m-surface-2)]" />
            <div className="grid grid-cols-3 gap-2">
              <span className="h-10 rounded-full bg-[var(--m-surface-2)]" />
              <span className="h-10 rounded-full bg-[var(--m-surface-2)]" />
              <span className="h-10 rounded-full bg-[var(--m-surface-2)]" />
            </div>
            <span className="h-px w-full bg-[var(--m-line)]" />
            <div className="grid grid-cols-3 gap-3">
              <span className="h-12 rounded-xl bg-[var(--m-surface-2)]" />
              <span className="h-12 rounded-xl bg-[var(--m-surface-2)]" />
              <span className="h-12 rounded-xl bg-[var(--m-surface-2)]" />
            </div>
            <span className="h-3 w-4/5 rounded-full bg-[var(--m-surface-2)]" />
          </div>
        </div>

        {/* 画册墙：标题行 + 3 张同形卡片（auto-fill，窄屏自动降列，无断点） */}
        <div className="mt-7 flex items-baseline justify-between gap-4">
          <span className="h-6 w-32 rounded-lg bg-[var(--m-surface-2)]" />
          <span className="h-3 w-44 rounded-full bg-[var(--m-surface-2)]" />
        </div>
        <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-6">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="aspect-[5/6] rounded-3xl border border-[var(--m-line)] bg-[var(--m-surface)]"
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * 桌面画册墙渲染失败的兜底（给 ErrorBoundary 用）。
 * 默认兜底卡是暗色玻璃样式，放在画册墙的浅色画布上会像一块异物，所以单独给一版。
 */
export function AlbumWallError() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--m-bg)] px-6 text-[var(--m-text)]">
      <div
        role="alert"
        className="w-full max-w-md rounded-3xl border border-[var(--m-line)] bg-[var(--m-surface)] p-7 text-center"
      >
        <p className="text-[15px] font-semibold">桌面画册墙没能打开</p>
        <p className="mt-2 text-[13px] leading-6 text-[var(--m-muted)]">
          相册的其它内容不受影响。
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 inline-flex h-11 items-center rounded-full bg-[var(--m-accent-soft)] px-5 text-[13px] font-semibold text-[var(--m-accent-strong)]"
        >
          重新加载
        </button>
      </div>
    </div>
  )
}
