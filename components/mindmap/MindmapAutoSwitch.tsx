'use client'

import MindmapViewer from './MindmapViewer'
import MermaidMindmap from './MermaidMindmap'

interface MindmapAutoSwitchProps {
  content: string
  /**
   * 来自文章 front-matter 的渲染器声明。
   *  - 'mermaid'：使用 MermaidMindmap（旧文章兼容）
   *  - 'markmap' 或 undefined：使用 MindmapViewer（默认，交互式）
   */
  frontMatter?: { renderer?: 'markmap' | 'mermaid' }
  title?: string
}

/**
 * 根据 front-matter 的 renderer 字段自动切换渲染器。
 * 默认走 markmap 路径（推荐），仅当显式声明 mermaid 时使用兼容渲染器。
 */
export default function MindmapAutoSwitch({
  content,
  frontMatter,
  title,
}: MindmapAutoSwitchProps) {
  if (frontMatter?.renderer === 'mermaid') {
    return <MermaidMindmap content={content} />
  }

  return (
    <MindmapViewer
      content={content}
      renderer="markmap"
      title={title}
    />
  )
}
