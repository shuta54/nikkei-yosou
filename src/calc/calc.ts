import type { Adjustment, PredictionRecord, VoteType } from '../types'

// 円の計算は小数第2位までに丸め、浮動小数点の誤差を表示に出さない。
export const round2 = (x: number): number => Math.round(x * 100) / 100

const sub = (a: number | null | undefined, b: number | null | undefined): number | null =>
  a == null || b == null ? null : round2(a - b)

const absDiff = (a: number | null, b: number | null): number | null =>
  a == null || b == null ? null : round2(Math.abs(a) - Math.abs(b))

export const sumAdjustments = (adj: Adjustment[]): number =>
  round2(adj.reduce((s, a) => s + a.amount, 0))

export const signed = (x: number): string => (x > 0 ? `+${x}` : String(x))

// 補正は1件で扱う。複数ある古い記録は、金額を合計し、メモをつなげて1件として見せる。
// 理由の種類はメモの先頭に残す。複数あるときは1件ごとの金額も残す。
export function mergeAdjustments(adj: Adjustment[]): { amount: number; note: string } {
  const parts = adj
    .filter((a) => a.amount !== 0 || a.note)
    .map((a) => {
      const head = [a.kind, adj.length > 1 ? signed(a.amount) : ''].filter(Boolean).join(' ')
      return head ? `${head}：${a.note}` : a.note
    })
  return { amount: sumAdjustments(adj), note: parts.join(' / ') }
}

export const voteTypeOf = (r: PredictionRecord): VoteType => (r.morning ? 'morning' : 'night')

// 最終的に投票した予想の材料。朝に修正した日は朝の値を使う。
export function finalInputs(r: PredictionRecord): {
  futures: number | null
  adj1: number
  adj2: Adjustment[]
} {
  if (r.morning) return { futures: r.morning.futures, adj1: r.morning.adj1, adj2: r.morning.adj2 }
  return { futures: r.futuresAtVote ?? null, adj1: r.adj1, adj2: r.adj2 }
}

export function nightPrediction(r: PredictionRecord): number | null {
  if (r.futuresAtVote != null) return round2(r.futuresAtVote + r.adj1 + sumAdjustments(r.adj2))
  return r.directPrediction ?? null
}

export function finalPrediction(r: PredictionRecord): number | null {
  if (!r.morning) return nightPrediction(r)
  const m = r.morning
  return round2(m.futures + m.adj1 + sumAdjustments(m.adj2))
}

export interface Computed {
  voteType: VoteType
  nightPrediction: number | null
  prediction: number | null // 最終的に投票した予想値
  adj2Sum: number // 補正（旧補正②）の合計
  error: number | null // 予想誤差 ＝ 終値 − 予想値
  nightError: number | null // 夜の予想値で計算した誤差
  futuresOnlyError: number | null // 終値 − 先物（投票時）
  correctionEffect: number | null // |先物のみの誤差| − |予想誤差|。先物と日経平均の差も含む
  adjustmentEffect: number | null // |補正を外した場合の誤差| − |予想誤差|。補正した日だけ
  overnightMove: number | null // 先物（翌朝） − 先物（夜の投票時）
  openingGap: number | null // 始値 − 先物（翌朝）
  intradayMove: number | null // 終値 − 始値
  morningImprovement: number | null // |夜の予想の誤差| − |朝の予想の誤差|
  adj1Suggestion: number | null // 終値 − 終値が出た頃の先物
}

export function compute(r: PredictionRecord): Computed {
  const fin = finalInputs(r)
  const prediction = finalPrediction(r)
  const night = nightPrediction(r)
  const error = sub(r.close, prediction)
  const nightError = sub(r.close, night)
  const futuresOnlyError = sub(r.close, fin.futures)
  const adj2Sum = sumAdjustments(fin.adj2)
  return {
    voteType: voteTypeOf(r),
    nightPrediction: night,
    prediction,
    adj2Sum,
    error,
    nightError,
    futuresOnlyError,
    correctionEffect: absDiff(futuresOnlyError, error),
    overnightMove: sub(r.futuresNextMorning, r.futuresAtVote),
    openingGap: sub(r.open, r.futuresNextMorning),
    intradayMove: sub(r.close, r.open),
    morningImprovement: r.morning ? absDiff(nightError, error) : null,
    // 補正を外すと予想値は合計額だけ小さくなり、誤差は合計額だけ大きくなる
    adjustmentEffect: error == null || adj2Sum === 0 ? null : absDiff(round2(error + adj2Sum), error),
    adj1Suggestion: sub(r.close, r.futuresAtClose),
  }
}

// 結果の入力で足りない項目。順位は翌日の夕方にならないとわからないので、
// 終値だけ先に入れた記録も「結果が未入力」として扱い続ける。
export function missingResults(r: PredictionRecord): string[] {
  const missing: string[] = []
  if (r.close == null) missing.push('終値')
  if (r.rank == null) missing.push('順位')
  return missing
}

export interface Adj1Default {
  value: number
  source: 'suggestion' | 'previous' | 'none'
}

// 補正①の初期値。直前の記録に「終値 − 終値が出た頃の先物」があればそれを、
// なければ直前の記録の補正①を引き継ぐ。
export function defaultAdj1(records: PredictionRecord[], targetDate: string): Adj1Default {
  const prior = records
    .filter((r) => r.targetDate < targetDate)
    .sort((a, b) => b.targetDate.localeCompare(a.targetDate))[0]
  if (!prior) return { value: 0, source: 'none' }
  const s = compute(prior).adj1Suggestion
  if (s != null) return { value: Math.round(s), source: 'suggestion' }
  return { value: finalInputs(prior).adj1, source: 'previous' }
}
