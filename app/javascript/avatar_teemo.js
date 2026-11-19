// 🐱 Teemo 型の アバター（Sprout Lands の キャラ画像を もとに、人の 形に する）。docs/town/requirements.md
// - 体と 動き（4方向の 立ち・歩き、各8コマ）は 素材の 画像（Characters/Premium Charakter Spritesheet.png。S3 から）
// - 耳と ひげを けして はだ色に、頭に 髪を かぶせ、体を 服の 色に する（ライセンスで 改変 OK）。こもの は ここで 描いて 頭に 重ねる
// - データは avatar_sprite.js と 同じ：はだ・髪型・髪の色・服の色・したの色・こもの
// Assets - From: Sprout Lands - By: Cup Nooble

import { normalizeAvatar } from "avatar_sprite"
import { CHIBI_SKINS, CHIBI_HAIRS, CHIBI_CLOTHS } from "avatar_chibi"

export const FRAME = 48 // 1コマの 大きさ
export const TEEMO_W = 16 // あたり判定・ふきだし の ための 体の 大きさ
export const TEEMO_H = 18
const ANCHOR_X = 24 // コマの 中の 足もと
const ANCHOR_Y = 32

// 画像の だん（4方向 × 立ち・歩き）
const ROWS = { idle: { down: 0, up: 1, right: 2, left: 3 }, walk: { down: 4, up: 5, right: 6, left: 7 } }

// 元の 色 → 役わり
const SRC = { light: "#f3f2c0", shade: "#ddd5de", line: "#5c4e92", mid: "#766daa", collar: "#eae178" }
// 🧑‍💼 Dettyan（Teemo 型の 人）：黒い 髪・マンバン・茶色の ジャケット
export const DETTYAN_TEEMO = { skin: "#f7e0cf", hair: "#2f2a36", top: "#8a5a33", bottom: "#3a3a4a", style: "short", acc: "manbun" }

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// 人の 形に して 色を おきかえた 画像（立ち・歩き の 8だん だけ）を つくって おぼえておく
// Teemo の 体と 動きは そのまま、耳と ひげを けして、毛を はだ色に、頭に 髪を かぶせ、体を 服の 色に する
const INK = "#4e3448"
function mixRgb(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)) }
const SIDE_LEN = { short: 1, bun: 1, pony: 1, bob: 4, twin: 4, long: 6 }

