'use client'

/**
 * 甜途 App 下载页（/download）· 2026-11-25 改版
 * ---------------------------------------------------------------------------
 * 目标：把「一个居中的手机卡片」做成真正的产品下载页 —— 桌面端有视觉主体
 * （旅途照片 + 设备 mock + 二维码），移动端仍是 App 式的单手可达结构。
 *
 * 行为约定（与改版前一致，避免破坏 OTA 链路）：
 *  · 版本号 / 下载地址 / 更新文案来自 /api/version，失败回落到 lib/app-version 常量；
 *  · APK 体积用 HEAD content-length 实测，探测失败回退「约 15MB」；
 *  · 二维码在客户端用 qrcode 生成，内容就是当前 downloadUrl；
 *  · 原生壳（Capacitor）内访问时展示「你正在使用甜途 App」，不再重复下载。
 * 视觉全部走 --m-* 语义令牌，暗色模式跟随；复杂图形在 download.module.css。
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import QRCode from 'qrcode'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Download,
  Images,
  MapPin,
  Package,
  ShieldCheck,
  Smartphone,
  Users,
  Wifi,
} from 'lucide-react'
import { useApi } from '@/lib/client/use-api'
import { apiUrl } from '@/lib/api-base'
import { isNativePlatform } from '@/lib/modules/offline/platform'
import { APP_DOWNLOAD_URL } from '@/lib/app-version'
import IcpLicense from '@/components/IcpLicense'
import { cn } from '@/lib/utils'
import s from './download.module.css'

interface VersionManifest {
  version: string
  buildNumber: number
  downloadUrl: string
  changelog?: string
}

/** 安装步骤。体积由运行时探测，故 desc 里的体积在渲染时拼接（见 sizeText）。 */
const INSTALL_STEPS = [
  { title: '下载安装包', desc: '点上方按钮（或扫码）把 APK 存到手机' },
  { title: '允许「未知来源」安装', desc: 'Android 会提示来源未知：在弹窗里进入设置，允许浏览器安装应用，再返回继续。' },
  { title: '登录，开始记录', desc: '用网页版同一个账号登录，旅行记录与相册会自动同步。' },
]

const FAQ = [
  {
    q: 'iOS 能用吗？',
    a: '目前只提供 Android 安装包。iPhone 与 iPad 可以直接使用网页版，功能与 App 一致；iOS 版本还在准备中。',
  },
  {
    q: '安装时提示「未知来源应用」怎么办？',
    a: '这是 Android 对非应用商店安装包的默认限制，不是报错。在提示里点「设置」，打开浏览器（或文件管理器）的「允许安装未知应用」开关，再回到安装界面点「安装」即可。',
  },
  {
    q: '下载中断、安装包损坏怎么办？',
    a: '服务器支持断点续传，重新点下载通常会接着上次的进度。若提示「解析包时出现问题」，删除已下载文件后重新下载即可。',
  },
  {
    q: '手机和网页版是同一份数据吗？',
    a: '是。两端登录同一个账号，旅行记录、相册、足迹地图与旅行圈共用一份数据；App 离线记录的内容会在联网后自动同步。',
  },
  {
    q: '怎么更新到新版本？',
    a: '已安装的 App 会在有新版本时提示，按提示下载安装即可覆盖，数据不受影响；也可以回到本页下载最新安装包手动覆盖。',
  },
]

