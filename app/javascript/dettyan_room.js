// 🏢 Dettyan の事務所の部屋の絵（128×96 ドット）
// - 動かないところ（かべ・ゆか・家具）は createRoom() で1回だけ描いておく
// - 動くところ（窓の外・時計・PC の画面・湯気・ON AIR・夜のあかり）は drawRoomLive() で毎コマ描く
// - いす・スピーカーは Dettyan と前後が入れかわるので、drawChair() / drawSpeaker() を足もとの高さの順に描く
// 窓の外と夜のあかりは、サーバーの時計の日本の時間で変わる（朝・昼・夕方・夜）

import { seededRandom } from "dettyan_adventure"

export const ROOM_W = 128
export const ROOM_H = 96
export const WALL_BOTTOM = 41 // ここから下がゆか

// 家具の場所
const WINDOW = { x: 18, y: 6, w: 26, h: 22 }        // 窓（わく の内がわ）
const CLOCK = { cx: 75, cy: 8, r: 4 }
const SHELF = { x: 66, y: 22, w: 18, h: 24 }        // 本だな（ゆかに置く）
const POSTER = { x: 50, y: 6, w: 14, h: 18 }
const REC = { x: 49, y: 27, w: 16, h: 7 }          // 録音中のランプ（歌っている間 つく）
export const DESK = { x: 86, top: 29, w: 38 }        // つくえ（上の板の高さ）
const MONITOR = { x: 93, y: 11, w: 20, h: 15 }       // 画面のわく
const SCREEN = { x: 95, y: 13, w: 16, h: 10 }
const LAMP = { x: 87, y: 17 }
const MUG = { x: 117, y: 25 }
export const CHAIR = { cx: 104, base: 59 }          // いす（base：足もとの高さ）
export const SPEAKER = { x: 3, base: 66 }
export const STAGE = { cx: 36, cy: 75 }              // 歌うところ（まるいラグ）

// Dettyan が いすに すわる場所（うしろすがた。left / top は Dettyan の絵の左上）
export const SEAT = { left: CHAIR.cx - 10, top: 25, x: CHAIR.cx, y: 49 }
// いすの前（ここまで歩いてから すわる）
export const WORK_SPOT = { x: CHAIR.cx, y: 63 }
export const SING_SPOT = { x: STAGE.cx, y: STAGE.cy + 3 }

const C = {
  K: "#1a1414",
  wall: "#efe3c8", wallStripe: "#e7d8b9", wallDot: "#dccaa5",
  molding: "#fff6e4", moldingShade: "#d9c7a2",
  wainscot: "#b98a5c", wainscotLight: "#cf9f6d", wainscotDark: "#93683f",
  base: "#6e4423", baseLight: "#8a5a33",
  floor: ["#c08a55", "#b8814c", "#c6915c", "#bb854f"], floorSeam: "#9a6a3a", floorShine: "#d3a06a",
  wood: "#6e4423", woodLight: "#8a5a33", woodDark: "#4a2c14",
  white: "#f4f1ea", whiteShade: "#d8d2c4",
  curtain: "#6fa3b8", curtainDark: "#4f8296", curtainLight: "#93c2d2",
  metal: "#2b2b35", metalLight: "#4a4a58", metalShine: "#7a7a8a",
  leaf: "#3f9a52", leafLight: "#6cc46e", leafDark: "#2a6e3a",
  pot: "#c46a3a", potDark: "#8a4422", potLight: "#e08a54"
}

const px = (g, color, x, y, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(x, y, w, h) }

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

// ふわっとした光（まるを重ねる）。rgb は "255, 200, 120" の形
export function glow(g, cx, cy, r, rgb, alpha) {
  g.fillStyle = `rgba(${rgb}, ${alpha})`
  for (let rr = r; rr > 2; rr -= Math.max(2, Math.round(r / 4))) disc(g, Math.round(cx), Math.round(cy), rr, g.fillStyle)
}

