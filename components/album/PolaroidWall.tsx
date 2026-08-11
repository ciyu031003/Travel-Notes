'use client'

import { Camera, MessageCircle } from 'lucide-react'

interface PolaroidWallProps {
  images: string[]
  cityName?: string
  date?: string
  onPhotoClick: (index: number) => void
}

// 卡片旋转角（交错错落，模拟散落在桌面的拍立得）
const ROTATIONS = [-2.6, 2.1, -1.4, 2.6, -2.1, 1.4, -2.4, 1.8, -0.9, 2.4, -1.8, 0.9]

/**
 * 拍立得照片墙：复古像素风（SavePoint 风格）
 * 照片以拍立得卡片错落排列，点击任意卡片即可进入该照片的留言聊天
 */
export default function PolaroidWall({ images, cityName, date, onPhotoClick }: PolaroidWallProps) {
  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#a89f91] gap-3 p-8">
        <div className="item-frame w-20 h-20 flex items-center justify-center">
          <Camera className="w-8 h-8 text-[#dfa87a] opacity-60" />
        </div>
        <p className="text-sm font-bold tracking-wider">这本相册还是空白的</p>
        <p className="text-[11px] text-[#746759]">等待新的旅行记忆被装订进来...</p>
      </div>
    )
  }

  return (
    <div className="columns-2 sm:columns-3 xl:columns-4 gap-5 px-4 sm:px-6 py-5 mc-scrollbar overflow-y-auto h-full">
      {images.map((img, index) => {
        const rot = ROTATIONS[index % ROTATIONS.length]
        return (
          <div
            key={`${img}-${index}`}
            className="break-inside-avoid mb-6"
            style={{ transform: `rotate(${rot}deg)` }}
          >
            <button
              type="button"
              onClick={() => onPhotoClick(index)}
              className="polaroid-card block w-full text-left group"
              aria-label={`点击查看 ${cityName || '相册'} 第 ${index + 1} 张照片并留言`}
            >
              {/* 照片主体 */}
              <div className="relative overflow-hidden border-2 border-black/80 bg-[#211713]">
                <img
                  src={img}
                  alt={`${cityName || '旅行照片'} ${index + 1}`}
                  loading="lazy"
                  className="w-full object-cover aspect-[4/5] transition-transform duration-300 group-hover:scale-105"
                />
                {/* 底片标签 */}
                <span className="photo-negative-tag">记忆底片</span>
                {/* 悬停提示 */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                  <MessageCircle className="w-6 h-6 text-[#fce268]" />
                  <span className="text-[#fce268] text-xs font-bold tracking-wider">点击开启留言</span>
                </div>
              </div>

              {/* 手写题字区 */}
              <div className="pt-2.5 px-0.5 flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[#5a3b30] font-bold text-xs tracking-wide truncate">
                    {cityName || '旅行记忆'}
                  </p>
                  <p className="text-[#8a7662] text-[10px] mt-1 truncate">
                    #{String(index + 1).padStart(2, '0')}
                    {date ? ` · ${date}` : ''}
                  </p>
                </div>
                <span className="wax-seal w-7 h-7 text-[9px] shrink-0" title="点击留言">
                  记
                </span>
              </div>
            </button>
          </div>
        )
      })}
    </div>
  )
}