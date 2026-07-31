'use client'

import { useState } from 'react'
import { Link2, Share2, ArrowUp, Check } from 'lucide-react'

interface PostShareProps {
  url: string
  title: string
}

export default function PostShare({ url, title }: PostShareProps) {
  const [copied, setCopied] = useState(false)

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 降级处理
      const input = document.createElement('input')
      input.value = url
      document.body.appendChild(input)
      input.select()
      try {
        document.execCommand('copy')
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {}
      document.body.removeChild(input)
    }
  }

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, url })
        return
      } catch {
        // 用户取消分享，降级为复制
      }
    }
    await handleCopyLink()
  }

  const handleBackToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="flex items-center gap-2 mt-12 py-4 border-t border-gray-100 dark:border-gray-700">
      <button
        type="button"
        onClick={handleCopyLink}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:text-primary-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
        aria-label="复制链接"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-rose-500" /> : <Link2 className="w-3.5 h-3.5" />}
        <span>{copied ? '已复制' : '复制链接'}</span>
      </button>

      <button
        type="button"
        onClick={handleShare}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:text-primary-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
        aria-label="分享文章"
      >
        <Share2 className="w-3.5 h-3.5" />
        <span>分享</span>
      </button>

      <button
        type="button"
        onClick={handleBackToTop}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:text-primary-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
        aria-label="返回顶部"
      >
        <ArrowUp className="w-3.5 h-3.5" />
        <span>返回顶部</span>
      </button>
    </div>
  )
}
