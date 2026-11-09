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
  visualizer: { label: "🌀 ビジュアライザー", hint: "曲名のまわりを、音に合わせて輪がはねる" },
  particles: { label: "🎆 パーティクル", hint: "光のつぶが音に合わせてふわっと舞う。しっとりした曲に" },
  bars: { label: "📊 バー", hint: "画面の下いっぱいに音のバー。ノリのいい曲に" }
})

// 🎞 アニメーションの選び方（K30）。どれも「曲の時間 t だけで決まる」（⚡速い書き出しでも同じ絵）
// 最初の値（fade / flash / slow）は、今までと同じ見た目
export const MV_ANIMS = Object.freeze({
  lyric: {
    fade: "ふわっと（今まで）", pop: "ポンと出る", rise: "下からスッと", type: "1文字ずつ"
  },
  transition: {
    flash: "フラッシュ（今まで）", zoom: "ズームでドン", invert: "色が反転", glitch: "グリッチ", none: "なし"
  },
  bg: {
    slow: "ゆっくり（今まで）", kenburns: "大きくズーム＆パン", sway: "ゆらゆら", still: "動かない"
  }
})

export const DEFAULT_MV_ANIM = Object.freeze({ lyric: "fade", transition: "flash", bg: "slow" })

const animOf = (scene) => ({ ...DEFAULT_MV_ANIM, ...(scene.anim || {}) })

// 🎆 おまかせ演出を「部分の名前どおり」に（K41・11/10）。[a, b] は部分の頭→終わりで a から b へ変わる
export const MV_PART_STYLES = Object.freeze({
  low: { label: "控えめ", pulse: 0.5, glow: 0, sparkle: 0, calm: 0, flash: false },
  mid: { label: "ふつう", pulse: 0.8, glow: 0.1, sparkle: 0.15, calm: 0, flash: false },
  build: { label: "だんだん盛り上げる", pulse: [0.5, 1], glow: [0, 0.5], sparkle: [0, 0.4], calm: 0, flash: false },
  high: { label: "明るく・キラキラ", pulse: 1, glow: 1, sparkle: 1, calm: 0, flash: true },
  calm: { label: "静かに", pulse: 0.2, glow: 0, sparkle: 0, calm: 1, flash: false },
  bgonly: { label: "背景の動きだけ", pulse: 0, glow: 0, sparkle: 0, calm: 0, flash: false },
  none: { label: "演出なし", pulse: 0, glow: 0, sparkle: 0, calm: 0, flash: false }
})

// 部分の名前 → 最初の演出（表で変えられる）
export const DEFAULT_PART_STYLES = Object.freeze({
  "イントロ": "low",
  "Aメロ": "low",
  "Bメロ": "build",
  "サビ": "high",
  "Cメロ": "mid",
  "間奏": "bgonly",
  "落ちサビ": "calm",
  "ラスサビ": "high",
  "アウトロ": "low"
})

// ---------- 🎬 もっと編集（K40・11/10） ----------
// 背景の切りかえ・スライドショー／自由なテロップ／色のフィルター／書き出す範囲／フェード／ロゴ・透かし。
// どれも最初は「なし」（今までと同じ見た目）。どれも「曲の時間 t だけで決まる」（⚡速い書き出しでも同じ絵）
// scene に入れるもの（なければ何もしない）：
//   bgTimeline: [{ startSec, image, gradient }]（時間順。1つ目＝いつもの背景）, bgFade: 切りかえにかける秒
//   filter: MV_FILTERS のキー, filterAmount: 0〜100, filterSpans: [{ startSec, endSec, kind }]（部分ごと）
//   telops: [{ text, startSec, endSec, pos, size, color }]
//   logo: { enabled, kind: "text" | "image", text, image, corner, size, opacity }
//   fadeIn, fadeOut: 秒, clip: { startSec, endSec }（書き出す範囲。曲名・クレジット・フェードはこの中で数える）

export const MV_FILTERS = Object.freeze({
  none: { label: "なし", hint: "色はそのまま" },
  mono: { label: "⚫ モノクロ", hint: "白黒にします" },
  sepia: { label: "🟤 セピア", hint: "古い写真のような茶色に" },
  vintage: { label: "📷 ビンテージ", hint: "少し色あせて、まわりが暗くなります" },
  warm: { label: "🌅 あたたかく", hint: "夕焼けのようなオレンジ寄りに" },
  cool: { label: "🌊 クールに", hint: "青っぽく、すっきりした色に" },
  neon: { label: "💜 ネオン", hint: "色をこく、あざやかに" },
  blur: { label: "🌫 ぼかし", hint: "絵をぼかします（歌詞・テロップ・ロゴはぼけません）" },
  dream: { label: "✨ ゆめかわ", hint: "ふんわりぼかして、明るく" }
})

