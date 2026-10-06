import { parseNumber } from '../form/parse'
import { round2 } from '../calc/calc'
import { NumberField } from './NumberField'

const STEPS = [-100, -50, -10, 10, 50, 100]

interface Props {
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  hint?: string
}

// 補正の金額。±10・±50・±100 のボタンで増減でき、直接入力もできる。
export function AmountField(p: Props) {
  const step = (d: number) => {
    const cur = parseNumber(p.value)
    const base = cur == null || Number.isNaN(cur) ? 0 : cur
    p.onChange(String(round2(base + d)))
  }
  return (
    <div className="amount-field">
      <NumberField label={p.label} value={p.value} onChange={p.onChange} error={p.error} hint={p.hint} signed suffix="円" placeholder="0" />
      <div className="steps">
        {STEPS.map((d) => (
          <button key={d} type="button" className={d < 0 ? 'minus' : 'plus'} onClick={() => step(d)}>
            {d > 0 ? `+${d}` : `−${-d}`}
          </button>
        ))}
      </div>
    </div>
  )
}
