// 🎚 歌ってみた：ミックス（手順3・F3-3）
// 声 → ローカット → 低音 → 中低音（こもり）→ 中高音（抜け）→ 高音 → ハイカット → コンプ → 戻し
//    → 🎛 変わったエフェクト（K34：元の声 fxDry ＋ 歪み／電話／ローファイ／ノイズ／コーラス／ロボ を並べて混ぜる）→ 左右（パン）
//      ├→ dry ───────────────────────────────┐
//      ├→ プリディレイ → リバーブ（響き）→ wet ───┼→ 出口
//      └→ エコー（ディレイ ⇄ フィードバック）→ echoWet ┘
// 試聴（AudioContext）と WAV 書き出し（OfflineAudioContext）で同じ作りを使う。
// 🎛 エフェクトは6種類ぶんの道を最初から全部作っておき、選んだ道の量だけ上げる（K34）。
//   → 種類を切りかえても「量を下げる・上げる」だけなので、部分の境目でもプツッと鳴らない
//
// 設定（MixSettings）の持ち方：
//   かんたん用の値（lowCut / mudCut / air / comp / reverb は 0〜100、reverbLength は秒）
//   ＋ fx（エフェクトの種類："none" など）と fxAmount（かかり具合 0〜100）（K34）
//   ＋ pro（詳細モードで直接いじった本物の値。あればかんたん用の値より優先）
// → かんたん用スライダーを動かすと、それに関係する pro の値は消える（かんたんの値が効くように）

export const DEFAULT_MIX = Object.freeze({
  lowCut: 40,
  mudCut: 40,
  air: 40,
  comp: 50,
  reverb: 20,
  reverbLength: 1.8,
  fx: "none",
  fxAmount: 50
})

// 🎛 変わったエフェクトの種類（K34・声だけにかける）
export const FX_TYPES = Object.freeze({
  none: { label: "なし", hint: "エフェクトをかけない" },
  distortion: { label: "🔥 歪み", hint: "ガリッとしたロックっぽい声" },
  phone: { label: "📻 電話・ラジオ風", hint: "電話の向こう・古いラジオの声" },
  lofi: { label: "📼 ローファイ", hint: "古いゲーム機・カセットのような粗い音" },
  noise: { label: "🌫 ノイズを足す", hint: "サーッという音とレコードのプチプチ。歌っている所にだけ乗る" },
  chorus: { label: "🌀 コーラス", hint: "声がゆらいで広がる・ふわっとした感じ" },
  robot: { label: "🤖 ロボ声", hint: "機械っぽい声（大きくかけると言葉が聞き取りにくくなる）" }
})

// 種類 → その道の量の名前（mixParams が決める）
const FX_SENDS = Object.freeze({
  distortion: "fxSendDist", phone: "fxSendPhone", lofi: "fxSendLofi",
  noise: "fxSendNoise", chorus: "fxSendChorus", robot: "fxSendRobot"
})

// 雰囲気ボタン（K20）。曲全体にも、部分ごと（K19〜K21）にも使える
export const MIX_PRESETS = Object.freeze({
  recommended: { label: "✨ おすすめ", hint: "まずはこれ。ほどよい響きと聴きやすさ", settings: DEFAULT_MIX },
  hype: {
    label: "🔥 盛り上げる", hint: "声を前に・響き多め・明るく",
    settings: { lowCut: 45, mudCut: 45, air: 65, comp: 70, reverb: 45, reverbLength: 2.2 }
  },
  gentle: {
    label: "🌙 しっとり", hint: "長い響き・やわらかい声",
    settings: { lowCut: 35, mudCut: 30, air: 20, comp: 45, reverb: 50, reverbLength: 3.0 }
  },
  talk: {
    label: "💬 語りかける", hint: "響き少なめ・近くで歌っている感じ",
    settings: { lowCut: 40, mudCut: 50, air: 45, comp: 65, reverb: 12, reverbLength: 1.0 }
  },
  calm: {
    label: "🍃 抑えめ", hint: "エフェクトひかえめ・素の声に近い",
    settings: { lowCut: 30, mudCut: 20, air: 15, comp: 25, reverb: 15, reverbLength: 1.4 }
  },
  off: {
    label: "⏸ エフェクトなし", hint: "聴き比べ用",
    settings: { lowCut: 0, mudCut: 0, air: 0, comp: 0, reverb: 0, reverbLength: 1.8, pro: { echoMix: 0 } }
  }
})

