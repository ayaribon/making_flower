// 🎤 歌ってみた：音の計算だけをまとめた部品（画面は触らない）
// - 音の立ち上がり（ピッ・手拍子）を見つける
// - 声とオケを比べて、ずれを探す
// - ノイズ消し（ローカット → 雑音を引く → ノイズゲート）
// - 途中から録り直した部分の差し替え、波形の表示用データ

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
// sec がマイナスなら、そのぶん頭に無音を足す（音を後ろにずらす）
export function trimBuffer(ctx, buffer, sec) {
  const start = Math.round(sec * buffer.sampleRate)
  if (start === 0) return buffer
  const len = buffer.length - start
  if (len <= 0) return null
  const out = ctx.createBuffer(buffer.numberOfChannels, len, buffer.sampleRate)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    if (start > 0) out.getChannelData(c).set(buffer.getChannelData(c).subarray(start))
    else out.getChannelData(c).set(buffer.getChannelData(c), -start)
  }
  return out
}

// ---------- 途中から録り直す（F2-22） ----------

// base の startSec〜endSec を take で差し替えた新しい AudioBuffer を返す（base は書き換えない）
// take の 0 秒目＝ base の startSec。endSec が null なら take の長さぶん差し替える
// つなぎ目は fadeSec かけて元の声と入れ替える（プツッと鳴らないように）
export function spliceTake(ctx, base, take, startSec, endSec = null, fadeSec = 0.02) {
  const sr = base.sampleRate
  const ch = base.numberOfChannels
  const s = Math.max(0, Math.round(startSec * sr))
  let e = s + take.length
  if (endSec !== null) e = Math.min(e, Math.round(endSec * sr))
  if (e <= s) return base

  const len = Math.max(base.length, e)
  const out = ctx.createBuffer(ch, len, sr)
  const f = Math.max(1, Math.round(fadeSec * sr))
  for (let c = 0; c < ch; c++) {
    const b = base.getChannelData(c)
    const t = take.getChannelData(Math.min(c, take.numberOfChannels - 1))
    const o = out.getChannelData(c)
    o.set(b)
    for (let i = s; i < e; i++) {
      const k = i - s
      let w = 1
      if (k < f) w = k / f                              // 入り：元の声 → 録り直し
      if (e < base.length && e - i <= f) w = Math.min(w, (e - i) / f) // 出：録り直し → 元の声
      const old = i < b.length ? b[i] : 0
      o[i] = old * (1 - w) + t[k] * w
    }
  }
  return out
}

