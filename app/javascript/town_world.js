// 🏘️ はじまりのまち（ログインしたあとの 入口の 世界）の 絵。docs/town/requirements.md
// 町（世界）は 256×120 ドット。画面に 見せるのは その一部（スマホは 160 はば、PC は ぜんぶ。town_controller.js）
// 建物に 入ると、歌ってみた・サムネ・Dettyan・切り抜き の 画面へ
// - 動かないところは drawTownBase で1回だけ描いて取っておく。空・ふんすい・夜のあかり は毎コマ
// - 空は 日本の時間で 朝・昼・夕方・夜（Dettyan 育成ゲームの部屋と同じ色）

export const TOWN_W = 256 // 世界の はば
export const TOWN_H = 120
export const VIEW_NARROW = 160 // スマホで 見せる はば（自分の キャラに ついて 横に 動く）
export const GROUND = 62 // 建物の 足もと
// 歩けるところ（ふんすい の まわりは よける）
export const WALK = { left: 10, right: TOWN_W - 10, top: 68, bottom: 114 }
export const FOUNTAIN = { x: 128, y: 92, rx: 20, ry: 9 }

// 建物（id は トップページの カードの data-town-place と同じ）
export const BUILDINGS = [
  { id: "sing", name: "スタジオ", icon: "🎤", x: 12, wall: "#6a9ae8", shade: "#4a76c8", roof: "#2a4a9a", sign: "mic" },
  { id: "art", name: "アトリエ", icon: "🎨", x: 62, wall: "#ffaed0", shade: "#e88ab0", roof: "#c0487a", sign: "palette" },
  { id: "dettyan", name: "Dettyan の 事務所", icon: "🏢", x: 160, wall: "#d8a870", shade: "#b88a50", roof: "#6e4423", sign: "dettyan" },
  { id: "clip", name: "編集室", icon: "✂️", x: 210, wall: "#7ad8c0", shade: "#4ab8a0", roof: "#2a8a7a", sign: "scissors" }
]
const BW = 34

// 建物の 入口（ここまで 歩いてから 入る）
export const BUILDING_W = BW

export function doorOf(id) {
  const b = BUILDINGS.find((x) => x.id === id)
  return b ? { x: b.x + BW / 2, y: GROUND + 5 } : null
}

// 歩く先を 歩けるところに おさめる（ふんすい の中なら 外へ）
export function clampWalk(x, y) {
  let cx = Math.max(WALK.left, Math.min(WALK.right, x))
  let cy = Math.max(WALK.top, Math.min(WALK.bottom, y))
  const dx = (cx - FOUNTAIN.x) / FOUNTAIN.rx
  const dy = (cy - FOUNTAIN.y) / FOUNTAIN.ry
  const d = Math.hypot(dx, dy)
  if (d < 1) {
    const k = 1.05 / Math.max(d, 0.01)
    cx = FOUNTAIN.x + dx * k * FOUNTAIN.rx
    cy = FOUNTAIN.y + (d < 0.01 ? 1.05 : dy * k) * FOUNTAIN.ry
  }
  return { x: cx, y: cy }
}

const LAMPS = [50, 116, 140, 204]

// けいじばん（町の おしらせ。絵だけ）
function drawBoard(g, x, y) {
  const K = "#1a1414"
  px(g, K, x + 2, y + 12, 2, 12)
  px(g, K, x + 28, y + 12, 2, 12)
  px(g, "#6e4423", x + 2, y + 12, 1, 12)
  px(g, "#6e4423", x + 28, y + 12, 1, 12)
  px(g, K, x - 1, y - 1, 34, 15)
  px(g, "#8a5a33", x, y, 32, 13)
  px(g, "#f4ecd8", x + 2, y + 2, 12, 9)
  px(g, "#ffd8e8", x + 17, y + 2, 13, 5)
  px(g, "#d8ecff", x + 17, y + 8, 13, 3)
  for (const [lx, ly, lw] of [[3, 4, 9], [3, 6, 7], [3, 8, 9], [18, 4, 10], [18, 9, 8]]) px(g, "#9a8a70", x + lx, y + ly, lw, 1)
  px(g, "#e0484d", x + 7, y + 1, 2, 2)
  px(g, "#4f8fe8", x + 23, y + 1, 2, 2)
}

