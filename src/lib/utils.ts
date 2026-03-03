import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPeriod(start: string, end: string) {
  const s = new Date(`${start}T00:00:00Z`)
  const e = new Date(`${end}T00:00:00Z`)
  const fmt = (d: Date) => {
    const day = d.getUTCDate()
    const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
    return `${day} ${month}`
  }
  return `${fmt(s)} to ${fmt(e)}`
}