// 波形の表示用：count 個の区間ごとの一番大きい振れ幅（0〜1）
export function waveformPeaks(buffer, count = 1000) {
  const out = new Float32Array(count)
  if (!buffer) return out
  const d = buffer.getChannelData(0)
  const size = Math.max(1, Math.floor(d.length / count))
  for (let p = 0; p < count; p++) {
    let m = 0
    const o = p * size
    const end = Math.min(d.length, o + size)
    for (let i = o; i < end; i++) { const v = Math.abs(d[i]); if (v > m) m = v }
    out[p] = Math.min(1, m)
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
// strength 0〜100。雑音は noiseBuffer（なければ buffer）の noiseStart〜noiseEnd（秒）から覚える
// ※ 頭を切った声や、途中で録り直した声でも、最初の録音の「静かな部分」を使えるように noiseBuffer を分けた
// 戻り値はモノラルの AudioBuffer（元の buffer は書き換えない）
export function denoise(ctx, buffer, { strength = 50, noiseStart = 0, noiseEnd = 1, noiseBuffer = null } = {}) {
  const sr = buffer.sampleRate
  const s = Math.max(0, Math.min(100, strength)) / 100
  const x = toMono(buffer)
  highpass(x, sr, 80)
  let nx = x
  if (noiseBuffer && noiseBuffer !== buffer) {
    nx = toMono(noiseBuffer)
    highpass(nx, noiseBuffer.sampleRate, 80)
  }

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
  const e = Math.min(nx.length - N, Math.floor(noiseEnd * sr) - N)
  for (let o = a; o <= e; o += hop) {
    for (let i = 0; i < N; i++) { re[i] = nx[o + i] * win[i]; im[i] = 0 }
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

  // ゲートの基準：雑音を引いたあとは雑音が小さくなっているので、引く前の大きさの半分にする
  const preFloor = rmsOf(nx, sr, noiseStart, noiseEnd)
  noiseGate(y, sr, s, count > 0 ? preFloor * 0.5 : preFloor)

  const result = ctx.createBuffer(1, x.length, sr)
  result.getChannelData(0).set(y)
  return result
}

// ---------- おまかせ用の分析（音楽の知識がなくても使えるように） ----------

// 鳴っている所だけの大きさ。rms＝平均の大きさ、peak＝一番大きい振れ幅、
// spreadDb＝大きい所と小さい所の差（dB。大きいほど声量のばらつきが大きい）
// brightness＝高い音の多さの目安（0〜1くらい。小さいほどこもった声）
export function analyzeLevels(buffer) {
  const x = toMono(buffer)
  const sr = buffer.sampleRate
  const env = rmsFrames(x, sr, 0.05)
  let peak = 0
  for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > peak) peak = v }
  let max = 0
  for (let i = 0; i < env.length; i++) if (env[i] > max) max = env[i]
  const active = Array.from(env).filter((v) => v > max * 0.1 && v > 1e-4)
  if (!active.length) return { rms: 0, peak, spreadDb: 0, brightness: 0.5, activeSec: 0 }
  let ms = 0
  active.forEach((v) => { ms += v * v })
  const rms = Math.sqrt(ms / active.length)
  const sorted = active.slice().sort((a, b) => a - b)
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
  const spreadDb = 20 * Math.log10(q(0.9) / Math.max(q(0.3), 1e-6))
  // となりの値との差の大きさ ÷ 元の大きさ（高い音が多いほど大きい）
  let d = 0
  let s = 0
  for (let i = 1; i < x.length; i += 2) { const a = x[i] - x[i - 1]; d += a * a; s += x[i] * x[i] }
  const brightness = s > 0 ? Math.sqrt(d / s) : 0.5
  return { rms, peak, spreadDb, brightness, activeSec: active.length * 0.05 }
}

// オケの盛り上がっている所（サビっぽい所）を探す。[{ startSec, endSec }]
// 「まわりより音が大きい時間が8秒以上続く所」をサビ候補にする（決め打ちの目安）
export function suggestChoruses(buffer, { maxCount = 4 } = {}) {
  const x = toMono(buffer)
  const sr = buffer.sampleRate
  const frame = 0.5
  const env = rmsFrames(x, sr, frame)
  if (env.length < 40) return [] // 20秒より短い曲は分けない
  // 8秒の幅でならす
  const w = 16
  const smooth = new Float32Array(env.length)
  for (let i = 0; i < env.length; i++) {
    let sum = 0
    let n = 0
    for (let j = Math.max(0, i - w / 2); j < Math.min(env.length, i + w / 2); j++) { sum += env[j]; n++ }
    smooth[i] = sum / n
  }
  const sorted = Array.from(smooth).sort((a, b) => a - b)
  const th = sorted[Math.floor(sorted.length * 0.68)]
  let regions = []
  let start = null
  for (let i = 0; i <= smooth.length; i++) {
    const on = i < smooth.length && smooth[i] >= th
    if (on && start === null) start = i
    if (!on && start !== null) { regions.push([start * frame, i * frame]); start = null }
  }
  // 3秒より短いすき間はつなぐ → 8秒より短いものは捨てる
  regions = regions.reduce((acc, r) => {
    const last = acc[acc.length - 1]
    if (last && r[0] - last[1] < 3) last[1] = r[1]
    else acc.push([...r])
    return acc
  }, []).filter((r) => r[1] - r[0] >= 8)
  // 大きい順に maxCount 個 → 時間順
  const energy = (r) => {
    let s = 0
    for (let i = Math.floor(r[0] / frame); i < Math.ceil(r[1] / frame) && i < env.length; i++) s += env[i]
    return s / ((r[1] - r[0]) / frame)
  }
  return regions
    .sort((a, b) => energy(b) - energy(a))
    .slice(0, maxCount)
    .sort((a, b) => a[0] - b[0])
    .map(([s, e]) => ({ startSec: s, endSec: Math.min(e, buffer.duration) }))
}

// 書き出しの最後に、聴きやすい大きさにそろえる（元の buffer を書き換える）
// targetDb＝鳴っている所の平均の大きさの目安。ピークが ceiling を超えないところで止める
export function normalizeLoudness(buffer, { targetDb = -16, ceiling = 0.89 } = {}) {
  const { rms, peak } = analyzeLevels(buffer)
  if (!rms || !peak) return 1
  const gain = Math.min(Math.pow(10, targetDb / 20) / rms, ceiling / peak, 4)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c)
    for (let i = 0; i < d.length; i++) d[i] *= gain
  }
  return gain
}

// ---------- 速さ・音の高さを変える（WSOLA：波形を少しずつ重ねて伸び縮みさせる） ----------

