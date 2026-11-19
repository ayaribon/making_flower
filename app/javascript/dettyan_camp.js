// ⛺ まちはずれの テント（マイホームを買う前の すまい）と、おはなし の けしき（はじまりのまち・ひかる画面）
// 128×96 ドット。動かないところは create〜() で1回だけ描き、動くところ（たき火・空）は毎コマ描く
// 空の色は dettyan_room.js と同じ（日本の時間で 朝・昼・夕方・夜）

import { seededRandom } from "dettyan_adventure"
import { timeOfDay, SKY, glow } from "dettyan_room"

const W = 128
const H = 96
const HORIZON = 42

export const FIRE = { x: 64, y: 70 }            // たき火（y：足もとの高さ。Dettyan と前後が入れかわる）
export const CAMP_SING_SPOT = { x: 90, y: 80 }  // たき火の そばで 歌う
// ほこり の代わりに 落ち葉 が たまる場所
export const LEAF_SPOTS = [[22, 62], [104, 86], [40, 90], [118, 66], [76, 88]]

const px = (g, color, x, y, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), w, h) }

function disc(g, cx, cy, r, color) {
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(r * r - y * y + r * 0.6))
    px(g, color, cx - w, cy + y, w * 2 + 1, 1)
  }
}

function oval(g, cx, cy, rx, ry, color) {
  for (let y = -ry; y <= ry; y++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))))
    px(g, color, cx - w, cy + y, w * 2 + 1, 1)
  }
}

// ---- テント ----
export function createCamp() {
  const c = document.createElement("canvas")
  c.width = W
  c.height = H
  const g = c.getContext("2d")
  const rand = seededRandom(1117)
  // 地面（くさ）
  for (let y = HORIZON; y < H; y++) px(g, y < 50 ? "#6fae5a" : y < 70 ? "#64a452" : "#5a9a4a", 0, y, W, 1)
  for (let i = 0; i < 140; i++) px(g, rand() < 0.5 ? "#4f8a40" : "#82c06a", rand() * W, HORIZON + 2 + rand() * (H - HORIZON - 2), 1, 2)
  // たき火のまわりの つち
  oval(g, FIRE.x, FIRE.y - 2, 16, 6, "#8a6a44")
  oval(g, FIRE.x, FIRE.y - 2, 13, 4, "#9a7a50")
  // 小さな花
  for (let i = 0; i < 12; i++) {
    const fx = rand() * W
    const fy = 52 + rand() * 40
    if (Math.abs(fx - FIRE.x) < 20 && Math.abs(fy - FIRE.y) < 10) continue
    px(g, ["#ffffff", "#ffd84d", "#ff8ac6"][i % 3], fx, fy, 1, 1)
  }
  // 木（左右のはし）
  for (const [tx, r] of [[4, 11], [124, 12]]) {
    px(g, "#1a1414", tx - 3, 22, 7, 30)
    px(g, "#5e3a1f", tx - 2, 22, 5, 30)
    disc(g, tx, 18, r + 1, "#1a1414")
    disc(g, tx, 18, r, "#3f8a4a")
    disc(g, tx - 3, 14, r - 4, "#55a85e")
  }
  // ねぶくろ
  px(g, "#1a1414", 47, 47, 17, 6)
  px(g, "#3f6fd0", 48, 48, 15, 4)
  px(g, "#5a8ae8", 48, 48, 15, 1)
  px(g, "#e8e0d0", 59, 48, 4, 4)
  // テント
  const tx = 30
  for (let i = 0; i <= 26; i++) {
    const w = Math.round(i * 0.75)
    px(g, "#1a1414", tx - w - 1, 24 + i, w * 2 + 3, 1)
    px(g, i % 6 < 3 ? "#e8963a" : "#f0a848", tx - w, 24 + i, w * 2 + 1, 1)
    px(g, "#c87a2a", tx + w - 2, 24 + i, 2, 1) // かげ
  }
  // 入り口（すこし あいている）
  for (let i = 0; i <= 14; i++) {
    const w = Math.round(i * 0.4)
    px(g, "#3a2414", tx - w, 36 + i, w * 2 + 1, 1)
  }
  px(g, "#f4c070", tx - 7, 46, 3, 4) // 入り口の めくれ
  // ロープ と くい
  for (const [x1, x2] of [[tx, 6], [tx, 54]]) {
    const n = Math.abs(x2 - x1)
    for (let i = 0; i <= n; i++) px(g, "#d8c8a0", x1 + Math.sign(x2 - x1) * i, 24 + (i / n) * 26, 1, 1)
    px(g, "#5e3a1f", x2, 50, 1, 3)
  }
  // まるた の いす
  px(g, "#1a1414", 78, 63, 20, 6)
  px(g, "#8a5a33", 79, 64, 18, 4)
  px(g, "#b07a48", 79, 64, 18, 1)
  oval(g, 97, 66, 1, 2, "#d8b080")
  // なべ
  px(g, "#1a1414", 44, 63, 8, 6)
  px(g, "#4a4a58", 45, 64, 6, 4)
  px(g, "#7a7a8a", 45, 64, 6, 1)
  return c
}

