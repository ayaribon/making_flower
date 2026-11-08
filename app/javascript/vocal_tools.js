// 🎤 歌ってみた：音の計算だけをまとめた部品（画面は触らない）
// - 音の立ち上がり（ピッ・手拍子）を見つける
// - 声とオケを比べて、ずれを探す
// - ノイズ消し（ローカット → 雑音を引く → ノイズゲート）

// ---------- 基本 ----------

// 何チャンネルあっても1本（モノラル）にする
export function toMono(buffer) {
  const n = buffer.length
  const ch = buffer.numberOfChannels
  if (ch === 1) return buffer.getChannelData(0).slice()
  const out = new Float32Array(n)
  for (let c = 0; c < ch; c++) {
    const d = buffer.getChannelData(c)
    for (let i = 0; i < n; i++) out[i] += d[i] / ch
  }
  return out
}

// frameSec ごとの音の大きさ（RMS）
export function rmsFrames(data, sr, frameSec) {
  const size = Math.max(1, Math.round(sr * frameSec))
  const n = Math.floor(data.length / size)
  const out = new Float32Array(n)
  for (let f = 0; f < n; f++) {
    let s = 0
    const o = f * size
    for (let i = 0; i < size; i++) { const x = data[o + i]; s += x * x }
    out[f] = Math.sqrt(s / size)
  }
  return out
}

// startSec〜endSec の音の大きさ（RMS）
export function rmsOf(data, sr, startSec, endSec) {
  const a = Math.max(0, Math.floor(startSec * sr))
  const b = Math.min(data.length, Math.floor(endSec * sr))
  if (b <= a) return 0
  let s = 0
  for (let i = a; i < b; i++) s += data[i] * data[i]
  return Math.sqrt(s / (b - a))
}

// 先頭 sec 秒を切り落とした AudioBuffer を作る（短すぎたら null）
export function trimBuffer(ctx, buffer, sec) {
  const start = Math.max(0, Math.round(sec * buffer.sampleRate))
  const len = buffer.length - start
  if (len <= 0) return null
  if (start === 0) return buffer
  const out = ctx.createBuffer(buffer.numberOfChannels, len, buffer.sampleRate)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    out.getChannelData(c).set(buffer.getChannelData(c).subarray(start))
  }
  return out
}

// ---------- 立ち上がりを見つける ----------

// fromSec〜toSec の中で、音が急に大きくなった最初の位置（秒）。見つからなければ null
// floorRms＝部屋の雑音の大きさ。これより十分大きい音だけを「ピッ」「手拍子」とみなす
export function findOnset(data, sr, fromSec, toSec, floorRms) {
  const size = Math.max(1, Math.round(sr * 0.001)) // 1ms ごと
  const from = Math.max(0, Math.floor((fromSec * sr) / size))
  const to = Math.min(Math.floor(data.length / size), Math.ceil((toSec * sr) / size))
  if (to <= from) return null

  const env = new Float32Array(to - from)
  let peak = 0
  for (let f = from; f < to; f++) {
    let s = 0
    const o = f * size
    for (let i = 0; i < size; i++) { const x = data[o + i] || 0; s += x * x }
    const r = Math.sqrt(s / size)
    env[f - from] = r
    if (r > peak) peak = r
  }

  const floor = Math.max(floorRms || 0, 1e-4)
  if (peak < floor * 8) return null // 雑音と区別できるほど大きい音がない
  const threshold = Math.max(floor * 4, peak * 0.25)
  for (let i = 0; i < env.length; i++) {
    if (env[i] >= threshold) return ((from + i) * size) / sr
  }
  return null
}

// ---------- 声とオケを比べる ----------

// 「音が大きくなった瞬間」の並び（5ms ごと）
function onsetCurve(data, sr, hopSec, maxSec) {
  const part = data.subarray(0, Math.min(data.length, Math.round(maxSec * sr)))
  const env = rmsFrames(part, sr, hopSec)
  const out = new Float32Array(env.length)
  let prev = 0
  for (let i = 0; i < env.length; i++) {
    const v = Math.sqrt(env[i])
    out[i] = Math.max(0, v - prev)
    prev = v
  }
  let mean = 0
  for (let i = 0; i < out.length; i++) mean += out[i]
  mean /= out.length || 1
  for (let i = 0; i < out.length; i++) out[i] -= mean
  return out
}