// 3×5 の小さな文字（ポスター・REC 用）
const FONT = {
  S: ["111", "100", "111", "001", "111"],
  i: ["1", "0", "1", "1", "1"],
  V: ["101", "101", "101", "101", "010"],
  A: ["010", "101", "111", "101", "101"],
  R: ["110", "101", "110", "101", "101"],
  E: ["111", "100", "110", "100", "111"],
  C: ["111", "100", "100", "100", "111"]
}

function text(g, str, x, y, color) {
  let cx = x
  for (const ch of str) {
    if (ch === " ") { cx += 2; continue }
    const glyph = FONT[ch]
    if (!glyph) continue
    glyph.forEach((row, yy) => {
      for (let xx = 0; xx < row.length; xx++) if (row[xx] === "1") px(g, color, cx + xx, y + yy, 1, 1)
    })
    cx += glyph[0].length + 1
  }
}

// ---- 動かないところ ----
export function createRoom() {
  const c = document.createElement("canvas")
  c.width = ROOM_W
  c.height = ROOM_H
  const g = c.getContext("2d")
  const rand = seededRandom(20261117)

  drawWall(g)
  drawFloor(g, rand)
  drawWindowFrame(g)
  drawPoster(g)
  drawClockFace(g)
  drawShelf(g)
  drawDesk(g)
  drawPlant(g)
  drawRug(g)
  return c
}

function drawWall(g) {
  px(g, C.wall, 0, 0, ROOM_W, WALL_BOTTOM)
  // たてじま と 小さな花もよう
  for (let x = 0; x < ROOM_W; x += 8) px(g, C.wallStripe, x, 3, 3, 28)
  for (let y = 7; y < 30; y += 8) {
    for (let x = (y % 16 === 7 ? 5 : 1); x < ROOM_W; x += 8) {
      px(g, C.wallDot, x + 1, y, 1, 1)
      px(g, C.wallDot, x, y + 1, 3, 1)
      px(g, C.wallDot, x + 1, y + 2, 1, 1)
    }
  }
  // 天井の かざり
  px(g, C.molding, 0, 0, ROOM_W, 2)
  px(g, C.moldingShade, 0, 2, ROOM_W, 1)
  // こしかべ（板ばり）
  px(g, C.wainscot, 0, 31, ROOM_W, 7)
  px(g, C.wainscotLight, 0, 31, ROOM_W, 1)
  px(g, C.wainscotDark, 0, 30, ROOM_W, 1)
  for (let x = 0; x < ROOM_W; x += 16) {
    px(g, C.wainscotDark, x + 2, 33, 12, 1)
    px(g, C.wainscotDark, x + 2, 33, 1, 4)
    px(g, C.wainscotLight, x + 3, 36, 11, 1)
    px(g, C.wainscotLight, x + 13, 34, 1, 3)
  }
  // はばき
  px(g, C.base, 0, 38, ROOM_W, 3)
  px(g, C.baseLight, 0, 38, ROOM_W, 1)
}

function drawFloor(g, rand) {
  // 板（1まいずつ少し色をかえる）
  for (let y = WALL_BOTTOM, row = 0; y < ROOM_H; y += 6, row++) {
    let x = row % 2 ? -14 : -2
    while (x < ROOM_W) {
      const len = 22 + Math.floor(rand() * 14)
      px(g, C.floor[Math.floor(rand() * C.floor.length)], x, y, len, 6)
      px(g, C.floorShine, x + 1, y, len - 2, 1)
      px(g, C.floorSeam, x, y, 1, 6)
      // 木目
      if (rand() < 0.6) px(g, C.floorSeam, x + 4 + Math.floor(rand() * (len - 10)), y + 2 + Math.floor(rand() * 3), 3 + Math.floor(rand() * 3), 1)
      x += len
    }
    px(g, C.floorSeam, 0, y + 5, ROOM_W, 1)
  }
  // かべぎわの かげ
  g.fillStyle = "rgba(60, 30, 10, 0.18)"
  g.fillRect(0, WALL_BOTTOM, ROOM_W, 2)
}