// 速さだけ変える（音の高さはそのまま）。rate＞1 で速く（短く）、rate＜1 でゆっくり（長く）
// channels＝Float32Array の配列。左右は同じ位置で切り貼りする（ステレオがずれないように）
export function timeStretchChannels(channels, sr, rate) {
  const x0 = channels[0]
  if (Math.abs(rate - 1) < 1e-4) return channels.map((c) => c.slice())
  const N = Math.max(256, Math.round(sr * 0.04) & ~1) // 1つの切れ端（40ms）
  const Hs = N / 2                                       // 出力側の間隔
  const Ha = Hs * rate                                   // 入力側の間隔
  const delta = Math.round(sr * 0.012)                   // つなぎ目を合わせるために探す幅
  const outLen = Math.max(1, Math.ceil(x0.length / rate))
  const win = new Float32Array(N)
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N)

  // 探す用のモノラル
  let mono = x0
  if (channels.length > 1) {
    mono = new Float32Array(x0.length)
    channels.forEach((c) => { for (let i = 0; i < c.length; i++) mono[i] += c[i] / channels.length })
  }
  const at = (i) => (i >= 0 && i < mono.length ? mono[i] : 0)

  const outs = channels.map(() => new Float32Array(outLen + N))
  const norm = new Float32Array(outLen + N)
  let prev = 0
  for (let m = 0; m * Hs < outLen; m++) {
    const target = Math.round(m * Ha)
    let pos = target
    if (m > 0) {
      // 前の切れ端の「自然な続き」と一番よく似ている位置を探す（粗く → 細かく）
      const nat = prev + Hs
      const score = (p, step) => {
        let s = 0
        for (let i = 0; i < N; i += step) s += at(p + i) * at(nat + i)
        return s
      }
      let best = -Infinity
      for (let p = target - delta; p <= target + delta; p += 4) {
        const v = score(p, 8)
        if (v > best) { best = v; pos = p }
      }
      const c0 = pos
      best = -Infinity
      for (let p = c0 - 3; p <= c0 + 3; p++) {
        const v = score(p, 2)
        if (v > best) { best = v; pos = p }
      }
      if (pos < 0) pos = 0
    }
    const o = m * Hs
    for (let c = 0; c < channels.length; c++) {
      const x = channels[c]
      const out = outs[c]
      for (let i = 0; i < N; i++) {
        const j = pos + i
        if (j < x.length) out[o + i] += x[j] * win[i]
      }
    }
    for (let i = 0; i < N; i++) norm[o + i] += win[i]
    prev = pos
  }
  return outs.map((out) => {
    const r = new Float32Array(outLen)
    for (let i = 0; i < outLen; i++) r[i] = norm[i] > 1e-3 ? out[i] / norm[i] : out[i]
    return r
  })
}

// 読む速さを変えて並べ直す（高さも速さも factor 倍）。長さは length にする
function resampleChannels(channels, factor, length) {
  return channels.map((x) => {
    const out = new Float32Array(length)
    for (let i = 0; i < length; i++) {
      const p = i * factor
      const k = Math.floor(p)
      if (k + 1 >= x.length) { out[i] = k < x.length ? x[k] : 0; continue }
      const f = p - k
      out[i] = x[k] * (1 - f) + x[k + 1] * f
    }
    return out
  })
}

// キー（半音）と速さ（rate）を一緒に変える。cents で半音より細かく（100セント＝半音）
// やり方：速さを rate÷高さ に伸び縮み → 高さ倍で読み直す → 高さは「高さ倍」、速さは「rate 倍」になる
export function changeKeyTempoChannels(channels, sr, { semitones = 0, rate = 1 } = {}) {
  const f = Math.pow(2, semitones / 12)
  if (Math.abs(f - 1) < 1e-5) return timeStretchChannels(channels, sr, rate)
  const stretched = timeStretchChannels(channels, sr, rate / f)
  const length = Math.max(1, Math.round(channels[0].length / rate))
  return resampleChannels(stretched, f, length)
}

export function bufferToChannels(buffer) {
  const list = []
  for (let c = 0; c < buffer.numberOfChannels; c++) list.push(buffer.getChannelData(c))
  return list
}

export function channelsToBuffer(ctx, channels, sr) {
  const out = ctx.createBuffer(channels.length, Math.max(1, channels[0].length), sr)
  channels.forEach((d, c) => out.getChannelData(c).set(d.subarray(0, out.length)))
  return out
}

// AudioBuffer 全体のキー・速さを変える（オケのキー変更など）
export function changeKeyTempo(ctx, buffer, opts) {
  if ((!opts.semitones || Math.abs(opts.semitones) < 1e-6) && Math.abs((opts.rate || 1) - 1) < 1e-6) return buffer
  return channelsToBuffer(ctx, changeKeyTempoChannels(bufferToChannels(buffer), buffer.sampleRate, opts), buffer.sampleRate)
}

// 範囲を切り出す（コピー用）
export function extractRange(ctx, buffer, startSec, endSec) {
  const sr = buffer.sampleRate
  const a = Math.max(0, Math.round(startSec * sr))
  const b = Math.min(buffer.length, Math.round(endSec * sr))
  if (b <= a) return null
  const out = ctx.createBuffer(buffer.numberOfChannels, b - a, sr)
  for (let c = 0; c < buffer.numberOfChannels; c++) out.getChannelData(c).set(buffer.getChannelData(c).subarray(a, b))
  return out
}

