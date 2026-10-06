import { compute, missingResults } from '../calc/calc'
import { formatDateJa } from '../calc/dates'
import type { PredictionRecord } from '../types'
import { fmt, fmtSigned } from '../ui/format'

interface Props {
  records: PredictionRecord[] // 新しい順
  onOpen: (id: string) => void
}

export function HistoryScreen({ records, onOpen }: Props) {
  return (
    <div className="screen">
      <h1>履歴</h1>
      {records.length === 0 && <p className="muted">まだ記録がありません。検証タブの「詳しく見る」→「設定とデータ」から JSON を読み込めます。</p>}
      <ul className="history">
        {records.map((r) => {
          const c = compute(r)
          const hit = c.error != null && Math.abs(c.error) <= 100
          return (
            <li key={r.id}>
              <button type="button" onClick={() => onOpen(r.id)}>
                <div className="h-top">
                  <span className="h-date">{formatDateJa(r.targetDate)}</span>
                  {c.voteType === 'morning' && <span className="tag">朝に修正</span>}
                  {missingResults(r).length > 0 && <span className="tag warn">{missingResults(r).join('・')}が未入力</span>}
                  {hit && <span className="tag good">±100円以内</span>}
                </div>
                <div className="h-grid">
                  <span>予想値</span>
                  <span>終値</span>
                  <span>予想誤差</span>
                  <span>補正の効果</span>
                  <b>{fmt(c.prediction)}</b>
                  <b>{fmt(r.close)}</b>
                  <b>{fmtSigned(c.error)}</b>
                  <b className={c.correctionEffect == null ? '' : c.correctionEffect > 0 ? 'pos' : c.correctionEffect < 0 ? 'neg' : ''}>
                    {fmtSigned(c.correctionEffect)}
                  </b>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
