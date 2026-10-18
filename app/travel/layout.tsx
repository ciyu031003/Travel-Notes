export const metadata = {
  // P1-21：root layout 已有 title.template（'%s | 甜途'），这里不能再带品牌后缀，
  // 否则 travel/placeholder.html 会渲染成「旅行 | 甜途 | 甜途」。
  title: '旅行',
  description: '管理你的旅行足迹与记忆。',
}

export default function TravelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative">
      {children}
    </div>
  )
}
