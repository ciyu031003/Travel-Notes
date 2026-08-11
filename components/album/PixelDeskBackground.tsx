'use client'

import { useMemo } from 'react'

interface PixelDeskBackgroundProps {
  className?: string
}

interface Ember {
  id: number
  left: number
  bottom: number
  delay: number
  duration: number
  size: number
}

/**
 * 像素木屋桌面背景（SavePoint 风格）：
 * 复古木纹背景图 + 暗角 + 缓慢上飘的炭火粒子
 */
export default function PixelDeskBackground({ className = '' }: PixelDeskBackgroundProps) {
  const embers = useMemo<Ember[]>(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        id: i,
        left: 4 + Math.random() * 92,
        bottom: 6 + Math.random() * 40,
        delay: Math.random() * 3,
        duration: 2 + Math.random() * 2.8,
        size: Math.random() > 0.5 ? 4 : 3,
      })),
    []
  )

  return (
    <div className={`absolute inset-0 pixel-desk-bg overflow-hidden ${className}`} aria-hidden="true">
      {embers.map((e) => (
        <span
          key={e.id}
          className="pixel-ember"
          style={{
            left: `${e.left}%`,
            bottom: `${e.bottom}%`,
            width: e.size,
            height: e.size,
            animationDelay: `${e.delay}s`,
            animationDuration: `${e.duration}s`,
          }}
        />
      ))}
    </div>
  )
}