import Link from 'next/link'
import { Heart, Github, Mail } from 'lucide-react'

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
              记录生活点滴，沉淀技术成长。<br />
              一个属于我们的小世界。
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-4">快速导航</h4>
            <ul className="space-y-2 text-sm text-[#4A5560]">
              <li><Link href="/" className="hover:text-[#8B4A5A] transition-colors">首页</Link></li>
              <li><Link href="/travel" className="hover:text-[#8B4A5A] transition-colors">旅行记录</Link></li>
              <li><Link href="/notes" className="hover:text-[#8B4A5A] transition-colors">学习笔记</Link></li>
              <li><Link href="/notes/blog" className="hover:text-[#8B4A5A] transition-colors">技术博客</Link></li>
              <li><Link href="/notes/mindmap" className="hover:text-[#8B4A5A] transition-colors">思维导图</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">联系方式</h4>
            <div className="flex gap-4">
              <a href="mailto:your@email.com" className="p-2 rounded-lg bg-[#F5DCE0]/30 hover:bg-[#F5DCE0]/60 transition-colors">
                <Mail className="w-5 h-5 text-[#4A5560]" />
              </a>
              <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-[#F5DCE0]/30 hover:bg-[#F5DCE0]/60 transition-colors">
                <Github className="w-5 h-5 text-[#4A5560]" />
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
