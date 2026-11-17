// 🌳 モンスター退治の けしき（128×96 ドット）。行き先（dettyan_adventure.js の PLACES）の id ごと
// - 動かないところは sceneBase(place) で1回だけ描いて取っておく
// - 動くところ（くも・ほたる・たいまつ・雪 など）は drawSceneLive() で毎コマ描く
// - 地面は y=56 から下。Dettyan とスライムの足もとは y=82 あたり
// 新しい行き先を足したときは、SCENES に同じ id で足す（ないときは PLACES の sky / ground の色だけで描く）

import { seededRandom } from "dettyan_adventure"
import { glow } from "dettyan_room"

const W = 128
const H = 96
const HORIZON = 56

const px = (g, color, x, y, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), w, h) }

function bands(g, colors, y0, y1) {
  const h = y1 - y0
  for (let i = 0; i < h; i++) px(g, colors[Math.min(colors.length - 1, Math.floor((i / h) * colors.length))], 0, y0 + i, W, 1)
}

function disc(g, cx, cy, r, color) {
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(r * r - y * y + r * 0.6))
    px(g, color, cx - w, cy + y, w * 2 + 1, 1)
  }
}

// 山の形（てっぺん x, 高さ h, すそ y、はば）
function peak(g, x, baseY, h, half, color, snow = null, snowH = 0) {
  for (let i = 0; i <= h; i++) {
    const w = Math.round((i / h) * half)
    px(g, color, x - w, baseY - h + i, w * 2 + 1, 1)
    if (snow && i < snowH) {
      const jag = i === snowH - 1 ? (i % 2 ? 1 : 0) : 0
      px(g, snow, x - w + jag, baseY - h + i, Math.max(1, w * 2 + 1 - jag * 2), 1)
    }
  }
}

function cloud(g, x, y, color, shade) {
  px(g, color, x + 3, y, 8, 2)
  px(g, color, x, y + 2, 16, 3)
  px(g, color, x + 6, y - 2, 5, 2)
  px(g, shade, x + 1, y + 4, 14, 1)
}

// ---- 公園 ----
function parkBase(g, rand) {
  bands(g, ["#6fbcff", "#7cc4ff", "#8acdff", "#9fd6ff", "#b4e0ff"], 0, HORIZON)
  // 遠くの町
  let x = 0
  while (x < W) {
    const bw = 6 + Math.floor(rand() * 8)
    const bh = 8 + Math.floor(rand() * 14)
    px(g, "#a9c6dc", x, HORIZON - 12 - bh, bw, bh + 12)
    for (let wy = HORIZON - 10 - bh; wy < HORIZON - 12; wy += 3) {
      for (let wx = x + 1; wx < x + bw - 1; wx += 2) px(g, "#c4dcec", wx, wy, 1, 1)
    }
    x += bw + 1
  }
  // 木（まるい しげみ）
  for (let tx = -4; tx < W + 8; tx += 14 + Math.floor(rand() * 6)) {
    const r = 6 + Math.floor(rand() * 3)
    px(g, "#5e3a1f", tx - 1, HORIZON - 8, 3, 8)
    disc(g, tx, HORIZON - 10 - r / 2, r, "#3f8a4a")
    disc(g, tx - 2, HORIZON - 12 - r / 2, r - 3, "#55a85e")
    px(g, "#7cc46a", tx - 4, HORIZON - 14 - r / 2, 2, 1)
  }
  // しばふ
  bands(g, ["#7cc46a", "#76be63", "#70b85d"], HORIZON, H)
  for (let i = 0; i < 80; i++) px(g, "#5aa24c", rand() * W, HORIZON + 2 + rand() * (H - HORIZON - 2), 1, 2)
  // さく
  px(g, "#f4f1ea", 0, HORIZON + 2, W, 1)
  px(g, "#f4f1ea", 0, HORIZON + 5, W, 1)
  for (let fx = 2; fx < W; fx += 6) {
    px(g, "#f4f1ea", fx, HORIZON - 1, 2, 9)
    px(g, "#d8d2c4", fx + 1, HORIZON, 1, 8)
  }
  // 道（ここで たたかう）
  for (let y = 68; y < 92; y++) {
    const wob = Math.round(Math.sin(y * 0.5) * 1)
    px(g, "#d9c08a", 0, y, W, 1)
    px(g, "#c8ab72", wob, y, 2, 1)
  }
  px(g, "#b8975e", 0, 68, W, 1)
  px(g, "#b8975e", 0, 91, W, 1)
  for (let i = 0; i < 26; i++) px(g, rand() < 0.5 ? "#b8975e" : "#ead6a6", rand() * W, 70 + rand() * 20, 2, 1)
  // 花
  const flowers = ["#ff6b8a", "#ffd84d", "#ffffff", "#c88aff"]
  for (let i = 0; i < 22; i++) {
    const fx = rand() * W
    const fy = HORIZON + 8 + rand() * 9 + (rand() < 0.4 ? 26 : 0)
    if (fy > 66 && fy < 93) continue
    px(g, "#3f8a4a", fx, fy + 1, 1, 2)
    px(g, flowers[i % flowers.length], fx - 1, fy, 3, 1)
    px(g, flowers[i % flowers.length], fx, fy - 1, 1, 3)
    px(g, "#ffe066", fx, fy, 1, 1)
  }
  // ベンチと 街灯
  px(g, "#1a1414", 100, 50, 22, 1)
  px(g, "#9a6a3a", 100, 47, 22, 3)
  px(g, "#b88a5a", 100, 47, 22, 1)
  px(g, "#9a6a3a", 100, 52, 22, 2)
  px(g, "#2b2b35", 102, 54, 2, 5)
  px(g, "#2b2b35", 118, 54, 2, 5)
  px(g, "#2b2b35", 8, 22, 2, 38)
  px(g, "#2b2b35", 5, 18, 8, 4)
  px(g, "#fff2b0", 6, 20, 6, 2)
  px(g, "#2b2b35", 6, 59, 6, 2)
}

