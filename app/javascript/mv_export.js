// ⚡ 歌ってみた：MV の速い書き出し（手順4e）
// 曲を流さずに、1コマずつ絵を描いて（renderFrame）ブラウザの動画づくり（WebCodecs）で MP4 にする。
// 音も先に全部計算してある（OfflineAudioContext）ので、曲の長さぶん待たなくていい。
// MP4 にまとめるのは mp4-muxer（MIT・vendor/javascript）。サーバーには何も送らない（N1）
import { Muxer, ArrayBufferTarget } from "mp4-muxer"
import { featuresFromBytes } from "mv_renderer"

export function fastExportSupported() {
  return typeof window !== "undefined" &&
    "VideoEncoder" in window && "AudioEncoder" in window && "VideoFrame" in window && "AudioData" in window
}

// 動画の形式を選ぶ：H.264（どこでも再生できる）→ だめなら VP9
export async function pickVideoConfig(width, height, fps, bitrate) {
  const big = width * height > 1280 * 720 * 1.2
  const avc = big ? ["avc1.640028", "avc1.4D4028", "avc1.42E028"] : ["avc1.640020", "avc1.4D401F", "avc1.42E01F"]
  const candidates = [
    ...avc.map((codec) => ({ mux: "avc", label: "H.264", config: { codec, width, height, bitrate, framerate: fps, avc: { format: "avc" } } })),
    { mux: "vp9", label: "VP9", config: { codec: "vp09.00.40.08", width, height, bitrate, framerate: fps } }
  ]
  for (const c of candidates) {
    try {
      const r = await VideoEncoder.isConfigSupported(c.config)
      if (r.supported) return c
    } catch (e) {}
  }
  return null
}

// 音の形式を選ぶ：AAC（どこでも再生できる）→ だめなら Opus。sampleRate も一緒に決める
export async function pickAudioConfig(preferredRate) {
  const rates = [...new Set([preferredRate, 48000, 44100])]
  for (const [mux, codec, label] of [["aac", "mp4a.40.2", "AAC"], ["opus", "opus", "Opus"]]) {
    for (const sampleRate of rates) {
      const config = { codec, sampleRate, numberOfChannels: 2, bitrate: 192000 }
      try {
        const r = await AudioEncoder.isConfigSupported(config)
        if (r.supported) return { mux, label, config }
      } catch (e) {}
    }
  }
  return null
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
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = Math.sin((2 * Math.PI * i) / n) }
  return (re, im) => {
    for (let i = 0; i < n; i++) {
      const j = rev[i]
      if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t }
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
          re[q] = re[p] - tr; im[q] = im[p] - ti
          re[p] += tr; im[p] += ti
        }
      }
    }
  }
}

// 書き出す音から、1コマごとの「絵を動かす値」を先に作る。
// 再生中に使う AnalyserNode（fftSize 2048・なめらかさ 0.8・−100〜−30dB・Blackman 窓）と同じ計算にして、見た目をそろえる
export function computeFeatureTrack(buffer, fps) {
  const N = 2048
  const sr = buffer.sampleRate
  const ch = buffer.numberOfChannels
  const data = []
  for (let c = 0; c < ch; c++) data.push(buffer.getChannelData(c))
  const frames = Math.ceil((buffer.length / sr) * fps)
  const fft = makeFFT(N)
  const win = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    const a = (2 * Math.PI * i) / (N - 1)
    win[i] = 0.42 - 0.5 * Math.cos(a) + 0.08 * Math.cos(2 * a)
  }
  const re = new Float64Array(N)
  const im = new Float64Array(N)
  const smooth = new Float64Array(N / 2)
  const freq = new Uint8Array(N / 2)
  const time = new Uint8Array(N)
  const track = new Array(frames)
  let prev = null
  for (let f = 0; f < frames; f++) {
    const end = Math.round((f / fps) * sr) // そのコマの時刻までの 2048 サンプル
    for (let i = 0; i < N; i++) {
      const j = end - N + i
      let v = 0
      if (j >= 0 && j < buffer.length) { for (let c = 0; c < ch; c++) v += data[c][j]; v /= ch }
      re[i] = v * win[i]
      im[i] = 0
      time[i] = Math.max(0, Math.min(255, Math.round(128 + v * 128)))
    }
    fft(re, im)
    for (let k = 0; k < N / 2; k++) {
      const mag = Math.hypot(re[k], im[k]) / N
      smooth[k] = 0.8 * smooth[k] + 0.2 * mag
      const db = 20 * Math.log10(smooth[k] + 1e-12)
      freq[k] = Math.max(0, Math.min(255, Math.round(((db + 100) / 70) * 255)))
    }
    prev = featuresFromBytes(freq, time, prev)
    track[f] = prev
  }
  return track
}

// 音（AudioBuffer）と、1コマ描く関数から MP4 を作る
// drawFrame(g, width, height, t, frameIndex)、onProgress(0〜1, 文字)、isCancelled() が true なら止める
export async function encodeMp4({ audio, audioPick, videoPick, width, height, fps, duration, drawFrame, onProgress, isCancelled }) {
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: videoPick.mux, width, height, frameRate: fps },
    audio: { codec: audioPick.mux, numberOfChannels: 2, sampleRate: audioPick.config.sampleRate },
    fastStart: "in-memory",
    firstTimestampBehavior: "offset"
  })
  let failure = null
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { failure = e }
  })
  videoEncoder.configure(videoPick.config)
  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => { failure = e }
  })
  audioEncoder.configure(audioPick.config)

  try {
    // 🎵 音：少しずつ渡す
    const sr = audio.sampleRate
    const left = audio.getChannelData(0)
    const right = audio.numberOfChannels > 1 ? audio.getChannelData(1) : left
    const step = 4096
    for (let o = 0; o < audio.length; o += step) {
      const n = Math.min(step, audio.length - o)
      const planar = new Float32Array(n * 2)
      planar.set(left.subarray(o, o + n), 0)
      planar.set(right.subarray(o, o + n), n)
      const ad = new AudioData({
        format: "f32-planar", sampleRate: sr, numberOfFrames: n, numberOfChannels: 2,
        timestamp: Math.round((o / sr) * 1e6), data: planar
      })
      audioEncoder.encode(ad)
      ad.close()
      if (failure) throw failure
      if (isCancelled && isCancelled()) throw new Error("cancelled")
    }
    await audioEncoder.flush()

    // 🎬 絵：1コマずつ描いて渡す
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const g = canvas.getContext("2d")
    const total = Math.max(1, Math.ceil(duration * fps))
    const frameUs = 1e6 / fps
    const started = performance.now()
    for (let i = 0; i < total; i++) {
      if (failure) throw failure
      if (isCancelled && isCancelled()) throw new Error("cancelled")
      drawFrame(g, width, height, i / fps, i)
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameUs), duration: Math.round(frameUs) })
      videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 })
      frame.close()
      // 詰まりすぎないように待つ
      while (videoEncoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 1))
      // ときどき画面（進み具合）を更新する
      if (i % 10 === 0) {
        const elapsed = (performance.now() - started) / 1000
        const rest = i > 0 ? (elapsed / i) * (total - i) : 0
        if (onProgress) onProgress(i / total, `あと約${Math.max(1, Math.ceil(rest))}秒`)
        await new Promise((r) => setTimeout(r, 0))
      }
    }
    await videoEncoder.flush()
    if (failure) throw failure
    muxer.finalize()
    return new Blob([muxer.target.buffer], { type: "video/mp4" })
  } finally {
    try { videoEncoder.close() } catch (e) {}
    try { audioEncoder.close() } catch (e) {}
  }
}
