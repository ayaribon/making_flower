// 🌱 Dettyan 育成ゲームの けしき（Sprout Lands の 絵柄。町と 同じ）。docs/dettyan/requirements.md
// - 画像は 買った 素材（S3 の game_assets/。ApplicationHelper#dettyan_sprite_urls）。そろわなければ 前の 絵（dettyan_camp.js など）
// - 画面いっぱい：まんなか 128×96 の まわりも 同じ けしきが つづく。area（128×96 の 座標で 描く 広さ）を わたす
//   木・花の 場所は 世界の 座標だけで きまる（area が かわっても まんなかの 絵は かわらない）
// - 動かない ところは create〜Wide() で 1回 描いて とっておく（area が かわったら 描きなおす）

import { timeOfDay, glow } from "dettyan_room"
import { FIRE } from "dettyan_camp"

const T = 16
// 町（town_sprout.js）と 同じ 色の きまり：ふちは こい 赤むらさき
export const LINE = "#754c60"

// ---- 読みこみ ----
export const NEEDED = ["grass", "soil", "trees", "flowers", "fences"]

// urls：{ キー: URL }。NEEDED が そろえば { キー: 画像 }、そろわなければ null
export function loadDettyanSheets(urls, timeoutMs = 6000) {
  if (!urls || NEEDED.some((k) => !urls[k])) return Promise.resolve(null)
  const one = ([key, url]) => new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve([key, img])
    img.onerror = () => resolve(null)
    img.src = url
  })
  const all = Promise.all(Object.entries(urls).map(one)).then((pairs) => {
    const sheets = Object.fromEntries(pairs.filter(Boolean))
    return NEEDED.every((k) => sheets[k]) ? sheets : null
  })
  const timer = new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs))
  return Promise.race([all, timer])
}

// ---- 道具 ----
const px = (g, color, x, y, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), w, h) }
const tile = (g, img, col, row, x, y) => g.drawImage(img, col * T, row * T, T, T, x, y, T, T)
const part = (g, img, sx, sy, w, h, x, y) => g.drawImage(img, sx, sy, w, h, Math.round(x), Math.round(y), w, h)

// 場所で きまる 0〜1（同じ 場所は いつも 同じ）
export function hash(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function oval(g, cx, cy, rx, ry, color) {
  for (let y = -ry; y <= ry; y++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))))
    px(g, color, cx - w, cy + y, w * 2 + 1, 1)
  }
}

// area の 大きさの canvas に、128×96 の 座標で 描く
function wideCanvas(area, paint) {
  const c = document.createElement("canvas")
  c.width = area.w
  c.height = area.h
  const g = c.getContext("2d")
  g.imageSmoothingEnabled = false
  g.translate(-area.x, -area.y)
  paint(g)
  return c
}

// 16 ドット ごとの マス（area を おおう）
function eachTile(area, fn) {
  const x0 = Math.floor(area.x / T) * T
  const y0 = Math.floor(area.y / T) * T
  for (let y = y0; y < area.y + area.h; y += T) for (let x = x0; x < area.x + area.w; x += T) fn(x, y)
}

// くさの マス（ほとんど ふつう、ときどき 草の もよう）
function grassTile(g, s, x, y, seed = 1) {
  const r = hash(x, y, seed)
  if (r < 0.82) tile(g, s.grass, 1, 1, x, y)
  else tile(g, s.grass, Math.floor(hash(x, y, seed + 1) * 6), 5 + Math.floor(hash(x, y, seed + 2) * 2), x, y)
}

// 木（足もと x, y）。kind 0：まるい木 1：ほそい木 2：大きな木 3：りんごの木
function tree(g, s, x, y, kind) {
  if (kind === 2) part(g, s.trees, 144, 48, 48, 48, x - 24, y - 44)
  else if (kind === 1) part(g, s.trees, 0, 0, 16, 32, x - 8, y - 29)
  else if (kind === 3) part(g, s.trees, 48, 0, 32, 32, x - 16, y - 29)
  else part(g, s.trees, 16, 0, 32, 32, x - 16, y - 29)
}
const bush = (g, s, x, y, kind = 0) => part(g, s.trees, kind * T, 48, T, T, x - 8, y - 13)
const flower = (g, s, x, y, col, row) => part(g, s.flowers, col * T, row * T, T, T, x - 8, y - 12)

