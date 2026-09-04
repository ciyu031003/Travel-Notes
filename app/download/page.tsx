'use client'

/**
 * 甜途 App 下载页（门户网站下载入口）。
 * - Android：进入自动开始下载（可手动重下）
 * - 展示版本 / 更新日志 / 安装说明 / 二维码（扫码下载）
 * - 已在 App 内（原生壳）时展示「已安装」状态
 */
import { useEffect, useState } from 'react'
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
import { useApi } from '@/lib/client/use-api'
import { apiUrl } from '@/lib/api-base'
import { isNativePlatform } from '@/lib/modules/offline/platform'
import { APP_DOWNLOAD_URL } from '@/lib/app-version'

interface VersionManifest {
  version: string
  buildNumber: number
  downloadUrl: string
  changelog?: string
}

const INSTALL_STEPS = [
  { title: '下载 APK', desc: '点击上方按钮（或扫码）下载安装包，约 91MB。' },
  { title: '允许安装未知应用', desc: 'Android 会提示「未知来源」：进入设置 → 允许此来源安装应用。' },
  { title: '打开甜途，开始记录', desc: '登录后即可离线记录旅行、照片自动同步到云端。' },
]

export default function DownloadPage() {
  const { data: manifest } = useApi<VersionManifest>(apiUrl('/api/version'), { ttlMs: 60000 })
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const downloadUrl = manifest?.downloadUrl || APP_DOWNLOAD_URL
  const version = manifest?.version || '1.0.0'
  const buildNumber = manifest?.buildNumber ?? 1
  const changelog =
    manifest?.changelog || '移动端正式上线：离线浏览与自动同步、旅行记录、相册、旅行圈。'
  const native = isNativePlatform()

  // 二维码
  useEffect(() => {
    if (!downloadUrl) return
    QRCode.toDataURL(downloadUrl, {
      width: 480,
      margin: 2,
      color: { dark: '#3B3228', light: '#FFFFFF' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null))
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
    <div className="min-h-[100dvh] bg-travel-cream pb-[env(safe-area-inset-bottom)] dark:bg-shell-bg">
      {/* 顶部返回 */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-travel-line/60 bg-travel-cream/85 px-4 py-3 backdrop-blur-lg dark:border-shell-line dark:bg-shell-bg/85">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-travel-ink transition hover:bg-travel-sakura/50 dark:text-shell-text dark:hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </Link>
        <span className="text-sm text-travel-ink/70 dark:text-shell-muted">甜途 · 移动端</span>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-8 md:py-12">
        {/* Hero */}
        <section className="text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-travel-accent to-travel-bloom shadow-lg shadow-travel-accent/25">
            <Smartphone className="h-8 w-8 text-white" />
          </div>
          <h1 className="mt-4 text-3xl font-bold text-travel-inkStrong dark:text-shell-text md:text-4xl">
            甜途 App
          </h1>
          <p className="mt-2 text-sm text-travel-ink/70 dark:text-shell-muted md:text-base">
            把每一次出发与归来，都装进口袋。
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-travel-bloom/40 bg-white/70 px-4 py-1.5 text-sm text-travel-accent dark:border-shell-line dark:bg-shell-surface dark:text-travel-bloom">
            <Package className="h-4 w-4" />
            版本 v{version}
            <span className="text-travel-ink/40 dark:text-shell-muted">build {buildNumber}</span>
          </div>
        </section>

        {native ? (
          /* 已在 App 内 */
          <section className="mt-8 rounded-3xl border border-travel-line bg-white/80 p-6 text-center dark:border-shell-line dark:bg-shell-surface md:p-8">
            <CheckCircle2 className="mx-auto h-10 w-10 text-travel-success" />
            <h2 className="mt-3 text-lg font-semibold text-travel-inkStrong dark:text-shell-text">
              你正在使用甜途 App
            </h2>
            <p className="mt-2 text-sm text-travel-ink/70 dark:text-shell-muted">
              当前版本 v{version}（build {buildNumber}）。新版本会通过 OTA 自动提示更新。
            </p>
          </section>
        ) : (
          <>
            {/* 下载按钮：点击弹出更新与扫码弹窗，避免浏览器右上角直接下载 */}
            <section className="mt-8">
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-travel-accent py-4 text-base font-semibold text-white shadow-lg shadow-travel-accent/25 transition active:scale-[0.98] hover:bg-travel-accentStrong"
              >
                <Download className="h-5 w-5" />
                下载 Android 安装包（{version}）
              </button>
              <button
                type="button"
                onClick={copyLink}
                className="mt-3 w-full rounded-xl border border-travel-line bg-white/60 py-2.5 text-sm text-travel-ink/70 transition hover:bg-white dark:border-shell-line dark:bg-shell-surface/60 dark:text-shell-muted dark:hover:bg-shell-surface"
              >
                {copied ? '已复制链接 ✓' : '复制下载链接'}
              </button>

              {/* iOS 提示 */}
              <p className="mt-4 rounded-2xl border border-travel-sky/40 bg-travel-mist/40 px-4 py-3 text-center text-xs leading-relaxed text-travel-ink/70 dark:border-shell-line dark:bg-shell-surface/60 dark:text-shell-muted">
                <Info className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
                iOS 暂不支持安装 APK，可直接使用网页版
                <Link href="/" className="mx-1 font-medium text-travel-accent underline-offset-2 hover:underline dark:text-travel-bloom">
                  行迹网页版
                </Link>
                ，或后续关注 iOS 版本。
              </p>
            </section>

            {/* 扫码下载 */}
            <section className="mt-8 flex flex-col items-center rounded-3xl border border-travel-line bg-white/80 p-6 dark:border-shell-line dark:bg-shell-surface md:flex-row md:items-center md:gap-8 md:p-8">
              <div className="shrink-0 rounded-2xl bg-white p-3 shadow-inner ring-1 ring-travel-line/60 dark:ring-shell-line">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrDataUrl} alt="甜途 App 下载二维码" width={220} height={220} className="h-44 w-44 md:h-52 md:w-52" />
                ) : (
                  <div className="flex h-44 w-44 items-center justify-center text-sm text-travel-ink/40 md:h-52 md:w-52">
                    二维码生成中…
                  </div>
                )}
              </div>
              <div className="mt-5 text-center md:mt-0 md:text-left">
                <h2 className="text-lg font-semibold text-travel-inkStrong dark:text-shell-text">扫码下载</h2>
                <p className="mt-2 text-sm leading-relaxed text-travel-ink/70 dark:text-shell-muted">
                  用手机浏览器扫码即可下载安装包；
                  <br className="hidden md:block" />
                  电脑上打开本页，手机扫码最方便。
                </p>
              </div>
            </section>

            {/* 更新日志 */}
            <section className="mt-8 rounded-3xl border border-travel-line bg-white/80 p-6 dark:border-shell-line dark:bg-shell-surface md:p-8">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-travel-inkStrong dark:text-shell-text">
                <Package className="h-5 w-5 text-travel-accent dark:text-travel-bloom" />
                更新日志 · v{version}
              </h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-travel-ink/80 dark:text-shell-muted">
                {changelog}
              </p>
            </section>
          </>
        )}

        {/* 下载弹窗：更新说明 + 扫码下载 */}
        {!native && modalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-travel-ink/40 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={() => setModalOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="下载甜途 App"
          >
            <div
              className="m-enter w-full max-w-md rounded-t-3xl bg-travel-cream p-6 shadow-2xl dark:bg-shell-surface sm:rounded-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-travel-inkStrong dark:text-shell-text">
                  下载甜途 App
                </h3>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  aria-label="关闭"
                  className="rounded-full p-2 text-travel-ink/50 transition hover:bg-travel-sakura dark:text-shell-muted dark:hover:bg-white/10"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-1 flex items-center gap-2 text-sm text-travel-accent dark:text-travel-bloom">
                <Package className="h-4 w-4" />
                版本 v{version} · build {buildNumber}
              </div>

              <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
                <div className="rounded-2xl bg-white p-3 shadow-inner ring-1 ring-travel-line/60 dark:ring-shell-line">
                  {qrDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrDataUrl} alt="扫码下载甜途 App" width={184} height={184} className="h-44 w-44" />
                  ) : (
                    <div className="flex h-44 w-44 items-center justify-center text-sm text-travel-ink/40">
                      二维码生成中…
                    </div>
                  )}
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-sm font-medium text-travel-inkStrong dark:text-shell-text">
                    手机扫码下载
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-travel-ink/60 dark:text-shell-muted">
                    用手机浏览器扫码，直达最新安装包。
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-travel-line bg-white/70 p-4 dark:border-shell-line dark:bg-shell-surface/70">
                <p className="text-xs font-medium text-travel-inkStrong dark:text-shell-text">本次更新</p>
                <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-travel-ink/70 dark:text-shell-muted">
                  {changelog}
                </p>
              </div>

              <button
                type="button"
                onClick={startDownload}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-travel-accent py-3.5 text-base font-semibold text-white shadow-lg shadow-travel-accent/25 transition active:scale-[0.98] hover:bg-travel-accentStrong"
              >
                <Download className="h-5 w-5" />
                立即下载 APK
              </button>
              <p className="mt-2 text-center text-xs text-travel-ink/40 dark:text-shell-faint">
                约 91MB · 下载后请允许安装未知来源应用
              </p>
            </div>
          </div>
        )}

        {/* 安装说明 */}
        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-travel-inkStrong dark:text-shell-text">
            <ShieldCheck className="h-5 w-5 text-travel-accent dark:text-travel-bloom" />
            安装说明
          </h2>
          <ol className="mt-4 space-y-3">
            {INSTALL_STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3 rounded-2xl border border-travel-line bg-white/70 p-4 dark:border-shell-line dark:bg-shell-surface/70">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-travel-sakura text-sm font-bold text-travel-accentStrong dark:bg-white/10 dark:text-travel-bloom">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-medium text-travel-inkStrong dark:text-shell-text">{s.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-travel-ink/70 dark:text-shell-muted">{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-center text-xs text-travel-ink/40 dark:text-shell-faint">
            官网直连下载 · 支持断点续传 · 数据自动加密同步
          </p>
        </section>
      </main>
    </div>
  )
}
