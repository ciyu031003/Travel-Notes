export default function MapLegend() {
  return (
    <div className="absolute bottom-4 right-4 flex items-center gap-4 rounded-lg border border-[#D8DDD8]/80 bg-[#FAFBF7]/85 px-4 py-2 text-xs text-[#5A6670] backdrop-blur">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-full bg-[#E8B8C2] shadow-[0_0_8px_rgba(232,184,194,0.5)]" />
        已探索
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-full bg-[#B9BEC3]" />
        未探索
      </span>
    </div>
  )
}
