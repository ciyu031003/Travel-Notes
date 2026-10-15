/**
 * 旅行分享卡片（2026-10-15）
 * ============================================================================
 * 需求：导出的旅行档案要"有种分享卡片的感觉"，并且能独立打开（不依赖 App/服务器）。
 *
 * 产出：一个**自包含 HTML**（样式全部内联、无外部依赖），可以直接：
 *  · 在浏览器/手机上打开看；
 *  · 微信/相册里当一张长图那样分享；
 *  · 存档留底（图片用绝对地址引用，联网时可显示）。
 *
 * 为什么选 HTML 而不是图片：TrueType 中文字体 + 排版要好看就得走浏览器渲染；
 * 生成 HTML 由用户浏览器渲染，清晰度无损、体积小、还能保留文字可复制、可无障碍阅读。
 */
import { getTravelBySlug, getTravelTimeline } from '../travel/travel.service'

/** 极简 HTML 转义：卡片内容来自用户输入，必须转义，避免破坏结构/注入 */
function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return ""
  const t = String(d).slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  return m ? m[1] + "年" + Number(m[2]) + "月" + Number(m[3]) + "日" : t
}

function daysBetween(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null
  const s = new Date(a).getTime()
  const e = new Date(b).getTime()
  if (isNaN(s) || isNaN(e) || e < s) return null
  return Math.round((e - s) / 86400000) + 1
}

