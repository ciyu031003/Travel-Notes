export default function MapLegend() {
  return (
    <div className="absolute bottom-4 right-4 flex items-center gap-3 rounded-lg border border-travel-dim/80 bg-travel-cream/85 px-2 py-1.5 md:px-4 md:py-2 text-xs text-travel-ink backdrop-blur">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-full bg-travel-bloom shadow-[0_0_8px_rgba(228,180,120,0.5)]" />
        <span className="hidden md:inline">已探索</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-full bg-[#B9BEC3]" />
        <span className="hidden md:inline">未探索</span>
      </span>
    </div>
  )
}
