// 🎬 歌ってみた：MV の絵を描く部品（手順4a）
// renderFrame(g, w, h, t, scene) … 「曲の t 秒目の1コマ」を描く。
// プレビュー・録画方式の書き出し・将来の速い書き出し（WebCodecs・4e）で、同じ関数を使う。
// 音に合わせて動くための値（features）は外から渡す（今は再生中の音から。4e では先に計算した値から）
//
// scene = {
//   template: "simple" | "jacket" | "visualizer",
//   image: 背景の画像（なければ gradient）, gradient: MV_GRADIENTS の1つ,
//   colors: { accent, accent2 }, dim: 0〜1（背景を暗くする量）,
//   title, artist, credit, bgCredit, duration（秒）,
//   showIntro, showOutro, showProgress,
//   features: { level: 0〜1, bands: Float32Array(0〜1) },
//   lyrics: [{ text, startSec, endSec }]（時間が決まっている行だけ・時間順）, karaoke: 色が変わるか,
//   fx: { beats: [秒], energy: Float32Array, energyHop, sections: [{ startSec, endSec, kind: "chorus" | "calm" }],
//         strength: 0〜1, beat, chorus, sparkle }（4c：おまかせ演出。なければ演出なし）
// }

export const MV_TEMPLATES = Object.freeze({
  simple: { label: "🌊 シンプル", hint: "背景＋下に音の波＋左上に曲名。どんな曲にも合う" },
  jacket: { label: "💿 ジャケット", hint: "真ん中に画像をジャケットのように。ゆっくり動く" },
  visualizer: { label: "🌀 ビジュアライザー", hint: "曲名のまわりを、音に合わせて輪がはねる" }
})

// 動画の向き（4d）。大きさは「短い辺 720」を基準に、正方形だけ少し大きめ
export const MV_RATIOS = Object.freeze({
  "16:9": { label: "🖥 横（YouTube）", width: 1280, height: 720 },
  "9:16": { label: "📱 縦（TikTok・ショート）", width: 720, height: 1280 },
  "1:1": { label: "⬜ 正方形（Instagram）", width: 960, height: 960 }
})

// 横長・正方形・縦長で並べ方を変える
export function layoutOf(w, h) {
  const r = w / h
  if (r > 1.2) return "wide"
  if (r < 0.83) return "tall"
  return "square"
}

export const MV_GRADIENTS = Object.freeze([
  { id: "ocean", label: "海", stops: ["#0d1b3d", "#2f6fed"] },
  { id: "sky", label: "空", stops: ["#5ab0ff", "#c9e6ff"] },
  { id: "night", label: "夜", stops: ["#0b0f2a", "#4b2a8a"] },
  { id: "sunset", label: "夕焼け", stops: ["#ff7a59", "#7b3fa0"] },
  { id: "sakura", label: "さくら", stops: ["#ffd1e3", "#ff8ac6"] },
  { id: "mint", label: "ミント", stops: ["#0f4c4c", "#4fd1b5"] }
])

// ---------- 色をおまかせで決める ----------

// 画像を小さくして、一番目立つ色（あざやかで明るめ）を探す → 波形や線の色に使う
export function pickColors(image) {
  try {
    const c = document.createElement("canvas")
    c.width = 32
    c.height = 32
    const g = c.getContext("2d", { willReadFrequently: true })
    g.drawImage(image, 0, 0, 32, 32)
    const d = g.getImageData(0, 0, 32, 32).data
    let best = null
    let bestScore = -1
    for (let i = 0; i < d.length; i += 4) {
      const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2])
      const score = s * (1 - Math.abs(l - 0.55) * 1.6)
      if (score > bestScore) { bestScore = score; best = [h, s, l] }
    }
    if (!best || bestScore < 0.08) return { accent: "#7cc8ff", accent2: "#ffffff" }
    const [h, s] = best
    return { accent: hsl(h, Math.max(0.6, s), 0.68), accent2: hsl((h + 0.08) % 1, Math.max(0.5, s), 0.82) }
  } catch (e) {
    return { accent: "#7cc8ff", accent2: "#ffffff" } // 読めない画像のとき
  }
}

export function gradientColors(gradient) {
  const [r, g, b] = hexToRgb(gradient.stops[1])
  const [h, s] = rgbToHsl(r, g, b)
  return { accent: hsl(h, Math.max(0.6, s), 0.72), accent2: "#ffffff" }
}

