import { ICP_LICENSE, ICP_LICENSE_QUERY_URL } from '@/lib/icp'
import { cn } from '@/lib/utils'

/**
 * ICP 备案号展示块（应用内显著位置 + 可点击跳转工信部备案系统）。
 *
 * 覆盖各页面底色差异：容器只负责排版，颜色由调用方通过 className / numberClassName /
 * linkClassName 传入（登录页在深色照片上、页脚在浅底、设置页在暖白卡片上）。
 *
 * DOM 上带 \`data-icp-license\` 属性，便于自动化核验/自检脚本在渲染结果里定位备案号。
 */
export default function IcpLicense({
  className,
  numberClassName,
  linkClassName,
  label = true,
  compact = false,
}: {
  className?: string
  /** 备案编号本身的颜色（默认继承） */
  numberClassName?: string
  /** 备案系统网址那一行的颜色（默认同 numberClassName） */
  linkClassName?: string
  /** 是否显示「ICP 备案号：」前缀，默认显示 */
  label?: boolean
  /** 紧凑模式：只显示编号本身（编号已可点击跳转备案系统） */
  compact?: boolean
}) {
  const linkBase = 'underline-offset-2 transition hover:underline'

  return (
    <div className={cn('text-[11px] leading-relaxed', className)} data-icp-license={ICP_LICENSE}>
      <p>
        {label && <span>ICP 备案号：</span>}
        <a
          href={ICP_LICENSE_QUERY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(linkBase, numberClassName)}
        >
          {ICP_LICENSE}
        </a>
      </p>
      {!compact && (
        <p className="mt-0.5">
          工信部备案查询：
          <a
            href={ICP_LICENSE_QUERY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(linkBase, linkClassName ?? numberClassName)}
          >
            {ICP_LICENSE_QUERY_URL}
          </a>
        </p>
      )}
    </div>
  )
}
