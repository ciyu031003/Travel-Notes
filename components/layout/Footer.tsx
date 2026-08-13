import Link from 'next/link'
import { Heart, Mail } from 'lucide-react'

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
    </svg>
  )
}

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="container-custom py-8">
        <div className="grid md:grid-cols-3 gap-8">
          <div>
            <h3 className="font-bold text-lg mb-4 text-[#3D4852] flex items-center gap-2">
              <Heart className="w-5 h-5 text-[#E8B8C2] fill-[#E8B8C2]" />
              我们的小家
            </h3>
            <p className="text-[#4A5560] text-sm">
              记录共同旅行的点滴，沉淀属于我们的回忆。<br />
              一个属于我们的小世界。
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-4">快速导航</h4>
            <ul className="space-y-2 text-sm text-[#4A5560]">
              <li><Link href="/" className="hover:text-[#8B4A5A] transition-colors">首页</Link></li>
              <li><Link href="/travel" className="hover:text-[#8B4A5A] transition-colors">旅行记录</Link></li>
              <li><Link href="/album" className="hover:text-[#8B4A5A] transition-colors">相册</Link></li>
              <li><Link href="/moments" className="hover:text-[#8B4A5A] transition-colors">碎碎念</Link></li>
              <li><Link href="/dashboard" className="hover:text-[#8B4A5A] transition-colors">数据看板</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">联系方式</h4>
            <div className="flex gap-4">
              <a href="mailto:your@email.com" className="p-2 rounded-lg bg-[#F5DCE0]/30 hover:bg-[#F5DCE0]/60 transition-colors">
                <Mail className="w-5 h-5 text-[#4A5560]" />
              </a>
              <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-[#F5DCE0]/30 hover:bg-[#F5DCE0]/60 transition-colors">
                <GithubIcon className="w-5 h-5 text-[#4A5560]" />
              </a>
            </div>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800 text-center text-sm text-gray-500 dark:text-gray-500">
          <p className="flex items-center justify-center gap-1">
            Made with <Heart className="w-4 h-4 text-red-500 fill-red-500" /> by 袁同学 & 阿比旦
          </p>
          <p className="mt-1">© {new Date().getFullYear()} All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