// ---------- 声の波形編集（詳細モード・Audacity の「選んで加工」と同じ考え方） ----------
// edits = [{ type, startSec, endSec, ... }]（声の時間。前の編集を反映したあとの時間）
//   長さが変わらない：silence（無音）/ gain（db）/ fadeIn / fadeOut / pitch（cents：音の高さ）
//   長さが変わる　　：delete（削除）/ tempo（rate：選んだ所の速さ）/ paste（clip を startSec に差し込む）
//   長さが変わらない：overwrite（clip で startSec から上書き）
// 元の buffer は書き換えず、加工したコピーを返す（何回でもやり直せるように）
export function applyEdits(ctx, buffer, edits) {
  if (!edits || !edits.length) return buffer
  const sr = buffer.sampleRate
  let ch = bufferToChannels(buffer).map((d) => d.slice())
  const edge = Math.max(1, Math.round(sr * 0.005)) // つなぎ目は5msかけて（プツッと鳴らないように）
  const len = () => ch[0].length
  const idx = (sec) => Math.max(0, Math.min(len(), Math.round(sec * sr)))
  const clipCh = (clip, c) => clip.getChannelData(Math.min(c, clip.numberOfChannels - 1))

  // a〜b を piece（チャンネルごと）に入れかえる。つなぎ目は短くなめらかに
  const replace = (a, b, pieces) => {
    ch = ch.map((d, c) => {
      const p = pieces[c]
      const out = new Float32Array(a + p.length + (d.length - b))
      out.set(d.subarray(0, a), 0)
      out.set(p, a)
      out.set(d.subarray(b), a + p.length)
      // つなぎ目の前後を少しだけ小さく → 段差を目立たなくする
      ;[a, a + p.length].forEach((j) => {
        for (let k = -edge; k < edge; k++) {
          const i = j + k
          if (i < 0 || i >= out.length) continue
          out[i] *= Math.min(1, Math.abs(k + 0.5) / edge * 0.7 + 0.3)
        }
      })
      return out
    })
  }

  edits.forEach((e) => {
    const a = idx(e.startSec)
    const b = e.type === "paste" || e.type === "overwrite" ? a : idx(e.endSec)
    if (e.type === "paste" && e.clip) {
      replace(a, a, ch.map((_, c) => clipCh(e.clip, c)))
      return
    }
    if (e.type === "overwrite" && e.clip) {
      const n = e.clip.length
      if (a + n > len()) ch = ch.map((d) => { const o = new Float32Array(a + n); o.set(d); return o })
      ch.forEach((d, c) => {
        const src = clipCh(e.clip, c)
        const f = Math.min(Math.round(sr * 0.01), Math.floor(n / 2))
        for (let k = 0; k < n; k++) {
          const w = Math.min(1, (k + 1) / f, (n - k) / f) // 10ms で入れかえ
          d[a + k] = d[a + k] * (1 - w) + src[k] * w
        }
      })
      return
    }
    if (b <= a) return
    if (e.type === "delete") {
      replace(a, b, ch.map(() => new Float32Array(0)))
      return
    }
    if (e.type === "tempo") {
      replace(a, b, timeStretchChannels(ch.map((d) => d.slice(a, b)), sr, e.rate || 1))
      return
    }
    if (e.type === "pitch") {
      // 前後に少し余分を付けて計算 → つなぎ目は10msで元の声と入れかえ
      const m = Math.round(sr * 0.05)
      const a0 = Math.max(0, a - m)
      const b0 = Math.min(len(), b + m)
      const shifted = changeKeyTempoChannels(ch.map((d) => d.slice(a0, b0)), sr, { semitones: (e.cents || 0) / 100 })
      const f = Math.max(1, Math.min(Math.round(sr * 0.01), Math.floor((b - a) / 2)))
      ch.forEach((d, c) => {
        const s = shifted[c]
        for (let i = a; i < b; i++) {
          const w = Math.min(1, (i - a + 1) / f, (b - i) / f)
          d[i] = d[i] * (1 - w) + (s[i - a0] || 0) * w
        }
      })
      return
    }
    const n = b - a
    const target = e.type === "silence" ? 0 : e.type === "gain" ? Math.pow(10, (e.db || 0) / 20) : 1
    ch.forEach((d) => {
      for (let i = a; i < b; i++) {
        const k = i - a
        let g
        if (e.type === "fadeIn") g = k / n
        else if (e.type === "fadeOut") g = 1 - k / n
        else g = 1 + (target - 1) * Math.min(1, k / edge, (b - i) / edge)
        d[i] *= g
      }
    })
  })
  return channelsToBuffer(ctx, ch, sr)
}

// 長さが変わる編集か（このあとの録り直しの位置がずれるので、録り直す前に確定する）
export const SHIFTING_EDITS = Object.freeze(["delete", "tempo", "paste"])

