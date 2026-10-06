// 画面の入力（文字列）と保存する記録とを相互に変換する。入力のチェックもここで行う。
import type { Adjustment, PredictionRecord, Settings, VoteType } from '../types'
import { EVENT_NONE } from '../types'
import { defaultAdj1, round2, type Adj1Default } from '../calc/calc'
import { defaultTargetDate } from '../calc/dates'
import { newId } from '../id'
import { numToInput, parseNumber } from './parse'

export interface AdjustmentDraft {
  id: string
  kind: string
  amount: string
  note: string
}

export interface PredictionDraft {
  id?: string // 保存済みの記録を編集しているとき
  targetDate: string
  voteTime: string
  futures: string
  dow: string
  nasdaq: string
  usdjpy: string
  adj1: string
  adj2: AdjustmentDraft[]
  events: string[]
  voteType: VoteType
  morningFutures: string
  morningTime: string
  morningAdj1: string
  morningAdj2: AdjustmentDraft[]
}

// エラーは入力欄ごとのキーで持つ。補正②は `${下書きのid}.note` のような形。
export type DraftErrors = Record<string, string>

const adjToDraft = (a: Adjustment): AdjustmentDraft => ({ ...a, amount: numToInput(a.amount) })

export function newAdjustmentDraft(settings: Settings): AdjustmentDraft {
  return { id: newId(), kind: settings.adjustmentKinds[0] ?? 'その他', amount: '', note: '' }
}

export function newDraft(
  now: Date,
  records: PredictionRecord[],
  targetDate = defaultTargetDate(now),
): { draft: PredictionDraft; adj1Default: Adj1Default } {
  const adj1Default = defaultAdj1(records, targetDate)
  return {
    adj1Default,
    draft: {
      targetDate,
      voteTime: now.toISOString(),
      futures: '',
      dow: '',
      nasdaq: '',
      usdjpy: '',
      adj1: String(adj1Default.value),
      adj2: [],
      events: [],
      voteType: 'night',
      morningFutures: '',
      morningTime: '',
      morningAdj1: '',
      morningAdj2: [],
    },
  }
}

export function draftFromRecord(r: PredictionRecord): PredictionDraft {
  return {
    id: r.id,
    targetDate: r.targetDate,
    voteTime: r.voteTime ?? '',
    futures: numToInput(r.futuresAtVote),
    dow: numToInput(r.dowPct),
    nasdaq: numToInput(r.nasdaqPct),
    usdjpy: numToInput(r.usdjpyPct),
    adj1: numToInput(r.adj1),
    adj2: r.adj2.map(adjToDraft),
    events: [...r.eventsAfterSleep],
    voteType: r.morning ? 'morning' : 'night',
    morningFutures: numToInput(r.morning?.futures),
    morningTime: r.morning?.time ?? '',
    morningAdj1: numToInput(r.morning?.adj1),
    morningAdj2: r.morning?.adj2.map(adjToDraft) ?? [],
  }
}

// 「朝に修正」に切り替えたとき、夜の補正を写して朝の入力の出発点にする
export function startMorningFix(d: PredictionDraft, now: Date): PredictionDraft {
  if (d.morningTime) return { ...d, voteType: 'morning' }
  return {
    ...d,
    voteType: 'morning',
    morningTime: now.toISOString(),
    morningAdj1: d.adj1,
    morningAdj2: d.adj2.map((a) => ({ ...a, id: newId() })),
  }
}

// 「なし」と他の予定は同時に選べない
export function toggleEvent(events: string[], e: string): string[] {
  if (events.includes(e)) return events.filter((x) => x !== e)
  if (e === EVENT_NONE) return [EVENT_NONE]
  return [...events.filter((x) => x !== EVENT_NONE), e]
}

// 入力中の予想値。必要な欄が空か数字でなければ null。
export function previewPrediction(futures: string, adj1: string, adj2: AdjustmentDraft[]): number | null {
  const f = parseNumber(futures)
  const a1 = parseNumber(adj1) ?? 0
  const amounts = adj2.map((a) => parseNumber(a.amount) ?? 0)
  if (f == null || [f, a1, ...amounts].some(Number.isNaN)) return null
  return round2(f + a1 + amounts.reduce((s, x) => s + x, 0))
}

export function previewAdj2Sum(adj2: AdjustmentDraft[]): number | null {
  const amounts = adj2.map((a) => parseNumber(a.amount) ?? 0)
  return amounts.some(Number.isNaN) ? null : round2(amounts.reduce((s, x) => s + x, 0))
}

function readAdjustments(list: AdjustmentDraft[], errors: DraftErrors): Adjustment[] {
  return list.map((a) => {
    const amount = parseNumber(a.amount) ?? 0
    if (Number.isNaN(amount)) errors[`${a.id}.amount`] = '金額を数字で入力してください'
    else if (amount !== 0 && a.note.trim() === '')
      errors[`${a.id}.note`] = '金額が0以外のときは根拠を入力してください'
    return { id: a.id, kind: a.kind, amount: Number.isNaN(amount) ? 0 : amount, note: a.note.trim() }
  })
}

