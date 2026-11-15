'use client'

/**
 * 甜途 App 下载页（门户网站下载入口）。
 * - Android：进入自动开始下载（可手动重下）
 * - 展示版本 / 更新日志 / 安装说明 / 二维码（扫码下载）
 * - 已在 App 内（原生壳）时展示「已安装」状态
 */
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import QRCode from 'qrcode'
import {
  Download,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  ArrowLeft,
  Package,
  Info,
  X,
} from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import { Button } from '@/components/mobile/Button'
import { useApi } from '@/lib/client/use-api'
import { apiUrl } from '@/lib/api-base'
import { isNativePlatform } from '@/lib/modules/offline/platform'
import { APP_DOWNLOAD_URL } from '@/lib/app-version'
import IcpLicense from '@/components/IcpLicense'
import { useModalLayer } from '@/hooks/use-modal-layer'

interface VersionManifest {
  version: string
  buildNumber: number
  downloadUrl: string
  changelog?: string
}

/** 安装步骤。体积由运行时探测，故在组件内组装 desc（见 sizeText）。 */
const INSTALL_STEPS = [
  { title: '下载 APK', desc: '点击上方按钮（或扫码）下载安装包' },
  { title: '允许安装未知应用', desc: 'Android 会提示「未知来源」：进入设置 → 允许此来源安装应用。' },
  { title: '打开甜途，开始记录', desc: '登录后即可离线记录旅行、照片自动同步到云端。' },
]

