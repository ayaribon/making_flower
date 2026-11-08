import { Controller } from "@hotwired/stimulus"
import { toMono, rmsOf, findOnset, estimateLag, findQuietRange, trimBuffer, denoise } from "vocal_tools"

// 🎤 歌ってみた（手順2.5：ずれ直しの自動化＋ノイズ消し）
// オケ → gain ┐
//            ├→ master → スピーカー
// 歌声 → gain ┘         └→ 録画用の出口（MediaStreamDestination）
//                       └→ analyser（波形を描く）
// カウントのクリック・測定のピッは ctx.destination に直接つなぐ（書き出しには入らない）
//
// 歌声の持ち方：
//   vocalRaw   … 録ったまま／読み込んだままの声（何度でもやり直せるように残す）
//   vocalBuffer… vocalRaw にノイズ消しをかけて、頭（静かな時間・カウント）を切ったもの。再生と書き出しはこれを使う
const OFFSET_LIMIT_MS = 1000
const LATENCY_KEY = "kotobouquet.singing.latencyMs"
const COUNT_SILENCE = 1.5 // 録音の最初に静かにしてもらう秒数（部屋の雑音を覚える）
const BEAT = 0.5          // カウントインの1拍（120BPM）
const MIC_OPTIONS = { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }

export default class extends Controller {
  static targets = [
    "backingVolume", "vocalVolume",
    "playButton", "stopButton", "recordButton", "audioButton",
    "status", "canvas", "download", "audioDownload",
    "offsetDisplay", "autoLatency",
    "micStartButton", "micStopButton", "resetButton",
    "countIn", "calibrateButton", "calibrationInfo",
    "denoiseStrength", "denoiseValue", "rawToggle"
  ]

  connect() {
    this.ctx = null
    this.backingBuffer = null
    this.vocalRaw = null
    this.vocalBuffer = null
    this.vocalTrimSec = 0
    this.noiseRange = null
    this.useRaw = false
    this.sources = []
    this.recorder = null
    this.micRecorder = null
    this.micStream = null
    this.drawId = null
    this.vocalOffsetMs = 0
    this.autoInfo = "なし"
    this.calibratedMs = this.loadCalibration()
    this.mode = "idle" // idle / playing / micRecording / calibrating / processing / exporting
    this.drawWaveform()
    this.updateOffsetDisplay()
    this.updateCalibrationInfo()
    this.updateDenoiseValue()
    this.updateButtons()
  }

  disconnect() {
    this.stop()
    this.stopMicStream()
    if (this.drawId) cancelAnimationFrame(this.drawId)
    if (this.ctx) this.ctx.close()
  }

  // 音のつなぎ先は最初に1回だけ作る（ブラウザの決まりで、ボタン操作のあとに作る）
  ensureContext() {
    if (this.ctx) return
    const AC = window.AudioContext || window.webkitAudioContext
    this.ctx = new AC()
    this.backingGain = this.ctx.createGain()
    this.vocalGain = this.ctx.createGain()
    this.master = this.ctx.createGain()
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.streamOut = this.ctx.createMediaStreamDestination()

    this.backingGain.connect(this.master)
    this.vocalGain.connect(this.master)
    this.master.connect(this.ctx.destination)
    this.master.connect(this.analyser)
    this.master.connect(this.streamOut)
    this.changeVolume()
  }

  // ---------- 読み込み ----------

  async loadBacking(event) {
    const file = event.target.files[0]
    event.target.value = "" // 同じファイルを選び直しても読み込めるように
    const buffer = await this.decodeFile(file, "オケ")
    if (buffer) this.backingBuffer = buffer
    this.updateButtons()
  }

  async loadVocal(event) {
    const file = event.target.files[0]
    event.target.value = ""
    const buffer = await this.decodeFile(file, "歌声")
    if (!buffer) return

    const mono = toMono(buffer)
    // ファイルの声は、一番静かな1秒から部屋の雑音を覚える
    await this.setVocal(buffer, { trimSec: 0, noiseRange: findQuietRange(mono, buffer.sampleRate, 1) })

    // オケの音もれや手拍子が入っていれば、オケと比べて自動で合わせる
    if (this.backingBuffer) {
      const r = estimateLag(mono, toMono(this.backingBuffer), buffer.sampleRate, OFFSET_LIMIT_MS / 1000)
      if (r && r.score >= 0.2) {
        this.setOffset(-r.lagSec * 1000)
        this.autoInfo = `${this.formatMs(this.vocalOffsetMs)}（オケと比較・一致度 ${Math.round(r.score * 100)}%）`
      } else {
        this.setOffset(0)
        this.autoInfo = "オケと比べても合わせられませんでした（手動で直してね）"
      }
    } else {
      this.setOffset(0)
      this.autoInfo = "オケを先に入れると自動で合わせます"
    }
    this.updateOffsetDisplay()
    this.setStatus(`歌声を読み込みました（${this.vocalBuffer.duration.toFixed(1)}秒）。自動補正：${this.autoInfo}`)
  }

