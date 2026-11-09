// 🎶 ハモリ（K29）・🐸 ケロケロ風：声の音程を調べて、音程を変えた声を作る（ブラウザの中だけ・N1）
//   detectPitch      … 声の音程（YIN）を 10ms ごとに調べる
//   estimateKey      … オケのキー（調）をクロマ（12音の強さ）から推定する
//   harmonySemitones … 調に沿って「3度上」などにずらすと何半音か（フレームごと）
//   keroSemitones    … 音程を一番近い音に寄せるには何半音か（ケロケロ風）
//   shiftPitchCurve  … フレームごとに違う量だけ音程を変える（長さは変わらない・粒をずらして重ねる方式）
//   yinFrame         … 録音中の「今の声の音程」（マイクの短い波形から）
// 精度は「だいたい」。日本語の歌で確かめていないので、推定キーは画面で変えられるようにしている

export const NOTE_NAMES = ["ド", "ド#", "レ", "レ#", "ミ", "ファ", "ファ#", "ソ", "ソ#", "ラ", "ラ#", "シ"]
export const KEY_LETTERS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] }

// ハモり方（調の中での段の数）。octaveDown は段ではなく12半音
export const HARMONY_INTERVALS = Object.freeze({
  up3: { label: "3度上", steps: 2 },
  down3: { label: "3度下", steps: -2 },
  up5: { label: "5度上", steps: 4 },
  octDown: { label: "1オクターブ下", semis: -12 }
})

// ✋ 手で選ぶ度数（K38・11/10）：調に沿って「上へ2度〜8度」「下へ2度〜8度」を1度ずつ。
// id は "deg:+2"（上へ2度）〜 "deg:-8"（下へ8度）。n度＝調の中で n-1 段ずらす（8度＝1オクターブ）
export const MANUAL_DEGREES = Object.freeze([2, 3, 4, 5, 6, 7, 8])
export function manualIntervalId(dir, n) {
  return `deg:${dir < 0 ? "-" : "+"}${n}`
}
// id → { label, steps } か { label, semis }。知らない id は「3度上」
export function intervalInfo(id) {
  if (HARMONY_INTERVALS[id]) return HARMONY_INTERVALS[id]
  const m = /^deg:([+-])([2-8])$/.exec(id || "")
  if (m) {
    const n = Number(m[2])
    const up = m[1] === "+"
    return { label: `${up ? "上" : "下"}へ${n}度`, steps: (up ? 1 : -1) * (n - 1), manual: true }
  }
  return HARMONY_INTERVALS.up3
}
export function isValidInterval(id) {
  return !!HARMONY_INTERVALS[id] || /^deg:[+-][2-8]$/.test(id || "")
}

export const hzToMidi = (f) => 69 + 12 * Math.log2(f / 440)
export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12)
export function noteName(midi) {
  const m = Math.round(midi)
  return `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`
}
export function keyName(key) {
  if (!key) return "?"
  const l = KEY_LETTERS[key.tonic]
  return key.mode === "minor" ? `${l}m（${NOTE_NAMES[key.tonic]}の短調）` : `${l}（${NOTE_NAMES[key.tonic]}の長調）`
}

// ---------- 音程を調べる（YIN） ----------

function toMonoData(buffer) {
  const n = buffer.numberOfChannels
  const len = buffer.length
  if (n === 1) return buffer.getChannelData(0)
  const out = new Float32Array(len)
  for (let ch = 0; ch < n; ch++) {
    const d = buffer.getChannelData(ch)
    for (let i = 0; i < len; i++) out[i] += d[i] / n
  }
  return out
}

// 平均して小さくする（音程を調べるだけなので 8kHz くらいで十分）
function decimate(data, factor) {
  if (factor <= 1) return data
  const n = Math.floor(data.length / factor)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    const o = i * factor
    for (let j = 0; j < factor; j++) s += data[o + j]
    out[i] = s / factor
  }
  return out
}