// ---------- 🥁 拍（ビート）とテンポを見つける（MV の演出用・4c） ----------
// 戻り値 { bpm, beats: [秒], energy: Float32Array（0〜1・盛り上がり）, energyHop: 秒, confidence: 0〜1 }
// テンポが一定の曲（オケ）を前提にした、軽い見つけ方：
//   音が大きくなった瞬間の並び → 自己相関で拍の間隔（60〜180 BPM）→ 一番そろう位置に拍を並べる
export function analyzeBeats(buffer) {
  const x = toMono(buffer)
  const sr = buffer.sampleRate
  const size = Math.round(sr * 0.01)
  const hop = size / sr // 1コマの本当の長さ（約10ms。丸めたぶんもそのまま使う → テンポがずれない）
  const n = Math.floor(x.length / size)
  // 低い音（キック・ベース）を強めに見る：簡単なローパスを足す
  const a = Math.exp((-2 * Math.PI * 150) / sr)
  let lp = 0
  const full = new Float32Array(n)
  const low = new Float32Array(n)
  for (let f = 0; f < n; f++) {
    let s = 0
    let sl = 0
    for (let i = f * size; i < (f + 1) * size; i++) {
      const v = x[i]
      lp = a * lp + (1 - a) * v
      s += v * v
      sl += lp * lp
    }
    full[f] = Math.log(1e-6 + Math.sqrt(s / size))
    low[f] = Math.log(1e-6 + Math.sqrt(sl / size))
  }
  const onset = new Float32Array(n)
  for (let f = 1; f < n; f++) onset[f] = Math.max(0, full[f] - full[f - 1]) + 1.5 * Math.max(0, low[f] - low[f - 1])
  // 平均を引いて、目立つ所だけ残す
  let mean = 0
  for (let f = 0; f < n; f++) mean += onset[f]
  mean /= n || 1
  for (let f = 0; f < n; f++) onset[f] = Math.max(0, onset[f] - mean)

  // 盛り上がり（0.1秒ごと・2秒でならす・上から5%を1とする）
  const eStep = Math.round(0.1 / hop)
  const eHop = eStep * hop
  const en = Math.floor(n / eStep)
  const raw = new Float32Array(en)
  for (let i = 0; i < en; i++) {
    let s = 0
    for (let f = i * eStep; f < (i + 1) * eStep; f++) s += Math.exp(full[f])
    raw[i] = s / eStep
  }
  const energy = new Float32Array(en)
  const w = 10
  for (let i = 0; i < en; i++) {
    let s = 0
    let c = 0
    for (let j = Math.max(0, i - w); j < Math.min(en, i + w); j++) { s += raw[j]; c++ }
    energy[i] = s / (c || 1)
  }
  const sorted = Array.from(energy).sort((p, q) => p - q)
  const top = sorted[Math.floor(sorted.length * 0.95)] || 1
  for (let i = 0; i < en; i++) energy[i] = Math.min(1, energy[i] / (top || 1))

  const empty = { bpm: null, beats: [], energy, energyHop: eHop, confidence: 0 }
  if (n < 500) return empty // 5秒より短い

  // 自己相関（曲の真ん中あたり最大90秒で）
  const from = Math.max(0, Math.floor(n / 2) - 4500)
  const to = Math.min(n, from + 9000)
  const minLag = Math.round(60 / 180 / hop)
  const maxLag = Math.round(60 / 60 / hop)
  let bestLag = 0
  let best = -Infinity
  let zero = 0
  for (let f = from; f < to; f++) zero += onset[f] * onset[f]
  const scores = new Float32Array(maxLag + 2)
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0
    for (let f = from; f < to - lag; f++) s += onset[f] * onset[f + lag]
    scores[lag] = s
    // 120 BPM くらいを少しだけ選びやすく（倍・半分のテンポにまちがえにくくする）
    const bpm = 60 / (lag * hop)
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2))
    if (s * prior > best) { best = s * prior; bestLag = lag }
  }
  if (!bestLag || !zero) return empty
  // となりの値で、拍の間隔を細かく（小数）に
  const y0 = scores[bestLag - 1] || 0
  const y1 = scores[bestLag]
  const y2 = scores[bestLag + 1] || 0
  const den = y0 - 2 * y1 + y2
  const lag = bestLag + (den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / den)) : 0)
  const confidence = Math.max(0, Math.min(1, scores[bestLag] / zero))

  // 拍の位置：一番そろうずらし方を探す
  let bestPhase = 0
  let bestPhaseScore = -Infinity
  for (let p = 0; p < Math.ceil(lag); p++) {
    let s = 0
    for (let k = 0; p + k * lag < n; k++) {
      const f = Math.round(p + k * lag)
      s += onset[f] + 0.5 * ((onset[f - 1] || 0) + (onset[f + 1] || 0))
    }
    if (s > bestPhaseScore) { bestPhaseScore = s; bestPhase = p }
  }
  // 仕上げ：拍ごとに近くの一番強い所を探して、まっすぐな線を引き直す（間隔の小さなずれがたまらないように）
  let phase = bestPhase
  let period = lag
  for (let iter = 0; iter < 2; iter++) {
    const win = Math.max(2, Math.round(period * 0.15))
    let sk = 0, st = 0, skk = 0, skt = 0, sw = 0
    for (let k = 0; phase + k * period < n; k++) {
      const c = Math.round(phase + k * period)
      let m = 0
      let at = -1
      for (let f = Math.max(0, c - win); f <= Math.min(n - 1, c + win); f++) if (onset[f] > m) { m = onset[f]; at = f }
      if (at < 0 || m <= 0) continue
      sw += m; sk += m * k; st += m * at; skk += m * k * k; skt += m * k * at
    }
    const d = sw * skk - sk * sk
    if (sw <= 0 || d === 0) break
    period = (sw * skt - sk * st) / d
    phase = (st - period * sk) / sw
    if (!(period > minLag * 0.9 && period < maxLag * 1.1)) { period = lag; phase = bestPhase; break }
  }
  while (phase - period >= 0) phase -= period
  while (phase < 0) phase += period
  const beats = []
  for (let k = 0; phase + k * period < n; k++) beats.push((phase + k * period) * hop)
  return { bpm: 60 / (period * hop), beats, energy, energyHop: eHop, confidence }
}