// 空・遠くの まち（毎コマ。時間で かわる）
export function drawCampSky(g, now, t) {
  const tod = timeOfDay(now)
  const bands = SKY[tod]
  for (let y = 0; y < HORIZON; y++) px(g, bands[Math.min(bands.length - 1, Math.floor((y / HORIZON) * bands.length))], 0, y, W, 1)
  const rand = seededRandom(5)
  if (tod === "night") {
    for (let i = 0; i < 26; i++) {
      const sx = rand() * W
      const sy = rand() * 26
      if (Math.sin(t * 2 + i * 1.3) > -0.4) px(g, i % 5 ? "#c8d0ff" : "#ffffff", sx, sy, 1, 1)
    }
    disc(g, 100, 9, 4, "#fff6c0")
    disc(g, 102, 8, 3, SKY.night[0])
  } else {
    if (tod !== "evening") disc(g, 104, 10, 4, tod === "day" ? "#fff6c0" : "#ffb070")
    for (let i = 0; i < 3; i++) {
      const cx = ((rand() * W + t * (1.5 + i * 0.6)) % (W + 30)) - 15
      const cy = 6 + i * 7
      const col = tod === "evening" ? "#ffc0a0" : "#ffffff"
      px(g, col, cx, cy, 12, 2)
      px(g, col, cx + 3, cy - 1, 6, 1)
    }
  }
  // 遠くの おか と はじまりのまち
  const hill = tod === "night" ? "#1f3a2a" : tod === "evening" ? "#5a5a3a" : "#7cb86a"
  for (let x = 0; x < W; x++) {
    const h = Math.round(4 + Math.sin(x * 0.07) * 2 + Math.sin(x * 0.19) * 1)
    px(g, hill, x, HORIZON - h, 1, h)
  }
  const town = tod === "night" ? "#232848" : tod === "evening" ? "#6a4a5a" : "#9ab0c8"
  const r2 = seededRandom(9)
  for (let x = 58; x < 120; x += 7) {
    const bh = 5 + Math.floor(r2() * 5)
    px(g, town, x, HORIZON - 4 - bh, 6, bh)
    for (let i = 0; i < 4; i++) px(g, town, x + 1 + (i < 2 ? i : 3 - i), HORIZON - 4 - bh - 1 - (i % 2), 2, 1) // やね
    if (tod === "night" && r2() < 0.7) px(g, "#ffd86a", x + 2, HORIZON - 2 - bh, 1, 1)
  }
  // 時計台
  px(g, town, 86, HORIZON - 20, 5, 16)
  px(g, town, 87, HORIZON - 23, 3, 3)
  px(g, tod === "night" ? "#ffd86a" : "#f4f1ea", 87, HORIZON - 17, 3, 3)
  px(g, "#e0484d", 88, HORIZON - 27, 1, 4)
}

