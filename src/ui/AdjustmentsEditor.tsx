import type { AdjustmentDraft, DraftErrors } from '../form/draft'
import { newAdjustmentDraft } from '../form/draft'
import type { Settings } from '../types'
import { AmountField } from './AmountField'

interface Props {
  items: AdjustmentDraft[]
  onChange: (items: AdjustmentDraft[]) => void
  settings: Settings
  errors: DraftErrors
}

export function AdjustmentsEditor({ items, onChange, settings, errors }: Props) {
  const update = (id: string, patch: Partial<AdjustmentDraft>) =>
    onChange(items.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  // 設定から消した種類が過去の記録に残っていても選べるようにする
  const kindsFor = (kind: string) =>
    settings.adjustmentKinds.includes(kind) ? settings.adjustmentKinds : [...settings.adjustmentKinds, kind]

  return (
    <div className="adjustments">
      {items.map((a, i) => (
        <div className="adj-card" key={a.id}>
          <div className="adj-head">
            <span>補正② {i + 1}件目</span>
            <button type="button" className="text-btn danger" onClick={() => onChange(items.filter((x) => x.id !== a.id))}>
              削除
            </button>
          </div>
          <div className="chips">
            {kindsFor(a.kind).map((k) => (
              <button key={k} type="button" className={`chip${a.kind === k ? ' on' : ''}`} onClick={() => update(a.id, { kind: k })}>
                {k}
              </button>
            ))}
          </div>
          <AmountField label="金額" value={a.amount} onChange={(v) => update(a.id, { amount: v })} error={errors[`${a.id}.amount`]} />
          <div className={`field${errors[`${a.id}.note`] ? ' has-error' : ''}`}>
            <label>根拠にした数字やメモ</label>
            <textarea
              rows={2}
              value={a.note}
              placeholder="例：ドル円 +0.26%。円安で輸出株に追い風"
              onChange={(e) => update(a.id, { note: e.target.value })}
            />
            {errors[`${a.id}.note`] && <p className="error">{errors[`${a.id}.note`]}</p>}
          </div>
        </div>
      ))}
      <button type="button" className="secondary wide" onClick={() => onChange([...items, newAdjustmentDraft(settings)])}>
        ＋ 補正を追加
      </button>
    </div>
  )
}
