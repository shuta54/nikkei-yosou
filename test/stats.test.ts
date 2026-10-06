import { describe, expect, it } from 'vitest'
import { computeStats } from '../src/calc/stats'
import { buildTsv, TSV_COLUMNS } from '../src/calc/tsv'
import type { PredictionRecord } from '../src/types'
import { rec1002, rec1005 } from './fixtures'

const morningRec: PredictionRecord = {
  ...rec1005,
  id: 'm',
  targetDate: '2026-10-06',
  futuresNextMorning: 70500,
  open: 70550,
  morning: { futures: 70600, time: '2026-10-05T23:30:00.000Z', adj1: 0, adj2: [] },
}

describe('computeStats', () => {
  it('最初の2件', () => {
    const s = computeStats([rec1002, rec1005])
    expect(s.final.n).toBe(2)
    expect(s.final.meanAbs).toBe(437.26) // (290.54 + 583.98) / 2
    expect(s.final.within100Rate).toBe(0)
    expect(s.finalNight.n).toBe(2)
    expect(s.finalMorning.n).toBe(0)
    expect(s.correctionEffect).toEqual({ n: 1, mean: 50 })
    expect(s.futuresOnlyBias).toEqual({ n: 1, mean: 633.98 })
    expect(s.adjusted).toEqual({ n: 1, meanEffect: 50, shrinkRate: 1 })
    expect(s.biasByUsdjpy.up).toEqual({ n: 1, mean: 633.98 }) // 10/05 はドル円 +0.26%
    expect(s.biasByUsdjpy.down).toEqual({ n: 0, mean: null })
    expect(s.biasByDow.up.n).toBe(0) // ダウの記録なし
    expect(s.overnightAbs.n).toBe(0)
  })

  it('朝に修正した日を分けて集計し、夜の予想は全記録で集計する', () => {
    const s = computeStats([rec1002, rec1005, morningRec])
    expect(s.finalMorning).toEqual({ n: 1, meanAbs: 83.98, within100Rate: 1 })
    expect(s.finalNight.n).toBe(2)
    expect(s.nightPrediction.n).toBe(3)
    expect(s.morningImprovement).toEqual({ n: 1, mean: 500 })
    expect(s.overnightAbs).toEqual({ n: 1, mean: 450 })
    expect(s.openingGapAbs).toEqual({ n: 1, mean: 50 })
  })
})

it('ドル円・ダウの前日比のプラスとマイナスで分ける', () => {
  const r = (id: string, date: string, close: number, usdjpyPct?: number, dowPct?: number) =>
    ({ ...rec1005, id, targetDate: date, futuresAtVote: 70000, adj2: [], close, usdjpyPct, dowPct })
  const s = computeStats([
    r('a', '2026-10-06', 70100, 0.3, -0.5), // 先物のみの誤差 +100
    r('b', '2026-10-07', 70300, 0.1, 0.2), // +300
    r('c', '2026-10-08', 69800, -0.2, -1), // -200
    r('d', '2026-10-09', 70000, 0, undefined), // 0%は数えない
  ])
  expect(s.biasByUsdjpy).toEqual({ up: { n: 2, mean: 200 }, down: { n: 1, mean: -200 } })
  expect(s.biasByDow).toEqual({ up: { n: 1, mean: 300 }, down: { n: 2, mean: -50 } })
  expect(s.adjusted.n).toBe(0) // 補正した日はない
})

describe('buildTsv', () => {
  it('指定の列順で、古い順に並ぶ', () => {
    const lines = buildTsv([rec1005, rec1002]).split('\n')
    expect(lines[0].split('\t')).toEqual([...TSV_COLUMNS])
    expect(lines).toHaveLength(3)
    const row = lines[2].split('\t')
    const col = (name: (typeof TSV_COLUMNS)[number]) => row[TSV_COLUMNS.indexOf(name)]
    expect(row).toHaveLength(TSV_COLUMNS.length)
    expect(col('日付（対象日）')).toBe('2026/10/05')
    expect(col('予想値')).toBe('70100')
    expect(col('補正②の理由')).toBe('ドル円：テスト用のメモ')
    expect(col('予想誤差')).toBe('583.98')
    expect(col('補正の効果')).toBe('50')
    expect(col('順位')).toBe('2/10')
    expect(col('夜間の動き')).toBe('') // 未入力は空欄
    expect(col('投票区分')).toBe('夜に投票')
    expect(col('夜の予想値')).toBe('70100')
    expect(lines[1].split('\t')[TSV_COLUMNS.indexOf('先物のみの誤差')]).toBe('')
  })
  it('文章中のタブや改行はセルを壊さない', () => {
    const tsv = buildTsv([{ ...rec1005, review: '一行目\n二行目\tタブ' }])
    expect(tsv.split('\n')).toHaveLength(2)
  })
})
