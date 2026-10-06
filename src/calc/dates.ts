// 日付は端末の時刻（日本で使う前提）で扱い、YYYY-MM-DD の文字列で持つ。

const pad = (n: number) => String(n).padStart(2, '0')

export const toISODate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const parseISODate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const addDays = (iso: string, n: number): string => {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

export const isWeekend = (iso: string): boolean => {
  const day = parseISODate(iso).getDay()
  return day === 0 || day === 6
}

export const nextBusinessDay = (iso: string): string => {
  let d = addDays(iso, 1)
  while (isWeekend(d)) d = addDays(d, 1)
  return d
}

export const isAfterClose = (now: Date): boolean => now.getHours() * 60 + now.getMinutes() >= 15 * 60 + 30

// 15:30 以降なら翌営業日、それより前なら当日。土日は飛ばす。祝日は手で直す。
export function defaultTargetDate(now: Date): string {
  const today = toISODate(now)
  if (isAfterClose(now)) return nextBusinessDay(today)
  return isWeekend(today) ? nextBusinessDay(today) : today
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export function formatDateJa(iso: string): string {
  const d = parseISODate(iso)
  return `${d.getMonth() + 1}/${pad(d.getDate())}（${WEEKDAYS[d.getDay()]}）`
}

export function formatDateSlash(iso: string): string {
  return iso.replaceAll('-', '/')
}

export function formatDateTime(isoTime: string): string {
  const d = new Date(isoTime)
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatTime(isoTime: string): string {
  const d = new Date(isoTime)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