// かんたん用の値 → それが決める pro の値
export const SIMPLE_LINKS = Object.freeze({
  lowCut: ["lowCutHz"],
  mudCut: ["mudDb"],
  air: ["airDb"],
  comp: ["compThreshold", "compRatio", "makeupDb"],
  reverb: ["dry", "wet"],
  reverbLength: ["reverbLength"]
})

// 響きの元（インパルス応答）に関わる値は、曲全体で共通（途中で作り直すと音が途切れるため）
// ローファイの段数（fxBits）も、作り直すと一瞬音が変わるので曲全体で共通（K34）
export const GLOBAL_PRO_KEYS = Object.freeze(["reverbLength", "reverbPreDelay", "reverbDamp", "fxBits"])

// 詳細モードのつまみ一覧（画面はこの表から作る）
export const PRO_PARAMS = Object.freeze([
  { group: "eq", key: "lowCutHz", label: "ローカット", unit: "Hz", min: 20, max: 400, step: 1, log: true, help: "これより低い音を切る（息・振動）" },
  { group: "eq", key: "lowShelfHz", label: "低音 周波数", unit: "Hz", min: 60, max: 400, step: 1, log: true },
  { group: "eq", key: "lowShelfDb", label: "低音 増減", unit: "dB", min: -12, max: 12, step: 0.5, help: "声の太さ" },
  { group: "eq", key: "mudHz", label: "中低音 周波数", unit: "Hz", min: 150, max: 1200, step: 1, log: true },
  { group: "eq", key: "mudDb", label: "中低音 増減", unit: "dB", min: -12, max: 12, step: 0.5, help: "マイナスでこもりが取れる" },
  { group: "eq", key: "mudQ", label: "中低音 幅（Q）", unit: "", min: 0.3, max: 8, step: 0.1, help: "大きいほど狭い範囲だけ変わる" },
  { group: "eq", key: "presenceHz", label: "中高音 周波数", unit: "Hz", min: 1000, max: 8000, step: 10, log: true },
  { group: "eq", key: "presenceDb", label: "中高音 増減", unit: "dB", min: -12, max: 12, step: 0.5, help: "プラスで言葉がハッキリ。上げすぎると耳に痛い" },
  { group: "eq", key: "presenceQ", label: "中高音 幅（Q）", unit: "", min: 0.3, max: 8, step: 0.1 },
  { group: "eq", key: "airHz", label: "高音 周波数", unit: "Hz", min: 3000, max: 16000, step: 10, log: true },
  { group: "eq", key: "airDb", label: "高音 増減", unit: "dB", min: -12, max: 12, step: 0.5, help: "空気感・きらびやかさ" },
  { group: "eq", key: "highCutHz", label: "ハイカット", unit: "Hz", min: 3000, max: 20000, step: 10, log: true, help: "これより高い音を切る（20000＝切らない）" },

  { group: "comp", key: "compThreshold", label: "しきい値", unit: "dB", min: -60, max: 0, step: 0.5, help: "これより大きい声を小さくする" },
  { group: "comp", key: "compRatio", label: "比率（レシオ）", unit: ":1", min: 1, max: 20, step: 0.1, help: "大きいほど強くならす" },
  { group: "comp", key: "compAttack", label: "アタック", unit: "ms", min: 0, max: 100, step: 0.5, help: "効き始めるまでの時間" },
  { group: "comp", key: "compRelease", label: "リリース", unit: "ms", min: 10, max: 1000, step: 5, help: "効き終わるまでの時間" },
  { group: "comp", key: "compKnee", label: "ニー", unit: "dB", min: 0, max: 40, step: 0.5, help: "大きいほどなめらかに効く" },
  { group: "comp", key: "makeupDb", label: "メイクアップ", unit: "dB", min: -12, max: 24, step: 0.5, help: "ならしたあとに上げる量" },

  { group: "space", key: "pan", label: "パン（左右）", unit: "", min: -1, max: 1, step: 0.01, help: "−1＝左、0＝真ん中、+1＝右" },
  { group: "space", key: "dry", label: "原音の量", unit: "", min: 0, max: 1.5, step: 0.01 },
  { group: "space", key: "wet", label: "リバーブの量", unit: "", min: 0, max: 1, step: 0.01 },
  { group: "space", key: "reverbLength", label: "リバーブの長さ", unit: "秒", min: 0.3, max: 6, step: 0.1, global: true },
  { group: "space", key: "reverbPreDelay", label: "プリディレイ", unit: "ms", min: 0, max: 200, step: 1, global: true, help: "響きが始まるまでの時間。長いと声がくっきり" },
  { group: "space", key: "reverbDamp", label: "響きのこもり", unit: "%", min: 0, max: 100, step: 1, global: true, help: "大きいほど響きが暗く・やわらかく" },
  { group: "space", key: "echoMix", label: "エコーの量", unit: "", min: 0, max: 1, step: 0.01, help: "やまびこのような繰り返し" },
  { group: "space", key: "echoTime", label: "エコーの間隔", unit: "ms", min: 20, max: 1500, step: 1 },
  { group: "space", key: "echoFeedback", label: "エコーの繰り返し", unit: "", min: 0, max: 0.9, step: 0.01, help: "大きいほど長く続く" },
  { group: "space", key: "echoTone", label: "エコーの明るさ", unit: "Hz", min: 800, max: 16000, step: 10, log: true },

  // 🎛 変わったエフェクト（K34）。どれも「種類」で選んだものだけに効く
  { group: "fx", key: "fxDrive", label: "🔥 歪みの強さ", unit: "倍", min: 1, max: 50, step: 0.5, log: true, help: "大きいほどガリガリ" },
  { group: "fx", key: "fxPhoneLowHz", label: "📻 電話風 下の音", unit: "Hz", min: 100, max: 1500, step: 10, log: true, help: "これより低い音を切る" },
  { group: "fx", key: "fxPhoneHighHz", label: "📻 電話風 上の音", unit: "Hz", min: 1500, max: 8000, step: 10, log: true, help: "これより高い音を切る" },
  { group: "fx", key: "fxBits", label: "📼 ローファイ 段数", unit: "bit", min: 2, max: 12, step: 1, global: true, help: "小さいほど粗い音" },
  { group: "fx", key: "fxLofiToneHz", label: "📼 ローファイ 明るさ", unit: "Hz", min: 800, max: 16000, step: 10, log: true, help: "これより高い音を切る" },
  { group: "fx", key: "fxHiss", label: "🌫 サーッの量", unit: "", min: 0, max: 1, step: 0.01 },
  { group: "fx", key: "fxCrackle", label: "🌫 プチプチの量", unit: "", min: 0, max: 1, step: 0.01 },
  { group: "fx", key: "fxChorusRate", label: "🌀 ゆれの速さ", unit: "Hz", min: 0.1, max: 6, step: 0.05 },
  { group: "fx", key: "fxChorusDepth", label: "🌀 ゆれの深さ", unit: "ms", min: 0, max: 10, step: 0.1 },
  { group: "fx", key: "fxRobotHz", label: "🤖 ロボの高さ", unit: "Hz", min: 20, max: 500, step: 1, log: true, help: "低いとガタガタ、高いと金属っぽい" }
])

