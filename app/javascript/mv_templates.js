// 🪄 MV のテンプレート（かんたん作成）
// 「好きな画像を入れて、テンプレートを選ぶだけ」で、それっぽい歌ってみた動画にするための組み合わせ。
// どれも、今までの設定（見た目・アニメーション・おまかせ演出・背景の切りかえ・色・フェード）に
// 値を入れるだけ。当てたあとも、今までの画面でひとつずつ直せる。
//
// ポイント（pointFx）：部分の名前（④の部分・推測した構成・自動で見つけたサビ）の「始まり」「終わり」で起きる演出。
//   { "サビ": { start: "flash", end: "none" } } のように、名前ごとに決める（同じ名前の部分は全部同じ演出）
// 画像の置き場所（MV_IMAGE_SLOTS）：1枚目＝いつもの背景。2枚目からは、その部分のあいだだけ切りかわる

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

// 何枚目の画像を、どの部分で使うか（1枚目はいつもの背景）
export const MV_IMAGE_SLOTS = Object.freeze([
  { label: "いつもの背景", parts: [] },
  { label: "サビ", parts: ["サビ", "ラスサビ"] },
  { label: "Bメロ", parts: ["Bメロ"] },
  { label: "落ちサビ・Cメロ", parts: ["落ちサビ", "Cメロ"] },
  { label: "間奏・アウトロ", parts: ["間奏", "アウトロ"] }
])

export const MV_QUICK_TEMPLATES = Object.freeze({
  ballad: {
    label: "🌙 しっとり",
    hint: "バラード向け。画像をジャケットのように見せて、ゆっくり動く。落ちサビは白黒で静かに",
    look: "jacket", dim: 0.25,
    anim: { lyric: "fade", transition: "none", bg: "kenburns" },
    fx: { strength: 40, beat: false, chorus: true, sparkle: true },
    filter: "none", filterAmount: 70, filterNames: { "落ちサビ": "mono" },
    pointFx: {
      "サビ": { start: "whiteout", end: "none" },
      "落ちサビ": { start: "blackout", end: "none" },
      "ラスサビ": { start: "flash", end: "none" }
    },
    bgFade: 1.2, fadeIn: 1.5, fadeOut: 3
  },
  hype: {
    label: "🔥 ノリノリ",
    hint: "アップテンポ向け。下に音のバー、サビの入りでズームでドン。サビはネオン色",
    look: "bars", dim: 0.2,
    anim: { lyric: "pop", transition: "none", bg: "sway" },
    fx: { strength: 85, beat: true, chorus: true, sparkle: true },
    filter: "none", filterAmount: 60, filterNames: { "サビ": "neon", "ラスサビ": "neon" },
    pointFx: {
      "サビ": { start: "zoom", end: "shake" },
      "間奏": { start: "glitch", end: "none" },
      "ラスサビ": { start: "zoom", end: "flash" }
    },
    bgFade: 0.3, fadeIn: 0.5, fadeOut: 2
  },
  emo: {
    label: "💜 エモ・ボカロ風",
    hint: "曲名のまわりの輪が音ではねる。サビの入りでグリッチ、落ちサビで色が反転",
    look: "visualizer", dim: 0.35,
    anim: { lyric: "type", transition: "none", bg: "slow" },
    fx: { strength: 70, beat: true, chorus: true, sparkle: false },
    filter: "cool", filterAmount: 45, filterNames: { "落ちサビ": "mono" },
    pointFx: {
      "サビ": { start: "glitch", end: "blackout" },
      "落ちサビ": { start: "invert", end: "none" },
      "ラスサビ": { start: "glitch", end: "none" }
    },
    bgFade: 0.5, fadeIn: 1, fadeOut: 2.5
  },
  lofi: {
    label: "🎧 ローファイ",
    hint: "カフェっぽい色あせた画面。動きはひかえめで、ずっと見ていられる感じ",
    look: "simple", dim: 0.2,
    anim: { lyric: "rise", transition: "none", bg: "sway" },
    fx: { strength: 30, beat: true, chorus: true, sparkle: false },
    filter: "vintage", filterAmount: 60, filterNames: {},
    pointFx: {
      "サビ": { start: "flash", end: "none" }
    },
    bgFade: 1.5, fadeIn: 2, fadeOut: 3
  },
  idol: {
    label: "✨ キラキラ",
    hint: "アイドル・ポップ向け。光のつぶが舞って、サビで明るくピカッ。歌詞はポンと出る",
    look: "particles", dim: 0.15,
    anim: { lyric: "pop", transition: "none", bg: "kenburns" },
    fx: { strength: 80, beat: true, chorus: true, sparkle: true },
    filter: "none", filterAmount: 50, filterNames: { "サビ": "warm", "ラスサビ": "warm" },
    pointFx: {
      "サビ": { start: "flash", end: "zoom" },
      "落ちサビ": { start: "whiteout", end: "none" },
      "ラスサビ": { start: "flash", end: "none" }
    },
    bgFade: 0.6, fadeIn: 1, fadeOut: 2.5
  }
})