// 森（あいている ところ clear(x, y) には 木を おかない）。足もとの 高さの じゅんに 描く
function forest(g, s, area, clear, seed) {
  const step = 14
  const items = []
  const x0 = Math.floor((area.x - 30) / step) * step
  const y0 = Math.floor((area.y - 10) / step) * step
  for (let gy = y0; gy < area.y + area.h + 50; gy += step) {
    for (let gx = x0; gx < area.x + area.w + 30; gx += step) {
      const x = gx + Math.floor(hash(gx, gy, seed) * 10) - 5
      const y = gy + Math.floor(hash(gx, gy, seed + 1) * 8) - 4
      if (clear(x, y)) continue
      const r = hash(gx, gy, seed + 2)
      if (r < 0.12) continue // ところどころ すきま
      items.push({ x, y, kind: r < 0.22 ? 2 : r < 0.4 ? 1 : r < 0.47 ? 3 : 0 })
    }
  }
  items.sort((a, b) => a.y - b.y).forEach((t) => tree(g, s, t.x, t.y, t.kind))
}

// ---- ⛺ テント（まちはずれ の ひろば。まわりは 森） ----
// ひろば（木の ない ところ）：まんなかの 128×96 の 下の ほう と、テントの まわり
//   木は 足もとより 上に 30〜44 ドット のびるので、Dettyan が 歩く ところ（y 56〜96）に かからない ように あける
function campClear(x, y) {
  if (y > 142 + Math.abs(x - 64) * 0.1) return false // ずっと 下は また 森
  if (y > 22 && x > -6 && x < 134) return true
  if (y > 58 && x > -24 && x < 152) return true
  return false
}

export function createCampWide(s, area) {
  return wideCanvas(area, (g) => {
    eachTile(area, (x, y) => grassTile(g, s, x, y, 7))
    // ひろばの 花・しげみ・小石（場所で きまる）
    for (let y = Math.floor(area.y / 12) * 12; y < area.y + area.h; y += 12) {
      for (let x = Math.floor(area.x / 12) * 12; x < area.x + area.w; x += 12) {
        const r = hash(x, y, 31)
        const fx = x + Math.floor(hash(x, y, 32) * 8)
        const fy = y + Math.floor(hash(x, y, 33) * 8)
        if (Math.abs(fx - FIRE.x) < 22 && Math.abs(fy - FIRE.y) < 14) continue
        if (fx > 4 && fx < 60 && fy > 20 && fy < 58) continue // テント
        if (fx > 70 && fx < 104 && fy > 54 && fy < 74) continue // まるた
        if (r < 0.1) flower(g, s, fx, fy, Math.floor(hash(x, y, 34) * 11), 3 + Math.floor(hash(x, y, 35) * 2))
        else if (r < 0.13) part(g, s.flowers, Math.floor(hash(x, y, 36) * 3) * T, T, T, T, fx - 8, fy - 12) // 小石
      }
    }
    // 森
    forest(g, s, area, campClear, 11)
    // ひろばの はしの しげみ
    for (let x = -4; x < 136; x += 13) if (hash(x, 0, 41) < 0.7) bush(g, s, x, 24 + Math.floor(hash(x, 1, 41) * 3), hash(x, 2, 41) < 0.8 ? 0 : 1 + Math.floor(hash(x, 3, 41) * 3))
    drawTent(g)
    drawCampProps(g, s)
  })
}

// テント（前の 絵の 形。色を Sprout の 色に）
function drawTent(g) {
  const tx = 30
  oval(g, tx, 51, 26, 3, "rgba(117, 76, 96, 0.22)") // かげ
  for (let i = 0; i <= 26; i++) {
    const w = Math.round(i * 0.75)
    px(g, LINE, tx - w - 1, 24 + i, w * 2 + 3, 1)
    px(g, i % 6 < 3 ? "#e9a36a" : "#f2bb7d", tx - w, 24 + i, w * 2 + 1, 1)
    px(g, "#c98159", tx + w - 2, 24 + i, 2, 1)
  }
  for (let i = 0; i <= 14; i++) {
    const w = Math.round(i * 0.4)
    px(g, "#6b4a50", tx - w, 36 + i, w * 2 + 1, 1)
  }
  px(g, "#f7d39a", tx - 7, 46, 3, 4)
  for (const [x1, x2] of [[tx, 6], [tx, 54]]) {
    const n = Math.abs(x2 - x1)
    for (let i = 0; i <= n; i++) px(g, "#e8d7b0", x1 + Math.sign(x2 - x1) * i, 24 + (i / n) * 26, 1, 1)
    px(g, "#9a6a4a", x2, 50, 1, 3)
  }
  // ねぶくろ
  px(g, LINE, 47, 47, 17, 6)
  px(g, "#7180b1", 48, 48, 15, 4)
  px(g, "#8599c7", 48, 48, 15, 1)
  px(g, "#f3e5c2", 59, 48, 4, 4)
}

