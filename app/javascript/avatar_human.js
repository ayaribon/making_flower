// 🧑 人の アバター（Cup Nooble の 人の テンプレート。Sprout Sorry pack の Tests/free_character_spritesheet_by-cupnooble.png）
// - 1コマ 16×32。よこ 8列 ＝ 8方向、たて 3だん ＝ あるく・たつ・あるく
// - 髪・はだ・服・ズボン・くつ の 色を その人の キャラの 色に おきかえる（色の 表は avatar_chibi.js と 同じ）
// - こもの は avatar_teemo.js と 同じ 絵を 頭に 重ねる
// - Sprout Sorry pack は 非商用 ライセンス。この アプリは 非商用 と ayaribon が 判断（2026-11-18）。クレジット：Cup Nooble
// Assets - From: Sprout Lands - By: Cup Nooble

import { normalizeAvatar } from "avatar_sprite"
import { CHIBI_SKINS, CHIBI_HAIRS, CHIBI_CLOTHS } from "avatar_chibi"
import { drawAccessory } from "avatar_teemo"

export const HUMAN_W = 14 // あたり判定・ふきだし の ための 体の 大きさ
export const HUMAN_H = 21
const FW = 16
const FH = 32
const ANCHOR_X = 8 // コマの 中の 足もと
const ANCHOR_Y = 31

// 8方向 → 列（0 うしろ・2 みぎ・4 まえ・6 ひだり、その あいだ は ななめ）
const COLUMNS = { up: 0, upright: 1, right: 2, downright: 3, down: 4, downleft: 5, left: 6, upleft: 7 }
// あるく ときの コマの じゅん（だん）：あるく・たつ・あるく・たつ
const WALK = [0, 1, 2, 1]

// 元の 色 → 役わり（テンプレートの パレット）
const ROLE = {
  "#705f5b": "line", "#645552": "eye",
  "#7b6762": "hairDark", "#8c7369": "hair", "#9d866f": "hairMid", "#b2a486": "hairLight",
  "#e8cfa6": "skin", "#dcb98a": "skinShade", "#f3e5c2": "skinLight",
  "#a4c263": "top", "#8db15d": "topShade", "#78a158": "topDark", "#d2e077": "topLight",
  "#c0d470": "bottom",
  "#f3f2c0": "shoesLight", "#ded9ab": "shoes", "#c4bc93": "shoesDark"
}
const INK = [78, 52, 72]
const ROLE_OF = new Map(Object.entries(ROLE).map(([hex, role]) => [rgbOf(hex).join(), role]))
function rgbOf(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function measureHeads(d, stride, roleOf) {
  const heads = []
  for (let r = 0; r < 3; r++) {
    heads[r] = []
    for (let col = 0; col < 8; col++) {
      let top = -1, chin = 22, left = 99, right = -1
      for (let y = 0; y < FH; y++) {
        let rowHasTop = false
        for (let x = 0; x < FW; x++) {
          const i = ((r * FH + y) * stride + col * FW + x) * 4
          if (!d[i + 3]) continue
          const role = roleOf.get(`${d[i]},${d[i + 1]},${d[i + 2]}`) || ""
          if (role.startsWith("top")) rowHasTop = true
        }
        if (rowHasTop) { chin = y - 1; break }
        for (let x = 0; x < FW; x++) {
          const i = ((r * FH + y) * stride + col * FW + x) * 4
          if (!d[i + 3]) continue
          if (top < 0) top = y
          left = Math.min(left, x)
          right = Math.max(right, x)
        }
      }
      heads[r][col] = { top: Math.max(top, 0), chin, left, right }
    }
  }
  return heads
}

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const WHITE = [255, 255, 255]

function paletteFor(spec) {
  const hair = rgb(spec.hair), skin = rgb(spec.skin), top = rgb(spec.top), bottom = rgb(spec.bottom), shoes = rgb(spec.shoes)
  return {
    line: mix(hair, INK, 0.7), eye: INK,
    hairDark: mix(hair, INK, 0.35), hair: mix(hair, INK, 0.15), hairMid: hair, hairLight: mix(hair, WHITE, 0.35),
    skin, skinShade: mix(skin, INK, 0.18), skinLight: mix(skin, WHITE, 0.4),
    top, topShade: mix(top, INK, 0.15), topDark: mix(top, INK, 0.3), topLight: mix(top, WHITE, 0.3),
    bottom, bottomDark: mix(bottom, INK, 0.25),
    shoesLight: mix(shoes, WHITE, 0.3), shoes, shoesDark: mix(shoes, INK, 0.25)
  }
}

const cache = new Map()
// 色を おきかえた 画像（ぜんぶの コマ）と、コマごとの 頭の いちばん 上
export function humanSheet(sheet, spec) {
  const key = JSON.stringify(spec)
  if (cache.has(key)) return cache.get(key)
  const c = document.createElement("canvas")
  c.width = FW * 8
  c.height = FH * 3
  const g = c.getContext("2d")
  g.drawImage(sheet, 0, 0)
  const img = g.getImageData(0, 0, c.width, c.height)
  const d = img.data
  const pal = paletteFor(spec)
  const roleOf = ROLE_OF
  // コマごとの 頭（てっぺん・あご・左右）。色を かえる 前に はかる
  const heads = measureHeads(d, c.width, roleOf)
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4
      if (!d[i + 3]) continue
      let role = roleOf.get(`${d[i]},${d[i + 1]},${d[i + 2]}`)
      if (!role) continue
      // あし の あたりの 「hair」色は ズボンの かげ（テンプレートで 同じ 色を つかっている）
      if (role === "hair" && y % FH >= 25) role = "bottomDark"
      const to = pal[role]
      d[i] = to[0]; d[i + 1] = to[1]; d[i + 2] = to[2]
    }
  }
  g.putImageData(img, 0, 0)
  const tops = []
  for (let r = 0; r < 3; r++) {
    tops[r] = []
    for (let col = 0; col < 8; col++) {
      let t = 10
      outer: for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
        if (d[((r * FH + y) * c.width + col * FW + x) * 4 + 3]) { t = y; break outer }
      }
      tops[r][col] = t
    }
  }
  const out = { canvas: c, tops, heads }
  cache.set(key, out)
  return out
}

