'use client'

import { MousePointer2, Move, MousePointerClick, RotateCcw } from 'lucide-react'

interface HintItem {
  icon: React.ReactNode
  text: string
}

const HINTS: HintItem[] = [
  { icon: <MousePointer2 className="w-3.5 h-3.5" />, text: '鼠标滚轮：缩放' },
  { icon: <Move className="w-3.5 h-3.5" />, text: '拖拽：平移视图' },
  { icon: <MousePointerClick className="w-3.5 h-3.5" />, text: '点击节点：折叠/展开' },
  { icon: <RotateCcw className="w-3.5 h-3.5" />, text: '双击空白：重置视图' },
]

/**
 * 思维导图下方的小提示卡片，列出交互操作。
 */
export default function MindmapHint() {
  return (
    <div className="text-xs text-gray-500 dark:text-gray-400 bg-purple-50/50 dark:bg-purple-900/20 rounded-lg p-3">
      <div className="flex flex-wrap gap-4">
        {HINTS.map((item) => (
          <span key={item.text} className="flex items-center gap-1.5">
            <span className="text-purple-400">{item.icon}</span>
            {item.text}
          </span>
        ))}
      </div>
    </div>
  )
}
