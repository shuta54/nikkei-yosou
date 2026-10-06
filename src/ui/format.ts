// 画面に出す数字の書式。値がないときは「—」を出す。

export const EMPTY = '—'

export function fmt(x: number | null | undefined): string {
  if (x == null) return EMPTY
  return x.toLocaleString('ja-JP', { maximumFractionDigits: 2 })
}

export function fmtSigned(x: number | null | undefined): string {
  if (x == null) return EMPTY
  return (x > 0 ? '+' : '') + fmt(x)
}

export function fmtPct(rate: number | null): string {
  return rate == null ? EMPTY : `${Math.round(rate * 100)}%`
}

// 保存できなかったとき、最初の赤い欄まで画面を動かす
export function scrollToFirstError(): void {
  requestAnimationFrame(() => document.querySelector('.has-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
}
