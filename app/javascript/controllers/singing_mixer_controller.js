import { Controller } from "@hotwired/stimulus"
import {
  toMono, rmsOf, findOnset, estimateLag, findQuietRange, trimBuffer, denoise,
  spliceTake, waveformPeaks, analyzeLevels, suggestChoruses, normalizeLoudness, applyEdits
} from "vocal_tools"
import {
  DEFAULT_MIX, MIX_PRESETS, createVocalChain, applyMix, createLimiter, reverbTail,
  settingsAt, scheduleMixTimeline, mixParams, SIMPLE_LINKS, GLOBAL_PRO_KEYS, PRO_PARAMS, PRO_GROUPS
} from "mix_chain"

// 🎤 歌ってみた（手順3：ミックス）
// オケ → gain ─────────────────────────────┐
//                                          ├→ master → リミッター → スピーカー
// 歌声 → ミックス（EQ→コンプ→リバーブ）→ gain ┘                 └→ 録画用の出口（MediaStreamDestination）
//                                                          └→ analyser（波形を描く）
// カウントのクリック・測定のピッは ctx.destination に直接つなぐ（書き出しには入らない）
//
// 時間の決まり：
//   曲の時間 … オケの 0 秒目が 0。波形・再生バーはこの時間で表示する
//   声の時間 … vocalBuffer の 0 秒目が 0。曲の時間 ＝ 声の時間 ＋ ずれ補正（vocalOffsetMs）
//
// 歌声の持ち方：
//   vocalNoiseSource … 雑音を覚えるための元データ（録音ならカウントイン込みの録ったまま、ファイルならそのまま）
//   vocalBase        … 最初の声（頭を切って、声の 0 秒目＝オケの 0 秒目にしたもの）
//   takes[]          … 途中から録り直した部分 { startSec, endSec, raw }（startSec / endSec は声の時間）
//   vocalBuffer      … vocalBase に takes を順に差し替え → ノイズ消し。再生と書き出しはこれを使う
const OFFSET_LIMIT_MS = 1000
const LATENCY_KEY = "kotobouquet.singing.latencyMs"
const COUNT_SILENCE = 1.5 // 録音の最初に静かにしてもらう秒数（部屋の雑音を覚える）
const BEAT = 0.5          // カウントインの1拍（120BPM）
const PREROLL = 2         // 途中から録り直すとき、何秒前から流すか
const OFFSET_VIEW_SEC = 4 // ずれ補正の波形に何秒ぶん映すか（拡大して細かいずれを見えるように）
const MIC_OPTIONS = { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }
const MIX_KEY = "kotobouquet.singing.mix" // 最後に使ったミックス設定（この端末だけ）
const DETAIL_KEY = "kotobouquet.singing.detail" // 詳細モードを開いているか（この端末だけ）

export default class extends Controller {
  static targets = [
    "backingVolume", "vocalVolume",
    "playButton", "stopButton", "recordButton", "audioButton",
    "status", "canvas", "download", "audioDownload",
    "offsetDisplay", "autoLatency",
    "micStartButton", "micStopButton", "resetButton",
    "countIn", "calibrateButton", "calibrationInfo",
    "denoiseStrength", "denoiseValue", "rawToggle",
    "timeline", "punchInfo", "punchButton", "undoButton", "clearPunchButton", "punchMute",
    "recalcButton", "applyButton",
    "offsetView", "offsetSlider", "previewButton",
    "mixSlider", "mixValue", "presetButton", "presetHint", "mixBypassButton",
    "backingVolumeValue", "vocalVolumeValue", "playFromButton", "timeDisplay",
    "mixTimeline", "sectionList", "sectionName", "sectionInfo", "editingLabel",
    "addSectionButton", "deleteSectionButton", "playSectionButton",
    "guide", "detailToggle", "proPanel", "normalizeExport",
    "editView", "editStart", "editEnd", "editGainDb", "editInfo", "editUndoButton", "editClearButton"
  ]

  connect() {
    this.ctx = null
    this.backingBuffer = null
    this.vocalNoiseSource = null
    this.vocalBase = null
    this.takes = []
    this.edits = []
    this.editSel = null
    this.vocalBuffer = null
    this.noiseRange = null
    this.lastLatencySec = null
    this.useRaw = false
    this.sources = []
    this.recorder = null
    this.micRecorder = null
    this.micStream = null
    this.drawId = null
    this.vocalOffsetMs = 0
    this.autoInfo = "なし"
    this.recommendedOffsetMs = null // おすすめのずれ補正（null＝おすすめなし）
    this.vocalForMatch = null       // オケと比べる用の声（差し替え後・ノイズ消し前）
    this.viewCenterSec = null       // ずれ補正の波形の真ん中（曲の時間）
    this.vocalStartSec = 0          // 声が始まる所（声の時間）
    this.offsetDrag = null
    this.calibratedMs = this.loadCalibration()
    this.punchStartSec = null // 曲の時間
    this.punchEndSec = null   // 曲の時間（null なら⏹まで）
    this.playhead = null      // { ctxAt, songAt } 再生中だけ
    this.vocalPeaks = null
    this.backingPeaks = null
    this.dragging = false
    this.mode = "idle" // idle / playing / micRecording / punching / calibrating / processing / exporting
    this.mix = this.loadMix()
    this.mixPreset = this.mix.preset || "recommended"
    delete this.mix.preset
    this.mixBypass = false
    this.sections = []  // 部分ごとのミックス（曲ごとなので、この端末にも覚えない）
    this.editId = null
    this.mixSel = null
    this.mixDrag = null
    this.edits = []       // 声の波形編集（声の時間）
    this.editSel = null   // 選んでいる範囲（曲の時間）
    this.editZoom = null  // 拡大して映している範囲（曲の時間）。null＝全体
    this.editDrag = null
    this.detail = this.loadDetail()
    this.buildProPanel()
    this.applyDetailMode()
    this.updateMixControls()
    this.drawWaveform()
    this.updateOffsetDisplay()
    this.updateCalibrationInfo()
    this.updateDenoiseValue()
    this.updatePunchInfo()
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
    this.setAudioSession("playback") // iPhone：消音スイッチがONでも鳴るように
    this.ctx = new AC()
    this.backingGain = this.ctx.createGain()
    this.vocalGain = this.ctx.createGain()
    this.vocalChain = createVocalChain(this.ctx)
    this.master = this.ctx.createGain()
    this.limiter = createLimiter(this.ctx)
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.streamOut = this.ctx.createMediaStreamDestination()

    this.vocalChain.output.connect(this.vocalGain)
    this.backingGain.connect(this.master)
    this.vocalGain.connect(this.master)
    this.master.connect(this.limiter)
    this.limiter.connect(this.ctx.destination)
    this.limiter.connect(this.analyser)
    this.limiter.connect(this.streamOut)
    applyMix(this.vocalChain, settingsAt(this.mixTimeline, 0), { ramp: 0 })
    this.changeVolume()
  }

  // 歌声のつなぎ先（ミックスの入口）
  get vocalInput() {
    return this.vocalChain.input
  }

  // ---------- ミックス（F3-3）＋ 部分ごとのミックス（K19〜K21） ----------
  // this.mix        … 曲全体の設定（部分の指示がない所）
  // this.sections[] … 部分ごとの指示 { id, name, startSec, endSec, preset, settings }（曲の時間）
  // this.editId     … いま編集している部分（null＝曲全体）

  // 今鳴らす設定の並び（聴き比べ中は「エフェクトなし」）
  get mixTimeline() {
    return { base: this.mix, sections: this.sections, bypass: this.mixBypass }
  }

  // 書き出しの余韻・曲全体の設定（響きの長さは共通）
  get activeMix() {
    return this.mixBypass ? MIX_PRESETS.off.settings : this.mix
  }

  get editingSection() {
    return this.sections.find((s) => s.id === this.editId) || null
  }

  // スライダー・雰囲気ボタンが変える設定
  get editingSettings() {
    return this.editingSection ? this.editingSection.settings : this.mix
  }

  get editingPreset() {
    return this.editingSection ? this.editingSection.preset : this.mixPreset
  }

  set editingPreset(name) {
    if (this.editingSection) this.editingSection.preset = name
    else this.mixPreset = name
  }

  loadMix() {
    try {
      const v = JSON.parse(window.localStorage.getItem(MIX_KEY) || "null")
      if (v && typeof v === "object") return { ...DEFAULT_MIX, ...v }
    } catch (e) {}
    return { ...DEFAULT_MIX }
  }

  saveMix() {
    try { window.localStorage.setItem(MIX_KEY, JSON.stringify({ ...this.mix, preset: this.mixPreset })) } catch (e) {}
  }

  // スライダーを動かしたら、鳴っている音にすぐ反映する（再生中でもOK）
  changeMix(event) {
    const key = event.currentTarget.dataset.mixKey
    const target = key === "reverbLength" ? this.mix : this.editingSettings // 長さは曲全体で共通
    target[key] = Number(event.currentTarget.value)
    // かんたんスライダーが効くように、詳細モードでいじった同じ値は消す
    if (target.pro) (SIMPLE_LINKS[key] || []).forEach((k) => { delete target.pro[k] })
    this.editingPreset = "custom"
    this.mixBypass = false
    this.refreshMix()
  }

  applyPreset(event) {
    const name = event.currentTarget.dataset.preset
    const preset = MIX_PRESETS[name]
    if (!preset) return
    const next = { ...DEFAULT_MIX, ...preset.settings, pro: { ...(preset.settings.pro || {}) } }
    if (this.editingSection) {
      delete next.reverbLength
      this.editingSection.settings = next
    } else {
      // 響きの元（曲全体で共通）の詳細値は残す
      const keep = {}
      GLOBAL_PRO_KEYS.filter((k) => k !== "reverbLength").forEach((k) => { if (this.mix.pro && k in this.mix.pro) keep[k] = this.mix.pro[k] })
      next.pro = { ...keep, ...next.pro }
      this.mix = next
    }
    this.editingPreset = name
    this.mixBypass = false
    this.refreshMix()
    const where = this.editingSection ? `「${this.sectionLabel(this.editingSection)}」` : "曲全体"
    this.setStatus(`${where}のミックス：${preset.label}（${preset.hint}）。▶試聴しながらスライダーで微調整できます`)
  }

