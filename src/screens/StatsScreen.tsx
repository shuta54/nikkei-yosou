import { computeStats, FEW_RECORDS_THRESHOLD, type ErrorSummary, type MeanSummary } from '../calc/stats'
import type { PredictionRecord, Settings } from '../types'
import { fmt, fmtPct, fmtSigned } from '../ui/format'
import { Row } from './ResultScreen'
import { DataSection } from './DataSection'

interface Props {
  records: PredictionRecord[]
  settings: Settings
  onSettingsChange: (s: Settings) => Promise<void>
  onImported: () => Promise<void>
}

function Few({ n }: { n: number }) {
  if (n >= FEW_RECORDS_THRESHOLD) return null
  return <span className="few">件数が少ないため参考値</span>
}

function ErrorCard({ title, s, note }: { title: string; s: ErrorSummary; note?: string }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>{title}</h3>
        <Few n={s.n} />
      </div>
      {note && <p className="muted small">{note}</p>}
      <Row label="誤差の絶対値の平均" value={s.meanAbs == null ? fmt(null) : `${fmt(s.meanAbs)}円`} strong />
      <Row label="±100円以内に入った割合" value={fmtPct(s.within100Rate)} strong />
      <Row label="件数" value={`${s.n}件`} />
    </div>
  )
}

function MeanCard({ title, s, label, note, signed = true }: { title: string; s: MeanSummary; label: string; note?: string; signed?: boolean }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>{title}</h3>
        <Few n={s.n} />
      </div>
      {note && <p className="muted small">{note}</p>}
      <Row label={label} value={s.mean == null ? fmt(null) : `${signed ? fmtSigned(s.mean) : fmt(s.mean)}円`} strong />
      <Row label="件数" value={`${s.n}件`} />
    </div>
  )
}

export function StatsScreen({ records, settings, onSettingsChange, onImported }: Props) {
  const s = computeStats(records, settings.adjustmentKinds)
  const moves = [
    { label: '夜間の動き', s: s.overnightAbs },
    { label: '寄り付きの差', s: s.openingGapAbs },
    { label: '日中の動き', s: s.intradayAbs },
  ]
  return (
    <div className="screen">
      <h1>検証</h1>

      <ErrorCard title="最終的に投票した予想の誤差" s={s.final} />
      <ErrorCard title="同・夜に投票した日" s={s.finalNight} />
      <ErrorCard title="同・朝に修正した日" s={s.finalMorning} />
      <ErrorCard title="夜の予想の誤差" s={s.nightPrediction} note="全記録が対象。朝に修正した日も夜の予想値で計算" />
      <MeanCard
        title="朝の修正で縮まった額"
        s={s.morningImprovement}
        label="平均"
        note="朝に修正した日の |夜の予想の誤差| − |朝の予想の誤差|。プラスなら修正で近づいた"
      />
      <MeanCard title="補正の効果" s={s.correctionEffect} label="平均" note="プラスなら補正で近づいた。マイナスなら補正しないほうが近かった" />

      <div className="card">
        <div className="card-head">
          <h3>補正②の理由の種類ごと</h3>
          <Few n={Math.min(...s.byKind.map((k) => k.n), Infinity)} />
        </div>
        <table className="kinds">
          <thead>
            <tr>
              <th>種類</th>
              <th>回数</th>
              <th>平均の効果</th>
              <th>縮めた割合</th>
            </tr>
          </thead>
          <tbody>
            {s.byKind.map((k) => (
              <tr key={k.kind}>
                <td>{k.kind}</td>
                <td className="num">{k.n}</td>
                <td className="num">{fmtSigned(k.meanEffect)}</td>
                <td className="num">{fmtPct(k.shrinkRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">結果が出ていて金額が0以外の補正だけを数えています</p>
      </div>

      <MeanCard
        title="先物のみの誤差"
        s={s.futuresOnlyBias}
        label="符号つきの平均"
        note="終値 − 先物（投票時）。プラスに寄っていれば、先物より終値が高くなりがち"
      />

      <div className="card">
        <div className="card-head">
          <h3>値動きの大きさ（絶対値の平均）</h3>
          <Few n={Math.min(...moves.map((m) => m.s.n))} />
        </div>
        {moves.map((m) => (
          <Row key={m.label} label={`${m.label}（${m.s.n}件）`} value={m.s.mean == null ? fmt(null) : `${fmt(m.s.mean)}円`} />
        ))}
      </div>

      <DataSection settings={settings} onSettingsChange={onSettingsChange} onImported={onImported} recordCount={records.length} />
    </div>
  )
}