function drawWindowFrame(g) {
  const { x, y, w, h } = WINDOW
  // カーテンレール
  px(g, C.metal, x - 6, y - 3, w + 12, 1)
  px(g, C.metalShine, x - 6, y - 3, w + 12, 1)
  px(g, C.metalLight, x - 7, y - 3, 1, 2)
  px(g, C.metalLight, x + w + 6, y - 3, 1, 2)
  // わく
  px(g, C.K, x - 2, y - 2, w + 4, h + 4)
  px(g, C.white, x - 1, y - 1, w + 2, h + 2)
  px(g, C.whiteShade, x - 1, y + h, w + 2, 1)
  // まどだい
  px(g, C.K, x - 4, y + h + 1, w + 8, 3)
  px(g, C.white, x - 3, y + h + 1, w + 6, 2)
  px(g, C.whiteShade, x - 3, y + h + 2, w + 6, 1)
  // まどだいの サボテン
  px(g, C.potDark, x + 3, y + h - 3, 5, 4)
  px(g, C.pot, x + 3, y + h - 3, 4, 3)
  px(g, C.leafDark, x + 4, y + h - 9, 3, 6)
  px(g, C.leaf, x + 5, y + h - 9, 1, 6)
  px(g, C.leafDark, x + 2, y + h - 7, 2, 1)
  px(g, C.leafDark, x + 2, y + h - 8, 1, 2)
  px(g, "#ff8ac6", x + 5, y + h - 10, 1, 1)
  // カーテン（左右・たばねてある）
  for (const [cx, dir] of [[x - 6, 1], [x + w, -1]]) {
    for (let yy = y - 2; yy < y + h + 4; yy++) {
      const pinch = yy > y + 11 && yy < y + 15 ? 1 : 0
      const width = 6 - pinch * 2 + (yy > y + 15 ? 1 : 0)
      const left = dir === 1 ? cx : cx + 6 - width
      px(g, C.curtain, left, yy, width, 1)
      px(g, C.curtainDark, left + (dir === 1 ? width - 1 : 0), yy, 1, 1)
      px(g, C.curtainLight, left + (dir === 1 ? 1 : width - 2), yy, 1, 1)
    }
    // タッセル
    px(g, "#e0b040", dir === 1 ? cx + 1 : cx + 1, y + 12, 4, 2)
  }
}

function drawPoster(g) {
  const { x, y, w, h } = POSTER
  px(g, C.K, x - 1, y - 1, w + 2, h + 2)
  // 夜空にスポットライト
  for (let i = 0; i < h; i++) px(g, i < h / 2 ? "#3a2a6b" : "#5a2a7b", x, y + i, w, 1)
  g.fillStyle = "rgba(255, 240, 180, 0.25)"
  for (let i = 0; i < h - 4; i++) g.fillRect(x + w / 2 - 1 - i / 3, y + i, 2 + (i * 2) / 3, 1)
  // シルエット（マイクを持って歌う人）
  px(g, "#ff5fa2", x + 5, y + 6, 4, 4)
  px(g, "#ff5fa2", x + 4, y + 10, 6, 5)
  px(g, "#ff5fa2", x + 3, y + 7, 1, 3) // かみ
  px(g, "#ff5fa2", x + 10, y + 7, 1, 3)
  px(g, "#ffe066", x + 9, y + 9, 2, 1) // マイク
  px(g, "#ffe066", x + 2, y + 2, 1, 1)
  px(g, "#ffe066", x + 11, y + 3, 1, 1)
  px(g, "#9fe8ff", x + 12, y + 12, 1, 1)
  text(g, "SiVA", x + 1, y + h - 6, "#ffe066")
  // ピン
  px(g, "#e0484d", x + w / 2, y - 1, 1, 1)
}

function drawClockFace(g) {
  const { cx, cy, r } = CLOCK
  disc(g, cx, cy, r + 1, C.K)
  disc(g, cx, cy, r, C.white)
  px(g, C.K, cx, cy - r + 1, 1, 1)
  px(g, C.K, cx, cy + r - 1, 1, 1)
  px(g, C.K, cx - r + 1, cy, 1, 1)
  px(g, C.K, cx + r - 1, cy, 1, 1)
}

