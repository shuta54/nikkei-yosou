// 画面の入力（文字列）と保存する記録とを相互に変換する。入力のチェックもここで行う。
import type { Adjustment, PredictionRecord, VoteType } from '../types'
import { EVENT_NONE } from '../types'
import { defaultAdj1, mergeAdjustments, round2, type Adj1Default } from '../calc/calc'
import { defaultTargetDate, isAfterClose, toISODate } from '../calc/dates'
import { newId } from '../id'
import { numToInput, parseNumber } from './parse'

export interface PredictionDraft {
  id?: string // 保存済みの記録を編集しているとき
  targetDate: string
  voteTime: string
  futures: string
  dow: string
  nasdaq: string
  usdjpy: string
  adj1: string // 先物と日経平均の差（旧補正①）
  adjAmount: string // 補正（旧補正②）。1件だけ
  adjNote: string
  events: string[]
  voteType: VoteType
  morningFutures: string
  morningTime: string
  morningAdj1: string
  morningAdjAmount: string
  morningAdjNote: string
}

// エラーは入力欄ごとのキーで持つ（futures、adjNote など）
export type DraftErrors = Record<string, string>

// 補正の配列を、1件の入力欄（金額とメモ）に直す
function adjToInputs(adj: Adjustment[]): { amount: string; note: string } {
  const m = mergeAdjustments(adj)
  return { amount: m.amount === 0 ? '' : String(m.amount), note: m.note }
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
      adjAmount: '',
      adjNote: '',
      events: [],
      voteType: 'night',
      morningFutures: '',
      morningTime: '',
      morningAdj1: '',
      morningAdjAmount: '',
      morningAdjNote: '',
    },
  }
}

export function draftFromRecord(r: PredictionRecord): PredictionDraft {
  const night = adjToInputs(r.adj2)
  const morning = adjToInputs(r.morning?.adj2 ?? [])
  return {
    id: r.id,
    targetDate: r.targetDate,
    voteTime: r.voteTime ?? '',
    futures: numToInput(r.futuresAtVote),
    dow: numToInput(r.dowPct),
    nasdaq: numToInput(r.nasdaqPct),
    usdjpy: numToInput(r.usdjpyPct),
    adj1: numToInput(r.adj1),
    adjAmount: night.amount,
    adjNote: night.note,
    events: [...r.eventsAfterSleep],
    voteType: r.morning ? 'morning' : 'night',
    morningFutures: numToInput(r.morning?.futures),
    morningTime: r.morning?.time ?? '',
    morningAdj1: numToInput(r.morning?.adj1),
    morningAdjAmount: morning.amount,
    morningAdjNote: morning.note,
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
    morningAdjAmount: d.adjAmount,
    morningAdjNote: d.adjNote,
  }
}

// 「今夜の予想」を開いたときの下書き。投票区分は選ばせず、ここで決める。
// - 対象日の記録がなければ、夜の新しい予想
// - 対象日の記録があり、当日の朝（15:30より前）に開いたなら「朝に修正」
// - それ以外は保存済みの記録の続き（朝に修正済みならそのまま）
export function tonightDraft(
  records: PredictionRecord[],
  now: Date,
): { draft: PredictionDraft; adj1Default: Adj1Default | null } {
  const target = defaultTargetDate(now)
  const existing = records.find((r) => r.targetDate === target)
  if (!existing) return newDraft(now, records, target)
  const draft = draftFromRecord(existing)
  const morningOfTarget = target === toISODate(now) && !isAfterClose(now)
  return { draft: morningOfTarget ? startMorningFix(draft, now) : draft, adj1Default: null }
}

// 「なし」と他の予定は同時に選べない
export function toggleEvent(events: string[], e: string): string[] {
  if (events.includes(e)) return events.filter((x) => x !== e)
  if (e === EVENT_NONE) return [EVENT_NONE]
  return [...events.filter((x) => x !== EVENT_NONE), e]
}

// 入力中の予想値。必要な欄が空か数字でなければ null。
export function previewPrediction(futures: string, adj1: string, adjAmount: string): number | null {
  const f = parseNumber(futures)
  const a1 = parseNumber(adj1) ?? 0
  const a2 = parseNumber(adjAmount) ?? 0
  if (f == null || [f, a1, a2].some(Number.isNaN)) return null
  return round2(f + a1 + a2)
}

// 補正の金額が0以外か（メモ欄を出すかどうか）
export function hasAdjustment(adjAmount: string): boolean {
  const v = parseNumber(adjAmount)
  return v != null && !Number.isNaN(v) && v !== 0
}

// 補正の入力欄を配列に直す。中身が保存済みのものと同じなら、保存済みの配列をそのまま返す
// （複数件ある古い記録は、編集しない限り元の形で残す）。
function readAdjustment(
  amountStr: string,
  noteStr: string,
  key: 'adj' | 'morningAdj',
  saved: Adjustment[],
  errors: DraftErrors,
): Adjustment[] {
  const parsed = parseNumber(amountStr) ?? 0
  if (Number.isNaN(parsed)) {
    errors[`${key}Amount`] = '補正の金額を数字で入力してください'
    return []
  }
  const note = parsed === 0 ? '' : noteStr.trim()
  if (parsed !== 0 && note === '') {
    errors[`${key}Note`] = '補正が0以外のときはメモを入力してください'
    return []
  }
  const m = mergeAdjustments(saved)
  if (m.amount === parsed && (parsed === 0 || m.note === note)) return saved
  if (parsed === 0) return []
  return [{ id: newId(), kind: '', amount: parsed, note }]
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
  const adj2 = readAdjustment(d.adjAmount, d.adjNote, 'adj', base?.adj2 ?? [], errors)

  let morning: PredictionRecord['morning']
  if (d.voteType === 'morning') {
    const futures = readNumber(d.morningFutures, 'morningFutures', '先物（修正時）', errors, true)
    const mAdj1 = readNumber(d.morningAdj1, 'morningAdj1', '補正①', errors) ?? 0
    const mAdj2 = readAdjustment(d.morningAdjAmount, d.morningAdjNote, 'morningAdj', base?.morning?.adj2 ?? [], errors)
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
