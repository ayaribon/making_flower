// 🐱 Teemo 型の アバター（Sprout Lands の キャラ画像を もとに する）。docs/town/requirements.md
// - 体と 動き（4方向の 立ち・歩き、各8コマ）は 素材の 画像（Characters/Premium Charakter Spritesheet.png。S3 から）
// - 毛の 色・首の 色 は 画像の 色を おきかえる（ライセンスで 改変 OK）。こもの は ここで 描いて 頭の 上に 重ねる
// - データは avatar_sprite.js と 同じ：毛の 色 = hairColor、首（スカーフ）の 色 = topColor、こもの = acc
// Assets - From: Sprout Lands - By: Cup Nooble

import { normalizeAvatar } from "avatar_sprite"

export const FRAME = 48 // 1コマの 大きさ
export const TEEMO_W = 16 // あたり判定・ふきだし の ための 体の 大きさ
export const TEEMO_H = 18
const ANCHOR_X = 24 // コマの 中の 足もと
const ANCHOR_Y = 32

// 画像の だん（4方向 × 立ち・歩き）
const ROWS = { idle: { down: 0, up: 1, right: 2, left: 3 }, walk: { down: 4, up: 5, right: 6, left: 7 } }

// 元の 色 → 役わり
const SRC = { light: "#f3f2c0", shade: "#ddd5de", line: "#5c4e92", mid: "#766daa", collar: "#eae178" }
// 毛の 色（hairColor の 番号の じゅん）[あかるい, かげ, ふち, ふちの なか]
export const FURS = [
  ["#f3f2c0", "#ddd5de", "#5c4e92", "#766daa"], // しろ（もとの 色）
  ["#d9a77a", "#bb875c", "#6b3f2e", "#8a5a44"], // ちゃ
  ["#ecc590", "#cfa36e", "#7a4f30", "#9a6a44"], // きなこ
  ["#f4e08e", "#dcc36c", "#7a5a2a", "#9a7a3a"], // きいろ
  ["#f8cada", "#e8a8be", "#8a3a5a", "#a85a7a"], // ピンク
  ["#cbdef6", "#a9bfe2", "#3f4f8a", "#5f6faa"], // みずいろ
  ["#ddcaf2", "#bea8de", "#4f3a7a", "#6f5a9a"], // むらさき
  ["#e8e4ec", "#c6c2ce", "#4a4858", "#6a6878"], // はいいろ
  ["#6e6476", "#544a5c", "#2a2230", "#3e3446"] // くろ
]
export const COLLARS = ["#a8775a", "#e07a7a", "#f4a6c4", "#f2b880", "#f2df8c", "#8cc589", "#7fa7e0", "#5d6aa6", "#ab8bd6", "#5b5566", "#f6f1e7"]

// 🧑‍💼 Dettyan（Teemo 型）：はだ色の 毛・茶色の ジャケット色・黒い マンバン
export const DETTYAN_TEEMO = { fur: ["#f6dcc4", "#e2bc9c", "#5a3a2a", "#7a5640"], collar: "#8a5a33", acc: "manbun" }

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// 色を おきかえた 画像（立ち・歩き の 8だん だけ）を つくって おぼえておく
const cache = new Map()
export function recolored(sheet, fur, collar) {
  const key = `${fur.join()}|${collar}`
  if (cache.has(key)) return cache.get(key)
  const c = document.createElement("canvas")
  c.width = FRAME * 8
  c.height = FRAME * 8
  const g = c.getContext("2d")
  g.drawImage(sheet, 0, 0, c.width, c.height, 0, 0, c.width, c.height)
  const data = g.getImageData(0, 0, c.width, c.height)
  const map = new Map([
    [SRC.light, fur[0]], [SRC.shade, fur[1]], [SRC.line, fur[2]], [SRC.mid, fur[3]], [SRC.collar, collar]
  ].map(([from, to]) => [rgb(from).join(), rgb(to)]))
  const d = data.data
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue
    const to = map.get(`${d[i]},${d[i + 1]},${d[i + 2]}`)
    if (to) { d[i] = to[0]; d[i + 1] = to[1]; d[i + 2] = to[2] }
  }
  g.putImageData(data, 0, 0)
  // コマごとの 頭の いちばん 上（こもの を のせる 高さ）
  const tops = []
  for (let r = 0; r < 8; r++) {
    tops[r] = []
    for (let f = 0; f < 8; f++) {
      let top = ANCHOR_Y - 16
      outer: for (let y = 0; y < FRAME; y++) {
        for (let x = 0; x < FRAME; x++) {
          if (d[((r * FRAME + y) * c.width + f * FRAME + x) * 4 + 3]) { top = y; break outer }
        }
      }
      tops[r][f] = top
    }
  }
  const out = { canvas: c, tops }
  cache.set(key, out)
  return out
}