// 1つの短い波形の音程（Hz）。見つからなければ 0
export function yinFrame(x, sr, { minHz = 80, maxHz = 1000, threshold = 0.15, start = 0, length = null } = {}) {
  const len = length ?? x.length - start
  const tauMax = Math.min(Math.floor(sr / minHz), Math.floor(len / 2))
  const tauMin = Math.max(2, Math.floor(sr / maxHz))
  const W = len - tauMax
  if (W <= 0 || tauMax <= tauMin) return 0
  const d = new Float32Array(tauMax + 1)
  for (let tau = 1; tau <= tauMax; tau++) {
    let s = 0
    for (let j = 0; j < W; j++) {
      const v = x[start + j] - x[start + j + tau]
      s += v * v
    }
    d[tau] = s
  }
  // 累積平均で割る（cmnd）
  let sum = 0
  let found = -1
  for (let tau = 1; tau <= tauMax; tau++) {
    sum += d[tau]
    d[tau] = sum > 0 ? (d[tau] * tau) / sum : 1
    if (found < 0 && tau >= tauMin && d[tau] < threshold) found = tau
  }
  if (found < 0) return 0
  let tau = found
  while (tau + 1 <= tauMax && d[tau + 1] < d[tau]) tau++
  // 放物線で少し細かく
  const a = d[tau - 1] ?? d[tau]
  const b = d[tau]
  const c = d[tau + 1] ?? d[tau]
  const den = a - 2 * b + c
  const shift = den !== 0 ? (0.5 * (a - c)) / den : 0
  const t = tau + Math.max(-1, Math.min(1, shift))
  return t > 0 ? sr / t : 0
}

// 声全体の音程：{ hop（秒）, midi: Float32Array（0＝声がない・音程が分からない） }
export function detectPitch(buffer, { hop = 0.01 } = {}) {
  const data = toMonoData(buffer)
  const factor = Math.max(1, Math.round(buffer.sampleRate / 8000))
  const x = decimate(data, factor)
  const sr = buffer.sampleRate / factor
  const H = Math.max(1, Math.round(hop * sr))
  const N = Math.round(0.05 * sr) // 50ms の窓
  const frames = Math.max(0, Math.floor((x.length - N) / H))
  // 声の大きさのしきい（一番大きい所の 3% ＝ 約 -30dB）
  let peak = 0
  for (let i = 0; i < x.length; i += 4) { const v = Math.abs(x[i]); if (v > peak) peak = v }
  const gate = peak * 0.03
  const midi = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    const o = f * H
    let s = 0
    for (let i = 0; i < N; i += 2) s += x[o + i] * x[o + i]
    const rms = Math.sqrt(s / (N / 2))
    if (rms < gate) continue
    const hz = yinFrame(x, sr, { start: o, length: N })
    if (hz >= 70 && hz <= 1100) midi[f] = hzToMidi(hz)
  }
  // 5フレームの中央値で、とびはね（1オクターブまちがいなど）をならす
  const out = new Float32Array(frames)
  const win = []
  for (let f = 0; f < frames; f++) {
    if (!midi[f]) continue
    win.length = 0
    for (let k = -2; k <= 2; k++) { const v = midi[f + k]; if (v) win.push(v) }
    win.sort((a, b) => a - b)
    out[f] = win[Math.floor(win.length / 2)]
  }
  return { hop: H / sr, midi: out }
}

// ---------- キー（調）を推定する ----------

function fftMag(re) {
  // 2の累乗の長さの実数 → 大きさ（半分まで）
  const n = re.length
  const im = new Float32Array(n)
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k
        const b = a + len / 2
        const tr = re[b] * cr - im[b] * ci
        const ti = re[b] * ci + im[b] * cr
        re[b] = re[a] - tr; im[b] = im[a] - ti
        re[a] += tr; im[a] += ti
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = ncr
      }
    }
  }
  const out = new Float32Array(n / 2)
  for (let k = 0; k < n / 2; k++) out[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k])
  return out
}

