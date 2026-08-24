export const metadata = {
  title: '旅行 | 行迹',
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