function drawShelf(g) {
  const { x, y, w, h } = SHELF
  px(g, C.K, x - 1, y - 1, w + 2, h + 1)
  px(g, C.wood, x, y, w, h)
  px(g, C.woodLight, x, y, w, 1)
  const books = ["#e0484d", "#4f8fe8", "#ffd84d", "#5cc46a", "#9b5fd0", "#ff8ac6", "#f4f1ea", "#ff9a3a"]
  // 2だん
  for (const [sy, seed] of [[y + 2, 0], [y + 13, 3]]) {
    px(g, C.woodDark, x + 1, sy, w - 2, 9)
    let bx = x + 2
    let i = seed
    while (bx < x + w - 3) {
      const bw = 2 + (i % 2)
      const bh = 6 + ((i * 7) % 3)
      px(g, books[i % books.length], bx, sy + 9 - bh, bw, bh)
      px(g, "rgba(255,255,255,0.35)", bx, sy + 9 - bh, 1, bh)
      bx += bw
      i += 1
      if (i === seed + 3) bx += 1 // すきま
    }
    px(g, C.woodLight, x + 1, sy + 9, w - 2, 1)
  }
  // 上：トロフィーと 金のレコード
  px(g, "#c8961a", x + 3, y - 2, 4, 1)
  px(g, "#ffd84d", x + 3, y - 7, 4, 4)
  px(g, "#ffd84d", x + 2, y - 7, 1, 2)
  px(g, "#ffd84d", x + 7, y - 7, 1, 2)
  px(g, "#c8961a", x + 4, y - 3, 2, 1)
  px(g, "#fff6c0", x + 4, y - 6, 1, 2)
  px(g, C.K, x + 10, y - 8, 7, 7)
  disc(g, x + 13, y - 5, 2, "#ffd84d")
  px(g, "#c8961a", x + 13, y - 5, 1, 1)
  px(g, "#fff6c0", x + 12, y - 6, 1, 1)
}

function drawDesk(g) {
  const { x, top, w } = DESK
  // 上の たな（かべ）
  px(g, C.woodDark, x + 2, 8, w - 4, 2)
  px(g, C.woodLight, x + 2, 8, w - 4, 1)
  // たなの上：小さな観葉植物・フィギュア・CD
  px(g, C.pot, x + 4, 5, 3, 3)
  px(g, C.leaf, x + 3, 2, 2, 3)
  px(g, C.leafLight, x + 5, 1, 2, 4)
  px(g, "#ff5fa2", x + 30, 4, 2, 4)
  px(g, "#f6d3b3", x + 30, 3, 2, 1)
  px(g, "#1f1f24", x + 30, 2, 2, 1)
  for (let i = 0; i < 4; i++) px(g, ["#4f8fe8", "#e0484d", "#ffd84d", "#5cc46a"][i], x + 22 + i, 4, 1, 4)

  // 机の あし（左）と ひきだし（右）
  px(g, C.K, x + 1, top + 2, 4, WALL_BOTTOM + 5 - top)
  px(g, C.wood, x + 2, top + 2, 2, WALL_BOTTOM + 4 - top)
  px(g, C.K, x + w - 13, top + 2, 12, WALL_BOTTOM + 5 - top)
  px(g, C.wood, x + w - 12, top + 2, 10, WALL_BOTTOM + 4 - top)
  for (const dy of [4, 10]) {
    px(g, C.woodDark, x + w - 12, top + dy, 10, 1)
    px(g, "#d8c090", x + w - 8, top + dy - 3, 2, 1)
  }
  // 天板
  px(g, C.K, x - 1, top - 1, w + 2, 4)
  px(g, C.woodLight, x, top, w, 2)
  px(g, C.wood, x, top + 2, w, 1)
  // かげ（ゆか）
  g.fillStyle = "rgba(60, 30, 10, 0.2)"
  g.fillRect(x, WALL_BOTTOM + 5, w, 2)

  // モニター
  const m = MONITOR
  px(g, C.K, m.x, m.y, m.w, m.h)
  px(g, C.metalLight, m.x + 1, m.y + 1, m.w - 2, m.h - 2)
  px(g, C.metal, m.x + 1, m.y + m.h - 2, m.w - 2, 1)
  px(g, C.metalShine, m.x + m.w / 2, m.y + m.h - 2, 1, 1) // 電源ランプの場所
  px(g, C.K, m.x + m.w / 2 - 2, m.y + m.h, 4, top - m.y - m.h)
  px(g, C.metalLight, m.x + m.w / 2 - 1, m.y + m.h, 2, top - m.y - m.h)
  px(g, C.K, m.x + m.w / 2 - 4, top - 1, 8, 1)
  // キーボードとマウス
  px(g, C.K, x + 9, top - 1, 16, 1)
  px(g, "#d8d8e0", x + 10, top - 1, 14, 1)
  px(g, C.K, x + 27, top - 2, 3, 2)
  px(g, "#d8d8e0", x + 28, top - 2, 1, 1)
  // デスクライト
  px(g, C.K, LAMP.x, top - 1, 5, 1)
  px(g, C.metal, LAMP.x + 2, LAMP.y + 2, 1, top - LAMP.y - 3)
  px(g, C.K, LAMP.x, LAMP.y - 1, 5, 3)
  px(g, "#e0484d", LAMP.x + 1, LAMP.y - 1, 3, 2)
  // マグカップ
  px(g, C.K, MUG.x - 1, MUG.y - 1, 5, 5)
  px(g, C.white, MUG.x, MUG.y, 3, 3)
  px(g, "#e0484d", MUG.x, MUG.y + 1, 3, 1)
  px(g, C.K, MUG.x + 3, MUG.y + 1, 2, 1)
}