export const PRO_GROUPS = Object.freeze({
  eq: "🔊 イコライザー（6バンド）",
  comp: "📏 コンプレッサー",
  space: "🌊 空間（パン・リバーブ・エコー）",
  fx: "🎛 変わったエフェクト（選んだ種類だけに効く）"
})

const clamp01 = (v) => Math.max(0, Math.min(100, Number(v) || 0)) / 100

// 設定 → 実際の音の値（数字の決め方はここ1か所にまとめる）
export function mixParams(settings) {
  const s = { ...DEFAULT_MIX, ...settings }
  const comp = clamp01(s.comp)
  const reverb = clamp01(s.reverb)
  const p = {
    lowCutHz: 20 + clamp01(s.lowCut) * 160,
    lowShelfHz: 120,
    lowShelfDb: 0,
    mudHz: 320,
    mudDb: -clamp01(s.mudCut) * 6,
    mudQ: 1,
    presenceHz: 3000,
    presenceDb: 0,
    presenceQ: 1,
    airHz: 5000,
    airDb: clamp01(s.air) * 6,
    highCutHz: 20000,
    compThreshold: -6 - comp * 24,
    compRatio: 1 + comp * 5,
    compAttack: 6,
    compRelease: 180,
    compKnee: 8,
    makeupDb: comp * 6,
    pan: 0,
    dry: 1 - reverb * 0.25,
    wet: reverb * 0.55,
    reverbLength: Number(s.reverbLength) || DEFAULT_MIX.reverbLength,
    reverbPreDelay: 20,
    reverbDamp: 50,
    echoMix: 0,
    echoTime: 300,
    echoFeedback: 0.3,
    echoTone: 6000,
    // 🎛 変わったエフェクトの細かい値（K34）
    fxDrive: 12,
    fxPhoneLowHz: 300,
    fxPhoneHighHz: 3000,
    fxBits: 6,
    fxLofiToneHz: 4000,
    fxHiss: 0.35,
    fxCrackle: 0.5,
    fxChorusRate: 1.2,
    fxChorusDepth: 3,
    fxRobotHz: 90
  }
  Object.entries(s.pro || {}).forEach(([k, v]) => { if (k in p && Number.isFinite(Number(v))) p[k] = Number(v) })
  // 範囲の外に出ないように
  PRO_PARAMS.forEach((d) => { p[d.key] = Math.max(d.min, Math.min(d.max, p[d.key])) })

  // 🎛 変わったエフェクト：選んだ種類の道だけ量を上げる。元の声（fxDry）は種類ごとに減らし方を変える
  const fx = FX_TYPES[s.fx] ? s.fx : "none"
  const a = fx === "none" ? 0 : clamp01(s.fxAmount ?? DEFAULT_MIX.fxAmount)
  p.fx = fx
  p.fxAmount = a
  Object.values(FX_SENDS).forEach((k) => { p[k] = 0 })
  p.fxDry = 1
  if (fx === "noise") {
    p.fxSendNoise = a // ノイズは足すだけ（元の声は減らさない）
  } else if (fx === "chorus") {
    p.fxDry = 1 - a * 0.4 // ゆれた声と元の声を重ねる
    p.fxSendChorus = a * 0.7
  } else if (fx !== "none") {
    p.fxDry = 1 - a // かかり具合 100 ならエフェクトの音だけ
    p[FX_SENDS[fx]] = a
  }
  return p
}

