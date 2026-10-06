import { useEffect, useState, type ChangeEvent } from 'react'
import { buildTsv } from '../calc/tsv'
import { formatDateTime, toISODate } from '../calc/dates'
import { exportAll, importAll, listRecords, loadLastExportAt } from '../storage'
import { parseExportData, type ExportData } from '../storage/exportFormat'
import type { Settings } from '../types'
import { DEFAULT_ADJUSTMENT_KINDS, DEFAULT_LINKS, LINK_LABELS, type Links } from '../types'

interface Props {
  settings: Settings
  recordCount: number
  onSettingsChange: (s: Settings) => Promise<void>
  onImported: () => Promise<void>
}

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function DataSection({ settings, recordCount, onSettingsChange, onImported }: Props) {
  const [message, setMessage] = useState('')
  const [lastExport, setLastExport] = useState<string | null>(null)
  const [pendingImport, setPendingImport] = useState<{ json: unknown; data: ExportData } | null>(null)
  const [newKind, setNewKind] = useState('')
  const [links, setLinks] = useState<Links>(settings.links)
  const linkKeys = Object.keys(LINK_LABELS) as (keyof Links)[]
  const badLink = linkKeys.find((k) => links[k] && !/^https?:\/\//.test(links[k]))

  useEffect(() => {
    loadLastExportAt().then(setLastExport)
  }, [])

  const exportJson = async () => {
    const data = await exportAll()
    download(`nikkei-yosou-${toISODate(new Date())}.json`, JSON.stringify(data, null, 2), 'application/json')
    setLastExport(data.exportedAt)
    setMessage(`${data.records.length}件の記録を書き出しました`)
  }

  const pickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const json: unknown = JSON.parse(await file.text())
      setPendingImport({ json, data: parseExportData(json) })
      setMessage('')
    } catch (err) {
      setPendingImport(null)
      setMessage(err instanceof SyntaxError ? 'JSON ファイルとして読めませんでした' : (err as Error).message)
    }
  }

  const confirmImport = async () => {
    if (!pendingImport) return
    try {
      const data = await importAll(pendingImport.json)
      setMessage(`${data.records.length}件の記録を読み込みました`)
      await onImported()
    } catch (err) {
      setMessage((err as Error).message)
    }
    setPendingImport(null)
  }

  const tsv = async () => buildTsv(await listRecords())

  const copyTsv = async () => {
    try {
      await navigator.clipboard.writeText(await tsv())
      setMessage('コピーしました。スプレッドシートの左上のセルに貼り付けてください')
    } catch {
      setMessage('コピーできませんでした。「ファイルで書き出す」を使ってください')
    }
  }

  const addKind = async () => {
    const k = newKind.trim()
    if (!k || settings.adjustmentKinds.includes(k)) return
    await onSettingsChange({ ...settings, adjustmentKinds: [...settings.adjustmentKinds, k] })
    setNewKind('')
  }

  const removeKind = (k: string) => onSettingsChange({ ...settings, adjustmentKinds: settings.adjustmentKinds.filter((x) => x !== k) })

  const saveLinks = async () => {
    if (badLink) return
    await onSettingsChange({ ...settings, links })
    setMessage('リンク先を保存しました')
  }

  return (
    <>
      <h2 className="section-title">設定とデータ</h2>

      <div className="card">
        <h3>補正②の理由の種類</h3>
        <div className="chips">
          {settings.adjustmentKinds.map((k) => (
            <span key={k} className="chip on">
              {k}
              {!DEFAULT_ADJUSTMENT_KINDS.includes(k) && (
                <button type="button" className="chip-x" aria-label={`${k}を消す`} onClick={() => removeKind(k)}>
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
        <div className="input-row">
          <input type="text" placeholder="追加する種類" value={newKind} onChange={(e) => setNewKind(e.target.value)} />
          <button type="button" className="secondary" onClick={addKind}>
            追加
          </button>
        </div>
      </div>

      <div className="card">
        <h3>「開く」ボタンのリンク先</h3>
        <p className="muted small">投票サイトは空のままだと「投票サイトを開く」のボタンが出ません。ログインページのアドレスを入れてください。</p>
        {linkKeys.map((k) => (
          <div className="field" key={k}>
            <label>{LINK_LABELS[k]}</label>
            <input type="url" inputMode="url" autoComplete="off" placeholder="https://" value={links[k]} onChange={(e) => setLinks({ ...links, [k]: e.target.value })} />
          </div>
        ))}
        {badLink && <p className="error">{LINK_LABELS[badLink]}のアドレスは https:// で始めてください</p>}
        <div className="actions">
          <button type="button" className="secondary" onClick={saveLinks} disabled={Boolean(badLink)}>
            保存
          </button>
          <button type="button" className="secondary" onClick={() => setLinks({ ...DEFAULT_LINKS })}>
            最初の値に戻す
          </button>
        </div>
      </div>

      <div className="card">
        <h3>全データの書き出しと読み込み（JSON）</h3>
        <p className="muted small">
          記録はこの端末のブラウザの中だけにあります。消えたときに備えて、ときどき書き出してください。
          <br />
          最後の書き出し：{lastExport ? formatDateTime(lastExport) : 'まだありません'}
        </p>
        <button type="button" className="secondary wide" onClick={exportJson}>
          JSON を書き出す（{recordCount}件）
        </button>
        <label className="secondary wide file-btn">
          JSON を読み込む
          <input type="file" accept="application/json,.json" onChange={pickFile} hidden />
        </label>
        {pendingImport && (
          <div className="confirm">
            <p>
              ファイルの記録 {pendingImport.data.records.length}件を読み込みます。今の記録 {recordCount}件はすべて置き換わります。
            </p>
            <div className="actions">
              <button type="button" className="danger-btn" onClick={confirmImport}>
                置き換えて読み込む
              </button>
              <button type="button" className="secondary" onClick={() => setPendingImport(null)}>
                やめる
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3>スプレッドシート用（タブ区切り）</h3>
        <div className="actions">
          <button type="button" className="secondary" onClick={copyTsv}>
            コピーする
          </button>
          <button
            type="button"
            className="secondary"
            onClick={async () => download(`nikkei-yosou-${toISODate(new Date())}.tsv`, await tsv(), 'text/tab-separated-values')}
          >
            ファイルで書き出す
          </button>
        </div>
      </div>

      {message && <p className="message">{message}</p>}
    </>
  )
}