function drawCampProps(g, s) {
  // たき火の まわりの つち（前の 絵と 同じ 場所）
  oval(g, FIRE.x, FIRE.y - 2, 16, 6, "#c49a6c")
  oval(g, FIRE.x, FIRE.y - 2, 13, 4, "#d8b483")
  // まるたの いす（Sprout の まるた）
  part(g, s.trees, 96, 96, 32, 16, 78, 56)
  // なべ
  px(g, LINE, 44, 63, 8, 6)
  px(g, "#9da89a", 45, 64, 6, 4)
  px(g, "#c1c8b9", 45, 64, 6, 1)
}

// 夕方・夜は くらく（広く）
export function drawCampNightWide(g, now, area) {
  const tod = timeOfDay(now)
  if (tod !== "night" && tod !== "evening") return
  g.fillStyle = tod === "night" ? "rgba(14, 18, 50, 0.38)" : "rgba(60, 20, 50, 0.12)"
  g.fillRect(area.x, area.y, area.w, area.h)
  if (tod === "night") glow(g, FIRE.x, FIRE.y - 8, 34, "255, 170, 80", 0.07)
}

// ---- 🗺️ ぼうけん の けしき（横から 見た 道。左へ ながれる） ----
// 地面は y=56 から下。Dettyan と モンスターの 足もとは y=82（道の 上）
// 横に P ドットで くりかえす 帯を 1回 描いて、scroll の ぶん ずらして 出す（つなぎめは 見えない）
const P = 256
const HORIZON = 56
const PATH_Y = 66 // 道（つちの 帯）の 上の はし。下の はしは +32

// くりかえす ものを ならべる（list は 0〜P の 場所。area に 入る ぶん だけ 何回も 描く）
function repeatItems(area, list, draw) {
  const k0 = Math.floor((area.x - 60) / P)
  const k1 = Math.ceil((area.x + area.w + 60) / P)
  const all = []
  for (let k = k0; k <= k1; k++) for (const it of list) all.push({ ...it, x: it.x + k * P })
  all.sort((a, b) => a.y - b.y).forEach(draw)
}

// P の 中で ならべる（場所で きまる）
function scatter(seed, n, y0, y1) {
  const out = []
  for (let i = 0; i < n; i++) out.push({ i, x: Math.floor(hash(i, 1, seed) * P), y: y0 + Math.floor(hash(i, 2, seed) * (y1 - y0)), r: hash(i, 3, seed) })
  return out
}

function skyBands(g, area, colors, y1) {
  const y0 = area.y
  const h = Math.max(1, y1 - y0)
  for (let y = y0; y < y1; y++) px(g, colors[Math.min(colors.length - 1, Math.floor(((y - y0) / h) * colors.length))], area.x, y, area.w, 1)
}

// P ごとに 同じ マス（x は P の あまりで きめる）
function eachTileP(area, y0, y1, fn) {
  const x0 = Math.floor(area.x / T) * T
  for (let y = y0; y < y1; y += T) for (let x = x0; x < area.x + area.w; x += T) fn(x, y, ((x % P) + P) % P)
}

// 道（つち）：上の はし・下の はし の 2だん
function dirtPath(g, s, area) {
  eachTileP(area, PATH_Y, PATH_Y + 1, (x) => {
    tile(g, s.soil, 1, 0, x, PATH_Y)
    tile(g, s.soil, 1, 2, x, PATH_Y + T)
  })
}

function groundTiles(g, s, area, sheet, y0, seed) {
  eachTileP(area, Math.floor(y0 / T) * T, area.y + area.h, (x, y, xp) => {
    const r = hash(xp, y, seed)
    if (r < 0.8) tile(g, sheet, 1, 1, x, y)
    else tile(g, sheet, Math.floor(hash(xp, y, seed + 1) * 5), 5 + Math.floor(hash(xp, y, seed + 2) * 2), x, y)
  })
}