const dbToGain = (db) => Math.pow(10, db / 20)

// 響きの元：少し遅れて始まり、だんだん小さくなるノイズ（左右で別々）。damp（0〜1）が大きいほど暗い響き
export function makeImpulse(ctx, seconds, damp = 0.5) {
  const sr = ctx.sampleRate
  const len = Math.max(1, Math.round(sr * seconds))
  const ir = ctx.createBuffer(2, len, sr)
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c)
    let lp = 0
    for (let i = 0; i < len; i++) {
      const t = i / len
      const k = Math.min(0.97, 0.05 + damp * 0.55 + 0.3 * t) // 時間がたつほど高い音が消える
      lp = lp * k + (Math.random() * 2 - 1) * (1 - k)
      d[i] = lp * Math.pow(1 - t, 3)
    }
  }
  return ir
}

function biquad(ctx, type, freq, q) {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  if (q !== undefined) f.Q.value = q
  return f
}

// ---------- 🎛 変わったエフェクトの部品（K34） ----------

// 種（seed）を決めた乱数。同じ種なら毎回同じ並び → 試聴・WAV・⚡MP4 で同じノイズになる
function seededRandom(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// サーッという音（ホワイトノイズを少しだけ丸めたもの）
function makeHissBuffer(ctx, seconds = 2.5) {
  const sr = ctx.sampleRate
  const len = Math.round(sr * seconds)
  const buf = ctx.createBuffer(1, len, sr)
  const d = buf.getChannelData(0)
  const rnd = seededRandom(20261110)
  let lp = 0
  for (let i = 0; i < len; i++) { lp = lp * 0.4 + (rnd() * 2 - 1) * 0.6; d[i] = lp }
  return buf
}

// レコードのプチプチ（短い「パチッ」をまばらに置く。1秒に6回くらい）
function makeCrackleBuffer(ctx, seconds = 7.3) {
  const sr = ctx.sampleRate
  const len = Math.round(sr * seconds)
  const buf = ctx.createBuffer(1, len, sr)
  const d = buf.getChannelData(0)
  const rnd = seededRandom(19700101)
  const perSample = 6 / sr
  for (let i = 0; i < len; i++) {
    if (rnd() >= perSample) continue
    const amp = (0.3 + rnd() * 0.7) * (rnd() < 0.5 ? -1 : 1)
    const n = Math.round(sr * (0.0004 + rnd() * 0.0012))
    for (let j = 0; j < n && i + j < len; j++) d[i + j] += amp * Math.exp(-6 * j / n) * (j % 2 ? -0.6 : 1)
  }
  return buf
}

// 歪みの形（なめらかに頭打ちにする）
function softClipCurve(n = 2048) {
  const c = new Float32Array(n)
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * 3) / Math.tanh(3) }
  return c
}