const px = (g, color, x, y, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), w, h) }

function oval(g, cx, cy, rx, ry, color) {
  for (let y = -ry; y <= ry; y++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))))
    px(g, color, cx - w, cy + y, w * 2 + 1, 1)
  }
}

function disc(g, cx, cy, r, color) {
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(r * r - y * y + r * 0.6))
    px(g, color, cx - w, cy + y, w * 2 + 1, 1)
  }
}

// 種つきの乱数（いつも 同じ 町に なる）
function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---- 時間 ----
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

// ---- 動かないところ ----
export function drawTownBase(g) {
  const rand = seeded(2026)
  // 遠くの おか と 木
  for (let x = 0; x < TOWN_W; x++) {
    const h = Math.round(9 + Math.sin(x * 0.06) * 3 + Math.sin(x * 0.17) * 1.5)
    px(g, "#7cb86a", x, 40 - h, 1, h + 4)
    px(g, "#6aa85a", x, 40 - Math.max(0, h - 3), 1, 1)
  }
  // 建物の うしろ：くさはら と いけがき（建物の すきま から 見える）
  px(g, "#86c474", 0, 38, TOWN_W, GROUND - 36)
  for (let x = 0; x < TOWN_W; x += 6) {
    px(g, "#4f9a52", x, GROUND - 10, 6, 8)
    px(g, "#5cae5c", x + 1, GROUND - 11, 4, 2)
    px(g, "#3f8a44", x, GROUND - 3, 6, 1)
  }
  // ひろば（いしだたみ）
  for (let y = GROUND - 2; y < TOWN_H; y += 4) {
    for (let x = (y / 4) % 2 ? -4 : 0; x < TOWN_W; x += 8) {
      const c = ["#e8dcc4", "#e0d2b8", "#ecdfc8", "#dccdb0"][Math.floor(rand() * 4)]
      px(g, c, x, y, 8, 4)
      px(g, "#cbbb9c", x, y + 3, 8, 1)
      px(g, "#cbbb9c", x, y, 1, 4)
    }
  }
  // 建物の前の 道（すこし こい いし）
  for (const b of BUILDINGS) {
    for (let y = GROUND; y < GROUND + 10; y++) px(g, "#d4c4a4", b.x + 11, y, 12, 1)
  }
  for (const b of BUILDINGS) drawBuilding(g, b)
  // まんなかの おく：けいじばん と 大きな木
  drawBoard(g, 112, 40)
  // 木（はし と 建物の あいだ）
  for (const [tx, ty] of [[6, 76], [104, 66], [152, 66], [250, 76], [56, 104], [200, 104]]) {
    px(g, "#1a1414", tx - 2, ty - 6, 5, 14)
    px(g, "#6e4423", tx - 1, ty - 6, 3, 14)
    disc(g, tx, ty - 12, 8, "#1a1414")
    disc(g, tx, ty - 12, 7, "#3f8a4a")
    disc(g, tx - 2, ty - 15, 4, "#55a85e")
    px(g, "rgba(0,0,0,0.15)", tx - 6, ty + 7, 13, 2)
  }
  // 花だん
  for (const fx of [12, 86, 142, 216]) {
    px(g, "#1a1414", fx, 108, 28, 8)
    px(g, "#8a5a33", fx + 1, 109, 26, 6)
    for (let i = 0; i < 9; i++) {
      const c = ["#ff6b8a", "#ffd84d", "#ffffff", "#c88aff"][i % 4]
      px(g, "#3f8a4a", fx + 2 + i * 3, 108, 1, 2)
      px(g, c, fx + 1 + i * 3, 106, 3, 2)
    }
  }
  // ベンチ
  for (const bx of [92, 152]) {
    px(g, "#1a1414", bx, 98, 14, 1)
    px(g, "#9a6a3a", bx, 95, 14, 3)
    px(g, "#b88a5a", bx, 95, 14, 1)
    px(g, "#2b2b35", bx + 1, 99, 1, 3)
    px(g, "#2b2b35", bx + 12, 99, 1, 3)
  }
  // 街灯
  for (const lx of LAMPS) {
    px(g, "#2b2b35", lx, 66, 2, 26)
    px(g, "#2b2b35", lx - 2, 64, 6, 3)
    px(g, "#fff2b0", lx - 1, 65, 4, 1)
    px(g, "#2b2b35", lx - 2, 91, 6, 2)
  }
  // ふんすい（台）
  const f = FOUNTAIN
  oval(g, f.x, f.y + 2, f.rx - 2, f.ry - 2, "rgba(0,0,0,0.12)")
  oval(g, f.x, f.y, f.rx - 3, f.ry - 3, "#1a1414")
  oval(g, f.x, f.y, f.rx - 4, f.ry - 4, "#b8b8c8")
  oval(g, f.x, f.y - 1, f.rx - 7, f.ry - 5, "#5ec8ff")
  px(g, "#1a1414", f.x - 2, f.y - 14, 5, 14)
  px(g, "#d0d0e0", f.x - 1, f.y - 14, 3, 14)
  oval(g, f.x, f.y - 14, 5, 2, "#1a1414")
  oval(g, f.x, f.y - 14, 4, 1, "#9fe0ff")
}

