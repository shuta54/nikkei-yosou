import { useCallback, useEffect, useState } from 'react'
import { DetailScreen } from './screens/DetailScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { ResultScreen } from './screens/ResultScreen'
import { StatsScreen } from './screens/StatsScreen'
import { TonightScreen } from './screens/TonightScreen'
import { deleteRecord, listRecords, loadSettings, requestPersistentStorage, saveRecord, saveSettings } from './storage'
import type { PredictionRecord, Settings } from './types'

type View =
  | { name: 'tonight'; editId?: string; key: number }
  | { name: 'result'; id: string; from: 'tonight' | 'detail' }
  | { name: 'history' }
  | { name: 'detail'; id: string }
  | { name: 'stats' }

type Tab = 'tonight' | 'history' | 'stats'

const tabOf = (v: View): Tab =>
  v.name === 'tonight' ? 'tonight' : v.name === 'stats' ? 'stats' : v.name === 'result' && v.from === 'tonight' ? 'tonight' : 'history'

export default function App() {
  const [records, setRecords] = useState<PredictionRecord[] | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [view, setView] = useState<View>({ name: 'tonight', key: 0 })
  const [toast, setToast] = useState('')
  const [loadError, setLoadError] = useState('')

  const reload = useCallback(async () => {
    const [r, s] = await Promise.all([listRecords(), loadSettings()])
    setRecords(r)
    setSettings(s)
  }, [])

  useEffect(() => {
    reload().catch(() => setLoadError('データを読み込めませんでした。プライベートブラウズでは保存できないことがあります。'))
    requestPersistentStorage().catch(() => {})
  }, [reload])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view])

  if (loadError) return <p className="screen error">{loadError}</p>
  if (!records || !settings) return null

  const save = async (r: PredictionRecord) => {
    await saveRecord(r)
    await reload()
    setToast('保存しました')
  }

  const go = (tab: Tab) =>
    setView(tab === 'tonight' ? { name: 'tonight', key: Date.now() } : tab === 'history' ? { name: 'history' } : { name: 'stats' })

  const find = (id: string) => records.find((r) => r.id === id)

  let screen
  switch (view.name) {
    case 'tonight':
      screen = (
        <TonightScreen
          key={`${view.key}-${view.editId ?? ''}`}
          records={records}
          settings={settings}
          editId={view.editId}
          onSave={save}
          onOpenResult={(id) => setView({ name: 'result', id, from: 'tonight' })}
        />
      )
      break
    case 'result': {
      const r = find(view.id)
      const back = () => setView(view.from === 'detail' ? { name: 'detail', id: view.id } : { name: 'tonight', key: Date.now() })
      screen = r ? (
        <ResultScreen
          key={r.id}
          record={r}
          links={settings.links}
          onBack={back}
          onSave={async (x) => {
            await save(x)
            back()
          }}
        />
      ) : null
      break
    }
    case 'history':
      screen = <HistoryScreen records={records} onOpen={(id) => setView({ name: 'detail', id })} />
      break
    case 'detail': {
      const r = find(view.id)
      screen = r ? (
        <DetailScreen
          key={r.id}
          record={r}
          onBack={() => setView({ name: 'history' })}
          onEditPrediction={() => setView({ name: 'tonight', editId: r.id, key: Date.now() })}
          onEditResult={() => setView({ name: 'result', id: r.id, from: 'detail' })}
          onDelete={async () => {
            await deleteRecord(r.id)
            await reload()
            setView({ name: 'history' })
            setToast('削除しました')
          }}
        />
      ) : null
      break
    }
    case 'stats':
      screen = (
        <StatsScreen
          records={records}
          settings={settings}
          onSettingsChange={async (s) => {
            await saveSettings(s)
            setSettings(s)
          }}
          onImported={reload}
        />
      )
      break
  }

  const tab = tabOf(view)
  return (
    <>
      <main>{screen}</main>
      {toast && <div className="toast">{toast}</div>}
      <nav className="tabbar">
        {(
          [
            ['tonight', '今夜の予想'],
            ['history', '履歴'],
            ['stats', '検証'],
          ] as const
        ).map(([t, label]) => (
          <button key={t} type="button" className={tab === t ? 'on' : ''} onClick={() => go(t)}>
            {label}
          </button>
        ))}
      </nav>
    </>
  )
}
