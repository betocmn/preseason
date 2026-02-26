'use client'

import { Star } from 'lucide-react'
import { useState } from 'react'
import { cn } from '~/lib/utils'

const sizeClasses = {
  sm: 'h-3.5 w-3.5',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
}

type StarRatingProps = {
  value: number
  onChange?: (value: number) => void
  size?: 'sm' | 'md' | 'lg'
  readOnly?: boolean
  className?: string
}

export function StarRating({
  value,
  onChange,
  size = 'md',
  readOnly = false,
  className,
}: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState(0)
  const isInteractive = !!onChange && !readOnly
  const displayValue = isInteractive && hoverValue > 0 ? hoverValue : value

  const handleMouseLeave = () => {
    if (isInteractive) setHoverValue(0)
  }

  return (
    <div
      className={cn('inline-flex items-center gap-0.5', className)}
      onMouseLeave={handleMouseLeave}
      role="img"
      aria-label={`Rating: ${value} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((starIndex) => {
        const fillFraction = Math.min(1, Math.max(0, displayValue - (starIndex - 1)))

        if (isInteractive) {
          return (
            <button
              key={starIndex}
              type="button"
              className={cn(
                'relative cursor-pointer rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                sizeClasses[size],
              )}
              onClick={() => onChange(starIndex)}
              onMouseEnter={() => setHoverValue(starIndex)}
              aria-label={`${starIndex} star${starIndex !== 1 ? 's' : ''}`}
            >
              <Star
                className={cn('absolute inset-0', sizeClasses[size], 'text-muted-foreground/30')}
              />
              {fillFraction > 0 && (
                <Star
                  className={cn(
                    'absolute inset-0',
                    sizeClasses[size],
                    'fill-amber-400 text-amber-400',
                  )}
                  style={
                    fillFraction < 1
                      ? { clipPath: `inset(0 ${(1 - fillFraction) * 100}% 0 0)` }
                      : undefined
                  }
                />
              )}
            </button>
          )
        }

        return (
          <span key={starIndex} className={cn('relative', sizeClasses[size])}>
            <Star
              className={cn('absolute inset-0', sizeClasses[size], 'text-muted-foreground/30')}
            />
            {fillFraction > 0 && (
              <Star
                className={cn(
                  'absolute inset-0',
                  sizeClasses[size],
                  'fill-amber-400 text-amber-400',
                )}
                style={
                  fillFraction < 1
                    ? { clipPath: `inset(0 ${(1 - fillFraction) * 100}% 0 0)` }
                    : undefined
                }
              />
            )}
          </span>
        )
      })}
    </div>
  )
}