// ---------- 🪄 曲の構成を推測する（K41・11/10） ----------
// オケの「大きさ」と「音の色（12音のクロマ）のくり返し」から、
// イントロ／Aメロ／Bメロ／サビ／Cメロ／間奏／落ちサビ／ラスサビ／アウトロ の【目安】を出す。
// オケだけでは本当のサビは確実には分からない（あとで手で直す前提）。歌声があれば、声が無い所を間奏などの手がかりにする。
// 戻り値 [{ startSec, endSec, name, confidence }]（曲の時間・時間順・すき間なし）

// 2 の累乗の長さの FFT（その場で書きかえる）
function fftInPlace(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t
      t = im[i]; im[i] = im[j]; im[j] = t
    }
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
}

// 1つの時間の「12音のどれが鳴っているか」（C=0 … B=11）
function chromaAt(x, sr, center, N, win, out) {
  const re = new Float32Array(N)
  const im = new Float32Array(N)
  const o = Math.max(0, Math.min(x.length - N, Math.round(center - N / 2)))
  for (let i = 0; i < N; i++) re[i] = (x[o + i] || 0) * win[i]
  fftInPlace(re, im)
  for (let k = 1; k < N / 2; k++) {
    const f = (k * sr) / N
    if (f < 80 || f > 5000) continue
    const midi = 69 + 12 * Math.log2(f / 440)
    const pc = ((Math.round(midi) % 12) + 12) % 12
    out[pc] += Math.log(1 + Math.hypot(re[k], im[k]))
  }
}