export const MV_TELOP_POSITIONS = Object.freeze({
  top: "上", center: "真ん中", bottom: "下", topLeft: "左上", topRight: "右上", bottomLeft: "左下", bottomRight: "右下"
})
export const MV_TELOP_SIZES = Object.freeze({ s: { label: "小", px: 28 }, m: { label: "中", px: 44 }, l: { label: "大", px: 66 } })
export const MV_LOGO_CORNERS = Object.freeze({ tl: "左上", tr: "右上", bl: "左下", br: "右下" })
export const MV_LOGO_SIZES = Object.freeze({ s: { label: "小", k: 0.07 }, m: { label: "中", k: 0.1 }, l: { label: "大", k: 0.15 } })
export const MV_BG_MODES = Object.freeze({ off: "切りかえない", cycle: "スライドショー（一定の間隔で）", points: "場所ごとに切りかえ（部分・📍ピン・時間）" })

export const DEFAULT_MV_EDIT = Object.freeze({
  bgMode: "off", bgInterval: 8, bgFade: 1, slides: [],
  telops: [],
  filter: "none", filterAmount: 70, filterParts: {},
  range: null,
  fadeIn: 0, fadeOut: 0, fadeAudio: true,
  logo: { enabled: false, kind: "text", text: "", corner: "br", size: "m", opacity: 0.8 }
})

const num = (v, d, lo, hi) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d
}

// 保存していた値・古いプロジェクト（edit が無い）でも、足りない所を初期値で埋める
export function normalizeMvEdit(e) {
  const d = DEFAULT_MV_EDIT
  const src = e && typeof e === "object" ? e : {}
  const lg = src.logo && typeof src.logo === "object" ? src.logo : {}
  const range = src.range && Number.isFinite(Number(src.range.startSec)) && Number.isFinite(Number(src.range.endSec)) && Number(src.range.endSec) > Number(src.range.startSec)
    ? { startSec: Number(src.range.startSec), endSec: Number(src.range.endSec), enabled: src.range.enabled !== false }
    : null
  return {
    bgMode: MV_BG_MODES[src.bgMode] ? src.bgMode : d.bgMode,
    bgInterval: num(src.bgInterval, d.bgInterval, 2, 60),
    bgFade: num(src.bgFade, d.bgFade, 0, 4),
    slides: Array.isArray(src.slides) ? src.slides.filter((s) => s && s.id).map((s) => ({ ...s, anchor: s.anchor && typeof s.anchor === "object" ? { ...s.anchor } : { type: "time", sec: 0 } })) : [],
    telops: Array.isArray(src.telops) ? src.telops.filter((t) => t && t.id).map((t) => ({
      id: String(t.id), text: String(t.text || ""), startSec: num(t.startSec, 0, 0, 36000), endSec: num(t.endSec, 4, 0, 36000),
      pos: MV_TELOP_POSITIONS[t.pos] ? t.pos : "bottom", size: MV_TELOP_SIZES[t.size] ? t.size : "m",
      color: /^#[0-9a-fA-F]{6}$/.test(String(t.color || "")) ? t.color : "#ffffff"
    })) : [],
    filter: MV_FILTERS[src.filter] ? src.filter : d.filter,
    filterAmount: num(src.filterAmount, d.filterAmount, 0, 100),
    filterParts: src.filterParts && typeof src.filterParts === "object" ? Object.fromEntries(Object.entries(src.filterParts).filter(([, v]) => MV_FILTERS[v])) : {},
    range,
    fadeIn: num(src.fadeIn, d.fadeIn, 0, 10),
    fadeOut: num(src.fadeOut, d.fadeOut, 0, 10),
    fadeAudio: src.fadeAudio !== false,
    logo: {
      enabled: !!lg.enabled, kind: lg.kind === "image" ? "image" : "text", text: String(lg.text || "").slice(0, 40),
      corner: MV_LOGO_CORNERS[lg.corner] ? lg.corner : d.logo.corner, size: MV_LOGO_SIZES[lg.size] ? lg.size : d.logo.size,
      opacity: num(lg.opacity, d.logo.opacity, 0.1, 1), hasImage: !!lg.hasImage
    }
  }
}

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

// 背景を1枚描く（画像があれば画像、なければグラデーション）。fill＝先に黒で塗る（重ねて描くときは塗らない）
function drawBgOne(g, w, h, image, gradient, zoom = 1, panX = 0, panY = 0, rot = 0, fill = true) {
  if (image) {
    if (fill) {
      g.fillStyle = "#000"
      g.fillRect(0, 0, w, h)
    }
    if (rot) {
      // 回すと角がすき間になるので、少し大きく描く
      g.save()
      g.translate(w / 2, h / 2)
      g.rotate(rot)
      g.translate(-w / 2, -h / 2)
      drawCover(g, image, 0, 0, w, h, zoom * 1.06, panX, panY)
      g.restore()
    } else {
      drawCover(g, image, 0, 0, w, h, zoom, panX, panY)
    }
  } else {
    const gr = g.createLinearGradient(0, 0, w * 0.3, h)
    const stops = (gradient || MV_GRADIENTS[0]).stops
    gr.addColorStop(0, stops[0])
    gr.addColorStop(1, stops[1])
    g.fillStyle = gr
    g.fillRect(0, 0, w, h)
  }
}

