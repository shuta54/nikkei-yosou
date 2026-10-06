import { useEffect, useMemo, useState } from 'react'
import { defaultTargetDate, formatDateJa, formatTime, isAfterClose, toISODate } from '../calc/dates'
import {
  draftFromRecord,
  newDraft,
  previewAdj2Sum,
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

function initialDraft(records: PredictionRecord[], editId: string | undefined, now: Date) {
  const existing = editId
    ? records.find((r) => r.id === editId)
    : records.find((r) => r.targetDate === defaultTargetDate(now))
  const fresh: Cached = existing
    ? { draft: draftFromRecord(existing), adj1Hint: '' }
    : (() => {
        const { draft, adj1Default } = newDraft(now, records)
        return { draft, adj1Hint: ADJ1_SOURCE_HINT[adj1Default.source] }
      })()
  // 保存前の入力が残っていて、同じ記録（新規なら同じ対象日）のものなら続きから
  const cached = loadCached<Cached>(CACHE_KEY)
  if (cached?.draft && cached.draft.id === fresh.draft.id && (fresh.draft.id || cached.draft.targetDate === fresh.draft.targetDate))
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
  const [showMarket, setShowMarket] = useState(Boolean(draft.dow || draft.nasdaq || draft.usdjpy))
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
      if (res.errors.dow || res.errors.nasdaq || res.errors.usdjpy) setShowMarket(true)
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

  const nightInputs = (
    <>
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
      <AmountField label="補正①（先物と日経平均の値の差）" value={draft.adj1} onChange={(v) => set({ adj1: v })} error={errors.adj1} hint={adj1Hint} />
      <div className="section-label">補正②（自分の判断による補正）</div>
      <AdjustmentsEditor items={draft.adj2} onChange={(adj2) => set({ adj2 })} settings={settings} errors={errors} />
    </>
  )

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

      <div className="title-row">
        <h1>{base ? '予想を編集' : '今夜の予想'}</h1>
        {draft.voteTime && <span className="muted">投票時刻 {formatTime(draft.voteTime)}</span>}
      </div>

      <div className={`field${errors.targetDate ? ' has-error' : ''}`}>
        <label>対象日（終値を当てる日）</label>
        <div className="input-row">
          <input type="date" value={draft.targetDate} onChange={(e) => changeTargetDate(e.target.value)} />
          <span className="suffix">{draft.targetDate && formatDateJa(draft.targetDate).slice(-3)}</span>
        </div>
        {base && !errors.targetDate && (
          <p className="hint">
            {editId ? '対象日を変えると、この記録の対象日が変わります' : 'この日の記録はすでにあるので、その記録を編集します。日付を変えると新しい予想になります'}
          </p>
        )}
        {errors.targetDate && <p className="error">{errors.targetDate}</p>}
      </div>

      <div className="field">
        <label>投票区分</label>
        <div className="segmented">
          <button type="button" className={!isMorning ? 'on' : ''} onClick={() => set({ voteType: 'night' })}>
            夜に投票
          </button>
          <button type="button" className={isMorning ? 'on' : ''} disabled={!base} onClick={() => setDraft(startMorningFix(draft, new Date()))}>
            朝に修正
          </button>
        </div>
        {!base && <p className="hint">「朝に修正」は夜の予想を保存した後に選べます</p>}
      </div>

      {isMorning ? (
        <>
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
          <AmountField label="補正①（先物と日経平均の値の差）" value={draft.morningAdj1} onChange={(v) => set({ morningAdj1: v })} error={errors.morningAdj1} />
          <div className="section-label">補正②（自分の判断による補正）</div>
          <AdjustmentsEditor items={draft.morningAdj2} onChange={(morningAdj2) => set({ morningAdj2 })} settings={settings} errors={errors} />
          <details className="box" open={Boolean(errors.futures || draft.adj2.some((a) => errors[`${a.id}.note`] || errors[`${a.id}.amount`]))}>
            <summary>
              夜の予想 {fmt(nightPreview)}（先物 {draft.futures || '記録なし'}）
            </summary>
            {nightInputs}
          </details>
        </>
      ) : (
        nightInputs
      )}

      <details className="box" open={showMarket} onToggle={(e) => setShowMarket(e.currentTarget.open)}>
        <summary>ダウ・ナスダック・ドル円の前日比（任意）</summary>
        <NumberField label="ダウ" value={draft.dow} onChange={(v) => set({ dow: v })} error={errors.dow} signed suffix="%" link={settings.links.dow} />
        <NumberField label="ナスダック" value={draft.nasdaq} onChange={(v) => set({ nasdaq: v })} error={errors.nasdaq} signed suffix="%" link={settings.links.nasdaq} />
        <NumberField label="ドル円" value={draft.usdjpy} onChange={(v) => set({ usdjpy: v })} error={errors.usdjpy} signed suffix="%" link={settings.links.usdjpy} />
      </details>

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

      <div className="footer-bar">
        <div className="preview">
          <div className="preview-label">{isMorning ? '予想値（朝に修正）' : '予想値'}</div>
          <div className="preview-value">{fmt(finalPreview)}</div>
          <div className="preview-sub">
            {isMorning
              ? `夜の予想値 ${fmt(nightPreview)}`
              : `補正② 合計 ${fmtSigned(previewAdj2Sum(draft.adj2))}`}
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