// ローファイの形：音の大きさを bits 段に丸める（ビット数を落とした感じ）
function bitCrushCurve(bits, n = 4096) {
  const steps = Math.pow(2, Math.max(1, bits - 1))
  const c = new Float32Array(n)
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.round(x * steps) / steps }
  return c
}

// 声の大きさを取り出す形（|x|）。ノイズを声に合わせて出すのに使う
function absCurve(n = 1025) {
  const c = new Float32Array(n)
  for (let i = 0; i < n; i++) c[i] = Math.abs((i / (n - 1)) * 2 - 1)
  return c
}

const gainNode = (ctx, v) => { const g = ctx.createGain(); g.gain.value = v; return g }

// 声のミックスのつなぎを作る。input に声をつなぎ、output を音量（vocalGain）へつなぐ
export function createVocalChain(ctx) {
  const input = ctx.createGain()
  const lowCut = biquad(ctx, "highpass", 80, Math.SQRT1_2)
  const lowShelf = biquad(ctx, "lowshelf", 120)
  const mud = biquad(ctx, "peaking", 320, 1)
  const presence = biquad(ctx, "peaking", 3000, 1)
  const air = biquad(ctx, "highshelf", 5000)
  const highCut = biquad(ctx, "lowpass", 20000, Math.SQRT1_2)
  const comp = ctx.createDynamicsCompressor()
  const makeup = ctx.createGain()
  const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain()
  const dry = ctx.createGain()
  const preDelay = ctx.createDelay(1)
  const convolver = ctx.createConvolver()
  convolver.normalize = true // 響きの元の大きさに関係なく、だいたい同じ音量になるようにブラウザがそろえる
  const wet = ctx.createGain()
  const echo = ctx.createDelay(2)
  const echoFilter = biquad(ctx, "lowpass", 6000, Math.SQRT1_2)
  const echoFb = ctx.createGain()
  const echoWet = ctx.createGain()
  const output = ctx.createGain()

  input.connect(lowCut)
  lowCut.connect(lowShelf)
  lowShelf.connect(mud)
  mud.connect(presence)
  presence.connect(air)
  air.connect(highCut)
  highCut.connect(comp)
  comp.connect(makeup)

  // 🎛 変わったエフェクト（K34）：makeup → [元の声 fxDry ＋ 6種類の道] → fxOut → panner
  // 6種類の道はいつも全部つながっていて、選んだ道の量（fxSend…）だけを上げる
  const fxDry = gainNode(ctx, 1)
  const fxOut = ctx.createGain()
  makeup.connect(fxDry)
  fxDry.connect(fxOut)
  const send = () => { const g = gainNode(ctx, 0); g.connect(fxOut); return g }

  // 🔥 歪み：大きくしてから頭打ちにする
  const fxSendDist = send()
  const distPre = gainNode(ctx, 12)
  const distShaper = ctx.createWaveShaper()
  distShaper.curve = softClipCurve()
  distShaper.oversample = "4x"
  const distPost = gainNode(ctx, 0.5)
  makeup.connect(distPre); distPre.connect(distShaper); distShaper.connect(distPost); distPost.connect(fxSendDist)

  // 📻 電話・ラジオ風：狭い帯域だけ残して、少し歪ませる
  const fxSendPhone = send()
  const phoneLow1 = biquad(ctx, "highpass", 300, 0.9)
  const phoneLow2 = biquad(ctx, "highpass", 300, 0.9)
  const phoneHigh1 = biquad(ctx, "lowpass", 3000, 0.9)
  const phoneHigh2 = biquad(ctx, "lowpass", 3000, 0.9)
  const phonePre = gainNode(ctx, 3)
  const phoneShaper = ctx.createWaveShaper()
  phoneShaper.curve = softClipCurve()
  const phonePost = gainNode(ctx, 0.9)
  makeup.connect(phoneLow1); phoneLow1.connect(phoneLow2); phoneLow2.connect(phoneHigh1); phoneHigh1.connect(phoneHigh2)
  phoneHigh2.connect(phonePre); phonePre.connect(phoneShaper); phoneShaper.connect(phonePost); phonePost.connect(fxSendPhone)

  // 📼 ローファイ：段々に丸めて、高い音を削る
  const fxSendLofi = send()
  const lofiShaper = ctx.createWaveShaper()
  lofiShaper.curve = bitCrushCurve(6)
  const lofiTone = biquad(ctx, "lowpass", 4000, Math.SQRT1_2)
  makeup.connect(lofiShaper); lofiShaper.connect(lofiTone); lofiTone.connect(fxSendLofi)

  // 🌫 ノイズを足す：サーッ＋プチプチを、声の大きさ（envelope）に合わせて出す（歌っていない所では鳴らない）
  const fxSendNoise = send()
  const noiseVca = gainNode(ctx, 0) // 声の大きさが gain に足される
  const hiss = ctx.createBufferSource()
  hiss.buffer = makeHissBuffer(ctx)
  hiss.loop = true
  const crackle = ctx.createBufferSource()
  crackle.buffer = makeCrackleBuffer(ctx)
  crackle.loop = true
  const hissGain = gainNode(ctx, 0)
  const crackleGain = gainNode(ctx, 0)
  hiss.connect(hissGain); hissGain.connect(noiseVca)
  crackle.connect(crackleGain); crackleGain.connect(noiseVca)
  const envAbs = ctx.createWaveShaper()
  envAbs.curve = absCurve()
  const envLp1 = biquad(ctx, "lowpass", 12, Math.SQRT1_2)
  const envLp2 = biquad(ctx, "lowpass", 12, Math.SQRT1_2)
  const envGain = gainNode(ctx, 4)
  makeup.connect(envAbs); envAbs.connect(envLp1); envLp1.connect(envLp2); envLp2.connect(envGain); envGain.connect(noiseVca.gain)
  noiseVca.connect(fxSendNoise)
  hiss.start(0)
  crackle.start(0)

  // 🌀 コーラス：ゆれる短いディレイ
  const fxSendChorus = send()
  const chorusDelay = ctx.createDelay(0.1)
  chorusDelay.delayTime.value = 0.02
  const lfo = ctx.createOscillator()
  lfo.type = "sine"
  lfo.frequency.value = 1.2
  const lfoDepth = gainNode(ctx, 0.003)
  lfo.connect(lfoDepth); lfoDepth.connect(chorusDelay.delayTime)
  makeup.connect(chorusDelay); chorusDelay.connect(fxSendChorus)
  lfo.start(0)

  // 🤖 ロボ声：声に一定の音を掛け合わせる（リングモジュレーター）
  const fxSendRobot = send()
  const ring = gainNode(ctx, 0) // 掛け合わせる音が gain に入る
  const ringOsc = ctx.createOscillator()
  ringOsc.type = "sine"
  ringOsc.frequency.value = 90
  const robotPost = gainNode(ctx, 1.4)
  ringOsc.connect(ring.gain)
  makeup.connect(ring); ring.connect(robotPost); robotPost.connect(fxSendRobot)
  ringOsc.start(0)

  fxOut.connect(panner)
  panner.connect(dry)
  panner.connect(preDelay)
  preDelay.connect(convolver)
  convolver.connect(wet)
  panner.connect(echo)
  echo.connect(echoFilter)
  echoFilter.connect(echoFb)
  echoFb.connect(echo) // くり返し
  echoFilter.connect(echoWet)
  dry.connect(output)
  wet.connect(output)
  echoWet.connect(output)

  return {
    ctx, input, output, lowCut, lowShelf, mud, presence, air, highCut, comp, makeup, panner,
    dry, preDelay, convolver, wet, echo, echoFilter, echoFb, echoWet, irKey: null,
    // 🎛 変わったエフェクト（K34）
    fxDry, fxOut, fxSendDist, fxSendPhone, fxSendLofi, fxSendNoise, fxSendChorus, fxSendRobot,
    distPre, phoneLow1, phoneLow2, phoneHigh1, phoneHigh2, lofiShaper, lofiTone,
    hissGain, crackleGain, lfo, lfoDepth, ringOsc, bitsKey: 6,
    sources: [hiss, crackle, lfo, ringOsc] // 止めるときに使う
  }
}