// Krumhansl のキーの形（よく使われる音ほど大きい）
const PROFILE = {
  major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  minor: [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
}

function corr(a, b) {
  const n = a.length
  const ma = a.reduce((s, v) => s + v, 0) / n
  const mb = b.reduce((s, v) => s + v, 0) / n
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb)
    da += (a[i] - ma) ** 2
    db += (b[i] - mb) ** 2
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0
}

// オケ → { tonic: 0〜11（ド＝0）, mode: "major"|"minor", confidence: 0〜1 }
export function estimateKey(buffer) {
  const data = toMonoData(buffer)
  const factor = Math.max(1, Math.round(buffer.sampleRate / 11025))
  const x = decimate(data, factor)
  const sr = buffer.sampleRate / factor
  const N = 4096
  const hopN = N * 2
  const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N))
  const chroma = new Float64Array(12)
  const kLo = Math.ceil((55 * N) / sr)
  const kHi = Math.min(N / 2 - 1, Math.floor((1760 * N) / sr))
  const pcOf = new Int8Array(N / 2).fill(-1)
  for (let k = kLo; k <= kHi; k++) pcOf[k] = ((Math.round(hzToMidi((k * sr) / N)) % 12) + 12) % 12
  for (let o = 0; o + N <= x.length; o += hopN) {
    const fr = new Float32Array(N)
    for (let i = 0; i < N; i++) fr[i] = x[o + i] * win[i]
    const mag = fftMag(fr)
    for (let k = kLo; k <= kHi; k++) chroma[pcOf[k]] += Math.sqrt(mag[k])
  }
  const c = Array.from(chroma)
  const scores = []
  ;["major", "minor"].forEach((mode) => {
    for (let t = 0; t < 12; t++) {
      const prof = PROFILE[mode].map((_, i) => PROFILE[mode][(i - t + 12) % 12])
      scores.push({ tonic: t, mode, r: corr(c, prof) })
    }
  })
  scores.sort((a, b) => b.r - a.r)
  const best = scores[0]
  const margin = best.r - scores[1].r
  return { tonic: best.tonic, mode: best.mode, confidence: Math.max(0, Math.min(1, margin * 6 + (best.r - 0.5))), r: best.r }
}

// ---------- どれだけずらすか ----------

// その音（midi）を、調の中の一番近い音に寄せる → { snapped, degree（段の番号）, octave }
function snapToScale(midi, key) {
  const scale = SCALES[key.mode] || SCALES.major
  const rel = midi - key.tonic
  const oct = Math.floor(rel / 12)
  const within = rel - oct * 12
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < scale.length; i++) {
    for (const o of [-12, 0, 12]) {
      const d = Math.abs(within - (scale[i] + o))
      if (d < bestD) { bestD = d; best = i + (o / 12) * scale.length }
    }
  }
  const degree = best + oct * scale.length
  return { degree, snapped: degreeToMidi(degree, key) }
}

function degreeToMidi(degree, key) {
  const scale = SCALES[key.mode] || SCALES.major
  const n = scale.length
  const o = Math.floor(degree / n)
  const i = ((degree % n) + n) % n
  return key.tonic + o * 12 + scale[i]
}

// フレームごとの「ハモリにするには何半音ずらすか」（声がないフレームは NaN）
export function harmonySemitones(pitch, key, intervalId) {
  const iv = intervalInfo(intervalId)
  const out = new Float32Array(pitch.midi.length).fill(NaN)
  let last = NaN
  pitch.midi.forEach((m, f) => {
    if (!m) return
    let s
    if (iv.semis !== undefined) s = iv.semis
    else {
      const sn = snapToScale(m, key)
      s = degreeToMidi(sn.degree + iv.steps, key) - sn.snapped // 調に沿った半音の数（整数）
    }
    // 音がころころ変わらないように、0.03秒より短い変化は前の値のまま
    out[f] = s
    last = s
  })
  // 短いとびはねをならす（前後が同じなら、まん中もそれにそろえる）
  for (let f = 1; f < out.length - 1; f++) {
    if (!Number.isNaN(out[f - 1]) && out[f - 1] === out[f + 1] && out[f] !== out[f - 1]) out[f] = out[f - 1]
  }
  void last
  return out
}

