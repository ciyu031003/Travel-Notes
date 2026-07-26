export const metadata = {
  title: '旅行记录 | 一起走过的地方',
  description: '记录我们一起旅行的美好时光',
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
