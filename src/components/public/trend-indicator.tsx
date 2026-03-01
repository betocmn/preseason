import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { cn } from '~/lib/utils'

type TrendIndicatorProps = {
  value: number
  size?: 'sm' | 'md'
  className?: string
}

export function TrendIndicator({ value, size = 'md', className }: TrendIndicatorProps) {
  const isUp = value > 0.001
  const isDown = value < -0.001
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm'
  const pct = Math.abs(value * 100).toFixed(1)

  if (isUp) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-0.5 font-medium text-trend-up',
          textSize,
          className,
        )}
      >
        <ArrowUp className={iconSize} />
        {pct}%
      </span>
    )
  }

  if (isDown) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-0.5 font-medium text-trend-down',
          textSize,
          className,
        )}
      >
        <ArrowDown className={iconSize} />
        {pct}%
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-medium text-trend-flat',
        textSize,
        className,
      )}
    >
      <Minus className={iconSize} />
      0.0%
    </span>
  )
}
