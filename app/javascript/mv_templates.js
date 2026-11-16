// 🪄 MV のテンプレート（かんたん作成）
// 「もうできあがっている見本の動画」を見て、「これと同じように作る」を押すだけ。画像は見本の画像のまま使うか、
// 1枚ずつ差し替える（手元の画像・KotoBouquet の素材・マイ画像）。
// 中身は今までの設定（見た目・アニメーション・フォント・おまかせ演出・背景の切りかえ・色・フェード）に
// 値を入れるだけなので、当てたあとも今までの画面でひとつずつ直せる。
//
// slots：画像の置き場所。1つ目＝いつもの背景。2つ目からは、parts の部分のあいだだけ切りかわる（終わるといつもの背景）
//   sample：見本の画像（public/backgrounds の SVG。縦・正方形用もある）
// pointFx：部分の名前の「始まり」「終わり」で起きる演出（同じ名前の部分は全部同じ演出）

import { DEFAULT_PART_STYLES, MV_PART_STYLES } from "mv_renderer"

// ポイントで起きる演出。どれも「曲の時間 t だけで決まる」（mv_renderer.js の renderFrame で描く）
export const MV_POINT_FX = Object.freeze({
  none: "なし",
  flash: "⚡ ピカッと光る",
  zoom: "🔍 ズームでドン",
  shake: "📳 ゆれる",
  invert: "🔄 色が反転",
  glitch: "📺 グリッチ",
  blackout: "⬛ 一瞬まっ暗",
  whiteout: "⬜ 白くふわっと"
})

// 見本の画像（public/backgrounds）。向きごとのファイルもある
export function sampleSrcs(name) {
  return {
    src: `/backgrounds/${name}.svg`,
    srcs: { "16:9": `/backgrounds/${name}.svg`, "9:16": `/backgrounds/${name}-9x16.svg`, "1:1": `/backgrounds/${name}-1x1.svg` }
  }
}