// 声がオケより何秒遅れているか（lagSec。マイナスなら早い）と、一致度 score（0〜1）
// 声に音もれや手拍子が入っていないと score が低くなる
export function estimateLag(vocal, backing, sr, maxLagSec = 1) {
  const hop = 0.005
  const maxSec = 60 // 頭の60秒だけで比べる（重くしないため）
  const v = onsetCurve(vocal, sr, hop, maxSec + maxLagSec)
  const b = onsetCurve(backing, sr, hop, maxSec)
  const maxLag = Math.round(maxLagSec / hop)

  let nb = 0
  let nv = 0
  for (let i = 0; i < b.length; i++) nb += b[i] * b[i]
  for (let i = 0; i < v.length; i++) nv += v[i] * v[i]
  if (!nb || !nv) return null

  let best = -Infinity
  let bestLag = 0
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let s = 0
    const i0 = Math.max(0, -lag)
    const i1 = Math.min(b.length, v.length - lag)
    for (let i = i0; i < i1; i++) s += b[i] * v[i + lag]
    if (s > best) { best = s; bestLag = lag }
  }
  return { lagSec: bestLag * hop, score: best / Math.sqrt(nb * nv) }
}

// 一番静かな lenSec 秒を探す（ファイルの声から部屋の雑音を覚える用）
// 完全な無音（データが 0）の所は雑音の手がかりにならないので飛ばす
export function findQuietRange(data, sr, lenSec = 1) {
  const frame = 0.05
  const env = rmsFrames(data, sr, frame)
  const w = Math.max(1, Math.round(lenSec / frame))
  if (env.length <= w) return [0, data.length / sr]

  let sum = 0
  for (let i = 0; i < w; i++) sum += env[i]
  let best = Infinity
  let at = 0
  for (let i = w; i <= env.length; i++) {
    if (sum > w * 1e-5 && sum < best) { best = sum; at = i - w }
    if (i < env.length) sum += env[i] - env[i - w]
  }
  return [at * frame, (at + w) * frame]
}

// ---------- ノイズ消し ----------

// 低い「ブーン」を切る（2次のハイパスフィルター）。data をそのまま書き換える
function highpass(data, sr, freq) {
  const w = (2 * Math.PI * freq) / sr
  const alpha = Math.sin(w) / (2 * Math.SQRT1_2)
  const c = Math.cos(w)
  const a0 = 1 + alpha
  const b0 = (1 + c) / 2 / a0
  const b1 = -(1 + c) / a0
  const b2 = (1 + c) / 2 / a0
  const a1 = (-2 * c) / a0
  const a2 = (1 - alpha) / a0
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < data.length; i++) {
    const x0 = data[i]
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1; x1 = x0; y2 = y1; y1 = y0
    data[i] = y0
  }
}

// 周波数に分ける計算（FFT）。n は 2 のべき乗
function makeFFT(n) {
  const levels = Math.log2(n)
  const rev = new Uint32Array(n)
  for (let i = 0; i < n; i++) {
    let r = 0
    for (let b = 0; b < levels; b++) r = (r << 1) | ((i >> b) & 1)
    rev[i] = r
  }
  const cos = new Float64Array(n / 2)
  const sin = new Float64Array(n / 2)
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n)
    sin[i] = Math.sin((2 * Math.PI * i) / n)
  }
  return (re, im) => {
    for (let i = 0; i < n; i++) {
      const j = rev[i]
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t
        t = im[i]; im[i] = im[j]; im[j] = t
      }
    }
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2
      const step = n / size
      for (let i = 0; i < n; i += size) {
        for (let j = 0; j < half; j++) {
          const k = j * step
          const p = i + j
          const q = p + half
          const tr = re[q] * cos[k] + im[q] * sin[k]
          const ti = im[q] * cos[k] - re[q] * sin[k]
          re[q] = re[p] - tr
          im[q] = im[p] - ti
          re[p] += tr
          im[p] += ti
        }
      }
    }
  }
}