// たき火（ぱちぱち ゆれる）。足もとの高さ FIRE.y で Dettyan と前後を入れかえる
export function drawCampfire(g, now, t) {
  const { x, y } = FIRE
  // 石
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    px(g, i % 2 ? "#7a7a7a" : "#9a9a9a", x + Math.cos(a) * 7 - 1, y - 3 + Math.sin(a) * 2.5, 3, 2)
  }
  // まき
  px(g, "#1a1414", x - 6, y - 5, 13, 3)
  px(g, "#6e4423", x - 5, y - 4, 11, 1)
  px(g, "#5e3a1f", x - 2, y - 6, 5, 2)
  // ほのお
  const f = ((Math.floor(t * 9) % 3) + 3) % 3 // t が マイナスでも 0〜2
  const flame = [
    ["...r...", "..ror..", ".rooor.", "royyyor", ".ryyyr."],
    ["..r....", "..rr.r.", ".roorr.", "royyyor", ".ryyyr."],
    ["....r..", ".r.ro..", ".rooor.", "royyoor", ".ryyyr."]
  ][f]
  const colors = { r: "#e0484d", o: "#ff9a3a", y: "#ffe066" }
  flame.forEach((row, yy) => {
    for (let xx = 0; xx < row.length; xx++) if (row[xx] !== ".") px(g, colors[row[xx]], x - 3 + xx, y - 11 + yy, 1, 1)
  })
  // 火のこ
  for (let i = 0; i < 3; i++) {
    const p = (t * 0.7 + i / 3) % 1
    g.globalAlpha = 1 - p
    px(g, "#ffd84a", x - 2 + i * 2 + Math.sin(t * 4 + i) * 2, y - 12 - p * 14, 1, 1)
  }
  g.globalAlpha = 1
  // あかり（夕方・夜は 大きく）
  const tod = timeOfDay(now)
  glow(g, x, y - 7, tod === "night" ? 30 : tod === "evening" ? 22 : 12, "255, 170, 80", tod === "night" ? 0.07 : 0.05)
}

// 夜は くらく（たき火の まわりだけ あかるい）
export function drawCampNight(g, now) {
  const tod = timeOfDay(now)
  if (tod !== "night" && tod !== "evening") return
  g.fillStyle = tod === "night" ? "rgba(10, 14, 40, 0.38)" : "rgba(60, 20, 40, 0.12)"
  g.fillRect(0, 0, W, H)
  if (tod === "night") glow(g, FIRE.x, FIRE.y - 8, 34, "255, 170, 80", 0.07)
}

// 落ち葉（テントでの「ほこり」）
export function drawLeaf(g, x, y) {
  px(g, "#c8963a", x - 2, y - 2, 4, 2)
  px(g, "#e0b050", x - 1, y - 3, 2, 1)
  px(g, "#8a5a20", x - 1, y - 1, 3, 1)
}

// ---- おはなし の けしき ----

