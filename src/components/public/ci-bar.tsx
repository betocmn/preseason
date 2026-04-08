export function CiBar({ low, high }: { low: number; high: number }) {
  const leftPct = Math.round(low * 100)
  const widthPct = Math.max(Math.round((high - low) * 100), 1)

  return (
    <div className="relative h-2 w-20 rounded-full bg-muted">
      <div
        className="absolute h-full rounded-full bg-muted-foreground/40"
        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
      />
    </div>
  )
}