export const MV_QUICK_TEMPLATES = Object.freeze({
  ballad: {
    label: "🌙 しっとり",
    hint: "バラード向け。画面いっぱいの画像がゆっくり上から下へ。歌詞は横からスッと入って出ていく。サビで画像がぼかしからくっきり切りかわって白くふわっと、落ちサビは白黒で静かに",
    look: "plain", dim: 0.25, font: "maru",
    anim: { lyric: "slidein", transition: "none", bg: "pandown", enter: "blur" },
    fx: { strength: 40, beat: false, chorus: true, sparkle: true },
    filter: "none", filterAmount: 70, filterNames: { "落ちサビ": "mono" },
    pointFx: {
      "サビ": { start: "whiteout", end: "none" },
      "落ちサビ": { start: "blackout", end: "none" },
      "ラスサビ": { start: "flash", end: "none" }
    },
    slots: [
      { label: "いつもの背景", parts: [], sample: "starry-sky" },
      { label: "サビ", parts: ["サビ", "ラスサビ"], sample: "aurora" },
      { label: "落ちサビ・Cメロ", parts: ["落ちサビ", "Cメロ"], sample: "snow-night" }
    ],
    bgFade: 1.2, fadeIn: 1.5, fadeOut: 3
  },
  hype: {
    label: "🔥 ノリノリ",
    hint: "アップテンポ向け。下に音のバー、背景が拍でドンドン、歌詞はぴょんぴょん。サビで画像が右から入ってきて、ズームでドン",
    look: "bars", dim: 0.2, font: "rock",
    anim: { lyric: "bounce", transition: "none", bg: "beat", enter: "slideL" },
    fx: { strength: 85, beat: true, chorus: true, sparkle: true },
    filter: "none", filterAmount: 60, filterNames: { "サビ": "neon", "ラスサビ": "neon" },
    pointFx: {
      "サビ": { start: "zoom", end: "shake" },
      "間奏": { start: "glitch", end: "none" },
      "ラスサビ": { start: "zoom", end: "flash" }
    },
    slots: [
      { label: "いつもの背景", parts: [], sample: "neon-grid" },
      { label: "サビ", parts: ["サビ", "ラスサビ"], sample: "burst" },
      { label: "間奏・Bメロ", parts: ["間奏", "Bメロ"], sample: "pixel-grid" }
    ],
    bgFade: 0.3, fadeIn: 0.5, fadeOut: 2
  },
  chaos: {
    label: "💥 はげしめ",
    hint: "文字が大きさ・角度ばらばらでドンドン押される、はげしいボカロ系。背景は拍でぶるぶる、サビで画像が奥から飛び出してグリッチ",
    look: "plain", dim: 0.35, font: "heavy",
    anim: { lyric: "scatter", transition: "none", bg: "shake", enter: "zoomin" },
    fx: { strength: 80, beat: true, chorus: true, sparkle: false },
    filter: "none", filterAmount: 60, filterNames: { "サビ": "neon", "落ちサビ": "mono" },
    pointFx: {
      "サビ": { start: "glitch", end: "invert" },
      "落ちサビ": { start: "blackout", end: "none" },
      "ラスサビ": { start: "glitch", end: "shake" }
    },
    slots: [
      { label: "いつもの背景", parts: [], sample: "monitor-screen" },
      { label: "サビ", parts: ["サビ", "ラスサビ"], sample: "neon-grid" },
      { label: "落ちサビ・Cメロ", parts: ["落ちサビ", "Cメロ"], sample: "pixel-grid" }
    ],
    bgFade: 0.2, fadeIn: 0.5, fadeOut: 2
  },
  lyricvideo: {
    label: "⚡ リリック動画",
    hint: "歌詞のかたまりを1つずつ画面いっぱいにドン！と出す、文字が主役の動画。背景は拍でドンドン",
    look: "plain", dim: 0.45, font: "brush",
    anim: { lyric: "kinetic", transition: "none", bg: "beat", enter: "slideL" },
    fx: { strength: 70, beat: true, chorus: true, sparkle: false },
    filter: "none", filterAmount: 50, filterNames: { "落ちサビ": "mono" },
    pointFx: {
      "サビ": { start: "zoom", end: "flash" },
      "落ちサビ": { start: "invert", end: "none" },
      "ラスサビ": { start: "zoom", end: "none" }
    },
    slots: [
      { label: "いつもの背景", parts: [], sample: "burst" },
      { label: "サビ", parts: ["サビ", "ラスサビ"], sample: "aurora" },
      { label: "Bメロ", parts: ["Bメロ"], sample: "water-ripple" }
    ],
    bgFade: 0.25, fadeIn: 0.5, fadeOut: 2
  },
  emo: {
    label: "💜 エモ",
    hint: "曲名のまわりの輪が音ではねる。歌詞はまわりから1文字ずつ飛んでくる。画像はゆっくり横に流れて、サビで奥から飛び出す",
    look: "visualizer", dim: 0.35, font: "magic",
    anim: { lyric: "flyin", transition: "none", bg: "panright", enter: "zoomin" },
    fx: { strength: 70, beat: true, chorus: true, sparkle: false },
    filter: "cool", filterAmount: 45, filterNames: { "落ちサビ": "mono" },
    pointFx: {
      "サビ": { start: "glitch", end: "blackout" },
      "落ちサビ": { start: "invert", end: "none" },
      "ラスサビ": { start: "glitch", end: "none" }
    },
    slots: [
      { label: "いつもの背景", parts: [], sample: "snow-night" },
      { label: "サビ", parts: ["サビ", "ラスサビ"], sample: "starry-sky" },
      { label: "落ちサビ・Cメロ", parts: ["落ちサビ", "Cメロ"], sample: "water-ripple" }
    ],
    bgFade: 0.5, fadeIn: 1, fadeOut: 2.5
  },
  lofi: {
    label: "🎧 ローファイ",
    hint: "カフェっぽい色あせた画面。画像がゆっくり上から下へ流れて、手書きの歌詞が横からスッと入ってくる。ずっと見ていられる感じ",
    look: "simple", dim: 0.2, font: "hand",
    anim: { lyric: "slidein", transition: "none", bg: "pandown", enter: "fade" },
    fx: { strength: 30, beat: true, chorus: true, sparkle: false },
    filter: "vintage", filterAmount: 60, filterNames: {},
    pointFx: {
      "サビ": { start: "flash", end: "none" }
    },
    slots: [
      { label: "いつもの背景", parts: [], sample: "clouds" },
      { label: "サビ", parts: ["サビ", "ラスサビ"], sample: "summer-sky" },
      { label: "間奏・アウトロ", parts: ["間奏", "アウトロ"], sample: "autumn-leaves" }
    ],
    bgFade: 1.5, fadeIn: 2, fadeOut: 3
  },
  idol: {
    label: "✨ キラキラ",
    hint: "アイドル・ポップ向け。光のつぶが舞って、ポップな文字が上から1文字ずつ落ちてくる。サビで画像が上から落ちてきてピカッ",
    look: "particles", dim: 0.15, font: "pop",
    anim: { lyric: "dropin", transition: "none", bg: "bounce", enter: "drop" },
    fx: { strength: 80, beat: true, chorus: true, sparkle: true },
    filter: "none", filterAmount: 50, filterNames: { "サビ": "warm", "ラスサビ": "warm" },
    pointFx: {
      "サビ": { start: "flash", end: "zoom" },
      "落ちサビ": { start: "whiteout", end: "none" },
      "ラスサビ": { start: "flash", end: "none" }
    },
    slots: [
      { label: "いつもの背景", parts: [], sample: "pastel-dots" },
      { label: "サビ", parts: ["サビ", "ラスサビ"], sample: "sakura-fubuki" },
      { label: "Bメロ", parts: ["Bメロ"], sample: "bubbles" },
      { label: "間奏・アウトロ", parts: ["間奏", "アウトロ"], sample: "gingham" }
    ],
    bgFade: 0.6, fadeIn: 1, fadeOut: 2.5
  }
})