// ---- 髪型（テンプレートは みじかい ツンツン頭。ほかの 髪型は 頭の 大きさに あわせて 髪を 足す） ----
const FRONT = new Set(["down", "downleft", "downright"])
const BACK = new Set(["up", "upleft", "upright"])
// 横・ななめ の とき、うしろがわ（顔の 反対）は 左？
const backIsLeft = (dir) => dir.includes("right")

// 髪の 形は「1だん ごとの はば」で 書く（先が 細く まるく なる）。x0 は 左はし、widths は 上から
function strand(set, x0, y0, widths, alignRight = false) {
  widths.forEach((w, k) => {
    for (let i = 0; i < w; i++) set.add(`${alignRight ? x0 - i : x0 + i},${y0 + k}`)
  })
}

// { behind（体の 前に 描く）, front（体の あと）, ties（むすびめ） }。座標は コマの 中
function hairShapes(style, dir, head) {
  const behind = new Set()
  const front = new Set()
  const ties = []
  const { top, chin, left, right } = head
  const cx = Math.round((left + right) / 2)
  const side = !FRONT.has(dir) && !BACK.has(dir)
  const eye = top + Math.round((chin - top) * 0.55) // 目の 高さ くらい
  if (style === "bob" || style === "long") {
    const lock = style === "bob" ? [2, 2, 2, 2, 2, 1] : [2, 2, 2, 2, 2, 2, 2]
    const tail = style === "long" ? [3, 3, 3, 3, 3, 2, 2, 1] : []
    if (BACK.has(dir)) {
      // うしろ：頭の 下に 髪が 広がる
      const rows = style === "bob" ? 3 : 6
      for (let k = 0; k < rows; k++) {
        const inset = k >= rows - 2 ? k - (rows - 3) : 0
        for (let x = left + 1 + inset; x <= right - 1 - inset; x++) front.add(`${x},${chin - 1 + k}`)
      }
    } else if (side) {
      const back = backIsLeft(dir)
      strand(front, back ? left : right, eye - 2, lock, !back)
      if (tail.length) strand(behind, back ? left - 1 : right + 1, chin - 1, tail, !back)
    } else {
      strand(front, left, eye - 2, lock)
      strand(front, right, eye - 2, lock, true)
      if (tail.length) { strand(behind, left - 1, chin - 1, tail); strand(behind, right + 1, chin - 1, tail, true) }
    }
  } else if (style === "twin") {
    const tail = [2, 3, 3, 3, 2, 2, 1]
    const y0 = eye - 2
    if (!(side && !backIsLeft(dir))) { strand(behind, left - 1, y0, tail, true); ties.push([left - 2, y0]) }
    if (!(side && backIsLeft(dir))) { strand(behind, right + 1, y0, tail); ties.push([right + 1, y0]) }
  } else if (style === "pony") {
    const tail = [2, 3, 3, 2, 2, 2, 1]
    if (BACK.has(dir)) { strand(front, cx - 1, top + 5, tail); ties.push([cx - 1, top + 4]) }
    else if (side) {
      const back = backIsLeft(dir)
      strand(behind, back ? left - 1 : right + 1, top + 3, tail, back)
      ties.push([back ? left - 2 : right + 1, top + 2])
    }
  } else if (style === "bun") {
    strand(front, cx - 1, top - 3, [2, 4, 4])
    for (const k of [...front]) { const [x, y] = k.split(",").map(Number); if (y === top - 2 || y === top - 1) front.add(`${x - 1},${y}`) }
  }
  return { behind, front, ties }
}

