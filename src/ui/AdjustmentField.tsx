import { hasAdjustment } from '../form/draft'
import { AmountField } from './AmountField'

interface Props {
  amount: string
  note: string
  onChange: (patch: { amount?: string; note?: string }) => void
  amountError?: string
  noteError?: string
}

// 補正は1件だけ。金額が0以外のときだけメモ欄を出し、メモを必須にする。
export function AdjustmentField({ amount, note, onChange, amountError, noteError }: Props) {
  return (
    <div className="adjustment">
      <AmountField label="補正" value={amount} onChange={(v) => onChange({ amount: v })} error={amountError} />
      {hasAdjustment(amount) && (
        <div className={`field${noteError ? ' has-error' : ''}`}>
          <label>メモ（何を理由に補正したか）</label>
          <textarea
            rows={2}
            value={note}
            placeholder="例：ドル円 +0.26%。円安で輸出株に追い風"
            onChange={(e) => onChange({ note: e.target.value })}
          />
          {noteError && <p className="error">{noteError}</p>}
        </div>
      )}
    </div>
  )
}