// 予約し直すときに止める値の一覧
function chainParams(chain) {
  const list = [
    chain.lowCut.frequency, chain.lowShelf.frequency, chain.lowShelf.gain,
    chain.mud.frequency, chain.mud.gain, chain.mud.Q,
    chain.presence.frequency, chain.presence.gain, chain.presence.Q,
    chain.air.frequency, chain.air.gain, chain.highCut.frequency,
    chain.comp.threshold, chain.comp.ratio, chain.comp.attack, chain.comp.release, chain.comp.knee,
    chain.makeup.gain, chain.dry.gain, chain.wet.gain, chain.preDelay.delayTime,
    chain.echo.delayTime, chain.echoFilter.frequency, chain.echoFb.gain, chain.echoWet.gain,
    // 🎛 変わったエフェクト（K34）
    chain.fxDry.gain, chain.fxSendDist.gain, chain.fxSendPhone.gain, chain.fxSendLofi.gain,
    chain.fxSendNoise.gain, chain.fxSendChorus.gain, chain.fxSendRobot.gain,
    chain.distPre.gain, chain.phoneLow1.frequency, chain.phoneLow2.frequency, chain.phoneHigh1.frequency, chain.phoneHigh2.frequency,
    chain.lofiTone.frequency, chain.hissGain.gain, chain.crackleGain.gain,
    chain.lfo.frequency, chain.lfoDepth.gain, chain.ringOsc.frequency
  ]
  if (chain.panner.pan) list.push(chain.panner.pan)
  return list
}

