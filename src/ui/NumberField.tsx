import { useId, type Ref } from 'react'
import { LinkButton } from './LinkButton'

interface Props {
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  hint?: string
  // マイナスを入れる欄。iPhone の数字キーボードにはマイナスがないので、符号を切り替えるボタンを出す
  signed?: boolean
  suffix?: string
  placeholder?: string
  large?: boolean
  inputRef?: Ref<HTMLInputElement>
  autoFocus?: boolean
  link?: string // 横に置く「開く」ボタンのリンク先
}

export function toggleSign(v: string): string {
  const t = v.trim()
  if (t.startsWith('-')) return t.slice(1)
  if (t.startsWith('+')) return '-' + t.slice(1)
  return '-' + t
}

export function NumberField(p: Props) {
  const id = useId()
  return (
    <div className={`field${p.error ? ' has-error' : ''}`}>
      <div className="label-row">
        <label htmlFor={id}>{p.label}</label>
        {p.link && <LinkButton href={p.link} />}
      </div>
      <div className="input-row">
        {p.signed && (
          <button type="button" className="sign-btn" onClick={() => p.onChange(toggleSign(p.value))} aria-label="プラスとマイナスを切り替える">
            ＋/−
          </button>
        )}
        <input
          id={id}
          ref={p.inputRef}
          className={p.large ? 'large' : undefined}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          placeholder={p.placeholder}
          value={p.value}
          autoFocus={p.autoFocus}
          onChange={(e) => p.onChange(e.target.value)}
        />
        {p.suffix && <span className="suffix">{p.suffix}</span>}
      </div>
      {p.hint && <p className="hint">{p.hint}</p>}
      {p.error && <p className="error">{p.error}</p>}
    </div>
  )
}