function parkLive(g, t, rand) {
  for (let i = 0; i < 4; i++) {
    const x = ((rand() * 160 + t * (2 + i)) % 168) - 20
    cloud(g, x, 5 + i * 7, "#ffffff", "#dceeff")
  }
  // ちょうちょ
  const bx = 70 + Math.sin(t * 0.8) * 40
  const by = 62 + Math.sin(t * 2.3) * 4
  const flap = Math.sin(t * 18) > 0
  px(g, "#ffd84d", bx - (flap ? 2 : 1), by, flap ? 2 : 1, 2)
  px(g, "#ffd84d", bx + 1, by, flap ? 2 : 1, 2)
  px(g, "#1a1414", bx, by, 1, 2)
}

// ---- 森 ----
function forestBase(g, rand) {
  bands(g, ["#1f3a28", "#25452f", "#2c5236", "#35603d"], 0, HORIZON + 4)
  // 遠くの木（うすい）
  for (let tx = 0; tx < W; tx += 7 + Math.floor(rand() * 5)) {
    const tw = 3 + Math.floor(rand() * 3)
    px(g, "#2f5a38", tx, 0, tw, HORIZON + 2)
    px(g, "#3a6a44", tx, 0, 1, HORIZON + 2)
  }
  // 光の すじ
  g.fillStyle = "rgba(220, 255, 180, 0.08)"
  for (const sx of [30, 58, 90]) {
    for (let y = 0; y < HORIZON + 10; y++) g.fillRect(sx + y * 0.45, y, 6, 1)
  }
  // 上の葉っぱ
  for (let i = 0; i < 40; i++) disc(g, rand() * W, rand() * 10 - 2, 4 + Math.floor(rand() * 4), i % 3 ? "#1d4a26" : "#2a6a34")
  for (let i = 0; i < 30; i++) px(g, "#4a8a4a", rand() * W, rand() * 12, 2, 1)
  // 地面
  bands(g, ["#3f6e3a", "#3a6636", "#355e32", "#2f5a2c"], HORIZON, H)
  for (let i = 0; i < 90; i++) px(g, rand() < 0.5 ? "#2f5a2c" : "#4a7a42", rand() * W, HORIZON + rand() * (H - HORIZON), 2, 1)
  // こけの道
  for (let y = 70; y < 92; y++) px(g, "#6a5a3a", 0, y, W, 1)
  px(g, "#4a3f28", 0, 70, W, 1)
  for (let i = 0; i < 30; i++) px(g, rand() < 0.5 ? "#4a3f28" : "#7a6a48", rand() * W, 71 + rand() * 20, 2, 1)
  // 手前の 大きな木（左右）
  for (const [tx, tw] of [[0, 12], [114, 14]]) {
    px(g, "#1a1414", tx - 1, 0, tw + 2, 74)
    px(g, "#5e3a1f", tx, 0, tw, 74)
    px(g, "#7a4a28", tx + 2, 0, 2, 74)
    px(g, "#4a2c14", tx + tw - 3, 0, 2, 74)
    for (let y = 6; y < 70; y += 9) px(g, "#4a2c14", tx + 4 + (y % 3), y, 3, 1)
    px(g, "#5e3a1f", tx - 3, 70, tw + 6, 4) // 根っこ
  }
  // きのこ と シダ
  const mush = (x, y, cap) => {
    px(g, "#f4f1ea", x + 1, y, 2, 3)
    px(g, cap, x - 1, y - 2, 6, 2)
    px(g, cap, x, y - 3, 4, 1)
    px(g, "#ffffff", x, y - 2, 1, 1)
    px(g, "#ffffff", x + 3, y - 3, 1, 1)
  }
  mush(18, 64, "#e0484d")
  mush(24, 66, "#e0484d")
  mush(104, 63, "#ff9a3a")
  mush(60, 94, "#e0484d")
  for (const fx of [36, 80, 96]) {
    for (let i = 0; i < 5; i++) px(g, "#4a9a52", fx - i, 64 - i, 1, 1)
    for (let i = 0; i < 5; i++) px(g, "#4a9a52", fx + i, 64 - i, 1, 1)
    px(g, "#4a9a52", fx, 58, 1, 7)
  }
  // いし
  for (const [sx, sy] of [[44, 93], [88, 66], [10, 90]]) {
    px(g, "#5a5a5a", sx, sy - 2, 6, 3)
    px(g, "#8a8a8a", sx + 1, sy - 2, 3, 1)
  }
}

