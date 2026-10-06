import { describe, expect, it } from 'vitest'
import {
  applyResultDraft,
  draftFromRecord,
  newDraft,
  previewPrediction,
  recordFromDraft,
  resultDraftFromRecord,
  startMorningFix,
  toggleEvent,
  tonightDraft,
} from '../src/form/draft'
import { parseNumber } from '../src/form/parse'
import { rec1002, rec1005 } from './fixtures'

const now = new Date(2026, 9, 6, 22, 0)

describe('recordFromDraft', () => {
  it('先物だけ入れれば保存できる（補正なし）', () => {
    const { draft } = newDraft(now, [])
    const res = recordFromDraft({ ...draft, futures: '70500' }, undefined, [])
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.record.targetDate).toBe('2026-10-07')
      expect(res.record.futuresAtVote).toBe(70500)
      expect(res.record.adj1).toBe(0)
    }
  })

  it('先物が空なら保存できない', () => {
    const { draft } = newDraft(now, [])
    const res = recordFromDraft(draft, undefined, [])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.futures).toBeDefined()
  })

  it('補正②の金額が0以外で根拠が空なら保存できない', () => {
    const { draft } = newDraft(now, [])
    const adj = { id: 'a', kind: 'ドル円', amount: '50', note: '  ' }
    const res = recordFromDraft({ ...draft, futures: '70500', adj2: [adj] }, undefined, [])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors['a.note']).toBeDefined()
  })

  it('補正②の金額が0なら根拠は空でよい', () => {
    const { draft } = newDraft(now, [])
    const adj = { id: 'a', kind: 'ドル円', amount: '0', note: '' }
    expect(recordFromDraft({ ...draft, futures: '70500', adj2: [adj] }, undefined, []).ok).toBe(true)
  })

  it('朝の修正でも、補正②の根拠が空なら保存できない', () => {
    const d = startMorningFix(draftFromRecord(rec1005), now)
    const res = recordFromDraft(
      { ...d, morningFutures: '70600', morningAdj2: [{ id: 'm', kind: 'その他', amount: '-10', note: '' }] },
      rec1005,
      [rec1005],
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors['m.note']).toBeDefined()
  })

  it('同じ対象日の記録が別にあれば保存できない', () => {
    const { draft } = newDraft(now, [], '2026-10-05')
    const res = recordFromDraft({ ...draft, futures: '70000' }, undefined, [rec1005])
    expect(res.ok).toBe(false)
  })

  it('予想値を直接持つ記録は先物なしで編集・保存できる', () => {
    const res = recordFromDraft(draftFromRecord(rec1002), rec1002, [rec1002])
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.record.directPrediction).toBe(68600)
      expect(res.record.close).toBe(68309.46)
    }
  })

  it('記録→下書き→記録で中身が変わらない', () => {
    const res = recordFromDraft(draftFromRecord(rec1005), rec1005, [rec1005])
    expect(res.ok).toBe(true)
    if (res.ok) expect({ ...res.record, updatedAt: '' }).toEqual({ ...rec1005, updatedAt: '' })
  })

  it('朝に修正すると夜の補正が写され、夜の入力も残る', () => {
    const d = startMorningFix(draftFromRecord(rec1005), now)
    expect(d.morningAdj2[0].amount).toBe('50')
    const res = recordFromDraft({ ...d, morningFutures: '70600' }, rec1005, [rec1005])
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.record.futuresAtVote).toBe(70050)
      expect(res.record.morning?.futures).toBe(70600)
      expect(res.record.morning?.adj2[0].amount).toBe(50)
    }
  })

  it('「夜に投票」に戻して保存すると朝の修正は消える', () => {
    const withMorning = { ...rec1005, morning: { futures: 70600, time: 't', adj1: 0, adj2: [] } }
    const d = { ...draftFromRecord(withMorning), voteType: 'night' as const }
    const res = recordFromDraft(d, withMorning, [withMorning])
    expect(res.ok && res.record.morning).toBeUndefined()
  })
})

describe('結果の入力', () => {
  it('朝に修正した先物を「先物（翌朝）」の初期値にする', () => {
    const r = { ...rec1005, morning: { futures: 70600, time: 't', adj1: 0, adj2: [] } }
    expect(resultDraftFromRecord(r).futuresNextMorning).toBe('70600')
  })
  it('すでに入力済みなら入力済みの値を使う', () => {
    const r = { ...rec1005, futuresNextMorning: 70550, morning: { futures: 70600, time: 't', adj1: 0, adj2: [] } }
    expect(resultDraftFromRecord(r).futuresNextMorning).toBe('70550')
  })
  it('順位は順位と参加人数の両方が必要', () => {
    const d = { ...resultDraftFromRecord(rec1005), total: '' }
    expect(applyResultDraft(d, rec1005).ok).toBe(false)
  })
  it('空欄にした項目は未入力に戻る', () => {
    const d = { ...resultDraftFromRecord(rec1005), close: '' }
    const res = applyResultDraft(d, rec1005)
    expect(res.ok && res.record.close).toBeUndefined()
  })
})

describe('入力の補助', () => {
  it('入力中の予想値', () => {
    expect(previewPrediction('70050', '0', [{ id: 'a', kind: 'ドル円', amount: '50', note: '' }])).toBe(70100)
    expect(previewPrediction('', '0', [])).toBeNull()
  })
  it('全角数字やマイナス記号を読める', () => {
    expect(parseNumber('７０，０５０')).toBe(70050)
    expect(parseNumber('−0.26')).toBe(-0.26)
    expect(parseNumber('+50')).toBe(50)
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('abc')).toBeNaN()
  })
  it('寝た後の予定の「なし」は他と同時に選べない', () => {
    expect(toggleEvent(['経済指標'], 'なし')).toEqual(['なし'])
    expect(toggleEvent(['なし'], '経済指標')).toEqual(['経済指標'])
  })
})

describe('tonightDraft（投票区分を自動で決める）', () => {
  const night1006 = { ...rec1005, id: 'n', targetDate: '2026-10-07', close: undefined, rank: undefined }
  it('夜に開くと翌営業日の新しい夜の予想', () => {
    const { draft } = tonightDraft([rec1005], new Date(2026, 9, 6, 22, 0))
    expect(draft.targetDate).toBe('2026-10-07')
    expect(draft.id).toBeUndefined()
    expect(draft.voteType).toBe('night')
  })
  it('保存した夜にもう一度開くと、その記録を夜の予想のまま出す', () => {
    const { draft } = tonightDraft([night1006], new Date(2026, 9, 6, 23, 0))
    expect(draft.id).toBe('n')
    expect(draft.voteType).toBe('night')
  })
  it('対象日の朝に開くと自動で「朝に修正」になり、夜の補正を写す', () => {
    const { draft } = tonightDraft([night1006], new Date(2026, 9, 7, 7, 30))
    expect(draft.id).toBe('n')
    expect(draft.voteType).toBe('morning')
    expect(draft.morningFutures).toBe('')
    expect(draft.morningAdj2[0].amount).toBe('50')
  })
  it('対象日の朝でも記録がなければ夜の新しい予想', () => {
    const { draft } = tonightDraft([], new Date(2026, 9, 7, 7, 30))
    expect(draft.targetDate).toBe('2026-10-07')
    expect(draft.voteType).toBe('night')
  })
  it('土曜の朝は月曜の予想で、朝に修正にはしない', () => {
    const mon = { ...night1006, targetDate: '2026-10-12' }
    const { draft } = tonightDraft([mon], new Date(2026, 9, 10, 9, 0))
    expect(draft.voteType).toBe('night')
  })
})
