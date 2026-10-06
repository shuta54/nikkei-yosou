import { Component, type ReactNode } from 'react'
import { clearAllCached } from './draftCache'

// 画面の表示で失敗したときに、真っ暗のままにせず立て直す手段を出す。
// 記録（IndexedDB）には触らず、入力途中の一時保存だけを消す。
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="screen">
        <h1>画面を表示できませんでした</h1>
        <p>保存済みの記録はそのまま残っています。入力途中の内容を消して開き直すと直ることがあります。</p>
        <button
          type="button"
          className="primary wide"
          onClick={() => {
            clearAllCached()
            location.reload()
          }}
        >
          入力途中の内容を消して開き直す
        </button>
        <p className="muted small">{this.state.error.message}</p>
      </div>
    )
  }
}