function drawHair(g, set, ox, oy, pal) {
  if (!set.size) return
  const has = (x, y) => set.has(`${x},${y}`)
  const px = (c, x, y) => { g.fillStyle = `rgb(${c.join()})`; g.fillRect(ox + x, oy + y, 1, 1) }
  for (const k of set) {
    const [x, y] = k.split(",").map(Number)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!has(x + dx, y + dy)) px(pal.line, x + dx, y + dy)
  }
  for (const k of set) {
    const [x, y] = k.split(",").map(Number)
    let c = pal.hairMid
    if (!has(x + 1, y) || !has(x, y + 1)) c = pal.hairDark
    else if (!has(x - 1, y) && !has(x, y - 1)) c = pal.hairLight
    px(c, x, y)
  }
}

// 動いた 向き → 8方向
export function facing8(dx, dy, prev = "down") {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return prev
  const a = Math.atan2(dy, dx) // 右が 0、下が +
  const names = ["right", "downright", "down", "downleft", "left", "upleft", "up", "upright"]
  return names[(Math.round(a / (Math.PI / 4)) + 8) % 8]
}

// 人の アバターを 描く。x, y は 足もと。opts：{ dir, walking, t（秒）, look（Dettyan など。データの かわり） }
export function drawHuman(g, sheet, x, y, raw, { dir = "down", walking = false, t = 0, look = null } = {}) {
  const a = normalizeAvatar(raw)
  const spec = look ? { skin: look.skin, hair: look.hair, top: look.top, bottom: look.bottom, shoes: look.shoes || look.bottom }
    : { skin: CHIBI_SKINS[a.skin], hair: CHIBI_HAIRS[a.hairColor], top: CHIBI_CLOTHS[a.topColor], bottom: CHIBI_CLOTHS[a.bottomColor], shoes: CHIBI_CLOTHS[a.shoes] }
  const acc = look?.acc || a.acc
  const style = look?.style || a.hair
  const { canvas, tops, heads } = humanSheet(sheet, spec)
  const col = COLUMNS[dir] ?? 4
  const row = walking ? WALK[Math.floor(t * 8) % 4] : 1
  const left = Math.round(x - ANCHOR_X)
  const top = Math.round(y - ANCHOR_Y)
  const shapes = hairShapes(style, dir, heads[row][col])
  const pal = paletteFor(spec)
  drawHair(g, shapes.behind, left, top, pal)
  g.drawImage(canvas, col * FW, row * FH, FW, FH, left, top, FW, FH)
  drawHair(g, shapes.front, left, top, pal)
  if (style === "twin" && !BACK.has(dir)) {
    // ツインテールの むすびめ（リボン）
    g.fillStyle = "#f28aa8"
    const h = heads[row][col]
    if (!(dir.includes("right") && !dir.startsWith("down") && !dir.startsWith("up"))) g.fillRect(left + h.left - 2, top + h.top + 3, 2, 1)
    if (!(dir === "left")) g.fillRect(left + h.right + 1, top + h.top + 3, 2, 1)
  }
  if (acc && acc !== "none") drawAccessory(g, acc, x, top + tops[row][col])
}
