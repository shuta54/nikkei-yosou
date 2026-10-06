// 計算の確認用の記録。先物・補正・終値は依頼時に示された数字で、順位やメモはテスト用の値。
import type { PredictionRecord } from '../src/types'

export const rec1002: PredictionRecord = {
  id: 'r1002',
  targetDate: '2026-10-02',
  directPrediction: 68600,
  adj1: 0,
  adj2: [],
  eventsAfterSleep: [],
  close: 68309.46,
  rank: { rank: 1, total: 10 },
  review: '',
  aiNotes: '',
  updatedAt: '2026-10-06T00:00:00.000Z',
}

export const rec1005: PredictionRecord = {
  id: 'r1005',
  targetDate: '2026-10-05',
  voteTime: '2026-10-04T13:33:00.000Z',
  futuresAtVote: 70050,
  usdjpyPct: 0.26,
  adj1: 0,
  adj2: [{ id: 'a1', kind: 'ドル円', amount: 50, note: 'テスト用のメモ' }],
  eventsAfterSleep: [],
  close: 70683.98,
  rank: { rank: 2, total: 10 },
  review: '',
  aiNotes: '',
  updatedAt: '2026-10-06T00:00:00.000Z',
}
