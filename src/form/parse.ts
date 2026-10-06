// 入力欄の文字列を数字に直す。全角数字やカンマ、全角のマイナスも受け付ける。
// 空なら null、数字として読めなければ NaN を返す。
export function parseNumber(s: string | null | undefined): number | null {
  if (s == null) return null
  const t = String(s)
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[．。]/g, '.')
    .replace(/[−－ー―‐]/g, '-')
    .replace(/＋/g, '+')
    .replace(/[,，\s]/g, '')
  if (t === '') return null
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN
  return Number(t)
}

export const numToInput = (x: number | null | undefined): string => (x == null ? '' : String(x))
