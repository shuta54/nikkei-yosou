import { useEffect, useMemo, useState } from 'react'
import { formatDateJa, formatTime, isAfterClose, toISODate } from '../calc/dates'
import {
  draftFromRecord,
  newDraft,
  previewAdj2Sum,
  tonightDraft,
  previewPrediction,
  recordFromDraft,
  startMorningFix,
  toggleEvent,
  type DraftErrors,
  type PredictionDraft,
} from '../form/draft'
import type { PredictionRecord, Settings } from '../types'
import { EVENT_KINDS } from '../types'
import { AdjustmentsEditor } from '../ui/AdjustmentsEditor'
import { AmountField } from '../ui/AmountField'
import { NumberField } from '../ui/NumberField'
import { fmt, fmtSigned, scrollToFirstError } from '../ui/format'
import { parseNumber } from '../form/parse'
import { clearCached, loadCached, saveCached } from '../ui/draftCache'
import { VoteLink } from '../ui/LinkButton'
import { finalPrediction, missingResults } from '../calc/calc'

const CACHE_KEY = 'nikkei-yosou:tonight-draft'

interface Cached {
  draft: PredictionDraft
  adj1Hint: string
}

interface Props {
  records: PredictionRecord[]
  settings: Settings
  editId?: string
  onSave: (r: PredictionRecord) => Promise<void>
  onOpenResult: (id: string) => void
}

const ADJ1_SOURCE_HINT = {
  suggestion: '前回の「終値 − 終値が出た頃の先物」から',
  previous: '前回の補正①を引き継いでいます',
  none: '',
}

function initialDraft(records: PredictionRecord[], editId: string | undefined, now: Date): Cached {
  const editing = editId ? records.find((r) => r.id === editId) : undefined
  let fresh: Cached
  if (editing) {
    fresh = { draft: draftFromRecord(editing), adj1Hint: '' }
  } else {
    const { draft, adj1Default } = tonightDraft(records, now)
    fresh = { draft, adj1Hint: adj1Default ? ADJ1_SOURCE_HINT[adj1Default.source] : '' }
  }
  // 保存前の入力が残っていて、同じ記録（新規なら同じ対象日）・同じ投票区分のものなら続きから
  const cached = loadCached<Cached>(CACHE_KEY)
  if (
    cached?.draft &&
    cached.draft.id === fresh.draft.id &&
    cached.draft.voteType === fresh.draft.voteType &&
    (fresh.draft.id || cached.draft.targetDate === fresh.draft.targetDate)
  )
    return cached
  return fresh
}

function SavedPanel({ record, voteUrl, onBack }: { record: PredictionRecord; voteUrl: string; onBack: () => void }) {
  const [copied, setCopied] = useState(false)
  const prediction = finalPrediction(record)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(prediction ?? ''))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="screen saved">
      <p className="muted">{formatDateJa(record.targetDate)}の予想を保存しました</p>
      <div className="saved-label">予想値{record.morning ? '（朝に修正）' : ''}</div>
      <div className="saved-value">{fmt(prediction)}</div>
      <div className="saved-actions">
        <button type="button" className="primary" onClick={copy}>
          {copied ? 'コピーしました' : '予想値をコピー'}
        </button>
        <VoteLink href={voteUrl} />
      </div>
      <button type="button" className="text-btn" onClick={onBack}>
        入力に戻る
      </button>
    </div>
  )
}

