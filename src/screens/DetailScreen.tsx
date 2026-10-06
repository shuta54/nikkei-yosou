import { useState } from 'react'
import { compute, finalInputs, missingResults } from '../calc/calc'
import { formatDateJa, formatDateTime } from '../calc/dates'
import type { Adjustment, PredictionRecord } from '../types'
import { VOTE_TYPE_LABEL } from '../types'
import { fmt, fmtSigned, EMPTY } from '../ui/format'
import { Row } from './ResultScreen'

interface Props {
  record: PredictionRecord
  onBack: () => void
  onEditPrediction: () => void
  onEditResult: () => void
  onDelete: () => Promise<void>
}

const pct = (x: number | undefined) => (x == null ? EMPTY : `${fmtSigned(x)}%`)

function AdjList({ items, effects }: { items: Adjustment[]; effects?: (number | null)[] }) {
  if (!items.length) return <p className="muted small">補正②はありません</p>
  return (
    <ul className="adj-list">
      {items.map((a, i) => (
        <li key={a.id}>
          <div className="row">
            <span>
              <span className="tag">{a.kind}</span> {fmtSigned(a.amount)}円
            </span>
            {effects && <span className="num">効果 {fmtSigned(effects[i])}</span>}
          </div>
          {a.note && <p className="note">{a.note}</p>}
        </li>
      ))}
    </ul>
  )
}

export function DetailScreen({ record: r, onBack, onEditPrediction, onEditResult, onDelete }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const c = compute(r)
  const fin = finalInputs(r)

  return (
    <div className="screen">
      <button type="button" className="back" onClick={onBack}>
        ‹ 履歴
      </button>
      <div className="title-row">
        <h1>{formatDateJa(r.targetDate)}</h1>
        <span className="tag">{VOTE_TYPE_LABEL[c.voteType]}</span>
      </div>

      {missingResults(r).length > 0 && (
        <button type="button" className="primary wide result-cta" onClick={onEditResult}>
          結果を入力する（{missingResults(r).join('・')}が未入力）
        </button>
      )}

      <div className="calc-box">
        <Row label="予想値" value={fmt(c.prediction)} strong />
        <Row label="終値" value={fmt(r.close)} strong />
        <Row label="予想誤差" value={fmtSigned(c.error)} strong />
        <Row label="先物のみの誤差" value={fmtSigned(c.futuresOnlyError)} />
        <Row label="補正の効果" value={fmtSigned(c.correctionEffect)} />
        {c.voteType === 'morning' && (
          <>
            <Row label="夜の予想値" value={fmt(c.nightPrediction)} />
            <Row label="夜の予想の誤差" value={fmtSigned(c.nightError)} />
            <Row label="朝の修正で縮まった額" value={fmtSigned(c.morningImprovement)} />
          </>
        )}
        <Row label="夜間の動き" value={fmtSigned(c.overnightMove)} />
        <Row label="寄り付きの差" value={fmtSigned(c.openingGap)} />
        <Row label="日中の動き" value={fmtSigned(c.intradayMove)} />
        <Row label="順位" value={r.rank ? `${r.rank.rank}/${r.rank.total}` : EMPTY} />
      </div>

      <h2>予想の内訳{c.voteType === 'morning' && '（朝に修正）'}</h2>
      <div className="calc-box">
        {r.directPrediction != null && r.futuresAtVote == null && <p className="muted small">この記録は先物の記録がなく、予想値だけを持っています</p>}
        <Row label={c.voteType === 'morning' ? '先物（修正時）' : '先物（投票時）'} value={fmt(fin.futures)} />
        <Row label="補正①" value={fmtSigned(fin.adj1)} />
        <Row label="補正②の合計" value={fmtSigned(c.adj2Sum)} />
        <Row label="投票時刻" value={r.morning ? formatDateTime(r.morning.time) : r.voteTime ? formatDateTime(r.voteTime) : EMPTY} />
      </div>
      <AdjList items={fin.adj2} effects={c.adjustmentEffects.map((e) => e.effect)} />

      {r.morning && (
        <>
          <h2>夜の予想</h2>
          <div className="calc-box">
            <Row label="先物（投票時）" value={fmt(r.futuresAtVote)} />
            <Row label="補正①" value={fmtSigned(r.adj1)} />
            <Row label="投票時刻" value={r.voteTime ? formatDateTime(r.voteTime) : EMPTY} />
          </div>
          <AdjList items={r.adj2} />
        </>
      )}

      <h2>投票時の状況</h2>
      <div className="calc-box">
        <Row label="ダウ" value={pct(r.dowPct)} />
        <Row label="ナスダック" value={pct(r.nasdaqPct)} />
        <Row label="ドル円" value={pct(r.usdjpyPct)} />
        <Row label="寝た後の予定" value={r.eventsAfterSleep.join('、') || EMPTY} />
      </div>

      <h2>結果</h2>
      <div className="calc-box">
        <Row label="先物（翌朝）" value={fmt(r.futuresNextMorning)} />
        <Row label="始値" value={fmt(r.open)} />
        <Row label="終値が出た頃の先物" value={fmt(r.futuresAtClose)} />
      </div>
      <h2>振り返り・感想</h2>
      <p className="note">{r.review || EMPTY}</p>
      <h2>AIによる改善点</h2>
      <p className="note">{r.aiNotes || EMPTY}</p>

      <div className="actions">
        <button type="button" className="secondary" onClick={onEditPrediction}>
          予想を編集
        </button>
        <button type="button" className="secondary" onClick={onEditResult}>
          結果を編集
        </button>
      </div>
      <div className="actions">
        {confirmDelete ? (
          <>
            <button type="button" className="danger-btn" onClick={onDelete}>
              本当に削除する
            </button>
            <button type="button" className="secondary" onClick={() => setConfirmDelete(false)}>
              やめる
            </button>
          </>
        ) : (
          <button type="button" className="text-btn danger" onClick={() => setConfirmDelete(true)}>
            この記録を削除
          </button>
        )}
      </div>
    </div>
  )
}