function fmtMoney(n: number): string {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export async function buildTravelShareCard(slug: string): Promise<{ html: string; filename: string }> {
  const travel = await getTravelBySlug(slug).catch(() => null)
  if (!travel) throw new Error("旅行不存在")

  const timeline = travel.id ? await getTravelTimeline(travel.id, null).catch(() => null) : null
  const days = timeline?.days ?? []
  const cover = (travel as any).coverUrl as string | null | undefined

  // 统计：天数、行程条数、照片数、花销合计
  const itemCount = days.reduce((n, d: any) => n + (d.itinerary?.length ?? 0), 0)
  const photoUrls: string[] = []
  for (const d of days as any[]) {
    for (const it of d.itinerary ?? []) {
      for (const p of it.photos ?? []) {
        const u = typeof p === "string" ? p : p?.url
        if (u) photoUrls.push(u)
      }
    }
  }
  const totalExpense = days.reduce((sum: number, d: any) => {
    return sum + (d.expenses ?? []).reduce((s2: number, e: any) => s2 + Number(e.amountCents ?? 0), 0) / 100
  }, 0)
  const span = daysBetween(travel.startDate, travel.endDate)

  const hero = cover
    ? '<img class="cover" src="' + esc(cover) + '" alt="" loading="lazy" />'
    : '<div class="cover cover-fallback"></div>'

  const dayBlocks = (days as any[])
    .map((d, i) => {
      const items = (d.itinerary ?? [])
        .map((it: any) => {
          const time = it.startTime ? String(it.startTime).slice(11, 16) : ""
          return (
            '<li class="item">' +
            (time ? '<span class="time">' + esc(time) + "</span>" : '<span class="time time-empty">--</span>') +
            '<span class="item-title">' + esc(it.title) + "</span>" +
            (it.location ? '<span class="item-loc">' + esc(it.location) + "</span>" : "") +
            "</li>"
          )
        })
        .join("")
      return (
        '<section class="day">' +
        '<h3 class="day-head"><span class="day-no">DAY ' + String(i + 1).padStart(2, "0") + "</span>" +
        '<span class="day-date">' + esc(travel.startDate ? fmtDate(shiftDate(travel.startDate, i)) : "") + "</span></h3>" +
        (items ? '<ul class="items">' + items + "</ul>" : '<p class="empty">这天还没有记录行程</p>') +
        "</section>"
      )
    })
    .join("")

  const gallery = photoUrls
    .slice(0, 9)
    .map((u) => '<img src="' + esc(u) + '" alt="" loading="lazy" />')
    .join("")

  const companions: any[] = Array.isArray((travel as any).companions) ? (travel as any).companions : []
  const companionText = companions.length
    ? companions.map((c: any) => esc(c?.name)).filter(Boolean).join(" · ")
    : ""

  const html = [
    "<!DOCTYPE html>",
    '<html lang="zh-CN"><head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width,initial-scale=1" />',
    "<title>" + esc(travel.title) + " · 旅行卡片</title>",
    "<style>",
    CARD_CSS,
    "</style></head><body>",
    '<main class="card">',
    '<div class="hero">' + hero + '<div class="hero-shade"></div>',
    '<div class="hero-text"><p class="brand">星见旅行</p><h1>' + esc(travel.title) + "</h1>",
    '<p class="meta">' +
    (travel.location ? esc(travel.location) + " · " : "") +
    esc(fmtDate(travel.startDate)) +
    (travel.endDate && travel.endDate !== travel.startDate ? " — " + esc(fmtDate(travel.endDate)) : "") +
    "</p></div></div>",
    '<div class="stats">' +
    '<div class="stat"><b>' + (span ?? "-") + "</b><span>天</span></div>" +
    '<div class="stat"><b>' + itemCount + "</b><span>段行程</span></div>" +
    '<div class="stat"><b>' + photoUrls.length + "</b><span>张照片</span></div>" +
    (totalExpense > 0 ? '<div class="stat"><b>¥' + esc(fmtMoney(totalExpense)) + "</b><span>花销</span></div>" : "") +
    "</div>",
    travel.description ? '<p class="desc">' + esc(travel.description) + "</p>" : "",
    companionText ? '<p class="companions">同行：' + companionText + "</p>" : "",
    dayBlocks,
    gallery ? '<section class="gallery"><h3 class="day-head">旅途掠影</h3><div class="grid">' + gallery + "</div></section>" : "",
    '<footer class="foot">由 星见旅行 导出 · ' + esc(new Date().toLocaleDateString("zh-CN")) + "</footer>",
    "</main></body></html>",
  ].join("\n")

  const safeName = String(travel.title || "travel").replace(/[\\/:*?"<>|]/g, "_").slice(0, 40)
  return { html, filename: safeName + "-旅行卡片.html" }
}

/** 在基准日期上加 n 天（DAY 序号对应的日历日期） */
function shiftDate(base: string, n: number): string {
  const d = new Date(String(base).slice(0, 10) + "T00:00:00")
  if (isNaN(d.getTime())) return ""
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 卡片样式：暖陶土配色，与 App 设计语言一致；全部内联、无外部依赖 */
const CARD_CSS = [`
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#F7F3EF;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif;color:#2B2320;padding:24px 16px;-webkit-font-smoothing:antialiased}
  .card{max-width:720px;margin:0 auto;background:#FFFDFB;border-radius:28px;overflow:hidden;box-shadow:0 18px 50px rgba(120,80,60,.16)}
  .hero{position:relative;height:340px;background:linear-gradient(135deg,#E8A87C,#C97B5A)}
  .cover{width:100%;height:100%;object-fit:cover;display:block}
  .cover-fallback{background:linear-gradient(135deg,#E8A87C,#C97B5A)}
  .hero-shade{position:absolute;inset:0;background:linear-gradient(to top,rgba(30,18,12,.78) 0%,rgba(30,18,12,.18) 46%,transparent 72%)}
  .hero-text{position:absolute;left:0;right:0;bottom:0;padding:26px 28px;color:#fff}
  .brand{font-size:12px;letter-spacing:.22em;opacity:.85;margin-bottom:8px}
  .hero-text h1{font-size:30px;line-height:1.25;font-weight:700;text-shadow:0 2px 12px rgba(0,0,0,.28)}
  .meta{margin-top:8px;font-size:14px;opacity:.92}
  .stats{display:flex;gap:8px;padding:20px 24px;border-bottom:1px solid #F0E7DF}
  .stat{flex:1;text-align:center}
  .stat b{display:block;font-size:22px;font-weight:700;color:#B96A4B;font-variant-numeric:tabular-nums}
  .stat span{font-size:12px;color:#9A8578}
  .desc{padding:20px 24px 4px;font-size:15px;line-height:1.75;color:#5A4A40}
  .companions{padding:10px 24px 0;font-size:13px;color:#9A8578}
  .day{padding:20px 24px;border-top:1px solid #F5EEE8}
  .day-head{display:flex;align-items:baseline;gap:10px;font-size:15px;font-weight:600;margin-bottom:12px}
  .day-no{color:#B96A4B;font-variant-numeric:tabular-nums;letter-spacing:.06em}
  .day-date{font-size:12px;font-weight:400;color:#9A8578}
  .items{list-style:none;display:flex;flex-direction:column;gap:9px}
  .item{display:flex;align-items:baseline;gap:10px;font-size:14px;line-height:1.6}
  .time{flex:none;width:44px;font-size:12px;color:#B96A4B;font-variant-numeric:tabular-nums}
  .time-empty{color:#D8CCC2}
  .item-title{color:#2B2320}
  .item-loc{font-size:12px;color:#9A8578}
  .empty{font-size:13px;color:#B8A79B}
  .gallery{padding:20px 24px 4px;border-top:1px solid #F5EEE8}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}
  .grid img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:14px;display:block}
  .foot{padding:22px 24px 28px;font-size:12px;color:#B8A79B;text-align:center}
  @media(max-width:480px){.hero{height:260px}.hero-text h1{font-size:23px}.stats{padding:16px}.stat b{font-size:19px}}
  @media print{body{background:#fff;padding:0}.card{box-shadow:none;border-radius:0}}
`].join("\n")