// ---------- 見本の動画（テンプレートを選ぶ所で、くり返し流す） ----------

const DEMO_PART = 3.6 // 1つの部分の長さ（秒）
const DEMO_LYRICS = [
  "ここに あなたの歌詞が出ます",
  "とどけ とどけ この歌声",
  "きらめく 夜をこえて",
  "ラララ 君と歌おう",
  "もういちど 光の中へ"
]

// 見本の部分：Aメロ（いつもの背景）→ 画像を切りかえる部分を順に。サビは必ず入れる
function demoParts(tpl) {
  const names = ["Aメロ"]
  tpl.slots.slice(1).forEach((s) => { if (s.parts[0] && !names.includes(s.parts[0])) names.push(s.parts[0]) })
  if (!names.includes("サビ")) names.splice(1, 0, "サビ")
  // サビを2番目に（見本の見せ場を早めに）
  const rest = names.filter((n) => n !== "Aメロ" && n !== "サビ")
  return ["Aメロ", "サビ", ...rest].map((name, i) => ({ name, startSec: i * DEMO_PART, endSec: (i + 1) * DEMO_PART }))
}

// 見本の1コマぶんの scene（renderFrame にそのまま渡せる）。looks[i]＝ slots[i] の { image, gradient }
// 戻り値の length 秒でくり返す。音の値（features）は t から作る（ほんとうの音はない）
export function demoScene(tpl, looks, { colors, title = "サンプル曲", artist = "あなたの名前" } = {}) {
  const parts = demoParts(tpl)
  const length = parts[parts.length - 1].endSec
  const lyrics = parts.map((p, i) => ({ text: DEMO_LYRICS[i % DEMO_LYRICS.length], startSec: p.startSec + 0.3, endSec: p.endSec - 0.2 }))
  const keyOf = (name) => name
  // 背景：いつもの → 部分のあいだだけ、その部分の画像
  const main = looks[0] || {}
  const bgTimeline = [{ startSec: 0, image: main.image || null, gradient: main.gradient || null }]
  parts.forEach((p) => {
    const i = tpl.slots.findIndex((s, k) => k > 0 && s.parts.includes(p.name))
    const look = i > 0 ? looks[i] || main : main
    bgTimeline.push({ startSec: p.startSec, image: look.image || null, gradient: look.gradient || null })
  })
  const cues = []
  parts.forEach((p) => {
    const r = tpl.pointFx[keyOf(p.name)]
    if (!r) return
    if (r.start && r.start !== "none") cues.push({ at: p.startSec, kind: r.start })
    if (r.end && r.end !== "none") cues.push({ at: p.endSec - 0.02, kind: r.end })
  })
  const beats = []
  for (let b = 0; b < length; b += 0.5) beats.push(b)
  const sections = parts.map((p) => {
    const style = DEFAULT_PART_STYLES[p.name]
    return {
      startSec: p.startSec, endSec: p.endSec, name: p.name, style: MV_PART_STYLES[style] ? style : "mid",
      kind: style === "high" ? "chorus" : style === "calm" ? "calm" : "part"
    }
  })
  const filterSpans = parts.filter((p) => tpl.filterNames[p.name]).map((p) => ({ startSec: p.startSec, endSec: p.endSec, kind: tpl.filterNames[p.name] }))
  return {
    length,
    parts,
    scene: {
      template: tpl.look,
      image: main.image || null,
      gradient: main.gradient || null,
      colors: colors || { accent: "#7cc8ff", accent2: "#ffffff" },
      dim: tpl.dim,
      title, artist, credit: "",
      duration: length,
      showIntro: false, showOutro: false, showProgress: true,
      lyrics, karaoke: true,
      anim: { ...tpl.anim },
      font: tpl.font,
      fx: { beats, energy: null, energyHop: 0.1, sections, strength: tpl.fx.strength / 100, beat: tpl.fx.beat, chorus: tpl.fx.chorus, sparkle: tpl.fx.sparkle },
      animCuts: parts.map((p) => p.startSec),
      cues,
      beatTimes: beats,
      bgTimeline, bgFade: Math.min(tpl.bgFade, 0.6),
      filter: tpl.filter, filterAmount: tpl.filterAmount, filterSpans,
      telops: [], logo: null, fadeIn: 0, fadeOut: 0, clip: null
    }
  }
}

// 見本の音の値（ほんとうの音のかわり）：拍に合わせて大きくなる、それっぽい波
export function demoFeatures(t, n = 64) {
  const beat = Math.exp(-((t % 0.5) / 0.12))
  const bands = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = i / n
    bands[i] = Math.min(1, (0.15 + 0.55 * Math.pow(1 - x, 1.4)) * (0.55 + 0.45 * beat) * (0.75 + 0.25 * Math.sin(t * 3.1 + i * 0.7)))
  }
  return { level: 0.25 + 0.4 * beat, bands }
}