// 設定を入れる。at（ctx の時計）を渡すとその時刻から、ramp 秒かけてなめらかに変える（K21）
export function applyMix(chain, settings, { at = null, ramp = 0.05 } = {}) {
  const p = mixParams(settings)
  const t = at ?? chain.ctx.currentTime
  const tc = Math.max(0.001, ramp / 3)
  const set = (param, value) => {
    if (ramp <= 0) param.setValueAtTime(value, t)
    else param.setTargetAtTime(value, t, tc)
  }
  set(chain.lowCut.frequency, p.lowCutHz)
  set(chain.lowShelf.frequency, p.lowShelfHz)
  set(chain.lowShelf.gain, p.lowShelfDb)
  set(chain.mud.frequency, p.mudHz)
  set(chain.mud.gain, p.mudDb)
  set(chain.mud.Q, p.mudQ)
  set(chain.presence.frequency, p.presenceHz)
  set(chain.presence.gain, p.presenceDb)
  set(chain.presence.Q, p.presenceQ)
  set(chain.air.frequency, p.airHz)
  set(chain.air.gain, p.airDb)
  set(chain.highCut.frequency, Math.min(p.highCutHz, chain.ctx.sampleRate / 2 - 100))
  set(chain.comp.threshold, p.compThreshold)
  set(chain.comp.ratio, p.compRatio)
  set(chain.comp.attack, p.compAttack / 1000)
  set(chain.comp.release, p.compRelease / 1000)
  set(chain.comp.knee, p.compKnee)
  set(chain.makeup.gain, dbToGain(p.makeupDb))
  if (chain.panner.pan) set(chain.panner.pan, p.pan)
  set(chain.dry.gain, p.dry)
  set(chain.wet.gain, p.wet)
  set(chain.preDelay.delayTime, p.reverbPreDelay / 1000)
  set(chain.echo.delayTime, p.echoTime / 1000)
  set(chain.echoFilter.frequency, Math.min(p.echoTone, chain.ctx.sampleRate / 2 - 100))
  set(chain.echoFb.gain, p.echoFeedback)
  set(chain.echoWet.gain, p.echoMix)
  // 🎛 変わったエフェクト（K34）。種類の切りかえも「道の量」を変えるだけなので、部分の境目でも ramp でなめらかに混ざる
  if (chain.fxDry) {
    const nyq = chain.ctx.sampleRate / 2 - 100
    set(chain.fxDry.gain, p.fxDry)
    set(chain.fxSendDist.gain, p.fxSendDist)
    set(chain.fxSendPhone.gain, p.fxSendPhone)
    set(chain.fxSendLofi.gain, p.fxSendLofi)
    set(chain.fxSendNoise.gain, p.fxSendNoise)
    set(chain.fxSendChorus.gain, p.fxSendChorus)
    set(chain.fxSendRobot.gain, p.fxSendRobot)
    set(chain.distPre.gain, p.fxDrive)
    const lo = Math.min(p.fxPhoneLowHz, p.fxPhoneHighHz - 100)
    set(chain.phoneLow1.frequency, lo)
    set(chain.phoneLow2.frequency, lo)
    set(chain.phoneHigh1.frequency, Math.min(p.fxPhoneHighHz, nyq))
    set(chain.phoneHigh2.frequency, Math.min(p.fxPhoneHighHz, nyq))
    set(chain.lofiTone.frequency, Math.min(p.fxLofiToneHz, nyq))
    set(chain.hissGain.gain, p.fxHiss * 0.08)
    set(chain.crackleGain.gain, p.fxCrackle * 0.35)
    set(chain.lfo.frequency, p.fxChorusRate)
    set(chain.lfoDepth.gain, p.fxChorusDepth / 1000)
    set(chain.ringOsc.frequency, p.fxRobotHz)
    // ローファイの段数は形（curve）を作り直す必要がある → 変わったときだけ（曲全体で共通の値）
    if (chain.bitsKey !== p.fxBits) { chain.lofiShaper.curve = bitCrushCurve(p.fxBits); chain.bitsKey = p.fxBits }
  }
  // 響きの長さ・こもりが変わったときだけ作り直す（重いので）
  const key = `${p.reverbLength}|${p.reverbDamp}`
  if (chain.irKey !== key) {
    chain.convolver.buffer = makeImpulse(chain.ctx, p.reverbLength, p.reverbDamp / 100)
    chain.irKey = key
  }
  return p
}