function humanizeFrame(src, dst, stride, fx, fy, spec) {
  const at = (x, y) => ((fy + y) * stride + fx + x) * 4
  const L = rgb(SRC.light).join(), K = rgb(SRC.line).join(), D = rgb(SRC.shade).join(), M = rgb(SRC.mid).join()
  const P = "232,181,172", C = "243,216,197", Y = rgb(SRC.collar).join()
  const px = new Map()
  for (let y = 0; y < FRAME; y++) for (let x = 0; x < FRAME; x++) {
    const i = at(x, y)
    if (src[i + 3]) px.set(`${x},${y}`, `${src[i]},${src[i + 1]},${src[i + 2]}`)
  }
  if (!px.size) return
  const ink = rgb(INK)
  const { skin, hair, top, bottom } = spec
  const skinLine = mixRgb(skin, ink, 0.62)
  let neck = 26
  for (const [k, c] of px) if (c === M) neck = Math.min(neck, +k.split(",")[1])
  const rows = new Map()
  for (const [k, c] of px) {
    const [x, y] = k.split(",").map(Number)
    if (y < neck && c !== K) { const r = rows.get(y) || []; r.push(x); rows.set(y, r) }
  }
  const inside = (x, y) => { const r = rows.get(y); return r && Math.min(...r) < x && x < Math.max(...r) }
  const out = new Map()
  for (const [k, c] of px) {
    const [x, y] = k.split(",").map(Number)
    let v
    if (y < neck) {
      if (c === K) {
        const r = rows.get(y)
        if (r && (x < Math.min(...r) - 1 || x > Math.max(...r) + 1)) continue // ひげ
        v = inside(x, y) ? ink : skinLine
      } else if (c === L || c === D || c === P) v = skin
      else if (c === C) v = mixRgb(skin, rgb("#f28aa8"), 0.45)
      else v = c.split(",").map(Number)
    } else {
      if (c === K) v = ink
      else if (c === M) v = mixRgb(top, ink, 0.25)
      else if (c === Y) v = mixRgb(top, [255, 255, 255], 0.3)
      else if (c === L) v = y < neck + 4 ? top : bottom
      else if (c === D) v = mixRgb(bottom, ink, 0.25)
      else v = c.split(",").map(Number)
    }
    out.set(k, v)
  }
  const head = [...out.keys()].map((k) => k.split(",").map(Number)).filter(([, y]) => y < neck)
  if (!head.length) return
  const topY = Math.min(...head.map(([, y]) => y))
  const left = Math.min(...head.map(([x]) => x))
  const right = Math.max(...head.map(([x]) => x))
  let eyeY = Infinity
  for (const [k, c] of px) {
    const [x, y] = k.split(",").map(Number)
    if (c === K && y >= topY + 4 && y < neck && inside(x, y)) eyeY = Math.min(eyeY, y)
  }
  if (!Number.isFinite(eyeY)) eyeY = topY + 6
  const hairLine = mixRgb(hair, ink, 0.55)
  const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
  // 頭の てっぺん を まるく うめる
  for (let y = topY; y < topY + 3; y++) {
    for (let x = left + (y === topY ? 1 : 0); x <= right - (y === topY ? 1 : 0); x++) {
      const k = `${x},${y}`
      if (!out.has(k) || same(out.get(k), skinLine)) out.set(k, hair)
    }
  }
  const dir = spec.dir
  const side = SIDE_LEN[spec.style] ?? 1
  for (const k of [...out.keys()]) {
    const [x, y] = k.split(",").map(Number)
    if (y >= neck || same(out.get(k), ink)) continue
    let cover
    if (dir === "up") cover = y < neck - 1
    else if (dir === "down") cover = y <= eyeY - 2 + ((x - left) % 3 === 1 ? 1 : 0) || ((x <= left + 1 || x >= right - 1) && y <= eyeY + side)
    else {
      const back = dir === "right" ? x <= left + 4 : x >= right - 4
      cover = y <= eyeY - 2 || (back && y <= eyeY + side)
    }
    if (cover) out.set(k, hair)
  }
  const light = mixRgb(hair, [255, 255, 255], 0.35)
  for (const k of [...out.keys()]) {
    const [x, y] = k.split(",").map(Number)
    if (y >= neck || out.get(k) !== hair) continue
    if (!out.has(`${x},${y - 1}`)) out.set(k, hairLine)
    else if (y === topY + 2 && x > left + 2 && x < right - 2 && x % 4 === 1) out.set(k, light)
    else if (same(out.get(`${x},${y + 1}`), skin)) out.set(k, mixRgb(hair, ink, 0.4))
  }
  if ((spec.style === "long" || spec.style === "bob" || spec.style === "twin") && dir !== "up") {
    const n = spec.style === "long" ? 8 : 4
    for (let y = eyeY - 2; y < eyeY + n; y++) {
      const xs = [...(dir !== "left" ? [left, left - 1] : []), ...(dir !== "right" ? [right, right + 1] : [])]
      for (const x of xs) out.set(`${x},${y}`, y < eyeY + n - 1 ? hair : hairLine)
    }
  }
  for (const [x, y] of [[left, topY], [right, topY], [left, topY + 1], [right, topY + 1]]) out.delete(`${x},${y}`)
  for (const [x, y] of [[left + 1, topY], [right - 1, topY], [left, topY + 2], [right, topY + 2], [left + 1, topY + 1], [right - 1, topY + 1]]) {
    if (out.has(`${x},${y}`)) out.set(`${x},${y}`, hairLine)
  }
  for (let y = 0; y < FRAME; y++) for (let x = 0; x < FRAME; x++) dst[at(x, y) + 3] = 0
  for (const [k, v] of out) {
    const [x, y] = k.split(",").map(Number)
    if (x < 0 || y < 0 || x >= FRAME || y >= FRAME) continue
    const i = at(x, y)
    dst[i] = v[0]; dst[i + 1] = v[1]; dst[i + 2] = v[2]; dst[i + 3] = 255
  }
}

