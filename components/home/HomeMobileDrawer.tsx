'use client'

import { CalendarDays, Images, Sparkles, Settings2, NAV_ICON } from '@/lib/mobile/icon-system'
import { SideDrawer, DrawerSection, DrawerRow } from '@/components/mobile/SideDrawer'
import IcpLicense from '@/components/IcpLicense'

/**
 * 首页移动端「功能菜单」抽屉（P1-19）。
 *
 * 为什么单独拆文件：SideDrawer 静态引入 motion/react，而首页在 P1-18 已改服务端渲染，
 * 若这里继续静态引用，motion chunk 会重新进入 index.html 的首屏脚本（P-4 回退）。
 * 抽成独立模块后由 HomeMobile 用 dynamic(...,{ssr:false}) 懒加载：只有用户点开菜单
 * 才下载 motion，首屏 HTML/脚本不再包含它。
 */
export default function HomeMobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      title="功能菜单"
      footer={
        <IcpLicense
          className="m-caption leading-relaxed text-[var(--m-muted)]"
          numberClassName="text-[var(--m-muted)] hover:text-[var(--m-accent-strong)]"
          linkClassName="text-[var(--m-faint)] hover:text-[var(--m-accent-strong)]"
        />
      }
    >
      <DrawerSection title="记录">
        <DrawerRow icon={Images} title="旅行画册" href="/album" onClick={onClose} />
        <DrawerRow icon={CalendarDays} title="时间线" href="/timeline" onClick={onClose} />
        <DrawerRow icon={NAV_ICON.moment} title="碎碎念" href="/moments" onClick={onClose} />
        <DrawerRow icon={NAV_ICON.stats} title="数据看板" href="/dashboard" onClick={onClose} />
        <DrawerRow icon={NAV_ICON.bookmark} title="我的收藏" href="/me/favorites" onClick={onClose} />
      </DrawerSection>

      <DrawerSection title="设置">
        <DrawerRow
          icon={Settings2}
          title="账号设置"
          description="密码、邮箱与账号信息"
          href="/me/settings"
          onClick={onClose}
        />
        <DrawerRow
          icon={Sparkles}
          title="数据与同步"
          description="离线内容与同步状态"
          href="/sync"
          onClick={onClose}
        />
      </DrawerSection>
    </SideDrawer>
  )
}