function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h / 6, s, l]
}

function hsl(h, s, l) {
  return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`
}

// ---------- 描く部品 ----------

const FONT = '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif'
const smooth = (x) => x * x * (3 - 2 * x)
const clamp01 = (x) => Math.max(0, Math.min(1, x))

// 画像をすき間なく敷く（はみ出た所は切る）。zoom と横・縦のずらし（-1〜1）で動かせる
function drawCover(g, img, x, y, w, h, zoom = 1, panX = 0, panY = 0) {
  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  if (!iw || !ih) return
  const scale = Math.max(w / iw, h / ih) * zoom
  const dw = iw * scale
  const dh = ih * scale
  const dx = x + (w - dw) / 2 + panX * (dw - w) / 2
  const dy = y + (h - dh) / 2 + panY * (dh - h) / 2
  g.drawImage(img, dx, dy, dw, dh)
}

function drawBackground(g, w, h, scene, zoom = 1, panX = 0) {
  if (scene.image) {
    g.fillStyle = "#000"
    g.fillRect(0, 0, w, h)
    drawCover(g, scene.image, 0, 0, w, h, zoom, panX)
  } else {
    const gr = g.createLinearGradient(0, 0, w * 0.3, h)
    const stops = (scene.gradient || MV_GRADIENTS[0]).stops
    gr.addColorStop(0, stops[0])
    gr.addColorStop(1, stops[1])
    g.fillStyle = gr
    g.fillRect(0, 0, w, h)
  }
}

// ぼかした背景（Safari でも動くように「小さく描いてから引き伸ばす」）
let blurCanvas = null
function drawBlurredBackground(g, w, h, scene) {
  if (!scene.image) { drawBackground(g, w, h, scene); return }
  if (!blurCanvas) blurCanvas = document.createElement("canvas")
  const bw = 48
  const bh = Math.max(1, Math.round((48 * h) / w))
  if (blurCanvas.width !== bw || blurCanvas.height !== bh) { blurCanvas.width = bw; blurCanvas.height = bh }
  const b = blurCanvas.getContext("2d")
  drawCover(b, scene.image, 0, 0, bw, bh, 1.1)
  g.save()
  g.imageSmoothingEnabled = true
  g.imageSmoothingQuality = "high"
  g.drawImage(blurCanvas, 0, 0, w, h)
  g.restore()
}

function dim(g, w, h, amount) {
  if (amount <= 0) return
  g.fillStyle = `rgba(0,0,0,${amount})`
  g.fillRect(0, 0, w, h)
}

// 幅に入るように文字を小さくして書く
function fitText(g, text, x, y, maxWidth, size, { weight = 700, align = "left", color = "#fff", alpha = 1, shadow = true } = {}) {
  if (!text) return 0
  let s = size
  g.font = `${weight} ${s}px ${FONT}`
  while (s > 10 && g.measureText(text).width > maxWidth) {
    s -= 2
    g.font = `${weight} ${s}px ${FONT}`
  }
  g.save()
  g.globalAlpha *= alpha
  g.textAlign = align
  g.textBaseline = "alphabetic"
  if (shadow) {
    g.shadowColor = "rgba(0,0,0,0.55)"
    g.shadowBlur = s * 0.25
    g.shadowOffsetY = s * 0.04
  }
  g.fillStyle = color
  g.fillText(text, x, y)
  g.restore()
  return s
}

function bandsOf(scene, n) {
  const src = scene.features?.bands
  const out = new Float32Array(n)
  if (!src || !src.length) return out
  for (let i = 0; i < n; i++) out[i] = src[Math.min(src.length - 1, Math.floor((i / n) * src.length))]
  return out
}

function drawProgress(g, w, h, t, scene, k) {
  if (!scene.showProgress || !scene.duration) return
  const p = clamp01(t / scene.duration)
  g.fillStyle = "rgba(255,255,255,0.18)"
  g.fillRect(0, h - 6 * k, w, 6 * k)
  g.fillStyle = scene.colors.accent
  g.fillRect(0, h - 6 * k, w * p, 6 * k)
}

// 最初の数秒：曲名を大きく（だんだん出て、だんだん消える）
function introAlpha(t) {
  if (t < 0) return 0
  if (t < 0.8) return smooth(t / 0.8)
  if (t < 3.2) return 1
  if (t < 4) return 1 - smooth((t - 3.2) / 0.8)
  return 0
}

// 最後の数秒：クレジット
function outroAlpha(t, duration) {
  const start = duration - 5
  if (!duration || duration < 12 || t < start) return 0
  return smooth(clamp01((t - start) / 1))
}

function drawIntro(g, w, h, t, scene, k) {
  const a = scene.showIntro ? introAlpha(t) : 0
  if (a <= 0) return
  g.save()
  g.globalAlpha = a
  g.fillStyle = "rgba(0,0,0,0.35)"
  g.fillRect(0, 0, w, h)
  const rise = (1 - a) * 20 * k
  fitText(g, scene.title || "歌ってみた", w / 2, h * 0.47 + rise, w * 0.86, 76 * k, { align: "center" })
  if (scene.artist) fitText(g, `歌：${scene.artist}`, w / 2, h * 0.47 + 64 * k + rise, w * 0.8, 34 * k, { weight: 500, align: "center", color: scene.colors.accent2 })
  g.fillStyle = scene.colors.accent
  g.fillRect(w / 2 - 60 * k * a, h * 0.47 + 18 * k, 120 * k * a, 4 * k)
  g.restore()
}

function drawOutro(g, w, h, t, scene, k) {
  const a = scene.showOutro ? outroAlpha(t, scene.duration) : 0
  if (a <= 0) return
  g.save()
  g.globalAlpha = a
  g.fillStyle = "rgba(0,0,0,0.6)"
  g.fillRect(0, 0, w, h)
  const lines = [
    scene.title && ["曲", scene.title],
    scene.artist && ["歌", scene.artist],
    scene.credit && ["オケ", scene.credit],
    scene.bgCredit && ["背景", scene.bgCredit]
  ].filter(Boolean)
  const lh = 54 * k
  let y = h / 2 - ((lines.length - 1) * lh) / 2
  lines.forEach(([label, text]) => {
    fitText(g, label, w / 2 - 24 * k, y, w * 0.2, 26 * k, { weight: 500, align: "right", color: scene.colors.accent })
    fitText(g, text, w / 2 + 4 * k, y, w * 0.45, 30 * k, { weight: 700, align: "left" })
    y += lh
  })
  fitText(g, "Made with KotoBouquet", w / 2, h - 40 * k, w * 0.6, 18 * k, { weight: 500, align: "center", color: "rgba(255,255,255,0.7)" })
  g.restore()
}

// 曲の途中に出す小さい曲名（左上）
function drawCorner(g, w, h, t, scene, k, x = 40 * k, y = 64 * k) {
  const a = scene.showIntro ? clamp01((t - 3.6) / 0.8) : 1
  if (a <= 0 || !scene.title) return
  fitText(g, scene.title, x, y, w * 0.6, 34 * k, { alpha: a })
  if (scene.artist) fitText(g, scene.artist, x, y + 34 * k, w * 0.5, 22 * k, { weight: 500, alpha: a, color: scene.colors.accent2 })
}

// ---------- 🎆 おまかせ演出（4c） ----------
// 拍ではねる・サビで明るく＆キラキラ・サビに入った瞬間にフラッシュ・落ちサビは静かに。
// 全部「t と曲の情報」だけで決まる（同じ t なら同じ絵 → 速い書き出しでも同じになる）

// 直前の拍からの秒数（二分探索）
function sinceBeat(beats, t) {
  if (!beats || !beats.length || t < beats[0]) return Infinity
  let lo = 0
  let hi = beats.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (beats[mid] <= t) lo = mid
    else hi = mid - 1
  }
  return { dt: t - beats[lo], index: lo }
}

// 部分（サビ・落ちサビ）にどれだけ入っているか。入り・出は 0.8 秒かけてなめらかに
function sectionAmount(sections, t, kind) {
  let amount = 0
  let startedAt = null
  ;(sections || []).forEach((s) => {
    if (s.kind !== kind) return
    const a = clamp01((t - s.startSec) / 0.8) * clamp01((s.endSec - t) / 0.8)
    if (a > amount) amount = a
    if (t >= s.startSec && t < s.endSec) startedAt = s.startSec
  })
  return { amount: smooth(amount), startedAt }
}

export function fxState(scene, t) {
  const fx = scene.fx
  const none = { pulse: 0, chorus: 0, calm: 0, flash: 0, energy: 0, accentBeat: false }
  if (!fx || !(fx.strength > 0)) return none
  const st = fx.strength
  const chorusInfo = fx.chorus ? sectionAmount(fx.sections, t, "chorus") : { amount: 0, startedAt: null }
  const calm = fx.chorus ? sectionAmount(fx.sections, t, "calm").amount : 0
  const e = fx.energy && fx.energy.length ? fx.energy[Math.min(fx.energy.length - 1, Math.max(0, Math.floor(t / fx.energyHop)))] : 0.5
  let pulse = 0
  let accentBeat = false
  if (fx.beat) {
    const b = sinceBeat(fx.beats, t)
    if (b !== Infinity) {
      accentBeat = b.index % 4 === 0 // 1小節の頭（強めに）
      pulse = Math.exp(-b.dt / 0.12) * (accentBeat ? 1 : 0.6) * (0.35 + 0.65 * Math.max(e, chorusInfo.amount)) * (1 - calm * 0.8)
    }
  }
  const flash = chorusInfo.startedAt !== null ? Math.exp(-(t - chorusInfo.startedAt) / 0.3) : 0
  return { pulse: pulse * st, chorus: chorusInfo.amount * st, calm: calm * st, flash: flash * st, energy: e, accentBeat }
}

// 決まった並びの「でたらめ」（毎回同じになる）
function hash(i) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function drawSparkles(g, w, h, t, scene, k, amount) {
  if (amount <= 0.01) return
  const n = 46
  g.save()
  g.globalCompositeOperation = "lighter"
  for (let i = 0; i < n; i++) {
    const speed = 30 + hash(i) * 70 // 1秒に何px のぼるか
    const span = h + 60 * k
    const y = h + 30 * k - ((t * speed * k + hash(i + 7) * span) % span)
    const x = hash(i + 3) * w + Math.sin(t * (0.5 + hash(i + 11)) + i) * 20 * k
    const r = (1.5 + hash(i + 5) * 3.5) * k
    const tw = 0.5 + 0.5 * Math.sin(t * (2 + hash(i + 13) * 4) + i * 1.7) // きらめき
    g.globalAlpha = amount * (0.25 + 0.75 * tw)
    g.fillStyle = i % 3 === 0 ? scene.colors.accent : "#ffffff"
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  g.restore()
}

// 全体の光（サビで明るく・拍で少し光る）とフラッシュ
function drawGlow(g, w, h, scene, f) {
  const glow = f.chorus * 0.28 + f.pulse * 0.12
  if (glow > 0.005) {
    const gr = g.createRadialGradient(w / 2, h * 0.55, 0, w / 2, h * 0.55, Math.max(w, h) * 0.75)
    gr.addColorStop(0, scene.colors.accent)
    gr.addColorStop(1, "rgba(0,0,0,0)")
    g.save()
    g.globalCompositeOperation = "lighter"
    g.globalAlpha = glow
    g.fillStyle = gr
    g.fillRect(0, 0, w, h)
    g.restore()
  }
  if (f.flash > 0.01) {
    g.save()
    g.globalAlpha = f.flash * 0.6
    g.fillStyle = "#ffffff"
    g.fillRect(0, 0, w, h)
    g.restore()
  }
  if (f.calm > 0.01) {
    g.save()
    g.globalAlpha = f.calm * 0.3 // 落ちサビは少し暗く
    g.fillStyle = "#000"
    g.fillRect(0, 0, w, h)
    g.restore()
  }
}

// ---------- 歌詞テロップ（4b） ----------

// t 秒目に出す行（なければ -1）
export function lyricIndexAt(lyrics, t) {
  if (!lyrics || !lyrics.length) return -1
  for (let i = lyrics.length - 1; i >= 0; i--) {
    if (t >= lyrics[i].startSec) return t < lyrics[i].endSec ? i : -1
  }
  return -1
}

// 1行を書く。karaoke なら、歌っている所まで色が変わる（左から右へ）
function drawLyricLine(g, text, x, y, maxW, size, scene, { progress = null, alpha = 1, align = "center" } = {}) {
  let s = size
  g.font = `800 ${s}px ${FONT}`
  while (s > 12 && g.measureText(text).width > maxW) {
    s -= 2
    g.font = `800 ${s}px ${FONT}`
  }
  const tw = g.measureText(text).width
  const left = align === "center" ? x - tw / 2 : x
  g.save()
  g.globalAlpha *= alpha
  g.textAlign = "left"
  g.lineJoin = "round"
  g.lineWidth = Math.max(3, s * 0.16)
  g.strokeStyle = "rgba(0,0,0,0.7)" // ふち取り：どんな背景でも読めるように
  g.strokeText(text, left, y)
  g.fillStyle = "#ffffff"
  g.fillText(text, left, y)
  if (progress !== null && progress > 0) {
    g.beginPath()
    g.rect(left - 2, y - s * 1.2, (tw + 4) * Math.min(1, progress), s * 1.6)
    g.clip()
    g.fillStyle = scene.colors.accent
    g.fillText(text, left, y)
  }
  g.restore()
  return s
}

// テロップの位置はテンプレートごとに決める（波や曲名とかぶらないように）
// 縦長（TikTok・ショート）は、下の20%と右の15%にアプリのボタンや説明が重なるので、そこを避ける
function lyricAnchor(scene, w, h, k) {
  const layout = layoutOf(w, h)
  if (scene.template === "jacket") {
    if (layout === "tall") return { x: w * 0.46, y: h * 0.76, maxW: w * 0.8, size: 44 * k, align: "center" }
    if (layout === "square") return { x: w / 2, y: h * 0.88, maxW: w * 0.88, size: 40 * k, align: "center" }
    return { x: w * 0.34 + Math.min(w, h) * 0.29 + 48 * k, y: h / 2 + 150 * k, maxW: w * 0.36, size: 38 * k, align: "left" }
  }
  if (scene.template === "visualizer") {
    if (layout === "tall") return { x: w * 0.46, y: h * 0.74, maxW: w * 0.8, size: 46 * k, align: "center" }
    return { x: w / 2, y: h - 80 * k, maxW: w * 0.9, size: 46 * k, align: "center" }
  }
  if (layout === "tall") return { x: w * 0.46, y: h * 0.58, maxW: w * 0.8, size: 50 * k, align: "center" }
  return { x: w / 2, y: h * 0.56, maxW: w * 0.88, size: 54 * k, align: "center" }
}

function drawLyrics(g, w, h, t, scene, k) {
  const lyrics = scene.lyrics
  if (!lyrics || !lyrics.length) return
  const i = lyricIndexAt(lyrics, t)
  const a = lyricAnchor(scene, w, h, k)
  if (i >= 0) {
    const line = lyrics[i]
    const fadeIn = clamp01((t - line.startSec) / 0.2)
    const fadeOut = clamp01((line.endSec - t) / 0.25)
    const progress = scene.karaoke ? clamp01((t - line.startSec) / Math.max(0.3, (line.endSec - line.startSec) * 0.85)) : null
    drawLyricLine(g, line.text, a.x, a.y, a.maxW, a.size, scene, { progress, alpha: Math.min(fadeIn, fadeOut), align: a.align })
  }
  // 次の行を小さく（すぐ続くときだけ）
  const next = i >= 0 ? lyrics[i + 1] : lyrics.find((l) => l.startSec > t)
  if (next && next.startSec - t < 4) {
    const alpha = i >= 0 ? 0.55 : 0.55 * clamp01(1 - (next.startSec - t - 2) / 2)
    drawLyricLine(g, next.text, a.x, a.y + a.size * 1.15, a.maxW, a.size * 0.62, scene, { alpha, align: a.align })
  }
}

// ---------- テンプレート ----------

function renderSimple(g, w, h, t, scene, k) {
  const level = scene.features?.level || 0
  drawBackground(g, w, h, scene, 1.04 + 0.02 * Math.sin(t * 0.15), Math.sin(t * 0.05) * 0.5)
  dim(g, w, h, scene.dim)
  // 下を少し暗く（波が見えやすいように）
  const gr = g.createLinearGradient(0, h * 0.55, 0, h)
  gr.addColorStop(0, "rgba(0,0,0,0)")
  gr.addColorStop(1, "rgba(0,0,0,0.55)")
  g.fillStyle = gr
  g.fillRect(0, h * 0.55, w, h * 0.45)

  // 音の波（左右対称のバー）
  const n = 48
  const bands = bandsOf(scene, n)
  const bw = (w * 0.8) / (n * 2)
  const tall = layoutOf(w, h) === "tall"
  const base = tall ? h * 0.8 : h - 70 * k // 縦長は、アプリの説明が重なる下の方を避ける
  g.save()
  g.fillStyle = scene.colors.accent
  g.shadowColor = scene.colors.accent
  g.shadowBlur = 16 * k * (0.5 + level)
  for (let i = 0; i < n; i++) {
    const v = bands[i]
    const bh = Math.max(4 * k, v * h * (scene.lyrics?.length ? 0.2 : 0.3))
    const xr = w / 2 + i * bw
    const xl = w / 2 - (i + 1) * bw
    g.fillRect(xr + bw * 0.15, base - bh, bw * 0.7, bh)
    g.fillRect(xl + bw * 0.15, base - bh, bw * 0.7, bh)
  }
  g.restore()
  if (tall) drawCorner(g, w, h, t, scene, k, 40 * k, h * 0.12)
  else drawCorner(g, w, h, t, scene, k)
}

function renderJacket(g, w, h, t, scene, k) {
  const level = scene.features?.level || 0
  drawBlurredBackground(g, w, h, scene)
  dim(g, w, h, Math.max(0.25, scene.dim))
  const layout = layoutOf(w, h)
  const portrait = layout !== "wide" // 縦長・正方形は、ジャケットの下に曲名
  const size = Math.min(w, h) * (layout === "tall" ? 0.72 : layout === "square" ? 0.48 : 0.58) * (1 + level * 0.025)
  const cx = portrait ? w / 2 : w * 0.34
  const cy = layout === "tall" ? h * 0.36 : layout === "square" ? h * 0.35 : h / 2
  // ジャケット
  g.save()
  g.shadowColor = "rgba(0,0,0,0.5)"
  g.shadowBlur = 40 * k
  g.shadowOffsetY = 12 * k
  g.fillStyle = "#000"
  g.fillRect(cx - size / 2, cy - size / 2, size, size)
  g.restore()
  g.save()
  g.beginPath()
  g.rect(cx - size / 2, cy - size / 2, size, size)
  g.clip()
  if (scene.image) drawCover(g, scene.image, cx - size / 2, cy - size / 2, size, size, 1.08 + 0.06 * Math.sin(t * 0.1), Math.sin(t * 0.07))
  else drawBackground(g, w, h, scene)
  g.restore()
  // 曲名・名前
  const tx = portrait ? w / 2 : cx + size / 2 + 48 * k
  const ty = portrait ? cy + size / 2 + (layout === "square" ? 60 : 80) * k : cy - 10 * k
  const align = portrait ? "center" : "left"
  const maxW = portrait ? w * 0.85 : w - tx - 40 * k
  const a = scene.showIntro ? clamp01((t - 0.3) / 1.2) : 1
  fitText(g, scene.title || "歌ってみた", tx, ty, maxW, 54 * k, { align, alpha: a })
  if (scene.artist) fitText(g, scene.artist, tx, ty + 48 * k, maxW, 28 * k, { weight: 500, align, alpha: a, color: scene.colors.accent2 })
  // 細い波（曲名の下）。正方形は場所がないので出さない
  if (layout === "square") return
  const n = 32
  const bands = bandsOf(scene, n)
  const bx = portrait ? w / 2 - maxW / 2 : tx
  const by = ty + 90 * k
  const bw = Math.min(maxW, 420 * k) / n
  g.fillStyle = scene.colors.accent
  for (let i = 0; i < n; i++) {
    const bh = Math.max(3 * k, bands[i] * 70 * k)
    g.fillRect(bx + i * bw, by - bh / 2, bw * 0.6, bh)
  }
}

function renderVisualizer(g, w, h, t, scene, k) {
  const level = scene.features?.level || 0
  drawBackground(g, w, h, scene, 1.06, 0)
  dim(g, w, h, Math.max(0.3, scene.dim))
  const cx = w / 2
  const cy = h / 2
  const r = Math.min(w, h) * 0.22 * (1 + level * 0.08)
  const n = 96
  const bands = bandsOf(scene, n / 2)
  g.save()
  g.translate(cx, cy)
  g.rotate(t * 0.05)
  g.strokeStyle = scene.colors.accent
  g.lineCap = "round"
  g.lineWidth = Math.max(2, (2 * Math.PI * r) / n * 0.45)
  g.shadowColor = scene.colors.accent
  g.shadowBlur = 18 * k
  // 線をまとめて1回で描く（光らせる処理が重いので、スマホでもかくかくしないように）
  g.beginPath()
  for (let i = 0; i < n; i++) {
    const v = bands[i < n / 2 ? i : n - 1 - i] // 左右対称
    const len = 8 * k + v * Math.min(w, h) * 0.18
    const ang = (i / n) * Math.PI * 2
    g.moveTo(Math.cos(ang) * r, Math.sin(ang) * r)
    g.lineTo(Math.cos(ang) * (r + len), Math.sin(ang) * (r + len))
  }
  g.stroke()
  g.restore()
  // 真ん中の円と曲名
  g.save()
  g.beginPath()
  g.arc(cx, cy, r * 0.92, 0, Math.PI * 2)
  g.fillStyle = "rgba(0,0,0,0.35)"
  g.fill()
  g.restore()
  const a = scene.showIntro ? clamp01((t - 3.6) / 0.8) : 1
  fitText(g, scene.title || "歌ってみた", cx, cy + 8 * k, r * 1.6, 40 * k, { align: "center", alpha: a })
  if (scene.artist) fitText(g, scene.artist, cx, cy + 44 * k, r * 1.5, 22 * k, { weight: 500, align: "center", alpha: a, color: scene.colors.accent2 })
}

const RENDERERS = { simple: renderSimple, jacket: renderJacket, visualizer: renderVisualizer }

export function renderFrame(g, w, h, t, scene) {
  const k = Math.min(w, h) / 720 // 720px を基準に、大きさをそろえる
  const draw = RENDERERS[scene.template] || renderSimple
  const f = fxState(scene, t)
  // サビ・拍では、音の波も大きめに
  const boost = 1 + f.chorus * 0.35 + f.pulse * 0.25
  const s2 = boost !== 1 && scene.features?.bands
    ? { ...scene, features: { ...scene.features, bands: scene.features.bands.map((v) => Math.min(1, v * boost)) } }
    : scene
  g.save()
  // 拍で少しはねる・サビで少し寄る（真ん中を中心に大きく）
  const zoom = 1 + f.pulse * 0.022 + f.chorus * 0.03
  if (zoom !== 1) {
    g.translate(w / 2, h / 2)
    g.scale(zoom, zoom)
    g.translate(-w / 2, -h / 2)
  }
  draw(g, w, h, t, s2, k)
  g.restore()
  g.save()
  drawGlow(g, w, h, scene, f)
  if (scene.fx?.sparkle) drawSparkles(g, w, h, t, scene, k, Math.max(f.chorus, (scene.fx.strength || 0) * 0.15))
  drawLyrics(g, w, h, t, scene, k)
  drawProgress(g, w, h, t, scene, k)
  drawIntro(g, w, h, t, scene, k)
  drawOutro(g, w, h, t, scene, k)
  g.restore()
}

// 再生中の音（AnalyserNode）から、絵を動かすための値を作る。前の値となめらかにつなぐ
export function readFeatures(analyser, prev, freqBuf, timeBuf) {
  analyser.getByteFrequencyData(freqBuf)
  analyser.getByteTimeDomainData(timeBuf)
  return featuresFromBytes(freqBuf, timeBuf, prev)
}

// 音の「周波数ごとの大きさ（0〜255）」と「波形（128が真ん中）」→ 絵を動かす値
// 再生中（AnalyserNode）と速い書き出し（先に計算した値）の両方で、同じ計算を使う → 見た目がそろう
export function featuresFromBytes(freqBuf, timeBuf, prev) {
  let s = 0
  for (let i = 0; i < timeBuf.length; i++) { const v = (timeBuf[i] - 128) / 128; s += v * v }
  const level = Math.min(1, Math.sqrt(s / timeBuf.length) * 3)
  // 低い音〜高い音を 64 本に（耳の感じ方に合わせて、低い所を細かく）
  const n = 64
  const bands = prev?.bands ? Float32Array.from(prev.bands) : new Float32Array(n)
  const maxBin = Math.floor(freqBuf.length * 0.7)
  for (let i = 0; i < n; i++) {
    const a = Math.floor(Math.pow(maxBin, i / n))
    const b = Math.max(a + 1, Math.floor(Math.pow(maxBin, (i + 1) / n)))
    let m = 0
    for (let j = a; j < b && j < freqBuf.length; j++) if (freqBuf[j] > m) m = freqBuf[j]
    const v = Math.pow(m / 255, 1.6)
    bands[i] = v > bands[i] ? v : bands[i] * 0.86 + v * 0.14 // 上がるのは速く、下がるのはゆっくり
  }
  const prevLevel = prev?.level || 0
  return { level: level > prevLevel ? level : prevLevel * 0.9 + level * 0.1, bands }
}