  async decodeFile(file, label) {
    if (!file) return null
    return this.decodeBlob(file, label)
  }

  async decodeBlob(blob, label) {
    this.ensureContext()
    try {
      const data = await blob.arrayBuffer()
      const buffer = await this.ctx.decodeAudioData(data)
      this.setStatus(`${label}を読み込みました（${buffer.duration.toFixed(1)}秒）`)
      return buffer
    } catch (e) {
      console.error(e)
      this.setStatus(`${label}を読み込めませんでした（この形式は使えないか、データが壊れているかも）`)
      return null
    }
  }

  // ---------- 歌声を作る（ノイズ消し → 頭を切る） ----------

  async setVocal(raw, { trimSec, noiseRange }) {
    this.vocalRaw = raw
    this.vocalTrimSec = Math.max(0, trimSec)
    this.noiseRange = noiseRange
    await this.rebuildVocal()
  }

  async rebuildVocal() {
    if (!this.vocalRaw) return
    const before = this.mode
    const strength = Number(this.denoiseStrengthTarget.value)
    let buffer = this.vocalRaw
    if (!this.useRaw && strength > 0 && this.noiseRange) {
      this.setMode("processing")
      this.setStatus("✨ ノイズ消し中…（長い曲だと数秒かかります）")
      await new Promise((resolve) => setTimeout(resolve, 30)) // 文字を先に出す
      try {
        buffer = denoise(this.ctx, this.vocalRaw, {
          strength,
          noiseStart: this.noiseRange[0],
          noiseEnd: this.noiseRange[1]
        })
      } catch (e) {
        console.error(e)
        this.setStatus("ノイズ消しに失敗しました。元の声のまま使います")
      }
    }
    this.vocalBuffer = trimBuffer(this.ctx, buffer, this.vocalTrimSec)
    this.setMode(before === "processing" ? "idle" : before)
  }

  async changeDenoise() {
    this.updateDenoiseValue()
    if (!this.vocalRaw || this.mode !== "idle") return
    await this.rebuildVocal()
    this.setStatus(`ノイズ消しの強さ：${this.denoiseStrengthTarget.value}（▶試聴で確かめてね）`)
  }

  previewDenoise() {
    this.updateDenoiseValue()
  }

  async toggleRaw() {
    if (!this.vocalRaw || this.mode !== "idle") return
    this.useRaw = !this.useRaw
    this.rawToggleTarget.textContent = this.useRaw ? "✨ ノイズ消しで聴く" : "🎧 元の声で聴く"
    await this.rebuildVocal()
    this.setStatus(this.useRaw ? "元の声（ノイズ消しなし）にしました" : "ノイズ消しした声にしました")
  }

  updateDenoiseValue() {
    if (this.hasDenoiseValueTarget) this.denoiseValueTarget.textContent = this.denoiseStrengthTarget.value
  }

  // ---------- ボタンの有効/無効をまとめて切り替える ----------

  setMode(mode) {
    this.mode = mode
    this.updateButtons()
  }

  updateButtons() {
    const idle = this.mode === "idle"
    const hasSound = !!(this.backingBuffer || this.vocalBuffer)
    this.playButtonTarget.disabled = !(idle && hasSound)
    this.recordButtonTarget.disabled = !(idle && hasSound)
    this.audioButtonTarget.disabled = !(idle && hasSound)
    this.micStartButtonTarget.disabled = !(idle && this.backingBuffer)
    this.micStopButtonTarget.disabled = this.mode !== "micRecording"
    this.stopButtonTarget.disabled = !(this.mode === "playing" || this.mode === "exporting")
    this.resetButtonTarget.disabled = !(idle && this.vocalRaw)
    this.countInTarget.disabled = !idle
    this.calibrateButtonTarget.disabled = !idle
    this.denoiseStrengthTarget.disabled = !(idle && this.vocalRaw)
    this.rawToggleTarget.disabled = !(idle && this.vocalRaw)
  }

  // ---------- 音量・ズレ ----------

