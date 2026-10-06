// 普段使っているサイトを別のタブで開く。ページの読み取りやログインはしない。
// 投票サイトを開くボタン。アドレスが未登録なら、設定で登録するよう案内する。
export function VoteLink({ href }: { href: string }) {
  if (/^https?:\/\//.test(href)) return <LinkButton href={href} label="投票サイトを開く" />
  return <span className="link-missing">投票サイトのアドレスは、検証タブの「設定とデータ」で登録できます</span>
}

export function LinkButton({ href, label = '開く' }: { href: string; label?: string }) {
  if (!/^https?:\/\//.test(href)) return null
  return (
    <a className="link-btn" href={href} target="_blank" rel="noopener noreferrer">
      {label} ↗
    </a>
  )
}