// 背景。🎬 背景の切りかえ（K40）の途中は、前の背景から今の背景へなめらかに入れかえる
function drawBackground(g, w, h, scene, zoom = 1, panX = 0, panY = 0, rot = 0) {
  const prev = scene.bgPrev
  if (prev && scene.bgMix < 1) {
    drawBgOne(g, w, h, prev.image, prev.gradient || scene.gradient, zoom, panX, panY, rot)
    g.save()
    g.globalAlpha = clamp01(scene.bgMix)
    drawBgOne(g, w, h, scene.image, scene.gradient, zoom, panX, panY, rot, false)
    g.restore()
    return
  }
  drawBgOne(g, w, h, scene.image, scene.gradient, zoom, panX, panY, rot)
}

// 🎞 背景の動き（K30）。base は今までの動き（テンプレートごと）
function bgMotion(t, scene, base) {
  const kind = animOf(scene).bg
  if (kind === "still") return { zoom: 1, panX: 0, panY: 0, rot: 0 }
  if (kind === "kenburns") {
    // 24秒で1周：ゆっくり大きく寄って、斜めに流れる
    const p = (t % 24) / 24
    const e = 0.5 - 0.5 * Math.cos(p * Math.PI * 2)
    return { zoom: 1.04 + 0.14 * e, panX: Math.sin(t * 0.09) * 0.8, panY: Math.cos(t * 0.07) * 0.6, rot: 0 }
  }
  if (kind === "sway") {
    return { zoom: 1.06, panX: Math.sin(t * 0.35) * 0.4, panY: Math.sin(t * 0.27 + 1) * 0.3, rot: Math.sin(t * 0.5) * 0.02 }
  }
  return { zoom: base.zoom, panX: base.panX, panY: 0, rot: 0 }
}

// ぼかした背景（Safari でも動くように「小さく描いてから引き伸ばす」）
let blurCanvas = null
function drawBlurredOne(g, w, h, image, gradient, alpha = 1) {
  g.save()
  g.globalAlpha *= alpha
  if (!image) { drawBgOne(g, w, h, null, gradient); g.restore(); return }
  if (!blurCanvas) blurCanvas = document.createElement("canvas")
  const bw = 48
  const bh = Math.max(1, Math.round((48 * h) / w))
  if (blurCanvas.width !== bw || blurCanvas.height !== bh) { blurCanvas.width = bw; blurCanvas.height = bh }
  const b = blurCanvas.getContext("2d")
  b.clearRect(0, 0, bw, bh)
  drawCover(b, image, 0, 0, bw, bh, 1.1)
  g.imageSmoothingEnabled = true
  g.imageSmoothingQuality = "high"
  g.drawImage(blurCanvas, 0, 0, w, h)
  g.restore()
}