// ハモる音（midi）。録音中のガイドに使う（声がないなら 0）
export function harmonyTargetAt(pitch, key, intervalId, sec) {
  if (!pitch) return 0
  const f = Math.round(sec / pitch.hop)
  const m = pitch.midi[f]
  if (!m) return 0
  const iv = intervalInfo(intervalId)
  if (iv.semis !== undefined) return Math.round(m) + iv.semis
  const sn = snapToScale(m, key)
  return degreeToMidi(sn.degree + iv.steps, key)
}

// 🎹 ガイドメロディ（K36）：ハモる音を「音符」に分ける → [{ start, end, midi }]（秒・声の時間）
// 同じ音が続く所を1つの音符にする。短い切れ目（maxGap 秒以下）はつなげ、短すぎる音（minLen 秒未満）は捨てる
export function harmonyNotes(pitch, key, intervalId, { minLen = 0.08, maxGap = 0.04 } = {}) {
  if (!pitch) return []
  const iv = intervalInfo(intervalId)
  const hop = pitch.hop
  const target = (m) => {
    if (!m) return 0
    if (iv.semis !== undefined) return Math.round(m) + iv.semis
    const sn = snapToScale(m, key)
    return degreeToMidi(sn.degree + iv.steps, key)
  }
  const notes = []
  let cur = null
  let gap = 0
  for (let f = 0; f < pitch.midi.length; f++) {
    const t = target(pitch.midi[f])
    if (!t) {
      if (cur) {
        gap++
        if (gap * hop > maxGap) { notes.push(cur); cur = null; gap = 0 }
      }
      continue
    }
    if (cur && cur.midi === t) { cur.end = (f + 1) * hop; gap = 0; continue }
    // 一瞬だけ別の音（1フレーム）になったのは、前の音のまま
    if (cur && f + 1 < pitch.midi.length && target(pitch.midi[f + 1]) === cur.midi) { cur.end = (f + 1) * hop; continue }
    if (cur) notes.push(cur)
    cur = { start: f * hop, end: (f + 1) * hop, midi: t }
    gap = 0
  }
  if (cur) notes.push(cur)
  return notes.filter((n) => n.end - n.start >= minLen)
}

// 🐸 ケロケロ風：一番近い「調の音」までの差（amount 0〜1 で寄せる強さ）
export function keroSemitones(pitch, key, amount = 1) {
  const out = new Float32Array(pitch.midi.length).fill(NaN)
  pitch.midi.forEach((m, f) => {
    if (!m) return
    const target = key ? snapToScale(m, key).snapped : Math.round(m)
    out[f] = (target - m) * amount
  })
  return out
}

// ---------- 音程を変える（長さは変えない） ----------