const SCENE_SKY = {
  park: ["#a9d8f5", "#bfe3f6", "#d4edf5"],
  forest: ["#9cc7a8", "#b0d3b0", "#c3dcb4"],
  cave: ["#2d2733", "#352e3c", "#3d3545"],
  mountain: ["#bcd3ec", "#cfe0f0", "#e2ecf4"]
}

const PAINT = {
  park(g, s, area) {
    skyBands(g, area, SCENE_SKY.park, HORIZON - 14)
    groundTiles(g, s, area, s.grass, HORIZON - 14, 51)
    // おくの 木（ならび）
    repeatItems(area, scatter(52, 11, HORIZON - 4, HORIZON + 2), (it) => tree(g, s, it.x, it.y, it.r < 0.15 ? 3 : it.r < 0.3 ? 1 : 0))
    // さく
    eachTileP(area, 0, 1, (x) => part(g, s.fences, 2 * T, 3 * T, T, T, x, HORIZON + 2))
    dirtPath(g, s, area)
    repeatItems(area, scatter(53, 14, PATH_Y + 34, PATH_Y + 60), (it) => it.r < 0.5 ? flower(g, s, it.x, it.y, Math.floor(it.r * 22), 3 + (it.i % 2)) : bush(g, s, it.x, it.y, it.r < 0.85 ? 0 : 1 + (it.i % 3)))
    repeatItems(area, scatter(54, 6, HORIZON + 22, PATH_Y - 1), (it) => flower(g, s, it.x, it.y, Math.floor(it.r * 11), 3 + (it.i % 2)))
  },
  forest(g, s, area) {
    skyBands(g, area, SCENE_SKY.forest, HORIZON - 30)
    groundTiles(g, s, area, s.grass_dark || s.grass, HORIZON - 30, 61)
    // おくの 森（2れつ）
    repeatItems(area, [...scatter(62, 12, HORIZON - 22, HORIZON - 14), ...scatter(63, 12, HORIZON - 2, HORIZON + 6)], (it) => tree(g, s, it.x, it.y, it.r < 0.35 ? 2 : it.r < 0.55 ? 1 : 0))
    dirtPath(g, s, area)
    // きのこ・しげみ
    repeatItems(area, scatter(64, 10, HORIZON + 6, PATH_Y - 1), (it) => it.r < 0.5 ? part(g, s.flowers, Math.floor(it.r * 8) * T, 0, T, T, it.x - 8, it.y - 12) : bush(g, s, it.x, it.y, 0))
    repeatItems(area, scatter(65, 16, PATH_Y + 34, PATH_Y + 70), (it) => it.r < 0.6 ? tree(g, s, it.x, it.y + 28, it.r < 0.2 ? 2 : 0) : bush(g, s, it.x, it.y, 1 + (it.i % 3)))
  },
  cave(g, s, area) {
    const stone = s.stone || s.soil
    skyBands(g, area, SCENE_SKY.cave, HORIZON)
    // かべ（いわの マスを くらく）
    eachTileP(area, Math.floor(area.y / T) * T, HORIZON, (x, y, xp) => tile(g, stone, hash(xp, y, 71) < 0.7 ? 1 : 3, 1, x, y))
    g.fillStyle = "rgba(30, 22, 40, 0.55)"
    g.fillRect(area.x, area.y, area.w, HORIZON - area.y)
    // つらら
    repeatItems(area, scatter(72, 18, 0, 1), (it) => {
      const len = 6 + Math.floor(it.r * 14)
      for (let i = 0; i < len; i++) {
        const w = Math.max(1, Math.floor((len - i) / 2))
        px(g, i < 2 ? "#5a5060" : "#6e6474", it.x - Math.floor(w / 2), area.y + i, w, 1)
      }
    })
    // たいまつ（ほのおは live）
    repeatItems(area, CAVE_TORCHES, (it) => { px(g, "#5e3a1f", it.x, it.y, 2, 8); px(g, "#3a2414", it.x - 1, it.y, 4, 2) })
    groundTiles(g, s, area, stone, HORIZON, 73)
    dirtPath(g, s, area)
    repeatItems(area, scatter(74, 7, HORIZON + 4, PATH_Y - 1), (it) => part(g, s.flowers, (4 + (it.i % 2)) * T, T, T, T, it.x - 8, it.y - 12))
    repeatItems(area, scatter(75, 6, HORIZON + 2, PATH_Y + 64), (it) => { if (it.y < PATH_Y + 30) return; drawCrystal(g, it.x, it.y, it.r) })
  },
  mountain(g, s, area) {
    skyBands(g, area, SCENE_SKY.mountain, HORIZON - 6)
    // とおくの 山（ゆき）
    repeatItems(area, scatter(81, 5, HORIZON - 4, HORIZON - 2), (it) => peakSnow(g, it.x, it.y, 22 + Math.floor(it.r * 18), 26 + Math.floor(it.r * 14)))
    groundTiles(g, s, area, s.grass_dark || s.grass, HORIZON - 6, 82)
    repeatItems(area, scatter(83, 8, HORIZON - 2, HORIZON + 6), (it) => it.r < 0.5 ? tree(g, s, it.x, it.y, 1) : part(g, s.flowers, (4 + (it.i % 2)) * T, T, T, T, it.x - 8, it.y - 12))
    dirtPath(g, s, area)
    repeatItems(area, scatter(84, 10, PATH_Y + 34, PATH_Y + 64), (it) => it.r < 0.6 ? part(g, s.flowers, Math.floor(it.r * 6) * T, T, T, T, it.x - 8, it.y - 12) : bush(g, s, it.x, it.y, 0))
  }
}

