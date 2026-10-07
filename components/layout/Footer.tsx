import Link from 'next/link'
import { Heart, MapPin, Smartphone } from 'lucide-react'
import { Icon } from '@/components/mobile/Icon'
import IcpLicense from '@/components/IcpLicense'

export default function Footer() {
  return (
    <footer className="border-t border-travel-line/60 dark:border-shell-line bg-white dark:bg-shell-bg">
      <div className="container-custom py-8">
        <div className="grid md:grid-cols-3 gap-8">
          <div>
            <h3 className="font-bold text-lg mb-4 text-travel-inkStrong flex items-center gap-2">
              <Icon icon={MapPin} size="md" className="text-travel-accent" />
              行迹
            </h3>
            <p className="text-travel-ink text-sm">
              记录每一次出发与归来，沉淀属于你的旅行记忆。<br />
              一个收藏旅途与故事的数字旅行空间。
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-4">快速导航</h4>
            <ul className="space-y-2 text-sm text-travel-ink">
              <li><Link href="/" className="hover:text-travel-accentStrong transition-colors">首页</Link></li>
              <li><Link href="/travel" className="hover:text-travel-accentStrong transition-colors">旅行记录</Link></li>
              <li><Link href="/timeline" className="hover:text-travel-accentStrong transition-colors">时间线</Link></li>
              <li><Link href="/moments" className="hover:text-travel-accentStrong transition-colors">碎碎念</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">获取应用</h4>
            <div className="flex gap-4">
              {/* 甜途 App 下载页；此前的 mailto:your@email.com / github.com 是脚手架占位死链，已移除 */}
              <Link
                href="/download"
                aria-label="下载甜途 App"
                className="p-2 rounded-lg bg-travel-sakura/30 hover:bg-travel-sakura/60 transition-colors"
              >
                <Icon icon={Smartphone} size="md" className="text-travel-ink" />
              </Link>
            </div>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-travel-line/60 dark:border-shell-line text-center text-sm text-travel-ink/60 dark:text-shell-muted">
          <p className="flex items-center justify-center gap-1">
            Made with <Icon icon={Heart} size="sm" className="text-travel-accent fill-travel-accent" /> by 行迹
          </p>
          <p className="mt-1">© {new Date().getFullYear()} All rights reserved.</p>
          {/* 备案号：移动互联网应用程序备案要求站点/应用内显著位置展示，编号可跳转工信部备案系统查询 */}
          <IcpLicense className="mt-2 text-[11px]" numberClassName="hover:text-travel-accentStrong" />
        </div>
      </div>
    </footer>
  )
}