  // エフェクトあり／なしの聴き比べ（設定は消さない）
  toggleMixBypass() {
    this.mixBypass = !this.mixBypass
    this.refreshMix({ save: false })
    this.setStatus(this.mixBypass ? "エフェクトなしで鳴らしています（もう一度押すと戻ります）" : "エフェクトありに戻しました")
  }

  // 書き出しは必ずエフェクトありで（聴き比べのまま書き出さないように）
  endMixBypass() {
    if (!this.mixBypass) return
    this.mixBypass = false
    this.refreshMix({ save: false })
  }

  // 曲の fromSec 秒目が ctxAt に鳴るように、部分ごとの切りかえを予約する
  scheduleMix(ctxAt, fromSec) {
    if (this.vocalChain) scheduleMixTimeline(this.vocalChain, this.mixTimeline, ctxAt, fromSec)
  }

  // 今鳴っている曲の位置（鳴っていなければ null）
  get songNow() {
    if (!this.playhead || !this.ctx) return null
    return this.playhead.songAt + (this.ctx.currentTime - this.playhead.ctxAt)
  }

  refreshMix({ save = true } = {}) {
    if (this.vocalChain) {
      const now = this.songNow
      if (now !== null) {
        // 再生中：今の位置から先の切りかえを予約し直す
        scheduleMixTimeline(this.vocalChain, this.mixTimeline, this.ctx.currentTime, Math.max(0, now), { live: true })
      } else {
        // 止まっている：曲全体の設定（部分を編集中ならその設定）にしておく
        applyMix(this.vocalChain, settingsAt(this.mixTimeline, this.editingSection ? this.editingSection.startSec : 0))
      }
    }
    if (save) this.saveMix()
    this.updateMixControls()
  }

  updateMixControls() {
    const fmt = {
      lowCut: (v) => `${Math.round(20 + (v / 100) * 160)}Hz`,
      mudCut: (v) => `−${((v / 100) * 6).toFixed(1)}dB`,
      air: (v) => `+${((v / 100) * 6).toFixed(1)}dB`,
      comp: (v) => (v === 0 ? "なし" : `${v}`),
      reverb: (v) => (v === 0 ? "なし" : `${v}`),
      reverbLength: (v) => `${Number(v).toFixed(1)}秒`
    }
    const settings = { ...this.editingSettings, reverbLength: this.mix.reverbLength }
    this.mixSliderTargets.forEach((el) => { el.value = String(settings[el.dataset.mixKey]) })
    this.mixValueTargets.forEach((el) => {
      const key = el.dataset.mixKey
      el.textContent = fmt[key] ? fmt[key](settings[key]) : String(settings[key])
    })
    this.presetButtonTargets.forEach((el) => {
      el.setAttribute("aria-pressed", String(el.dataset.preset === this.editingPreset && !this.mixBypass))
    })
    if (this.hasPresetHintTarget) {
      const p = MIX_PRESETS[this.editingPreset]
      this.presetHintTarget.textContent = p ? p.hint : "自分で調整した設定"
    }
    if (this.hasMixBypassButtonTarget) {
      this.mixBypassButtonTarget.setAttribute("aria-pressed", String(this.mixBypass))
      this.mixBypassButtonTarget.textContent = this.mixBypass ? "✨ エフェクトありに戻す" : "🎧 エフェクトなしで聴く"
    }
    this.updateProPanel()
    this.updateSectionControls()
  }

  // ---------- 詳細モード（③：本物の値を直接いじる） ----------

  loadDetail() {
    try { return window.localStorage.getItem(DETAIL_KEY) === "1" } catch (e) { return false }
  }

  toggleDetail() {
    this.detail = !this.detail
    try { window.localStorage.setItem(DETAIL_KEY, this.detail ? "1" : "0") } catch (e) {}
    this.applyDetailMode()
    this.setStatus(this.detail
      ? "🛠 詳細モード：EQ・コンプ・リバーブ・エコーの数値と、声の波形編集が使えます"
      : "かんたんモードに戻しました（詳細でいじった値はそのまま効いています）")
  }

  applyDetailMode() {
    this.element.dataset.detail = this.detail ? "on" : "off"
    if (this.hasDetailToggleTarget) {
      this.detailToggleTarget.setAttribute("aria-pressed", String(this.detail))
      this.detailToggleTarget.textContent = this.detail ? "🙂 かんたんモードに戻す" : "🛠 詳細モード（もっと細かく）"
    }
  }

  // スライダーの位置（0〜1000）⇄ 本物の値。周波数は耳の感じ方に合わせて対数で
  proToSlider(d, v) {
    if (d.log) return Math.round((Math.log(v / d.min) / Math.log(d.max / d.min)) * 1000)
    return Math.round(((v - d.min) / (d.max - d.min)) * 1000)
  }

  sliderToPro(d, pos) {
    const t = Math.max(0, Math.min(1000, pos)) / 1000
    const v = d.log ? d.min * Math.pow(d.max / d.min, t) : d.min + (d.max - d.min) * t
    return Math.round(v / d.step) * d.step
  }

