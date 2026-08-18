'use client'

import { useMemo } from 'react'

interface GalaxyBackgroundProps {
  density?: number
  className?: string
}

interface Star {
  id: number
  left: number
  top: number
  size: number
  delay: number
  duration: number
}

/**
 * 低噪音银河背景：纯 CSS 星点，透明度上限 0.5。
 * 用于未启动 WebGL 的解锁态 / 回退态，作为背景氛围而非内容。
 */
export default function GalaxyBackground({ density = 60, className = '' }: GalaxyBackgroundProps) {
  const stars = useMemo<Star[]>(
    () =>
      Array.from({ length: density }, (_, i) => ({
        id: i,
        left: (i * 37 + 13) % 100,
        top: (i * 53 + 7) % 100,
        size: i % 5 === 0 ? 2.5 : 1.5,
        delay: (i % 7) * 0.4,
        duration: 2 + (i % 5),
      })),
    [density]
  )

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {stars.map((s) => (
        <span
          key={s.id}
          className="absolute rounded-full bg-white"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            opacity: 0.15 + (s.id % 4) * 0.08,
            animation: `space-twinkle ${s.duration}s ease-in-out infinite`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  )
}