function drawBlurredBackground(g, w, h, scene) {
  const prev = scene.bgPrev
  if (prev && scene.bgMix < 1) {
    drawBlurredOne(g, w, h, prev.image, prev.gradient || scene.gradient, 1)
    drawBlurredOne(g, w, h, scene.image, scene.gradient, clamp01(scene.bgMix))
    return
  }
  drawBlurredOne(g, w, h, scene.image, scene.gradient, 1)
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
    scene.credit && ["オケ", scene.credit]
    // 背景の出典はクレジットに入れない（11/10 決定・K28）
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

// ✂️ 書き出す範囲（K40）があるときは、曲名・クレジットなどはその範囲の頭から数える
const clipStart = (scene) => (scene.clip ? scene.clip.startSec : 0)

// 曲の途中に出す小さい曲名（左上）
function drawCorner(g, w, h, t, scene, k, x = 40 * k, y = 64 * k) {
  const a = scene.showIntro ? clamp01((t - clipStart(scene) - 3.6) / 0.8) : 1
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

// 部分の名前どおりの演出（K41）：sections に style（MV_PART_STYLES のキー）があるときに使う。
// 部分の頭→終わりで値が変わるもの（だんだん盛り上げる）は、その部分の中での位置で決まる。境目は 0.6 秒でなめらかにつなぐ
// 部分の外（名前の付いた部分が無い時間）は、今までのサビ以外と同じ（拍の動きはそのまま・キラキラは少しだけ）
const PART_OUTSIDE = { pulse: 1, glow: 0, sparkle: 0.15, calm: 0, flash: false }
function partValues(sec, t) {
  const p = (sec && MV_PART_STYLES[sec.style]) || PART_OUTSIDE
  const u = sec ? clamp01((t - sec.startSec) / Math.max(0.01, sec.endSec - sec.startSec)) : 0
  const v = (x) => (Array.isArray(x) ? x[0] + (x[1] - x[0]) * u : x)
  return { pulse: v(p.pulse), glow: v(p.glow), sparkle: v(p.sparkle), calm: v(p.calm) }
}
function mixValues(a, b, m) {
  const o = {}
  for (const k of Object.keys(a)) o[k] = a[k] + (b[k] - a[k]) * m
  return o
}
function namedPartState(sections, t) {
  const list = sections.filter((s) => s.style && MV_PART_STYLES[s.style]).sort((p, q) => p.startSec - q.startSec)
  const i = list.findIndex((s) => t >= s.startSec && t < s.endSec)
  const cur = i >= 0 ? list[i] : null
  let vals = partValues(cur, t)
  const EDGE = 0.6
  if (cur) {
    const prev = list[i - 1]
    const next = list[i + 1]
    const din = t - cur.startSec
    const dout = cur.endSec - t
    if (din < EDGE) {
      // となりの部分とくっついていれば、境目で半分ずつ（向こう側も同じ式なので、つながる）。くっついていなければ部分の外の値から
      const joined = prev && cur.startSec - prev.endSec < 0.1
      const before = joined ? partValues(prev, prev.endSec) : PART_OUTSIDE
      vals = mixValues({ pulse: before.pulse, glow: before.glow, sparkle: before.sparkle, calm: before.calm }, vals, joined ? smooth(din / EDGE) * 0.5 + 0.5 : smooth(din / EDGE))
    }
    if (dout < EDGE) {
      const joined = next && next.startSec - cur.endSec < 0.1
      const after = joined ? partValues(next, next.startSec) : PART_OUTSIDE
      vals = mixValues({ pulse: after.pulse, glow: after.glow, sparkle: after.sparkle, calm: after.calm }, vals, joined ? smooth(dout / EDGE) * 0.5 + 0.5 : smooth(dout / EDGE))
    }
  }
  const flashOn = cur && MV_PART_STYLES[cur.style].flash
  const flash = flashOn ? Math.exp(-(t - cur.startSec) / 0.3) : 0
  return { ...vals, flash }
}

export function fxState(scene, t) {
  const fx = scene.fx
  const none = { pulse: 0, chorus: 0, calm: 0, flash: 0, energy: 0, accentBeat: false }
  if (!fx || !(fx.strength > 0)) return none
  const st = fx.strength
  const e0 = fx.energy && fx.energy.length ? fx.energy[Math.min(fx.energy.length - 1, Math.max(0, Math.floor(t / fx.energyHop)))] : 0.5
  if (fx.chorus && (fx.sections || []).some((s) => s.style)) {
    // 名前どおりの演出
    const p = namedPartState(fx.sections, t)
    let pulse = 0
    let accentBeat = false
    if (fx.beat && p.pulse > 0) {
      const b = sinceBeat(fx.beats, t)
      if (b !== Infinity) {
        accentBeat = b.index % 4 === 0
        pulse = Math.exp(-b.dt / 0.12) * (accentBeat ? 1 : 0.6) * (0.35 + 0.65 * Math.max(e0, p.glow)) * p.pulse * (1 - p.calm * 0.8)
      }
    }
    return { pulse: pulse * st, chorus: p.glow * st, calm: p.calm * st, flash: p.flash * st, sparkle: p.sparkle * st, energy: e0, accentBeat }
  }
  const chorusInfo = fx.chorus ? sectionAmount(fx.sections, t, "chorus") : { amount: 0, startedAt: null }
  const calm = fx.chorus ? sectionAmount(fx.sections, t, "calm").amount : 0
  const e = e0
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
  const style = animOf(scene).lyric
  if (i >= 0) {
    const line = lyrics[i]
    const fadeIn = clamp01((t - line.startSec) / 0.2)
    const fadeOut = clamp01((line.endSec - t) / 0.25)
    const progress = scene.karaoke ? clamp01((t - line.startSec) / Math.max(0.3, (line.endSec - line.startSec) * 0.85)) : null
    const since = t - line.startSec
    let text = line.text
    let y = a.y
    let scale = 1
    let alpha = Math.min(fadeIn, fadeOut)
    if (style === "pop") {
      // ポンと出る：少し大きく出て、すぐ元の大きさに（はね返り）
      const p = clamp01(since / 0.3)
      scale = 0.7 + 0.3 * smooth(p) + 0.18 * Math.sin(p * Math.PI) // 0.7 → 少し大きく → 1
      alpha = Math.min(clamp01(since / 0.08), fadeOut)
    } else if (style === "rise") {
      // 下からスッと：少し下から上がってくる
      y = a.y + (1 - smooth(clamp01(since / 0.35))) * a.size * 0.7
      alpha = Math.min(clamp01(since / 0.3), fadeOut)
    } else if (style === "type") {
      // 1文字ずつ：行の前半（最大1.2秒）で全部出す
      const chars = Array.from(text)
      const dur = Math.min(1.2, Math.max(0.2, (line.endSec - line.startSec) * 0.45))
      text = chars.slice(0, Math.max(1, Math.ceil(chars.length * clamp01(since / dur)))).join("")
      alpha = fadeOut
    }
    g.save()
    if (scale !== 1) {
      g.translate(a.x, y)
      g.scale(scale, scale)
      g.translate(-a.x, -y)
    }
    drawLyricLine(g, text, a.x, y, a.maxW, a.size, scene, { progress: style === "type" ? null : progress, alpha, align: style === "type" && a.align === "center" ? "center" : a.align })
    g.restore()
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
  const m = bgMotion(t, scene, { zoom: 1.04 + 0.02 * Math.sin(t * 0.15), panX: Math.sin(t * 0.05) * 0.5 })
  drawBackground(g, w, h, scene, m.zoom, m.panX, m.panY, m.rot)
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
  const jacket = (img, gradient) => {
    if (img) drawCover(g, img, cx - size / 2, cy - size / 2, size, size, 1.08 + 0.06 * Math.sin(t * 0.1), Math.sin(t * 0.07))
    else drawBgOne(g, w, h, null, gradient || scene.gradient)
  }
  // 🎬 背景の切りかえ（K40）の途中は、ジャケットもなめらかに入れかえる
  if (scene.bgPrev && scene.bgMix < 1) {
    jacket(scene.bgPrev.image, scene.bgPrev.gradient)
    g.globalAlpha = clamp01(scene.bgMix)
  }
  jacket(scene.image, scene.gradient)
  g.restore()
  // 曲名・名前
  const tx = portrait ? w / 2 : cx + size / 2 + 48 * k
  const ty = portrait ? cy + size / 2 + (layout === "square" ? 60 : 80) * k : cy - 10 * k
  const align = portrait ? "center" : "left"
  const maxW = portrait ? w * 0.85 : w - tx - 40 * k
  const a = scene.showIntro ? clamp01((t - clipStart(scene) - 0.3) / 1.2) : 1
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
  const m = bgMotion(t, scene, { zoom: 1.06, panX: 0 })
  drawBackground(g, w, h, scene, m.zoom, m.panX, m.panY, m.rot)
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
  const a = scene.showIntro ? clamp01((t - clipStart(scene) - 3.6) / 0.8) : 1
  fitText(g, scene.title || "歌ってみた", cx, cy + 8 * k, r * 1.6, 40 * k, { align: "center", alpha: a })
  if (scene.artist) fitText(g, scene.artist, cx, cy + 44 * k, r * 1.5, 22 * k, { weight: 500, align: "center", alpha: a, color: scene.colors.accent2 })
}

// 🎆 パーティクル（K30）：光のつぶが下から舞い上がり、音が大きいほど大きく・明るく
function renderParticles(g, w, h, t, scene, k) {
  const level = scene.features?.level || 0
  const m = bgMotion(t, scene, { zoom: 1.08 + 0.03 * Math.sin(t * 0.11), panX: Math.sin(t * 0.04) * 0.4 })
  drawBackground(g, w, h, scene, m.zoom, m.panX, m.panY, m.rot)
  dim(g, w, h, Math.max(0.3, scene.dim))
  const bands = bandsOf(scene, 16)
  const n = 70 // スマホでも重くならない数
  g.save()
  g.globalCompositeOperation = "lighter"
  for (let i = 0; i < n; i++) {
    const speed = 18 + hash(i + 21) * 50
    const span = h + 80 * k
    const y = h + 40 * k - ((t * speed * k + hash(i + 2) * span) % span)
    const x = hash(i + 9) * w + Math.sin(t * (0.3 + hash(i + 4) * 0.6) + i) * 40 * k
    const v = bands[i % bands.length]
    const r = (2 + hash(i + 6) * 5 + v * 9) * k * (0.8 + level * 0.6)
    const gr = g.createRadialGradient(x, y, 0, x, y, r * 3)
    gr.addColorStop(0, i % 4 === 0 ? scene.colors.accent2 : scene.colors.accent)
    gr.addColorStop(1, "rgba(0,0,0,0)")
    g.globalAlpha = 0.18 + 0.5 * v
    g.fillStyle = gr
    g.fillRect(x - r * 3, y - r * 3, r * 6, r * 6)
  }
  g.restore()
  // 下に細い音の線
  const tall = layoutOf(w, h) === "tall"
  const base = tall ? h * 0.8 : h - 60 * k
  const line = bandsOf(scene, 64)
  g.save()
  g.strokeStyle = scene.colors.accent
  g.lineWidth = 3 * k
  g.shadowColor = scene.colors.accent
  g.shadowBlur = 12 * k
  g.beginPath()
  for (let i = 0; i < 64; i++) {
    const x = w * 0.1 + (w * 0.8 * i) / 63
    const y = base - line[i] * 60 * k * (i % 2 ? 1 : -1)
    if (i === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
  }
  g.stroke()
  g.restore()
  if (tall) drawCorner(g, w, h, t, scene, k, 40 * k, h * 0.12)
  else drawCorner(g, w, h, t, scene, k)
}

// 📊 バー（K30）：画面の下いっぱいに音のバー＋うすい映り込み
function renderBars(g, w, h, t, scene, k) {
  const m = bgMotion(t, scene, { zoom: 1.04, panX: Math.sin(t * 0.05) * 0.3 })
  drawBackground(g, w, h, scene, m.zoom, m.panX, m.panY, m.rot)
  dim(g, w, h, Math.max(0.25, scene.dim))
  const tall = layoutOf(w, h) === "tall"
  const base = tall ? h * 0.78 : h * 0.86
  const n = 40
  const bands = bandsOf(scene, n)
  const gap = 4 * k
  const bw = (w - gap * (n + 1)) / n
  const maxH = (tall ? h * 0.22 : h * 0.4) * (scene.lyrics?.length ? 0.7 : 1)
  const grad = g.createLinearGradient(0, base - maxH, 0, base)
  grad.addColorStop(0, scene.colors.accent2)
  grad.addColorStop(1, scene.colors.accent)
  for (let i = 0; i < n; i++) {
    const bh = Math.max(4 * k, bands[i] * maxH)
    const x = gap + i * (bw + gap)
    g.fillStyle = grad
    g.fillRect(x, base - bh, bw, bh)
    g.globalAlpha = 0.18
    g.fillRect(x, base + 3 * k, bw, bh * 0.35) // 映り込み
    g.globalAlpha = 1
  }
  if (tall) drawCorner(g, w, h, t, scene, k, 40 * k, h * 0.12)
  else drawCorner(g, w, h, t, scene, k)
}

const RENDERERS = { simple: renderSimple, jacket: renderJacket, visualizer: renderVisualizer, particles: renderParticles, bars: renderBars }

// 🎞 場面転換（K30）：サビ（と落ちサビ）が始まる時間から、どれくらいたったか
function cutAt(scene, t) {
  const cuts = scene.animCuts || (scene.fx?.sections || []).map((s) => s.startSec)
  let best = null
  for (const c of cuts) {
    const at = typeof c === "number" ? c : c.at
    if (t >= at && t - at < 0.6 && (best === null || at > best)) best = at
  }
  return best === null ? null : t - best
}

// グリッチ：横長の帯を少しずつ横にずらす（同じ t なら同じずれ方）
function drawGlitch(g, w, h, dt, k) {
  const life = 0.35
  if (dt > life) return
  const amount = 1 - dt / life
  const seed = Math.floor(dt * 30)
  const bands = 7
  const src = g.canvas
  if (!src || !src.width) return
  const sx = src.width / w // 描いている大きさとキャンバスの大きさがちがうとき
  const sy = src.height / h
  for (let j = 0; j < bands; j++) {
    if (hash(seed * 13 + j) < 0.45) continue
    const y = hash(seed * 7 + j * 3) * h
    const bh = (8 + hash(seed + j * 5) * 40) * k
    const off = (hash(seed * 3 + j) - 0.5) * 80 * k * amount
    try {
      g.drawImage(src, 0, y * sy, src.width, bh * sy, off, y, w, bh)
    } catch (e) {
      return
    }
  }
  g.save()
  g.globalAlpha = 0.12 * amount
  g.globalCompositeOperation = "lighter"
  g.fillStyle = "#ff3cac"
  g.fillRect(0, hash(seed + 99) * h, w, 6 * k)
  g.restore()
}

// ---------- 🎬 もっと編集（K40）：描く部品 ----------

// 🖼 背景の切りかえ・スライドショー：曲の t 秒目の背景と、切りかえ中なら前の背景
export function bgLayerAt(scene, t) {
  const list = scene.bgTimeline
  if (!Array.isArray(list) || list.length < 2) return null
  let i = 0
  for (let j = 0; j < list.length; j++) {
    if (list[j].startSec <= t) i = j
    else break
  }
  const cur = list[i]
  const fade = Math.max(0.01, Number.isFinite(Number(scene.bgFade)) ? Number(scene.bgFade) : 1)
  const mix = i > 0 ? clamp01((t - cur.startSec) / fade) : 1
  return { cur, prev: i > 0 && mix < 1 ? list[i - 1] : null, mix: smooth(mix) }
}

// 🎨 色のフィルター：曲の t 秒目にかけるフィルター（部分の境目は 0.4 秒かけて入れかえる）
export function filtersAt(scene, t) {
  const amount = clamp01((Number(scene.filterAmount) || 0) / 100)
  if (amount <= 0) return []
  const base = MV_FILTERS[scene.filter] ? scene.filter : "none"
  let part = null
  let wPart = 0
  ;(scene.filterSpans || []).forEach((s) => {
    const wv = clamp01((t - s.startSec + 0.2) / 0.4) * clamp01((s.endSec - t + 0.2) / 0.4)
    if (wv > wPart) { wPart = wv; part = s.kind }
  })
  if (!part || part === base) return base === "none" ? [] : [{ kind: base, amount }]
  const out = []
  if (base !== "none" && wPart < 1) out.push({ kind: base, amount: amount * (1 - wPart) })
  if (part !== "none" && MV_FILTERS[part]) out.push({ kind: part, amount: amount * wPart })
  return out.filter((f) => f.amount > 0.01)
}

// 作業用の小さいキャンバス（ぼかし用）
let fxCanvas = null
function tempCanvas(w, h) {
  if (!fxCanvas) {
    if (typeof document !== "undefined") fxCanvas = document.createElement("canvas")
    else if (typeof OffscreenCanvas !== "undefined") fxCanvas = new OffscreenCanvas(w, h)
    else return null
  }
  if (fxCanvas.width !== w || fxCanvas.height !== h) { fxCanvas.width = w; fxCanvas.height = h }
  return fxCanvas
}

// 今描いた絵を小さくして引き伸ばす＝ぼかし（Safari でも動く方法）
function blurPass(g, w, h, alpha, scale) {
  const src = g.canvas
  if (!src || !src.width || alpha <= 0) return
  const bw = Math.max(8, Math.round(src.width / scale))
  const bh = Math.max(8, Math.round(src.height / scale))
  const c = tempCanvas(bw, bh)
  if (!c) return
  const b = c.getContext("2d")
  b.imageSmoothingEnabled = true
  b.clearRect(0, 0, bw, bh)
  try { b.drawImage(src, 0, 0, bw, bh) } catch (e) { return }
  g.save()
  g.globalAlpha = clamp01(alpha)
  g.imageSmoothingEnabled = true
  g.imageSmoothingQuality = "high"
  g.drawImage(c, 0, 0, w, h)
  g.restore()
}

// 色を重ねる（合成のしかたを選んで、画面いっぱいに塗る）
function tint(g, w, h, op, color, alpha) {
  if (alpha <= 0) return
  g.save()
  g.globalCompositeOperation = op
  g.globalAlpha = clamp01(alpha)
  g.fillStyle = color
  g.fillRect(0, 0, w, h)
  g.restore()
}

function vignette(g, w, h, alpha) {
  if (alpha <= 0) return
  const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75)
  gr.addColorStop(0, "rgba(0,0,0,0)")
  gr.addColorStop(1, "rgba(0,0,0,0.75)")
  g.save()
  g.globalAlpha = clamp01(alpha)
  g.fillStyle = gr
  g.fillRect(0, 0, w, h)
  g.restore()
}

// 🎨 フィルターをかける（amount 0〜1）。合成のしかたは Chrome・Safari の両方で使えるものだけ
export function applyMvFilter(g, w, h, kind, amount) {
  const a = clamp01(amount)
  if (a <= 0.01) return
  switch (kind) {
    case "mono":
      tint(g, w, h, "saturation", "#808080", a)
      break
    case "sepia":
      tint(g, w, h, "saturation", "#808080", a)
      tint(g, w, h, "color", "#a97c50", a * 0.8)
      break
    case "vintage":
      tint(g, w, h, "saturation", "#808080", a * 0.55)
      tint(g, w, h, "color", "#c49a6c", a * 0.35)
      tint(g, w, h, "multiply", "#ffe7c2", a * 0.6)
      vignette(g, w, h, a * 0.8)
      break
    case "warm":
      tint(g, w, h, "soft-light", "#ff8a2a", a * 0.6)
      break
    case "cool":
      tint(g, w, h, "soft-light", "#2a7bff", a * 0.6)
      break
    case "neon":
      tint(g, w, h, "saturation", "hsl(300, 100%, 50%)", a * 0.7)
      tint(g, w, h, "overlay", "#ff3cac", a * 0.14)
      break
    case "blur":
      blurPass(g, w, h, a, 14)
      break
    case "dream":
      blurPass(g, w, h, a * 0.6, 9)
      tint(g, w, h, "screen", "#ffd6f0", a * 0.2)
      break
    default:
      break
  }
}

// 💬 テロップの置き場所。縦長は、アプリのボタンや説明が重なる所（上8%・右15%・下20%）をよける
function telopPos(pos, w, h, k, tall, size) {
  const left = 40 * k
  const right = tall ? w * 0.85 - 16 * k : w - 40 * k
  const midX = (left + right) / 2
  const top = tall ? h * 0.08 + size + 16 * k : 40 * k + size
  const bottom = tall ? h * 0.78 : h - 64 * k
  const full = right - left
  switch (pos) {
    case "top": return { x: midX, y: top, align: "center", maxW: full }
    case "center": return { x: midX, y: h / 2 + size * 0.35, align: "center", maxW: full }
    case "topLeft": return { x: left, y: top, align: "left", maxW: full * 0.7 }
    case "topRight": return { x: right, y: top, align: "right", maxW: full * 0.7 }
    case "bottomLeft": return { x: left, y: bottom, align: "left", maxW: full * 0.7 }
    case "bottomRight": return { x: right, y: bottom, align: "right", maxW: full * 0.7 }
    default: return { x: midX, y: bottom, align: "center", maxW: full }
  }
}

export function drawTelops(g, w, h, t, scene, k) {
  const list = scene.telops
  if (!Array.isArray(list) || !list.length) return
  const tall = layoutOf(w, h) === "tall"
  list.forEach((tp) => {
    if (!tp || !tp.text || !(t >= tp.startSec && t < tp.endSec)) return
    const a = clamp01((t - tp.startSec) / 0.3) * clamp01((tp.endSec - t) / 0.3)
    if (a <= 0) return
    const size = (MV_TELOP_SIZES[tp.size] || MV_TELOP_SIZES.m).px * k
    const p = telopPos(tp.pos, w, h, k, tall, size)
    const rise = (1 - smooth(a)) * 10 * k
    fitText(g, tp.text, p.x, p.y + rise, p.maxW, size, { align: p.align, alpha: a, color: tp.color || "#ffffff" })
  })
}

// 🏷 ロゴ・透かし（画面の隅にずっと出す）
export function drawLogo(g, w, h, scene, k) {
  const lg = scene.logo
  if (!lg || !lg.enabled) return
  const tall = layoutOf(w, h) === "tall"
  const m = 24 * k
  const left = m
  const right = tall ? w * 0.85 - m : w - m
  const top = tall ? h * 0.08 + m : m
  const bottom = tall ? h * 0.8 - m : h - m - (scene.showProgress ? 10 * k : 0)
  const isLeft = String(lg.corner || "br")[1] === "l"
  const isTop = String(lg.corner || "br")[0] === "t"
  const sz = (MV_LOGO_SIZES[lg.size] || MV_LOGO_SIZES.m).k * Math.min(w, h)
  g.save()
  g.globalAlpha = clamp01(Number.isFinite(Number(lg.opacity)) ? Number(lg.opacity) : 0.8)
  if (lg.kind === "image" && lg.image) {
    const iw0 = lg.image.naturalWidth || lg.image.width
    const ih0 = lg.image.naturalHeight || lg.image.height
    if (iw0 && ih0) {
      let ih = sz
      let iw = (ih * iw0) / ih0
      if (iw > w * 0.35) { iw = w * 0.35; ih = (iw * ih0) / iw0 }
      g.drawImage(lg.image, isLeft ? left : right - iw, isTop ? top : bottom - ih, iw, ih)
    }
  } else if (lg.text) {
    const size = sz * 0.42
    fitText(g, lg.text, isLeft ? left : right, isTop ? top + size : bottom - size * 0.2, w * 0.4, size, { align: isLeft ? "left" : "right" })
  }
  g.restore()
}

// 🌅 フェードイン・フェードアウト（黒から出てくる／黒に消えていく）。tl＝範囲の頭からの秒、dur＝範囲の長さ
export function fadeAlpha(scene, tl, dur) {
  const fi = Number(scene.fadeIn) || 0
  const fo = Number(scene.fadeOut) || 0
  let a = 0
  if (fi > 0) a = Math.max(a, 1 - smooth(clamp01(tl / fi)))
  if (fo > 0 && dur > 0) a = Math.max(a, smooth(clamp01((tl - (dur - fo)) / fo)))
  return a
}

export function renderFrame(g, w, h, t, scene) {
  const k = Math.min(w, h) / 720 // 720px を基準に、大きさをそろえる
  const draw = RENDERERS[scene.template] || renderSimple
  const anim = animOf(scene)
  const f = { ...fxState(scene, t) }
  if (anim.transition !== "flash") f.flash = 0 // フラッシュは「フラッシュ」のときだけ
  const dt = anim.transition === "flash" || anim.transition === "none" ? null : cutAt(scene, t)
  // 🖼 背景の切りかえ・スライドショー（K40）：この時間の背景に入れかえて描く
  const layer = bgLayerAt(scene, t)
  const base = layer
    ? { ...scene, image: layer.cur.image || null, gradient: layer.cur.gradient || scene.gradient, bgPrev: layer.prev, bgMix: layer.mix }
    : scene
  // サビ・拍では、音の波も大きめに
  const boost = 1 + f.chorus * 0.35 + f.pulse * 0.25
  const s2 = boost !== 1 && base.features?.bands
    ? { ...base, features: { ...base.features, bands: base.features.bands.map((v) => Math.min(1, v * boost)) } }
    : base
  g.save()
  // 拍で少しはねる・サビで少し寄る（真ん中を中心に大きく）
  let zoom = 1 + f.pulse * 0.022 + f.chorus * 0.03
  if (dt !== null && anim.transition === "zoom") zoom += 0.12 * Math.exp(-dt / 0.18) // ズームでドン
  if (zoom !== 1) {
    g.translate(w / 2, h / 2)
    g.scale(zoom, zoom)
    g.translate(-w / 2, -h / 2)
  }
  draw(g, w, h, t, s2, k)
  g.restore()
  if (dt !== null && anim.transition === "invert" && dt < 0.16) {
    // 色が反転：一瞬だけ色をひっくり返して、すぐ戻す
    g.save()
    g.globalCompositeOperation = "difference"
    g.globalAlpha = 1 - dt / 0.16
    g.fillStyle = "#ffffff"
    g.fillRect(0, 0, w, h)
    g.restore()
  }
  if (dt !== null && anim.transition === "glitch") drawGlitch(g, w, h, dt, k)
  // 🎨 色のフィルター（K40）：絵だけにかける（歌詞・テロップ・曲名・ロゴにはかけない）
  filtersAt(scene, t).forEach((fl) => applyMvFilter(g, w, h, fl.kind, fl.amount))
  g.save()
  drawGlow(g, w, h, scene, f)
  if (scene.fx?.sparkle) drawSparkles(g, w, h, t, scene, k, Number.isFinite(f.sparkle) ? f.sparkle : Math.max(f.chorus, (scene.fx.strength || 0) * 0.15))
  drawLyrics(g, w, h, t, scene, k)
  drawTelops(g, w, h, t, scene, k)
  // ✂️ 書き出す範囲（K40）があるときは、曲名・再生バー・クレジット・フェードをその範囲の中で数える
  const tl = t - clipStart(scene)
  const dur = scene.clip ? Math.max(0, scene.clip.endSec - scene.clip.startSec) : scene.duration
  const sc = scene.clip ? { ...scene, duration: dur } : scene
  drawProgress(g, w, h, tl, sc, k)
  drawIntro(g, w, h, tl, scene, k)
  drawOutro(g, w, h, tl, sc, k)
  drawLogo(g, w, h, scene, k)
  const fa = fadeAlpha(scene, tl, dur)
  if (fa > 0.001) {
    g.globalAlpha = fa
    g.fillStyle = "#000"
    g.fillRect(0, 0, w, h)
  }
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