function drawPlant(g) {
  // 大きな観葉植物（左のすみ）
  const x = 2
  const leaves = [
    [6, 18, 5, 3, C.leafDark], [2, 22, 5, 3, C.leaf], [9, 23, 5, 3, C.leaf], [4, 27, 6, 3, C.leafLight],
    [10, 28, 4, 3, C.leafDark], [1, 30, 5, 3, C.leaf], [7, 31, 5, 3, C.leafLight]
  ]
  // くき
  px(g, C.leafDark, x + 6, 22, 1, 16)
  px(g, C.leafDark, x + 4, 28, 1, 9)
  px(g, C.leafDark, x + 9, 26, 1, 11)
  for (const [lx, ly, lw, lh, color] of leaves) {
    oval(g, x + lx + 2, ly, lw / 2 + 1, lh / 2 + 0.5, C.K)
    oval(g, x + lx + 2, ly, lw / 2, lh / 2, color)
    px(g, C.leafDark, x + lx + 2, ly - 1, 1, lh)
  }
  // はち
  px(g, C.K, x + 1, 36, 12, 11)
  px(g, C.pot, x + 2, 37, 10, 9)
  px(g, C.potLight, x + 2, 37, 10, 2)
  px(g, C.potDark, x + 10, 39, 2, 7)
  px(g, C.potDark, x + 2, 39, 10, 1)
}

function drawRug(g) {
  // 歌うところ：まるいラグ（ふちに ほし）
  const { cx, cy } = STAGE
  oval(g, cx, cy, 22, 9, "#3a2a6b")
  oval(g, cx, cy, 21, 8, "#6a3fa0")
  oval(g, cx, cy, 18, 6, "#8a5fd0")
  oval(g, cx, cy, 15, 5, "#6a3fa0")
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    const sx = Math.round(cx + Math.cos(a) * 19.5)
    const sy = Math.round(cy + Math.sin(a) * 7)
    px(g, "#ffd84d", sx, sy, 1, 1)
  }
  // まんなかの ほし
  px(g, "#ffd84d", cx - 1, cy - 2, 3, 1)
  px(g, "#ffd84d", cx - 3, cy - 1, 7, 1)
  px(g, "#ffd84d", cx - 2, cy, 5, 1)
  px(g, "#ffd84d", cx - 2, cy + 1, 2, 1)
  px(g, "#ffd84d", cx + 1, cy + 1, 2, 1)
  px(g, "#ffd84d", cx, cy - 3, 1, 1)
}

