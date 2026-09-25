import { cn } from '@/lib/utils'

export interface SpaceMemberPreview {
  username: string
  nickname: string | null
  avatarUrl: string | null
  role: string
}

const SIZE_CLASS = {
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-8 w-8 text-[13px]',
  lg: 'h-10 w-10 text-[15px]',
} as const

const OVERLAP_CLASS = {
  sm: '-space-x-2',
  md: '-space-x-2.5',
  lg: '-space-x-3',
} as const

/**
 * 成员头像堆叠。
 *
 * 为什么不用 `SocialAvatar`：那个组件的兜底首字母用的是品牌金 `--social-accent`，
 * 而空间卡片需要**跟空间主题色**走（否则五类空间的成员堆叠长得一样，
 * 也失去了"一眼分辨类型"的作用）。这里用同一套几何，颜色换成 `--space-*`。
 *
 * 描边环用页面底色（`--social-surface`）：杂乱头像上比纯阴影更稳
 * （做法参考 bluesky-social/social-app MIT `Profile/Header/index.tsx` 的 2px 背景色环）。
 */
export function SpaceAvatarStack({
  members,
  max = 4,
  size = 'md',
  className,
}: {
  members: SpaceMemberPreview[]
  max?: number
  size?: keyof typeof SIZE_CLASS
  className?: string
}) {
  const shown = members.slice(0, max)
  const rest = members.length - shown.length

  return (
    <span className={cn('flex items-center', OVERLAP_CLASS[size], className)}>
      {shown.map((m) => (
        <SpaceAvatar key={m.username} member={m} size={size} />
      ))}
      {rest > 0 && (
        <span
          className={cn(
            'flex flex-none items-center justify-center rounded-full bg-[var(--space-accent-soft)] font-semibold text-[var(--space-accent-text)] ring-2 ring-[var(--social-surface)]',
            SIZE_CLASS[size],
          )}
        >
          +{rest}
        </span>
      )}
    </span>
  )
}

export function SpaceAvatar({
  member,
  size = 'md',
  className,
}: {
  member: SpaceMemberPreview
  size?: keyof typeof SIZE_CLASS
  className?: string
}) {
  const label = member.nickname || member.username
  if (member.avatarUrl) {
    return (
      // 用原生 img 而非 next/image：头像来自 /uploads 动态路径，尺寸已由 CSS 固定，
      // 且这里只需要一个 32px 的圆 —— 引 image 优化器反而多一层配置依赖。
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={member.avatarUrl}
        alt={label}
        className={cn('flex-none rounded-full object-cover ring-2 ring-[var(--social-surface)]', SIZE_CLASS[size], className)}
      />
    )
  }
  return (
    <span
      title={label}
      className={cn(
        'flex flex-none items-center justify-center rounded-full bg-[var(--space-accent-soft)] font-semibold text-[var(--space-accent-text)] ring-2 ring-[var(--social-surface)]',
        SIZE_CLASS[size],
        className,
      )}
    >
      {label.slice(0, 1).toUpperCase()}
    </span>
  )
}

export default SpaceAvatarStack
