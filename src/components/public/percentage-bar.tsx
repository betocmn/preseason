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

  const heightClass = size === 'sm' ? 'h-6' : size === 'lg' ? 'h-10' : 'h-8'
  const textClass = size === 'sm' ? 'text-xs' : 'text-sm'

  return (
    <div className={cn('w-full', className)}>
      <div className={cn('flex overflow-hidden rounded-md', heightClass)}>
        <div
          className={cn(
            'flex items-center justify-center font-medium transition-all',
            textClass,
            pctA >= pctB ? 'bg-trend-up text-trend-up-foreground' : 'bg-muted text-muted-foreground',
          )}
          style={{ width: `${Math.max(pctA, 5)}%` }}
        >
          {pctA}%
        </div>
        <div
          className={cn(
            'flex items-center justify-center font-medium transition-all',
            textClass,
            pctB > pctA ? 'bg-trend-up text-trend-up-foreground' : 'bg-muted text-muted-foreground',
          )}
          style={{ width: `${Math.max(pctB, 5)}%` }}
        >
          {pctB}%
        </div>
      </div>
      <div className={cn('mt-1 flex justify-between', textClass, 'text-muted-foreground')}>
        <span className="truncate">{labelA}</span>
        <span className="truncate text-right">{labelB}</span>
      </div>
    </div>
  )
}
