import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import {
  deleteRecord,
  exportAll,
  importAll,
  listRecords,
  loadSettings,
  saveRecord,
  saveSettings,
} from '../src/storage'
import { rec1002, rec1005 } from './fixtures'
import { DEFAULT_LINKS } from '../src/types'

const custom = { adjustmentKinds: ['ドル円', '独自の理由'], links: { ...DEFAULT_LINKS, vote: 'https://example.com/vote' } }

const strip = <T extends { updatedAt: string }>(r: T) => ({ ...r, updatedAt: '' })

describe('storage', () => {
  it('書き出したJSONを読み込むと同じ状態に戻る', async () => {
    await saveRecord(rec1002)
    await saveRecord({ ...rec1005, morning: { futures: 70600, time: 't', adj1: 10, adj2: [] } })
    await saveSettings(custom)

    const exported = await exportAll()
    const json = JSON.parse(JSON.stringify(exported))
    const before = await listRecords()

    // いったん変更してから読み込む
    await deleteRecord(rec1002.id)
    await saveRecord({ ...rec1005, id: 'other', targetDate: '2026-10-09' })
    await saveSettings({ adjustmentKinds: [], links: DEFAULT_LINKS })

    await importAll(json)
    expect((await listRecords()).map(strip)).toEqual(before.map(strip))
    expect(await loadSettings()).toEqual(custom)
  })

  it('このアプリのものでないJSONは読み込まず、今のデータも消さない', async () => {
    const n = (await listRecords()).length
    await expect(importAll({ foo: 1 })).rejects.toThrow('このアプリで書き出したファイルではありません')
    expect(await listRecords()).toHaveLength(n)
  })
})

it('リンク先のない古い設定を読むと初期値で埋める', async () => {
  const { normalizeSettings } = await import('../src/types')
  expect(normalizeSettings({ adjustmentKinds: ['a'] })).toEqual({ adjustmentKinds: ['a'], links: DEFAULT_LINKS })
})