const CAVE_TORCHES = [{ x: 22, y: 26 }, { x: 104, y: 26 }, { x: 170, y: 24 }, { x: 226, y: 28 }]

function drawCrystal(g, x, y, r) {
  const c = r < 0.5 ? ["#8599c7", "#a9c3e0", "#e3f0f7"] : ["#bd757e", "#d99a9a", "#f3d6cf"]
  px(g, LINE, x - 3, y - 9, 7, 10)
  px(g, c[0], x - 2, y - 8, 5, 8)
  px(g, c[1], x - 1, y - 8, 2, 7)
  px(g, c[2], x - 1, y - 7, 1, 2)
}

function peakSnow(g, x, baseY, h, half) {
  for (let i = 0; i <= h; i++) {
    const w = Math.round((i / h) * half)
    px(g, i < h * 0.3 ? "#f3f2e8" : "#9fb0c4", x - w, baseY - h + i, w * 2 + 1, 1)
    px(g, i < h * 0.3 ? "#dde3ea" : "#8797ad", x + w - Math.ceil(w / 3), baseY - h + i, Math.ceil(w / 3) + 1, 1)
  }
}

// 帯（area の はば ＋ P）を 1回 描く
export function createBattleStrip(s, placeId, area) {
  const paint = PAINT[placeId] || PAINT.park
  return wideCanvas({ x: area.x, y: area.y, w: area.w + P, h: area.h }, (g) => paint(g, s, { x: area.x, y: area.y, w: area.w + P, h: area.h }))
}

// けしきを 出す（scroll：歩いた きょり）。live：うごく もの
export function drawBattleWide(g, strip, placeId, area, t, scroll) {
  const off = ((Math.round(scroll) % P) + P) % P
  g.drawImage(strip, off, 0, area.w, area.h, area.x, area.y, area.w, area.h)
  const shift = (x) => x - off
  if (placeId === "cave") {
    for (const tc of CAVE_TORCHES) {
      for (let k = Math.floor((area.x + off - 20) / P); k * P < area.x + area.w + off + 20; k++) {
        const tx = shift(tc.x + k * P)
        const f = Math.sin(t * 13 + tc.x) > 0 ? 1 : 0
        glow(g, tx + 1, tc.y - 2, 18 + f, "255, 160, 60", 0.08)
        px(g, "#e0484d", tx - 1, tc.y - 5 - f, 4, 5 + f)
        px(g, "#ff9a3a", tx, tc.y - 4 - f, 2, 4 + f)
        px(g, "#ffe066", tx, tc.y - 2, 2, 2)
      }
    }
  } else if (placeId === "forest") {
    for (let i = 0; i < 16; i++) {
      const fx = area.x + ((hash(i, 1, 9) * area.w + Math.sin(t * 0.5 + i) * 8 + t * 2) % area.w)
      const fy = 14 + hash(i, 2, 9) * 50 + Math.sin(t * 1.3 + i * 2) * 4
      const a = (Math.sin(t * 3 + i * 1.9) + 1) / 2
      g.globalAlpha = 0.3 + a * 0.7
      px(g, "#fff8a0", fx, fy, 1, 1)
      g.globalAlpha = 1
    }
  } else {
    // くも（park・mountain）
    const n = Math.max(2, Math.round(area.w / 70))
    for (let i = 0; i < n; i++) {
      const span = area.w + 40
      const cx = area.x - 20 + ((hash(i, 1, 4) * span + t * (2 + i * 0.7)) % span)
      const cy = Math.min(HORIZON - 30, area.y + 8) + i * 7 + hash(i, 2, 4) * 6
      px(g, "#ffffff", cx, cy, 14, 3)
      px(g, "#ffffff", cx + 3, cy - 2, 7, 2)
      px(g, "#e6eef4", cx, cy + 2, 14, 1)
    }
    if (placeId === "mountain") {
      for (let i = 0; i < 30; i++) {
        const p = (t * (0.08 + (i % 5) * 0.01) + hash(i, 3, 5)) % 1
        const sx = area.x + ((hash(i, 4, 5) * area.w + Math.sin(t + i) * 4 + t * 3) % area.w)
        px(g, "#ffffff", sx, area.y + p * area.h, 1, 1)
      }
    }
  }
}

