'use client'

interface GlassPanelProps {
  className?: string
  children: React.ReactNode
}

/** Mineradio 风格玻璃面板：blur + 饱和度 + 亮度 + 内发光 */
export default function GlassPanel({ className = '', children }: GlassPanelProps) {
  return <div className={`space-glass ${className}`}>{children}</div>
}