function drawBuilding(g, b) {
  const x = b.x
  const top = 30
  const K = "#1a1414"
  // かべ
  px(g, K, x - 1, top - 1, BW + 2, GROUND - top + 1)
  px(g, b.wall, x, top, BW, GROUND - top)
  px(g, b.shade, x + BW - 4, top, 4, GROUND - top)
  // やね（さんかく）
  for (let i = 0; i < 12; i++) {
    const w = BW + 6 - i * 3
    if (w <= 0) break
    px(g, K, x - 3 + i * 1.5 - 1, top - 1 - i, w + 2, 1)
    px(g, b.roof, x - 3 + i * 1.5, top - 1 - i, w, 1)
    if (i % 3 === 1) px(g, "rgba(0,0,0,0.18)", x - 3 + i * 1.5, top - 1 - i, w, 1)
  }
  // まど（左右）
  for (const wx of [x + 3, x + BW - 10]) {
    px(g, K, wx - 1, 34, 8, 8)
    px(g, "#bfe6ff", wx, 35, 6, 6)
    px(g, "#ffffff", wx, 35, 2, 1)
    px(g, K, wx + 3, 35, 1, 6)
  }
  // かんばん
  px(g, K, x + 11, 32, 12, 11)
  px(g, "#fff6e0", x + 12, 33, 10, 9)
  drawSign(g, b.sign, x + 13, 34)
  // とびら
  px(g, K, x + 12, 46, 10, GROUND - 46)
  px(g, "#6e4423", x + 13, 47, 8, GROUND - 47)
  px(g, "#8a5a33", x + 13, 47, 4, GROUND - 47)
  px(g, "#ffd84d", x + 19, 54, 1, 2)
  // かざり
  if (b.sign === "mic") {
    // ON AIR の ランプ と アンテナ
    px(g, K, x + 26, 12, 1, 8)
    px(g, "#e0484d", x + 25, 10, 3, 3)
  } else if (b.sign === "palette") {
    for (const [fx, c] of [[x + 1, "#ff6b8a"], [x + BW - 5, "#ffd84d"]]) {
      px(g, "#c46a3a", fx, GROUND - 4, 4, 4)
      px(g, "#3f8a4a", fx + 1, GROUND - 7, 2, 3)
      px(g, c, fx, GROUND - 9, 4, 2)
    }
  } else if (b.sign === "dettyan") {
    // はた
    px(g, K, x + 6, 6, 1, 14)
    px(g, "#ffb347", x + 7, 6, 7, 4)
  } else if (b.sign === "scissors") {
    // フィルム
    px(g, K, x + 3, 44, 7, 6)
    px(g, "#4a4a58", x + 4, 45, 5, 4)
    px(g, "#bfe6ff", x + 5, 46, 3, 2)
  }
}