// ---- ⚔️ バトルの うごき（農作業の うごき を 転用。2026-11-19 に ayaribon） ----
// Sprout Lands の「Basic Charakter Actions」（48×48 の コマ。横 2コマ＝ふりあげ・ふりおろし）から 道具だけ 切りだす
//   体は ちがう キャラ（Teemo）なので 使わない。道具の 場所は 体の まんなか・足もと からの ずれ で おぼえて、Dettyan に かさねる
//   右むき：くわ＝3だん目・おの＝7だん目・じょうろ＝11だん目（0 から かぞえる）
const ACTION_ROWS = { hoe: 3, axe: 7, can: 11 }
const BODY_COLORS = new Set(["243,242,192", "92,78,146", "118,109,170", "221,213,222", "232,181,172", "243,216,197"])

export function makeBattleTools(sheet) {
  if (!sheet) return null
  const src = document.createElement("canvas")
  src.width = sheet.width
  src.height = sheet.height
  const sg = src.getContext("2d")
  sg.drawImage(sheet, 0, 0)
  const out = {}
  for (const [name, row] of Object.entries(ACTION_ROWS)) {
    out[name] = [0, 1].map((col) => {
      const d = sg.getImageData(col * 48, row * 48, 48, 48).data
      let bx0 = 99, bx1 = -1, by1 = -1, tx0 = 99, ty0 = 99, tx1 = -1, ty1 = -1
      for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
        const i = (y * 48 + x) * 4
        if (!d[i + 3]) continue
        if (BODY_COLORS.has(`${d[i]},${d[i + 1]},${d[i + 2]}`)) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y) } else { tx0 = Math.min(tx0, x); ty0 = Math.min(ty0, y); tx1 = Math.max(tx1, x); ty1 = Math.max(ty1, y) }
      }
      const w = tx1 - tx0 + 1
      const h = ty1 - ty0 + 1
      const c = document.createElement("canvas")
      c.width = w
      c.height = h
      const g = c.getContext("2d")
      const img = g.createImageData(w, h)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = ((ty0 + y) * 48 + tx0 + x) * 4
        if (!d[i + 3] || BODY_COLORS.has(`${d[i]},${d[i + 1]},${d[i + 2]}`)) continue
        img.data.set([d[i], d[i + 1], d[i + 2], d[i + 3]], (y * w + x) * 4)
      }
      g.putImageData(img, 0, 0)
      // 体の まんなか・足もと からの ずれ（人の 体は Teemo より 1.3ばい くらい 高い）
      const cx = (bx0 + bx1) / 2
      // ふりおろし（col 1）は 畑を たがやす 高さ なので、バトルでは 手の 高さ まで あげて 少し 前へ
      const lift = col === 1 && name !== "can" ? 7 : 0
      return { canvas: c, dx: Math.round(tx0 - cx) + (lift ? 2 : 0), dy: Math.round((ty0 - by1) * 1.3) - lift }
    })
  }
  return out
}

// 道具を かさねる（x：体の まんなか、feet：足もと、p：0〜1 の すすみ。はじめ 4わり は ふりあげ）
export function drawBattleTool(g, tools, name, x, feet, p) {
  const f = tools?.[name]?.[p < 0.4 ? 0 : 1]
  if (f) g.drawImage(f.canvas, Math.round(x + f.dx), Math.round(feet + f.dy))
}
