// アプリ全体で使うデータの型。計算結果は保存せず、calc/ で毎回求める。

export interface Adjustment {
  id: string
  kind: string // 理由の種類
  amount: number // 円。プラスマイナスあり
  note: string // 根拠にした数字やメモ
}

// 朝に修正したときの入力。夜の入力は PredictionRecord 側にそのまま残す。
export interface MorningFix {
  futures: number // 修正時の先物
  time: string // ISO 文字列
  adj1: number
  adj2: Adjustment[]
}

export interface Rank {
  rank: number
  total: number
}

export interface PredictionRecord {
  id: string
  targetDate: string // YYYY-MM-DD
  voteTime?: string // ISO 文字列
  futuresAtVote?: number // 先物（投票時）。夜の値
  directPrediction?: number // 先物の記録がない古い記録だけが持つ予想値
  dowPct?: number
  nasdaqPct?: number
  usdjpyPct?: number
  adj1: number // 補正①
  adj2: Adjustment[] // 補正②
  eventsAfterSleep: string[] // 寝た後の予定
  morning?: MorningFix // あれば投票区分は「朝に修正」
  futuresNextMorning?: number // 先物（翌朝の夜間取引の終値）
  open?: number
  close?: number
  futuresAtClose?: number // 終値が出た頃の先物
  rank?: Rank
  review: string // 振り返り・感想
  aiNotes: string // AIによる改善点
  updatedAt: string
}

export type VoteType = 'night' | 'morning'

export const VOTE_TYPE_LABEL: Record<VoteType, string> = {
  night: '夜に投票',
  morning: '朝に修正',
}

// 入力欄の横に置く「開く」ボタンのリンク先。設定で変えられる。
export interface Links {
  futures: string
  dow: string
  nasdaq: string
  usdjpy: string
  vote: string
}

export const LINK_LABELS: Record<keyof Links, string> = {
  futures: '先物',
  dow: 'ダウ',
  nasdaq: 'ナスダック',
  usdjpy: 'ドル円',
  vote: '投票サイト',
}

export const DEFAULT_LINKS: Links = {
  futures: 'https://jp.investing.com/indices/japan-225-futures',
  dow: 'https://finance.yahoo.co.jp/quote/%5EDJI',
  nasdaq: 'https://finance.yahoo.co.jp/quote/%5EIXIC',
  usdjpy: 'https://jp.investing.com/currencies/usd-jpy',
  vote: '', // 投票サイトは設定で登録する
}

export interface Settings {
  adjustmentKinds: string[]
  links: Links
}

export const DEFAULT_ADJUSTMENT_KINDS = ['ドル円', '米国株の動き', '直近の傾向', 'その他']

export const EVENT_NONE = 'なし'
export const EVENT_KINDS = [EVENT_NONE, '米国の金融政策発表', '主要企業の決算', '経済指標', 'その他']

export const DEFAULT_SETTINGS: Settings = {
  adjustmentKinds: [...DEFAULT_ADJUSTMENT_KINDS],
  links: { ...DEFAULT_LINKS },
}

// 保存済みの設定に足りない項目があれば初期値で埋める（古い版の設定を読んだとき用）
export function normalizeSettings(x: unknown): Settings {
  const o = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>
  const kinds = Array.isArray(o.adjustmentKinds) && o.adjustmentKinds.every((k) => typeof k === 'string')
    ? (o.adjustmentKinds as string[])
    : [...DEFAULT_ADJUSTMENT_KINDS]
  const l = (typeof o.links === 'object' && o.links !== null ? o.links : {}) as Record<string, unknown>
  const links = { ...DEFAULT_LINKS }
  for (const k of Object.keys(DEFAULT_LINKS) as (keyof Links)[]) {
    if (typeof l[k] === 'string') links[k] = l[k] as string
  }
  return { adjustmentKinds: kinds, links }
}