// かんばんの 絵（8×7）
function drawSign(g, kind, x, y) {
  const art = {
    mic: ["..KKK...", ".KMMMK..", ".KMMMK..", "..KKK...", "...K....", "...K....", "..KKK..."],
    palette: [".KKKKK..", "KYYrYYK.", "KYbYYgK.", "KYYYKKK.", "KYpYK...", ".KKK....", "........"],
    dettyan: ["..KKK...", ".KHHHK..", "KHSSSHK.", "KSESESK.", "KSSmSSK.", ".KSSSK..", "..KKK..."],
    scissors: ["K....K..", ".K..K...", "..KK....", "..KK....", ".KrKr...", "Kr..rK..", ".K...K.."]
  }[kind]
  const colors = { K: "#1a1414", M: "#9aa0b0", Y: "#e8c890", r: "#e0484d", b: "#4f8fe8", g: "#5cc46a", p: "#9b5fd0", H: "#1f1f24", S: "#f6d3b3", E: "#1a1414", m: "#9a4a3a" }
  art.forEach((row, yy) => {
    for (let xx = 0; xx < row.length; xx++) if (row[xx] !== ".") px(g, colors[row[xx]], x + xx, y + yy, 1, 1)
  })
}

// ---- 毎コマ ----
export function drawTownSky(g, now, t) {
  const tod = timeOfDay(now)
  const bands = SKY[tod]
  for (let y = 0; y < 34; y++) px(g, bands[Math.min(bands.length - 1, Math.floor((y / 34) * bands.length))], 0, y, TOWN_W, 1)
  const rand = seeded(7)
  if (tod === "night") {
    for (let i = 0; i < 30; i++) {
      const sx = rand() * TOWN_W
      const sy = rand() * 28
      if (Math.sin(t * 2 + i * 1.3) > -0.4) px(g, i % 5 ? "#c8d0ff" : "#ffffff", sx, sy, 1, 1)
    }
    disc(g, 132, 9, 4, "#fff6c0")
    disc(g, 134, 8, 3, SKY.night[0])
  } else {
    if (tod !== "evening") disc(g, 136, 9, 4, tod === "day" ? "#fff6c0" : "#ffb070")
    for (let i = 0; i < 3; i++) {
      const cx = ((rand() * TOWN_W + t * (1.2 + i * 0.5)) % (TOWN_W + 30)) - 15
      const cy = 5 + i * 7
      const col = tod === "evening" ? "#ffc0a0" : "#ffffff"
      px(g, col, cx, cy, 14, 2)
      px(g, col, cx + 4, cy - 1, 7, 1)
    }
  }
}

// ふんすい の 水しぶき
export function drawTownLive(g, t) {
  const f = FOUNTAIN
  for (let i = 0; i < 8; i++) {
    const p = (t * 1.1 + i / 8) % 1
    const dx = (i - 3.5) * 2.6 * p
    px(g, "#c8f0ff", f.x + dx, f.y - 15 - Math.sin(p * Math.PI) * 7, 1, 1)
  }
}

// 夜：すこし くらく、まど と 街灯 に あかり
export function drawTownNight(g, now) {
  const tod = timeOfDay(now)
  if (tod !== "night" && tod !== "evening") return
  g.fillStyle = tod === "night" ? "rgba(14, 18, 50, 0.32)" : "rgba(60, 20, 50, 0.10)"
  g.fillRect(0, 0, TOWN_W, TOWN_H)
  if (tod !== "night") return
  for (const b of BUILDINGS) {
    for (const wx of [b.x + 3, b.x + BW - 10]) px(g, "#ffd86a", wx, 35, 6, 6)
  }
  g.fillStyle = "rgba(255, 230, 150, 0.12)"
  for (const lx of LAMPS) {
    for (let r = 4; r <= 14; r += 5) g.fillRect(lx + 1 - r, 66 - r / 2, r * 2, r)
  }
}
