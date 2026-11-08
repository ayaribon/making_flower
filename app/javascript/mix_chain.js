// 🎚 歌ってみた：ミックス（手順3・F3-3）
// 声 → ローカット → 低音 → 中低音（こもり）→ 中高音（抜け）→ 高音 → ハイカット → コンプ → 戻し → 左右（パン）
//      ├→ dry ───────────────────────────────┐
//      ├→ プリディレイ → リバーブ（響き）→ wet ───┼→ 出口
//      └→ エコー（ディレイ ⇄ フィードバック）→ echoWet ┘
// 試聴（AudioContext）と WAV 書き出し（OfflineAudioContext）で同じ作りを使う。
//
// 設定（MixSettings）の持ち方：
//   かんたん用の値（lowCut / mudCut / air / comp / reverb は 0〜100、reverbLength は秒）
//   ＋ pro（詳細モードで直接いじった本物の値。あればかんたん用の値より優先）
// → かんたん用スライダーを動かすと、それに関係する pro の値は消える（かんたんの値が効くように）

export const DEFAULT_MIX = Object.freeze({
  lowCut: 40,
  mudCut: 40,
  air: 40,
  comp: 50,
  reverb: 30,
  reverbLength: 1.8
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
export const GLOBAL_PRO_KEYS = Object.freeze(["reverbLength", "reverbPreDelay", "reverbDamp"])

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
  { group: "space", key: "echoTone", label: "エコーの明るさ", unit: "Hz", min: 800, max: 16000, step: 10, log: true }
])

export const PRO_GROUPS = Object.freeze({
  eq: "🔊 イコライザー（6バンド）",
  comp: "📏 コンプレッサー",
  space: "🌊 空間（パン・リバーブ・エコー）"
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
    echoTone: 6000
  }
  Object.entries(s.pro || {}).forEach(([k, v]) => { if (k in p && Number.isFinite(Number(v))) p[k] = Number(v) })
  // 範囲の外に出ないように
  PRO_PARAMS.forEach((d) => { p[d.key] = Math.max(d.min, Math.min(d.max, p[d.key])) })
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
  makeup.connect(panner)
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
    dry, preDelay, convolver, wet, echo, echoFilter, echoFb, echoWet, irKey: null
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
    chain.echo.delayTime, chain.echoFilter.frequency, chain.echoFb.gain, chain.echoWet.gain
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
