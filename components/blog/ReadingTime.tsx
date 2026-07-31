import { Clock } from 'lucide-react'

interface ReadingTimeProps {
  minutes: number
}

export default function ReadingTime({ minutes }: ReadingTimeProps) {
  return (
    <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
      <Clock className="w-3.5 h-3.5" />
      <span>{minutes} 分钟阅读</span>
    </span>
  )
}