const DIRS_BY_ROW = ["down", "up", "right", "left", "down", "up", "right", "left"]
const cache = new Map()
export function recolored(sheet, spec) {
  const key = JSON.stringify(spec)
  if (cache.has(key)) return cache.get(key)
  const c = document.createElement("canvas")
  c.width = FRAME * 8
  c.height = FRAME * 8
  const g = c.getContext("2d")
  g.drawImage(sheet, 0, 0, c.width, c.height, 0, 0, c.width, c.height)
  const data = g.getImageData(0, 0, c.width, c.height)
  const src = new Uint8ClampedArray(data.data)
  const d = data.data
  const parts = { skin: rgb(spec.skin), hair: rgb(spec.hair), top: rgb(spec.top), bottom: rgb(spec.bottom), style: spec.style }
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) humanizeFrame(src, d, c.width, f * FRAME, r * FRAME, { ...parts, dir: DIRS_BY_ROW[r] })
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
  nekomimi: { colors: { A: "#f6f1e7", i: "#f4a6c4" }, dy: -2, art: [".A........A.", "AiA......AiA"] },
  usamimi: { colors: { A: "#f6f1e7", i: "#f4a6c4" }, dy: -6, art: ["...AA..AA...", "...Ai..Ai...", "...Ai..Ai...", "...Ai..Ai...", "...AA..AA...", "...AA..AA..."] },
  hanakanmuri: { colors: { A: "#f4a6c4", a: "#f2df8c", g: "#8cc589" }, dy: 0, art: [".A..a..A..a.", "gAggagAggagg"] },
  crown: { colors: { A: "#eec170", a: "#fff1b8", r: "#e07a7a" }, dy: -3, art: ["A.AA.A", "AArAAA", "AAAAaA"] },
  manbun: { colors: { A: "#2a2230", a: "#4a4058", b: "#6b4a2e" }, dy: -4, art: ["....AAA....", "...AaAAA...", "....bbb....", "..AAAAAAA.."] }
}
const ACC_LINE = "#4e3448"

// 人の アバター（avatar_human.js）でも 使う
export function drawAccessory(g, id, cx, top) {
  drawAcc(g, id, cx, top)
}

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
  const spec = look ? { skin: look.skin, hair: look.hair, top: look.top, bottom: look.bottom, style: look.style }
    : { skin: CHIBI_SKINS[a.skin], hair: CHIBI_HAIRS[a.hairColor], top: CHIBI_CLOTHS[a.topColor], bottom: CHIBI_CLOTHS[a.bottomColor], style: a.hair }
  const acc = look?.acc || a.acc
  const { canvas, tops } = recolored(sheet, spec)
  const row = ROWS[walking ? "walk" : "idle"][dir] ?? 0
  const f = Math.floor(t * (walking ? 10 : 5)) % 8
  const left = Math.round(x - ANCHOR_X)
  const top = Math.round(y - ANCHOR_Y)
  g.drawImage(canvas, f * FRAME, row * FRAME, FRAME, FRAME, left, top, FRAME, FRAME)
  // ねこみみ は Teemo に もともと 耳が あるので 描かない
  if (acc && acc !== "none" && acc !== "nekomimi") drawAcc(g, acc, x + (dir === "right" ? 1 : dir === "left" ? -1 : 0), top + tops[row][f])
}