export default function DownloadPage() {
  const { data: manifest } = useApi<VersionManifest>(apiUrl('/api/version'), { ttlMs: 60000 })
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [apkSizeMb, setApkSizeMb] = useState<number | null>(null)
  const [platform, setPlatform] = useState<'android' | 'ios' | 'other'>('other')

  const downloadUrl = manifest?.downloadUrl || APP_DOWNLOAD_URL
  const version = manifest?.version || '1.0.0'
  const buildNumber = manifest?.buildNumber ?? 1
  const changelog =
    manifest?.changelog || '移动端正式上线：离线浏览与自动同步、旅行记录、相册、旅行圈。'
  const native = isNativePlatform()
  const sizeText = apkSizeMb ? '约 ' + apkSizeMb + ' MB' : '约 15 MB'

  /** 运行时判断系统：只在客户端赋值，避免 SSR / 水合不一致。 */
  useEffect(() => {
    const ua = navigator.userAgent || ''
    if (/android/i.test(ua)) setPlatform('android')
    else if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
      setPlatform('ios')
    else setPlatform('other')
  }, [])

  // 二维码：颜色跟随品牌深珊瑚，保证在白色卡面上对比足够
  useEffect(() => {
    if (!downloadUrl) return
    QRCode.toDataURL(downloadUrl, {
      width: 480,
      margin: 2,
      color: { dark: '#4A2B38', light: '#FFFFFF' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null))
  }, [downloadUrl])

  // 探测 APK 体积（同源 HEAD；失败静默保留回退文案）
  useEffect(() => {
    if (!downloadUrl) return
    let cancelled = false
    fetch(downloadUrl, { method: 'HEAD' })
      .then((r) => {
        const len = Number(r.headers.get('content-length'))
        if (!cancelled && Number.isFinite(len) && len > 0) setApkSizeMb(Math.round(len / 1048576))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [downloadUrl])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(downloadUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('复制下载链接', downloadUrl)
    }
  }

  /** 首屏主按钮文案：Android 上强调「直接安装」，其余平台强调「下载 APK」。 */
  const primaryLabel = useMemo(() => {
    if (platform === 'android') return '在手机上安装 · ' + sizeText
    if (platform === 'ios') return '下载 Android 安装包 · ' + version
    return '下载 Android 版 · ' + version
  }, [platform, sizeText, version])

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={cn(s.shell, 'flex items-center justify-between gap-3')}>
          <div className={s.headerLeft}>
            <Link href="/" aria-label="返回甜途首页" className={s.backBtn}>
              <ArrowLeft size={18} strokeWidth={2} />
            </Link>
            <span className={s.brand}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/logo-96.png" alt="" width={30} height={30} />
              甜途
              <small>TianTu</small>
            </span>
          </div>
          <div className={s.headerRight}>
            <Link href="/" className={s.headerLink}>
              <span className={s.headerLinkText}>打开网页版</span>
              <ArrowRight size={15} strokeWidth={2.2} />
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ================= Hero ================= */}
        <section className={cn(s.shell, s.hero)} aria-labelledby="dl-title">
          <div className={s.heroCopy}>
            <span className={s.eyebrow}>
              <i aria-hidden="true" />
              甜途 App · Android 客户端
            </span>

            <h1 className={s.title} id="dl-title">
              把走过的路，
              <br />
              <em>装进口袋</em>。
            </h1>

            <p className={s.lead}>
              旅行记录、相册、足迹地图与旅行圈——手机上随手记，回到电脑前继续整理。
              离线也能记，联网自动同步。
            </p>

            {native ? (
              <div className={cn(s.nativeCard, 'mt-6 w-full max-w-[520px]')}>
                <span className={s.nativeIcon}>
                  <Check size={19} strokeWidth={2.4} />
                </span>
                <div>
                  <strong>你正在使用甜途 App</strong>
                  <p>当前版本 v{version}（build {buildNumber}）。</p>
                </div>
              </div>
            ) : (
              <>
                <div className={s.actions}>
                  <a
                    href={downloadUrl}
                    download="tiantu.apk"
                    rel="noopener"
                    className={s.btnPrimary}
                    data-download-primary
                  >
                    <Download size={18} strokeWidth={2.2} />
                    <span>{primaryLabel}</span>
                  </a>
                  <button type="button" onClick={copyLink} className={s.btnGhost}>
                    {copied ? <Check size={16} strokeWidth={2.4} /> : <Copy size={16} strokeWidth={2} />}
                    {copied ? '已复制链接' : '复制链接'}
                  </button>
                  <Link href="/" className={s.btnText}>
                    先用网页版
                    <ArrowRight size={15} strokeWidth={2.2} />
                  </Link>
                </div>

                <div className={s.meta}>
                  <span>
                    版本 <b>v{version}</b>
                  </span>
                  <span>
                    构建 <b>{buildNumber}</b>
                  </span>
                  <span>
                    安装包 <b>{sizeText}</b>
                  </span>
                  <span>{platform === 'android' ? '可直接安装' : 'Android 8.0+'}</span>
                </div>

                <div className={s.checks}>
                  <span>
                    <Check size={13} strokeWidth={3} /> 官网直连
                  </span>
                  <span>
                    <Check size={13} strokeWidth={3} /> 断点续传
                  </span>
                  <span>
                    <Check size={13} strokeWidth={3} /> 无广告 · 无内购
                  </span>
                  <span>
                    <Check size={13} strokeWidth={3} /> 登录即同步
                  </span>
                </div>

                {platform === 'ios' && (
                  <p className="mt-3 w-full text-center text-[12px] leading-relaxed text-[var(--m-muted)]">
                    检测到 iOS 设备：甜途 App 暂只支持 Android，可先用网页版，或扫码在安卓手机上安装。
                  </p>
                )}
              </>
            )}
          </div>

          {/* 视觉舞台：旅途照片 + 设备 mock + 扫码卡 */}
          <div className={s.stage} aria-hidden="true">
            <div className={s.photo}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/web-hero.jpg" alt="" width={900} height={598} loading="eager" decoding="async" />
              <span className={s.photoScrim} />
            </div>

            <div className={s.phone}>
              <div className={s.phoneScreen}>
                <span className={s.phoneIsland} />
                <div className={s.app}>
                  <div className={s.appHead}>
                    <div>
                      <p className={s.appDate}>周日 · 11月 22日</p>
                      <p className={s.appHi}>下午好，去看看世界</p>
                    </div>
                    <span className={s.appAva} />
                  </div>

                  <div className={s.trip}>
                    <div className={s.tripCopy}>
                      <b>重庆 · 3 天 2 晚</b>
                      <span>洪崖洞 · 磁器口 · 山城步道</span>
                    </div>
                  </div>

                  <div className={s.miniCard}>
                    <div className={s.miniHead}>
                      <span className={s.miniTitle}>我的相册</span>
                      <span className={s.miniCount}>128 张</span>
                    </div>
                    <div className={s.album}>
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>

                  <div className={s.miniCard}>
                    <div className={s.miniHead}>
                      <span className={s.miniTitle}>足迹地图</span>
                      <span className={s.miniCount}>7 座城市</span>
                    </div>
                    <div className={s.mapStrip}>
                      <span />
                      <i />
                      <span />
                      <i />
                      <span />
                    </div>
                  </div>
                </div>
                <div className={s.phoneTabs}>
                  <span className={s.on}>
                    <i />首页
                  </span>
                  <span>
                    <i />旅行
                  </span>
                  <span>
                    <i />相册
                  </span>
                  <span>
                    <i />我的
                  </span>
                </div>
              </div>
            </div>

            <div className={s.qrCard}>
              <div className={cn(s.qrFrame, !qrDataUrl && s.waiting)}>
                {qrDataUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={qrDataUrl} alt="扫码下载甜途 App" width={320} height={320} />
                ) : (
                  '二维码生成中…'
                )}
                <span className={s.scan} />
              </div>
              <p className={s.qrCap}>
                <b>扫码下载</b>
                Android 安装包
              </p>
            </div>

            <span className={s.floatChip}>
              <i />
              v{version} · build {buildNumber}
            </span>
          </div>
        </section>

        {/* ================= 信任条 ================= */}
        <section className={s.trust} aria-label="下载保障">
          <div className={cn(s.shell, s.trustGrid)}>
            <div className={s.trustItem}>
              <ShieldCheck size={18} strokeWidth={1.8} />
              <div>
                <b>官网直连</b>
                <span>不经过第三方应用商店</span>
              </div>
            </div>
            <div className={s.trustItem}>
              <Wifi size={18} strokeWidth={1.8} />
              <div>
                <b>断点续传</b>
                <span>弱网中断后可继续下载</span>
              </div>
            </div>
            <div className={s.trustItem}>
              <Smartphone size={18} strokeWidth={1.8} />
              <div>
                <b>离线可用</b>
                <span>没有网络也能先记下来</span>
              </div>
            </div>
            <div className={s.trustItem}>
              <Package size={18} strokeWidth={1.8} />
              <div>
                <b>自动同步</b>
                <span>联网后与网页版一致</span>
              </div>
            </div>
          </div>
        </section>

        {/* ================= 能力 ================= */}
        <section className={cn(s.shell, s.section)} aria-labelledby="dl-feat">
          <div className={s.sectionHead}>
            <span className={s.kicker}>为什么装进口袋</span>
            <h2 className={s.h2} id="dl-feat">
              旅途中的灵感，<em>不用等到回家再写</em>。
            </h2>
            <p className={s.lead2}>
              甜途把「记录」这件事放到离你最近的地方：今天走过哪条街、哪顿饭最好吃、哪张照片最想留住，抬手就能记下。
            </p>
          </div>

          <div className={s.cards}>
            <article className={s.card}>
              <span className={s.cardIcon}>
                <MapPin size={19} strokeWidth={1.9} />
              </span>
              <h3>足迹地图</h3>
              <p>点亮去过的城市，行程与花费自动归档；地图上的每一个点，都是一次真实的出发。</p>
              <div className={s.cardViz}>
                <div className={s.chipsRow}>
                  <span>7 座城市</span>
                  <span>32 段旅程</span>
                  <span>1,208 张照片</span>
                </div>
              </div>
            </article>

            <article className={s.card}>
              <span className={s.cardIcon}>
                <Images size={19} strokeWidth={1.9} />
              </span>
              <h3>相册 · 离线也能存</h3>
              <p>照片自动同步到云端，没网时先存在手机；相册按旅程与城市自动整理成画册。</p>
              <div className={s.cardViz}>
                <div className={s.bars} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            </article>

            <article className={cn(s.card, s.cardSm)}>
              <span className={s.cardIcon}>
                <Users size={19} strokeWidth={1.9} />
              </span>
              <h3>旅行圈</h3>
              <p>同行的人一起写，回忆不再是单向的。</p>
            </article>

            <article className={cn(s.card, s.cardSm)}>
              <span className={s.cardIcon}>
                <Package size={19} strokeWidth={1.9} />
              </span>
              <h3>票据夹</h3>
              <p>机票、高铁票与账单，收进同一本册子。</p>
            </article>

            <article className={cn(s.card, s.cardSm)}>
              <span className={s.cardIcon}>
                <ShieldCheck size={19} strokeWidth={1.9} />
              </span>
              <h3>只属于你</h3>
              <p>私人空间默认仅自己可见，分享由你决定。</p>
            </article>
          </div>
        </section>

        {/* ================= 安装 ================= */}
        <section className={cn(s.shell, s.section)} aria-labelledby="dl-install">
          <div className={s.sectionHead}>
            <span className={s.kicker}>安装 · 3 步</span>
            <h2 className={s.h2} id="dl-install">
              装好大概需要<em>一分钟</em>。
            </h2>
          </div>

          <div className={s.installGrid}>
            <ol className={s.steps}>
              {INSTALL_STEPS.map((step, i) => (
                <li key={step.title} className={s.step}>
                  <span className={s.stepNum} aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>
                      {i === 0
                        ? step.desc + '，文件' + sizeText + '。'
                        : step.desc}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <aside className={s.qrPanel}>
              <div className={s.qrPanelHead}>
                <h3>下载信息</h3>
                <span>{platform === 'android' ? '可直接安装' : 'Android 8.0+'}</span>
              </div>
              <dl className={s.specList}>
                <div className={s.specRow}>
                  <dt>版本</dt>
                  <dd>
                    v{version} · build {buildNumber}
                  </dd>
                </div>
                <div className={s.specRow}>
                  <dt>安装包</dt>
                  <dd>{sizeText}</dd>
                </div>
                <div className={s.specRow}>
                  <dt>来源</dt>
                  <dd>travel-notes.yuanabd.cn</dd>
                </div>
              </dl>
              <p>扫码或在手机上打开本页，直接下载安装包。</p>
              <button type="button" className={s.qrCopyBtn} onClick={copyLink}>
                {copied ? <Check size={15} strokeWidth={2.4} /> : <Copy size={15} strokeWidth={2} />}
                {copied ? '已复制下载链接' : '复制下载链接'}
              </button>
            </aside>
          </div>
        </section>

        {/* ================= 更新日志 ================= */}
        <section className={cn(s.shell, s.section)} aria-labelledby="dl-release">
          <div className={s.sectionHead}>
            <span className={s.kicker}>发布记录</span>
            <h2 className={s.h2} id="dl-release">
              这一版，<em>把旅途装订得更顺手</em>。
            </h2>
          </div>

          <div className={s.releaseGrid}>
            <article className={s.releaseCard}>
              <div className={s.releaseHead}>
                <span className={s.releaseVer}>v{version}</span>
                <span className={s.releaseDate}>build {buildNumber} · Android</span>
              </div>
              <p className={s.releaseText}>{changelog}</p>
            </article>

            <aside className={s.specCard}>
              <h3>安装包信息</h3>
              <dl>
                <div className={s.specRow}>
                  <dt>文件</dt>
                  <dd>tiantu.apk</dd>
                </div>
                <div className={s.specRow}>
                  <dt>体积</dt>
                  <dd>{sizeText}</dd>
                </div>
                <div className={s.specRow}>
                  <dt>下载</dt>
                  <dd>官网直连 · 支持断点续传</dd>
                </div>
              </dl>
            </aside>
          </div>
        </section>

        {/* ================= FAQ ================= */}
        <section className={cn(s.shell, s.section)} aria-labelledby="dl-faq">
          <div className={s.sectionHead}>
            <span className={s.kicker}>常见问题</span>
            <h2 className={s.h2} id="dl-faq">
              装之前，你可能想知道。
            </h2>
          </div>

          <div className={s.faq}>
            {FAQ.map((item) => (
              <details key={item.q} className={s.faqItem}>
                <summary>{item.q}</summary>
                <div className={s.faqBody}>
                  {item.q === 'iOS 能用吗？' ? (
                    <>
                      目前只提供 Android 安装包。iPhone 与 iPad 可以直接使用
                      <Link href="/" className="mx-1 font-bold underline decoration-current/30 underline-offset-2">
                        甜途网页版
                      </Link>
                      ，功能与 App 一致；iOS 版本还在准备中。
                    </>
                  ) : (
                    item.a
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className={s.footer}>
        <div className={s.shell}>
          <div className={s.footerLinks}>
            <Link href="/">甜途首页</Link>
            <span>·</span>
            <Link href="/download">下载页</Link>
            <span>·</span>
            <a href="https://www.yuanabd.cn/" target="_blank" rel="noopener noreferrer">
              YUAN.ABD 工作室
            </a>
            <span>·</span>
            <a href="https://learn.yuanabd.cn/" target="_blank" rel="noopener noreferrer">
              苦旅
            </a>
          </div>
          <IcpLicense
            className={s.footerIcp}
            numberClassName="hover:text-[var(--m-accent-strong)]"
            linkClassName="hover:text-[var(--m-accent-strong)]"
          />
        </div>
      </footer>

      {/* 移动端固定下载条：滚动到任何位置都能一键下载 */}
      {!native && (
        <div className={s.stickyBar}>
          <a href={downloadUrl} download="tiantu.apk" rel="noopener" className={s.btnPrimary}>
            <Download size={17} strokeWidth={2.2} />
            下载 Android 版 · {version}
          </a>
          <button type="button" onClick={copyLink} className={s.btnGhost} aria-label="复制下载链接">
            {copied ? <Check size={17} strokeWidth={2.4} /> : <Copy size={17} strokeWidth={2} />}
          </button>
        </div>
      )}
    </div>
  )
}
