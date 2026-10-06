import { describe, expect, it } from 'vitest'
import {
  applyResultDraft,
  draftFromRecord,
  newDraft,
  previewPrediction,
  recordFromDraft,
  resultDraftFromRecord,
  startMorningFix,
  restoreDraft,
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

  it('補正の金額が0以外でメモが空なら保存できない', () => {
    const { draft } = newDraft(now, [])
    const res = recordFromDraft({ ...draft, futures: '70500', adjAmount: '50', adjNote: '  ' }, undefined, [])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.adjNote).toBeDefined()
  })

  it('補正を入れると1件として保存する', () => {
    const { draft } = newDraft(now, [])
    const res = recordFromDraft({ ...draft, futures: '70500', adjAmount: '-30', adjNote: 'ダウ -1.2%' }, undefined, [])
    expect(res.ok && res.record.adj2.map((a) => [a.amount, a.note])).toEqual([[-30, 'ダウ -1.2%']])
  })

  it('補正が0ならメモは空でよく、補正は保存しない', () => {
    const { draft } = newDraft(now, [])
    const res = recordFromDraft({ ...draft, futures: '70500', adjAmount: '0', adjNote: '消し忘れのメモ' }, undefined, [])
    expect(res.ok && res.record.adj2).toEqual([])
  })

  it('朝の修正でも、補正のメモが空なら保存できない', () => {
    const d = startMorningFix(draftFromRecord(rec1005), now)
    const res = recordFromDraft({ ...d, morningFutures: '70600', morningAdjAmount: '-10', morningAdjNote: '' }, rec1005, [rec1005])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.morningAdjNote).toBeDefined()
  })

  it('補正が複数ある古い記録は1件にまとめて見せ、編集しなければ元の形のまま保存する', () => {
    const old = {
      ...rec1005,
      adj2: [
        { id: 'a', kind: 'ドル円', amount: 100, note: 'a' },
        { id: 'b', kind: '直近の傾向', amount: -40, note: 'b' },
      ],
    }
    const d = draftFromRecord(old)
    expect([d.adjAmount, d.adjNote]).toEqual(['60', 'ドル円 +100：a / 直近の傾向 -40：b'])
    const same = recordFromDraft(d, old, [old])
    expect(same.ok && same.record.adj2).toEqual(old.adj2)
    const edited = recordFromDraft({ ...d, adjAmount: '70' }, old, [old])
    expect(edited.ok && edited.record.adj2.map((a) => [a.amount, a.note])).toEqual([[70, 'ドル円 +100：a / 直近の傾向 -40：b']])
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
    expect(d.morningAdjAmount).toBe('50')
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
    expect(previewPrediction('70050', '0', '50')).toBe(70100)
    expect(previewPrediction('', '0', '')).toBeNull()
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
    expect(draft.morningAdjAmount).toBe('50')
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

describe('restoreDraft（一時保存していた入力を読む）', () => {
  const fresh = newDraft(now, []).draft
  it('前の版の形（補正が配列）を、補正1件の形に直す', () => {
    const old = {
      ...fresh,
      futures: '70500',
      adjAmount: undefined,
      adjNote: undefined,
      adj2: [
        { id: 'a', kind: 'ドル円', amount: '50', note: 'メモ' },
        { id: 'b', kind: 'その他', amount: '-10', note: 'x' },
      ],
    }
    const d = restoreDraft(old, fresh)
    expect(d.futures).toBe('70500')
    expect([d.adjAmount, d.adjNote]).toEqual(['40', 'ドル円 +50：メモ / その他 -10：x'])
    expect(d.morningAdjAmount).toBe('')
  })
  it('欄が足りない・壊れた中身でも止まらない', () => {
    expect(restoreDraft({ futures: 1 }, fresh)).toEqual(fresh)
    expect(restoreDraft('x', fresh)).toEqual(fresh)
  })
})