export function estimateStructure(backing, { beats = null, vocal = null, vocalOffsetSec = 0, debug = false } = {}) {
  if (!backing) return []
  const x = toMono(backing)
  const sr = backing.sampleRate
  const dur = backing.duration
  if (dur < 30) return [] // 短すぎる曲は分けない

  // 1) 小さな区切り：1秒ずつ（長い曲は2秒）。拍の見つけ方がずれていても崩れないように、拍は最後に切れ目を合わせるときだけ使う
  const step = dur > 420 ? 2 : 1
  const grid = []
  for (let t = 0; t < dur - 0.5; t += step) grid.push(t)
  grid.push(dur)
  const nb = grid.length - 1
  if (nb < 16) return []

  // 2) 小節ごとの音の色（クロマ）と大きさ
  const N = sr > 32000 ? 4096 : 2048
  const win = new Float32Array(N)
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1))
  const chroma = []
  const energy = new Float32Array(nb)
  for (let b = 0; b < nb; b++) {
    const a0 = Math.floor(grid[b] * sr)
    const a1 = Math.min(x.length, Math.floor(grid[b + 1] * sr))
    const c = new Float32Array(12)
    for (let q = 1; q <= 2; q++) chromaAt(x, sr, a0 + ((a1 - a0) * q) / 3, N, win, c)
    let s = 0
    let m = 0
    for (let i = a0; i < a1; i += 4) { s += x[i] * x[i]; m++ }
    energy[b] = Math.sqrt(s / (m || 1))
    chroma.push(c)
  }
  // 曲全体の平均の色を引いて、違いが分かりやすいようにする（同じキーの曲は全部似てしまうので）
  const mean = new Float32Array(12)
  chroma.forEach((c) => {
    const n = Math.hypot(...c) || 1
    for (let i = 0; i < 12; i++) { c[i] /= n; mean[i] += c[i] / nb }
  })
  chroma.forEach((c) => {
    for (let i = 0; i < 12; i++) c[i] -= mean[i]
    const n = Math.hypot(...c) || 1
    for (let i = 0; i < 12; i++) c[i] /= n
  })
  const sim = (i, j) => { let s = 0; for (let k = 0; k < 12; k++) s += chroma[i][k] * chroma[j][k]; return s }
  const sortedE = Array.from(energy).sort((p, q) => p - q)
  const eTop = sortedE[Math.floor(sortedE.length * 0.95)] || 1
  const en = Array.from(energy, (v) => Math.min(1, v / (eTop || 1)))

  // 歌声があれば、声が出ている割合（声が無い所＝イントロ・間奏・アウトロの手がかり。声が出る・止まる所は切れ目の手がかり）
  let voiced = null
  const vbar = new Float32Array(nb)
  if (vocal) {
    const vx = toMono(vocal)
    const vr = rmsFrames(vx, vocal.sampleRate, 0.1)
    const vs = Array.from(vr).sort((p, q) => p - q)
    const th = Math.max(0.005, (vs[Math.floor(vs.length * 0.95)] || 0) * 0.12)
    voiced = (a, b) => {
      let on = 0
      let all = 0
      for (let t = a; t < b; t += 0.1) {
        const f = Math.floor((t - vocalOffsetSec) / 0.1)
        all++
        if (f >= 0 && f < vr.length && vr[f] > th) on++
      }
      return all ? on / all : 0
    }
    for (let b = 0; b < nb; b++) vbar[b] = voiced(grid[b], grid[b + 1])
  }

  // 3) 切れ目：音の色が変わる所（チェッカーボード）＋大きさが変わる所（＋声が出る・止まる所）
  // 見る幅は8秒（コードが2秒ごとに変わっても、部分の中では切れ目にしないように）
  const K = Math.max(4, Math.round(8 / step))
  const enl = en.map((v) => Math.log(v + 0.05)) // 大きさの変わり方は「何倍になったか」で見る（静か→ふつう も 大きい→もっと大きい も同じように）
  const nov = new Float32Array(nb)
  const ej = new Float32Array(nb)
  const vj = new Float32Array(nb)
  for (let i = 2; i < nb - 1; i++) {
    let s = 0
    let c = 0
    for (let a = -K; a < K; a++) {
      for (let b2 = -K; b2 < K; b2++) {
        const p = i + a
        const q = i + b2
        if (p < 0 || q < 0 || p >= nb || q >= nb || p === q) continue
        s += ((a < 0) === (b2 < 0) ? 1 : -1) * sim(p, q)
        c++
      }
    }
    nov[i] = c ? Math.max(0, s / c) : 0
    let l = 0, r = 0, nl = 0, nr = 0, vl = 0, vrr = 0
    for (let a = 1; a <= K; a++) {
      if (i - a >= 0) { l += enl[i - a]; vl += vbar[i - a]; nl++ }
      if (i + a - 1 < nb) { r += enl[i + a - 1]; vrr += vbar[i + a - 1]; nr++ }
    }
    ej[i] = Math.abs(r / (nr || 1) - l / (nl || 1))
    vj[i] = Math.abs(vrr / (nr || 1) - vl / (nl || 1))
  }
  const norm = (arr) => { const m = Math.max(...arr) || 1; return Array.from(arr, (v) => v / m) }
  const nn = norm(nov)
  const ne = norm(ej)
  const nvj = vocal ? norm(vj) : null
  const score = nn.map((v, i) => v + 1.2 * ne[i] + (nvj ? 0.6 * nvj[i] : 0))
  const avg = score.reduce((p, q) => p + q, 0) / nb
  const sd = Math.sqrt(score.reduce((p, q) => p + (q - avg) * (q - avg), 0) / nb)
  const minGap = Math.max(4, Math.round(8 / ((dur / nb) || 2))) // だいたい8秒以上
  // 切れ目の数の目安：ふつうの曲は1つの部分が14秒前後なので、それくらいまで（強い順に選ぶ）
  const maxSegs = Math.max(4, Math.round(dur / 14) + 1)
  const maxScore = Math.max(...score) || 1
  // 切れ目の候補：まわり（±3秒）で一番高い所だけ。曲の頭・終わりのすぐそばは見ない（見る幅が足りないので）
  const edge = Math.max(3, Math.round(K / 2))
  const isPeak = (i) => { for (let j = Math.max(0, i - 3); j <= Math.min(nb - 1, i + 3); j++) if (score[j] > score[i]) return false; return true }
  const cand = score.map((v, i) => ({ i, v }))
    .filter((c) => c.i >= edge && c.i <= nb - edge && c.v > Math.min(avg, maxScore * 0.25) && isPeak(c.i))
    .sort((p, q) => q.v - p.v)
  const cuts = []
  for (const c of cand) {
    if (cuts.length >= maxSegs - 1) break
    if (cuts.every((k) => Math.abs(k - c.i) >= minGap)) cuts.push(c.i)
  }
  cuts.sort((p, q) => p - q)
  const bounds = [0, ...cuts, nb]
  let segs = []
  for (let k = 0; k < bounds.length - 1; k++) segs.push({ b0: bounds[k], b1: bounds[k + 1] })

  // 4) 似ている部分どうしをまとめる（同じ記号＝くり返し）
  segs.forEach((s) => {
    s.startSec = grid[s.b0]
    s.endSec = grid[s.b1]
    let e = 0
    for (let k = s.b0; k < s.b1; k++) e += en[k]
    s.energy = e / (s.b1 - s.b0)
  })
  // 2つの部分がどれだけ似ているか：頭から1秒ずつ並べた音の色（少しずらしても見る）＋大きさが近いか
  const chromaDiag = (s, t) => {
    const n = Math.min(s.b1 - s.b0, t.b1 - t.b0)
    let diag = -1
    for (let off = -2; off <= 2; off++) {
      let v = 0
      let c = 0
      for (let k = 0; k < n; k++) {
        const p = s.b0 + k
        const q = t.b0 + k + off
        if (q < t.b0 || q >= t.b1) continue
        v += sim(p, q)
        c++
      }
      if (c >= n * 0.6) diag = Math.max(diag, v / c)
    }
    return diag
  }
  const segSim = (s, t) => {
    const ratio = Math.min(s.energy, t.energy) / (Math.max(s.energy, t.energy) || 1)
    return ratio < 0.7 ? -1 : chromaDiag(s, t) // 大きさがかなり違えば、同じ部分とはみなさない
  }
  const groups = []
  segs.forEach((s, si) => {
    let best = -1
    let bestV = 0.5
    groups.forEach((g, gi) => { const v = segSim(s, segs[g[0]]); if (v > bestV) { bestV = v; best = gi } })
    s.group = best >= 0 ? best : groups.length
    if (best >= 0) groups[best].push(si)
    else groups.push([si])
  })
  // 切れ目を、近くの拍（0.4秒以内）に合わせる（拍が分かっているときだけ）
  if (Array.isArray(beats) && beats.length > 16) {
    const snap = (t) => {
      let best = t
      let bd = 0.4
      for (const b of beats) { const d = Math.abs(b - t); if (d < bd) { bd = d; best = b } }
      return best
    }
    for (let k = 1; k < segs.length; k++) {
      const t = snap(segs[k].startSec)
      if (t > segs[k - 1].startSec + 2 && t < segs[k].endSec - 2) { segs[k].startSec = t; segs[k - 1].endSec = t }
    }
  }
  segs.forEach((s) => { s.voice = voiced ? voiced(s.startSec, s.endSec) : null })
  if (debug) return { segs, groups, score: Array.from(score), cuts, en }

  // 5) 名前をつける
  const sung = (s) => s.voice === null || s.voice >= 0.2
  const gE = groups.map((g) => g.reduce((p, i) => p + segs[i].energy, 0) / g.length)
  let chorusG = -1
  let bestE = -1
  groups.forEach((g, gi) => {
    const members = g.filter((i) => sung(segs[i]))
    if (members.length >= 2 && gE[gi] > bestE) { bestE = gE[gi]; chorusG = gi }
  })
  const loudest = Math.max(...segs.map((s) => s.energy))
  // くり返していても、曲の中で一番大きいグループよりかなり小さければサビとは言いにくい
  if (chorusG >= 0 && bestE < loudest * 0.7) chorusG = -1
  const names = segs.map(() => null)
  segs.forEach((s, i) => {
    if (chorusG >= 0 ? s.group === chorusG : s.energy >= loudest * 0.85 && sung(s)) names[i] = "サビ"
  })
  const choruses = names.map((n, i) => (n === "サビ" ? i : -1)).filter((i) => i >= 0)
  const chorusE = choruses.length ? choruses.reduce((p, i) => p + segs[i].energy, 0) / choruses.length : loudest
  choruses.forEach((i, k) => {
    if (segs[i].energy < chorusE * 0.72 && k > 0) names[i] = "落ちサビ"
  })
  const realChoruses = choruses.filter((i) => names[i] === "サビ")
  // 落ちサビ：サビと同じ音の並びなのに、ずっと静かな所（最初のサビより後）
  if (choruses.length) {
    const ref = segs[choruses[0]]
    segs.forEach((s, i) => {
      if (names[i] || i <= choruses[0] || !sung(s)) return
      if (s.energy < chorusE * 0.72 && chromaDiag(s, ref) >= 0.5) names[i] = "落ちサビ"
    })
  }
  if (realChoruses.length >= 2) names[realChoruses[realChoruses.length - 1]] = "ラスサビ"
  const first = segs[0]
  const last = segs[segs.length - 1]
  if (!names[0] && (first.voice !== null ? first.voice < 0.2 : first.energy < chorusE * 0.75 && first.endSec <= 30)) names[0] = "イントロ"
  if (!names[segs.length - 1] && segs.length > 2 && (last.voice !== null ? last.voice < 0.2 : last.energy < chorusE * 0.75 && last.endSec - last.startSec <= 30)) names[segs.length - 1] = "アウトロ"
  segs.forEach((s, i) => { if (!names[i] && s.voice !== null && s.voice < 0.15) names[i] = "間奏" })
  // 声が分からないとき：サビとサビのあいだの、短くて静かで1回しか出てこない所は間奏の目安
  segs.forEach((s, i) => {
    if (names[i] || s.voice !== null) return
    const before = names.slice(0, i).some((n) => n && n.includes("サビ"))
    const after = names.slice(i + 1).some((n) => n && n.includes("サビ"))
    const len = s.endSec - s.startSec
    const isChorus = (n) => !!n && n.includes("サビ")
    if (before && after && len <= 14 && s.energy < chorusE * 0.6 && groups[s.group].length === 1 && isChorus(names[i - 1])) names[i] = "間奏"
  })
  const secondChorus = choruses.length > 1 ? choruses[1] : segs.length
  segs.forEach((s, i) => {
    if (names[i]) return
    const next = names[i + 1]
    if (next === "サビ" || next === "ラスサビ" || next === "落ちサビ") {
      // サビの直前：その前が Aメロなら Bメロ。イントロやサビのすぐ後なら Aメロ
      names[i] = i > 0 && names[i - 1] === "Aメロ" ? "Bメロ" : "Aメロ"
      return
    }
    if (i > secondChorus && groups[s.group].length === 1) { names[i] = "Cメロ"; return }
    names[i] = "Aメロ"
  })
  // 同じ名前がとなり合っていたら1つにまとめる
  const out = []
  segs.forEach((s, i) => {
    const prev = out[out.length - 1]
    const conf = names[i] === "サビ" || names[i] === "ラスサビ" ? Math.min(1, s.energy / (loudest || 1)) : 0.5
    if (prev && prev.name === names[i]) { prev.endSec = s.endSec; return }
    out.push({ startSec: Math.round(s.startSec * 100) / 100, endSec: Math.round(s.endSec * 100) / 100, name: names[i], confidence: Math.round(conf * 100) / 100 })
  })
  return out
}