function forestLive(g, t, rand) {
  // ほたる
  for (let i = 0; i < 10; i++) {
    const fx = (rand() * W + Math.sin(t * 0.5 + i) * 8 + t * 2) % W
    const fy = 20 + rand() * 40 + Math.sin(t * 1.3 + i * 2) * 4
    const glow = (Math.sin(t * 3 + i * 1.9) + 1) / 2
    g.globalAlpha = 0.3 + glow * 0.7
    px(g, "#fff8a0", fx, fy, 1, 1)
    g.globalAlpha = glow * 0.25
    px(g, "#fff8a0", fx - 1, fy - 1, 3, 3)
  }
  g.globalAlpha = 1
  // 落ち葉
  for (let i = 0; i < 4; i++) {
    const p = (t * 0.12 + i / 4) % 1
    const lx = 20 + i * 26 + Math.sin(t * 2 + i) * 6
    px(g, i % 2 ? "#c8a040" : "#6aa04a", lx, p * 80, 2, 1)
  }
}

// ---- どうくつ ----
function caveBase(g, rand) {
  bands(g, ["#16121c", "#1e1826", "#262030", "#2e2838"], 0, HORIZON)
  // かべの いわ
  for (let i = 0; i < 70; i++) {
    const rx = rand() * W
    const ry = rand() * HORIZON
    const rw = 4 + Math.floor(rand() * 8)
    px(g, rand() < 0.5 ? "#3a3444" : "#221c2a", rx, ry, rw, 2 + Math.floor(rand() * 3))
  }
  // つらら（上から）
  for (let x = 0; x < W; x += 6 + Math.floor(rand() * 6)) {
    const h = 5 + Math.floor(rand() * 12)
    for (let i = 0; i < h; i++) {
      const w = Math.max(1, Math.round(3 * (1 - i / h)))
      px(g, i < 2 ? "#4a4256" : "#3a3444", x - Math.floor(w / 2), i, w, 1)
    }
    px(g, "#6a6280", x, 1, 1, Math.max(1, h - 4))
  }
  // 水晶
  const crystal = (x, y, h, color, light) => {
    for (let i = 0; i < h; i++) {
      const w = i < 2 ? 1 + i : 3
      px(g, color, x - Math.floor(w / 2), y - h + i, w, 1)
    }
    px(g, light, x, y - h + 1, 1, h - 2)
  }
  crystal(30, 52, 9, "#9b5fd0", "#e0c0ff")
  crystal(34, 54, 6, "#5fa8e0", "#c0e8ff")
  crystal(96, 50, 10, "#5fa8e0", "#c0e8ff")
  crystal(91, 53, 6, "#9b5fd0", "#e0c0ff")
  crystal(62, 30, 5, "#9b5fd0", "#e0c0ff")
  // 地面
  bands(g, ["#4a4252", "#544c5e", "#5a5260", "#4e4656"], HORIZON, H)
  for (let i = 0; i < 70; i++) px(g, rand() < 0.5 ? "#3a3444" : "#6a6274", rand() * W, HORIZON + 2 + rand() * (H - HORIZON), 2 + Math.floor(rand() * 3), 1)
  // たけのこ いわ（下から）
  for (const [sx, h] of [[6, 14], [14, 8], [118, 16], [110, 7], [60, 6]]) {
    for (let i = 0; i < h; i++) {
      const w = Math.max(1, Math.round(4 * (i / h)))
      px(g, "#3a3444", sx - Math.floor(w / 2), HORIZON + 4 - h + i, w, 1)
    }
  }
  // たいまつの 台
  for (const tx of [22, 104]) {
    px(g, "#1a1414", tx - 1, 32, 4, 10)
    px(g, "#6e4423", tx, 32, 2, 10)
    px(g, "#2b2b35", tx - 2, 30, 6, 2)
  }
}

