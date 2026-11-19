// 🧑 人の アバター（Cup Nooble の 人の テンプレート。Sprout Sorry pack の Tests/free_character_spritesheet_by-cupnooble.png）
// - 1コマ 16×32。よこ 8列 ＝ 8方向、たて 3だん ＝ あるく・たつ・あるく
// - 髪・はだ・服・ズボン・くつ の 色を その人の キャラの 色に おきかえる（色の 表は avatar_chibi.js と 同じ）
// - こもの は avatar_teemo.js と 同じ 絵を 頭に 重ねる
// - Sprout Sorry pack は 非商用 ライセンス。この アプリは 非商用 と ayaribon が 判断（2026-11-18）。クレジット：Cup Nooble
// Assets - From: Sprout Lands - By: Cup Nooble

import { normalizeAvatar, HUMAN_HAIRSTYLES, DEFAULT_HAIRSTYLE, AVATAR_EQUIP, AVATAR_DRAW_ORDER, AVATAR_SAVE_KEYS, avatarAssetKey } from "avatar_sprite"
import { CHIBI_SKINS, CHIBI_HAIRS, CHIBI_CLOTHS } from "avatar_chibi"
import { drawAccessory } from "avatar_teemo"

// 💇 髪型の パーツ画像（docs/town/hair_parts_spec.md。S3 の game_assets/sprout_hair/）。キャラの 髪型 id → ファイル名
// ない 髪型・画像が ないときは、頭の 大きさに あわせて 髪を 足す（下の hairShapes）
export const HAIR_PARTS = { bob: "short_bob", blunt: "blunt_bob", long: "long_straight", twin: "twin_tails", pony: "ponytail", braid: "braids", wolf: "wolf_cut" }
const PART_ROLE = { "#42353a": "line", "#695154": "hairDark", "#97756f": "hairMid", "#be9d89": "hairLight" }

// 💇 髪型の ちがい と 🎀 こもの は いったん 保留（2026-11-19 ayaribon）。true に すると もどる
export const USE_HAIR_VARIANTS = false
export const USE_ACCESSORIES = false

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

// 頭の なかの 髪の 色を 消して、まわりが 消えた ふち も 消す
function removeHair(d, stride, roleOf, heads) {
  const isHair = (role) => role === "hairDark" || role === "hair" || role === "hairMid" || role === "hairLight"
  for (let r = 0; r < 3; r++) for (let col = 0; col < 8; col++) {
    const { chin } = heads[r][col]
    const at = (x, y) => ((r * FH + y) * stride + col * FW + x) * 4
    for (let y = 0; y < chin; y++) for (let x = 0; x < FW; x++) {
      const i = at(x, y)
      if (d[i + 3] && isHair(roleOf.get(`${d[i]},${d[i + 1]},${d[i + 2]}`))) d[i + 3] = 0
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < chin; y++) for (let x = 0; x < FW; x++) {
        const i = at(x, y)
        if (!d[i + 3] || roleOf.get(`${d[i]},${d[i + 1]},${d[i + 2]}`) !== "line") continue
        let solid = false
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || ny < 0 || nx >= FW || ny >= FH) continue
          const j = at(nx, ny)
          if (d[j + 3] && roleOf.get(`${d[j]},${d[j + 1]},${d[j + 2]}`) !== "line") solid = true
        }
        if (!solid) d[i + 3] = 0
      }
    }
  }
}