  changeVolume() {
    if (!this.ctx) return
    this.backingGain.gain.value = parseFloat(this.backingVolumeTarget.value)
    this.vocalGain.gain.value = parseFloat(this.vocalVolumeTarget.value)
  }

  setOffset(ms) {
    this.vocalOffsetMs = Math.max(-OFFSET_LIMIT_MS, Math.min(OFFSET_LIMIT_MS, Math.round(ms)))
    this.updateOffsetDisplay()
  }

  shiftVocalOffset(event) {
    const delta = Number(event.currentTarget.dataset.shiftMs || 0)
    this.setOffset(this.vocalOffsetMs + delta)
    this.setStatus(`歌声のずれ補正: ${this.formatMs(this.vocalOffsetMs)}（▶試聴で確かめてね）`)
  }

  formatMs(ms) {
    return `${ms >= 0 ? "+" : ""}${Math.round(ms)}ms`
  }

  updateOffsetDisplay() {
    if (this.hasOffsetDisplayTarget) this.offsetDisplayTarget.textContent = this.formatMs(this.vocalOffsetMs)
    if (this.hasAutoLatencyTarget) this.autoLatencyTarget.textContent = this.autoInfo
  }

  resetVocal() {
    this.stop()
    this.vocalRaw = null
    this.vocalBuffer = null
    this.noiseRange = null
    this.vocalTrimSec = 0
    this.autoInfo = "なし"
    this.setOffset(0)
    this.updateButtons()
    this.setStatus("歌声をリセットしました。もう一度録音するか、ファイルを読み込んでください")
  }

  // 曲の長さ＝オケと「ずらした後の声」の長いほう
  get duration() {
    const backing = this.backingBuffer?.duration || 0
    const vocal = this.vocalBuffer ? this.vocalBuffer.duration + this.vocalOffsetMs / 1000 : 0
    return Math.max(backing, vocal, 0)
  }

  // ---------- 再生 ----------

  // 鳴らし始める時刻（ctx の時計）を返す。backingOnly のときはオケだけ鳴らす
  startSources(onEnded, { backingOnly = false, startAt = null } = {}) {
    this.stopSources()
    const at = startAt ?? this.ctx.currentTime + 0.1
    this.scheduleSources(this.ctx, at, this.backingGain, this.vocalGain, backingOnly)
      .forEach((src) => this.sources.push(src))
    const length = backingOnly ? (this.backingBuffer?.duration || 0) : this.duration
    const waitSec = at - this.ctx.currentTime + length + 0.4
    this.endTimer = setTimeout(() => {
      this.stopSources()
      if (onEnded) onEnded()
    }, waitSec * 1000)
    return at
  }

  // 再生と「音声だけ保存」で同じ並べ方を使う（オケはそのまま、歌声だけズレを反映）
  scheduleSources(ctx, startAt, backingGain, vocalGain, backingOnly = false) {
    const list = []
    if (this.backingBuffer) {
      const src = ctx.createBufferSource()
      src.buffer = this.backingBuffer
      src.connect(backingGain)
      src.start(startAt)
      list.push(src)
    }
    if (this.vocalBuffer && !backingOnly) {
      const offsetSec = this.vocalOffsetMs / 1000
      const beginAt = Math.max(0, -offsetSec)
      if (beginAt < this.vocalBuffer.duration) {
        const src = ctx.createBufferSource()
        src.buffer = this.vocalBuffer
        src.connect(vocalGain)
        src.start(startAt + Math.max(0, offsetSec), beginAt)
        list.push(src)
      }
    }
    return list
  }

  stopSources() {
    clearTimeout(this.endTimer)
    this.sources.forEach((src) => { try { src.stop() } catch (e) {} })
    this.sources = []
  }

  async play() {
    this.ensureContext()
    await this.ctx.resume()
    this.setMode("playing")
    this.startSources(() => {
      this.setMode("idle")
      this.setStatus("試聴おわり")
    })
    this.setStatus("試聴中…")
  }

  stop() {
    this.stopSources()
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop()
    if (this.micRecorder && this.micRecorder.state !== "inactive") this.micRecorder.stop()
    if (this.mode === "playing") {
      this.setMode("idle")
      this.setStatus("停止しました")
    }
  }

  // ---------- マイク ----------

