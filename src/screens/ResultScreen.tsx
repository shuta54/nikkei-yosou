import { useEffect, useState } from 'react'
import { compute } from '../calc/calc'
import { formatDateJa } from '../calc/dates'
import { applyResultDraft, resultDraftFromRecord, type DraftErrors, type ResultDraft } from '../form/draft'
import { parseNumber } from '../form/parse'
import type { PredictionRecord } from '../types'
import { NumberField } from '../ui/NumberField'
import { fmt, fmtSigned, scrollToFirstError } from '../ui/format'
import { clearCached, loadCached, saveCached } from '../ui/draftCache'
import { VoteLink } from '../ui/LinkButton'
import type { Links } from '../types'

interface Props {
  record: PredictionRecord
  links: Links
  onSave: (r: PredictionRecord) => Promise<void>
  onBack: () => void
}

// 入力中の値で計算し直すための仮の記録。読めない欄は未入力として扱う。
function previewRecord(r: PredictionRecord, d: ResultDraft): PredictionRecord {
  const n = (s: string) => {
    const v = parseNumber(s)
    return v == null || Number.isNaN(v) ? undefined : v
  }
  return { ...r, futuresNextMorning: n(d.futuresNextMorning), open: n(d.open), close: n(d.close), futuresAtClose: n(d.futuresAtClose) }
}

export function ResultScreen({ record, links, onSave, onBack }: Props) {
  const cacheKey = `nikkei-yosou:result-draft:${record.id}`
  const [draft, setDraft] = useState<ResultDraft>(() => loadCached<ResultDraft>(cacheKey) ?? resultDraftFromRecord(record))
  useEffect(() => saveCached(cacheKey, draft), [cacheKey, draft])
  const [errors, setErrors] = useState<DraftErrors>({})
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<ResultDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const c = compute(previewRecord(record, draft))
  const prefilledFromMorning = record.futuresNextMorning == null && record.morning != null

  const save = async () => {
    const res = applyResultDraft(draft, record)
    if (!res.ok) {
      setErrors(res.errors)
      scrollToFirstError()
      return
    }
    setSaving(true)
    try {
      clearCached(cacheKey)
      await onSave(res.record)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="screen with-footer">
      <button type="button" className="back" onClick={onBack}>
        ‹ 戻る
      </button>
      <div className="title-row">
        <h1>{formatDateJa(record.targetDate)}の結果</h1>
        <span className="muted">予想値 {fmt(c.prediction)}</span>
      </div>

      <NumberField
        label="先物（翌朝の夜間取引の終値）"
        value={draft.futuresNextMorning}
        onChange={(v) => set({ futuresNextMorning: v })}
        error={errors.futuresNextMorning}
        link={links.futures}
        hint={prefilledFromMorning ? '朝に修正したときの先物を入れています' : undefined}
        suffix="円"
      />
      <NumberField label="始値" value={draft.open} onChange={(v) => set({ open: v })} error={errors.open} suffix="円" />
      <NumberField label="終値" value={draft.close} onChange={(v) => set({ close: v })} error={errors.close} large suffix="円" />
      <NumberField
        label="終値が出た頃の先物（任意）"
        value={draft.futuresAtClose}
        onChange={(v) => set({ futuresAtClose: v })}
        error={errors.futuresAtClose}
        hint={c.adj1Suggestion != null ? `次回の補正①の初期値：${fmtSigned(Math.round(c.adj1Suggestion))}（終値 − この値 ＝ ${fmtSigned(c.adj1Suggestion)}）` : undefined}
        suffix="円"
      />
      <div className={`field${errors.rank ? ' has-error' : ''}`}>
        <div className="label-row">
          <label>順位</label>
          <VoteLink href={links.vote} />
        </div>
        <div className="input-row">
          <input type="text" inputMode="numeric" placeholder="順位" value={draft.rank} onChange={(e) => set({ rank: e.target.value })} aria-label="順位" />
          <span className="suffix">位 /</span>
          <input type="text" inputMode="numeric" placeholder="人数" value={draft.total} onChange={(e) => set({ total: e.target.value })} aria-label="参加人数" />
          <span className="suffix">人</span>
        </div>
        {(errors.rank || errors.total) && <p className="error">{errors.rank || errors.total}</p>}
      </div>

      <div className="calc-box">
        <Row label="予想誤差" value={fmtSigned(c.error)} strong />
        {c.voteType === 'morning' && <Row label="夜の予想の誤差" value={fmtSigned(c.nightError)} />}
        <Row label="先物のみの誤差" value={fmtSigned(c.futuresOnlyError)} />
        <Row label="補正の効果" value={fmtSigned(c.correctionEffect)} />
        <Row label="夜間の動き" value={fmtSigned(c.overnightMove)} />
        <Row label="寄り付きの差" value={fmtSigned(c.openingGap)} />
        <Row label="日中の動き" value={fmtSigned(c.intradayMove)} />
      </div>

      <div className="field">
        <label>振り返り・感想</label>
        <textarea rows={4} value={draft.review} onChange={(e) => set({ review: e.target.value })} />
      </div>
      <div className="field">
        <label>AIによる改善点</label>
        <textarea rows={4} value={draft.aiNotes} onChange={(e) => set({ aiNotes: e.target.value })} placeholder="後から貼り付けられます" />
      </div>

      <div className="footer-bar">
        <div className="preview">
          <div className="preview-label">予想誤差</div>
          <div className="preview-value">{fmtSigned(c.error)}</div>
          <div className="preview-sub">
            {c.error != null ? (Math.abs(c.error) <= 100 ? '±100円以内' : '±100円の外') : '終値を入れると出ます'}
          </div>
        </div>
        <button type="button" className="primary" onClick={save} disabled={saving}>
          保存
        </button>
        {Object.keys(errors).length > 0 && <p className="error footer-error">赤い欄を確かめてください</p>}
      </div>
    </div>
  )
}

export function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`row${strong ? ' strong' : ''}`}>
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  )
}