// 髪の パーツ画像を その人の 髪の 色に（おぼえておく）
const partCache = new Map()
function recolorPart(img, pal, key) {
  if (partCache.has(key)) return partCache.get(key)
  const c = document.createElement("canvas")
  c.width = FW * 8
  c.height = FH * 3
  const g = c.getContext("2d")
  g.drawImage(img, 0, 0)
  const data = g.getImageData(0, 0, c.width, c.height)
  const d = data.data
  const map = new Map(Object.entries(PART_ROLE).map(([hex, role]) => [rgbOf(hex).join(), pal[role]]))
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue
    const to = map.get(`${d[i]},${d[i + 1]},${d[i + 2]}`)
    if (to) { d[i] = to[0]; d[i + 1] = to[1]; d[i + 2] = to[2] }
  }
  g.putImageData(data, 0, 0)
  partCache.set(key, c)
  return c
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
// bald：テンプレートの 髪を 消す（髪の パーツを 重ねる とき）
export function humanSheet(sheet, spec, { bald = false } = {}) {
  const key = JSON.stringify(spec) + (bald ? "|bald" : "")
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
  if (bald) removeHair(d, c.width, roleOf, heads)
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
// ---- 💇 素体＋髪レイヤー（ハンドオフの layers/。素体に hair_original を 重ねると テンプレートと 同じ） ----
// 元の 色 → 役わり（layers/palettes.json の source）
const BASE_ROLE = {
  "#dcb98a": "skinShade", "#e8cfa6": "skin", "#f3e5c2": "skinLight", "#645552": "eye",
  "#78a158": "topDark", "#8db15d": "topShade", "#a4c263": "top", "#c0d470": "topMid", "#d2e077": "topLight",
  "#7b6762": "bottomDark", "#8c7369": "bottom",
  "#f3f2c0": "shoesLight", "#ded9ab": "shoes", "#c4bc93": "shoesDark"
}
// マンバン には まゆげ（目と 同じ 色）が ある。目の 色と そろえる
const HAIR_LAYER_ROLE = { "#705f5b": "line", "#7b6762": "hairDark", "#8c7369": "hair", "#9d866f": "hairMid", "#b2a486": "hairLight", "#645552": "eye" }

// 🧑‍💼 Dettyan（町・育成ゲーム）：黒髪 マンバン・いつもの服（costume_dettyan）。そうびは equip（枠 → id）で かさねる
//   brows：まゆげ（2026-11-19 に ayaribon が「Dettyan は まゆげ つけといて」。髪の 画像に なくても 描く）
export const DETTYAN_LOOK = { skin: "#f7e0cf", hair: "#3a3242", top: "#8a5a33", bottom: "#3a3a4a", shoes: "#4a3a32", acc: "manbun", hs: "manbun", brows: true, equip: { costume: "dettyan", brows: "normal" } }

// まゆげの 場所（向き の 列 → 立ちの コマ での 場所。hair_manbun.png の まゆげ と 同じ）。歩く コマは 目の 高さに あわせて ずらす
const BROWS = { 2: [[10, 18]], 3: [[7, 17], [8, 17]], 4: [[4, 18], [5, 18], [9, 18], [10, 18]], 5: [[6, 17], [7, 17]], 6: [[4, 18]] }
const EYE_RGB = [0x64, 0x55, 0x52]

// コマ ごとの 目の いちばん上（素体の 画像から 1回だけ しらべる）
function eyeTops(layers) {
  if (layers.eyeTops) return layers.eyeTops
  const c = document.createElement("canvas")
  c.width = FW * 8
  c.height = FH * 3
  const g = c.getContext("2d")
  g.drawImage(layers.body, 0, 0)
  const d = g.getImageData(0, 0, c.width, c.height).data
  const tops = {}
  for (let row = 0; row < 3; row++) for (let col = 0; col < 8; col++) {
    for (let y = 0; y < FH && tops[`${col},${row}`] === undefined; y++) for (let x = 0; x < FW; x++) {
      const i = ((row * FH + y) * c.width + col * FW + x) * 4
      if (d[i + 3] && d[i] === EYE_RGB[0] && d[i + 1] === EYE_RGB[1] && d[i + 2] === EYE_RGB[2]) { tops[`${col},${row}`] = y; break }
    }
  }
  layers.eyeTops = tops
  return tops
}

function drawBrows(g, layers, col, row, left, top, color) {
  const pos = BROWS[col]
  if (!pos) return
  const tops = eyeTops(layers)
  const dy = (tops[`${col},${row}`] ?? 0) - (tops[`${col},1`] ?? 0)
  g.fillStyle = `rgb(${color.join(",")})`
  for (const [x, y] of pos) g.fillRect(left + x, top + y + dy, 1, 1)
}

const layerCache = new Map()
function recolorLayer(img, roles, pal, key) {
  if (layerCache.has(key)) return layerCache.get(key)
  const c = document.createElement("canvas")
  c.width = FW * 8
  c.height = FH * 3
  const g = c.getContext("2d")
  g.drawImage(img, 0, 0)
  const data = g.getImageData(0, 0, c.width, c.height)
  const d = data.data
  const map = new Map(Object.entries(roles).map(([hex, role]) => [rgbOf(hex).join(), pal[role]]))
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue
    const to = map.get(`${d[i]},${d[i + 1]},${d[i + 2]}`)
    if (to) { d[i] = to[0]; d[i + 1] = to[1]; d[i + 2] = to[2] }
  }
  g.putImageData(data, 0, 0)
  layerCache.set(key, c)
  return c
}