// 🎶 ハモリの声（K29）：同じ量だけずらす所（＝1つの音符）ごとに切り分けて、
// オケのキー変更と同じ方式（shiftChannels＝WSOLA）でずらし、境目は30msずつ重ねてつなぐ。
// 声がない所（長い息つぎ・間奏）は無音。shiftChannels(channels, sr, semitones) → 同じ長さの channels
export function harmonyVoice(ctx, buffer, semis, hop, shiftChannels) {
  const src = toMonoData(buffer)
  const sr = buffer.sampleRate
  const len = src.length
  const n = semis.length
  const vals = Array.from(semis)
  // 子音などの短いすき間（0.06秒まで）は、前の音のつづきにする
  const gapMax = Math.round(0.06 / hop)
  for (let f = 0; f < n; f++) {
    if (!Number.isNaN(vals[f])) continue
    let g = f
    while (g < n && Number.isNaN(vals[g])) g++
    if (f > 0 && g < n && g - f <= gapMax) for (let k = f; k < g; k++) vals[k] = vals[f - 1]
    f = g
  }
  // 同じ値が続く所＝1つの区切り。短すぎる区切り（0.08秒未満）は前の区切りにまぜる
  const runs = []
  for (let f = 0; f < n;) {
    let g = f
    while (g < n && (vals[g] === vals[f] || (Number.isNaN(vals[g]) && Number.isNaN(vals[f])))) g++
    runs.push({ a: f, b: g, s: vals[f] })
    f = g
  }
  const minLen = Math.round(0.08 / hop)
  const merged = []
  runs.forEach((r) => {
    const last = merged[merged.length - 1]
    if (last && !Number.isNaN(r.s) && !Number.isNaN(last.s) && (r.b - r.a < minLen) && last.b === r.a) { last.b = r.b; return }
    merged.push({ ...r })
  })
  const out = new Float32Array(len)
  const P = Math.round(0.03 * sr) // 境目を重ねる長さ
  const ramp = (o, from, to) => (o <= from ? 0 : o >= to ? 1 : 0.5 - 0.5 * Math.cos((Math.PI * (o - from)) / (to - from)))
  merged.forEach((r) => {
    if (Number.isNaN(r.s)) return
    const S = Math.round(r.a * hop * sr)
    const E = Math.min(len, Math.round(r.b * hop * sr))
    const a = Math.max(0, S - P)
    const b = Math.min(len, E + P)
    if (b - a < 16) return
    const piece = src.slice(a, b)
    const shifted = r.s === 0 ? piece : shiftChannels([piece], sr, r.s)[0]
    for (let o = a; o < b; o++) {
      const w = ramp(o, S - P, S + P) * (1 - ramp(o, E - P, E + P))
      if (w > 0) out[o] += (shifted[o - a] || 0) * w
    }
  })
  const buf = ctx.createBuffer(1, len, sr)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.max(-1, Math.min(1, out[i]))
  return buf
}

// 🐸 ケロケロ風などの「少しずつ変わる」ずらし：短い粒を読み直して重ねる（ロボっぽさが少し出る）
// 短い粒（約46ms）を、その粒のまん中を中心に速さ r で読み直して重ねる → 音程だけ変わる。
// semis[f]：フレーム f（hop 秒ごと）のずらす量。NaN の所は silentWhenUnvoiced なら無音、そうでなければそのまま
export function shiftPitchCurve(ctx, buffer, semis, hop, { silentWhenUnvoiced = false } = {}) {
  const src = toMonoData(buffer)
  const sr = buffer.sampleRate
  const len = src.length
  const N = Math.max(256, Math.round(0.046 * sr))
  const H = Math.round(N / 4)
  const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N))
  const out = new Float32Array(len)
  const norm = new Float32Array(len)
  const frames = semis.length
  const semiAt = (sample) => {
    const f = Math.min(frames - 1, Math.max(0, Math.round(sample / sr / hop)))
    let s = semis[f]
    if (Number.isNaN(s)) {
      // 近く（0.06秒以内）に声があれば、その量を使う（子音・息の所で切れないように）
      const reach = Math.round(0.06 / hop)
      for (let k = 1; k <= reach && Number.isNaN(s); k++) {
        if (f - k >= 0 && !Number.isNaN(semis[f - k])) s = semis[f - k]
        else if (f + k < frames && !Number.isNaN(semis[f + k])) s = semis[f + k]
      }
    }
    return s
  }
  for (let start = -Math.floor(N / 2); start < len; start += H) {
    const center = start + N / 2
    const s = semiAt(center)
    const gain = Number.isNaN(s) ? (silentWhenUnvoiced ? 0 : 1) : 1
    const r = Number.isNaN(s) ? 1 : Math.pow(2, s / 12)
    for (let i = 0; i < N; i++) {
      const o = start + i
      if (o < 0 || o >= len) continue
      const w = win[i]
      norm[o] += w
      if (gain === 0) continue
      const p = center + (i - N / 2) * r
      const p0 = Math.floor(p)
      if (p0 < 0 || p0 + 1 >= len) continue
      const fr = p - p0
      out[o] += (src[p0] * (1 - fr) + src[p0 + 1] * fr) * w
    }
  }
  const buf = ctx.createBuffer(1, len, sr)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = norm[i] > 1e-3 ? Math.max(-1, Math.min(1, out[i] / norm[i])) : 0
  return buf
}