// ---- 時間で変わる（日本の時間） ----
export function timeOfDay(ms) {
  const h = new Date(ms + 9 * 3600 * 1000).getUTCHours()
  if (h >= 5 && h < 8) return "morning"
  if (h >= 8 && h < 16) return "day"
  if (h >= 16 && h < 19) return "evening"
  return "night"
}

const SKY = {
  morning: ["#ffd6b0", "#ffe6c8", "#d8ecff", "#b8dcff"],
  day: ["#6fbcff", "#86c8ff", "#9fd6ff", "#b8e2ff"],
  evening: ["#5a3a8a", "#c8608a", "#ff9a5a", "#ffc870"],
  night: ["#0e1430", "#141c40", "#1b2550", "#24306a"]
}

// ---- 毎コマ描くところ ----
//   now：サーバーの時計（ミリ秒）、t：遊びはじめてからの秒
//   mode：Dettyan がしていること（"work"：PC で作業・"sing"：歌う）
export function drawRoomLive(g, { now, t, mode, workT = 0 }) {
  const tod = timeOfDay(now)
  drawSky(g, tod, t)
  drawClockHands(g, now)
  drawScreen(g, mode === "work", workT, t)
  drawSteam(g, t)
  drawRec(g, mode === "sing", t)
}

function drawSky(g, tod, t) {
  const { x, y, w, h } = WINDOW
  const bands = SKY[tod]
  for (let i = 0; i < h; i++) px(g, bands[Math.min(bands.length - 1, Math.floor((i / h) * bands.length))], x, y + i, w, 1)
  const rand = seededRandom(7)
  if (tod === "night") {
    // ほし（ちかちか）と 月
    for (let i = 0; i < 14; i++) {
      const sx = x + Math.floor(rand() * w)
      const sy = y + Math.floor(rand() * (h - 8))
      if (Math.sin(t * 2 + i * 1.7) > -0.3) px(g, i % 4 ? "#c8d0ff" : "#ffffff", sx, sy, 1, 1)
    }
    disc(g, x + w - 6, y + 5, 3, "#fff6c0")
    disc(g, x + w - 5, y + 4, 2, SKY.night[0])
  } else {
    if (tod === "day" || tod === "morning") disc(g, x + 5, y + 4, 2, tod === "day" ? "#fff6c0" : "#ffb070")
    // くも（ゆっくり流れる）
    for (let i = 0; i < 3; i++) {
      const cx = x + ((rand() * w + t * (1.2 + i * 0.5)) % (w + 16)) - 8
      const cy = y + 3 + i * 5
      const col = tod === "evening" ? "#ffc0a0" : "#ffffff"
      g.save()
      g.beginPath()
      g.rect(x, y, w, h)
      g.clip()
      px(g, col, Math.round(cx), cy, 8, 2)
      px(g, col, Math.round(cx) + 2, cy - 1, 4, 1)
      g.restore()
    }
  }
  // 町（たてものの シルエット。夜は まどに あかり）
  const city = tod === "night" ? "#2a2f55" : tod === "evening" ? "#7a4a6a" : "#9ab4d0"
  const r2 = seededRandom(11)
  let bx = x
  while (bx < x + w) {
    const bw = 3 + Math.floor(r2() * 4)
    const bh = 3 + Math.floor(r2() * 7)
    px(g, city, bx, y + h - bh, Math.min(bw, x + w - bx), bh)
    if (tod === "night") {
      for (let wy = y + h - bh + 1; wy < y + h - 1; wy += 2) {
        for (let wx = bx + 1; wx < Math.min(bx + bw - 1, x + w); wx += 2) if (r2() < 0.45) px(g, "#ffd86a", wx, wy, 1, 1)
      }
    }
    bx += bw
  }
  // まどの さん（十字）
  px(g, C.white, x + Math.floor(w / 2) - 1, y, 2, h)
  px(g, C.white, x, y + Math.floor(h / 2), w, 1)
  // ガラスの ひかり
  g.fillStyle = "rgba(255,255,255,0.35)"
  g.fillRect(x + 2, y + 2, 1, 4)
  g.fillRect(x + 3, y + 2, 1, 2)
}