// こもの（頭の まんなか が x 0、頭の 上 が y 0。マイナスは 上）
const ACC_ART = {
  cap: { colors: { A: "#e07a7a", a: "#f4a6a6", d: "#b85a66" }, dy: -2, art: ["...AAAA...", ".AAaaAAAA.", ".dddddddd.", "AAAAAAAAAA"] },
  headphones: { colors: { A: "#5d6aa6", a: "#9ab0e8" }, dy: -1, art: ["..AAAAAAAAAA..", ".A..........A.", "AaA........AaA", "AAA........AAA"] },
  ribbon: { colors: { A: "#f28aa8", a: "#ffc6d6" }, dy: -1, art: ["......A...A", "......AaAaA", ".......AAA.", "......A...A"] },
  // ねこみみ は Teemo に もともと 耳が あるので 描かない
  usamimi: { colors: { A: "#f6f1e7", i: "#f4a6c4" }, dy: -6, art: ["...AA..AA...", "...Ai..Ai...", "...Ai..Ai...", "...Ai..Ai...", "...AA..AA...", "...AA..AA..."] },
  hanakanmuri: { colors: { A: "#f4a6c4", a: "#f2df8c", g: "#8cc589" }, dy: 0, art: [".A..a..A..a.", "gAggagAggagg"] },
  crown: { colors: { A: "#eec170", a: "#fff1b8", r: "#e07a7a" }, dy: -3, art: ["A.AA.A", "AArAAA", "AAAAaA"] },
  manbun: { colors: { A: "#2a2230", a: "#4a4058", b: "#6b4a2e" }, dy: -4, art: ["....AAA....", "...AaAAA...", "....bbb....", "..AAAAAAA.."] }
}
const ACC_LINE = "#4e3448"

function drawAcc(g, id, cx, top) {
  const acc = ACC_ART[id]
  if (!acc) return
  const w = acc.art[0].length
  const ox = Math.round(cx - w / 2)
  const oy = top + acc.dy
  // ふち（外がわ）→ なかみ
  const filled = new Set()
  acc.art.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== "." && acc.colors[row[x]]) filled.add(`${x},${y}`) })
  g.fillStyle = ACC_LINE
  for (const k of filled) {
    const [x, y] = k.split(",").map(Number)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!filled.has(`${x + dx},${y + dy}`)) g.fillRect(ox + x + dx, oy + y + dy, 1, 1)
    }
  }
  acc.art.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = acc.colors[row[x]]
      if (!col) continue
      g.fillStyle = col
      g.fillRect(ox + x, oy + y, 1, 1)
    }
  })
}

// 向き（動いた 向きから）。たて・よこ で 大きい ほう
export function facing(dx, dy, prev = "down") {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return prev
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left"
  return dy > 0 ? "down" : "up"
}

// Teemo 型の アバターを 描く。x, y は 足もと。opts：{ dir, walking, t（秒）, look（DETTYAN_TEEMO など。データの かわり） }
export function drawTeemo(g, sheet, x, y, raw, { dir = "down", walking = false, t = 0, look = null } = {}) {
  const a = normalizeAvatar(raw)
  const fur = look?.fur || FURS[a.hairColor] || FURS[0]
  const collar = look?.collar || COLLARS[a.topColor] || COLLARS[6]
  const acc = look?.acc || a.acc
  const { canvas, tops } = recolored(sheet, fur, collar)
  const row = ROWS[walking ? "walk" : "idle"][dir] ?? 0
  const f = Math.floor(t * (walking ? 10 : 5)) % 8
  const left = Math.round(x - ANCHOR_X)
  const top = Math.round(y - ANCHOR_Y)
  g.drawImage(canvas, f * FRAME, row * FRAME, FRAME, FRAME, left, top, FRAME, FRAME)
  if (acc && acc !== "none") drawAcc(g, acc, x + (dir === "right" ? 1 : dir === "left" ? -1 : 0), top + tops[row][f])
}
