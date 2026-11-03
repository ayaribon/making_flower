// 文字スタイルのプリセット
// 新しいスタイルを足すときは、STYLES に1件追加するだけでOK

// スタイルを切り替えたときに、前のスタイルの装飾が残らないようにするための初期値
export const STYLE_DEFAULTS = {
  fontWeight: "normal",
  stroke: null,
  strokeWidth: 0,
  paintFirst: "fill",
  strokeLineJoin: "miter",
  shadow: null,
  backgroundColor: "",
  angle: 0,
  skewX: 0
}

export const STYLES = {
  impact: {
    label: "🔥 インパクト",
    fontFamily: "Dela Gothic One",
    fontSize: 150,
    fill: "#ffe600",
    stroke: "#111111",
    strokeWidth: 22,
    paintFirst: "stroke",
    strokeLineJoin: "round",
    shadow: { color: "rgba(0,0,0,0.6)", blur: 0, offsetX: 10, offsetY: 12 },
    angle: -4
  },
  gaming: {
    label: "🎮 ゲーム実況",
    fontFamily: "RocknRoll One",
    fontSize: 140,
    fill: { gradient: ["#3ad1ff", "#8a2be2"] },
    stroke: "#ffffff",
    strokeWidth: 14,
    paintFirst: "stroke",
    strokeLineJoin: "round",
    shadow: { color: "rgba(58,209,255,0.7)", blur: 30, offsetX: 0, offsetY: 0 },
    skewX: -8
  },
  yurukawa: {
    label: "🌸 ゆるかわ",
    fontFamily: "Mochiy Pop One",
    fontSize: 130,
    fill: "#f49ab5",
    stroke: "#ffffff",
    strokeWidth: 20,
    paintFirst: "stroke",
    strokeLineJoin: "round",
    shadow: { color: "rgba(240,140,170,0.45)", blur: 24, offsetX: 0, offsetY: 8 }
  },
  neon: {
    label: "✨ ネオン",
    fontFamily: "Zen Kaku Gothic New",
    fontWeight: 500,
    fontSize: 130,
    fill: "#ffffff",
    stroke: "#ff4fd8",
    strokeWidth: 4,
    paintFirst: "stroke",
    shadow: { color: "#ff4fd8", blur: 45, offsetX: 0, offsetY: 0 }
  },
  news: {
    label: "📢 ニュース速報",
    fontFamily: "Zen Kaku Gothic New",
    fontWeight: 900,
    fontSize: 120,
    fill: "#ffffff",
    backgroundColor: "#d7263d",
    shadow: { color: "rgba(0,0,0,0.35)", blur: 0, offsetX: 8, offsetY: 8 }
  },
  puffy: {
    label: "💎 ぷっくり",
    fontFamily: "Zen Maru Gothic",
    fontWeight: 700,
    fontSize: 140,
    fill: { gradient: ["#ffffff", "#c9b8ff"] },
    stroke: "#7b5cff",
    strokeWidth: 18,
    paintFirst: "stroke",
    strokeLineJoin: "round",
    shadow: { color: "rgba(80,40,160,0.55)", blur: 0, offsetX: 0, offsetY: 10 }
  },
  pixel: {
    label: "👾 ピクセル",
    fontFamily: "DotGothic16",
    fontSize: 130,
    fill: "#3ad1ff",
    stroke: "#120a2a",
    strokeWidth: 12,
    paintFirst: "stroke",
    strokeLineJoin: "miter",
    shadow: { color: "#ff4fd8", blur: 0, offsetX: 6, offsetY: 6 }
  },
  yumekawa: {
    label: "🦄 ゆめかわ",
    fontFamily: "Hachi Maru Pop",
    fontSize: 120,
    fill: { gradient: ["#ff9ad5", "#9ad8ff"] },
    stroke: "#ffffff",
    strokeWidth: 16,
    paintFirst: "stroke",
    strokeLineJoin: "round",
    shadow: { color: "rgba(200,140,255,0.6)", blur: 20, offsetX: 0, offsetY: 4 }
  },
  marine: {
    label: "🌊 マリン",
    fontFamily: "Zen Maru Gothic",
    fontWeight: 500,
    fontSize: 130,
    fill: { gradient: ["#3fd6d0", "#1e8fd8"] },
    stroke: "#ffffff",
    strokeWidth: 14,
    paintFirst: "stroke",
    strokeLineJoin: "round",
    shadow: { color: "rgba(14,80,150,0.4)", blur: 12, offsetX: 0, offsetY: 6 }
  },
  battle: {
    label: "⚔️ バトル",
    fontFamily: "Reggae One",
    fontSize: 140,
    fill: { gradient: ["#ffe600", "#ff6a00"] },
    stroke: "#2a0a0a",
    strokeWidth: 20,
    paintFirst: "stroke",
    strokeLineJoin: "round",
    shadow: { color: "rgba(0,0,0,0.6)", blur: 0, offsetX: 8, offsetY: 10 },
    angle: -3
  }
}
