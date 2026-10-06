import { describe, expect, it } from 'vitest'
import { compute, defaultAdj1, mergeAdjustments, missingResults } from '../src/calc/calc'
import type { PredictionRecord } from '../src/types'
import { rec1002, rec1005 } from './fixtures'

describe('compute', () => {
  it('10/05 の記録で依頼どおりの数字になる', () => {
    const c = compute(rec1005)
    expect(c.prediction).toBe(70100)
    expect(c.error).toBe(583.98)
    expect(c.futuresOnlyError).toBe(633.98)
    expect(c.correctionEffect).toBe(50)
    expect(c.adjustmentEffect).toBe(50)
    expect(c.voteType).toBe('night')
  })

  it('予想値を直接持つ 10/02 の記録は、先物に依存する計算が空欄になる', () => {
    const c = compute(rec1002)
    expect(c.prediction).toBe(68600)
    expect(c.error).toBe(-290.54)
    expect(c.futuresOnlyError).toBeNull()
    expect(c.correctionEffect).toBeNull()
  })

  it('未入力の項目に依存する計算は 0 ではなく null になる', () => {
    const c = compute({ ...rec1005, close: undefined })
    expect(c.error).toBeNull()
    expect(c.futuresOnlyError).toBeNull()
    expect(c.correctionEffect).toBeNull()
    expect(c.overnightMove).toBeNull()
    expect(c.openingGap).toBeNull()
    expect(c.intradayMove).toBeNull()
    expect(c.adjustmentEffect).toBeNull()
    expect(c.adj1Suggestion).toBeNull()
  })

  it('夜間の動き・寄り付きの差・日中の動き', () => {
    const c = compute({ ...rec1005, futuresNextMorning: 70400, open: 70520.5, close: 70683.98 })
    expect(c.overnightMove).toBe(350)
    expect(c.openingGap).toBe(120.5)
    expect(c.intradayMove).toBe(163.48)
  })

  it('補正が逆効果ならマイナスになる', () => {
    const r: PredictionRecord = {
      ...rec1005,
      close: 70000,
      adj2: [{ id: 'x', kind: 'ドル円', amount: 50, note: 'メモ' }],
    }
    const c = compute(r)
    expect(c.error).toBe(-100)
    expect(c.futuresOnlyError).toBe(-50)
    expect(c.correctionEffect).toBe(-50)
    expect(c.adjustmentEffect).toBe(-50)
  })

  it('補正が複数ある古い記録は、合計額を外した場合と比べる', () => {
    const r: PredictionRecord = {
      ...rec1005,
      close: 70100,
      adj2: [
        { id: 'a', kind: 'ドル円', amount: 100, note: 'a' },
        { id: 'b', kind: '直近の傾向', amount: -40, note: 'b' },
      ],
    }
    const c = compute(r) // 予想値 70110、誤差 -10
    expect(c.prediction).toBe(70110)
    expect(c.error).toBe(-10)
    expect(c.adj2Sum).toBe(60)
    expect(c.adjustmentEffect).toBe(40) // 外すと誤差は 50
  })

  it('朝に修正した日は朝の先物で予想値を出し、夜の予想値と誤差も残す', () => {
    const r: PredictionRecord = {
      ...rec1005,
      futuresNextMorning: 70500,
      morning: { futures: 70600, time: '2026-10-04T23:30:00.000Z', adj1: 0, adj2: [] },
    }
    const c = compute(r)
    expect(c.voteType).toBe('morning')
    expect(c.prediction).toBe(70600)
    expect(c.nightPrediction).toBe(70100)
    expect(c.error).toBe(83.98)
    expect(c.nightError).toBe(583.98)
    expect(c.morningImprovement).toBe(500)
    // 先物のみの誤差は朝の先物、夜間の動きは夜の先物を基準にする
    expect(c.futuresOnlyError).toBe(83.98)
    expect(c.overnightMove).toBe(450)
  })

  it('次回の補正①の提案 ＝ 終値 − 終値が出た頃の先物', () => {
    expect(compute({ ...rec1005, futuresAtClose: 70600 }).adj1Suggestion).toBe(83.98)
  })
})

describe('defaultAdj1', () => {
  it('直前の記録に提案があればそれを整数に丸めて使う', () => {
    const records = [rec1002, { ...rec1005, futuresAtClose: 70600 }]
    expect(defaultAdj1(records, '2026-10-06')).toEqual({ value: 84, source: 'suggestion' })
  })
  it('提案がなければ直前の記録の補正①を引き継ぐ', () => {
    const records = [rec1002, { ...rec1005, adj1: 30 }]
    expect(defaultAdj1(records, '2026-10-06')).toEqual({ value: 30, source: 'previous' })
  })
  it('記録がなければ 0', () => {
    expect(defaultAdj1([], '2026-10-06')).toEqual({ value: 0, source: 'none' })
  })
})

describe('missingResults', () => {
  it('終値と順位の両方が入るまで未入力として扱う', () => {
    expect(missingResults({ ...rec1005, close: undefined, rank: undefined })).toEqual(['終値', '順位'])
    expect(missingResults({ ...rec1005, rank: undefined })).toEqual(['順位'])
    expect(missingResults(rec1005)).toEqual([])
  })
})

describe('mergeAdjustments（古い記録の補正を1件にまとめる）', () => {
  it('1件なら理由の種類をメモの先頭に付ける', () => {
    expect(mergeAdjustments(rec1005.adj2)).toEqual({ amount: 50, note: 'ドル円：テスト用のメモ' })
  })
  it('複数なら金額を合計し、種類と金額を付けてメモをつなげる', () => {
    const m = mergeAdjustments([
      { id: 'a', kind: 'ドル円', amount: 100, note: 'a' },
      { id: 'b', kind: '直近の傾向', amount: -40, note: 'b' },
    ])
    expect(m).toEqual({ amount: 60, note: 'ドル円 +100：a / 直近の傾向 -40：b' })
  })
  it('新しい形（種類なし）の補正はメモだけ', () => {
    expect(mergeAdjustments([{ id: 'x', kind: '', amount: -30, note: 'メモ' }])).toEqual({ amount: -30, note: 'メモ' })
  })
  it('補正なし', () => {
    expect(mergeAdjustments([])).toEqual({ amount: 0, note: '' })
  })
})
