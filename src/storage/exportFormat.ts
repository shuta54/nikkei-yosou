import type { Adjustment, PredictionRecord, Settings } from '../types'
import { normalizeSettings } from '../types'
import { newId } from '../id'

// 書き出し・読み込みに使う JSON の形。形を変えるときは version を上げる。
export const EXPORT_APP = 'nikkei-yosou'
export const EXPORT_VERSION = 1

export interface ExportData {
  app: typeof EXPORT_APP
  version: number
  exportedAt: string
  records: PredictionRecord[]
  settings: Settings
}

export class ImportError extends Error {}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null

function optNum(o: Record<string, unknown>, key: string, where: string): number | undefined {
  const v = o[key]
  if (v == null) return undefined
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ImportError(`${where}の「${key}」が数字ではありません`)
  return v
}

function parseAdjustments(x: unknown, where: string): Adjustment[] {
  if (x == null) return []
  if (!Array.isArray(x)) throw new ImportError(`${where}の補正②の形が正しくありません`)
  return x.map((a) => {
    if (!isObj(a) || typeof a.amount !== 'number') throw new ImportError(`${where}の補正②の形が正しくありません`)
    return {
      id: typeof a.id === 'string' ? a.id : newId(),
      kind: typeof a.kind === 'string' ? a.kind : 'その他',
      amount: a.amount,
      note: typeof a.note === 'string' ? a.note : '',
    }
  })
}

function parseRecord(x: unknown, i: number): PredictionRecord {
  const where = `${i + 1}件目の記録`
  if (!isObj(x)) throw new ImportError(`${where}の形が正しくありません`)
  if (typeof x.targetDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.targetDate))
    throw new ImportError(`${where}の対象日が正しくありません`)
  const where2 = `${x.targetDate}の記録`
  let morning: PredictionRecord['morning']
  if (x.morning != null) {
    const m = x.morning
    if (!isObj(m) || typeof m.futures !== 'number') throw new ImportError(`${where2}の朝の修正の形が正しくありません`)
    morning = {
      futures: m.futures,
      time: typeof m.time === 'string' ? m.time : new Date().toISOString(),
      adj1: typeof m.adj1 === 'number' ? m.adj1 : 0,
      adj2: parseAdjustments(m.adj2, where2),
    }
  }
  let rank: PredictionRecord['rank']
  if (x.rank != null) {
    const r = x.rank
    if (!isObj(r) || typeof r.rank !== 'number' || typeof r.total !== 'number')
      throw new ImportError(`${where2}の順位の形が正しくありません`)
    rank = { rank: r.rank, total: r.total }
  }
  const record: PredictionRecord = {
    id: typeof x.id === 'string' ? x.id : newId(),
    targetDate: x.targetDate,
    voteTime: typeof x.voteTime === 'string' ? x.voteTime : undefined,
    futuresAtVote: optNum(x, 'futuresAtVote', where2),
    directPrediction: optNum(x, 'directPrediction', where2),
    dowPct: optNum(x, 'dowPct', where2),
    nasdaqPct: optNum(x, 'nasdaqPct', where2),
    usdjpyPct: optNum(x, 'usdjpyPct', where2),
    adj1: optNum(x, 'adj1', where2) ?? 0,
    adj2: parseAdjustments(x.adj2, where2),
    eventsAfterSleep: Array.isArray(x.eventsAfterSleep) ? x.eventsAfterSleep.filter((e) => typeof e === 'string') : [],
    morning,
    futuresNextMorning: optNum(x, 'futuresNextMorning', where2),
    open: optNum(x, 'open', where2),
    close: optNum(x, 'close', where2),
    futuresAtClose: optNum(x, 'futuresAtClose', where2),
    rank,
    review: typeof x.review === 'string' ? x.review : '',
    aiNotes: typeof x.aiNotes === 'string' ? x.aiNotes : '',
    updatedAt: typeof x.updatedAt === 'string' ? x.updatedAt : new Date().toISOString(),
  }
  if (record.futuresAtVote == null && record.directPrediction == null)
    throw new ImportError(`${where2}に先物（投票時）も予想値もありません`)
  return record
}

export function parseExportData(json: unknown): ExportData {
  if (!isObj(json) || json.app !== EXPORT_APP) throw new ImportError('このアプリで書き出したファイルではありません')
  if (typeof json.version !== 'number' || json.version > EXPORT_VERSION)
    throw new ImportError('新しい版のアプリで書き出したファイルのため読み込めません')
  if (!Array.isArray(json.records)) throw new ImportError('記録が見つかりません')
  const records = json.records.map(parseRecord)
  const dates = new Set<string>()
  for (const r of records) {
    if (dates.has(r.targetDate)) throw new ImportError(`対象日 ${r.targetDate} の記録が2件あります`)
    dates.add(r.targetDate)
  }
  const settings: Settings = normalizeSettings(json.settings)
  return {
    app: EXPORT_APP,
    version: EXPORT_VERSION,
    exportedAt: typeof json.exportedAt === 'string' ? json.exportedAt : '',
    records,
    settings,
  }
}
