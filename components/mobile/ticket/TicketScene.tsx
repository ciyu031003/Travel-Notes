import type { ReactElement } from 'react'
import type { TicketDayPart, TicketSeason } from '@/lib/ticket/types'

/**
 * 票面插画天光层（TicketScene）
 * ============================================================================
 * 需求（真机反馈）：「票据上面不要以春清晨这种效果的文字来显示，应该是以不同的
 * 背景来显示……春天的清晨是花瓣上有露水，背景去做成那种插画式的动态效果」。
 *
 * 所以票面不再有「春 · 清晨」这类文字标签（ticketMoodLabel 的展示点已删除），
 * 改成 4 季 × 4 时段 = 16 套**分层插画**。每套都必须能"读"出季节与天光：
 *
 *   季节（形状）      春：花枝 + 花瓣飘落 + 露水高光
 *                    夏：浓叶冠层 + 光斑 + 热浪
 *                    秋：银杏扇叶 + 落叶 + 金色斜光
 *                    冬：枯枝 + 雪粒 + 雪原/雪山
 *   时段（光照结构）  清晨：光源低在左侧 + 低平薄雾 + 露珠
 *                    正午：光源高在右上方 + 放射光束 + 清晰远山剪影
 *                    黄昏：光源低在右侧 + 长条晚霞 + 飞鸟
 *                    夜晚：月牙 + 星点 + 灯火/萤火
 *
 * 实现纪律（对应任务的硬约束）：
 *  · 只用分层 CSS 渐变 + 内联 SVG 剪影 + CSS animation，**零依赖 / 零图片 / 无 canvas**；
 *  · 组件里不出现任何颜色字面量：所有色值由 .tk-<season>-<part> 主题块暴露的
 *    --tk-sc-* 变量提供（见 app/ticket-art.css 第 11 节），SVG 只写 fill 类名；
 *  · 动画全部在 @media (prefers-reduced-motion: no-preference) 里声明，
 *    减动效用户看到的是完全静止的插画；
 *  · 插画是**背景层**：票面文字在 .tk-body 里（更高 z + 更高 translateZ），
 *    外加 .tk-scene-scrim 压一层可读性 scrim，不会出现"风景画盖住文字"。
 */

/** 远山 / 地平线剪影：四季轮廓不同，一眼能分出地形 */
const HILLS: Record<TicketSeason, ReactElement> = {
  // 春：柔缓丘陵（起伏圆、没有尖角）
  spring: (
    <>
      <path
        className="tk-hills-far"
        d="M0 27 C14 20 24 25 36 22 C50 18 60 25 74 24 C89 23 104 19 120 23 L120 40 L0 40 Z"
      />
      <path
        className="tk-hills-near"
        d="M0 33 C16 28 30 32 46 30 C64 28 78 33 94 31 C106 30 114 32 120 31 L120 40 L0 40 Z"
      />
    </>
  ),
  // 夏：树冠层（连续的圆顶），远处是浓密的林线
  summer: (
    <>
      <path
        className="tk-hills-far"
        d="M0 25 C10 18 18 22 24 18 C30 14 38 20 44 23 C54 28 62 22 70 19 C80 15 90 22 98 24 C108 26 114 22 120 24 L120 40 L0 40 Z"
      />
      <path
        className="tk-hills-near"
        d="M0 31 C8 26 16 30 22 27 C28 24 36 30 44 31 C56 32 64 27 74 30 C86 33 96 29 106 32 C112 33 116 32 120 33 L120 40 L0 40 Z"
      />
    </>
  ),
  // 秋：层叠山脊（尖角 + 横向分层，暖金调）
  autumn: (
    <>
      <path
        className="tk-hills-far"
        d="M0 28 L16 17 L29 25 L43 13 L57 23 L72 16 L86 26 L101 19 L114 27 L120 24 L120 40 L0 40 Z"
      />
      <path
        className="tk-hills-near"
        d="M0 34 L14 27 L28 33 L42 25 L58 33 L72 28 L88 34 L104 29 L120 34 L120 40 L0 40 Z"
      />
    </>
  ),
  // 冬：雪山（更尖、更硬的折线）+ 平缓雪原
  winter: (
    <>
      <path
        className="tk-hills-far"
        d="M0 29 L13 18 L24 26 L38 11 L52 24 L64 16 L78 28 L94 19 L108 27 L120 23 L120 40 L0 40 Z"
      />
      <path
        className="tk-hills-near"
        d="M0 35 C18 32 34 35 52 33 C70 31 88 35 104 33 C112 32 116 33 120 33 L120 40 L0 40 Z"
      />
    </>
  ),
}