function caveLive(g, t, rand) {
  // たいまつの ほのお（ゆらゆら）と あかり
  for (const [i, tx] of [[0, 22], [1, 104]]) {
    const f = Math.sin(t * 13 + i * 2) > 0 ? 1 : 0
    glow(g, tx + 1, 27, 18 + f, "255, 160, 60", 0.08)
    px(g, "#e0484d", tx - 1, 25 - f, 4, 5 + f)
    px(g, "#ff9a3a", tx, 26 - f, 2, 4 + f)
    px(g, "#ffe066", tx, 28, 2, 2)
    if (f) px(g, "#ff9a3a", tx + 1, 22, 1, 2)
  }
  // 水晶が きらっ
  for (const [i, cx, cy] of [[0, 30, 45], [1, 96, 42], [2, 62, 26]]) {
    if (Math.sin(t * 2 + i * 2.2) > 0.85) {
      px(g, "#ffffff", cx, cy - 2, 1, 5)
      px(g, "#ffffff", cx - 2, cy, 5, 1)
    }
  }
  // しずく
  const p = (t * 0.5) % 1
  px(g, "#9fd6ff", 76, 8 + p * 48, 1, 2)
  if (p > 0.95) {
    px(g, "#9fd6ff", 74, 57, 1, 1)
    px(g, "#9fd6ff", 78, 57, 1, 1)
  }
}

