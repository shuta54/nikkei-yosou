// アイコンの PNG を作る。外部パッケージを使わず zlib だけで書き出す。
// 実行：node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BG = [0x0e, 0x10, 0x14]
const ACCENT = [0x4c, 0xc2, 0xa4]

// 図柄は 0〜1 の座標で持ち、中央 80% に収める（maskable のため）
const LINE = [
  [0.14, 0.7],
  [0.32, 0.56],
  [0.46, 0.62],
  [0.62, 0.4],
  [0.86, 0.46],
]
const BAND = [0.42, 0.58] // ±100円の帯（縦方向）

function crcTable() {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
}
const TABLE = crcTable()
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function distToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

function render(size) {
  const SS = 4 // サブサンプリングで縁をなめらかにする
  const lineW = 0.045
  const raw = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    for (let x = 0; x < size; x++) {
      let lineCov = 0
      let bandCov = 0
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size
          const v = (y + (sy + 0.5) / SS) / size
          if (v >= BAND[0] && v <= BAND[1] && u >= 0.1 && u <= 0.9) bandCov++
          let d = Infinity
          for (let i = 0; i < LINE.length - 1; i++) d = Math.min(d, distToSegment(u, v, LINE[i], LINE[i + 1]))
          if (d <= lineW / 2) lineCov++
        }
      let c = mix(BG, ACCENT, (bandCov / (SS * SS)) * 0.22)
      c = mix(c, ACCENT, lineCov / (SS * SS))
      const o = y * (size * 3 + 1) + 1 + x * 3
      raw[o] = c[0]
      raw[o + 1] = c[1]
      raw[o + 2] = c[2]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // ビット深度
  ihdr[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(new URL(`../public/${name}`, import.meta.url), render(size))
  console.log(`public/${name}`)
}