export default function DownloadPage() {
  const { data: manifest } = useApi<VersionManifest>(apiUrl('/api/version'), { ttlMs: 60000 })
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  /** APK 实际体积（MB 整数）。原先页面写死「约 91MB」，实际包已降到 ~25MB，
      写死值会随每次发版失真；改为 HEAD 请求同源 APK 取 content-length。 */
  const [apkSizeMb, setApkSizeMb] = useState<number | null>(null)

  // P2-B2：统一弹层基座（焦点圈定/恢复、背景 inert、滚动锁、ESC/返回键）
  const panelRef = useRef<HTMLDivElement>(null)
  useModalLayer({
    open: modalOpen,
    onClose: () => setModalOpen(false),
    panelRef,
  })

  const downloadUrl = manifest?.downloadUrl || APP_DOWNLOAD_URL
  const version = manifest?.version || '1.0.0'
  const buildNumber = manifest?.buildNumber ?? 1
  const changelog =
    manifest?.changelog || '移动端正式上线：离线浏览与自动同步、旅行记录、相册、旅行圈。'
  const native = isNativePlatform()
  // 探测失败时回退到保守文案（不显示具体数字以外的错误信息）
  const sizeText = apkSizeMb ? `约 ${apkSizeMb}MB` : '约 25MB'

  // 二维码
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
        if (!cancelled && Number.isFinite(len) && len > 0) {
          setApkSizeMb(Math.round(len / 1048576))
        }
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

  const startDownload = () => {
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = 'tiantu.apk'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setModalOpen(false)
  }

return (
    <div className="m2-screen min-h-dvh pb-[env(safe-area-inset-bottom)]">
      <header className="m2-gutter sticky top-0 z-30 flex items-center justify-between border-b border-[var(--m-line)] bg-[color-mix(in_srgb,var(--m-bg)_88%,transparent)] pb-2 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur-xl">
        <Link
          href="/"
          aria-label="返回首页"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--m-line)] bg-[var(--m-surface-solid)] text-[var(--m-text)] shadow-[var(--m-shadow-l1)] transition active:scale-95"
        >
          <Icon icon={ArrowLeft} size="md" />
        </Link>
        <div className="text-center">
          <p className="m2-eyebrow">GET THE APP</p>
          <p className="text-[15px] font-bold tracking-[-0.01em] text-[var(--m-text)]">甜途 App</p>
        </div>
        <span className="h-11 w-11" aria-hidden="true" />
      </header>

      <main className="mx-auto w-full max-w-[430px] px-[18px] pb-10">
        {/* Hero：用柔光圆环和糖果色块替代旧的棕色单色图标 */}
        <section className="pt-7 text-center">
          <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
            <span className="absolute inset-0 rotate-6 rounded-[30px] bg-[var(--m-tone-peach-bg)]" aria-hidden="true" />
            <span className="absolute inset-1 -rotate-6 rounded-[26px] bg-[var(--m-tone-lavender-bg)]" aria-hidden="true" />
            <span className="relative flex h-20 w-20 items-center justify-center rounded-[24px] bg-[var(--m-grad-cta)] text-white shadow-[0_18px_36px_-16px_rgba(184,63,99,0.7)]">
              <Icon icon={Smartphone} size="lg" />
            </span>
            <span className="absolute -right-1 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--m-tone-honey-bg)] text-[var(--m-tone-honey-fg)] shadow-sm">
              <Icon icon={Download} size="sm" />
            </span>
          </div>
          <h1 className="m2-page-title mt-5 text-center">把旅行装进口袋</h1>
          <p className="m2-page-sub mx-auto mt-1.5 max-w-[300px]">
            把每一次出发与归来，都收进甜途。离线也能记，联网自动同步。
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--m-line)] bg-[var(--m-surface-solid)] px-4 py-2 text-[12px] font-semibold text-[var(--m-muted)] shadow-[var(--m-shadow-l1)]">
            <Icon icon={Package} size="sm" className="text-[var(--m-accent-strong)]" />
            版本 v{version}
            <span className="text-[var(--m-faint)]">build {buildNumber}</span>
          </div>
        </section>

        {native ? (
          <section className="m2-card mt-6 p-5 text-center">
            <span className="m2-icon-box m2-tone-mint mx-auto h-14 w-14">
              <Icon icon={CheckCircle2} size="lg" />
            </span>
            <h2 className="mt-3 text-[18px] font-bold text-[var(--m-text)]">你正在使用甜途 App</h2>
            <p className="mt-1.5 text-[13px] leading-5 text-[var(--m-muted)]">
              当前版本 v{version}（build {buildNumber}）。新版本会通过 OTA 自动提示更新。
            </p>
          </section>
        ) : (
          <>
            <section className="m2-card mt-6 p-5">
              <div className="flex items-start gap-3">
                <span className="m2-icon-box m2-tone-mint h-12 w-12 shrink-0">
                  <Icon icon={ShieldCheck} size="md" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold text-[var(--m-text)]">安全下载 · 官方直连</p>
                  <p className="mt-1 text-[12px] leading-5 text-[var(--m-muted)]">
                    Android APK · {sizeText} · 支持断点续传
                  </p>
                </div>
              </div>

              <Button type="button" block size="lg" icon={Download} className="mt-5" onClick={() => setModalOpen(true)}>
                下载 Android 安装包（{version}）
              </Button>
              <Button type="button" block variant="secondary" className="mt-2.5" onClick={copyLink}>
                {copied ? '已复制下载链接' : '复制下载链接'}
              </Button>

              <div className="mt-4 flex items-start gap-2.5 rounded-[12px] bg-[var(--m-tone-sky-bg)] px-3.5 py-3 text-[12px] leading-5 text-[var(--m-tone-sky-fg)]">
                <Icon icon={Info} size="sm" className="mt-0.5 shrink-0" />
                <p>
                  iOS 暂不支持安装 APK，可直接使用
                  <Link href="/" className="mx-1 font-bold underline decoration-current/30 underline-offset-2">
                    甜途网页版
                  </Link>
                  ，或后续关注 iOS 版本。
                </p>
              </div>
            </section>

            {/* 扫码下载 */}
            <section className="m2-card mt-4 p-5">
              <div className="m2-section-head">
                <h2 className="m2-section-title">扫码下载</h2>
                <span className="m2-pill m2-pill-pink">手机更方便</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="shrink-0 rounded-[16px] border border-[var(--m-line)] bg-white p-2.5 shadow-[var(--m-shadow-l1)]">
                  {qrDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qrDataUrl}
                      alt="甜途 App 下载二维码"
                      width={128}
                      height={128}
                      loading="lazy"
                      decoding="async"
                      className="h-32 w-32"
                    />
                  ) : (
                    <div className="flex h-32 w-32 items-center justify-center text-center text-[12px] text-[var(--m-faint)]">
                      二维码生成中…
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold text-[var(--m-text)]">用手机浏览器扫一扫</p>
                  <p className="mt-1.5 text-[12px] leading-5 text-[var(--m-muted)]">
                    直达最新安装包。电脑上打开本页，手机扫码最方便。
                  </p>
                </div>
              </div>
            </section>

            {/* 更新日志 */}
            <section className="m2-card mt-4 p-5">
              <div className="flex items-center gap-2">
                <span className="m2-icon-box m2-tone-honey h-9 w-9">
                  <Icon icon={Package} size="sm" />
                </span>
                <h2 className="m2-section-title">本次更新 · v{version}</h2>
              </div>
              <p className="mt-3 whitespace-pre-line text-[13px] leading-6 text-[var(--m-muted)]">{changelog}</p>
            </section>
          </>
        )}

        {/* 安装说明 */}
        <section className="mt-6">
          <div className="m2-section-head">
            <h2 className="m2-section-title">安装说明</h2>
            <span className="text-[11px] text-[var(--m-faint)]">3 步完成</span>
          </div>
          <ol className="m2-list-group">
            {INSTALL_STEPS.map((step, i) => (
              <li key={step.title} className="m2-list-row items-start">
                <span className="m2-list-icon mt-0.5">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold text-[var(--m-text)]">{step.title}</span>
                  <span className="mt-1 block text-[12px] leading-5 text-[var(--m-muted)]">
                    {i === 0 ? `${step.desc}，${sizeText}。` : step.desc}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-center text-[11px] leading-5 text-[var(--m-faint)]">
            官网直连下载 · 支持断点续传 · 数据自动加密同步
          </p>
        </section>

        <section className="mt-7 text-center">
          <IcpLicense
            className="text-[11px] text-[var(--m-faint)]"
            numberClassName="hover:text-[var(--m-accent-strong)]"
            linkClassName="hover:text-[var(--m-accent-strong)]"
          />
        </section>
      </main>

      {/* 下载弹窗：保留原有 useModalLayer 的焦点圈定 / ESC / 返回键处理 */}
      {!native && modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(58,20,36,0.42)] backdrop-blur-[3px]"
          onClick={() => setModalOpen(false)}
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="下载甜途 App"
        >
          <div
            className="m-enter max-h-[90dvh] w-full max-w-[430px] overflow-y-auto rounded-t-[26px] bg-[var(--m-surface-solid)] p-5 pb-[max(24px,env(safe-area-inset-bottom))] shadow-[0_-20px_60px_-20px_rgba(58,20,36,0.4)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-[var(--m-line-strong)]" aria-hidden="true" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="m2-eyebrow">READY TO GO</p>
                <h3 className="mt-1 text-[20px] font-bold tracking-[-0.02em] text-[var(--m-text)]">下载甜途 App</h3>
                <p className="mt-1 flex items-center gap-1.5 text-[12px] text-[var(--m-muted)]">
                  <Icon icon={Package} size="sm" />
                  v{version} · build {buildNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="关闭"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--m-surface-2)] text-[var(--m-muted)] transition active:scale-95"
              >
                <Icon icon={X} size="md" />
              </button>
            </div>

            <div className="mt-5 flex items-center gap-4 rounded-[16px] bg-[var(--m-surface-2)] p-4">
              <div className="shrink-0 rounded-[12px] bg-white p-2 ring-1 ring-[var(--m-line)]">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrDataUrl} alt="扫码下载甜途 App" width={128} height={128} loading="lazy" decoding="async" className="h-32 w-32" />
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center text-center text-[12px] text-[var(--m-faint)]">二维码生成中…</div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-[var(--m-text)]">手机扫码下载</p>
                <p className="mt-1 text-[12px] leading-5 text-[var(--m-muted)]">
                  {sizeText} · 用手机浏览器扫码，直达最新安装包。
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-[14px] border border-[var(--m-line)] p-4">
              <p className="text-[12px] font-bold text-[var(--m-text)]">本次更新</p>
              <p className="mt-1.5 whitespace-pre-line text-[12px] leading-5 text-[var(--m-muted)]">{changelog}</p>
            </div>

            <Button type="button" block size="lg" icon={Download} className="mt-5" onClick={startDownload}>
              立即下载 APK
            </Button>
            <p className="mt-2 text-center text-[11px] text-[var(--m-faint)]">
              {sizeText} · 下载后请允许安装未知来源应用
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
