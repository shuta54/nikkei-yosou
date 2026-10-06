// 入力中の内容を端末に一時保存する。別のタブでサイトを見て戻ったときや、
// ホーム画面のアプリが裏で終了されたときに、入力が消えないようにするため。
// 保存できない環境でも動くよう、失敗は無視する。

export function loadCached<T>(key: string): T | null {
  try {
    const s = localStorage.getItem(key)
    return s ? (JSON.parse(s) as T) : null
  } catch {
    return null
  }
}

export function saveCached(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 保存できなくても入力は続けられる
  }
}

export function clearCached(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // 何もしない
  }
}
