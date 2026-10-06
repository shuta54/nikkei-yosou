import type { PredictionRecord } from '../types'
import { compute, round2 } from './calc'

export const FEW_RECORDS_THRESHOLD = 20

export interface ErrorSummary {
  n: number
  meanAbs: number | null // 誤差の絶対値の平均
  within100Rate: number | null // ±100円以内に入った割合（0〜1）
}

export interface MeanSummary {
  n: number
  mean: number | null
}

export interface KindStat {
  kind: string
  n: number // 結果が出ている補正の回数
  meanEffect: number | null
  shrinkRate: number | null // 誤差を縮めた回数の割合（0〜1）
}

export interface Stats {
  final: ErrorSummary // 最終的に投票した予想
  finalNight: ErrorSummary // 同、投票区分「夜に投票」
  finalMorning: ErrorSummary // 同、投票区分「朝に修正」
  nightPrediction: ErrorSummary // 夜の予想（全記録。朝に修正した日も夜の予想値で計算）
  morningImprovement: MeanSummary // 朝の修正で縮まった額
  correctionEffect: MeanSummary
  byKind: KindStat[]
  futuresOnlyBias: MeanSummary // 先物のみの誤差の符号つき平均
  overnightAbs: MeanSummary
  openingGapAbs: MeanSummary
  intradayAbs: MeanSummary
}

const mean = (xs: number[]): MeanSummary => ({
  n: xs.length,
  mean: xs.length ? round2(xs.reduce((s, x) => s + x, 0) / xs.length) : null,
})

const nonNull = (xs: (number | null)[]): number[] => xs.filter((x): x is number => x != null)

export function summarizeErrors(errors: (number | null)[]): ErrorSummary {
  const xs = nonNull(errors)
  if (!xs.length) return { n: 0, meanAbs: null, within100Rate: null }
  return {
    n: xs.length,
    meanAbs: mean(xs.map(Math.abs)).mean,
    within100Rate: xs.filter((x) => Math.abs(x) <= 100).length / xs.length,
  }
}

export function computeStats(records: PredictionRecord[], kinds: string[] = []): Stats {
  const cs = records.map(compute)

  const byKindMap = new Map<string, number[]>()
  for (const k of kinds) byKindMap.set(k, [])
  for (const c of cs) {
    for (const { adjustment, effect } of c.adjustmentEffects) {
      // 金額0の補正は効果も0になるので数えない
      if (effect == null || adjustment.amount === 0) continue
      const list = byKindMap.get(adjustment.kind) ?? []
      list.push(effect)
      byKindMap.set(adjustment.kind, list)
    }
  }
  const byKind: KindStat[] = [...byKindMap].map(([kind, effects]) => ({
    kind,
    n: effects.length,
    meanEffect: mean(effects).mean,
    shrinkRate: effects.length ? effects.filter((e) => e > 0).length / effects.length : null,
  }))

  return {
    final: summarizeErrors(cs.map((c) => c.error)),
    finalNight: summarizeErrors(cs.filter((c) => c.voteType === 'night').map((c) => c.error)),
    finalMorning: summarizeErrors(cs.filter((c) => c.voteType === 'morning').map((c) => c.error)),
    nightPrediction: summarizeErrors(cs.map((c) => c.nightError)),
    morningImprovement: mean(nonNull(cs.map((c) => c.morningImprovement))),
    correctionEffect: mean(nonNull(cs.map((c) => c.correctionEffect))),
    byKind,
    futuresOnlyBias: mean(nonNull(cs.map((c) => c.futuresOnlyError))),
    overnightAbs: mean(nonNull(cs.map((c) => c.overnightMove)).map(Math.abs)),
    openingGapAbs: mean(nonNull(cs.map((c) => c.openingGap)).map(Math.abs)),
    intradayAbs: mean(nonNull(cs.map((c) => c.intradayMove)).map(Math.abs)),
  }
}