function drawClockHands(g, now) {
  const d = new Date(now + 9 * 3600 * 1000)
  const hour = d.getUTCHours() % 12
  const min = d.getUTCMinutes()
  const { cx, cy } = CLOCK
  disc(g, cx, cy, 3, C.white)
  const hand = (angle, len, color) => {
    for (let i = 1; i <= len; i++) px(g, color, Math.round(cx + Math.sin(angle) * i), Math.round(cy - Math.cos(angle) * i), 1, 1)
  }
  hand(((hour + min / 60) / 12) * Math.PI * 2, 2, C.K)
  hand((min / 60) * Math.PI * 2, 3, "#e0484d")
  px(g, C.K, cx, cy, 1, 1)
}

// PC の画面：作業中は 動画の編集（プレビュー＋タイムライン）、ふだんは スクリーンセーバー
function drawScreen(g, working, workT, t) {
  const { x, y, w, h } = SCREEN
  if (working) {
    px(g, "#1b1f2e", x, y, w, h)
    // プレビュー（色がかわる）
    const hue = Math.floor(workT * 3) % 3
    px(g, ["#ff8ac6", "#5ec8ff", "#ffd84a"][hue], x + 1, y + 1, 9, 5)
    px(g, "#ffffff", x + 4, y + 2, 2, 2)
    px(g, "#ffffff", x + 3, y + 4, 4, 1)
    // 横のパネル
    px(g, "#2f3550", x + 11, y + 1, 4, 5)
    for (let i = 0; i < 3; i++) px(g, "#7a8ab8", x + 12, y + 2 + i * 1, 2 + (i % 2), 1)
    // タイムライン（クリップ）
    px(g, "#5ec8ff", x + 1, y + 7, 6, 1)
    px(g, "#ff8ac6", x + 8, y + 7, 7, 1)
    px(g, "#7ed957", x + 2, y + 8, 9, 1)
    px(g, "#ffd84a", x + 12, y + 8, 3, 1)
    // 再生バー（左から右へ動く）
    const ph = x + 1 + Math.floor((workT * 3) % (w - 2))
    px(g, "#ffffff", ph, y + 6, 1, 4)
  } else {
    px(g, "#141a30", x, y, w, h)
    // ふわふわ動く KB のマーク
    const bx = x + 2 + Math.round((Math.sin(t * 0.7) + 1) * 3.5)
    const by = y + 2 + Math.round((Math.sin(t * 0.9 + 1) + 1) * 1.5)
    px(g, "#ff5fa2", bx, by, 2, 3)
    px(g, "#4fb6ff", bx + 3, by, 2, 3)
    px(g, "#ffe066", bx + 1, by + 4, 3, 1)
  }
  // 画面の ひかり
  g.fillStyle = "rgba(255,255,255,0.12)"
  g.fillRect(x, y, 3, 2)
}

function drawSteam(g, t) {
  // マグカップの湯気（ゆらゆら上がる）
  g.fillStyle = "rgba(255,255,255,0.55)"
  for (let i = 0; i < 3; i++) {
    const p = (t * 0.6 + i / 3) % 1
    const sy = MUG.y - 2 - Math.floor(p * 6)
    const sx = MUG.x + 1 + Math.round(Math.sin(t * 3 + i * 2) * 1)
    g.globalAlpha = 1 - p
    g.fillRect(sx, sy, 1, 1)
  }
  g.globalAlpha = 1
}