/** 花枝 / 叶枝 / 折枝剪影：季节的"植物语言"，从票面左上角伸进来 */
const FLORA: Record<TicketSeason, ReactElement> = {
  // 春：花枝 + 五瓣花簇 + 被风带起的花瓣
  spring: (
    <>
      <g className="tk-flora-line" fill="none" strokeWidth="1.1" strokeLinecap="round">
        <path d="M-4 5 C12 8 24 3 36 10 C45 15 49 22 57 25" />
        <path d="M36 10 C37 17 41 20 39 27" />
        <path d="M20 6 C22 13 27 15 26 21" />
        <path d="M48 22 C53 26 55 31 54 36" />
      </g>
      <g className="tk-flora-blossom">
        <circle cx="12" cy="7" r="3.1" />
        <circle cx="24" cy="6" r="2.4" />
        <circle cx="36" cy="11" r="3.4" />
        <circle cx="48" cy="22" r="2.8" />
        <circle cx="57" cy="25" r="2.2" />
        <circle cx="26" cy="21" r="1.9" />
        <circle cx="39" cy="27" r="1.7" />
        <circle cx="54" cy="36" r="1.5" />
        <ellipse cx="70" cy="34" rx="2.6" ry="1.3" transform="rotate(-24 70 34)" />
        <ellipse cx="84" cy="52" rx="2.2" ry="1.1" transform="rotate(14 84 52)" />
        <ellipse cx="63" cy="63" rx="2" ry="1" transform="rotate(-40 63 63)" />
      </g>
    </>
  ),
  // 夏：顶部浓叶冠层 + 几片大叶（繁叶浓绿）
  summer: (
    <>
      <g className="tk-flora-canopy">
        <path d="M120 0 C104 2 94 9 90 19 C84 12 74 12 68 19 C77 21 84 28 86 36 C92 27 103 23 113 25 C117 18 119 9 120 3 Z" />
        <path d="M0 0 C9 5 13 13 13 21 C19 14 28 14 32 19 C23 23 19 31 19 38 C12 29 6 25 0 25 Z" />
      </g>
      <g className="tk-flora-leaf">
        <path d="M58 9 C67 5 76 10 78 19 C69 23 60 18 58 9 Z" />
        <path d="M84 30 C93 26 102 31 104 40 C95 44 86 39 84 30 Z" />
        <path d="M38 23 C47 19 56 24 58 33 C49 37 40 32 38 23 Z" />
      </g>
    </>
  ),
  // 秋：银杏枝 + 扇形叶 + 一片被风卷起的叶子
  autumn: (
    <>
      <g className="tk-flora-line" fill="none" strokeWidth="1.1" strokeLinecap="round">
        <path d="M-4 3 C12 7 22 4 34 12 C42 18 48 24 58 28" />
        <path d="M34 12 C36 20 40 24 38 32" />
        <path d="M58 28 C62 34 64 40 62 46" />
      </g>
      <g className="tk-flora-ginkgo">
        <path d="M34 10 L26 18 A9 9 0 0 0 42 18 Z" />
        <path d="M58 26 L52 33 A7 7 0 0 0 64 33 Z" />
        <path d="M20 5 L13 12 A7.5 7.5 0 0 0 26 12 Z" />
        <path d="M72 40 C78 36 86 41 88 50 C80 54 72 49 72 40 Z" />
        <ellipse cx="96" cy="30" rx="3" ry="1.6" transform="rotate(24 96 30)" />
        <ellipse cx="44" cy="52" rx="2.4" ry="1.3" transform="rotate(-30 44 52)" />
      </g>
    </>
  ),
  // 冬：枯枝（硬折线）+ 枝头积雪
  winter: (
    <>
      <g className="tk-flora-line" fill="none" strokeWidth="1.2" strokeLinecap="round">
        <path d="M-2 4 L20 9 L24 20 M20 9 L34 5 M24 20 L32 30 M24 20 L16 30" />
        <path d="M60 2 L58 14 L66 22 M58 14 L50 20" />
      </g>
      <g className="tk-flora-snow">
        <ellipse cx="20" cy="8.4" rx="4.2" ry="1.5" transform="rotate(10 20 8)" />
        <ellipse cx="24" cy="19.4" rx="3.6" ry="1.3" transform="rotate(-18 24 19)" />
        <ellipse cx="58" cy="13.4" rx="3.2" ry="1.2" />
        <ellipse cx="66" cy="21.6" rx="2.8" ry="1.1" transform="rotate(28 66 22)" />
        <ellipse cx="34" cy="5.2" rx="3" ry="1.1" transform="rotate(-8 34 5)" />
      </g>
    </>
  ),
}