// 読みこんだ 画像 → { base, hairs: { id: 画像 }, body, shoes, items: { 枠: { id: 画像 } } }
//   body（体だけ）と ふだん着 が あれば 装備の 枠ごとに 重ねる。なければ base（体＋服＋くつ）に 髪だけ
export function avatarLayersOf(images) {
  if (!images?.avatar_base && !images?.avatar_body_base) return null
  const hairs = {}
  for (const h of HUMAN_HAIRSTYLES) if (h.file && images[`avatar_hair_${h.id}`]) hairs[h.id] = images[`avatar_hair_${h.id}`]
  const items = {}
  for (const [slot, s] of Object.entries(AVATAR_EQUIP)) {
    items[slot] = {}
    for (const it of s.items) {
      if (!it.file) continue
      const img = images[avatarAssetKey(it.file)]
      if (img) items[slot][it.id] = img
    }
  }
  const slots = images.avatar_body_base && items.costume.default && items.shoes.default
  return { base: images.avatar_base || null, hairs, body: slots ? images.avatar_body_base : null, items }
}

const itemOf = (slot, id) => AVATAR_EQUIP[slot]?.items.find((it) => it.id === id)

const FACING_AWAY = new Set(["up", "upright", "upleft"])

// 装備の 枠の じゅんに 重ねる（ない 枠・知らない id・画像が ない ものは 描かない）
function drawSlots(g, layers, a, look, spec, pal, dir, sx, sy, left, top) {
  const colorKey = JSON.stringify(spec)
  // その 枠の アイテム：Dettyan などは look.equip、町の キャラは 保存の キー（costume・hat・accessory）
  const pick = (slot) => {
    const id = look?.equip?.[slot] ?? (AVATAR_SAVE_KEYS[slot] ? a[AVATAR_SAVE_KEYS[slot]] : undefined) ?? AVATAR_EQUIP[slot]?.def
    return layers.items[slot]?.[id] ? id : AVATAR_EQUIP[slot]?.def // 画像が ない ものは 初めの もの
  }
  const hidden = new Set()
  for (const slot of Object.keys(AVATAR_EQUIP)) for (const h of itemOf(slot, pick(slot))?.hides || []) hidden.add(h)
  const put = (img) => g.drawImage(img, sx, sy, FW, FH, left, top, FW, FH)
  for (const slot of AVATAR_DRAW_ORDER[FACING_AWAY.has(dir) ? "facingAway" : "default"]) {
    if (hidden.has(slot)) continue
    if (slot === "body") put(recolorLayer(layers.body, BASE_ROLE, pal, `body|${colorKey}`))
    else if (slot === "shoes") {
      const id = pick("shoes")
      put(id === "default" ? recolorLayer(layers.items.shoes.default, BASE_ROLE, pal, `shoes|${colorKey}`) : layers.items.shoes[id])
    } else if (slot === "hair") {
      const hs = look?.hs || a.hs || DEFAULT_HAIRSTYLE
      const img = layers.hairs[hs] || (hs === "bald" ? null : layers.hairs[DEFAULT_HAIRSTYLE])
      if (img) put(recolorLayer(img, HAIR_LAYER_ROLE, pal, `hair|${hs}|${spec.hair}`))
      // まゆげの 画像（brows_normal）が まだ ないときは コードで 描く（Dettyan）
      if (look?.brows && !layers.items.brows?.normal) drawBrows(g, layers, sx / FW, sy / FH, left, top, pal.eye)
    } else if (slot === "costume") {
      // ふだん着 だけ 色が かわる（ほかは 色が きまった 画像）
      const id = pick("costume")
      const img = layers.items.costume[id]
      put(id === "default" ? recolorLayer(img, BASE_ROLE, pal, `costume|${colorKey}`) : img)
    } else {
      const id = pick(slot)
      const img = layers.items[slot]?.[id]
      if (!img) continue
      // 顔の パーツ：はだ・目（base）や 髪（hair）の 色に あわせる
      const rc = AVATAR_EQUIP[slot]?.recolor
      if (rc === "base") put(recolorLayer(img, BASE_ROLE, pal, `${slot}|${id}|${colorKey}`))
      else if (rc === "hair") put(recolorLayer(img, HAIR_LAYER_ROLE, pal, `${slot}|${id}|${spec.hair}`))
      else put(img)
    }
  }
}