// はじまりのまち（町なみ・ふんすい・かんばん）
export function createTown() {
  const c = document.createElement("canvas")
  c.width = W
  c.height = H
  const g = c.getContext("2d")
  const rand = seededRandom(77)
  // 空
  const bands = SKY.day
  for (let y = 0; y < 50; y++) px(g, bands[Math.min(bands.length - 1, Math.floor((y / 50) * bands.length))], 0, y, W, 1)
  for (const [cx, cy] of [[22, 8], [92, 14]]) {
    px(g, "#ffffff", cx, cy, 14, 3)
    px(g, "#ffffff", cx + 4, cy - 2, 7, 2)
  }
  // いえ
  const houses = [
    { x: -2, w: 26, h: 30, wall: "#f0d8b0", roof: "#c0483a" },
    { x: 26, w: 22, h: 36, wall: "#d8e8f4", roof: "#3a6ab0" },
    { x: 80, w: 24, h: 32, wall: "#f4e0e8", roof: "#8a4ab0" },
    { x: 106, w: 24, h: 28, wall: "#e8f0d0", roof: "#3a8a4a" }
  ]
  for (const hs of houses) {
    const top = 58 - hs.h
    px(g, "#1a1414", hs.x - 1, top - 1, hs.w + 2, hs.h + 1)
    px(g, hs.wall, hs.x, top, hs.w, hs.h)
    for (let i = 0; i < 9; i++) px(g, hs.roof, hs.x - 2 + i, top - 1 - i, hs.w + 4 - i * 2, 1)
    px(g, "#5e3a1f", hs.x + Math.floor(hs.w / 2) - 3, 58 - 11, 6, 11)
    px(g, "#ffd84d", hs.x + Math.floor(hs.w / 2) + 1, 58 - 6, 1, 1)
    for (const wx of [hs.x + 3, hs.x + hs.w - 8]) {
      px(g, "#1a1414", wx - 1, top + 5, 7, 7)
      px(g, "#9fd6ff", wx, top + 6, 5, 5)
      px(g, "#ffffff", wx, top + 8, 5, 1)
    }
  }
  // 時計台（まんなかの おく）
  px(g, "#1a1414", 55, 4, 18, 50)
  px(g, "#e8dcc8", 56, 5, 16, 49)
  disc(g, 64, 16, 5, "#1a1414")
  disc(g, 64, 16, 4, "#ffffff")
  px(g, "#1a1414", 64, 13, 1, 4)
  px(g, "#1a1414", 64, 16, 3, 1)
  for (let i = 0; i < 6; i++) px(g, "#c0483a", 55 + i, 4 - i, 18 - i * 2, 1)
  px(g, "#e0484d", 64, -4, 1, 4)
  // いしだたみ の 道
  for (let y = 58; y < H; y++) px(g, y % 2 ? "#c8b898" : "#d0c0a0", 0, y, W, 1)
  for (let i = 0; i < 120; i++) px(g, rand() < 0.5 ? "#b0a080" : "#e0d4b8", rand() * W, 58 + rand() * 38, 3, 1)
  // ふんすい
  oval(g, 64, 74, 18, 6, "#1a1414")
  oval(g, 64, 74, 17, 5, "#a0a0b0")
  oval(g, 64, 73, 14, 3, "#5ec8ff")
  px(g, "#1a1414", 62, 60, 5, 12)
  px(g, "#c0c0d0", 63, 60, 3, 12)
  // かんばん（文字は 画面の ことば で出す）
  px(g, "#5e3a1f", 112, 62, 2, 20)
  px(g, "#1a1414", 98, 52, 28, 12)
  px(g, "#c8965a", 99, 53, 26, 10)
  for (let i = 0; i < 5; i++) px(g, "#5e3a1f", 102 + i * 4, 57, 2, 2)
  // まちの 人（シルエット）
  for (const [hx, col] of [[16, "#7a5aa0"], [40, "#3a8a6a"], [92, "#c0603a"]]) {
    px(g, "#1a1414", hx - 2, 62, 5, 10)
    px(g, col, hx - 1, 66, 3, 5)
    px(g, "#f6d3b3", hx - 1, 63, 3, 3)
  }
  return c
}

export function drawTownLive(g, t) {
  // ふんすいの 水しぶき
  for (let i = 0; i < 6; i++) {
    const p = (t * 1.2 + i / 6) % 1
    const dx = (i - 2.5) * 2.4 * p
    px(g, "#c8f0ff", 64 + dx, 60 - Math.sin(p * Math.PI) * 8, 1, 1)
  }
}

// まぶしく ひかる（もとの世界から とばされる）
export function drawFlash(g, t) {
  px(g, "#ffffff", 0, 0, W, H)
  g.fillStyle = "rgba(255, 230, 140, 0.5)"
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + t * 0.6
    for (let r = 6; r < 80; r += 2) g.fillRect(64 + Math.cos(a) * r, 48 + Math.sin(a) * r, 2, 2)
  }
  for (let i = 0; i < 10; i++) {
    const a = i * 2.4 + t
    px(g, "#ffd84d", 64 + Math.cos(a) * (20 + i * 3), 48 + Math.sin(a) * (14 + i * 2), 2, 2)
  }
}