// ---- 山 ----
function mountainBase(g, rand) {
  bands(g, ["#8fb8e8", "#a4c6ec", "#b8d4f0", "#cce0f4", "#e0ecf8"], 0, HORIZON)
  disc(g, 104, 12, 5, "#fff6c0")
  disc(g, 104, 12, 3, "#ffffff")
  // 遠くの山
  peak(g, 20, HORIZON - 6, 26, 26, "#b0c4dc", "#f4f8ff", 7)
  peak(g, 64, HORIZON - 6, 36, 34, "#a0b6d2", "#f4f8ff", 10)
  peak(g, 110, HORIZON - 6, 28, 28, "#b0c4dc", "#f4f8ff", 8)
  // まんなかの山
  peak(g, 40, HORIZON + 2, 26, 30, "#7a8aa4", "#ffffff", 7)
  peak(g, 96, HORIZON + 2, 30, 34, "#6e7e98", "#ffffff", 8)
  // 山の かげ
  g.fillStyle = "rgba(40, 50, 80, 0.15)"
  for (let i = 0; i < 26; i++) g.fillRect(40, HORIZON + 2 - 26 + i, Math.round((i / 26) * 30), 1)
  // くもの海
  for (let i = 0; i < 12; i++) disc(g, i * 12 + rand() * 4, HORIZON - 2, 4 + Math.floor(rand() * 3), "#f4f8ff")
  // 地面（いわと 雪）
  bands(g, ["#8a8a7a", "#7e7e70", "#747466", "#6e6e60"], HORIZON, H)
  for (let i = 0; i < 60; i++) px(g, rand() < 0.5 ? "#6e6e60" : "#9a9a8a", rand() * W, HORIZON + 2 + rand() * (H - HORIZON), 2 + Math.floor(rand() * 4), 1)
  for (let i = 0; i < 10; i++) {
    const sx = rand() * W
    const sy = HORIZON + 4 + rand() * 34
    const sw = 6 + Math.floor(rand() * 6)
    px(g, "#f4f8ff", sx + 1, sy, sw - 2, 1)
    px(g, "#f4f8ff", sx, sy + 1, sw, 1)
    px(g, "#dce4ec", sx + 1, sy + 2, sw - 2, 1)
    px(g, "#ffffff", sx + 2, sy, 2, 1)
  }
  // 小さな もみの木
  for (const [tx, ty] of [[8, 66], [16, 62], [122, 64]]) {
    for (let i = 0; i < 8; i++) px(g, "#2f5a3a", tx - Math.floor(i / 2), ty - 8 + i, 1 + Math.floor(i / 2) * 2, 1)
    px(g, "#ffffff", tx, ty - 8, 1, 1)
    px(g, "#5e3a1f", tx, ty, 1, 2)
  }
  // 頂上の はた の ぼう
  px(g, "#1a1414", 112, 40, 1, 20)
  px(g, "#6e6e60", 109, 59, 7, 2)
}

function mountainLive(g, t, rand) {
  // はた（ひらひら）
  for (let i = 0; i < 8; i++) {
    const wave = Math.round(Math.sin(t * 6 - i * 0.8))
    px(g, i < 2 ? "#ffffff" : "#e0484d", 113 + i, 40 + wave, 1, 5)
  }
  // ゆき
  for (let i = 0; i < 24; i++) {
    const p = (t * (0.08 + (i % 5) * 0.01) + rand()) % 1
    const sx = (rand() * W + Math.sin(t + i) * 4 + t * 3) % W
    px(g, "#ffffff", sx, p * H, 1, 1)
  }
  // ゆっくり流れる くも
  const x = ((t * 2.5) % 170) - 30
  cloud(g, x, 20, "#ffffff", "#dce8f4")
}

export const SCENES = {
  park: { base: parkBase, live: parkLive },
  forest: { base: forestBase, live: forestLive },
  cave: { base: caveBase, live: caveLive },
  mountain: { base: mountainBase, live: mountainLive }
}

const cache = {}

// 動かないところ（1回だけ描いて取っておく）
export function sceneBase(place) {
  if (cache[place.id]) return cache[place.id]
  const c = document.createElement("canvas")
  c.width = W
  c.height = H
  const g = c.getContext("2d")
  const scene = SCENES[place.id]
  if (scene) {
    scene.base(g, seededRandom(place.id.length * 977 + 13))
  } else {
    px(g, place.sky, 0, 0, W, HORIZON)
    px(g, place.ground, 0, HORIZON, W, H - HORIZON)
    for (let y = HORIZON + 4; y < H; y += 8) px(g, place.line, 0, y, W, 1)
  }
  cache[place.id] = c
  return c
}

// けしきを描く（t：秒、scroll：歩いた きょり。けしきが 左へ ながれる）
// 右どなりに 左右反転した けしき を ならべて、つなぎめが 見えないようにする
export function drawScene(g, place, t, scroll = 0) {
  const base = sceneBase(place)
  const x0 = -Math.round(scroll % (W * 2))
  if (x0 === 0) {
    g.drawImage(base, 0, 0)
  } else {
    g.drawImage(base, x0, 0)
    g.save()
    g.translate(x0 + W * 2, 0)
    g.scale(-1, 1)
    g.drawImage(base, 0, 0)
    g.restore()
    g.drawImage(base, x0 + W * 2, 0)
  }
  const scene = SCENES[place.id]
  if (scene) scene.live(g, t, seededRandom(place.id.length * 131 + 7))
}