// 録音中ランプ「● REC」（歌っている間 赤く つく）
function drawRec(g, on, t) {
  const { x, y, w, h } = REC
  px(g, C.K, x - 1, y - 1, w + 2, h + 2)
  px(g, on ? "#c8202a" : "#4a2626", x, y, w, h)
  const dot = on ? (Math.sin(t * 5) > -0.2 ? "#ffffff" : "#ffb0b0") : "#7a4a4a"
  px(g, dot, x + 1, y + 2, 3, 3)
  px(g, on ? "#c8202a" : "#4a2626", x + 1, y + 2, 1, 1)
  px(g, on ? "#c8202a" : "#4a2626", x + 3, y + 4, 1, 1)
  text(g, "REC", x + 5, y + 1, on ? "#ffffff" : "#7a4a4a")
  if (on) glow(g, x + w / 2, y + h / 2, 12, "255, 60, 60", 0.07)
}

// いす（Dettyan と前後が入れかわる）
export function drawChair(g) {
  const { cx, base } = CHAIR
  // キャスター
  px(g, C.K, cx - 7, base - 2, 15, 2)
  px(g, C.metalLight, cx - 6, base - 2, 13, 1)
  px(g, C.K, cx - 7, base, 2, 1)
  px(g, C.K, cx + 6, base, 2, 1)
  px(g, C.K, cx, base, 1, 1)
  // じく
  px(g, C.K, cx - 1, base - 7, 3, 5)
  px(g, C.metalShine, cx, base - 7, 1, 5)
  // すわるところ
  px(g, C.K, cx - 8, base - 10, 17, 4)
  px(g, "#3f5fa0", cx - 7, base - 10, 15, 2)
  px(g, "#2c4680", cx - 7, base - 8, 15, 1)
  // せもたれ
  px(g, C.K, cx - 7, base - 19, 15, 10)
  px(g, "#3f5fa0", cx - 6, base - 18, 13, 8)
  px(g, "#5a7ac0", cx - 6, base - 18, 13, 1)
  px(g, "#2c4680", cx - 6, base - 12, 13, 2)
  px(g, C.K, cx - 1, base - 9, 3, 1)
}

// スピーカー（ステージのとなり。歌っている間は ふるえる）
export function drawSpeaker(g, singing, t) {
  const { x, base } = SPEAKER
  const top = base - 16
  px(g, C.K, x, top, 11, 16)
  px(g, C.metal, x + 1, top + 1, 9, 14)
  const pulse = singing && Math.sin(t * 22) > 0 ? 1 : 0
  disc(g, x + 5, top + 10, 3 + pulse, C.K)
  disc(g, x + 5, top + 10, 2 + pulse, C.metalLight)
  px(g, C.metalShine, x + 5, top + 10, 1, 1)
  disc(g, x + 5, top + 4, 1, C.metalLight)
  px(g, singing ? "#7ed957" : "#3a5a3a", x + 8, top + 1, 1, 1)
  g.fillStyle = "rgba(60, 30, 10, 0.2)"
  g.fillRect(x, base, 11, 2)
}

// 夜は 部屋を少し暗くして、デスクライトと PC の あかり をつける
export function drawNightLight(g, now, working) {
  if (timeOfDay(now) !== "night") return
  g.fillStyle = "rgba(16, 20, 56, 0.28)"
  g.fillRect(0, 0, ROOM_W, ROOM_H)
  // デスクライトの光
  glow(g, LAMP.x + 2, DESK.top - 2, 22, "255, 220, 140", 0.09)
  px(g, "#fff2b0", LAMP.x + 1, LAMP.y + 1, 3, 1)
  // PC の光
  if (working) glow(g, SCREEN.x + SCREEN.w / 2, SCREEN.y + SCREEN.h, 20, "120, 180, 255", 0.08)
}

// 朝・昼は 窓から ひかりが さしこむ
export function drawWindowLight(g, now) {
  const tod = timeOfDay(now)
  if (tod === "night") return
  g.fillStyle = tod === "evening" ? "rgba(255, 170, 90, 0.14)" : "rgba(255, 250, 220, 0.16)"
  const { x, w } = WINDOW
  for (let i = 0; i < 26; i++) {
    const y = WALL_BOTTOM + i
    g.fillRect(x + 4 + i * 0.8, y, w - 4, 1)
  }
}