  formatPro(d, v) {
    const digits = d.step < 0.1 ? 2 : d.step < 1 ? 1 : 0
    if (d.key === "pan") return Math.abs(v) < 0.005 ? "真ん中" : v < 0 ? `左 ${Math.round(-v * 100)}` : `右 ${Math.round(v * 100)}`
    if (d.unit === "Hz" && v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)}kHz`
    return `${Number(v).toFixed(digits)}${d.unit}`
  }

  buildProPanel() {
    if (!this.hasProPanelTarget) return
    const panel = this.proPanelTarget
    panel.replaceChildren()
    Object.entries(PRO_GROUPS).forEach(([group, title]) => {
      const box = document.createElement("div")
      box.className = "sg-group"
      const h = document.createElement("h3")
      h.className = "sg-group__title"
      h.textContent = title
      box.appendChild(h)
      PRO_PARAMS.filter((d) => d.group === group).forEach((d) => {
        const row = document.createElement("div")
        row.className = "sg-pro"
        const id = `sg-pro-${d.key}`
        row.innerHTML = `<label for="${id}">${d.label}${d.global ? " <small>（曲全体）</small>" : ""}</label>`
        const range = document.createElement("input")
        range.type = "range"
        range.id = id
        range.min = "0"
        range.max = "1000"
        range.step = "1"
        range.dataset.proKey = d.key
        range.dataset.action = "input->singing-mixer#changePro"
        const num = document.createElement("input")
        num.type = "number"
        num.className = "sg-num-input"
        num.min = String(d.min)
        num.max = String(d.max)
        num.step = String(d.step)
        num.dataset.proKey = d.key
        num.dataset.proNumber = "1"
        num.dataset.action = "change->singing-mixer#changePro"
        num.setAttribute("aria-label", `${d.label}（${d.unit || "値"}）`)
        const val = document.createElement("span")
        val.className = "sg-val"
        val.dataset.proValue = d.key
        row.append(range, num, val)
        if (d.help) {
          const help = document.createElement("small")
          help.textContent = d.help
          row.appendChild(help)
        }
        box.appendChild(row)
      })
      panel.appendChild(box)
    })
  }

  // 今編集している所の、本物の値
  get editingParams() {
    const s = this.editingSection
    const base = this.mix
    const settings = s
      ? { ...s.settings, reverbLength: base.reverbLength, pro: { ...(s.settings.pro || {}), ...this.globalPro() } }
      : base
    return mixParams(settings)
  }

  globalPro() {
    const pro = {}
    GLOBAL_PRO_KEYS.forEach((k) => { if (this.mix.pro && k in this.mix.pro) pro[k] = this.mix.pro[k] })
    return pro
  }

  updateProPanel() {
    if (!this.hasProPanelTarget) return
    const p = this.editingParams
    const byKey = Object.fromEntries(PRO_PARAMS.map((d) => [d.key, d]))
    this.proPanelTarget.querySelectorAll("[data-pro-key]").forEach((el) => {
      const d = byKey[el.dataset.proKey]
      if (document.activeElement === el && el.dataset.proNumber) return // 入力中は書き換えない
      el.value = el.dataset.proNumber ? String(p[d.key]) : String(this.proToSlider(d, p[d.key]))
    })
    this.proPanelTarget.querySelectorAll("[data-pro-value]").forEach((el) => {
      const d = byKey[el.dataset.proValue]
      el.textContent = this.formatPro(d, p[d.key])
    })
  }

  changePro(event) {
    const el = event.currentTarget
    const d = PRO_PARAMS.find((x) => x.key === el.dataset.proKey)
    if (!d) return
    let v = el.dataset.proNumber ? Number(el.value) : this.sliderToPro(d, Number(el.value))
    if (!Number.isFinite(v)) return
    v = Math.max(d.min, Math.min(d.max, v))
    // かんたんスライダーの値（reverbLength）と、響きの元の値は曲全体へ
    if (d.key === "reverbLength") {
      this.mix.reverbLength = v
      if (this.mix.pro) delete this.mix.pro.reverbLength
    } else {
      const target = d.global ? this.mix : this.editingSettings
      target.pro = { ...(target.pro || {}), [d.key]: v }
    }
    this.editingPreset = "custom"
    this.mixBypass = false
    this.refreshMix()
  }

  // 詳細でいじった値を消して、かんたんの値に戻す（編集中の所だけ）
  resetPro() {
    const target = this.editingSettings
    target.pro = this.editingSection ? {} : this.globalPro()
    this.refreshMix()
    this.setStatus("詳細の値を元に戻しました（かんたんスライダーと雰囲気ボタンの値になります）")
  }

  // ---------- 部分を決める（K19：まずは手で分ける） ----------

  sectionLabel(s) {
    return `${s.name} ${this.formatSec(s.startSec)}〜${this.formatSec(s.endSec)}`
  }

  get mixTimelineLength() {
    return this.timelineLength
  }

  mixTimeAt(event) {
    const rect = this.mixTimelineTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left))
    return (x / rect.width) * this.mixTimelineLength
  }

  // 部分の上を押す＝その部分を編集。何もない所を押したまま横にずらす＝新しい範囲を選ぶ
  mixTimelineDown(event) {
    if (!this.backingBuffer && !this.vocalBuffer) return
    const t = this.mixTimeAt(event)
    const hit = this.sections.find((s) => t >= s.startSec && t < s.endSec)
    this.mixDrag = { from: t, moved: false, hit }
    this.mixTimelineTarget.setPointerCapture?.(event.pointerId)
  }

  mixTimelineMove(event) {
    const d = this.mixDrag
    if (!d || d.hit) return // 部分の上からは新しい範囲を作らない（重なるので）
    const t = this.mixTimeAt(event)
    if (Math.abs(t - d.from) < 0.3 && !d.moved) return
    d.moved = true
    const a = Math.min(t, d.from)
    const b = Math.max(t, d.from)
    // ほかの部分と重ならないように、となりの部分の端で止める
    const left = Math.max(0, ...this.sections.filter((s) => s.endSec <= d.from).map((s) => s.endSec))
    const right = Math.min(this.mixTimelineLength, ...this.sections.filter((s) => s.startSec >= d.from).map((s) => s.startSec))
    this.mixSel = { startSec: Math.max(a, left), endSec: Math.min(b, right) }
  }

  mixTimelineUp() {
    const d = this.mixDrag
    if (!d) return
    this.mixDrag = null
    if (!d.moved) {
      this.mixSel = null
      this.editId = d.hit ? d.hit.id : null // 何もない所を押したら「曲全体」に戻る
      this.refreshMix({ save: false })
      return
    }
    if (this.mixSel && this.mixSel.endSec - this.mixSel.startSec < 0.5) this.mixSel = null
    this.updateSectionControls()
  }

  addSection() {
    if (!this.mixSel) return
    const s = {
      id: `s${Date.now()}`,
      name: this.sectionNameTarget.value,
      startSec: this.mixSel.startSec,
      endSec: this.mixSel.endSec,
      preset: this.mixPreset,
      // はじめは曲全体と同じ設定 → 雰囲気ボタンで変える
      settings: (({ reverbLength, pro, ...rest }) => ({ ...rest, pro: { ...(pro || {}) } }))(this.mix)
    }
    this.sections.push(s)
    this.sections.sort((a, b) => a.startSec - b.startSec)
    this.mixSel = null
    this.editId = s.id
    this.refreshMix({ save: false })
    this.setStatus(`「${this.sectionLabel(s)}」を作りました。雰囲気ボタン（🔥盛り上げる など）でこの部分だけのミックスを選んでね`)
  }

  deleteSection() {
    const s = this.editingSection
    if (!s) return
    this.sections = this.sections.filter((x) => x.id !== s.id)
    this.editId = null
    this.refreshMix({ save: false })
    this.setStatus(`「${this.sectionLabel(s)}」の指示を消しました（その部分は曲全体の設定に戻ります）`)
  }

  selectSection(event) {
    const id = event.currentTarget.dataset.sectionId || null
    this.editId = id
    this.mixSel = null
    this.refreshMix({ save: false })
  }

  renameSection() {
    const s = this.editingSection
    if (!s) return
    s.name = this.sectionNameTarget.value
    this.updateSectionControls()
  }

  // 選んでいる部分を、1秒前から試聴（切りかわりも聴けるように）
  async playSection() {
    const s = this.editingSection
    const range = s || this.mixSel
    if (!range || this.mode !== "idle") return
    this.ensureContext()
    await this.ctx.resume()
    const from = Math.max(0, range.startSec - 1)
    this.setMode("playing")
    this.startSources(() => {
      this.setMode("idle")
      this.setStatus("試聴おわり")
    }, { fromSec: from, untilSec: range.endSec + 1 })
    this.setStatus(`${s ? `「${this.sectionLabel(s)}」` : "選んだ範囲"}を試聴中…（スライダーはそのまま動かせます）`)
  }

  updateSectionControls() {
    if (!this.hasSectionListTarget) return
    const s = this.editingSection
    // 編集先のタブ
    const tabs = [{ id: "", label: "🎵 曲全体", active: !s }].concat(
      this.sections.map((x) => ({ id: x.id, label: `${x.name} ${this.formatSec(x.startSec)}〜${this.formatSec(x.endSec)}`, active: s && s.id === x.id, preset: x.preset }))
    )
    this.sectionListTarget.replaceChildren(...tabs.map((t) => {
      const b = document.createElement("button")
      b.type = "button"
      b.className = "sg-tab"
      b.dataset.sectionId = t.id
      b.dataset.action = "singing-mixer#selectSection"
      b.setAttribute("aria-pressed", String(!!t.active))
      b.textContent = t.preset && MIX_PRESETS[t.preset] ? `${t.label}・${MIX_PRESETS[t.preset].label}` : t.label
      return b
    }))
    if (this.hasEditingLabelTarget) {
      this.editingLabelTarget.textContent = s ? `「${this.sectionLabel(s)}」だけ` : this.sections.length ? "曲全体（指示を付けていない所）" : "曲全体"
    }
    if (s && this.hasSectionNameTarget) this.sectionNameTarget.value = s.name
    if (this.hasAddSectionButtonTarget) this.addSectionButtonTarget.disabled = !this.mixSel
    if (this.hasDeleteSectionButtonTarget) this.deleteSectionButtonTarget.disabled = !s
    if (this.hasPlaySectionButtonTarget) this.playSectionButtonTarget.disabled = !(this.mode === "idle" && (s || this.mixSel))
    if (this.hasSectionInfoTarget) {
      this.sectionInfoTarget.textContent = this.mixSel
        ? `選んだ範囲：${this.formatSec(this.mixSel.startSec)}〜${this.formatSec(this.mixSel.endSec)} →「＋この範囲に指示を付ける」`
        : s
          ? "この部分のスライダーを動かすと、この部分だけ変わります。境目は0.6秒かけてなめらかに切りかわります"
          : "下の波形を押したまま横にずらして、Aメロ・サビなどの範囲を選んでね"
    }
    // 響きの長さは曲全体で共通
    this.mixSliderTargets.forEach((el) => { if (el.dataset.mixKey === "reverbLength") el.disabled = !!s })
  }

  // 部分ごとのミックスの波形：部分＝色の帯、選んでいる範囲＝黄色
  drawMixTimeline() {
    if (!this.hasMixTimelineTarget) return
    const c = this.mixTimelineTarget
    const u = this.fitCanvas(c)
    const g = c.getContext("2d")
    const w = c.width
    const h = c.height
    const len = this.mixTimelineLength
    const toX = (sec) => (sec / len) * w
    g.fillStyle = "#0e1a33"
    g.fillRect(0, 0, w, h)

    const colors = ["rgba(79,182,255,0.30)", "rgba(140,120,255,0.30)", "rgba(80,220,200,0.28)", "rgba(255,150,90,0.28)"]
    g.font = `bold ${14 * u}px sans-serif`
    g.textAlign = "left"
    this.sections.forEach((s, i) => {
      const x = toX(s.startSec)
      const bw = Math.max(2, toX(s.endSec) - x)
      const active = s.id === this.editId
      g.fillStyle = active ? "rgba(255,255,255,0.22)" : colors[i % colors.length]
      g.fillRect(x, 0, bw, h)
      if (active) { g.strokeStyle = "#ffffff"; g.lineWidth = 2 * u; g.strokeRect(x + u, u, bw - 2 * u, h - 2 * u) }
      g.save()
      g.beginPath(); g.rect(x, 0, bw, h); g.clip()
      g.fillStyle = "#ffffff"
      g.fillText(s.name, x + 6 * u, 18 * u)
      const p = MIX_PRESETS[s.preset]
      g.font = `${11 * u}px sans-serif`
      g.fillStyle = "rgba(255,255,255,0.8)"
      g.fillText(p ? p.label : "🎛 カスタム", x + 6 * u, 33 * u)
      g.font = `bold ${14 * u}px sans-serif`
      g.restore()
    })

    const drawPeaks = (peaks, durSec, startSec, color) => {
      if (!peaks || !durSec) return
      g.fillStyle = color
      const step = durSec / peaks.length
      for (let i = 0; i < peaks.length; i++) {
        const x = toX(startSec + i * step)
        const ph = peaks[i] * h * 0.55
        g.fillRect(x, h * 0.62 - ph / 2, Math.max(1, toX(startSec + (i + 1) * step) - x), ph)
      }
    }
    drawPeaks(this.backingPeaks, this.backingBuffer?.duration, 0, "rgba(150,175,230,0.35)")
    drawPeaks(this.vocalPeaks, this.vocalBuffer?.duration, this.vocalOffsetMs / 1000, "#4fb6ff")

    if (this.mixSel) {
      const x = toX(this.mixSel.startSec)
      g.fillStyle = "rgba(255,215,90,0.28)"
      g.fillRect(x, 0, toX(this.mixSel.endSec) - x, h)
      g.fillStyle = "#ffd75a"
      g.fillRect(x - u, 0, 2 * u, h)
      g.fillRect(toX(this.mixSel.endSec) - u, 0, 2 * u, h)
    }
    const now = this.songNow
    if (now !== null && now >= 0) {
      g.fillStyle = "#ffffff"
      g.fillRect(toX(now) - u, 0, 2 * u, h)
    }
  }

  // ---------- 🪄 おまかせ（①：知識がなくても本格的に） ----------

  // 声とオケを聴き比べて、バランス・コンプ・明るさを自動で決める（決めたあとは手で直せる）
  async autoMix() {
    if (!this.vocalBuffer || this.mode !== "idle") {
      this.setStatus("おまかせミックスは、オケと歌声を入れてから使えます")
      return
    }
    this.setMode("processing")
    this.setStatus("🪄 声とオケを分析しています…")
    await new Promise((resolve) => setTimeout(resolve, 30))
    try {
      const v = analyzeLevels(this.vocalBuffer)
      const b = this.backingBuffer ? analyzeLevels(this.backingBuffer) : null
      // 声量のばらつきが大きいほど、コンプを強く
      const comp = v.spreadDb > 14 ? 75 : v.spreadDb > 9 ? 60 : v.spreadDb > 5 ? 45 : 30
      // こもった声ほど明るく
      const air = v.brightness < 0.15 ? 65 : v.brightness < 0.3 ? 50 : v.brightness < 0.5 ? 35 : 20
      this.mix = { ...DEFAULT_MIX, comp, air, reverbLength: this.mix.reverbLength, pro: { ...this.globalPro() } }
      this.mixPreset = "custom"
      this.mixBypass = false
      // 声がオケより少しだけ大きく聴こえるように（コンプで上がるぶんも見込む）
      const notes = []
      if (b && b.rms > 0 && v.rms > 0) {
        const backing = 0.8
        const makeup = Math.pow(10, (mixParams(this.mix).makeupDb * 0.5) / 20)
        const vocal = Math.max(0.2, Math.min(1.5, (backing * b.rms * 1.15) / (v.rms * makeup)))
        this.backingVolumeTarget.value = String(backing)
        this.vocalVolumeTarget.value = vocal.toFixed(2)
        this.changeVolume()
        notes.push(`声の音量 ${Math.round(vocal * 100)}%`)
      }
      notes.push(`声量のならし ${comp}`, `明るさ ${air}`)
      this.refreshMix()
      this.setStatus(`🪄 おまかせ完了：${notes.join("・")}。▶試聴して、好みで雰囲気ボタンやスライダーを変えてね`)
    } catch (e) {
      console.error(e)
      this.setStatus("おまかせミックスに失敗しました")
    }
    this.setMode("idle")
  }

  // サビっぽい所（オケが盛り上がっている所）を探して「🔥盛り上げる」を付ける（K19②）
  findChoruses() {
    if (!this.backingBuffer || this.mode !== "idle") {
      if (!this.backingBuffer) this.setStatus("サビを探すには、先に 🎼オケを入れてね")
      return
    }
    const found = suggestChoruses(this.backingBuffer)
    const free = found.filter((r) => !this.sections.some((s) => r.startSec < s.endSec && r.endSec > s.startSec))
    if (!free.length) {
      this.setStatus(found.length ? "サビっぽい所には、もう指示が付いています" : "サビっぽい所が見つかりませんでした（波形をドラッグして手で選んでね）")
      return
    }
    const hype = MIX_PRESETS.hype.settings
    free.forEach((r, i) => {
      this.sections.push({
        id: `s${Date.now()}${i}`,
        name: "サビ",
        startSec: r.startSec,
        endSec: r.endSec,
        preset: "hype",
        settings: (({ reverbLength, ...rest }) => ({ ...rest, pro: {} }))(hype)
      })
    })
    this.sections.sort((a, b) => a.startSec - b.startSec)
    this.editId = null
    this.refreshMix({ save: false })
    this.setStatus(`🪄 サビっぽい所を${free.length}か所見つけて「🔥盛り上げる」を付けました（目安です。帯を押すと直せます）`)
  }

  // 録った声の大きさをチェックして、分かる言葉で教える
  levelAdvice(buffer) {
    const { rms, peak } = analyzeLevels(buffer)
    if (peak >= 0.985) return " ⚠ 音が割れているかも：マイクから少し離れるか、マイクの音量を下げて録り直すとキレイになります"
    if (rms > 0 && rms < 0.02) return " ⚠ 声が小さめ：マイクに少し近づくと、雑音が目立たなくなります"
    return " ✅ 録音の大きさはちょうどいい感じ"
  }

  // 画面の上の「次にやること」
  updateGuide() {
    if (!this.hasGuideTarget) return
    let text
    if (this.mode === "micRecording" || this.mode === "punching") text = "🔴 録音中。歌い終わったら下の ⏹ 録音停止"
    else if (this.mode === "exporting") text = "⏳ 書き出し中。このタブを開いたまま待ってね"
    else if (!this.backingBuffer) text = "まずは ① で 🎼オケ（伴奏）のファイルを入れよう"
    else if (!this.vocalBase) text = "次は ② の「🎙 マイクで録音」。ヘッドホンをつけて、カウントの4つ目で手拍子 👏"
    else if (!this.sections.length && this.mixPreset === "recommended") text = "④ の「🪄 おまかせミックス」を押すと、声とオケを分析していい感じに整えます"
    else text = "▶ 試聴して気に入ったら ⑤ で保存。もっと細かくしたいときは ④ の「🛠 詳細モード」"
    if (this.guideTarget.textContent !== text) this.guideTarget.textContent = text
  }

  // ---------- ✂️ 声の波形編集（③：詳細モード） ----------

  get editRange() {
    const len = this.timelineLength
    return this.editZoom || { startSec: 0, endSec: len }
  }

  editTimeAt(event) {
    const rect = this.editViewTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left))
    const r = this.editRange
    return r.startSec + (x / rect.width) * (r.endSec - r.startSec)
  }

  editViewDown(event) {
    if (!this.vocalBuffer) return
    const t = this.editTimeAt(event)
    this.editDrag = { from: t }
    this.editSel = { startSec: t, endSec: t }
    this.editViewTarget.setPointerCapture?.(event.pointerId)
    this.updateEditControls()
  }

  editViewMove(event) {
    if (!this.editDrag) return
    const t = this.editTimeAt(event)
    this.editSel = { startSec: Math.min(t, this.editDrag.from), endSec: Math.max(t, this.editDrag.from) }
    this.updateEditControls()
  }

  editViewUp() {
    if (!this.editDrag) return
    this.editDrag = null
    if (this.editSel && this.editSel.endSec - this.editSel.startSec < 0.01) this.editSel = null
    this.updateEditControls()
  }

  // 秒の数字で範囲を直す（細かく合わせたいとき）
  changeEditRange() {
    const a = Number(this.editStartTarget.value)
    const b = Number(this.editEndTarget.value)
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return
    this.editSel = { startSec: Math.max(0, a), endSec: b }
    this.updateEditControls()
  }

  zoomEdit() {
    if (!this.editSel) return
    const pad = Math.max(0.2, (this.editSel.endSec - this.editSel.startSec) * 0.25)
    this.editZoom = { startSec: Math.max(0, this.editSel.startSec - pad), endSec: this.editSel.endSec + pad }
  }

  zoomEditAll() {
    this.editZoom = null
  }

  async applyEdit(event) {
    if (!this.editSel || !this.vocalBase || this.mode !== "idle") return
    const type = event.currentTarget.dataset.editType
    const offsetSec = this.vocalOffsetMs / 1000
    const db = type === "gain" ? Number(event.currentTarget.dataset.editDb ?? this.editGainDbTarget.value) : 0
    if (type === "gain" && !Number.isFinite(db)) return
    // 選んだのは曲の時間 → 声の時間に直して覚える（あとでずれ補正を変えても、声と一緒に動く）
    this.edits.push({ type, startSec: this.editSel.startSec - offsetSec, endSec: this.editSel.endSec - offsetSec, db })
    await this.rebuildVocal()
    const names = { silence: "無音にしました", gain: `音量を ${db > 0 ? "+" : ""}${db}dB 変えました`, fadeIn: "フェードインにしました", fadeOut: "フェードアウトにしました" }
    this.setStatus(`✂️ ${this.formatSec(this.editSel.startSec)}〜${this.formatSec(this.editSel.endSec)} を${names[type]}（↩ 編集を戻す でやり直せます）`)
    this.updateEditControls()
  }

  async undoEdit() {
    if (!this.edits.length || this.mode !== "idle") return
    this.edits.pop()
    await this.rebuildVocal()
    this.setStatus(`編集を1つ戻しました（残り ${this.edits.length}）`)
    this.updateEditControls()
  }

  async clearEdits() {
    if (!this.edits.length || this.mode !== "idle") return
    this.edits = []
    await this.rebuildVocal()
    this.setStatus("波形の編集を全部やめました")
    this.updateEditControls()
  }

  async playEditSel() {
    if (!this.editSel || this.mode !== "idle") return
    this.ensureContext()
    await this.ctx.resume()
    this.setMode("playing")
    this.startSources(() => { this.setMode("idle"); this.setStatus("試聴おわり") },
      { fromSec: Math.max(0, this.editSel.startSec - 0.5), untilSec: this.editSel.endSec + 0.5 })
    this.setStatus("選んだ範囲を前後0.5秒つけて試聴中…")
  }

  updateEditControls() {
    if (!this.hasEditInfoTarget) return
    const sel = this.editSel
    const fmt = (v) => v.toFixed(3)
    if (sel) {
      if (document.activeElement !== this.editStartTarget) this.editStartTarget.value = fmt(sel.startSec)
      if (document.activeElement !== this.editEndTarget) this.editEndTarget.value = fmt(sel.endSec)
    }
    this.editInfoTarget.textContent = sel
      ? `選んだ範囲：${this.formatSec(sel.startSec)}〜${this.formatSec(sel.endSec)}（${(sel.endSec - sel.startSec).toFixed(3)}秒）。編集 ${this.edits.length}個`
      : `声の波形を押したまま横にずらして、加工したい所を選んでね。編集 ${this.edits.length}個`
    const can = !!(sel && this.vocalBase && this.mode === "idle")
    this.element.querySelectorAll("[data-needs-edit-sel]").forEach((el) => { el.disabled = !can })
    this.editUndoButtonTarget.disabled = !(this.edits.length && this.mode === "idle")
    this.editClearButtonTarget.disabled = !(this.edits.length && this.mode === "idle")
  }

  // ---------- 📱 スマホ対応 ----------

  // 波形のキャンバスを、表示の大きさ×画面の細かさに合わせる（スマホで文字がつぶれないように）
  // 戻り値＝1px あたりの点の数（文字や線の太さに掛ける）
  fitCanvas(c) {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const W = Math.round(c.clientWidth * dpr)
    const H = Math.round(c.clientHeight * dpr)
    if (W > 0 && H > 0 && (c.width !== W || c.height !== H)) {
      c.width = W
      c.height = H
    }
    return dpr
  }

  // iPhone：マナーモード（消音スイッチ）でも音が出るように、録音中だけ「録音と再生」にする
  setAudioSession(type) {
    try { if (navigator.audioSession) navigator.audioSession.type = type } catch (e) {}
  }

  // 声の波形編集のキャンバス
  drawEditView() {
    if (!this.hasEditViewTarget || this.element.dataset.detail !== "on") return
    const c = this.editViewTarget
    const u = this.fitCanvas(c)
    const g = c.getContext("2d")
    const w = c.width
    const h = c.height
    const r = this.editRange
    const span = Math.max(0.01, r.endSec - r.startSec)
    const toX = (sec) => ((sec - r.startSec) / span) * w
    g.fillStyle = "#0e1a33"
    g.fillRect(0, 0, w, h)

    // 声の波形（その場で計算するので、拡大しても細かく見える）
    if (this.vocalBuffer) {
      const d = this.vocalBuffer.getChannelData(0)
      const sr = this.vocalBuffer.sampleRate
      const offsetSec = this.vocalOffsetMs / 1000
      const cols = Math.min(1200, Math.round(w / u))
      const colSec = span / cols
      g.fillStyle = "#4fb6ff"
      for (let i = 0; i < cols; i++) {
        const s = r.startSec + i * colSec - offsetSec
        if (s + colSec < 0 || s >= this.vocalBuffer.duration) continue
        const a = Math.max(0, Math.floor(s * sr))
        const b = Math.min(d.length, Math.floor((s + colSec) * sr))
        const stride = Math.max(1, Math.floor((b - a) / 200))
        let m = 0
        for (let j = a; j < b; j += stride) { const v = Math.abs(d[j]); if (v > m) m = v }
        const ph = Math.max(1, Math.min(1, m) * h * 0.9)
        g.fillRect((i / cols) * w, h / 2 - ph / 2, Math.ceil(w / cols), ph)
      }
      // 加工した所（オレンジのふち）
      g.strokeStyle = "rgba(255,170,80,0.9)"
      g.lineWidth = 2 * u
      this.edits.forEach((e) => {
        const x = toX(e.startSec + offsetSec)
        g.strokeRect(x, u, Math.max(2, toX(e.endSec + offsetSec) - x), h - 2 * u)
      })
    }
    if (this.editSel) {
      const x = toX(this.editSel.startSec)
      g.fillStyle = "rgba(255,215,90,0.28)"
      g.fillRect(x, 0, Math.max(1, toX(this.editSel.endSec) - x), h)
    }
    // 目盛り
    g.fillStyle = "rgba(255,255,255,0.6)"
    g.font = `${12 * u}px sans-serif`
    g.textAlign = "left"
    g.fillText(this.formatSec(r.startSec), 4 * u, 14 * u)
    g.textAlign = "right"
    g.fillText(this.formatSec(r.endSec), w - 4 * u, 14 * u)
    const now = this.songNow
    if (now !== null) { g.fillStyle = "#fff"; g.fillRect(toX(now) - u, 0, 2 * u, h) }
  }

  // ---------- 読み込み ----------

  async loadBacking(event) {
    const file = event.target.files[0]
    event.target.value = "" // 同じファイルを選び直しても読み込めるように
    const buffer = await this.decodeFile(file, "オケ")
    if (buffer) {
      this.backingBuffer = buffer
      this.backingPeaks = waveformPeaks(buffer, 1000)
      if (this.sections.length) {
        // 別の曲になったので、部分ごとの指示は消す
        this.sections = []
        this.editId = null
        this.mixSel = null
        this.refreshMix({ save: false })
      }
    }
    this.updateButtons()
  }

  async loadVocal(event) {
    const file = event.target.files[0]
    event.target.value = ""
    const buffer = await this.decodeFile(file, "歌声")
    if (!buffer) return

    const mono = toMono(buffer)
    // ファイルの声は、一番静かな1秒から部屋の雑音を覚える
    this.lastLatencySec = null // ファイルの声は録音の遅れと関係ない
    const noiseRange = findQuietRange(mono, buffer.sampleRate, 1)
    await this.setVocal({ noiseSource: buffer, base: buffer, noiseRange })
    // K11：静かな所がない声だと、声まで雑音扱いになる → 案内を出す
    const quiet = rmsOf(mono, buffer.sampleRate, noiseRange[0], noiseRange[1])
    const whole = rmsOf(mono, buffer.sampleRate, 0, buffer.duration)
    const noisyHint = whole > 0 && quiet / whole > 0.35
      ? " ⚠ 静かな所が見つからない声なので、ノイズ消しを弱め（20以下）にするか 🎧元の声 と聴き比べてね"
      : ""

    // オケの音もれや手拍子が入っていれば、オケと比べて自動で合わせる
    if (this.backingBuffer) {
      const r = estimateLag(mono, toMono(this.backingBuffer), buffer.sampleRate, OFFSET_LIMIT_MS / 1000)
      if (r && r.score >= 0.2) {
        this.setOffset(-r.lagSec * 1000)
        this.recommendedOffsetMs = this.vocalOffsetMs
        this.autoInfo = `${this.formatMs(this.vocalOffsetMs)}（オケと比較・一致度 ${Math.round(r.score * 100)}%）`
      } else {
        this.setOffset(0)
        this.recommendedOffsetMs = null
        this.autoInfo = "オケと比べても合わせられませんでした（手動で直してね）"
      }
    } else {
      this.setOffset(0)
      this.recommendedOffsetMs = null
      this.autoInfo = "オケを先に入れると自動で合わせます"
    }
    this.updateOffsetDisplay()
    this.focusVocalStart()
    this.setStatus(`歌声を読み込みました（${this.vocalBuffer.duration.toFixed(1)}秒）。自動補正：${this.autoInfo}${noisyHint}`)
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

  // ---------- 歌声を作る（差し替え → ノイズ消し） ----------

  async setVocal({ noiseSource, base, noiseRange }) {
    this.vocalNoiseSource = noiseSource
    this.vocalBase = base
    this.noiseRange = noiseRange
    this.takes = []
    this.edits = []
    this.editSel = null
    this.editZoom = null
    this.viewCenterSec = null // 新しい声の始まりを映し直す
    this.clearPunch()
    await this.rebuildVocal()
  }

  async rebuildVocal() {
    if (!this.vocalBase) {
      this.vocalBuffer = null
      this.vocalForMatch = null
      this.vocalPeaks = null
      return
    }
    const before = this.mode
    let buffer = this.vocalBase
    this.takes.forEach((t) => { buffer = spliceTake(this.ctx, buffer, t.raw, t.startSec, t.endSec) })
    // ノイズ消しは歌っていない所（音もれ・手拍子）も小さくするので、オケと比べるのはこの時点の声
    this.vocalForMatch = buffer
    this.vocalStartSec = this.findVocalStart(buffer)
    // ずれ補正の波形は、最初は「声が始まる所」を映す
    if (this.viewCenterSec === null) this.viewCenterSec = Math.max(OFFSET_VIEW_SEC / 2, this.vocalStartSec + this.vocalOffsetMs / 1000)

    const strength = Number(this.denoiseStrengthTarget.value)
    if (!this.useRaw && strength > 0 && this.noiseRange) {
      this.setMode("processing")
      this.setStatus("✨ ノイズ消し中…（長い曲だと数秒かかります）")
      await new Promise((resolve) => setTimeout(resolve, 30)) // 文字を先に出す
      try {
        // 差し替えたあとに1回だけかける → つなぎ目で雑音の量が変わらない
        buffer = denoise(this.ctx, buffer, {
          strength,
          noiseStart: this.noiseRange[0],
          noiseEnd: this.noiseRange[1],
          noiseBuffer: this.vocalNoiseSource
        })
      } catch (e) {
        console.error(e)
        this.setStatus("ノイズ消しに失敗しました。元の声のまま使います")
      }
    }
    // 波形編集（無音・音量・フェード）は最後にかける → ノイズ消しの強さを変えても編集は残る
    buffer = applyEdits(this.ctx, buffer, this.edits)
    this.vocalBuffer = buffer
    this.vocalPeaks = waveformPeaks(buffer, 1000)
    this.setMode(before === "processing" ? "idle" : before)
  }

  async changeDenoise() {
    this.updateDenoiseValue()
    if (!this.vocalBase || this.mode !== "idle") return
    await this.rebuildVocal()
    this.setStatus(`ノイズ消しの強さ：${this.denoiseStrengthTarget.value}（▶試聴で確かめてね）`)
  }

  previewDenoise() {
    this.updateDenoiseValue()
  }

  async toggleRaw() {
    if (!this.vocalBase || this.mode !== "idle") return
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
    if (mode === "idle") this.playhead = null
    this.updateButtons()
  }

  updateButtons() {
    const idle = this.mode === "idle"
    const hasSound = !!(this.backingBuffer || this.vocalBuffer)
    const hasVocal = !!this.vocalBase
    this.playButtonTarget.disabled = !(idle && hasSound)
    this.recordButtonTarget.disabled = !(idle && hasSound)
    this.audioButtonTarget.disabled = !(idle && hasSound)
    this.micStartButtonTarget.disabled = !(idle && this.backingBuffer)
    this.micStopButtonTarget.disabled = !(this.mode === "micRecording" || this.mode === "punching")
    this.stopButtonTarget.disabled = !(this.mode === "playing" || this.mode === "exporting")
    this.resetButtonTarget.disabled = !(idle && hasVocal)
    this.countInTarget.disabled = !idle
    this.calibrateButtonTarget.disabled = !idle
    this.denoiseStrengthTarget.disabled = !(idle && hasVocal)
    this.rawToggleTarget.disabled = !(idle && hasVocal)
    this.punchButtonTarget.disabled = !(idle && hasVocal && this.backingBuffer && this.punchStartSec !== null)
    this.undoButtonTarget.disabled = !(idle && this.takes.length > 0)
    this.clearPunchButtonTarget.disabled = !(idle && this.punchStartSec !== null)
    this.recalcButtonTarget.disabled = !(idle && this.backingBuffer && hasVocal)
    this.applyButtonTarget.disabled = !(idle && this.recommendedOffsetMs !== null)
    this.offsetSliderTarget.disabled = !(idle && this.vocalBuffer)
    this.previewButtonTarget.disabled = !(idle && hasSound)
    if (this.hasPlayFromButtonTarget) this.playFromButtonTarget.disabled = !(idle && hasSound && this.punchStartSec !== null)
    if (this.sections) this.updateSectionControls()
    if (this.edits) this.updateEditControls()
    this.updateGuide()
    this.element.dataset.mode = this.mode // 画面の色（録音中は赤など）を CSS で切り替える
  }

  // ---------- 音量・ズレ ----------

  changeVolume() {
    if (!this.ctx) { this.updateVolumeLabels(); return }
    this.backingGain.gain.value = parseFloat(this.backingVolumeTarget.value)
    this.vocalGain.gain.value = parseFloat(this.vocalVolumeTarget.value)
    this.updateVolumeLabels()
  }

  updateVolumeLabels() {
    const pct = (el) => `${Math.round(parseFloat(el.value) * 100)}%`
    if (this.hasBackingVolumeValueTarget) this.backingVolumeValueTarget.textContent = pct(this.backingVolumeTarget)
    if (this.hasVocalVolumeValueTarget) this.vocalVolumeValueTarget.textContent = pct(this.vocalVolumeTarget)
  }

  setOffset(ms) {
    this.vocalOffsetMs = Math.max(-OFFSET_LIMIT_MS, Math.min(OFFSET_LIMIT_MS, Math.round(ms)))
    if (this.hasOffsetSliderTarget) this.offsetSliderTarget.value = String(this.vocalOffsetMs)
    this.updateOffsetDisplay()
  }

  // ---------- ずれ補正を見ながら動かす（バー・波形ドラッグ） ----------

  // 声が始まる所（声の時間）。最初に「部屋の雑音の4倍より大きい音」が出た所
  findVocalStart(buffer) {
    const d = buffer.getChannelData(0)
    const sr = buffer.sampleRate
    const step = Math.max(1, Math.round(sr * 0.01))
    let peak = 0
    for (let i = 0; i < d.length; i += step) { const v = Math.abs(d[i]); if (v > peak) peak = v }
    const th = Math.max(peak * 0.15, 1e-3)
    for (let i = 0; i < d.length; i += step) {
      let m = 0
      const end = Math.min(d.length, i + step)
      for (let j = i; j < end; j++) { const v = Math.abs(d[j]); if (v > m) m = v }
      if (m >= th) return i / sr
    }
    return 0
  }

  // バーを動かしたとき：波形もms表示も一緒に動く
  slideOffset() {
    this.setOffset(Number(this.offsetSliderTarget.value))
  }

  slideOffsetDone() {
    this.setStatus(`歌声のずれ補正: ${this.formatMs(this.vocalOffsetMs)}（▶この辺を試聴 で確かめてね）`)
  }

  // 波形の上：声の段（下半分）をつかむとずれ補正、オケの段（上半分）をつかむと映す場所を動かす
  offsetViewDown(event) {
    if (this.mode !== "idle" || !this.vocalBuffer) return
    const rect = this.offsetViewTarget.getBoundingClientRect()
    const onVocal = event.clientY - rect.top > rect.height / 2
    this.offsetDrag = {
      x: event.clientX,
      width: rect.width,
      what: onVocal ? "offset" : "view",
      offset: this.vocalOffsetMs,
      center: this.viewCenterSec
    }
    this.offsetViewTarget.setPointerCapture?.(event.pointerId)
  }

  offsetViewMove(event) {
    const d = this.offsetDrag
    if (!d) return
    const sec = ((event.clientX - d.x) / d.width) * OFFSET_VIEW_SEC
    if (d.what === "offset") {
      this.setOffset(d.offset + sec * 1000)
    } else {
      this.viewCenterSec = Math.max(0, d.center - sec)
    }
  }

  offsetViewUp() {
    if (!this.offsetDrag) return
    const what = this.offsetDrag.what
    this.offsetDrag = null
    if (what === "offset") this.slideOffsetDone()
  }

  // ←→キーで10ms、Shift＋←→で100ms
  offsetKey(event) {
    if (this.mode !== "idle" || !this.vocalBuffer) return
    const step = event.shiftKey ? 100 : 10
    if (event.key === "ArrowLeft") this.setOffset(this.vocalOffsetMs - step)
    else if (event.key === "ArrowRight") this.setOffset(this.vocalOffsetMs + step)
    else return
    event.preventDefault()
    this.slideOffsetDone()
  }

  // 映す場所を「声が始まる所」に戻す
  focusVocalStart() {
    this.viewCenterSec = Math.max(OFFSET_VIEW_SEC / 2, this.vocalStartSec + this.vocalOffsetMs / 1000)
  }

  // 映している4秒だけ流す（F2-8：すぐ試聴）
  async previewView() {
    if (this.mode !== "idle") return
    this.ensureContext()
    await this.ctx.resume()
    const from = Math.max(0, (this.viewCenterSec ?? OFFSET_VIEW_SEC / 2) - OFFSET_VIEW_SEC / 2)
    const offsetSec = this.vocalOffsetMs / 1000
    const at = this.ctx.currentTime + 0.1
    this.stopSources()
    const add = (buffer, gain, songStart) => {
      if (!buffer) return
      const begin = from - songStart
      const when = at + Math.max(0, -begin)
      const off = Math.max(0, begin)
      if (off >= buffer.duration || when >= at + OFFSET_VIEW_SEC) return
      const src = this.ctx.createBufferSource()
      src.buffer = buffer
      src.connect(gain)
      src.start(when, off)
      src.stop(at + OFFSET_VIEW_SEC)
      this.sources.push(src)
    }
    this.scheduleMix(at, from)
    add(this.backingBuffer, this.backingGain, 0)
    add(this.vocalBuffer, this.vocalInput, offsetSec)
    this.playhead = { ctxAt: at, songAt: from }
    this.setMode("playing")
    this.setStatus(`▶ ${this.formatSec(from)} 〜 ${this.formatSec(from + OFFSET_VIEW_SEC)} を試聴中（ずれ補正 ${this.formatMs(this.vocalOffsetMs)}）`)
    this.endTimer = setTimeout(() => {
      this.stopSources()
      this.setMode("idle")
      this.setStatus("試聴おわり。ずれていたら波形かバーを動かしてもう一回 ▶")
    }, (OFFSET_VIEW_SEC + 0.3) * 1000)
  }

  shiftVocalOffset(event) {
    const delta = Number(event.currentTarget.dataset.shiftMs || 0)
    this.setOffset(this.vocalOffsetMs + delta)
    this.setStatus(`歌声のずれ補正: ${this.formatMs(this.vocalOffsetMs)}（▶試聴で確かめてね）`)
  }

  formatMs(ms) {
    return `${ms >= 0 ? "+" : ""}${Math.round(ms)}ms`
  }

  formatSec(sec) {
    const m = Math.floor(sec / 60)
    const s = sec - m * 60
    return `${m}:${s.toFixed(1).padStart(4, "0")}`
  }

  // おすすめのずれ補正を出す（F2-26）。すぐには入れず、「おすすめを採用」で入れる
  async calculateAutoOffset() {
    if (this.mode !== "idle") return null
    if (!this.backingBuffer || !this.vocalForMatch) {
      this.autoInfo = "オケと歌声を両方入れてからおすすめを算出できます"
      this.updateOffsetDisplay()
      return null
    }

    this.setMode("processing")
    this.setStatus("🔍 オケと声を比べています…")
    await new Promise((resolve) => setTimeout(resolve, 30)) // 文字を先に出す
    let result = null
    try {
      result = estimateLag(toMono(this.vocalForMatch), toMono(this.backingBuffer), this.vocalForMatch.sampleRate, OFFSET_LIMIT_MS / 1000)
    } catch (e) {
      console.error(e)
    }

    if (result && result.score >= 0.2) {
      this.recommendedOffsetMs = Math.round(-result.lagSec * 1000)
      this.autoInfo = `${this.formatMs(this.recommendedOffsetMs)}（おすすめ候補・一致度 ${Math.round(result.score * 100)}%）`
      this.setStatus(`おすすめのズレ補正: ${this.formatMs(this.recommendedOffsetMs)}。「おすすめを採用」→ ▶試聴 → 必要なら手動で微調整してね`)
    } else {
      // 📏の値は録音のときにもう引いてあるので、ここでは使わない（二重に引かないため）
      this.recommendedOffsetMs = null
      this.autoInfo = "おすすめなし（オケの音もれや手拍子が少ないと比べられません。手動で微調整してね）"
      this.setStatus(this.autoInfo)
    }
    this.updateOffsetDisplay()
    this.setMode("idle")
    return this.recommendedOffsetMs
  }

  applyRecommendedOffset() {
    if (this.mode !== "idle") return
    if (this.recommendedOffsetMs === null) {
      this.setStatus("おすすめがまだありません。先に「おすすめを再計算」を押してね")
      return
    }
    this.setOffset(this.recommendedOffsetMs)
    this.setStatus(`おすすめのズレ補正を採用: ${this.formatMs(this.vocalOffsetMs)}（▶試聴で確かめてね）`)
  }

  updateOffsetDisplay() {
    if (this.hasOffsetDisplayTarget) this.offsetDisplayTarget.textContent = this.formatMs(this.vocalOffsetMs)
    if (this.hasAutoLatencyTarget) this.autoLatencyTarget.textContent = this.autoInfo
  }

  resetVocal() {
    this.stop()
    this.vocalNoiseSource = null
    this.vocalBase = null
    this.takes = []
    this.vocalBuffer = null
    this.vocalForMatch = null
    this.vocalPeaks = null
    this.noiseRange = null
    this.lastLatencySec = null
    this.recommendedOffsetMs = null
    this.viewCenterSec = null
    this.autoInfo = "なし"
    this.clearPunch()
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

  // 鳴らし始める時刻（ctx の時計）を返す。backingOnly のときはオケだけ鳴らす。fromSec＝曲の何秒目から
  startSources(onEnded, { backingOnly = false, startAt = null, fromSec = 0, untilSec = null } = {}) {
    this.stopSources()
    const at = startAt ?? this.ctx.currentTime + 0.1
    if (!backingOnly) this.scheduleMix(at, fromSec)
    this.scheduleSources(this.ctx, at, this.backingGain, this.vocalInput, { backingOnly, fromSec })
      .forEach((src) => this.sources.push(src))
    // 声の響き（リバーブ）が最後まで鳴り終わるのを待つ
    const length = backingOnly ? (this.backingBuffer?.duration || 0) : this.duration + reverbTail(this.activeMix)
    const endSec = untilSec !== null ? Math.min(untilSec, length) : length
    const waitSec = at - this.ctx.currentTime + Math.max(0, endSec - fromSec) + (untilSec !== null ? 0 : 0.4)
    this.playhead = { ctxAt: at, songAt: fromSec }
    this.endTimer = setTimeout(() => {
      this.stopSources()
      if (onEnded) onEnded()
    }, waitSec * 1000)
    return at
  }

  // 再生と「音声だけ保存」で同じ並べ方を使う（オケはそのまま、歌声だけズレを反映）
  // 曲の fromSec 秒目が startAt に鳴るように並べる
  scheduleSources(ctx, startAt, backingDest, vocalDest, { backingOnly = false, fromSec = 0 } = {}) {
    const list = []
    const add = (buffer, dest, songStart) => {
      const begin = fromSec - songStart // その音の何秒目から鳴らすか
      const off = Math.max(0, begin)
      if (off >= buffer.duration) return
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.connect(dest)
      src.start(startAt + Math.max(0, -begin), off)
      list.push(src)
    }
    if (this.backingBuffer) add(this.backingBuffer, backingDest, 0)
    if (this.vocalBuffer && !backingOnly) add(this.vocalBuffer, vocalDest, this.vocalOffsetMs / 1000)
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
    this.setStatus("試聴中…（ミックスのスライダーは再生中でも動かせます）")
  }

  // 波形で選んだ位置（黄色）から試聴する。サビだけ聴きながらミックスを直したいとき用
  async playFrom() {
    if (this.mode !== "idle" || this.punchStartSec === null) return
    this.ensureContext()
    await this.ctx.resume()
    const from = this.punchStartSec
    this.setMode("playing")
    this.startSources(() => {
      this.setMode("idle")
      this.setStatus("試聴おわり")
    }, { fromSec: from })
    this.setStatus(`${this.formatSec(from)} から試聴中…`)
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
      this.setAudioSession("play-and-record")
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
      this.setAudioSession("playback")
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

  // 遅れの値：最初の録音で使った値 → 📏測った値 → ブラウザの値 の順
  fallbackLatency(stream) {
    if (this.lastLatencySec !== null) return { sec: this.lastLatencySec, method: "最初の録音と同じ遅れ" }
    if (this.calibratedMs !== null) return { sec: this.calibratedMs / 1000, method: "📏 測った値" }
    const outputSec = this.ctx.outputLatency || this.ctx.baseLatency || 0
    const inputSec = stream?.getAudioTracks()[0]?.getSettings?.().latency || 0
    return { sec: outputSec + inputSec, method: "ブラウザの値（📏で測るともっと正確）" }
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

    // 遅れの決め方：手拍子 → 📏測った値 → ブラウザの値 の順（最初の録音なので「前回の値」は使わない）
    this.lastLatencySec = null
    let lat = null
    let method = ""
    if (countIn) {
      const onset = findOnset(mono, sr, rel(clapAt) - 0.15, rel(clapAt) + 0.6, floor)
      if (onset !== null && onset - rel(clapAt) > -0.1 && onset - rel(clapAt) < 0.6) {
        lat = onset - rel(clapAt)
        method = "カウントインの手拍子"
      }
    }
    if (lat === null) {
      const fb = this.fallbackLatency(stream)
      lat = fb.sec
      method = countIn ? `${fb.method}（手拍子が見つからなかった）` : fb.method
    }

    // オケが鳴り始めた位置＋遅れ のところで頭を切る → 声の0秒目＝オケの0秒目
    const base = trimBuffer(this.ctx, buffer, rel(backingAt) + lat)
    if (!base) {
      this.setMode("idle")
      this.setStatus("録音が短すぎました。オケが始まってから歌ってね")
      return
    }
    await this.setVocal({ noiseSource: buffer, base, noiseRange })
    this.lastLatencySec = lat // 途中から録り直すときに使う（F2-25）
    this.setOffset(0)
    this.focusVocalStart()
    this.autoInfo = `${Math.round(lat * 1000)}ms（${method}）`
    this.updateOffsetDisplay()
    this.setMode("idle")
    this.setStatus(`録音OK（${this.vocalBuffer.duration.toFixed(1)}秒）。自動補正：${this.autoInfo}。${this.levelAdvice(base)}`)
  }

  stopMicRecording() {
    this.stopSources()
    if (this.micRecorder && this.micRecorder.state !== "inactive") {
      this.micRecorder.stop() // 続きは startMicRecording / startPunch の await のあと
      this.setStatus("録音を止めました。読み込み中…")
    }
  }

  // ---------- 途中から録り直す（F2-20〜F2-25） ----------

  // 波形の横の位置 → 曲の時間
  get timelineLength() {
    return Math.max(this.duration, this.backingBuffer?.duration || 0, 1)
  }

  timeAt(event) {
    const rect = this.timelineTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left))
    return (x / rect.width) * this.timelineLength
  }

  // 押した所＝録り直しの開始。押したままずらすと終わりの位置も決まる（F2-20 / F2-23）
  timelineDown(event) {
    if (this.mode !== "idle" || !this.vocalBase) return
    this.dragging = true
    this.dragFrom = this.timeAt(event)
    this.punchStartSec = this.dragFrom
    this.punchEndSec = null
    this.timelineTarget.setPointerCapture?.(event.pointerId)
    this.updatePunchInfo()
    this.updateButtons()
  }

  timelineMove(event) {
    if (!this.dragging) return
    const t = this.timeAt(event)
    if (Math.abs(t - this.dragFrom) < 0.3) {
      this.punchStartSec = this.dragFrom
      this.punchEndSec = null
    } else {
      this.punchStartSec = Math.min(t, this.dragFrom)
      this.punchEndSec = Math.max(t, this.dragFrom)
    }
    this.updatePunchInfo()
  }

  timelineUp() {
    if (!this.dragging) return
    this.dragging = false
    this.updatePunchInfo()
    this.updateButtons()
  }

  clearPunch() {
    this.punchStartSec = null
    this.punchEndSec = null
    this.updatePunchInfo()
    if (this.hasPunchButtonTarget) this.updateButtons()
  }

  updatePunchInfo() {
    if (!this.hasPunchInfoTarget) return
    const takes = this.takes.length ? `（録り直し ${this.takes.length}回）` : ""
    if (this.punchStartSec === null) {
      this.punchInfoTarget.textContent = `波形を押して「ここから録り直す」位置を選んでね。押したまま横にずらすと終わりの位置も決められます${takes}`
    } else if (this.punchEndSec === null) {
      this.punchInfoTarget.textContent = `${this.formatSec(this.punchStartSec)} から ⏹ を押すまで録り直します${takes}`
    } else {
      this.punchInfoTarget.textContent = `${this.formatSec(this.punchStartSec)} 〜 ${this.formatSec(this.punchEndSec)} を録り直します${takes}`
    }
  }

  async startPunch() {
    if (this.punchStartSec === null || !this.vocalBase || !this.backingBuffer) return
    this.ensureContext()
    await this.ctx.resume()
    const stream = await this.openMic()
    if (!stream) return

    const P = this.punchStartSec
    const Q = this.punchEndSec
    const preroll = Math.min(PREROLL, P)
    const offsetSec = this.vocalOffsetMs / 1000
    const rec = this.startRecorder(stream) // 2秒前から回しっぱなしにして、あとで切る
    this.stopSources()
    const A = this.ctx.currentTime + 0.1 // 曲の時間 P - preroll が鳴る時刻
    const T = A + preroll                // 曲の時間 P（ここから差し替え）
    this.scheduleMix(A, P - preroll)

    // オケは P の2秒前から
    const songFrom = P - preroll
    if (songFrom < this.backingBuffer.duration) {
      const src = this.ctx.createBufferSource()
      src.buffer = this.backingBuffer
      src.connect(this.backingGain)
      src.start(A, songFrom)
      this.sources.push(src)
    }
    // 今の声は P の手前まで（F2-21。チェックがあれば鳴らさない）
    if (!this.punchMuteTarget.checked && this.vocalBuffer && preroll > 0) {
      const vFrom = songFrom - offsetSec
      const when = A + Math.max(0, -vFrom)
      const begin = Math.max(0, vFrom)
      if (when < T && begin < this.vocalBuffer.duration) {
        const src = this.ctx.createBufferSource()
        src.buffer = this.vocalBuffer
        src.connect(this.vocalInput)
        src.start(when, begin)
        src.stop(T)
        this.sources.push(src)
      }
    }

    // 終わり：決めた位置＋0.3秒 か、オケの最後
    const endSong = Q !== null ? Math.min(Q + 0.3, this.backingBuffer.duration + 0.3) : this.backingBuffer.duration + 0.3
    this.endTimer = setTimeout(() => this.stopMicRecording(), (A + (endSong - songFrom) - this.ctx.currentTime) * 1000)
    this.playhead = { ctxAt: A, songAt: songFrom }
    this.setMode("punching")
    this.setStatus(Q !== null
      ? `🔴 録り直し中… ${preroll.toFixed(0)}秒前から流れます。${this.formatSec(P)} から歌ってね（${this.formatSec(Q)} で自動で止まります）`
      : `🔴 録り直し中… ${preroll.toFixed(0)}秒前から流れます。${this.formatSec(P)} から歌って、⏹ で止めてね`)

    const blob = await rec.done
    this.stopSources()
    this.stopMicStream()
    const buffer = await this.decodeBlob(blob, "録り直した声")
    if (!buffer) { this.setMode("idle"); return }

    // ずれ：途中なので手拍子は使えない → 最初の録音で使った遅れ（F2-25）
    // 元の声には「ずれ補正」がかかっているので、録り直した声にも同じだけかける。
    // 声の時間 startSec（＝P−補正）に置いて、再生時に＋補正される → 頭を「遅れ−補正」ぶん切ると元の声とそろう
    // （補正がプラスなら頭に無音を足す）
    const fb = this.fallbackLatency(stream)
    let take = trimBuffer(this.ctx, buffer, (T - rec.startedAt) + fb.sec - offsetSec)
    let startSec = P - offsetSec // 声の時間
    if (take && startSec < 0) {
      take = trimBuffer(this.ctx, take, -startSec)
      startSec = 0
    }
    if (!take || take.duration < 0.1) {
      this.setMode("idle")
      this.setStatus("録り直しが短すぎました。開始位置を過ぎてから止めてね")
      return
    }
    const endSec = Q !== null ? Q - offsetSec : null
    this.takes.push({ startSec, endSec, raw: take })
    await this.rebuildVocal()
    this.clearPunch()
    this.setMode("idle")
    this.updatePunchInfo()
    this.setStatus(`録り直しOK（${this.formatSec(P)} から${take.duration.toFixed(1)}秒・遅れ ${Math.round(fb.sec * 1000)}ms：${fb.method}）。▶試聴してね。気に入らなければ ↩ で戻せます`)
  }

  async undoTake() {
    if (!this.takes.length || this.mode !== "idle") return
    this.takes.pop()
    await this.rebuildVocal()
    this.updatePunchInfo()
    this.setStatus(`1つ前に戻しました（残りの録り直し ${this.takes.length}回）`)
  }

  // ---------- 音声だけ保存（WAV） ----------

  async exportAudio() {
    if (!this.backingBuffer && !this.vocalBuffer) return
    this.ensureContext()
    this.endMixBypass()
    this.setMode("exporting")
    this.setStatus("音声を作っています…")
    try {
      const sampleRate = (this.backingBuffer || this.vocalBuffer).sampleRate
      // 響き（リバーブ）の余韻が切れないように、少し長めに作る
      const length = Math.ceil((this.duration + reverbTail(this.activeMix)) * sampleRate)
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext
      const off = new OAC(2, length, sampleRate)
      // 試聴と同じつなぎ：オケ → 音量 ┐、声 → ミックス → 音量 ┘ → リミッター → 出口
      const backingGain = off.createGain()
      const vocalGain = off.createGain()
      const chain = createVocalChain(off)
      scheduleMixTimeline(chain, this.mixTimeline, 0, 0) // 部分ごとの切りかえも同じように入れる
      const limiter = createLimiter(off)
      backingGain.gain.value = parseFloat(this.backingVolumeTarget.value)
      vocalGain.gain.value = parseFloat(this.vocalVolumeTarget.value)
      chain.output.connect(vocalGain)
      backingGain.connect(limiter)
      vocalGain.connect(limiter)
      limiter.connect(off.destination)
      this.scheduleSources(off, 0, backingGain, chain.input)

      const rendered = await off.startRendering()
      // 仕上げ：聴きやすい大きさにそろえる（配信サイトの音量に近づける）
      let loud = ""
      if (!this.hasNormalizeExportTarget || this.normalizeExportTarget.checked) {
        const gain = normalizeLoudness(rendered)
        loud = `・音量そろえ ${gain >= 1 ? "+" : ""}${(20 * Math.log10(gain)).toFixed(1)}dB`
      }
      const blob = this.encodeWav(rendered)
      const link = this.audioDownloadTarget
      if (link.href) URL.revokeObjectURL(link.href)
      link.href = URL.createObjectURL(blob)
      link.download = "utattemita.wav"
      link.hidden = false
      this.setStatus(`音声の書き出し完了（WAV・${(blob.size / 1024 / 1024).toFixed(1)}MB${loud}）。下の ⬇ から保存してね`)
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
    this.endMixBypass()

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

  // ---------- 描画 ----------

  // 動画用の波形（録画にも写る）と、録り直し用のタイムライン（録画には写らない）をずっと描き続ける
  drawWaveform() {
    const canvas = this.canvasTarget
    const g = canvas.getContext("2d")
    const w = canvas.width
    const h = canvas.height
    let data = null

    const draw = () => {
      const bg = g.createLinearGradient(0, 0, 0, h)
      bg.addColorStop(0, "#0d1b3d")
      bg.addColorStop(1, "#1d3f8a")
      g.fillStyle = bg
      g.fillRect(0, 0, w, h)
      g.fillStyle = "#ffffff"
      g.font = "bold 48px sans-serif"
      g.textAlign = "center"
      g.fillText("🎤 歌ってみた", w / 2, 100)

      if (this.analyser) {
        if (!data) data = new Uint8Array(this.analyser.fftSize)
        this.analyser.getByteTimeDomainData(data)
        g.strokeStyle = "#7cc8ff"
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
      this.drawTimeline()
      this.drawOffsetView()
      this.drawMixTimeline()
      this.drawEditView()
      this.drawId = requestAnimationFrame(draw)
    }
    draw()
  }

  drawTimeline() {
    if (!this.hasTimelineTarget) return
    const c = this.timelineTarget
    const u = this.fitCanvas(c)
    const g = c.getContext("2d")
    const w = c.width
    const h = c.height
    const len = this.timelineLength
    const toX = (sec) => (sec / len) * w
    g.fillStyle = "#0e1a33"
    g.fillRect(0, 0, w, h)

    // ペアの波形：peaks は「その音の長さ」を count 等分した値
    const drawPeaks = (peaks, durSec, startSec, color, scale) => {
      if (!peaks || !durSec) return
      g.fillStyle = color
      const step = durSec / peaks.length
      for (let i = 0; i < peaks.length; i++) {
        const x = toX(startSec + i * step)
        const bw = Math.max(1, toX(startSec + (i + 1) * step) - x)
        const ph = peaks[i] * h * scale
        g.fillRect(x, h / 2 - ph / 2, bw, ph)
      }
    }
    drawPeaks(this.backingPeaks, this.backingBuffer?.duration, 0, "rgba(150,175,230,0.28)", 0.9)
    drawPeaks(this.vocalPeaks, this.vocalBuffer?.duration, this.vocalOffsetMs / 1000, "#4fb6ff", 0.9)

    // 録り直した所（うっすら緑）
    const offsetSec = this.vocalOffsetMs / 1000
    g.fillStyle = "rgba(120,230,170,0.18)"
    this.takes.forEach((t) => {
      const s = t.startSec + offsetSec
      const e = (t.endSec ?? t.startSec + t.raw.duration) + offsetSec
      g.fillRect(toX(s), 0, Math.max(2, toX(e) - toX(s)), h)
    })

    // 録り直す位置（黄色）
    if (this.punchStartSec !== null) {
      const s = toX(this.punchStartSec)
      if (this.punchEndSec !== null) {
        g.fillStyle = "rgba(255,220,90,0.25)"
        g.fillRect(s, 0, toX(this.punchEndSec) - s, h)
      }
      g.fillStyle = "#ffd75a"
      g.fillRect(s - u, 0, 2 * u, h)
      if (this.punchEndSec !== null) g.fillRect(toX(this.punchEndSec) - u, 0, 2 * u, h)
    }

    // 再生位置（白）
    let now = 0
    if (this.playhead && this.ctx) {
      const t = this.playhead.songAt + (this.ctx.currentTime - this.playhead.ctxAt)
      now = Math.max(0, t)
      if (t >= 0) {
        g.fillStyle = "#ffffff"
        g.fillRect(toX(t) - u, 0, 2 * u, h)
      }
    }
    this.updateTimeDisplay(now)
  }

  // 下のバーの「今の位置 / 曲の長さ」。変わったときだけ書き換える
  updateTimeDisplay(now) {
    if (!this.hasTimeDisplayTarget) return
    const text = `${this.formatSec(Math.min(now, this.duration))} / ${this.formatSec(this.duration)}`
    if (text !== this.lastTimeText) {
      this.timeDisplayTarget.textContent = text
      this.lastTimeText = text
    }
  }

  // ずれ補正の波形：上＝オケ（動かない）、下＝声（ずれ補正で左右に動く）。4秒ぶんを拡大して映す
  drawOffsetView() {
    if (!this.hasOffsetViewTarget) return
    const c = this.offsetViewTarget
    const u = this.fitCanvas(c)
    const g = c.getContext("2d")
    const w = c.width
    const h = c.height
    const half = h / 2
    const center = this.viewCenterSec ?? OFFSET_VIEW_SEC / 2
    const from = center - OFFSET_VIEW_SEC / 2
    const toX = (sec) => ((sec - from) / OFFSET_VIEW_SEC) * w
    g.fillStyle = "#0e1a33"
    g.fillRect(0, 0, w, h)

    // 0.1秒ごとの目盛り（1秒ごとに数字）
    g.font = `${12 * u}px sans-serif`
    g.textAlign = "left"
    for (let t = Math.ceil(from * 10) / 10; t <= from + OFFSET_VIEW_SEC; t += 0.1) {
      const x = toX(t)
      const whole = Math.abs(t - Math.round(t)) < 0.001
      g.fillStyle = whole ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.08)"
      g.fillRect(x, 0, 1, h)
      if (whole && t >= 0) { g.fillStyle = "rgba(255,255,255,0.6)"; g.fillText(this.formatSec(t), x + 4 * u, 14 * u) }
    }
    g.fillStyle = "rgba(255,255,255,0.15)"
    g.fillRect(0, half, w, 1)

    // 1区間ずつの一番大きい振れ幅を、上下対称の棒で描く
    const lane = (buffer, songStart, top, color) => {
      if (!buffer) return
      const d = buffer.getChannelData(0)
      const sr = buffer.sampleRate
      const cols = Math.min(400, Math.round(w / u))
      const colSec = OFFSET_VIEW_SEC / cols
      const mid = top + half / 2
      g.fillStyle = color
      for (let i = 0; i < cols; i++) {
        const s = from + i * colSec - songStart
        if (s + colSec < 0 || s >= buffer.duration) continue
        const a = Math.max(0, Math.floor(s * sr))
        const b = Math.min(d.length, Math.floor((s + colSec) * sr))
        let m = 0
        for (let j = a; j < b; j += 4) { const v = Math.abs(d[j]); if (v > m) m = v }
        const ph = Math.max(1, Math.min(1, m * 1.6) * (half * 0.85))
        g.fillRect((i / cols) * w, mid - ph / 2, Math.ceil(w / cols), ph)
      }
    }
    lane(this.backingBuffer, 0, 0, "rgba(150,175,230,0.75)")
    lane(this.vocalBuffer, this.vocalOffsetMs / 1000, half, this.offsetDrag?.what === "offset" ? "#a6dcff" : "#4fb6ff")

    // おすすめの位置（うすい緑の点線）：声の始まりが、おすすめを採用したらここに来る
    if (this.recommendedOffsetMs !== null && this.vocalBuffer) {
      const x = toX(this.vocalStartSec + this.recommendedOffsetMs / 1000)
      g.strokeStyle = "rgba(120,230,170,0.9)"
      g.setLineDash([6, 6])
      g.lineWidth = 2 * u
      g.beginPath(); g.moveTo(x, half); g.lineTo(x, h); g.stroke()
      g.setLineDash([])
      g.fillStyle = "rgba(120,230,170,0.9)"
      g.fillText("おすすめ", x + 4 * u, h - 6 * u)
    }

    // 再生位置（白）
    if (this.playhead && this.ctx) {
      const t = this.playhead.songAt + (this.ctx.currentTime - this.playhead.ctxAt)
      g.fillStyle = "#ffffff"
      g.fillRect(toX(t) - u, 0, 2 * u, h)
    }

    // 段の名前とずれ補正の値
    g.font = `bold ${13 * u}px sans-serif`
    g.fillStyle = "rgba(255,255,255,0.8)"
    g.fillText("🎼 オケ（上をドラッグ＝映す場所）", 8 * u, half - 6 * u)
    g.fillText(`🎙 声（ドラッグでずらす） ${this.formatMs(this.vocalOffsetMs)}`, 8 * u, h - 6 * u)
  }

  setStatus(text) {
    this.statusTarget.textContent = text
  }
}