// ---------- 部分ごとのミックス（K19〜K21） ----------
// timeline = { base: 曲全体の設定, sections: [{ startSec, endSec, settings }], bypass }
// 時間はすべて「曲の時間」（オケの0秒目が0）

export const SECTION_RAMP = 0.6 // 切りかわりを何秒かけてなめらかにするか（境目の0.3秒前から）

function globalsOf(base) {
  const pro = {}
  GLOBAL_PRO_KEYS.forEach((k) => { if (base.pro && k in base.pro) pro[k] = base.pro[k] })
  return pro
}

// 曲の t 秒目で使う設定（響きの元に関わる値は、いつも曲全体の値）
export function settingsAt(timeline, t) {
  const base = timeline.base
  if (timeline.bypass) {
    return { ...MIX_PRESETS.off.settings, reverbLength: base.reverbLength, pro: { ...globalsOf(base), echoMix: 0 } }
  }
  const sec = timeline.sections.find((s) => t >= s.startSec && t < s.endSec)
  const own = sec ? sec.settings : base
  return { ...own, reverbLength: base.reverbLength, pro: { ...(own.pro || {}), ...globalsOf(base) } }
}

// 曲の fromSec 秒目が ctx の時計で ctxAt に鳴るとき、部分ごとの切りかえを先に全部予約する
// live＝再生中にスライダーを動かしたとき（今の音から短くなめらかに変える）
export function scheduleMixTimeline(chain, timeline, ctxAt, fromSec, { live = false } = {}) {
  const now = chain.ctx.currentTime
  chainParams(chain).forEach((p) => {
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(now)
    else p.cancelScheduledValues(now)
  })
  applyMix(chain, settingsAt(timeline, fromSec), live ? { at: now, ramp: 0.05 } : { at: ctxAt, ramp: 0 })
  if (timeline.bypass) return

  const bounds = new Set()
  timeline.sections.forEach((s) => { bounds.add(s.startSec); bounds.add(s.endSec) })
  ;[...bounds].filter((b) => b > fromSec).sort((a, b) => a - b).forEach((b) => {
    const at = ctxAt + (b - fromSec) - SECTION_RAMP / 2
    applyMix(chain, settingsAt(timeline, b), { at: Math.max(ctxAt, now, at), ramp: SECTION_RAMP })
  })
}

// 全体の出口：音割れを防ぐリミッター（ほぼ止めるだけの強いコンプ）
export function createLimiter(ctx) {
  const lim = ctx.createDynamicsCompressor()
  lim.threshold.value = -1.5
  lim.knee.value = 0
  lim.ratio.value = 20
  lim.attack.value = 0.002
  lim.release.value = 0.1
  return lim
}

// 書き出しで響き・エコーが途中で切れないように、曲の後ろに足す秒数
export function reverbTail(settings) {
  const p = mixParams(settings)
  let tail = p.wet > 0 ? p.reverbLength + p.reverbPreDelay / 1000 + 0.1 : 0
  if (p.echoMix > 0 && p.echoFeedback > 0) {
    // 1000分の1の大きさになるまでの回数 × 間隔
    const repeats = Math.log(0.001) / Math.log(p.echoFeedback)
    tail = Math.max(tail, Math.min(10, repeats * (p.echoTime / 1000)))
  } else if (p.echoMix > 0) {
    tail = Math.max(tail, p.echoTime / 1000 + 0.1)
  }
  return tail
}
