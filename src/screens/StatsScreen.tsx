import { computeStats, FEW_RECORDS_THRESHOLD, type ErrorSummary, type MeanSummary, type SplitBias } from '../calc/stats'
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

// 前日比がプラスの日とマイナスの日で、先物のみの誤差の符号つき平均を比べる
function BiasCard({ title, label, s }: { title: string; label: string; s: SplitBias }) {
  const rows = [
    { name: `${label}がプラスの日`, m: s.up },
    { name: `${label}がマイナスの日`, m: s.down },
  ]
  return (
    <div className="card">
      <div className="card-head">
        <h3>{title}</h3>
        <Few n={Math.min(s.up.n, s.down.n)} />
      </div>
      <p className="muted small">終値 − 先物（投票時）の符号つき平均。プラスなら先物より終値が高くなりがち</p>
      {rows.map((r) => (
        <Row key={r.name} label={`${r.name}（${r.m.n}件）`} value={r.m.mean == null ? fmt(null) : `${fmtSigned(r.m.mean)}円`} strong />
      ))}
    </div>
  )
}

export function StatsScreen({ records, settings, onSettingsChange, onImported }: Props) {
  const s = computeStats(records)
  const moves = [
    { label: '夜間の動き', s: s.overnightAbs },
    { label: '寄り付きの差', s: s.openingGapAbs },
    { label: '日中の動き', s: s.intradayAbs },
  ]
  return (
    <div className="screen">
      <h1>検証</h1>

      <ErrorCard title="予想誤差" s={s.final} />
      <div className="card">
        <div className="card-head">
          <h3>補正した日</h3>
          <Few n={s.adjusted.n} />
        </div>
        <p className="muted small">補正を0以外にした日の集計。補正の効果は、補正を外した場合と比べて誤差が何円縮んだか</p>
        <Row label="補正の効果の平均" value={s.adjusted.meanEffect == null ? fmt(null) : `${fmtSigned(s.adjusted.meanEffect)}円`} strong />
        <Row label="誤差を縮めた回数の割合" value={fmtPct(s.adjusted.shrinkRate)} strong />
        <Row label="回数" value={`${s.adjusted.n}回`} />
      </div>

      <details className="box more">
        <summary>詳しく見る（ほかの集計・設定・データ）</summary>
        <ErrorCard title="予想誤差（夜に投票した日）" s={s.finalNight} />
        <ErrorCard title="予想誤差（朝に修正した日）" s={s.finalMorning} />
        <ErrorCard title="夜の予想の誤差" s={s.nightPrediction} note="全記録が対象。朝に修正した日も夜の予想値で計算" />
        <MeanCard
          title="朝の修正で縮まった額"
          s={s.morningImprovement}
          label="平均"
          note="朝に修正した日の |夜の予想の誤差| − |朝の予想の誤差|。プラスなら修正で近づいた"
        />
        <MeanCard title="補正の効果（全記録）" s={s.correctionEffect} label="平均" note="|先物のみの誤差| − |予想誤差|。先物と日経平均の差の分も含む。プラスなら先物より近づいた" />
        <MeanCard
          title="先物のみの誤差"
          s={s.futuresOnlyBias}
          label="符号つきの平均"
          note="終値 − 先物（投票時）。プラスに寄っていれば、先物より終値が高くなりがち"
        />

        <BiasCard title="ドル円の前日比で分けた先物のみの誤差" label="ドル円" s={s.biasByUsdjpy} />
        <BiasCard title="ダウの前日比で分けた先物のみの誤差" label="ダウ" s={s.biasByDow} />

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
      </details>
    </div>
  )
}
