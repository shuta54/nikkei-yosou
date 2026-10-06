// 保存の処理はすべてこのファイルに集める。
// 複数端末での同期を足すときは、ここの関数の中身を差し替える。
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { PredictionRecord, Settings } from '../types'
import { normalizeSettings } from '../types'
import { EXPORT_APP, EXPORT_VERSION, parseExportData, type ExportData } from './exportFormat'

interface Schema extends DBSchema {
  records: { key: string; value: PredictionRecord; indexes: { 'by-date': string } }
  meta: { key: string; value: unknown }
}

const DB_NAME = 'nikkei-yosou'
let dbPromise: Promise<IDBPDatabase<Schema>> | null = null

function db() {
  dbPromise ??= openDB<Schema>(DB_NAME, 1, {
    upgrade(d) {
      const s = d.createObjectStore('records', { keyPath: 'id' })
      s.createIndex('by-date', 'targetDate', { unique: true })
      d.createObjectStore('meta')
    },
  })
  return dbPromise
}

// 新しい日付が先頭
export async function listRecords(): Promise<PredictionRecord[]> {
  const all = await (await db()).getAll('records')
  return all.sort((a, b) => b.targetDate.localeCompare(a.targetDate))
}

export async function saveRecord(r: PredictionRecord): Promise<void> {
  await (await db()).put('records', { ...r, updatedAt: new Date().toISOString() })
}

export async function deleteRecord(id: string): Promise<void> {
  await (await db()).delete('records', id)
}

export async function loadSettings(): Promise<Settings> {
  return normalizeSettings(await (await db()).get('meta', 'settings'))
}

export async function saveSettings(s: Settings): Promise<void> {
  await (await db()).put('meta', s, 'settings')
}

export async function loadLastExportAt(): Promise<string | null> {
  return ((await (await db()).get('meta', 'lastExportAt')) as string | undefined) ?? null
}

export async function exportAll(): Promise<ExportData> {
  const d = await db()
  const data: ExportData = {
    app: EXPORT_APP,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    records: await listRecords(),
    settings: await loadSettings(),
  }
  await d.put('meta', data.exportedAt, 'lastExportAt')
  return data
}

// 今のデータをすべて消し、ファイルの中身に置き換える
export async function importAll(json: unknown): Promise<ExportData> {
  const data = parseExportData(json)
  const tx = (await db()).transaction(['records', 'meta'], 'readwrite')
  const records = tx.objectStore('records')
  await records.clear()
  for (const r of data.records) await records.put(r)
  await tx.objectStore('meta').put(data.settings, 'settings')
  await tx.done
  return data
}

// ブラウザが容量不足のときに勝手に消さないよう頼む（断られることもある）
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}