export function TonightScreen({ records, settings, editId, onSave, onOpenResult }: Props) {
  const now = useMemo(() => new Date(), [])
  const init = useMemo(() => initialDraft(records, editId, now), [])
  const [draft, setDraft] = useState<PredictionDraft>(init.draft)
  const [adj1Hint, setAdj1Hint] = useState(init.adj1Hint)
  const [errors, setErrors] = useState<DraftErrors>({})
  const [showDetails, setShowDetails] = useState(false)
  const [showDate, setShowDate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<PredictionRecord | null>(null)

  useEffect(() => {
    saveCached(CACHE_KEY, { draft, adj1Hint } satisfies Cached)
  }, [draft, adj1Hint])

  const base = records.find((r) => r.id === draft.id)
  const set = (patch: Partial<PredictionDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const isMorning = draft.voteType === 'morning'

  const today = toISODate(now)
  const pending = records
    .filter((r) => missingResults(r).length > 0 && (r.targetDate < today || (r.targetDate === today && isAfterClose(now))))
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate))

  const nightPreview = base?.directPrediction != null && draft.futures === '' ? base.directPrediction : previewPrediction(draft.futures, draft.adj1, draft.adj2)
  const morningPreview = previewPrediction(draft.morningFutures, draft.morningAdj1, draft.morningAdj2)
  const finalPreview = isMorning ? morningPreview : nightPreview

  const changeTargetDate = (date: string) => {
    setErrors({})
    const existing = records.find((r) => r.targetDate === date)
    if (existing && existing.id !== draft.id) {
      setDraft(draftFromRecord(existing))
      setAdj1Hint('')
      return
    }
    // 履歴から開いた記録なら、その記録の対象日を直す（祝日の修正など）
    if (editId) return set({ targetDate: date })
    const { draft: fresh, adj1Default } = newDraft(new Date(), records, date)
    setAdj1Hint(ADJ1_SOURCE_HINT[adj1Default.source])
    // 保存済みの記録を表示していたなら、その日の新しい予想を始める。
    // 保存前の入力なら、入力済みの欄は残して補正①の初期値だけ取り直す。
    setDraft(draft.id ? fresh : { ...draft, targetDate: date, adj1: fresh.adj1 })
  }

  const save = async () => {
    const at = new Date().toISOString()
    const d: PredictionDraft = {
      ...draft,
      voteTime: base ? draft.voteTime : at,
      morningTime: isMorning && !base?.morning ? at : draft.morningTime,
    }
    const res = recordFromDraft(d, base, records)
    if (!res.ok) {
      setErrors(res.errors)
      // 「詳細」の中の欄に誤りがあれば開いて見せる
      const visible = new Set(['futures', 'morningFutures', ...(isMorning ? draft.morningAdj2 : draft.adj2).flatMap((a) => [`${a.id}.note`, `${a.id}.amount`])])
      if (isMorning) visible.delete('futures')
      if (Object.keys(res.errors).some((k) => !visible.has(k) && k !== 'targetDate')) setShowDetails(true)
      if (res.errors.targetDate) setShowDate(true)
      scrollToFirstError()
      return
    }
    setErrors({})
    setSaving(true)
    try {
      await onSave(res.record)
      clearCached(CACHE_KEY)
      setDraft(draftFromRecord(res.record))
      setSaved(res.record)
    } finally {
      setSaving(false)
    }
  }

  if (saved) return <SavedPanel record={saved} voteUrl={settings.links.vote} onBack={() => setSaved(null)} />

  const adj2Editor = isMorning ? (
    <AdjustmentsEditor items={draft.morningAdj2} onChange={(morningAdj2) => set({ morningAdj2 })} settings={settings} errors={errors} />
  ) : (
    <AdjustmentsEditor items={draft.adj2} onChange={(adj2) => set({ adj2 })} settings={settings} errors={errors} />
  )
  const adj1 = isMorning ? draft.morningAdj1 : draft.adj1
  const adj1Parsed = parseNumber(adj1) ?? 0
  const adj1Value = Number.isNaN(adj1Parsed) ? null : adj1Parsed
  const adj2Sum = previewAdj2Sum(isMorning ? draft.morningAdj2 : draft.adj2)
  const status = isMorning ? '朝に修正' : base ? '保存済みの予想を編集' : ''

  return (
    <div className="screen with-footer">
      {pending.length > 0 && (
        <div className="pending">
          {pending.map((r) => (
            <button key={r.id} type="button" className="pending-item" onClick={() => onOpenResult(r.id)}>
              <span className="badge">結果が未入力</span>
              <span>
                {formatDateJa(r.targetDate)}
                <br />
                <span className="pending-missing">{missingResults(r).join('・')}が未入力</span>
              </span>
              <span className="chev">›</span>
            </button>
          ))}
        </div>
      )}

      <div className="target-row">
        <button type="button" className="date-chip" onClick={() => setShowDate(!showDate)}>
          対象日 {formatDateJa(draft.targetDate)} <span className="caret">▾</span>
        </button>
        {status && <span className="status">{status}</span>}
      </div>
      {showDate && (
        <div className={`field${errors.targetDate ? ' has-error' : ''}`}>
          <input type="date" value={draft.targetDate} onChange={(e) => changeTargetDate(e.target.value)} />
          <p className="hint">
            {editId ? '対象日を変えると、この記録の対象日が変わります' : '祝日などで違うときだけ変えてください。日付を変えるとその日の予想になります'}
          </p>
          {errors.targetDate && <p className="error">{errors.targetDate}</p>}
        </div>
      )}

      {isMorning ? (
        <NumberField
          label="先物（修正時）"
          value={draft.morningFutures}
          onChange={(v) => set({ morningFutures: v })}
          error={errors.morningFutures}
          large
          placeholder="例：70300"
          suffix="円"
          link={settings.links.futures}
        />
      ) : (
        <NumberField
          label="先物（投票時）"
          value={draft.futures}
          onChange={(v) => set({ futures: v })}
          error={errors.futures}
          large
          placeholder={base?.directPrediction != null ? '記録なし' : '例：70050'}
          autoFocus={!draft.id}
          suffix="円"
          link={settings.links.futures}
        />
      )}

      {adj2Editor}

      <details className="box" open={showDetails} onToggle={(e) => setShowDetails(e.currentTarget.open)}>
        <summary>詳細（補正①・前日比・寝た後の予定）</summary>

        {isMorning ? (
          <AmountField label="補正①（先物と日経平均の値の差）" value={draft.morningAdj1} onChange={(v) => set({ morningAdj1: v })} error={errors.morningAdj1} />
        ) : (
          <AmountField label="補正①（先物と日経平均の値の差）" value={draft.adj1} onChange={(v) => set({ adj1: v })} error={errors.adj1} hint={adj1Hint} />
        )}

        <NumberField label="ダウ（前日比）" value={draft.dow} onChange={(v) => set({ dow: v })} error={errors.dow} signed suffix="%" link={settings.links.dow} />
        <NumberField label="ナスダック（前日比）" value={draft.nasdaq} onChange={(v) => set({ nasdaq: v })} error={errors.nasdaq} signed suffix="%" link={settings.links.nasdaq} />
        <NumberField label="ドル円（前日比）" value={draft.usdjpy} onChange={(v) => set({ usdjpy: v })} error={errors.usdjpy} signed suffix="%" link={settings.links.usdjpy} />

        <div className="field">
          <label>寝た後の予定（複数選択可）</label>
          <div className="chips">
            {EVENT_KINDS.map((e) => (
              <button key={e} type="button" className={`chip${draft.events.includes(e) ? ' on' : ''}`} onClick={() => set({ events: toggleEvent(draft.events, e) })}>
                {e}
              </button>
            ))}
          </div>
        </div>

        {isMorning && (
          <div className="sub-box">
            <div className="section-label">夜の予想 {fmt(nightPreview)}</div>
            <NumberField label="先物（投票時）" value={draft.futures} onChange={(v) => set({ futures: v })} error={errors.futures} suffix="円" placeholder={base?.directPrediction != null ? '記録なし' : undefined} />
            <AmountField label="補正①" value={draft.adj1} onChange={(v) => set({ adj1: v })} error={errors.adj1} />
            <div className="section-label">補正②</div>
            <AdjustmentsEditor items={draft.adj2} onChange={(adj2) => set({ adj2 })} settings={settings} errors={errors} />
          </div>
        )}

        <div className="field">
          <label>投票区分：{isMorning ? '朝に修正' : '夜に投票'}</label>
          {isMorning ? (
            <button type="button" className="secondary" onClick={() => set({ voteType: 'night' })}>
              朝の修正をやめて「夜に投票」に戻す
            </button>
          ) : base ? (
            <button type="button" className="secondary" onClick={() => setDraft(startMorningFix(draft, new Date()))}>
              「朝に修正」にする
            </button>
          ) : (
            <p className="hint">対象日の朝に開くと、自動で「朝に修正」になります</p>
          )}
          {draft.voteTime && <p className="hint">夜の投票時刻 {formatTime(draft.voteTime)}</p>}
        </div>
      </details>

      <div className="footer-bar">
        <div className="preview">
          <div className="preview-label">{isMorning ? '予想値（朝に修正）' : '予想値'}</div>
          <div className="preview-value">{fmt(finalPreview)}</div>
          <div className="preview-sub">
            補正① {fmtSigned(adj1Value)}・補正② {fmtSigned(adj2Sum)}
            {isMorning && `・夜 ${fmt(nightPreview)}`}
          </div>
        </div>
        <button type="button" className="primary" onClick={save} disabled={saving}>
          保存
        </button>
        {Object.keys(errors).length > 0 && <p className="error footer-error">入力に足りないところがあります。赤い欄を確かめてください</p>}
      </div>
    </div>
  )
}
