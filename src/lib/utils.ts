import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPeriod(start: string, end: string) {
  const s = new Date(`${start}T00:00:00`)
  const e = new Date(`${end}T00:00:00`)
  const fmt = (d: Date, includeYear: boolean) => {
    const day = d.getUTCDate()
    const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
    return includeYear ? `${day} ${month} ${d.getUTCFullYear()}` : `${day} ${month}`
  }
  const crossYear = s.getUTCFullYear() !== e.getUTCFullYear()
  return `${fmt(s, crossYear)} to ${fmt(e, true)}`
}
