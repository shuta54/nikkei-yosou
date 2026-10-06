import type { PredictionRecord } from '../types'
import { VOTE_TYPE_LABEL } from '../types'
import { compute, finalInputs } from './calc'
import { formatDateSlash, formatDateTime } from './dates'

export const TSV_COLUMNS = [
  '日付（対象日）',
  '投票時刻',
  '先物（投票時）',
  'ダウ',
  'ナスダック',
  'ドル円',
  '補正①',
  '補正②の合計',
  '補正②の理由',
  '予想値',
  '寝た後の予定',
  '先物（翌朝）',
  '始値',
  '終値',
  '順位',
  '予想誤差',
  '先物のみの誤差',
  '補正の効果',
  '夜間の動き',
  '寄り付きの差',
  '日中の動き',
  '振り返り・感想',
  'AIによる改善点',
  '投票区分',
  '夜の予想値',
] as const

const num = (x: number | null | undefined): string => (x == null ? '' : String(x))

export const signed = (x: number): string => (x > 0 ? `+${x}` : String(x))

// タブと改行はセルの区切りになってしまうので空白に置き換える
const text = (s: string): string => s.replace(/[\t\r\n]+/g, ' ').trim()

// 予想値と同じく、朝に修正した日は朝の先物・補正を出す。夜の予想値は末尾の列に出す。
export function recordToRow(r: PredictionRecord): string[] {
  const c = compute(r)
  const fin = finalInputs(r)
  const voteTime = r.morning ? r.morning.time : r.voteTime
  return [
    formatDateSlash(r.targetDate),
    voteTime ? formatDateTime(voteTime) : '',
    num(fin.futures),
    num(r.dowPct),
    num(r.nasdaqPct),
    num(r.usdjpyPct),
    num(fin.adj1),
    num(c.adj2Sum),
    fin.adj2.map((a) => `${a.kind} ${signed(a.amount)}：${a.note}`).join(' / '),
    num(c.prediction),
    r.eventsAfterSleep.join('、'),
    num(r.futuresNextMorning),
    num(r.open),
    num(r.close),
    r.rank ? `${r.rank.rank}/${r.rank.total}` : '',
    num(c.error),
    num(c.futuresOnlyError),
    num(c.correctionEffect),
    num(c.overnightMove),
    num(c.openingGap),
    num(c.intradayMove),
    r.review,
    r.aiNotes,
    VOTE_TYPE_LABEL[c.voteType],
    num(c.nightPrediction),
  ].map(text)
}

// スプレッドシートに貼るときは古い順のほうが扱いやすい
export function buildTsv(records: PredictionRecord[]): string {
  const rows = [...records]
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate))
    .map(recordToRow)
  return [[...TSV_COLUMNS], ...rows].map((r) => r.join('\t')).join('\n')
}