export interface TicketSceneProps {
  season: TicketSeason
  dayPart: TicketDayPart
}

/**
 * 票面插画背景。
 *
 * 层级（由低到高）：
 *   base   天空渐变 / 日月光体 / 云带 / 远山 / 花枝  ← 真正的"画面"
 *   scrim  可读性压暗（每套票面形态强度不同，见 CSS）
 *   air    飘落物（花瓣/雪粒/落叶/光斑）+ 露水 + 星点 + 灯火 + 飞鸟
 * 飘落物放最上层、但透明度低且体积小，不会影响票面字号阅读。
 */
export default function TicketScene({ season, dayPart }: TicketSceneProps) {
  return (
    <div className="tk-scene" data-scene={season} data-part={dayPart} aria-hidden="true">
      <div className="tk-scene-base">
        <span className="tk-scene-sky" />
        <span className="tk-scene-orb" />
        <span className="tk-scene-rays" />
        <span className="tk-scene-cloud tk-scene-cloud-1" />
        <span className="tk-scene-cloud tk-scene-cloud-2" />
        <span className="tk-scene-horizon" />
        {season === 'summer' && dayPart === 'noon' ? <span className="tk-scene-heat" /> : null}
        <svg className="tk-scene-hills" viewBox="0 0 120 40" preserveAspectRatio="none" focusable="false">
          {HILLS[season]}
        </svg>
        <svg className="tk-scene-flora" viewBox="0 0 120 80" preserveAspectRatio="none" focusable="false">
          {FLORA[season]}
        </svg>
        {dayPart === 'dusk' ? (
          <svg className="tk-scene-birds" viewBox="0 0 64 16" preserveAspectRatio="none" focusable="false">
            <path className="tk-scene-bird" d="M2 10 Q6 5 10 10 Q14 5 18 10" />
            <path className="tk-scene-bird" d="M26 6 Q29.5 2 33 6 Q36.5 2 40 6" />
            <path className="tk-scene-bird" d="M46 12 Q49 8.5 52 12 Q55 8.5 58 12" />
          </svg>
        ) : null}
        {dayPart === 'evening' ? <span className="tk-scene-lights" /> : null}
      </div>

      <span className="tk-scene-scrim" />

      <div className="tk-scene-air">
        <span className="tk-scene-fall tk-scene-fall-1" />
        <span className="tk-scene-fall tk-scene-fall-2" />
        {dayPart === 'morning' ? <span className="tk-scene-dew" /> : null}
        {dayPart === 'evening' ? <span className="tk-scene-stars" /> : null}
        {dayPart === 'noon' ? <span className="tk-scene-shimmer" /> : null}
      </div>
    </div>
  )
}
