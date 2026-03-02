import { cn } from '~/lib/utils'

type PercentageBarProps = {
  valueA: number
  valueB: number
  labelA: string
  labelB: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function PercentageBar({
  valueA,
  valueB,
  labelA,
  labelB,
  size = 'md',
  className,
}: PercentageBarProps) {
  const total = valueA + valueB
  const pctA = total > 0 ? Math.round((valueA / total) * 100) : 50
  const pctB = total > 0 ? 100 - pctA : 50

  const heightClass = size === 'sm' ? 'h-5' : size === 'lg' ? 'h-8' : 'h-6'
  const textClass = size === 'sm' ? 'text-xs' : 'text-sm'

  return (
    <div className={cn('w-full', className)}>
      <div className={cn('mt-1 flex justify-between', textClass, 'text-muted-foreground')}>
        <span className="truncate">{labelA}</span>
        <span className="truncate text-right">{labelB}</span>
      </div>
      <div className={cn('mt-1 flex gap-0.5 overflow-hidden rounded', heightClass)}>
        <div
          className={cn(
            'flex items-center justify-center transition-all',
            pctA >= pctB ? 'bg-chart-a' : 'bg-chart-a-muted',
          )}
          style={{ width: `${Math.max(pctA, 5)}%` }}
        >
          <span className={cn('font-mono-data font-medium text-chart-a-foreground', textClass)}>
            {pctA}%
          </span>
        </div>
        <div
          className={cn(
            'flex items-center justify-center transition-all',
            pctB > pctA ? 'bg-chart-b' : 'bg-chart-b-muted',
          )}
          style={{ width: `${Math.max(pctB, 5)}%` }}
        >
          <span className={cn('font-mono-data font-medium text-chart-b-foreground', textClass)}>
            {pctB}%
          </span>
        </div>
      </div>
    </div>
  )
}