  async openMic() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      this.setStatus("このブラウザではマイク録音に対応していません")
      return null
    }
    try {
      // エコー除去・雑音除去・音量の自動調整は歌声を劣化させるので切る（ノイズ消しは自前でやる）
      this.micStream = await navigator.mediaDevices.getUserMedia(MIC_OPTIONS)
      return this.micStream
    } catch (e) {
      console.error(e)
      this.setStatus("マイクが使えませんでした。ブラウザの設定でマイクを許可してください")
      return null
    }
  }

  stopMicStream() {
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop())
      this.micStream = null
    }
  }

  // 録音を始める。startedAt＝録音の0秒目が ctx の時計で何秒か（ずれはあとで測って直す）
  startRecorder(stream) {
    const mimeType = this.pickAudioMimeType()
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    const chunks = []
    const done = new Promise((resolve) => {
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" }))
    })
    recorder.start(250)
    this.micRecorder = recorder
    return { recorder, done, startedAt: this.ctx.currentTime }
  }

  pickAudioMimeType() {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"]
    return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || ""
  }

  // 短い音（カウントのクリック・測定のピッ）。書き出しに入らないようにスピーカーへ直接
  tone(at, { freq = 1000, length = 0.05, volume = 0.6 } = {}) {
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.frequency.value = freq
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(volume, at + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0001, at + length)
    osc.connect(g)
    g.connect(this.ctx.destination)
    osc.start(at)
    osc.stop(at + length + 0.01)
  }

  // ---------- 📏 遅れを測る（F2-9 / F2-10） ----------

  loadCalibration() {
    try {
      const v = window.localStorage.getItem(LATENCY_KEY)
      return v === null ? null : Number(v)
    } catch (e) {
      return null
    }
  }

  updateCalibrationInfo() {
    if (!this.hasCalibrationInfoTarget) return
    this.calibrationInfoTarget.textContent = this.calibratedMs === null
      ? "まだ測っていません"
      : `${this.calibratedMs}ms（この端末で測った値。イヤホンを変えたら測り直してね）`
  }

  async calibrate() {
    this.ensureContext()
    await this.ctx.resume()
    const stream = await this.openMic()
    if (!stream) return

    this.setMode("calibrating")
    this.setStatus("📏 測定中…「ピッ」が5回鳴ります。静かにしていてください")
    const rec = this.startRecorder(stream)
    const t0 = this.ctx.currentTime + 0.5
    const times = [0, 1, 2, 3, 4].map((i) => t0 + 0.4 + i * 0.6)
    times.forEach((t) => this.tone(t, { freq: 1000, length: 0.06, volume: 0.8 }))

    await new Promise((resolve) => setTimeout(resolve, (times[4] - this.ctx.currentTime + 0.8) * 1000))
    rec.recorder.stop()
    const blob = await rec.done
    this.stopMicStream()

    const buffer = await this.decodeBlob(blob, "測定の音")
    if (!buffer) { this.setMode("idle"); return }
    const mono = toMono(buffer)
    const sr = buffer.sampleRate
    const rel = (t) => t - rec.startedAt
    const floor = rmsOf(mono, sr, rel(t0) + 0.05, rel(t0) + 0.35)
    const lats = times
      .map((t) => {
        const onset = findOnset(mono, sr, rel(t) - 0.05, rel(t) + 0.55, floor)
        return onset === null ? null : onset - rel(t)
      })
      .filter((v) => v !== null && v > -0.05 && v < 0.5)

    if (lats.length < 3) {
      this.setStatus("測れませんでした。ヘッドホンを外してスピーカーで、音量を少し上げてもう一度試してね")
    } else {
      lats.sort((a, b) => a - b)
      this.calibratedMs = Math.round(lats[Math.floor(lats.length / 2)] * 1000)
      try { window.localStorage.setItem(LATENCY_KEY, String(this.calibratedMs)) } catch (e) {}
      this.updateCalibrationInfo()
      this.setStatus(`📏 測定OK：遅れは ${this.calibratedMs}ms（${lats.length}/5回で測れました）。次の録音から自動で使います`)
    }
    this.setMode("idle")
  }

  // ---------- その場で録音（カウントイン：F2-11、ノイズを覚える：F2-14） ----------
  // 録音の流れ：静かに1.5秒 →（カウントインONなら）クリック1・2・3・4、4拍目で手拍子 → オケ

  async startMicRecording() {
    if (!this.backingBuffer) {
      this.setStatus("先にオケを読み込んでください")
      return
    }
    this.ensureContext()
    await this.ctx.resume()
    const stream = await this.openMic()
    if (!stream) return

    const countIn = this.countInTarget.checked
    const rec = this.startRecorder(stream)
    const t0 = this.ctx.currentTime + 0.1
    const countAt = t0 + COUNT_SILENCE
    const clapAt = countAt + 3 * BEAT
    const backingAt = countIn ? countAt + 4 * BEAT : countAt
    if (countIn) {
      for (let i = 0; i < 4; i++) this.tone(countAt + i * BEAT, { freq: i === 0 ? 1500 : 1000, length: 0.04, volume: 0.5 })
    }
    this.startSources(() => this.stopMicRecording(), { backingOnly: true, startAt: backingAt })
    this.setMode("micRecording")
    this.setStatus(countIn
      ? "🔴 録音中… 最初は静かに → カウント「1・2・3・4」の4つ目で手拍子 → オケに合わせて歌ってね（⏹で終了）"
      : "🔴 録音中… 最初の1.5秒は静かに → オケに合わせて歌ってね（⏹で終了）")

    const blob = await rec.done
    this.stopSources()
    this.stopMicStream()
    const buffer = await this.decodeBlob(blob, "録音した歌声")
    if (!buffer) { this.setMode("idle"); return }

    const mono = toMono(buffer)
    const sr = buffer.sampleRate
    const rel = (t) => t - rec.startedAt // ctx の時計 → 録音の何秒目か
    const noiseRange = [Math.max(0, rel(t0) + 0.2), Math.max(0, rel(countAt) - 0.1)]
    const floor = rmsOf(mono, sr, noiseRange[0], noiseRange[1])

    // 遅れの決め方：手拍子 → 📏測った値 → ブラウザの値 の順
    let lat = null
    let method = ""
    if (countIn) {
      const onset = findOnset(mono, sr, rel(clapAt) - 0.15, rel(clapAt) + 0.6, floor)
      if (onset !== null && onset - rel(clapAt) > -0.1 && onset - rel(clapAt) < 0.6) {
        lat = onset - rel(clapAt)
        method = "カウントインの手拍子"
      }
    }
    if (lat === null && this.calibratedMs !== null) {
      lat = this.calibratedMs / 1000
      method = countIn ? "📏 測った値（手拍子が見つからなかった）" : "📏 測った値"
    }
    if (lat === null) {
      const outputSec = this.ctx.outputLatency || this.ctx.baseLatency || 0
      const inputSec = stream.getAudioTracks()[0]?.getSettings?.().latency || 0
      lat = outputSec + inputSec
      method = "ブラウザの値（📏で測るともっと正確）"
    }

    // オケが鳴り始めた位置＋遅れ のところで頭を切る → 声の0秒目＝オケの0秒目
    await this.setVocal(buffer, { trimSec: rel(backingAt) + lat, noiseRange })
    this.setOffset(0)
    this.autoInfo = `${Math.round(lat * 1000)}ms（${method}）`
    this.updateOffsetDisplay()
    this.setMode("idle")
    if (this.vocalBuffer) {
      this.setStatus(`録音OK（${this.vocalBuffer.duration.toFixed(1)}秒）。自動補正：${this.autoInfo}。▶試聴して、ずれていたら手動で直してね`)
    } else {
      this.setStatus("録音が短すぎました。オケが始まってから歌ってね")
    }
  }

  stopMicRecording() {
    this.stopSources()
    if (this.micRecorder && this.micRecorder.state !== "inactive") {
      this.micRecorder.stop() // 続きは startMicRecording の await のあと
      this.setStatus("録音を止めました。読み込み中…")
    }
  }

  // ---------- 音声だけ保存（WAV） ----------

  async exportAudio() {
    if (!this.backingBuffer && !this.vocalBuffer) return
    this.ensureContext()
    this.setMode("exporting")
    this.setStatus("音声を作っています…")
    try {
      const sampleRate = (this.backingBuffer || this.vocalBuffer).sampleRate
      const length = Math.ceil(this.duration * sampleRate)
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext
      const off = new OAC(2, length, sampleRate)
      const backingGain = off.createGain()
      const vocalGain = off.createGain()
      backingGain.gain.value = parseFloat(this.backingVolumeTarget.value)
      vocalGain.gain.value = parseFloat(this.vocalVolumeTarget.value)
      backingGain.connect(off.destination)
      vocalGain.connect(off.destination)
      this.scheduleSources(off, 0, backingGain, vocalGain)

      const rendered = await off.startRendering()
      const blob = this.encodeWav(rendered)
      const link = this.audioDownloadTarget
      if (link.href) URL.revokeObjectURL(link.href)
      link.href = URL.createObjectURL(blob)
      link.download = "utattemita.wav"
      link.hidden = false
      this.setStatus(`音声の書き出し完了（WAV・${(blob.size / 1024 / 1024).toFixed(1)}MB）`)
    } catch (e) {
      console.error(e)
      this.setStatus("音声の書き出しに失敗しました")
    }
    this.setMode("idle")
  }

  // 16bit ステレオの WAV にする
  encodeWav(buffer) {
    const channels = Math.min(2, buffer.numberOfChannels)
    const frames = buffer.length
    const dataSize = frames * channels * 2
    const view = new DataView(new ArrayBuffer(44 + dataSize))
    const writeText = (pos, text) => { for (let i = 0; i < text.length; i++) view.setUint8(pos + i, text.charCodeAt(i)) }

    writeText(0, "RIFF")
    view.setUint32(4, 36 + dataSize, true)
    writeText(8, "WAVE")
    writeText(12, "fmt ")
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, channels, true)
    view.setUint32(24, buffer.sampleRate, true)
    view.setUint32(28, buffer.sampleRate * channels * 2, true)
    view.setUint16(32, channels * 2, true)
    view.setUint16(34, 16, true)
    writeText(36, "data")
    view.setUint32(40, dataSize, true)

    const data = []
    for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c))
    let pos = 44
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < channels; c++) {
        const s = Math.max(-1, Math.min(1, data[c][i]))
        view.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7fff, true)
        pos += 2
      }
    }
    return new Blob([view], { type: "audio/wav" })
  }

  // ---------- 動画で書き出し（録画方式） ----------

  // 書き出せる形式を選ぶ（Chrome/Edge は WebM、iPhone の Safari は MP4 になるはず）
  pickMimeType() {
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4;codecs=avc1,mp4a",
      "video/mp4"
    ]
    return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || ""
  }

  async record() {
    if (!window.MediaRecorder || !this.canvasTarget.captureStream) {
      this.setStatus("このブラウザは動画の書き出しに対応していません")
      return
    }
    this.ensureContext()
    await this.ctx.resume()

    const mimeType = this.pickMimeType()
    const videoStream = this.canvasTarget.captureStream(30)
    const stream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...this.streamOut.stream.getAudioTracks()
    ])
    const chunks = []
    this.recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    this.recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
    this.recorder.onstop = () => {
      this.stopSources()
      videoStream.getVideoTracks().forEach((t) => t.stop())
      const type = this.recorder.mimeType || mimeType || "video/webm"
      const ext = type.includes("mp4") ? "mp4" : "webm"
      const blob = new Blob(chunks, { type })
      const link = this.downloadTarget
      if (link.href) URL.revokeObjectURL(link.href)
      link.href = URL.createObjectURL(blob)
      link.download = `utattemita.${ext}`
      link.hidden = false
      this.setMode("idle")
      this.setStatus(`動画の書き出し完了（${ext}・${(blob.size / 1024 / 1024).toFixed(1)}MB）`)
    }

    this.setMode("exporting")
    this.recorder.start(1000)
    this.startSources(() => {
      if (this.recorder.state !== "inactive") this.recorder.stop()
    })
    this.setStatus(`録画中…（${this.duration.toFixed(0)}秒かかります。タブはこのままで）`)
  }

  // ---------- 波形 ----------

  // 波形をずっと描き続ける（録画にも写る）
  drawWaveform() {
    const canvas = this.canvasTarget
    const g = canvas.getContext("2d")
    const w = canvas.width
    const h = canvas.height
    let data = null

    const draw = () => {
      g.fillStyle = "#2a1630"
      g.fillRect(0, 0, w, h)
      g.fillStyle = "#ffffff"
      g.font = "bold 48px sans-serif"
      g.textAlign = "center"
      g.fillText("🎤 歌ってみた", w / 2, 100)

      if (this.analyser) {
        if (!data) data = new Uint8Array(this.analyser.fftSize)
        this.analyser.getByteTimeDomainData(data)
        g.strokeStyle = "#ff8ac6"
        g.lineWidth = 4
        g.beginPath()
        for (let i = 0; i < data.length; i++) {
          const x = (i / (data.length - 1)) * w
          const y = h / 2 + ((data[i] - 128) / 128) * (h * 0.35)
          if (i === 0) g.moveTo(x, y)
          else g.lineTo(x, y)
        }
        g.stroke()
      }
      this.drawId = requestAnimationFrame(draw)
    }
    draw()
  }

  setStatus(text) {
    this.statusTarget.textContent = text
  }
}
