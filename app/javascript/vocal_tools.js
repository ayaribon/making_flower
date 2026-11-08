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

// ---------- 声の波形編集（詳細モード・Audacity の「選んで加工」と同じ考え方） ----------
// edits = [{ type: "silence" | "gain" | "fadeIn" | "fadeOut", startSec, endSec, db }]（声の時間）
// 元の buffer は書き換えず、加工したコピーを返す（何回でもやり直せるように）
export function applyEdits(ctx, buffer, edits) {
  if (!edits || !edits.length) return buffer
  const sr = buffer.sampleRate
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, sr)
  for (let c = 0; c < buffer.numberOfChannels; c++) out.getChannelData(c).set(buffer.getChannelData(c))
  const edge = Math.round(sr * 0.005) // 端は5msかけて変える（プツッと鳴らないように）
  edits.forEach((e) => {
    const a = Math.max(0, Math.round(e.startSec * sr))
    const b = Math.min(buffer.length, Math.round(e.endSec * sr))
    if (b <= a) return
    const n = b - a
    const target = e.type === "silence" ? 0 : e.type === "gain" ? Math.pow(10, (e.db || 0) / 20) : 1
    for (let c = 0; c < out.numberOfChannels; c++) {
      const d = out.getChannelData(c)
      for (let i = a; i < b; i++) {
        const k = i - a
        let g
        if (e.type === "fadeIn") g = k / n
        else if (e.type === "fadeOut") g = 1 - k / n
        else {
          // 端だけなめらかに target へ
          const w = Math.min(1, k / edge, (b - i) / edge)
          g = 1 + (target - 1) * w
        }
        d[i] *= g
      }
    }
  })
  return out
}
