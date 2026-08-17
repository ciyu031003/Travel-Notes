'use client'

import Image from 'next/image'

export default function TimelineCover({ src, alt }: { src: string; alt: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes="96px"
      className="object-cover transition-transform duration-500 group-hover:scale-110"
      onError={(e) => {
        const t = e.target as HTMLImageElement
        t.style.display = 'none'
      }}
    />
  )
}