// 歌っていない所を小さくする（ノイズゲート）。出だしは速く開き、切れ際はゆっくり閉じる
function noiseGate(y, sr, s, floorRms) {
  const threshold = Math.max(floorRms * (2 + s * 3), 1e-4)
  const minGain = 1 - s * 0.9 // 強さ50で 0.55、100で 0.1
  const frame = Math.max(1, Math.round(sr * 0.005))
  const env = rmsFrames(y, sr, 0.005)
  const aOpen = 1 - Math.exp(-1 / (sr * 0.005))
  const aClose = 1 - Math.exp(-1 / (sr * 0.15))
  const holdFrames = 20 // 100ms は開けたまま
  let g = minGain
  let hold = 0

  for (let f = 0; f * frame < y.length; f++) {
    // 10ms 先まで見て、歌い出しが切れないようにする
    const loud = (env[f] || 0) >= threshold || (env[f + 1] || 0) >= threshold || (env[f + 2] || 0) >= threshold
    if (loud) hold = holdFrames
    else if (hold > 0) hold--
    const target = hold > 0 ? 1 : minGain
    const end = Math.min(y.length, (f + 1) * frame)
    for (let i = f * frame; i < end; i++) {
      g += (target - g) * (target > g ? aOpen : aClose)
      y[i] *= g
    }
  }
}

// ノイズ消し：ローカット80Hz → 覚えた雑音を周波数ごとに引く → ノイズゲート
// strength 0〜100。noiseStart〜noiseEnd（秒）が「部屋の雑音だけ」の部分
// 戻り値はモノラルの AudioBuffer（元の buffer は書き換えない）
export function denoise(ctx, buffer, { strength = 50, noiseStart = 0, noiseEnd = 1 } = {}) {
  const sr = buffer.sampleRate
  const s = Math.max(0, Math.min(100, strength)) / 100
  const x = toMono(buffer)
  highpass(x, sr, 80)

  const N = 1024
  const hop = 256
  const bins = N / 2 + 1
  const fft = makeFFT(N)
  const win = new Float64Array(N)
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N)
  const re = new Float64Array(N)
  const im = new Float64Array(N)

  // 雑音の形（周波数ごとの大きさの平均）を覚える
  const noise = new Float64Array(bins)
  let count = 0
  const a = Math.max(0, Math.floor(noiseStart * sr))
  const e = Math.min(x.length - N, Math.floor(noiseEnd * sr) - N)
  for (let o = a; o <= e; o += hop) {
    for (let i = 0; i < N; i++) { re[i] = x[o + i] * win[i]; im[i] = 0 }
    fft(re, im)
    for (let k = 0; k < bins; k++) noise[k] += Math.hypot(re[k], im[k])
    count++
  }

  let y
  if (count > 0) {
    for (let k = 0; k < bins; k++) noise[k] /= count
    const over = 1 + s * 2 // どれだけ多めに引くか
    const floorGain = Math.max(0.05, 0.3 - s * 0.25) // 引きすぎてロボット声にならないための下限
    const prevGain = new Float64Array(bins).fill(1)
    const out = new Float32Array(x.length + N)

    for (let o = 0; o < x.length; o += hop) {
      for (let i = 0; i < N; i++) { re[i] = (x[o + i] || 0) * win[i]; im[i] = 0 }
      fft(re, im)
      for (let k = 0; k < bins; k++) {
        const mag = Math.hypot(re[k], im[k]) + 1e-12
        let g = 1 - (over * noise[k]) / mag
        if (g < floorGain) g = floorGain
        g = 0.7 * g + 0.3 * prevGain[k] // 急に変わるとシュワシュワ音が出るのでならす
        prevGain[k] = g
        re[k] *= g
        im[k] *= g
        if (k > 0 && k < N / 2) { re[N - k] *= g; im[N - k] *= g }
      }
      // 逆変換（共役 → FFT → 共役 ÷ N）
      for (let i = 0; i < N; i++) im[i] = -im[i]
      fft(re, im)
      for (let i = 0; i < N; i++) out[o + i] += ((re[i] / N) * win[i]) / 1.5
    }
    y = out.subarray(0, x.length)
  } else {
    y = x // 雑音の部分が短すぎて覚えられないときは、ローカットとゲートだけ
  }

  noiseGate(y, sr, s, rmsOf(y, sr, noiseStart, noiseEnd))

  const result = ctx.createBuffer(1, x.length, sr)
  result.getChannelData(0).set(y)
  return result
}
