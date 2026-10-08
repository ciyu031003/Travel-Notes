'use client'

import { EmptyState } from '@/components/mobile/EmptyState'
import { Skeleton, SkeletonCard, SkeletonLines } from '@/components/mobile/Skeleton'

/** Home mobile loading skeleton, kept in a lightweight chunk. */
export function HomeMobileLoading() {
  return (
    <div className="min-h-screen bg-[var(--m-bg)] text-[var(--m-text)]">
      <div className="m-safe-top-40 space-y-6 px-5 pb-10">
        <div>
          <Skeleton className="h-3.5 w-28" />
          <div className="mt-4 space-y-2.5">
            <Skeleton className="h-9 w-3/4" />
            <Skeleton className="h-9 w-1/2" />
          </div>
          <SkeletonLines lines={2} className="mt-5 w-4/5" />
          <div className="mt-7 flex gap-3">
            <Skeleton className="h-12 w-40 !rounded-full" />
            <Skeleton className="h-12 w-28 !rounded-full" />
          </div>
        </div>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  )
}

/** Home mobile error state with retry. */
export function HomeMobileError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="m-safe-top-48 flex min-h-screen flex-col bg-[var(--m-bg)] text-[var(--m-text)]">
      <EmptyState
        title="首页加载失败"
        description={message}
        action={
          <button
            type="button"
            onClick={onRetry}
            className="m-press m-chip m-chip-active !h-11 !px-6 !text-sm"
          >
            重新加载
          </button>
        }
      />
    </div>
  )
}