function readNumber(
  s: string,
  key: string,
  label: string,
  errors: DraftErrors,
  required = false,
): number | undefined {
  const v = parseNumber(s)
  if (v == null) {
    if (required) errors[key] = `${label}を入力してください`
    return undefined
  }
  if (Number.isNaN(v)) {
    errors[key] = `${label}を数字で入力してください`
    return undefined
  }
  return v
}

export type DraftResult = { ok: true; record: PredictionRecord } | { ok: false; errors: DraftErrors }

// base は編集前の記録。結果の欄など、この画面で扱わない項目を引き継ぐ。
export function recordFromDraft(
  d: PredictionDraft,
  base: PredictionRecord | undefined,
  others: PredictionRecord[],
): DraftResult {
  const errors: DraftErrors = {}
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.targetDate)) errors.targetDate = '対象日を入力してください'
  else if (others.some((r) => r.targetDate === d.targetDate && r.id !== d.id))
    errors.targetDate = 'この対象日の記録はすでにあります'

  // 予想値を直接持つ古い記録だけは先物なしで保存できる
  const futuresRequired = base?.directPrediction == null
  const futuresAtVote = readNumber(d.futures, 'futures', '先物（投票時）', errors, futuresRequired)
  const dowPct = readNumber(d.dow, 'dow', 'ダウ', errors)
  const nasdaqPct = readNumber(d.nasdaq, 'nasdaq', 'ナスダック', errors)
  const usdjpyPct = readNumber(d.usdjpy, 'usdjpy', 'ドル円', errors)
  const adj1 = readNumber(d.adj1, 'adj1', '補正①', errors) ?? 0
  const adj2 = readAdjustments(d.adj2, errors)

  let morning: PredictionRecord['morning']
  if (d.voteType === 'morning') {
    const futures = readNumber(d.morningFutures, 'morningFutures', '先物（修正時）', errors, true)
    const mAdj1 = readNumber(d.morningAdj1, 'morningAdj1', '補正①', errors) ?? 0
    const mAdj2 = readAdjustments(d.morningAdj2, errors)
    if (futures != null)
      morning = { futures, time: d.morningTime || new Date().toISOString(), adj1: mAdj1, adj2: mAdj2 }
  }

  if (Object.keys(errors).length) return { ok: false, errors }

  const record: PredictionRecord = {
    review: '',
    aiNotes: '',
    ...base,
    id: d.id ?? base?.id ?? newId(),
    targetDate: d.targetDate,
    voteTime: d.voteTime || undefined,
    futuresAtVote,
    dowPct,
    nasdaqPct,
    usdjpyPct,
    adj1,
    adj2,
    eventsAfterSleep: d.events,
    morning,
    updatedAt: new Date().toISOString(),
  }
  return { ok: true, record }
}

// ---- 結果の入力 ----

export interface ResultDraft {
  futuresNextMorning: string
  open: string
  close: string
  futuresAtClose: string
  rank: string
  total: string
  review: string
  aiNotes: string
}

// 朝に修正した日は、修正時に入れた先物を「先物（翌朝）」の初期値にする
export function resultDraftFromRecord(r: PredictionRecord): ResultDraft {
  return {
    futuresNextMorning: numToInput(r.futuresNextMorning ?? r.morning?.futures),
    open: numToInput(r.open),
    close: numToInput(r.close),
    futuresAtClose: numToInput(r.futuresAtClose),
    rank: numToInput(r.rank?.rank),
    total: numToInput(r.rank?.total),
    review: r.review,
    aiNotes: r.aiNotes,
  }
}

export function applyResultDraft(d: ResultDraft, r: PredictionRecord): DraftResult {
  const errors: DraftErrors = {}
  const futuresNextMorning = readNumber(d.futuresNextMorning, 'futuresNextMorning', '先物（翌朝）', errors)
  const open = readNumber(d.open, 'open', '始値', errors)
  const close = readNumber(d.close, 'close', '終値', errors)
  const futuresAtClose = readNumber(d.futuresAtClose, 'futuresAtClose', '終値が出た頃の先物', errors)
  const rank = readNumber(d.rank, 'rank', '順位', errors)
  const total = readNumber(d.total, 'total', '参加人数', errors)
  if ((rank == null) !== (total == null) && !errors.rank && !errors.total)
    errors.rank = '順位と参加人数は両方入力してください'
  if (Object.keys(errors).length) return { ok: false, errors }
  return {
    ok: true,
    record: {
      ...r,
      futuresNextMorning,
      open,
      close,
      futuresAtClose,
      rank: rank != null && total != null ? { rank, total } : undefined,
      review: d.review.trim(),
      aiNotes: d.aiNotes.trim(),
      updatedAt: new Date().toISOString(),
    },
  }
}
