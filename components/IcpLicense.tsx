import {
  APP_ICP_LICENSE,
  ICP_LICENSE_QUERY_URL,
  MIIT_FILING_NO,
  MIIT_FILING_QUERY_URL,
  POLICE_FILING_BADGE,
  POLICE_FILING_NO,
  POLICE_FILING_QUERY_URL,
  SITE_ICP_LICENSE,
} from '@/lib/icp'
import { cn } from '@/lib/utils'

/**
 * 备案信息展示块（网站 ICP 备案号 + App ICP 备案号 + 工信部备案号 + 公安联网备案号）。
 *
 * 每一行都是「标签 + 可点击编号」：
 *   · ICP 备案号（网站 / App）→ 工信部备案系统 https://beian.miit.gov.cn/
 *   · 工信部备案号 → 工信部备案系统备案查询页
 *   · 公安备案号（带官方警徽标识）→ 全国互联网安全管理服务平台查询页
 *   · 末行给出工信部备案系统网址（应用商店规范要求「编号下方按要求链接备案系统网址」）
 *
 * 各页面底色不同，容器只负责排版：颜色由调用方通过 className / numberClassName / linkClassName 传入
 * （登录页在深色照片上、页脚在浅底、设置页在暖白卡片上）。
 * 根节点带 data-icp-license / data-site-icp-license / data-police-filing，便于自动化核验与自检定位。
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
  /** 查询网址那一行的颜色（默认同 numberClassName） */
  linkClassName?: string
  /** 是否显示「××备案号：」前缀，默认显示 */
  label?: boolean
  /** 紧凑模式：省略末行「工信部备案查询：<网址>」 */
  compact?: boolean
}) {
  const linkBase = 'underline-offset-2 transition hover:underline'
  const linkCls = cn(linkBase, numberClassName)
  const urlCls = cn(linkBase, linkClassName ?? numberClassName)

  const rows: { text: string; value: string; href: string; badge?: string }[] = [
    { text: 'ICP 备案号（网站）：', value: SITE_ICP_LICENSE, href: ICP_LICENSE_QUERY_URL },
    { text: 'ICP 备案号（App）：', value: APP_ICP_LICENSE, href: ICP_LICENSE_QUERY_URL },
    { text: '工信部备案号：', value: MIIT_FILING_NO, href: MIIT_FILING_QUERY_URL },
    { text: '公安备案号：', value: POLICE_FILING_NO, href: POLICE_FILING_QUERY_URL, badge: POLICE_FILING_BADGE },
  ]

  return (
    <div
      className={cn('text-[11px] leading-relaxed', className)}
      data-icp-license={APP_ICP_LICENSE}
      data-site-icp-license={SITE_ICP_LICENSE}
      data-police-filing={POLICE_FILING_NO}
    >
      {rows.map((row) => (
        <p key={row.text} className="mt-0.5 first:mt-0">
          {row.badge && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={row.badge}
              alt="公安备案"
              width={12}
              height={13}
              className="mr-1 inline-block h-[13px] w-3 align-[-2px]"
            />
          )}
          {label && <span>{row.text}</span>}
          <a href={row.href} target="_blank" rel="noopener noreferrer" className={linkCls}>
            {row.value}
          </a>
        </p>
      ))}
      {!compact && (
        <p className="mt-0.5">
          工信部备案查询：
          <a href={ICP_LICENSE_QUERY_URL} target="_blank" rel="noopener noreferrer" className={urlCls}>
            {ICP_LICENSE_QUERY_URL}
          </a>
        </p>
      )}
    </div>
  )
}