// parts：{ ファイル名: { back: 画像, front: 画像 } }（髪の パーツ。なければ 足した 髪）
// layers：{ base, hairs }（素体＋髪レイヤー。あれば これが いちばん 先）
export function drawHuman(g, sheet, x, y, raw, { dir = "down", walking = false, t = 0, look = null, parts = null, layers = null } = {}) {
  const a = normalizeAvatar(raw)
  const spec = look ? { skin: look.skin, hair: look.hair, top: look.top, bottom: look.bottom, shoes: look.shoes || look.bottom }
    : { skin: CHIBI_SKINS[a.skin], hair: CHIBI_HAIRS[a.hairColor], top: CHIBI_CLOTHS[a.topColor], bottom: CHIBI_CLOTHS[a.bottomColor], shoes: CHIBI_CLOTHS[a.shoes] }
  const acc = look?.acc || a.acc
  const style = look?.style || a.hair
  const col = COLUMNS[dir] ?? 4
  const row = walking ? WALK[Math.floor(t * 8) % 4] : 1
  const left = Math.round(x - ANCHOR_X)
  const top = Math.round(y - ANCHOR_Y)
  const pal = paletteFor(spec)
  if (layers?.base || layers?.body) {
    // 💇 素体 → 髪レイヤー（髪型は hs。Dettyan は look.hs）
    const hs = look?.hs || a.hs || DEFAULT_HAIRSTYLE
    const colorKey = JSON.stringify(spec)
    pal.topMid = mix(rgb(spec.top), WHITE, 0.15)
    if (layers.body) return drawSlots(g, layers, a, look, spec, pal, dir, col * FW, row * FH, left, top)
    const base = recolorLayer(layers.base, BASE_ROLE, pal, `base|${colorKey}`)
    g.drawImage(base, col * FW, row * FH, FW, FH, left, top, FW, FH)
    const hairImg = layers.hairs[hs] || (hs === "bald" ? null : layers.hairs[DEFAULT_HAIRSTYLE])
    if (hairImg) {
      const hair = recolorLayer(hairImg, HAIR_LAYER_ROLE, pal, `hair|${hs}|${spec.hair}`)
      g.drawImage(hair, col * FW, row * FH, FW, FH, left, top, FW, FH)
    }
    return
  }
  const stem = USE_HAIR_VARIANTS ? HAIR_PARTS[style] : null
  const part = stem && parts?.[stem]
  let tops
  if (part?.back && part?.front) {
    // 💇 パーツ：うしろ → 髪を 消した 体 → まえ
    const body = humanSheet(sheet, spec, { bald: true })
    tops = body.tops
    const back = recolorPart(part.back, pal, `${stem}|back|${spec.hair}`)
    const front = recolorPart(part.front, pal, `${stem}|front|${spec.hair}`)
    g.drawImage(back, col * FW, row * FH, FW, FH, left, top, FW, FH)
    g.drawImage(body.canvas, col * FW, row * FH, FW, FH, left, top, FW, FH)
    g.drawImage(front, col * FW, row * FH, FW, FH, left, top, FW, FH)
  } else {
    const body = humanSheet(sheet, spec)
    tops = body.tops
    const shapes = hairShapes(USE_HAIR_VARIANTS ? style : "short", dir, body.heads[row][col])
    drawHair(g, shapes.behind, left, top, pal)
    g.drawImage(body.canvas, col * FW, row * FH, FW, FH, left, top, FW, FH)
    drawHair(g, shapes.front, left, top, pal)
    g.fillStyle = "#f28aa8" // むすびめ の リボン
    for (const [rx, ry] of shapes.ties) g.fillRect(left + rx, top + ry, 2, 2)
  }
  if (USE_ACCESSORIES && acc && acc !== "none") drawAccessory(g, acc, x, top + tops[row][col])
}
