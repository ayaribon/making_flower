import { Controller } from "@hotwired/stimulus"
import {
  toMono, rmsOf, findOnset, estimateLag, findQuietRange, trimBuffer, denoise,
  spliceTake, waveformPeaks, analyzeLevels, suggestChoruses, normalizeLoudness, applyEdits, analyzeBeats,
  changeKeyTempo, changeKeyTempoChannels, extractRange, SHIFTING_EDITS, estimateStructure
} from "vocal_tools"
import {
  DEFAULT_MIX, MIX_PRESETS, createVocalChain, applyMix, createLimiter, reverbTail,
  settingsAt, scheduleMixTimeline, mixParams, SIMPLE_LINKS, GLOBAL_PRO_KEYS, PRO_PARAMS, PRO_GROUPS, FX_TYPES
} from "mix_chain"
import { alignLyrics, alignLyricsAnchored, findVoiceSegments } from "lyric_align"
import { fastExportSupported, pickVideoConfig, pickAudioConfig, computeFeatureTrack, encodeMp4 } from "mv_export"
import {
  MV_TEMPLATES, MV_GRADIENTS, MV_RATIOS, MV_ANIMS, DEFAULT_MV_ANIM, renderFrame, readFeatures, pickColors, gradientColors, lyricIndexAt,
  MV_FILTERS, MV_TELOP_POSITIONS, MV_TELOP_SIZES, MV_LOGO_CORNERS, MV_LOGO_SIZES, MV_BG_MODES, normalizeMvEdit,
  MV_PART_STYLES, DEFAULT_PART_STYLES
} from "mv_renderer"
import {
  storeSupported, newProjectId, putProject, getProject, listProjects, deleteProject, putAudio, getAudio,
  deleteAudioExcept, storageEstimate, askPersist, encodeAudioBuffer, decodeAudioRecord, formatBytes
} from "project_store"
import {
  SERVER_MAX_BYTES, ServerError, srvListProjects, srvGetProject, srvPutProject, srvPutFile, srvPruneFiles,
  srvDeleteProject, srvFetchFile, packAudioRecord, unpackAudioRecord,
  srvListMixTemplates, srvCreateMixTemplate, srvUpdateMixTemplate, srvDeleteMixTemplate
} from "project_server"
import {
  HARMONY_INTERVALS, KEY_LETTERS, detectPitch, estimateKey, harmonySemitones, harmonyTargetAt, harmonyVoice,
  keroSemitones, shiftPitchCurve, yinFrame, noteName, keyName, hzToMidi, midiToHz,
  MANUAL_DEGREES, manualIntervalId, intervalInfo, isValidInterval, harmonyNotes
} from "harmony"

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
const MIX_TEMPLATE_KEY = "kotobouquet.singing.mixTemplates" // 💾 ミックスのテンプレートの予備（サーバーにつながらないとき・K42）
const COUNT_SILENCE = 1.5 // 録音の最初に静かにしてもらう秒数（部屋の雑音を覚える）
const BEAT = 0.5          // カウントインの1拍（120BPM）
const PREROLL = 2         // 途中から録り直すとき、何秒前から流すか
const OFFSET_VIEW_SEC = 4 // ずれ補正の波形に何秒ぶん映すか（拡大して細かいずれを見えるように）
const MIC_OPTIONS = { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }
const MIX_KEY = "kotobouquet.singing.mix" // 最後に使ったミックス設定（この端末だけ）
const DETAIL_KEY = "kotobouquet.singing.detail" // 詳細モードを開いているか（この端末だけ）
const MV_KEY = "kotobouquet.singing.mv"         // MV のテンプレート・歌った人の名前（この端末だけ）
const TAP_LEAD = 0.2 // 歌詞のタップ：人は少し遅れてタップするので、そのぶん前から出す（秒）
const AUTO_LEAD = 0.15 // 歌詞の自動合わせ：歌い出しの少し前から出す（秒）
const FLOW_KEY = "kotobouquet.singing.flow" // ステップで進める／まとめて編集（この端末だけ）
const MAX_MEDIA_MB = 500 // これより大きいファイルはスマホのメモリが足りず落ちやすいので断る
const LEVEL_KEY = "kotobouquet.singing.level"          // 🎙声出しチェックの結果（この端末だけ・K26）
const INPUT_GAIN_KEY = "kotobouquet.singing.inputGain" // 入力ゲイン（dB・この端末だけ・K26）
const CLIP_LEVEL = 0.99   // これ以上は「割れた」とみなす（1.0 で頭打ち）
const LEVEL_CHECK_SEC = 5 // 声出しチェックの長さ（秒）
// 📍 ミックスの波形のピン（K32）。作業用の目印なので MV・書き出しには出さない
const PIN_COLORS = [
  { key: "red", icon: "🔴", label: "直したい", color: "#ff5a5a" },
  { key: "yellow", icon: "🟡", label: "息", color: "#ffd75a" },
  { key: "green", icon: "🟢", label: "よかった", color: "#5ad68a" },
  { key: "blue", icon: "🔵", label: "盛り上げ", color: "#5ab4ff" },
  { key: "white", icon: "⚪", label: "メモ", color: "#e8edf7" }
]
const PIN_PREROLL = 2     // ピンを押したら何秒前から流すか
const PIN_LONGPRESS_MS = 500 // スマホの長押しでピンを立てるまでの時間
const PIN_GRAB_PX = 8     // ピンをつかめる幅（スマホはこの2倍）

// 🧭 ステップで進めるときの順番と、各ページの案内
const FLOW_STEPS = [
  {
    id: "sg-load", short: "音を入れる", need: "backing",
    title: "🎼 まずは、オケ（伴奏）のファイルを入れましょう",
    lead: "歌いたい曲のオケ（カラオケ音源）を選んでね。次のステップで、キー（高さ）を自分に合わせられます。",
    tips: ["mp3・wav・m4a など、ふつうの音楽ファイルが使えます", "もう録音してある歌声があれば、「歌声ファイル」に入れてもOK（次のステップはとばせます）", "オケの配布元の利用規約（動画での公開・クレジットの書き方）も確認してね"],
    wait: "オケを入れると次へ進めます"
  },
  {
    id: "sg-key", short: "キー", optional: true,
    title: "🎹 録音の前に、キー（高さ）を自分に合わせましょう",
    lead: "♭ −1 / ♯ +1 でキーを選んで「▶ サビで試し聴き」。一緒に口ずさんで、無理なく出る高さを探してね。決まったら「🎹 オケに反映する」。",
    tips: ["目安：男性が女性の曲なら −3〜−5、女性が男性の曲なら +3〜+5", "サビの一番高い所が楽に出るキーがおすすめ", "原曲キーのままでよければ、そのまま次へ"],
    wait: ""
  },
  {
    id: "sg-rec", short: "録音", need: "vocal",
    title: "🎙 次は、歌を録音しましょう",
    lead: "ヘッドホンをつけて「🎙 マイクで録音」。最初の1.5秒は静かに、カウントの4つ目で手拍子 👏 してから歌ってね。",
    tips: ["手拍子で、声とオケのずれを自動で直します", "失敗した所だけ「✂️ 途中から録り直す」で録り直せます", "録り終わると、声の大きさがちょうどいいかも教えます"],
    wait: "歌声を録音（または①でファイルを入れる）と次へ進めます"
  },
  {
    id: "sg-sync", short: "ずれ直し", optional: true,
    title: "🎚 ずれと雑音を直しましょう",
    lead: "▶ この辺を試聴 で、声とオケがそろっているか聴いてみてね。ずれていたら、声の波形を左右に動かすだけ。",
    tips: ["「🔍 おすすめを再計算 → ✅ 採用」で自動で合わせることもできます", "✨ ノイズ消しで、部屋の「サー」という音を減らせます", "そろっていれば、何もしないで次へ進んでOK"],
    wait: ""
  },
  {
    id: "sg-mix", short: "ミックス", optional: true,
    title: "🎛 ミックスで、声をきれいに整えましょう",
    lead: "迷ったら「🪄 おまかせミックス」と「🪄 サビっぽい所を探す」を押すだけ。プロっぽく聴きやすくなります。",
    tips: ["雰囲気ボタン（🔥盛り上げる・🌙しっとり など）で、曲全体や部分ごとの感じを変えられます", "もっと細かくしたいときは「🛠 詳細モード」", "動画はいらない？ →「🎵 音声だけでいい」で保存へ"],
    wait: ""
  },
  {
    id: "sg-mv", short: "動画", optional: true,
    title: "🎬 動画（MV）の見た目を決めましょう",
    lead: "テンプレートと背景を選んで、曲名と名前を入れるだけ。絵は音に合わせて自動で動きます。",
    tips: ["横（YouTube）・縦（TikTok・ショート）・正方形を選べます", "サビで光る・拍ではねる「🎆 おまかせ演出」つき", "下の ▶ 試聴 で、動きを確かめてね"],
    wait: ""
  },
  {
    id: "sg-lyrics", short: "歌詞", optional: true,
    title: "🎤 歌詞テロップを付けましょう（なくてもOK）",
    lead: "歌詞を貼り付けて「🪄 歌声から自動で合わせる」。⚠ の行だけ聴いて確かめればOK。",
    tips: ["ずれた所は ±0.1秒 か「👆 タップで合わせる」で直せます", "「📄 LRC で保存」しておくと、次は合わせ直さなくてOK", "テロップがいらなければ、そのまま次へ"],
    wait: ""
  },
  {
    id: "sg-save", short: "保存",
    title: "🎉 完成！ 保存しましょう",
    lead: "動画は「⚡ 速く書き出す（MP4）」、音声だけなら「🎵 音声だけ保存（WAV）」。できたら ⬇ から保存してね。",
    tips: ["書き出し中は、このタブを開いたままにしてね", "あとから直したくなったら、← 戻る で前のステップへ", "作業はあなたのアカウントに自動で保存されます（ほかの端末からも続きができます）"],
    wait: ""
  }
]

export default class extends Controller {
  static targets = [
    "backingVolume", "vocalVolume",
    "playButton", "stopButton", "recordButton", "audioButton", "acapellaButton",
    "status", "canvas", "download", "audioDownload",
    "offsetDisplay", "autoLatency",
    "micStartButton", "micStopButton", "resetButton",
    "countIn", "calibrateButton", "calibrationInfo",
    "levelMeter", "levelBar", "levelPeak", "levelDb", "levelClip", "levelCheckButton", "levelInfo",
    "inputGain", "inputGainValue",
    "mixOverview", "mixZoomInfo", "mixYZoomButton", "mixZoomInButton",
    "pinList", "pinInfo", "pinAddButton", "pinBetweenButton", "pinPrevButton", "pinNextButton",
    "snapBeat", "sectionRange", "sectionStart", "sectionEnd", "sectionRangeInfo",
    "denoiseStrength", "denoiseValue", "rawToggle",
    "timeline", "punchInfo", "punchButton", "undoButton", "clearPunchButton", "punchMute",
    "recalcButton", "applyButton",
    "offsetView", "offsetSlider", "previewButton",
    "mixSlider", "mixValue", "presetButton", "presetHint", "mixBypassButton",
    "fxTypeButton", "fxHint",
    "backingVolumeValue", "vocalVolumeValue", "playFromButton", "timeDisplay",
    "mixTimeline", "sectionList", "sectionName", "sectionInfo", "editingLabel",
    "addSectionButton", "deleteSectionButton", "playSectionButton",
    "guide", "detailToggle", "proPanel", "normalizeExport",
    "editView", "editStart", "editEnd", "editGainDb", "editInfo", "editUndoButton", "editClearButton",
    "editCents", "editTempo", "clipInfo",
    "keyValue", "tempoSlider", "tempoValue", "keyTempoApply", "keyFollow",
    "mvTemplateButton", "mvTemplateHint", "mvBgList", "mvBgCredit", "mvTitle", "mvArtist", "mvCredit",
    "mvDim", "mvDimValue", "mvSeek", "mvSeekValue", "mvIntro", "mvOutro", "mvProgress",
    "lyricsText", "lyricList", "lyricInfo", "tapPanel", "tapButton", "tapCurrent", "tapNext", "tapCount",
    "karaoke", "lrcButton",
    "lyricTimeline", "lyricZoomInfo", "unlockLyricsButton",
    "projectInfo", "projectName", "projectList", "projectResume", "projectSaveButton",
    "mvAnimPanel",
    "harmonyKeyInfo", "harmonyKeySelect", "harmonyAuto", "harmonyIntervalButton", "harmonyVolume", "harmonyPan",
    "harmonyVolumeValue", "harmonyPanValue", "harmonyInfo", "harmonyBuildButton",
    "harmonyRecordButton", "harmonyGuideTone", "harmonyGuide", "harmonyGuideInfo",
    "harmonyManual", "harmonyManualVolume", "harmonyManualPan", "harmonyManualInfo", "harmonyClearButton",
    "harmonyTrackList", "harmonyAddButton", "harmonyGuidePlay", "harmonyGuideVolume", "harmonyGuideVolumeValue",
    "harmonyGuideTargetInfo",
    "keroToggle", "keroAmount", "keroValue",
    "fxStrength", "fxStrengthValue", "fxBeat", "fxChorus", "fxSparkle", "fxInfo",
    "mvRatioButton", "mvSafe", "mvFrame",
    "fastButton", "fastNote", "exportQuality", "exportProgress",
    "autoAlignButton", "undoAlignButton",
    "flowHeader", "flowNav", "flowButton",
    "keyPreviewButton",
    // 🎬 もっと編集（K40）
    "mvBgModeButton", "mvBgInterval", "mvBgIntervalValue", "mvSlideList", "mvTelopList",
    "mvFilterButton", "mvFilterAmount", "mvFilterAmountValue", "mvFilterHint", "mvFilterParts",
    "mvRangeToggle", "mvRangeStart", "mvRangeEnd", "mvRangeInfo", "mvRangePlayButton",
    "mvFadeIn", "mvFadeInValue", "mvFadeOut", "mvFadeOutValue", "mvFadeAudio",
    "mvLogoToggle", "mvLogoKindButton", "mvLogoText", "mvLogoCorner", "mvLogoSize", "mvLogoOpacity", "mvLogoOpacityValue", "mvLogoInfo",
    // 🪄 曲の構成（K41）・💾 ミックスのテンプレート（K42）
    "structureButton", "fxNameTable",
    "mixTemplateList", "mixTemplateInfo", "mixTemplateName"
  ]

  // KotoBouquet の背景素材（サーバーが一覧を入れる）
  static values = { backgrounds: { type: Array, default: [] } }

  connect() {
    this.ctx = null
    this.backingBuffer = null
    this.vocalNoiseSource = null
    this.vocalBase = null
    this.takes = []
    this.edits = []
    this.editSel = null
    this.editCursor = null
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
    // 🔍 ミックスの波形の拡大（K33）
    this.mixView = null       // 見えている範囲 { startSec, endSec }（曲の時間）。null＝全体
    this.mixYZoom = 1         // 縦の拡大（1／2／4）
    this.mixFollow = true     // 再生中、再生位置が画面の外に出たらついていく
    this.mixDetail = null     // 拡大したときの細かい波形（見えている範囲だけ計算し直したもの）
    this.mixPointers = new Map() // ピンチ用：押している指
    this.mixPinch = null
    this.mixLastDraw = null   // 前に描いたときの状態（変わっていなければ描き直さない）
    // 📍 ピン（K32）：{ id, sec, name, color }（曲の時間）。保存は K24 で（今はページを閉じると消える）
    this.pins = []
    this.pinId = null         // 選んでいるピン
    this.pinCursorSec = null  // 止まっているときに最後に押した位置（📍ボタンはここに立てる）
    // 🎤 歌詞のタイムライン（K27）
    this.lyricView = null     // 見えている範囲（曲の時間）。null＝全体
    this.lyricDrag = null
    this.lyricSel = null      // 選んでいる行（番号）
    this.lyricLastDraw = null
    this.voiceSegCache = null // 声が出ている所（曲の時間）。声が変わったら作り直す
    this.editDrag = null
    this.editCursor = null // 貼り付ける位置（曲の時間）。範囲を選ばずに1回押した所
    this.clipboard = null  // コピーした声（AudioBuffer）
    this.backingOriginal = null // キー・速さを変える前のオケ
    this.backingKey = 0         // 反映ずみのキー（半音）
    this.backingRate = 1        // 反映ずみの速さ
    this.pendingKey = 0         // 画面で選んでいるキー（まだ反映していないかも）
    this.detail = this.loadDetail()
    this.buildProPanel()
    this.applyDetailMode()
    this.updateMixControls()
    this.setupMv()
    this.setupFastExport()
    this.setupFlow()
    this.drawWaveform()
    this.updateOffsetDisplay()
    this.updateCalibrationInfo()
    this.inputGainDb = this.loadInputGain()
    this.updateInputGainLabel()
    this.updateLevelInfo()
    this.renderPins()
    this.updateDenoiseValue()
    this.updatePunchInfo()
    this.updateButtons()
    this.initHarmony()  // 🎶 ハモリ・🐸ケロケロ風（K29）
    this.initProjects() // 💾 プロジェクト保存（K24）
  }

  disconnect() {
    this.stopProjects()
    this.stop()
    this.stopMeter()
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
      if (v && typeof v === "object") {
        // 11/10 リバーブの初期値を 30→20 に変更（K25）。
        // 前の初期値 30 のまま保存されていた設定だけ 20 に置き換える（自分で動かした値はそのまま）
        if (!v.v && v.reverb === 30) v.reverb = DEFAULT_MIX.reverb
        return { ...DEFAULT_MIX, ...v }
      }
    } catch (e) {}
    return { ...DEFAULT_MIX }
  }

  saveMix() {
    try { window.localStorage.setItem(MIX_KEY, JSON.stringify({ ...this.mix, preset: this.mixPreset, v: 2 })) } catch (e) {}
  }

  // スライダーを動かしたら、鳴っている音にすぐ反映する（再生中でもOK）
  changeMix(event) {
    const key = event.currentTarget.dataset.mixKey
    const target = key === "reverbLength" ? this.mix : this.editingSettings // 長さは曲全体で共通
    target[key] = Number(event.currentTarget.value)
    // かんたんスライダーが効くように、詳細モードでいじった同じ値は消す
    if (target.pro) (SIMPLE_LINKS[key] || []).forEach((k) => { delete target.pro[k] })
    if (key !== "fxAmount") this.editingPreset = "custom" // 🎛エフェクトのかかり具合は雰囲気ボタンとは別（K34）
    this.mixBypass = false
    this.refreshMix()
  }

  applyPreset(event) {
    const name = event.currentTarget.dataset.preset
    const preset = MIX_PRESETS[name]
    if (!preset) return
    const next = { ...DEFAULT_MIX, ...preset.settings, pro: { ...(preset.settings.pro || {}) } }
    // 🎛 変わったエフェクト（K34）は雰囲気ボタンとは別：今の種類・かかり具合・細かい値を残す
    const cur = this.editingSettings
    next.fx = FX_TYPES[cur.fx] ? cur.fx : "none"
    next.fxAmount = cur.fxAmount ?? DEFAULT_MIX.fxAmount
    Object.keys(cur.pro || {}).forEach((k) => {
      const d = PRO_PARAMS.find((x) => x.key === k)
      if (d && d.group === "fx" && !d.global) next.pro[k] = cur.pro[k]
    })
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

  // 🎛 変わったエフェクトの種類を選ぶ（K34・声だけ）。曲全体／編集中の部分のどちらにも使える
  selectFx(event) {
    const type = event.currentTarget.dataset.fx
    if (!FX_TYPES[type]) return
    const target = this.editingSettings
    target.fx = type
    if (target.fxAmount === undefined) target.fxAmount = DEFAULT_MIX.fxAmount
    this.mixBypass = false
    this.refreshMix()
    const where = this.editingSection ? `「${this.sectionLabel(this.editingSection)}」` : "曲全体"
    const fx = FX_TYPES[type]
    this.setStatus(type === "none"
      ? `${where}の🎛エフェクトを外しました`
      : `${where}に🎛${fx.label}（${fx.hint}）。「かかり具合」で強さを変えられます`)
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
      reverbLength: (v) => `${Number(v).toFixed(1)}秒`,
      fxAmount: (v) => (Number(v) === 0 ? "0（かからない）" : `${v}`)
    }
    // 前に保存した設定・前に作った部分には fx が無いことがある → 初期値（なし）で埋める（K34）
    const settings = { ...DEFAULT_MIX, ...this.editingSettings, reverbLength: this.mix.reverbLength }
    this.mixSliderTargets.forEach((el) => { el.value = String(settings[el.dataset.mixKey]) })
    this.mixValueTargets.forEach((el) => {
      const key = el.dataset.mixKey
      el.textContent = fmt[key] ? fmt[key](settings[key]) : String(settings[key])
    })
    this.updateFxControls(settings)
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

  // 🎛 変わったエフェクトのボタン・説明（K34）
  updateFxControls(settings) {
    const type = FX_TYPES[settings.fx] ? settings.fx : "none"
    if (this.hasFxTypeButtonTarget) {
      this.fxTypeButtonTargets.forEach((el) => {
        el.setAttribute("aria-pressed", String(el.dataset.fx === type && !this.mixBypass))
      })
    }
    if (this.hasFxHintTarget) {
      const fx = FX_TYPES[type]
      this.fxHintTarget.textContent = this.mixBypass
        ? "🎧 エフェクトなしで聴いている間は、🎛エフェクトもかかりません"
        : type === "none" ? "声にかける変わったエフェクトです（オケにはかかりません）。部分ごとに変えることもできます" : fx.hint
    }
    this.mixSliderTargets.forEach((el) => { if (el.dataset.mixKey === "fxAmount") el.disabled = type === "none" })
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
    if (d.group !== "fx") this.editingPreset = "custom" // 🎛エフェクトの細かい値は雰囲気ボタンとは別（K34）
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

  // 🔍 いま見えている範囲（K33）。拡大していなければ曲の全体
  get mixRange() {
    const len = this.mixTimelineLength
    return this.mixView ? this.clampMixView(this.mixView) : { startSec: 0, endSec: len }
  }

  mixTimeAt(event) {
    const rect = this.mixTimelineTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left))
    const r = this.mixRange
    return r.startSec + (x / rect.width) * (r.endSec - r.startSec)
  }

  // 部分の上を押す＝その部分を編集。何もない所を押したまま横にずらす＝新しい範囲を選ぶ
  mixTimelineDown(event) {
    if (!this.backingBuffer && !this.vocalBuffer) return
    // 🔍 指2本：ピンチで拡大・横に移動（K33）。範囲選びは止める
    this.mixPointers.set(event.pointerId, event.clientX)
    this.mixTimelineTarget.setPointerCapture?.(event.pointerId)
    if (this.mixPointers.size === 2) {
      this.mixDrag = null
      this.cancelPinPress()
      const xs = [...this.mixPointers.values()]
      const r = this.mixRange
      this.mixPinch = { dist: Math.max(10, Math.abs(xs[0] - xs[1])), mid: (xs[0] + xs[1]) / 2, range: { ...r } }
      return
    }
    if (this.mixPointers.size > 2) return
    const t = this.mixTimeAt(event)
    this.pinCursorSec = t // 📍ボタンは、止まっているときはここに立てる（K32）
    // 📍 ピンの上を押した：押しただけ＝2秒前から再生、ドラッグ＝ピンを動かす（部分より優先）
    const pin = this.pinAt(event)
    if (pin) {
      this.mixDrag = { from: t, moved: false, pin, origSec: pin.sec }
      return
    }
    // 📱 スマホは長押し（0.5秒）でその場所にピンを立てる
    this.cancelPinPress()
    if (event.pointerType === "touch") {
      this.pinPressX = event.clientX
      this.pinPressTimer = setTimeout(() => {
        this.pinPressTimer = null
        if (this.mixPinch || (this.mixDrag && this.mixDrag.moved)) return
        this.mixDrag = null
        this.mixSel = null
        this.addPin(t)
      }, PIN_LONGPRESS_MS)
    }
    const hit = this.sections.find((s) => t >= s.startSec && t < s.endSec)
    // ✋ 部分の端＝伸び縮み、真ん中＝丸ごと移動（K31）。押しただけなら今まで通り「その部分を編集」
    const edge = this.sectionEdgeAt(event)
    if (edge) {
      this.mixDrag = { from: t, moved: false, hit: edge.section, edit: edge.side, orig: { startSec: edge.section.startSec, endSec: edge.section.endSec } }
      return
    }
    this.mixDrag = { from: t, moved: false, hit, edit: hit ? "move" : null, orig: hit ? { startSec: hit.startSec, endSec: hit.endSec } : null }
  }

  mixTimelineMove(event) {
    if (this.mixPointers.has(event.pointerId)) this.mixPointers.set(event.pointerId, event.clientX)
    if (this.mixPinch && this.mixPointers.size === 2) {
      const xs = [...this.mixPointers.values()]
      const p = this.mixPinch
      const rect = this.mixTimelineTarget.getBoundingClientRect()
      const span = p.range.endSec - p.range.startSec
      const dist = Math.max(10, Math.abs(xs[0] - xs[1]))
      const newSpan = span * (p.dist / dist)
      const midNow = (xs[0] + xs[1]) / 2
      // つまんだ所の時間が指の下に残るように
      const anchor = p.range.startSec + ((p.mid - rect.left) / rect.width) * span
      const start = anchor - ((midNow - rect.left) / rect.width) * newSpan
      this.setMixView(start, start + newSpan)
      return
    }
    const d = this.mixDrag
    if (!d) { this.updateMixCursor(event); return }
    // 📱 指が動いたら長押し（ピンを立てる）はやめる
    if (this.pinPressTimer && Math.abs(event.clientX - (this.pinPressX ?? event.clientX)) > 6) this.cancelPinPress()
    // 📍 ピンを動かす（K32）。6px 動くまでは「押した」扱い
    if (d.pin) {
      const t = this.mixTimeAt(event)
      const rect = this.mixTimelineTarget.getBoundingClientRect()
      const r = this.mixRange
      const pxSec = (r.endSec - r.startSec) / Math.max(1, rect.width)
      if (!d.moved && Math.abs(t - d.from) < 6 * pxSec) return
      d.moved = true
      const v = this.snapToBeat(d.origSec + (t - d.from), event, { exclude: d.pin })
      d.pin.sec = Math.max(0, Math.min(this.mixTimelineLength, v))
      this.pinId = d.pin.id
      return
    }
    if (d.hit && d.edit) {
      const t = this.mixTimeAt(event)
      // 少し動かしただけでは「押した」扱い（画面で 6px くらい）
      const rect = this.mixTimelineTarget.getBoundingClientRect()
      const r = this.mixRange
      const pxSec = (r.endSec - r.startSec) / Math.max(1, rect.width)
      if (!d.moved && Math.abs(t - d.from) < 6 * pxSec) return
      d.moved = true
      this.dragSection(d, t, event)
      return
    }
    if (d.hit) return // 部分の上からは新しい範囲を作らない（重なるので）
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

  mixTimelineUp(event) {
    if (event && this.mixPointers.has(event.pointerId)) this.mixPointers.delete(event.pointerId)
    this.cancelPinPress()
    if (this.mixPinch) {
      if (this.mixPointers.size < 2) { this.mixPinch = null; this.scheduleMixDetail() }
      return
    }
    const d = this.mixDrag
    if (!d) return
    this.mixDrag = null
    // 📍 ピン：動かしたら並べ直す、押しただけなら2秒前から再生（K32）
    if (d.pin) {
      this.pinId = d.pin.id
      if (d.moved) {
        this.sortPins()
        this.setStatus(`📍「${this.pinLabel(d.pin)}」を ${this.formatSec(d.pin.sec)} に動かしました`)
      } else {
        this.playPin(d.pin)
      }
      this.renderPins()
      return
    }
    if (d.hit && d.edit && d.moved) {
      // ✋ 部分を動かし終わった：ミックスの切りかえ・MV のサビ演出に反映（計算し直しは離したときだけ）
      const s = d.hit
      s.auto = false // 手で直した＝確かめた印
      this.sections.sort((a, b) => a.startSec - b.startSec)
      this.editId = s.id
      this.refreshMix({ save: false })
      this.updateSectionControls()
      const what = d.edit === "move" ? "移動しました" : d.edit === "start" ? "始まりを動かしました" : "終わりを動かしました"
      this.setStatus(`✋「${this.sectionLabel(s)}」の${what}。▶ 境目を試聴 で入りの所を確かめてね`)
      return
    }
    if (!d.moved) {
      this.mixSel = null
      this.editId = d.hit ? d.hit.id : null // 何もない所を押したら「曲全体」に戻る
      this.refreshMix({ save: false })
      return
    }
    if (this.mixSel && this.mixSel.endSec - this.mixSel.startSec < 0.5) this.mixSel = null
    this.updateSectionControls()
  }

  // ---------- 📍 ミックスの波形のピン（K32） ----------
  // ピンは曲の時間で持つ { id, sec, name, color }。MV・書き出しには出さない（作業用の目印）

  pinColor(key) {
    return PIN_COLORS.find((c) => c.key === key) || PIN_COLORS[0]
  }

  pinLabel(p) {
    const c = this.pinColor(p.color)
    return `${c.icon} ${p.name || c.label}`
  }

  sortPins() {
    this.pins.sort((a, b) => a.sec - b.sec)
  }

  get selectedPin() {
    return this.pins.find((p) => p.id === this.pinId) || null
  }

  // 押した所の近くにピンがあるか（一番近いもの）
  pinAt(event) {
    if (!this.pins || !this.pins.length || !this.hasMixTimelineTarget) return null
    const rect = this.mixTimelineTarget.getBoundingClientRect()
    const r = this.mixRange
    const span = r.endSec - r.startSec
    const grab = window.matchMedia?.("(pointer: coarse)").matches ? PIN_GRAB_PX * 2 : PIN_GRAB_PX
    const x = event.clientX - rect.left
    let best = null
    let bestD = Infinity
    for (const p of this.pins) {
      if (p.sec < r.startSec || p.sec > r.endSec) continue
      const px = ((p.sec - r.startSec) / span) * rect.width
      const dist = Math.abs(px - x)
      if (dist <= grab && dist < bestD) { best = p; bestD = dist }
    }
    return best
  }

  // ピンを立てる。同じ所（0.05秒以内）にあれば立てずにそれを選ぶ
  addPin(sec, { name = "", color = "red" } = {}) {
    if (!this.backingBuffer && !this.vocalBuffer) {
      this.setStatus("📍 ピンを立てるには、先に 🎼オケか歌声を入れてね")
      return null
    }
    const at = Math.max(0, Math.min(this.mixTimelineLength, sec))
    const same = this.pins.find((p) => Math.abs(p.sec - at) < 0.05)
    if (same) {
      this.pinId = same.id
      this.renderPins()
      this.setStatus(`📍 そこにはもう「${this.pinLabel(same)}」があります`)
      return same
    }
    const p = { id: `p${Date.now()}${Math.floor(Math.random() * 1000)}`, sec: at, name, color }
    this.pins.push(p)
    this.sortPins()
    this.pinId = p.id
    this.renderPins()
    this.setStatus(`📍 ${this.formatSec(at)} にピンを立てました（下の一覧で名前と色を変えられます）`)
    return p
  }

  // 📍ボタン／P キー：再生中は今の再生位置、止まっているときは最後に押した位置（なければ見えている真ん中）
  addPinNow() {
    const now = this.songNow
    let sec
    if (now !== null && now >= 0) sec = now
    else if (this.pinCursorSec !== null) sec = this.pinCursorSec
    else { const r = this.mixRange; sec = (r.startSec + r.endSec) / 2 }
    this.addPin(sec)
  }

  // PC：波形をダブルクリックした所にピンを立てる
  mixDblClick(event) {
    if (!this.backingBuffer && !this.vocalBuffer) return
    if (this.pinAt(event)) return // ピンの上は「押した」（再生）だけ
    event.preventDefault()
    this.mixSel = null
    this.addPin(this.mixTimeAt(event))
  }

  cancelPinPress() {
    if (this.pinPressTimer) { clearTimeout(this.pinPressTimer); this.pinPressTimer = null }
  }

  // P キー（歌詞のタップ合わせ中・文字を入れているとき・Ctrl などを押しているときは使わない）
  pinKey(event) {
    if (event.key !== "p" && event.key !== "P") return false
    if (event.ctrlKey || event.metaKey || event.altKey) return false
    if (event.isComposing) return false
    const tag = event.target?.tagName || ""
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || event.target?.isContentEditable) return false
    if (!this.backingBuffer && !this.vocalBuffer) return false
    if (this.mode !== "idle" && this.mode !== "playing") return false
    event.preventDefault()
    this.addPinNow()
    return true
  }

  // ピンの2秒前から流す（再生中なら、そこから流し直す）
  async playPin(p) {
    if (!p) return
    if (this.mode === "playing") this.stopSources()
    else if (this.mode !== "idle") return
    this.ensureContext()
    await this.ctx.resume()
    const from = Math.max(0, p.sec - PIN_PREROLL)
    this.pinId = p.id
    this.setMode("playing")
    this.startSources(() => {
      this.setMode("idle")
      this.setStatus("試聴おわり")
    }, { fromSec: from })
    this.setStatus(`▶ 📍「${this.pinLabel(p)}」（${this.formatSec(p.sec)}）の${PIN_PREROLL}秒前から試聴中…`)
  }

  pinFromEvent(event) {
    const id = event?.currentTarget?.dataset?.pinId
    return this.pins.find((p) => p.id === id) || null
  }

  playPinButton(event) {
    this.playPin(this.pinFromEvent(event))
  }

  selectPin(event) {
    const p = this.pinFromEvent(event)
    if (!p) return
    this.pinId = p.id
    this.showPinInView(p)
    this.renderPins()
  }

  changePinName(event) {
    const p = this.pinFromEvent(event)
    if (!p) return
    p.name = event.currentTarget.value.trim().slice(0, 30)
    this.pinId = p.id
    this.mixLastDraw = null
    this.updatePinControls()
  }

  changePinColor(event) {
    const p = this.pinFromEvent(event)
    if (!p) return
    p.color = this.pinColor(event.currentTarget.value).key
    this.pinId = p.id
    this.renderPins()
  }

  deletePin(event) {
    const p = this.pinFromEvent(event)
    if (!p) return
    this.pins = this.pins.filter((x) => x.id !== p.id)
    if (this.pinId === p.id) this.pinId = null
    this.renderPins()
    this.setStatus(`🗑 📍「${this.pinLabel(p)}」を消しました`)
  }

  // 拡大しているとき、ピンが画面の外なら画面を動かす
  showPinInView(p) {
    if (!this.mixView) return
    const r = this.mixRange
    if (p.sec >= r.startSec && p.sec <= r.endSec) return
    const span = r.endSec - r.startSec
    this.setMixView(p.sec - span / 2, p.sec + span / 2)
    this.scheduleMixDetail()
  }

  // ◀ 前のピン／次のピン ▶：選んでいるピン（なければ今の位置）から順番に
  jumpPin(dir) {
    if (!this.pins.length) return
    const cur = this.selectedPin
    const now = this.songNow
    const base = cur ? cur.sec : (now !== null && now >= 0 ? now : (this.pinCursorSec ?? 0))
    const eps = cur ? 0.0001 : -0.0001
    const next = dir > 0
      ? this.pins.find((p) => p.sec > base + eps)
      : [...this.pins].reverse().find((p) => p.sec < base - eps)
    if (!next) { this.setStatus(dir > 0 ? "📍 これより後ろにピンはありません" : "📍 これより前にピンはありません"); return }
    this.pinId = next.id
    this.pinCursorSec = next.sec
    this.showPinInView(next)
    this.renderPins()
    this.setStatus(`📍「${this.pinLabel(next)}」（${this.formatSec(next.sec)}）。押すと${PIN_PREROLL}秒前から試聴します`)
  }

  prevPin() { this.jumpPin(-1) }
  nextPin() { this.jumpPin(1) }

  // 選んでいるピンから次のピンまで（なければ今の位置の前後のピン）を範囲として選ぶ →「＋この範囲に指示を付ける」
  selectBetweenPins() {
    if (this.pins.length < 2) { this.setStatus("📍 ピンが2本以上あると、そのあいだを選べます"); return }
    let a = this.selectedPin
    let b = null
    if (a) {
      b = this.pins.find((p) => p.sec > a.sec + 0.0001)
      if (!b) { b = a; a = [...this.pins].reverse().find((p) => p.sec < b.sec - 0.0001) }
    } else {
      const base = this.pinCursorSec ?? 0
      a = [...this.pins].reverse().find((p) => p.sec <= base) || this.pins[0]
      b = this.pins.find((p) => p.sec > a.sec + 0.0001)
    }
    if (!a || !b) { this.setStatus("📍 あいだを選べるピンが見つかりませんでした"); return }
    const startSec = a.sec
    const endSec = b.sec
    if (endSec - startSec < this.constructor.SECTION_MIN) { this.setStatus("📍 ピンとピンが近すぎます（0.5秒以上あけてね）"); return }
    const over = this.sections.find((s) => startSec < s.endSec && endSec > s.startSec)
    if (over) { this.setStatus(`📍 そのあいだには「${this.sectionLabel(over)}」が重なっているので選べません（先に部分を動かすか消してね）`); return }
    this.editId = null
    this.mixSel = { startSec, endSec }
    this.refreshMix({ save: false })
    this.updateSectionControls()
    this.setStatus(`📍「${this.pinLabel(a)}」〜「${this.pinLabel(b)}」を選びました。名前を選んで「＋この範囲に指示を付ける」で部分にできます`)
  }

  // ピン一覧を作り直す（時間順）
  renderPins() {
    this.mixLastDraw = null
    this.updatePinControls()
    if (this.mv && this.refreshMvEditAnchors) this.refreshMvEditAnchors() // 🎬 ピンで背景を切りかえる所（K40）
    if (!this.hasPinListTarget) return
    if (!this.pins.length) {
      const empty = document.createElement("p")
      empty.className = "sg-help sg-pins__empty"
      empty.textContent = "まだピンはありません"
      this.pinListTarget.replaceChildren(empty)
      return
    }
    const rows = this.pins.map((p) => {
      const row = document.createElement("div")
      row.className = `sg-pin${p.id === this.pinId ? " is-active" : ""}`
      row.style.setProperty("--pin-color", this.pinColor(p.color).color)
      const time = document.createElement("button")
      time.type = "button"
      time.className = "sg-pin__time"
      time.dataset.pinId = p.id
      time.dataset.action = "singing-mixer#selectPin"
      time.textContent = `📍 ${this.formatSec(p.sec)}`
      time.title = "このピンを選ぶ（拡大中はその場所へ移動）"
      const color = document.createElement("select")
      color.className = "sg-select sg-pin__color"
      color.dataset.pinId = p.id
      color.dataset.action = "change->singing-mixer#changePinColor"
      color.setAttribute("aria-label", "ピンの色")
      PIN_COLORS.forEach((c) => {
        const o = document.createElement("option")
        o.value = c.key
        o.textContent = `${c.icon} ${c.label}`
        if (c.key === p.color) o.selected = true
        color.appendChild(o)
      })
      const name = document.createElement("input")
      name.type = "text"
      name.className = "sg-pin__name"
      name.value = p.name || ""
      name.placeholder = this.pinColor(p.color).label
      name.maxLength = 30
      name.dataset.pinId = p.id
      name.dataset.action = "change->singing-mixer#changePinName"
      name.setAttribute("aria-label", "ピンの名前")
      const btn = (text, action, label) => {
        const b = document.createElement("button")
        b.type = "button"
        b.className = "sg-btn sg-btn--small"
        b.dataset.pinId = p.id
        b.dataset.action = `singing-mixer#${action}`
        b.textContent = text
        b.setAttribute("aria-label", label)
        return b
      }
      row.append(time, color, name, btn("▶", "playPinButton", `${PIN_PREROLL}秒前から試聴`), btn("🗑", "deletePin", "このピンを消す"))
      return row
    })
    this.pinListTarget.replaceChildren(...rows)
  }

  updatePinControls() {
    const n = this.pins ? this.pins.length : 0
    const has = !!(this.backingBuffer || this.vocalBuffer)
    const okMode = this.mode === "idle" || this.mode === "playing"
    if (this.hasPinAddButtonTarget) this.pinAddButtonTarget.disabled = !(has && okMode)
    if (this.hasPinBetweenButtonTarget) this.pinBetweenButtonTarget.disabled = !(n >= 2 && this.mode === "idle")
    if (this.hasPinPrevButtonTarget) this.pinPrevButtonTarget.disabled = n === 0
    if (this.hasPinNextButtonTarget) this.pinNextButtonTarget.disabled = n === 0
    if (this.hasPinInfoTarget) {
      const p = this.selectedPin
      this.pinInfoTarget.textContent = n === 0
        ? "ピンなし"
        : p ? `${n}本・選択中：${this.pinLabel(p)}（${this.formatSec(p.sec)}）` : `${n}本`
    }
  }

  // ---------- ✋ 部分の範囲を手で直す（K31） ----------
  // 部分は 0.5秒より短くしない。となりの部分にはぶつかった所で止める（重ならない）
  static SECTION_MIN = 0.5

  // つかめる幅（画面の px）：スマホは指なので広め
  get edgeGrabPx() {
    return window.matchMedia?.("(pointer: coarse)").matches ? 16 : 8
  }

  // 押した所が、どれかの部分の端（左右）の近くか
  sectionEdgeAt(event) {
    if (!this.sections.length) return null
    const rect = this.mixTimelineTarget.getBoundingClientRect()
    const r = this.mixRange
    const toPx = (sec) => ((sec - r.startSec) / (r.endSec - r.startSec)) * rect.width
    const x = event.clientX - rect.left
    const grab = this.edgeGrabPx
    let best = null
    for (const s of this.sections) {
      for (const side of ["start", "end"]) {
        const dx = Math.abs(toPx(side === "start" ? s.startSec : s.endSec) - x)
        if (dx <= grab && (!best || dx < best.dx)) best = { section: s, side, dx }
      }
    }
    return best
  }

  // 動かせる範囲：となりの部分の端〜曲の端
  sectionLimits(s) {
    const others = this.sections.filter((x) => x.id !== s.id)
    const left = Math.max(0, ...others.filter((x) => x.endSec <= s.startSec + 1e-6).map((x) => x.endSec))
    const right = Math.min(this.mixTimelineLength, ...others.filter((x) => x.startSec >= s.endSec - 1e-6).map((x) => x.startSec))
    return { left, right }
  }

  // 🧲 拍に吸い付く：近く（画面で8px 以内）に拍があればそこにする
  // 🧲 近くの拍・ピン（K32）に吸い付く。exclude＝動かしているピン自身（自分には吸い付かない）
  snapToBeat(sec, event = null, { pins = true, exclude = null } = {}) {
    const on = !this.hasSnapBeatTarget || this.snapBeatTarget.checked
    if (!on || (event && event.altKey)) return sec
    const cands = []
    const beats = this.beatInfo?.beats
    if (beats && beats.length) {
      let nearBeat = null
      for (const b of beats) {
        if (nearBeat === null || Math.abs(b - sec) < Math.abs(nearBeat - sec)) nearBeat = b
        if (b > sec + 2) break
      }
      if (nearBeat !== null) cands.push(nearBeat)
    }
    if (pins && this.pins) this.pins.forEach((p) => { if (p !== exclude) cands.push(p.sec) })
    if (!cands.length) return sec
    const best = cands.reduce((a, b) => (Math.abs(b - sec) < Math.abs(a - sec) ? b : a))
    const rect = this.hasMixTimelineTarget ? this.mixTimelineTarget.getBoundingClientRect() : { width: 1000 }
    const r = this.mixRange
    const pxSec = (r.endSec - r.startSec) / Math.max(1, rect.width)
    return Math.abs(best - sec) <= 8 * pxSec ? best : sec
  }

  // ドラッグ中：端＝伸び縮み、真ん中＝移動（描き直すだけ。ミックスの計算は離したとき）
  dragSection(d, t, event) {
    const s = d.hit
    const o = d.orig
    // 動かす前の位置で、となりの部分の端を調べる
    const lim = this.sectionLimits({ ...s, startSec: o.startSec, endSec: o.endSec })
    const MIN = this.constructor.SECTION_MIN
    if (d.edit === "start") {
      const v = this.snapToBeat(t, event)
      s.startSec = Math.max(lim.left, Math.min(o.endSec - MIN, v))
    } else if (d.edit === "end") {
      const v = this.snapToBeat(t, event)
      s.endSec = Math.min(lim.right, Math.max(o.startSec + MIN, v))
    } else {
      const len = o.endSec - o.startSec
      let start = this.snapToBeat(o.startSec + (t - d.from), event)
      start = Math.max(lim.left, Math.min(lim.right - len, start))
      s.startSec = start
      s.endSec = start + len
    }
    this.updateSectionTimes()
  }

  // PC：端の近くでは ↔、部分の上では ✋
  updateMixCursor(event) {
    if (!this.hasMixTimelineTarget || this.mixPinch) return
    if (this.pinAt(event)) { this.mixTimelineTarget.style.cursor = "pointer"; return } // 📍ピンの上
    const edge = this.sectionEdgeAt(event)
    if (edge) { this.mixTimelineTarget.style.cursor = "ew-resize"; return }
    const t = this.mixTimeAt(event)
    const hit = this.sections.find((s) => t >= s.startSec && t < s.endSec)
    this.mixTimelineTarget.style.cursor = hit ? "grab" : "crosshair"
  }

  // 数字・±ボタンで範囲を直す（選んでいる部分）
  setSectionRange(startSec, endSec, label) {
    const s = this.editingSection
    if (!s || this.mode !== "idle") return
    const lim = this.sectionLimits(s)
    const MIN = this.constructor.SECTION_MIN
    let a = Math.max(lim.left, Math.min(startSec, lim.right - MIN))
    let b = Math.min(lim.right, Math.max(endSec, a + MIN))
    const stopped = a !== startSec || b !== endSec
    s.startSec = a
    s.endSec = b
    s.auto = false
    this.refreshMix({ save: false })
    this.updateSectionControls()
    this.setStatus(`✋「${this.sectionLabel(s)}」${label}${stopped ? "（となりの部分か曲の端で止めました）" : ""}`)
  }

  // 「1:23.4」「83.4」「1:23」→ 秒。読めなければ null
  parseTime(text) {
    const v = String(text || "").trim().replace("：", ":")
    if (!v) return null
    const m = v.match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/)
    if (!m) return null
    return (m[1] ? Number(m[1]) * 60 : 0) + Number(m[2])
  }

  changeSectionTime(event) {
    const s = this.editingSection
    if (!s) return
    const side = event.currentTarget.dataset.side
    const sec = this.parseTime(event.currentTarget.value)
    if (sec === null) {
      this.setStatus("⏱ 時間は「1:23.4」か「83.4」の形で入れてね")
      this.updateSectionTimes()
      return
    }
    if (side === "start") this.setSectionRange(sec, s.endSec, "の始まりを変えました")
    else this.setSectionRange(s.startSec, sec, "の終わりを変えました")
  }

  // ±0.1秒／±1拍。data-side="start|end"、data-step="0.1|-0.1|beat|-beat"
  nudgeSection(event) {
    const s = this.editingSection
    if (!s) return
    const { side, step } = event.currentTarget.dataset
    const cur = side === "start" ? s.startSec : s.endSec
    let next
    if (step === "beat" || step === "-beat") {
      next = this.nextBeat(cur, step === "beat" ? 1 : -1)
      if (next === null) { this.setStatus("🥁 オケの拍が分からないので、拍で動かせません"); return }
    } else {
      next = cur + Number(step)
    }
    if (side === "start") this.setSectionRange(next, s.endSec, "の始まりを動かしました")
    else this.setSectionRange(s.startSec, next, "の終わりを動かしました")
  }

  // となりの拍（dir=1：後ろ、-1：前）
  nextBeat(sec, dir) {
    const beats = this.beatInfo?.beats
    if (!beats || !beats.length) return null
    if (dir > 0) return beats.find((b) => b > sec + 0.02) ?? null
    for (let i = beats.length - 1; i >= 0; i--) if (beats[i] < sec - 0.02) return beats[i]
    return null
  }

  // ▶ 境目を試聴：始まりの2秒前〜2秒後（入りの所を確かめる）
  async playSectionEdge(event) {
    const s = this.editingSection
    if (!s || this.mode !== "idle") return
    const side = event?.currentTarget?.dataset?.side || "start"
    const at = side === "end" ? s.endSec : s.startSec
    this.ensureContext()
    await this.ctx.resume()
    this.setMode("playing")
    this.startSources(() => {
      this.setMode("idle")
      this.setStatus("境目の試聴おわり")
    }, { fromSec: Math.max(0, at - 2), untilSec: at + 2 })
    this.setStatus(`▶「${s.name}」の${side === "end" ? "終わり" : "始まり"}（${this.formatSec(at)}）の前後2秒を試聴中…`)
  }

  // 選んでいる部分の時間の表示を更新（入力中の欄は書きかえない）
  updateSectionTimes() {
    const s = this.editingSection
    const show = !!s
    if (this.hasSectionRangeTarget) this.sectionRangeTarget.hidden = !show
    if (!show) return
    const put = (el, sec) => { if (el && document.activeElement !== el) el.value = this.formatSec(sec) }
    if (this.hasSectionStartTarget) put(this.sectionStartTarget, s.startSec)
    if (this.hasSectionEndTarget) put(this.sectionEndTarget, s.endSec)
    const hasBeats = !!(this.beatInfo?.beats?.length)
    this.element.querySelectorAll("[data-needs-beat]").forEach((el) => { el.hidden = !hasBeats })
    const idle = this.mode === "idle"
    this.element.querySelectorAll("[data-needs-section]").forEach((el) => { el.disabled = !idle })
    if (this.hasSectionRangeInfoTarget) {
      this.sectionRangeInfoTarget.textContent = `${(s.endSec - s.startSec).toFixed(1)}秒${s.auto ? "・🪄自動で見つけた範囲（確かめてね）" : ""}`
    }
  }

  // ---------- 🔍 ミックスの波形の拡大（K33） ----------
  // 一番細かい拡大は「画面に2秒」（clampMixView の 2）

  // 範囲を曲の中に収める（はみ出たら寄せる・短すぎたら広げる）
  clampMixView(v) {
    const len = this.mixTimelineLength
    let span = Math.max(Math.min(2, len), Math.min(len, v.endSec - v.startSec))
    let start = Math.max(0, Math.min(len - span, v.startSec))
    return { startSec: start, endSec: start + span }
  }

  setMixView(startSec, endSec) {
    const len = this.mixTimelineLength
    const v = this.clampMixView({ startSec, endSec })
    // ほぼ全体なら「拡大なし」に戻す
    this.mixView = v.endSec - v.startSec >= len - 0.01 ? null : v
    this.mixDetail = null
    this.updateMixZoomControls()
  }

  // 倍率で拡大・縮小する。centerSec を中心に（なければ見えている真ん中）
  zoomMixBy(k, centerSec = null) {
    const r = this.mixRange
    const span = r.endSec - r.startSec
    const c = centerSec ?? (r.startSec + span / 2)
    const ratio = (c - r.startSec) / span
    const newSpan = span / k
    const start = c - ratio * newSpan
    this.setMixView(start, start + newSpan)
    this.scheduleMixDetail()
  }

  zoomMixIn() { this.zoomMixBy(2, this.songNow !== null && this.songNow >= 0 && this.isInMixView(this.songNow) ? this.songNow : null) }
  zoomMixOut() { this.zoomMixBy(0.5) }
  zoomMixAll() { this.setMixView(0, this.mixTimelineLength); this.scheduleMixDetail() }

  // 🎯 選んだ範囲（なければ選んでいる部分）に合わせる
  zoomMixToSel() {
    const s = this.mixSel || this.sections.find((x) => x.id === this.editId)
    if (!s) { this.setStatus("🎯 先に波形をドラッグして範囲を選ぶか、部分を押してね"); return }
    const pad = Math.max(0.5, (s.endSec - s.startSec) * 0.1)
    this.setMixView(s.startSec - pad, s.endSec + pad)
    this.scheduleMixDetail()
  }

  // ↕ 縦の拡大：×1 → ×2 → ×4 → ×1
  toggleMixYZoom() {
    this.mixYZoom = this.mixYZoom >= 4 ? 1 : this.mixYZoom * 2
    this.updateMixZoomControls()
  }

  toggleMixFollow(event) {
    this.mixFollow = !!event.currentTarget.checked
  }

  isInMixView(sec) {
    const r = this.mixRange
    return sec >= r.startSec && sec <= r.endSec
  }

  // PC：Ctrl＋ホイール＝マウスの位置で拡大・縮小、ふつうのホイール（Shift でも）＝横に移動
  mixWheel(event) {
    if (!this.backingBuffer && !this.vocalBuffer) return
    const zooming = event.ctrlKey || event.metaKey
    const r = this.mixRange
    const span = r.endSec - r.startSec
    if (zooming) {
      event.preventDefault()
      const k = Math.pow(1.0015, -event.deltaY) // 下に回す＝縮小
      this.zoomMixBy(k, this.mixTimeAt(event))
      return
    }
    if (!this.mixView) return // 拡大していないときは、ページのスクロールをじゃましない
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (!delta) return
    event.preventDefault()
    const rect = this.mixTimelineTarget.getBoundingClientRect()
    const shift = (delta / rect.width) * span
    this.setMixView(r.startSec + shift, r.endSec + shift)
    this.scheduleMixDetail()
  }

  // ミニ全体図：押した所／ドラッグした所を真ん中にする
  mixOverviewDown(event) {
    this.mixOverviewDrag = true
    this.mixOverviewTarget.setPointerCapture?.(event.pointerId)
    this.mixOverviewMove(event)
  }

  mixOverviewMove(event) {
    if (!this.mixOverviewDrag || !this.mixView) return
    const rect = this.mixOverviewTarget.getBoundingClientRect()
    const t = (Math.max(0, Math.min(rect.width, event.clientX - rect.left)) / rect.width) * this.mixTimelineLength
    const r = this.mixRange
    const span = r.endSec - r.startSec
    this.setMixView(t - span / 2, t + span / 2)
  }

  mixOverviewUp() {
    if (!this.mixOverviewDrag) return
    this.mixOverviewDrag = false
    this.scheduleMixDetail()
  }

  // 拡大したら、見えている範囲だけ細かく計算し直す（拡大・移動が止まってから）
  scheduleMixDetail() {
    clearTimeout(this.mixDetailTimer)
    if (!this.mixView) { this.mixDetail = null; return }
    this.mixDetailTimer = setTimeout(() => this.computeMixDetail(), 180)
  }

  computeMixDetail() {
    if (!this.mixView || !this.hasMixTimelineTarget) return
    const r = this.mixRange
    const n = Math.max(200, Math.min(4000, this.mixTimelineTarget.width || 1000))
    const part = (buffer, songStart) => {
      if (!buffer) return null
      const d = buffer.getChannelData(0)
      const sr = buffer.sampleRate
      const out = new Float32Array(n)
      const step = (r.endSec - r.startSec) / n
      for (let p = 0; p < n; p++) {
        const a = Math.floor((r.startSec + p * step - songStart) * sr)
        const b = Math.floor((r.startSec + (p + 1) * step - songStart) * sr)
        const lo = Math.max(0, a)
        const hi = Math.min(d.length, Math.max(b, a + 1))
        let m = 0
        for (let i = lo; i < hi; i++) { const v = Math.abs(d[i]); if (v > m) m = v }
        out[p] = Math.min(1, m)
      }
      return out
    }
    this.mixDetail = {
      range: { ...r },
      backing: part(this.backingBuffer, 0),
      vocal: part(this.vocalBuffer, this.vocalOffsetMs / 1000),
      vocalBuffer: this.vocalBuffer, backingBuffer: this.backingBuffer, offsetMs: this.vocalOffsetMs
    }
  }

  updateMixZoomControls() {
    const r = this.mixRange
    const span = r.endSec - r.startSec
    const len = this.mixTimelineLength
    if (this.hasMixZoomInfoTarget) {
      this.mixZoomInfoTarget.textContent = this.mixView
        ? `${this.formatSec(r.startSec)}〜${this.formatSec(r.endSec)}（×${(len / span).toFixed(1)}）`
        : "全体を表示中"
    }
    if (this.hasMixYZoomButtonTarget) this.mixYZoomButtonTarget.textContent = `↕ 波形の高さ ×${this.mixYZoom}`
    if (this.hasMixOverviewTarget) this.mixOverviewTarget.hidden = !this.mixView
    if (this.hasMixZoomInButtonTarget) this.mixZoomInButtonTarget.disabled = span <= Math.min(2, len) + 0.01
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
    if (this.fxPrefs) this.updateFxInfo()
    if (this.mixTemplates) this.updateMixTemplateInfo() // 💾 テンプレートを当てる先（K42）
    if (this.mv && this.refreshMvEditAnchors) this.refreshMvEditAnchors() // 🎬 切りかえる所・部分ごとの色の一覧（K40）
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
    this.updateSectionTimes() // ✋ 選んでいる部分の始まり・終わり（K31）
    // 🎶 部分が増えた・消えた・動いたら、ハモリの「ハモる所」の選び肢も直す（K37）
    if (this.harmony && this.harmony.tracks.length) { this.renderHarmonyTracks(); this.updateHarmonyControls() }
  }

  // 部分ごとのミックスの波形：部分＝色の帯、選んでいる範囲＝黄色
  drawMixTimeline() {
    if (!this.hasMixTimelineTarget) return
    const c = this.mixTimelineTarget
    // 🔍 再生中、再生位置が画面の外に出たらついていく（K33）
    const now = this.songNow
    if (this.mixView && this.mixFollow && now !== null && now >= 0 && !this.mixPinch && !this.mixDrag) {
      const r0 = this.mixRange
      if (now > r0.endSec || now < r0.startSec) {
        const span = r0.endSec - r0.startSec
        this.setMixView(now - span * 0.1, now + span * 0.9)
        this.scheduleMixDetail()
      }
    }
    // 電池のため：変わっていなければ描き直さない（再生中は毎回描く）
    const r = this.mixRange
    const key = [c.clientWidth, c.clientHeight, r.startSec, r.endSec, this.mixYZoom, this.editId, this.sections.length,
      this.sections.map((s) => `${s.startSec},${s.endSec},${s.preset},${s.name},${s.auto ? 1 : 0}`).join("|"),
      this.mixSel ? `${this.mixSel.startSec},${this.mixSel.endSec}` : "", this.vocalOffsetMs, !!this.mixDetail,
      this.pinId || "", (this.pins || []).map((p) => `${p.sec},${p.color},${p.name}`).join("|"),
      this.objId(this.backingPeaks), this.objId(this.vocalPeaks), now !== null && now >= 0 ? now : -1].join(";")
    if (key === this.mixLastDraw) return
    this.mixLastDraw = key

    const u = this.fitCanvas(c)
    const g = c.getContext("2d")
    const w = c.width
    const h = c.height
    const span = r.endSec - r.startSec
    const toX = (sec) => ((sec - r.startSec) / span) * w
    g.fillStyle = "#0e1a33"
    g.fillRect(0, 0, w, h)

    // 目盛り（拡大の度合いで細かさを変える）
    const tick = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60].find((t) => (t / span) * w >= 70 * u) || 60
    g.fillStyle = "rgba(255,255,255,0.10)"
    g.font = `${10 * u}px sans-serif`
    g.textAlign = "left"
    for (let t = Math.ceil(r.startSec / tick) * tick; t <= r.endSec; t += tick) {
      const x = toX(t)
      g.fillStyle = "rgba(255,255,255,0.10)"
      g.fillRect(x, 0, Math.max(1, u), h)
      g.fillStyle = "rgba(255,255,255,0.45)"
      g.fillText(tick < 1 ? this.formatSec(t) : this.formatSec(t).replace(/\.0$/, ""), x + 3 * u, h - 4 * u)
    }
    // 拍の線（拡大したときだけ・オケの拍が分かっているとき）
    const beats = this.beatInfo?.beats
    if (beats && beats.length && span < 30) {
      g.fillStyle = "rgba(255,215,90,0.16)"
      for (const b of beats) {
        if (b < r.startSec) continue
        if (b > r.endSec) break
        g.fillRect(toX(b), 0, Math.max(1, u), h)
      }
    }

    const colors = ["rgba(79,182,255,0.30)", "rgba(140,120,255,0.30)", "rgba(80,220,200,0.28)", "rgba(255,150,90,0.28)"]
    g.font = `bold ${14 * u}px sans-serif`
    g.textAlign = "left"
    this.sections.forEach((s, i) => {
      if (s.endSec < r.startSec || s.startSec > r.endSec) return
      const x = toX(s.startSec)
      const bw = Math.max(2, toX(s.endSec) - x)
      const active = s.id === this.editId
      g.fillStyle = active ? "rgba(255,255,255,0.22)" : colors[i % colors.length]
      g.fillRect(x, 0, bw, h)
      if (active) { g.strokeStyle = "#ffffff"; g.lineWidth = 2 * u; g.strokeRect(x + u, u, bw - 2 * u, h - 2 * u) }
      g.save()
      g.beginPath(); g.rect(x, 0, bw, h); g.clip()
      g.fillStyle = "#ffffff"
      const tx = Math.max(x, 0) + 6 * u // 拡大して部分の頭が画面の外でも、名前は見えるように
      g.fillText(s.name, tx, 18 * u)
      const p = MIX_PRESETS[s.preset]
      g.font = `${11 * u}px sans-serif`
      g.fillStyle = "rgba(255,255,255,0.8)"
      g.fillText(`${p ? p.label : "🎛 カスタム"}${s.auto ? "　🪄自動" : ""}`, tx, 33 * u)
      g.font = `bold ${14 * u}px sans-serif`
      g.restore()
      // ✋ 選んでいる部分は、端につかめるツマミを出す（K31）
      if (active) {
        const knob = (kx) => {
          g.fillStyle = "#ffffff"
          g.fillRect(kx - 2 * u, 0, 4 * u, h)
          g.beginPath()
          g.arc(kx, h / 2, 7 * u, 0, Math.PI * 2)
          g.fill()
          g.fillStyle = "#0e1a33"
          g.fillRect(kx - 2.5 * u, h / 2 - 4 * u, 1.5 * u, 8 * u)
          g.fillRect(kx + 1 * u, h / 2 - 4 * u, 1.5 * u, 8 * u)
        }
        if (x >= -8 * u && x <= w + 8 * u) knob(x)
        if (x + bw >= -8 * u && x + bw <= w + 8 * u) knob(x + bw)
      }
    })

    const yz = this.mixYZoom
    const mid = h * 0.62
    const bar = (x, x2, v) => {
      const ph = Math.min(h * 0.74, v * h * 0.55 * yz) // はみ出た所は切る
      g.fillRect(x, mid - ph / 2, Math.max(1, x2 - x), ph)
    }
    // 細かい波形（見えている範囲だけ計算し直したもの）があれば、そっちで描く
    const d = this.mixDetail
    const detailOk = d && d.range.startSec === r.startSec && d.range.endSec === r.endSec &&
      d.vocalBuffer === this.vocalBuffer && d.backingBuffer === this.backingBuffer && d.offsetMs === this.vocalOffsetMs
    const drawDetail = (peaks, color) => {
      if (!peaks) return
      g.fillStyle = color
      const n = peaks.length
      for (let i = 0; i < n; i++) bar((i / n) * w, ((i + 1) / n) * w, peaks[i])
    }
    const drawPeaks = (peaks, durSec, startSec, color) => {
      if (!peaks || !durSec) return
      g.fillStyle = color
      const step = durSec / peaks.length
      const i0 = Math.max(0, Math.floor((r.startSec - startSec) / step))
      const i1 = Math.min(peaks.length, Math.ceil((r.endSec - startSec) / step) + 1)
      for (let i = i0; i < i1; i++) {
        bar(toX(startSec + i * step), toX(startSec + (i + 1) * step), peaks[i])
      }
    }
    if (detailOk) {
      drawDetail(d.backing, "rgba(150,175,230,0.35)")
      drawDetail(d.vocal, "#4fb6ff")
    } else {
      drawPeaks(this.backingPeaks, this.backingBuffer?.duration, 0, "rgba(150,175,230,0.35)")
      drawPeaks(this.vocalPeaks, this.vocalBuffer?.duration, this.vocalOffsetMs / 1000, "#4fb6ff")
    }

    if (this.mixSel) {
      const x = toX(this.mixSel.startSec)
      g.fillStyle = "rgba(255,215,90,0.28)"
      g.fillRect(x, 0, toX(this.mixSel.endSec) - x, h)
      g.fillStyle = "#ffd75a"
      g.fillRect(x - u, 0, 2 * u, h)
      g.fillRect(toX(this.mixSel.endSec) - u, 0, 2 * u, h)
    }
    // 📍 ピン（K32）：上から下まで細い線＋上の端に📍と名前。選んでいるピンは太く
    if (this.pins && this.pins.length) {
      g.font = `bold ${11 * u}px sans-serif`
      g.textAlign = "left"
      g.textBaseline = "middle"
      this.pins.forEach((p) => {
        if (p.sec < r.startSec || p.sec > r.endSec) return
        const x = toX(p.sec)
        const col = this.pinColor(p.color).color
        const active = p.id === this.pinId
        g.fillStyle = col
        const lw = (active ? 3 : 2) * u
        g.fillRect(x - lw / 2, 0, lw, h)
        const text = `📍${p.name || this.pinColor(p.color).label}`
        const tw = Math.min(g.measureText(text).width, 140 * u)
        const bh = 16 * u
        // 右の端では左に出す（はみ出さないように）
        const bx = x + 4 * u + tw + 8 * u > w ? x - 4 * u - tw - 8 * u : x + 4 * u
        g.fillStyle = active ? col : "rgba(10,18,40,0.85)"
        g.fillRect(bx, 2 * u, tw + 8 * u, bh)
        g.strokeStyle = col
        g.lineWidth = u
        g.strokeRect(bx + u / 2, 2 * u + u / 2, tw + 7 * u, bh - u)
        g.fillStyle = active ? "#0e1a33" : "#ffffff"
        g.save()
        g.beginPath(); g.rect(bx, 2 * u, tw + 8 * u, bh); g.clip()
        g.fillText(text, bx + 4 * u, 2 * u + bh / 2)
        g.restore()
      })
      g.textBaseline = "alphabetic"
    }
    if (now !== null && now >= 0) {
      g.fillStyle = "#ffffff"
      g.fillRect(toX(now) - u, 0, 2 * u, h)
    }
    this.drawMixOverview()
  }

  // 描き直しの判定用：同じものなら同じ番号（中身を文字にすると重いので）
  objId(o) {
    if (!o) return 0
    if (!this.objIds) { this.objIds = new WeakMap(); this.objIdNext = 1 }
    let id = this.objIds.get(o)
    if (!id) { id = this.objIdNext++; this.objIds.set(o, id) }
    return id
  }

  // ミニ全体図：曲の全体と、いま見えている範囲の枠
  drawMixOverview() {
    if (!this.hasMixOverviewTarget || !this.mixView) return
    const c = this.mixOverviewTarget
    const u = this.fitCanvas(c)
    const g = c.getContext("2d")
    const w = c.width
    const h = c.height
    const len = this.mixTimelineLength
    const toX = (sec) => (sec / len) * w
    g.fillStyle = "#0b1428"
    g.fillRect(0, 0, w, h)
    const peaks = this.vocalPeaks || this.backingPeaks
    const dur = this.vocalPeaks ? this.vocalBuffer?.duration : this.backingBuffer?.duration
    const start = this.vocalPeaks ? this.vocalOffsetMs / 1000 : 0
    if (peaks && dur) {
      g.fillStyle = "rgba(79,182,255,0.55)"
      const step = dur / peaks.length
      for (let i = 0; i < peaks.length; i++) {
        const x = toX(start + i * step)
        const ph = peaks[i] * h * 0.85
        g.fillRect(x, (h - ph) / 2, Math.max(1, toX(start + (i + 1) * step) - x), ph)
      }
    }
    // 📍 ピンの位置も全体図に小さく出す（K32）
    ;(this.pins || []).forEach((p) => { g.fillStyle = this.pinColor(p.color).color; g.fillRect(toX(p.sec) - u, 0, 2 * u, h) })
    const r = this.mixRange
    g.fillStyle = "rgba(255,215,90,0.22)"
    g.fillRect(toX(r.startSec), 0, toX(r.endSec) - toX(r.startSec), h)
    g.strokeStyle = "#ffd75a"
    g.lineWidth = 2 * u
    g.strokeRect(toX(r.startSec) + u, u, Math.max(2, toX(r.endSec) - toX(r.startSec) - 2 * u), h - 2 * u)
    const now = this.songNow
    if (now !== null && now >= 0) { g.fillStyle = "#fff"; g.fillRect(toX(now) - u / 2, 0, u, h) }
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
        auto: true, // 🪄 自動で見つけた（手で動かすと false になる・K31）
        settings: (({ reverbLength, ...rest }) => ({ ...rest, pro: {} }))(hype)
      })
    })
    this.sections.sort((a, b) => a.startSec - b.startSec)
    this.editId = null
    this.refreshMix({ save: false })
    this.setStatus(`🪄 サビっぽい所を${free.length}か所見つけて「🔥盛り上げる」を付けました。オケの大きさから推測した目安なので、本当のサビとずれていることがあります。帯の端をドラッグするか、帯を押して始まり・終わりを直してね`)
  }

  // 🪄 曲の構成を推測（K41）：オケの音の色・大きさ・くり返し（＋あれば歌声の有無）から、イントロ/Aメロ/Bメロ/サビ… の目安を④の部分に入れる。
  // オケだけでは本当の構成は分からないので、あくまで目安。入れた部分は 🪄（auto: true）印付きで、端のドラッグ・名前の変更で直せる
  async guessStructure() {
    if (!this.backingBuffer || this.mode !== "idle") {
      if (!this.backingBuffer) this.setStatus("曲の構成を推測するには、先に 🎼オケを入れてね")
      return
    }
    if (this.hasStructureButtonTarget) this.structureButtonTarget.disabled = true
    this.setStatus("🪄 曲の構成を推測しています…（数秒かかることがあります）")
    await new Promise((resolve) => setTimeout(resolve, 30))
    let parts = []
    try {
      const b = this.beatInfo
      parts = estimateStructure(this.backingBuffer, {
        beats: b && b.confidence > 0.05 ? b.beats : null,
        vocal: this.vocalBuffer || null,
        vocalOffsetSec: (this.vocalOffsetMs || 0) / 1000
      })
    } catch (e) {
      console.error(e)
      parts = []
    }
    if (this.hasStructureButtonTarget) this.structureButtonTarget.disabled = false
    if (!parts.length) {
      this.setStatus("曲の構成をうまく推測できませんでした（30秒より短い曲や、ずっと同じ感じの曲は苦手です）。波形をドラッグして手で部分を付けてね")
      return
    }
    let replaced = false
    if (this.sections.length) {
      replaced = window.confirm(
        "④にはもう部分の指示があります。\n\nOK：いまの部分を全部消して、推測した構成に入れかえる\nキャンセル：いまの部分はそのままで、重ならない所だけ足す"
      )
      if (replaced) this.sections = []
    }
    const free = parts.filter((r) => !this.sections.some((s) => r.startSec < s.endSec - 0.05 && r.endSec > s.startSec + 0.05))
    if (!free.length) {
      this.setStatus("推測した部分は、どれもいまの部分と重なっていたので足しませんでした")
      return
    }
    const hype = MIX_PRESETS.hype.settings
    const now = Date.now()
    free.forEach((r, i) => {
      const loud = r.name === "サビ" || r.name === "ラスサビ"
      this.sections.push({
        id: `s${now}${i}`,
        name: r.name,
        startSec: r.startSec,
        endSec: r.endSec,
        // サビは「🔥盛り上げる」（🪄サビっぽい所を探す と同じ）。ほかは今の曲全体と同じ音のまま（雰囲気ボタンで変えられる）
        preset: loud ? "hype" : this.mixPreset,
        auto: true,
        settings: loud
          ? (({ reverbLength, ...rest }) => ({ ...rest, pro: {} }))(hype)
          : (({ reverbLength, pro, ...rest }) => ({ ...rest, pro: { ...(pro || {}) } }))(this.mix)
      })
    })
    this.sections.sort((a, b) => a.startSec - b.startSec)
    this.editId = null
    this.mixSel = null
    this.refreshMix({ save: false })
    const names = free.map((r) => r.name).join(" → ")
    this.setStatus(
      `🪄 曲の構成の目安を${free.length}か所入れました${replaced ? "（前の部分は入れかえ）" : ""}：${names}。` +
      "オケの音の感じとくり返しから推測したものなので、本当の構成とずれていることがよくあります。帯の端をドラッグ・名前を変えて直してね（サビには🔥盛り上げるを付けました。ほかは今の音のまま）"
    )
  }

  // 録った声の大きさをチェックして、分かる言葉で教える
  // 録音の後のアドバイス（K26）。録音中のメーター（マイクに入った生の音）で割れていたら、それを優先して伝える
  levelAdvice(buffer) {
    const { rms, peak } = analyzeLevels(buffer)
    const m = this.lastMeter
    if ((m && m.clipped) || peak >= 0.985) {
      const n = this.countClips(buffer)
      const where = n > 0 ? `（割れた所 ${n}か所）` : ""
      return ` ⚠ 音が割れました${where}：マイクからこぶし1つぶん離れるか、OS のマイクの音量を下げて録り直すとキレイになります（${this.osVolumeHint()}）。録った後に🎚入力ゲインを下げても、割れた音は直りません`
    }
    if (rms > 0 && rms < 0.02) return " ⚠ 声が小さめ：マイクに少し近づくか、OS のマイクの音量を上げると雑音が目立ちにくくなります。今の声は🎚入力ゲインで大きくもできます"
    if (m && this.toDb(m.maxPeak) > -6) return ` 🟡 一番大きい所が ${this.toDb(m.maxPeak).toFixed(1)}dB でギリギリでした。もう少し離れると安心`
    return " ✅ 録音の大きさはちょうどいい感じ"
  }

  // 割れた所（1 に張り付いている所）が何か所あるか。0.2秒以内の連続は1か所として数える
  countClips(buffer) {
    const d = buffer.getChannelData(0)
    const gap = Math.floor(buffer.sampleRate * 0.2)
    let n = 0
    let last = -gap
    for (let i = 0; i < d.length; i++) {
      if (Math.abs(d[i]) >= CLIP_LEVEL) {
        if (i - last >= gap) n++
        last = i
      }
    }
    return n
  }

  // 前の版のアドバイス（使っていない・比較用に残す）
  levelAdviceOld(buffer) {
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
    else if (!this.mv?.title) text = "⑤ で動画のテンプレート・背景を選んで、曲名を入れよう（▶試聴で動きを確かめられます）"
    else text = "▶ 試聴して気に入ったら ⑥ で保存。もっと細かくしたいときは ④ の「🛠 詳細モード」"
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
    this.editCursor = t
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

  // 選んだ範囲（曲の時間）→ 声の時間
  get editSelVocal() {
    if (!this.editSel) return null
    const o = this.vocalOffsetMs / 1000
    return { startSec: Math.max(0, this.editSel.startSec - o), endSec: Math.max(0, this.editSel.endSec - o) }
  }

  async applyEdit(event) {
    if (!this.editSel || !this.vocalBase || this.mode !== "idle") return
    const el = event.currentTarget
    const type = el.dataset.editType
    const sel = this.editSelVocal
    const edit = { type, ...sel }
    let name = ""
    if (type === "gain") {
      edit.db = Number(el.dataset.editDb ?? this.editGainDbTarget.value)
      if (!Number.isFinite(edit.db)) return
      name = `音量を ${edit.db > 0 ? "+" : ""}${edit.db}dB 変えました`
    } else if (type === "pitch") {
      edit.cents = Number(el.dataset.editCents ?? this.editCentsTarget.value)
      if (!Number.isFinite(edit.cents) || !edit.cents) return
      name = `音の高さを ${edit.cents > 0 ? "+" : ""}${edit.cents}セント 変えました（100セント＝半音）`
    } else if (type === "tempo") {
      const pct = Number(el.dataset.editTempo ?? this.editTempoTarget.value)
      if (!Number.isFinite(pct) || pct < 25 || pct > 400 || pct === 100) return
      edit.rate = pct / 100
      name = `速さを ${pct}% にしました（後ろの声もずれます）`
    } else if (type === "delete") {
      name = "削除しました（後ろの声が前に詰まります）"
    } else {
      name = { silence: "無音にしました", fadeIn: "フェードインにしました", fadeOut: "フェードアウトにしました" }[type] || ""
    }
    const label = `${this.formatSec(this.editSel.startSec)}〜${this.formatSec(this.editSel.endSec)}`
    await this.pushEdit(edit)
    if (SHIFTING_EDITS.includes(type)) this.editSel = null
    this.setStatus(`✂️ ${label} を${name}（↩ 編集を戻す でやり直せます）`)
    this.updateEditControls()
  }

  async pushEdit(edit) {
    this.edits.push(edit)
    await this.rebuildVocal()
  }

  // 📋 コピー：今の声（編集のあと・ノイズ消しの前）から切り出す
  copySel() {
    const sel = this.editSelVocal
    if (!sel || !this.vocalForMatch) return null
    this.clipboard = extractRange(this.ctx, this.vocalForMatch, sel.startSec, sel.endSec)
    this.updateEditControls()
    if (this.clipboard) this.setStatus(`📋 ${this.clipboard.duration.toFixed(2)}秒ぶんコピーしました。貼り付けたい所を押して「貼り付け」`)
    return this.clipboard
  }

  // ✂️ 切り取り：コピーしてから削除
  async cutSel() {
    if (!this.editSel || this.mode !== "idle" || !this.copySel()) return
    const sel = this.editSelVocal
    await this.pushEdit({ type: "delete", ...sel })
    this.editCursor = this.editSel.startSec
    this.editSel = null
    this.setStatus(`✂️ ${this.clipboard.duration.toFixed(2)}秒ぶん切り取りました（後ろの声が前に詰まります）。貼り付けたい所を押して「貼り付け」`)
    this.updateEditControls()
  }

  // 📥 貼り付け：insert＝差し込む（後ろがずれる）／ overwrite＝上書き（後ろはずれない。サビの声を別のサビに使うとき）
  async pasteClip(event) {
    if (!this.clipboard || this.mode !== "idle" || !this.vocalBase) return
    const mode = event.currentTarget.dataset.pasteMode === "overwrite" ? "overwrite" : "paste"
    const songAt = this.editSel ? this.editSel.startSec : this.editCursor
    if (songAt === null || songAt === undefined) {
      this.setStatus("貼り付ける位置を、声の波形を押して選んでね")
      return
    }
    const at = Math.max(0, songAt - this.vocalOffsetMs / 1000)
    await this.pushEdit({ type: mode, startSec: at, endSec: at + this.clipboard.duration, clip: this.clipboard })
    this.editSel = { startSec: songAt, endSec: songAt + this.clipboard.duration }
    this.setStatus(`📥 ${this.formatSec(songAt)} に${mode === "overwrite" ? "上書きで" : "差し込んで"}貼り付けました${mode === "overwrite" ? "" : "（後ろの声がずれます）"}`)
    this.updateEditControls()
  }

  // 途中から録り直す前に、これまでの波形編集を元の声に確定する（録り直しの位置がずれないように）
  bakeEdits() {
    if (!this.edits.length) return false
    let buffer = this.vocalBase
    this.takes.forEach((t) => { buffer = spliceTake(this.ctx, buffer, t.raw, t.startSec, t.endSec) })
    this.vocalBase = applyEdits(this.ctx, buffer, this.edits)
    this.takes = []
    this.edits = []
    return true
  }

  // ---------- 🎹 オケのキー・速さ ----------

  shiftKey(event) {
    const d = Number(event.currentTarget.dataset.keyShift || 0)
    this.pendingKey = d === 0 ? 0 : Math.max(-12, Math.min(12, this.pendingKey + d))
    this.updateKeyTempoControls()
  }

  changeTempoSlider() {
    this.updateKeyTempoControls()
  }

  get pendingRate() {
    return this.hasTempoSliderTarget ? Number(this.tempoSliderTarget.value) / 100 : 1
  }

  updateKeyTempoControls() {
    if (!this.hasKeyValueTarget) return
    const k = this.pendingKey
    this.keyValueTarget.textContent = k === 0 ? "原曲キー" : `${k > 0 ? "+" : ""}${k}（${k > 0 ? "高く" : "低く"}）`
    this.tempoValueTarget.textContent = `${Math.round(this.pendingRate * 100)}%`
    const changed = k !== this.backingKey || Math.abs(this.pendingRate - this.backingRate) > 1e-6
    this.keyTempoApplyTarget.disabled = !(changed && this.backingOriginal && this.mode === "idle")
    this.keyTempoApplyTarget.textContent = changed ? "🎹 オケに反映する" : "反映ずみ"
  }

  async applyKeyTempo() {
    if (!this.backingOriginal || this.mode !== "idle") return
    const key = this.pendingKey
    const rate = this.pendingRate
    const oldRate = this.backingRate
    this.setMode("processing")
    this.setStatus("🎹 オケのキー・速さを変えています…（長い曲だと数秒〜十数秒かかります）")
    await new Promise((resolve) => setTimeout(resolve, 30))
    try {
      this.backingBuffer = changeKeyTempo(this.ctx, this.backingOriginal, { semitones: key, rate })
      this.backingPeaks = waveformPeaks(this.backingBuffer, 1000)
      if (rate !== oldRate) this.analyzeBacking() // 速さが変わると拍の位置も変わる
      this.backingKey = key
      this.backingRate = rate
      // 部分ごとのミックスは、曲の時間を速さに合わせて伸び縮みさせる
      if (rate !== oldRate) {
        const k = oldRate / rate
        this.sections.forEach((sec) => { sec.startSec *= k; sec.endSec *= k })
        this.pins.forEach((p) => { p.sec *= k }) // 📍ピンも同じだけ動かす（K32）
        this.renderPins()
        // 🎶 時間で指定したハモリの範囲も同じだけ動かす（K37）
        if (this.harmony) {
          this.harmony.tracks.forEach((t) => { if (t.range && t.range.type === "time") { t.range.startSec *= k; t.range.endSec *= k } })
          this.renderHarmonyTracks()
        }
      }
      const keyText = key === 0 ? "原曲キー" : `キー ${key > 0 ? "+" : ""}${key}`
      let note = ""
      if (this.vocalBase && rate !== oldRate) note = " ⚠ 速さを変えたので、録った声とはずれます。この速さで録り直してね"
      else if (this.vocalBase && key !== 0 && !this.keyFollowTarget.checked) note = " 録った声のキーも変えたいときは「声も同じだけキーを変える」にチェック"
      this.setMode("idle")
      if (this.vocalBase && this.keyFollowTarget.checked) await this.rebuildVocal()
      this.setStatus(`🎹 オケを ${keyText}・速さ ${Math.round(rate * 100)}% にしました。${note}`)
    } catch (e) {
      console.error(e)
      this.setMode("idle")
      this.setStatus("キー・速さを変えられませんでした")
    }
    this.updateKeyTempoControls()
  }

  // ▶ 試し聴き：15秒だけ、選んでいるキー・速さに変えて流す（曲全部を変えるより、ずっと早い）
  async previewKey(event) {
    if (!this.backingOriginal || this.mode !== "idle") return
    this.ensureContext()
    await this.ctx.resume()
    const src = this.backingOriginal
    const where = event.currentTarget.dataset.keyPreview
    const len = 15
    let from = 0
    if (where === "chorus") {
      const c = this.autoChoruses && this.autoChoruses[0]
      from = c ? c.startSec : Math.max(0, src.duration * 0.35)
    }
    from = Math.max(0, Math.min(from, src.duration - len))
    const piece = extractRange(this.ctx, src, from, Math.min(src.duration, from + len / Math.max(0.5, this.pendingRate)))
    if (!piece) return
    this.setMode("processing")
    this.setStatus("🎹 試し聴き用に変えています…")
    await new Promise((resolve) => setTimeout(resolve, 20))
    let shifted = piece
    try {
      shifted = changeKeyTempo(this.ctx, piece, { semitones: this.pendingKey, rate: this.pendingRate })
    } catch (e) {
      console.error(e)
    }
    this.setMode("idle")
    this.stopSources()
    const node = this.ctx.createBufferSource()
    node.buffer = shifted
    node.connect(this.backingGain)
    node.start(this.ctx.currentTime + 0.05)
    this.sources.push(node)
    this.setMode("playing")
    const k = this.pendingKey
    this.setStatus(`▶ ${k === 0 ? "原曲キー" : `キー ${k > 0 ? "+" : ""}${k}`}・速さ ${Math.round(this.pendingRate * 100)}% で試し聴き中…（よければ「🎹 オケに反映する」）`)
    this.endTimer = setTimeout(() => {
      this.stopSources()
      this.setMode("idle")
      this.setStatus(`試し聴きおわり。このキーでよければ「🎹 オケに反映する」を押してね`)
    }, (shifted.duration + 0.2) * 1000)
  }

  async changeKeyFollow() {
    if (!this.vocalBase || this.mode !== "idle" || this.backingKey === 0) return
    await this.rebuildVocal()
    this.setStatus(this.keyFollowTarget.checked ? `声のキーも ${this.backingKey > 0 ? "+" : ""}${this.backingKey} にしました` : "声のキーを元に戻しました")
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
    const canPaste = !!(this.clipboard && this.vocalBase && this.mode === "idle" && (sel || this.editCursor !== null))
    this.element.querySelectorAll("[data-needs-clip]").forEach((el) => { el.disabled = !canPaste })
    if (this.hasClipInfoTarget) this.clipInfoTarget.textContent = this.clipboard ? `📋 コピー中：${this.clipboard.duration.toFixed(2)}秒` : "📋 まだコピーしていません"
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
      this.edits.filter((e) => e.type !== "delete").forEach((e) => {
        const x = toX(e.startSec + offsetSec)
        g.strokeRect(x, u, Math.max(2, toX(e.endSec + offsetSec) - x), h - 2 * u)
      })
    }
    if (this.editSel) {
      const x = toX(this.editSel.startSec)
      g.fillStyle = "rgba(255,215,90,0.28)"
      g.fillRect(x, 0, Math.max(1, toX(this.editSel.endSec) - x), h)
    } else if (this.editCursor !== null) {
      g.fillStyle = "#ffd75a"
      g.fillRect(toX(this.editCursor) - u, 0, 2 * u, h) // 貼り付ける位置
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
      this.backingFileName = (file.name || "").replace(/\.[^.]+$/, "") // 💾 プロジェクトの名前に使う（K24）
      this.backingOriginal = buffer
      this.backingBuffer = buffer
      this.backingKey = 0
      this.backingRate = 1
      this.pendingKey = 0
      if (this.hasTempoSliderTarget) this.tempoSliderTarget.value = "100"
      this.updateKeyTempoControls()
      this.backingPeaks = waveformPeaks(buffer, 1000)
      this.mixView = null // 別の曲になったので、拡大は全体に戻す（K33）
      this.updateMixZoomControls()
      // 📍 別の曲になったので、ピンも消す（K32）
      this.pins = []
      this.pinId = null
      this.pinCursorSec = null
      this.renderPins()
      // 🎶 別の曲になったので、ハモリの範囲は「曲全体」に戻す（トラックは残す・K37）
      if (this.harmony) {
        this.harmony.tracks.forEach((t) => { t.range = { type: "all" } })
        this.renderHarmonyTracks()
      }
      this.analyzeBacking()
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

  // 音声ファイルに加えて、動画ファイル（mp4 / mov / webm など）も受け付ける。
  // 動画は decodeAudioData に渡すと音声トラックだけがデコードされる（映像は捨てる）。
  async decodeFile(file, label) {
    if (!file) return null
    const isVideo = (file.type || "").startsWith("video/") || /\.(mp4|mov|m4v|3gp|webm)$/i.test(file.name || "")
    const mb = file.size / (1024 * 1024)
    if (mb > MAX_MEDIA_MB) {
      this.setStatus(`${label}のファイルが大きすぎます（${Math.round(mb)}MB）。${MAX_MEDIA_MB}MB以下にしてね（動画なら短く切るか画質を下げると小さくなります）`)
      return null
    }
    if (isVideo) this.setStatus(`動画から${label}の音声を取り出しています…`)
    const buffer = await this.decodeBlob(file, label)
    if (buffer && isVideo) this.setStatus(`動画から${label}の音声を取り出しました（${buffer.duration.toFixed(1)}秒）`)
    if (!buffer && isVideo) this.setStatus(`動画から${label}の音声を取り出せませんでした（音声が入っていない動画か、この端末で読めない形式かも）`)
    return buffer
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
    // 波形編集（切り取り・貼り付け・音程なども）はノイズ消しの前 → ノイズ消しの強さを変えても編集は残る
    try {
      buffer = applyEdits(this.ctx, buffer, this.edits)
    } catch (e) {
      console.error(e)
      this.setStatus("波形の編集に失敗しました")
    }
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
    // オケのキーを変えたとき、声も同じだけ変える（チェックがあるとき）
    const follow = this.hasKeyFollowTarget && this.keyFollowTarget.checked ? this.backingKey : 0
    if (follow) {
      this.setStatus("🎹 声のキーを変えています…")
      await new Promise((resolve) => setTimeout(resolve, 30))
      buffer = changeKeyTempo(this.ctx, buffer, { semitones: follow })
    }
    // 🎚 入力ゲイン（K26）：最後に1回だけかける。ずれ合わせ・ノイズ消しには影響させない
    // （元の声・録り直し・編集のデータは変えない → 戻せる）
    // 🐸 ケロケロ風（K29）：音程を一番近い音に寄せる（声全体に1回だけかける。元の声は変えない）
    if (this.harmony && this.harmony.kero.enabled) {
      this.setStatus("🐸 ケロケロ風にしています…（長い曲だと数秒かかります）")
      await new Promise((resolve) => setTimeout(resolve, 30))
      try {
        const p = detectPitch(buffer)
        const key = this.harmonyKey()
        buffer = shiftPitchCurve(this.ctx, buffer, keroSemitones(p, key, this.harmony.kero.amount / 100), p.hop)
      } catch (e) {
        console.error(e)
        this.setStatus("🐸 ケロケロ風にできませんでした。元の声のまま使います")
      }
    }
    if (this.inputGainDb) buffer = this.applyGain(buffer, Math.pow(10, this.inputGainDb / 20))
    this.vocalBuffer = buffer
    this.vocalPeaks = waveformPeaks(buffer, 1000)
    // 🎶 声が変わったので、ハモリの元（声の音程）も作り直す（自動ハモリが ON なら声も作り直す）
    if (this.harmony) {
      this.harmony.pitch = null
      if (this.harmony.manual.base) this.rebuildHarmonyManual() // ノイズ消し・入力ゲインが変わったときだけ作り直す
      if (this.harmony.tracks.some((t) => t.enabled)) await this.buildAutoHarmony({ quiet: true }) // 🎶 自動ハモリのトラックを作り直す（K37）
    }
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
    if (this.hasAcapellaButtonTarget) this.acapellaButtonTargets.forEach((el) => { el.disabled = !(idle && this.vocalBuffer) })
    if (this.hasKeyPreviewButtonTarget) this.keyPreviewButtonTargets.forEach((el) => { el.disabled = !(idle && this.backingOriginal) })
    if (this.hasAutoAlignButtonTarget) this.autoAlignButtonTarget.disabled = !(idle && this.vocalBuffer)
    if (this.hasFastButtonTarget) this.fastButtonTarget.disabled = !(idle && hasSound && this.fastSupported)
    this.micStartButtonTarget.disabled = !(idle && this.backingBuffer)
    this.micStopButtonTarget.disabled = !(this.mode === "micRecording" || this.mode === "punching")
    this.stopButtonTarget.disabled = !(this.mode === "playing" || this.mode === "exporting" || this.mode === "levelCheck")
    this.resetButtonTarget.disabled = !(idle && hasVocal)
    this.countInTarget.disabled = !idle
    this.calibrateButtonTarget.disabled = !idle
    if (this.hasLevelCheckButtonTarget) this.levelCheckButtonTarget.disabled = !idle
    if (this.hasInputGainTarget) this.inputGainTarget.disabled = !idle
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
    if (this.pins) this.updatePinControls()
    if (this.edits) this.updateEditControls()
    if (this.backingOriginal !== undefined) this.updateKeyTempoControls()
    this.updateGuide()
    if (this.flow) this.renderFlow() // 「次へ」が押せるようになったかを反映
    this.updateMvControls()
    if (this.harmony) this.updateHarmonyControls() // 🎶 録音中・処理中はハモリのボタンも押せないように（K29）
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
  // guide：🎹ガイドメロディを鳴らすか（null＝「試聴でガイドメロディ」のチェックに従う）
  startSources(onEnded, { backingOnly = false, startAt = null, fromSec = 0, untilSec = null, noHarmony = false, guide = null } = {}) {
    this.stopSources()
    const at = startAt ?? this.ctx.currentTime + 0.1
    if (!backingOnly) this.scheduleMix(at, fromSec)
    this.scheduleSources(this.ctx, at, this.backingGain, this.vocalInput, { backingOnly, fromSec, noHarmony })
      .forEach((src) => this.sources.push(src))
    const wantGuide = guide !== null ? guide : (!backingOnly && this.hasHarmonyGuidePlayTarget && this.harmonyGuidePlayTarget.checked)
    if (wantGuide) this.scheduleGuideMelody(at, fromSec, untilSec)
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
  scheduleSources(ctx, startAt, backingDest, vocalDest, { backingOnly = false, vocalOnly = false, fromSec = 0, noHarmony = false } = {}) {
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
    if (this.backingBuffer && !vocalOnly) add(this.backingBuffer, backingDest, 0)
    if (this.vocalBuffer && !backingOnly) add(this.vocalBuffer, vocalDest, this.vocalOffsetMs / 1000)
    // 🎶 ハモリ（K29）：声と同じミックス（EQ・コンプ・リバーブ）に入れる。音量と左右はハモリごと
    // K37：ranges があれば、その範囲だけ鳴らす（境目は30msでフェード）。試聴・WAV・⚡MP4・声だけ書き出しで同じ
    if (!backingOnly && !noHarmony) {
      this.harmonyTracks().forEach((tr) => {
        const gain = ctx.createGain()
        gain.gain.value = tr.gain
        if (tr.ranges) {
          const F = 0.03
          const toCtx = (t) => startAt + (t - fromSec)
          const gp = gain.gain
          const inside = tr.ranges.some(([a, b]) => fromSec >= a && fromSec < b)
          gp.setValueAtTime(inside ? tr.gain : 0, Math.max(0, startAt))
          tr.ranges.slice().sort((x, y) => x[0] - y[0]).forEach(([a, b]) => {
            if (b <= fromSec) return
            if (a > fromSec) {
              gp.setValueAtTime(0, toCtx(a))
              gp.linearRampToValueAtTime(tr.gain, toCtx(a) + F)
            }
            const endAt = Math.max(toCtx(Math.max(a, fromSec)) + F, toCtx(b) - F)
            gp.setValueAtTime(tr.gain, endAt)
            gp.linearRampToValueAtTime(0, endAt + F)
          })
        }
        const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null
        if (pan) { pan.pan.value = tr.pan; gain.connect(pan); pan.connect(vocalDest) } else gain.connect(vocalDest)
        add(tr.buffer, gain, tr.startSec)
      })
    }
    return list
  }

  stopSources() {
    clearTimeout(this.endTimer)
    this.sources.forEach((src) => { try { src.stop() } catch (e) {} })
    this.sources = []
    this.stopGuideMelody()
  }

  // ---------- 🎹 ガイドメロディ（K36・11/10） ----------
  // 🎯ハモる音（選んでいるトラックの音程・範囲）を、ピアノっぽい音で先に全部予約して鳴らす。
  // スピーカー／ヘッドホンへ直接つなぐので、WAV・⚡MP4・声だけの書き出しには入らない
  scheduleGuideMelody(at, fromSec, untilSec = null) {
    this.stopGuideMelody()
    if (!this.ctx || !this.vocalBuffer || !this.harmony) return
    let p = null
    try { p = this.ensureMainPitch() } catch (e) { console.error(e) }
    if (!p) return
    const off = this.vocalOffsetMs / 1000
    const range = this.guideRange()
    if (range === undefined) return
    const until = untilSec ?? Infinity
    const notes = harmonyNotes(p, this.harmonyKey(), this.guideInterval())
      .map((n) => ({ start: n.start + off, end: n.end + off, midi: n.midi }))
      .map((n) => (range ? { ...n, start: Math.max(n.start, range[0]), end: Math.min(n.end, range[1]) } : n))
      .filter((n) => n.end - n.start >= 0.06 && n.end > fromSec && n.start < until)
      .slice(0, 3000) // 長い曲でも重くなりすぎないように
    if (!notes.length) return
    const ctx = this.ctx
    const vol = this.hasHarmonyGuideVolumeTarget ? Number(this.harmonyGuideVolumeTarget.value) : 0.5
    const out = ctx.createGain()
    out.gain.value = 0.35 * vol
    const lp = ctx.createBiquadFilter()
    lp.type = "lowpass"
    lp.frequency.value = 2800
    lp.connect(out)
    out.connect(ctx.destination)
    const nodes = []
    notes.forEach((n) => {
      const s = Math.max(n.start, fromSec)
      const t0 = at + (s - fromSec)
      const t1 = at + (Math.min(n.end, until) - fromSec)
      if (t1 <= ctx.currentTime) return
      const hz = midiToHz(n.midi)
      const env = ctx.createGain()
      env.gain.setValueAtTime(0, t0)
      env.gain.linearRampToValueAtTime(1, t0 + 0.006)                                // 打鍵
      env.gain.exponentialRampToValueAtTime(0.35, Math.max(t0 + 0.02, Math.min(t1, t0 + 0.4))) // 減衰
      env.gain.setValueAtTime(0.35, Math.max(t0 + 0.02, t1))
      env.gain.linearRampToValueAtTime(0, Math.max(t0 + 0.02, t1) + 0.12)            // 離鍵
      env.connect(lp)
      const o1 = ctx.createOscillator()
      o1.type = "triangle"
      o1.frequency.value = hz
      const o2 = ctx.createOscillator()
      o2.type = "sine"
      o2.frequency.value = hz * 2
      const g2 = ctx.createGain()
      g2.gain.value = 0.25
      o1.connect(env)
      o2.connect(g2)
      g2.connect(env)
      const stopAt = Math.max(t0 + 0.02, t1) + 0.15
      o1.start(t0); o2.start(t0)
      o1.stop(stopAt); o2.stop(stopAt)
      nodes.push(o1, o2)
    })
    this.guideMelody = { out, nodes }
  }

  stopGuideMelody() {
    const g = this.guideMelody
    if (!g) return
    g.nodes.forEach((o) => { try { o.stop() } catch (e) {} })
    try { g.out.disconnect() } catch (e) {}
    this.guideMelody = null
  }

  // 🎹 ガイドメロディの音量（鳴らしている途中なら次の ▶ から）
  changeGuideVolume() {
    if (this.guideMelody && this.ctx && this.hasHarmonyGuideVolumeTarget) {
      this.guideMelody.out.gain.setTargetAtTime(0.35 * Number(this.harmonyGuideVolumeTarget.value), this.ctx.currentTime, 0.03)
    }
    this.updateHarmonyControls()
  }

  toggleGuidePlay() {
    const on = this.hasHarmonyGuidePlayTarget && this.harmonyGuidePlayTarget.checked
    this.setStatus(on ? "🎹 ガイドメロディ ON：▶試聴でハモる音がピアノの音で鳴ります（書き出しには入りません）" : "🎹 ガイドメロディ OFF")
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
    if (this.mode === "exporting") this.exportCancel = true // 速い書き出しを止める
    if (this.tapIndex !== null && this.tapIndex !== undefined) {
      this.tapIndex = null
      if (this.hasTapPanelTarget) this.tapPanelTarget.hidden = true
      this.renderLyricList()
    }
    this.stopSources()
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop()
    if (this.micRecorder && this.micRecorder.state !== "inactive") this.micRecorder.stop()
    if (this.mode === "playing") {
      this.setMode("idle")
      this.setStatus("停止しました")
    }
    if (this.mode === "levelCheck") this.mode = "levelCheckStop" // 🎙声出しチェックを途中でやめる（checkLevel のループが見て抜ける）
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
      this.startMeter(this.micStream) // 🎙 マイクに入った音の大きさを見せる（K26）
      return this.micStream
    } catch (e) {
      console.error(e)
      this.setStatus("マイクが使えませんでした。ブラウザの設定でマイクを許可してください")
      return null
    }
  }

  stopMicStream() {
    this.stopMeter()
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop())
      this.micStream = null
      this.setAudioSession("playback")
    }
  }

  // ---------- 🎙 録音のメーター・声出しチェック・入力ゲイン（K26） ----------
  // メーターは「マイクに入った生の音」を見る（入力ゲインをかける前）。
  // マイクの段階で割れた音はあとから直せないので、割れたかどうかは生の音で判断する。
  // 入力ゲインは、録り終わった声の大きさを変えるだけ（割れは防げない）。

  startMeter(stream) {
    this.stopMeter()
    if (!this.ctx || !stream) return
    const src = this.ctx.createMediaStreamSource(stream)
    const an = this.ctx.createAnalyser()
    an.fftSize = 2048
    an.smoothingTimeConstant = 0
    src.connect(an) // スピーカーにはつながない（自分の声が鳴らないように）
    this.meter = { src, an, buf: new Float32Array(an.fftSize), peakHold: 0, holdUntil: 0, maxPeak: 0, clipped: false, level: 0 }
    if (this.hasLevelMeterTarget) this.levelMeterTarget.hidden = false
    this.showClip(false)
    const tick = () => {
      const m = this.meter
      if (!m) return
      m.an.getFloatTimeDomainData(m.buf)
      let peak = 0
      for (let i = 0; i < m.buf.length; i++) { const v = Math.abs(m.buf[i]); if (v > peak) peak = v }
      m.maxPeak = Math.max(m.maxPeak, peak)
      // 針は上がるのは速く、下がるのはゆっくり（見やすいように）
      m.level = peak > m.level ? peak : m.level * 0.9 + peak * 0.1
      const now = performance.now()
      if (peak >= m.peakHold || now > m.holdUntil) { m.peakHold = peak; m.holdUntil = now + 1200 }
      if (peak >= CLIP_LEVEL && !m.clipped) { m.clipped = true; this.showClip(true) }
      this.drawMeter(m.level, m.peakHold)
      m.raf = requestAnimationFrame(tick)
    }
    this.meter.raf = requestAnimationFrame(tick)
  }

  stopMeter() {
    const m = this.meter
    if (!m) return
    cancelAnimationFrame(m.raf)
    try { m.src.disconnect() } catch (e) {}
    this.lastMeter = { maxPeak: m.maxPeak, clipped: m.clipped } // 録音の後のアドバイスで使う
    this.meter = null
    this.drawMeter(0, 0)
  }

  // 0〜1 の音 → メーターの位置（-48dB〜0dB を 0〜100%）
  meterPos(v) {
    const db = this.toDb(v)
    return Math.max(0, Math.min(100, ((db + 48) / 48) * 100))
  }

  toDb(v) {
    return v > 0 ? 20 * Math.log10(v) : -Infinity
  }

  drawMeter(level, peak) {
    if (this.hasLevelBarTarget) {
      const pos = this.meterPos(level)
      this.levelBarTarget.style.width = `${pos}%`
      const db = this.toDb(level)
      this.levelBarTarget.dataset.zone = db > -1 ? "red" : db > -6 ? "yellow" : "green"
    }
    if (this.hasLevelPeakTarget) this.levelPeakTarget.style.left = `${this.meterPos(peak)}%`
    if (this.hasLevelDbTarget) {
      const db = this.toDb(peak)
      this.levelDbTarget.textContent = Number.isFinite(db) ? `${db.toFixed(1)}dB` : "−∞dB"
    }
  }

  showClip(on) {
    if (this.hasLevelClipTarget) this.levelClipTarget.hidden = !on
  }

  // ピーク（0〜1）から、分かる言葉のアドバイスを作る
  levelVerdict(peak) {
    const db = this.toDb(peak)
    if (!Number.isFinite(db) || db < -40) return { zone: "none", text: "🔇 声が聞こえませんでした。マイクが選ばれているか、ミュートになっていないか確認してね" }
    if (db > -1) return { zone: "red", text: `🔴 割れる大きさ（${db.toFixed(1)}dB）：マイクからこぶし1つぶん離れるか、OS のマイクの音量を下げてね` }
    if (db > -6) return { zone: "yellow", text: `🟡 ギリギリ（${db.toFixed(1)}dB）：本番で声を張ると割れるかも。少し離れるか、OS のマイクの音量を少し下げてね` }
    if (db >= -18) return { zone: "green", text: `🟢 ちょうどいい（${db.toFixed(1)}dB）：このまま録音してOK` }
    return { zone: "blue", text: `🔵 小さめ（${db.toFixed(1)}dB）：もう少し近づくか、OS のマイクの音量を上げてね（雑音が目立ちにくくなります）` }
  }

  osVolumeHint() {
    const ua = navigator.userAgent || ""
    if (/iPhone|iPad|iPod/.test(ua)) return "iPhone はマイクの音量を変えられないので、口とスマホの距離で合わせてね"
    if (/Android/.test(ua)) return "Android は機種によって設定の場所が違います。合わなければ口とスマホの距離で合わせてね"
    if (/Mac/.test(ua)) return "Mac：システム設定 →「サウンド」→「入力」の入力音量"
    if (/Windows/.test(ua)) return "Windows：設定 →「システム」→「サウンド」→ 入力のマイク →「入力の音量」"
    return "OS のサウンド設定の「入力（マイク）」の音量"
  }

  // 🎙 声出しチェック：5秒間いちばん大きい声で歌ってもらい、ピークを測る（録音はしない）
  async checkLevel() {
    if (this.mode !== "idle") return
    this.ensureContext()
    await this.ctx.resume()
    const stream = await this.openMic()
    if (!stream) return
    this.setMode("levelCheck")
    for (let left = LEVEL_CHECK_SEC; left > 0; left--) {
      this.setStatus(`🎙 声出しチェック中…あと${left}秒。この曲でいちばん声を張る所を、本番と同じ大きさで歌ってみて`)
      await new Promise((resolve) => setTimeout(resolve, 1000))
      if (this.mode !== "levelCheck") break // ほかの操作で止められた
    }
    const stopped = this.mode !== "levelCheck"
    const peak = this.meter ? this.meter.maxPeak : 0
    this.stopMicStream()
    if (stopped) {
      this.setStatus("🎙 声出しチェックをやめました")
      this.setMode("idle")
      return
    }
    const v = this.levelVerdict(peak)
    try { window.localStorage.setItem(LEVEL_KEY, JSON.stringify({ peakDb: this.toDb(peak), zone: v.zone, at: Date.now() })) } catch (e) {}
    this.updateLevelInfo()
    this.setStatus(v.zone === "red" || v.zone === "yellow" || v.zone === "blue" ? `${v.text}（${this.osVolumeHint()}）` : v.text)
    this.setMode("idle")
  }

  updateLevelInfo() {
    if (!this.hasLevelInfoTarget) return
    let saved = null
    try { saved = JSON.parse(window.localStorage.getItem(LEVEL_KEY) || "null") } catch (e) {}
    if (!saved || !Number.isFinite(saved.peakDb)) { this.levelInfoTarget.textContent = "まだ測っていません"; return }
    const icon = { red: "🔴", yellow: "🟡", green: "🟢", blue: "🔵", none: "🔇" }[saved.zone] || ""
    const d = new Date(saved.at)
    this.levelInfoTarget.textContent = `前回：${saved.peakDb.toFixed(1)}dB ${icon}（${d.getMonth() + 1}/${d.getDate()}）`
  }

  // 入力ゲイン（dB）。録り終わった声に1回だけかける（-12〜+12dB）
  loadInputGain() {
    try {
      const v = Number(window.localStorage.getItem(INPUT_GAIN_KEY))
      if (Number.isFinite(v)) return Math.max(-12, Math.min(12, v))
    } catch (e) {}
    return 0
  }

  async changeInputGain() {
    this.inputGainDb = Number(this.inputGainTarget.value) || 0
    try { window.localStorage.setItem(INPUT_GAIN_KEY, String(this.inputGainDb)) } catch (e) {}
    this.updateInputGainLabel()
    if (!this.vocalBase || this.mode !== "idle") return
    await this.rebuildVocal()
    const warn = this.inputGainDb > 0 && this.vocalBuffer && analyzeLevels(this.vocalBuffer).peak >= CLIP_LEVEL
      ? "。⚠ 上げすぎて割れています。少し下げてね" : ""
    this.setStatus(`🎚 入力ゲイン：${this.inputGainDb > 0 ? "+" : ""}${this.inputGainDb}dB（▶試聴で確かめてね）${warn}`)
  }

  updateInputGainLabel() {
    if (this.hasInputGainTarget && document.activeElement !== this.inputGainTarget) this.inputGainTarget.value = String(this.inputGainDb)
    if (this.hasInputGainValueTarget) this.inputGainValueTarget.textContent = `${this.inputGainDb > 0 ? "+" : ""}${this.inputGainDb}dB`
  }

  // 声の大きさを k 倍にした新しい AudioBuffer を返す（元は変えない）
  applyGain(buffer, k) {
    const out = this.ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate)
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const src = buffer.getChannelData(ch)
      const dst = out.getChannelData(ch)
      // 1 を超えた所はそのまま頭打ちにする（ゲインを上げすぎると割れる → 画面で注意を出す）
      for (let i = 0; i < src.length; i++) dst[i] = Math.max(-1, Math.min(1, src[i] * k))
    }
    return out
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
    if (this.bakeEdits()) {
      await this.rebuildVocal()
      this.setStatus("波形の編集を確定してから録り直します（編集の ↩ は、ここより前には戻れません）")
    }
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

  // ミックスした音を、一気に計算して作る（WAV と速い書き出しで同じものを使う）
  // 試聴と同じつなぎ：オケ → 音量 ┐、声 → ミックス → 音量 ┘ → リミッター → 出口
  // vocalOnly：声だけ（アカペラ・K23）。dry：エフェクトなし（EQ・コンプ・リバーブ・リミッターを通さない）
  // どちらも曲の時間に合わせて書き出す（ずれ補正込み）→ あとでオケと並べても合う
  async renderMix(sampleRate, { vocalOnly = false, dry = false } = {}) {
    // 響き（リバーブ）の余韻が切れないように、少し長めに作る
    const tail = dry ? 0 : reverbTail(this.activeMix)
    const length = Math.ceil((this.duration + tail) * sampleRate)
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext
    const off = new OAC(2, length, sampleRate)
    const backingGain = off.createGain()
    const vocalGain = off.createGain()
    backingGain.gain.value = parseFloat(this.backingVolumeTarget.value)
    // 声だけのときは、オケとのバランス用の音量スライダーは使わない（1倍）
    vocalGain.gain.value = vocalOnly ? 1 : parseFloat(this.vocalVolumeTarget.value)
    let vocalIn = vocalGain
    if (dry) {
      vocalGain.connect(off.destination)
    } else {
      const chain = createVocalChain(off)
      scheduleMixTimeline(chain, this.mixTimeline, 0, 0) // 部分ごとの切りかえも同じように入れる
      const limiter = createLimiter(off)
      chain.output.connect(vocalGain)
      backingGain.connect(limiter)
      vocalGain.connect(limiter)
      limiter.connect(off.destination)
      vocalIn = chain.input
    }
    this.scheduleSources(off, 0, backingGain, vocalIn, { vocalOnly })
    const rendered = await off.startRendering()
    // 仕上げ：聴きやすい大きさにそろえる（配信サイトの音量に近づける）
    // エフェクトなしの声（素材として使う）は、録ったままの大きさを残す
    let loud = ""
    if (!dry && (!this.hasNormalizeExportTarget || this.normalizeExportTarget.checked)) {
      const gain = normalizeLoudness(rendered)
      loud = `・音量そろえ ${gain >= 1 ? "+" : ""}${(20 * Math.log10(gain)).toFixed(1)}dB`
    }
    return { rendered, loud }
  }

  async exportAudio() {
    if (!this.backingBuffer && !this.vocalBuffer) return
    await this.exportWav({ filename: "utattemita.wav", label: "音声" })
  }

  // 🎤 声だけ（アカペラ）を WAV で書き出す（K23）。data-dry="1" ならエフェクトなし
  async exportAcapella(event) {
    if (!this.vocalBuffer) return
    const dry = event?.currentTarget?.dataset?.dry === "1"
    await this.exportWav({
      vocalOnly: true,
      dry,
      filename: dry ? "utattemita_acapella_dry.wav" : "utattemita_acapella.wav",
      label: dry ? "声だけ（エフェクトなし）" : "声だけ（エフェクトあり）"
    })
  }

  async exportWav({ vocalOnly = false, dry = false, filename, label }) {
    this.ensureContext()
    this.endMixBypass()
    this.setMode("exporting")
    this.setStatus(`${label}を作っています…`)
    try {
      const { rendered, loud } = await this.renderMix((this.backingBuffer || this.vocalBuffer).sampleRate, { vocalOnly, dry })
      const blob = this.encodeWav(rendered)
      const link = this.audioDownloadTarget
      if (link.href) URL.revokeObjectURL(link.href)
      link.href = URL.createObjectURL(blob)
      link.download = filename
      link.textContent = `⬇ ${label}（WAV）をダウンロード`
      link.hidden = false
      this.setStatus(`${label}の書き出し完了（WAV・${(blob.size / 1024 / 1024).toFixed(1)}MB${loud}）。下の ⬇ から保存してね`)
    } catch (e) {
      console.error(e)
      this.setStatus(`${label}の書き出しに失敗しました`)
    }
    this.setMode("idle")
  }

  // ---------- ⚡ 速い書き出し（手順4e：WebCodecs で MP4） ----------

  setupFastExport() {
    this.fastSupported = fastExportSupported()
    this.exportCancel = false
    if (this.hasFastNoteTarget) {
      this.fastNoteTarget.textContent = this.fastSupported
        ? "曲を流さずに作るので、曲の長さより早く終わります（PC の Chrome・Edge なら数倍速い）。MP4 なので iPhone や各サイトでそのまま使えます"
        : "このブラウザは速い書き出しに対応していません。下の「🎬 録画で書き出し」を使ってね（PC の Chrome・Edge なら使えます）"
    }
  }

  get exportScale() {
    return this.hasExportQualityTarget && this.exportQualityTarget.value === "high" ? 1.5 : 1
  }

  async fastExport() {
    if (!this.fastSupported || this.mode !== "idle" || (!this.backingBuffer && !this.vocalBuffer)) return
    this.ensureContext()
    this.endMixBypass()
    this.exportCancel = false
    this.setMode("exporting")
    this.showExportProgress(0)
    const r = MV_RATIOS[this.mv.ratio]
    const scale = this.exportScale
    const width = Math.round((r.width * scale) / 2) * 2 // 動画は縦横とも偶数にする
    const height = Math.round((r.height * scale) / 2) * 2
    const fps = 30
    const bitrate = scale > 1 ? 10_000_000 : 5_000_000
    try {
      this.setStatus("⚡ この端末で使える動画の形式を調べています…")
      const videoPick = await pickVideoConfig(width, height, fps, bitrate)
      const audioPick = await pickAudioConfig((this.backingBuffer || this.vocalBuffer).sampleRate)
      if (!videoPick || !audioPick) {
        this.setStatus("この端末では MP4 を作れませんでした。「🎬 録画で書き出し」を使ってね")
        return
      }
      this.setStatus("⚡ 音を作っています…")
      const { rendered, loud } = await this.renderMix(audioPick.config.sampleRate)
      if (this.exportCancel) throw new Error("cancelled")
      this.setStatus("⚡ 音に合わせた動きを計算しています…")
      await new Promise((resolve) => setTimeout(resolve, 30))
      const track = computeFeatureTrack(rendered, fps)
      // ✂️ 書き出す範囲・🌅 音のフェード（K40）：範囲だけ切り出して、頭と終わりをなめらかに
      const clip = this.mvClipRange
      const audio = this.mvExportAudio(rendered, clip)
      const frameOffset = clip ? Math.round(clip.startSec * fps) : 0
      const t0 = clip ? clip.startSec : 0
      // 絵の材料は最初に1回だけ集める（1コマごとに変わるのは時間と音の値だけ）
      const base = this.mvScene
      const duration = audio.duration
      const scene = { ...base, duration: base.duration, clip }
      const started = performance.now()
      const blob = await encodeMp4({
        audio, audioPick, videoPick, width, height, fps, duration,
        drawFrame: (g, w, h, t, i) => {
          scene.features = track[Math.min(track.length - 1, i + frameOffset)]
          renderFrame(g, w, h, t0 + t, scene)
        },
        onProgress: (p, rest) => {
          this.showExportProgress(p)
          this.setStatus(`⚡ 動画を作っています… ${Math.round(p * 100)}%（${rest}）`)
        },
        isCancelled: () => this.exportCancel
      })
      const sec = (performance.now() - started) / 1000
      const link = this.downloadTarget
      if (link.href) URL.revokeObjectURL(link.href)
      link.href = URL.createObjectURL(blob)
      const tag = { "16:9": "yoko", "9:16": "tate", "1:1": "square" }[this.mv.ratio] || "yoko"
      link.download = `utattemita_${tag}${clip ? "_clip" : ""}${scale > 1 ? "_hq" : ""}.mp4`
      link.textContent = "⬇ 動画（MP4）をダウンロード"
      link.hidden = false
      this.setStatus(`⚡ 書き出し完了（MP4・${width}×${height}・${videoPick.label}／${audioPick.label}・${(blob.size / 1024 / 1024).toFixed(1)}MB・${Math.round(sec)}秒で作成${loud}）。下の ⬇ から保存してね`)
    } catch (e) {
      if (e && e.message === "cancelled") this.setStatus("書き出しをやめました")
      else {
        console.error(e)
        this.setStatus("速い書き出しに失敗しました。「🎬 録画で書き出し」を試してね")
      }
    } finally {
      this.hideExportProgress()
      this.setMode("idle")
    }
  }

  showExportProgress(p) {
    if (!this.hasExportProgressTarget) return
    this.exportProgressTarget.hidden = false
    this.exportProgressTarget.value = Math.round(p * 1000)
  }

  hideExportProgress() {
    if (this.hasExportProgressTarget) this.exportProgressTarget.hidden = true
  }

  // ✂️ 書き出す範囲・🌅 音のフェード（K40）。何も設定していなければ、そのままの音を返す
  mvExportAudio(buffer, clip) {
    const e = this.mvEdit
    const fi = e.fadeAudio ? e.fadeIn : 0
    const fo = e.fadeAudio ? e.fadeOut : 0
    if (!clip && !fi && !fo) return buffer
    const sr = buffer.sampleRate
    const a = clip ? Math.max(0, Math.floor(clip.startSec * sr)) : 0
    const b = clip ? Math.min(buffer.length, Math.ceil(clip.endSec * sr)) : buffer.length
    const len = Math.max(1, b - a)
    const out = this.ctx.createBuffer(buffer.numberOfChannels, len, sr)
    const edge = clip ? 0.05 : 0 // 範囲の端でプツッと鳴らないように、少しだけなめらかに
    const fin = Math.round(Math.max(fi, edge) * sr)
    const fout = Math.round(Math.max(fo, edge) * sr)
    // 範囲がないときは、曲の終わり（響きの余韻の前）に向けて消す
    const endIdx = clip ? len : Math.min(len, Math.round((this.duration || buffer.duration) * sr))
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const dst = out.getChannelData(ch)
      dst.set(buffer.getChannelData(ch).subarray(a, b))
      for (let i = 0; i < fin && i < len; i++) dst[i] *= i / fin
      if (fout > 0) {
        for (let i = 0; i < fout; i++) {
          const j = endIdx - fout + i
          if (j >= 0 && j < len) dst[j] *= 1 - i / fout
        }
        if (fo > 0) for (let j = Math.max(0, endIdx); j < len; j++) dst[j] = 0
      }
    }
    return out
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
      link.download = `utattemita_${{ "16:9": "yoko", "9:16": "tate", "1:1": "square" }[this.mv?.ratio] || "yoko"}${clip ? "_clip" : ""}.${ext}`
      link.textContent = `⬇ 動画（${ext.toUpperCase()}）をダウンロード`
      link.hidden = false
      this.mvClipActive = false
      this.setMode("idle")
      this.setStatus(`動画の書き出し完了（${ext}・${(blob.size / 1024 / 1024).toFixed(1)}MB）`)
    }

    // ✂️ 書き出す範囲（K40）があれば、その範囲だけ流して録る（🌅 音のフェードは⚡のときだけ）
    const clip = this.mvClipRange
    this.mvClipActive = !!clip
    this.setMode("exporting")
    this.recorder.start(1000)
    this.startSources(() => {
      if (this.recorder.state !== "inactive") this.recorder.stop()
    }, clip ? { fromSec: clip.startSec, untilSec: clip.endSec } : {})
    const len = clip ? clip.endSec - clip.startSec : this.duration
    this.setStatus(`録画中…（${len.toFixed(0)}秒かかります。タブはこのままで）${clip ? "　✂️ 書き出す範囲だけ録っています" : ""}`)
  }

  // ---------- 描画 ----------

  // 動画用の波形（録画にも写る）と、録り直し用のタイムライン（録画には写らない）をずっと描き続ける
  // ---------- 🎬 MV（手順4a：テンプレート・背景・曲名・プレビュー） ----------

  loadMvPrefs() {
    try {
      const v = JSON.parse(window.localStorage.getItem(MV_KEY) || "null")
      if (v && typeof v === "object") return v
    } catch (e) {}
    return {}
  }

  saveMvPrefs() {
    // 歌った人の名前・テンプレート・暗さはこの端末に覚える（曲名・クレジットは曲ごとなので覚えない）
    // 🏷 ロゴ（K40）は文字・位置・大きさ・濃さだけ覚える（画像はプロジェクトと一緒に保存）
    try {
      const lg = this.mv.edit ? this.mv.edit.logo : null
      const logo = lg ? { enabled: lg.enabled && lg.kind === "text", kind: "text", text: lg.text, corner: lg.corner, size: lg.size, opacity: lg.opacity } : null
      window.localStorage.setItem(MV_KEY, JSON.stringify({ template: this.mv.template, artist: this.mv.artist, dim: this.mv.dim, fx: this.fxPrefs, ratio: this.mv.ratio, anim: this.mv.anim, logo }))
    } catch (e) {}
  }

  setupMv() {
    const prefs = this.loadMvPrefs()
    this.mv = {
      template: MV_TEMPLATES[prefs.template] ? prefs.template : "simple",
      image: null,
      gradient: MV_GRADIENTS[0],
      colors: gradientColors(MV_GRADIENTS[0]),
      dim: Number.isFinite(prefs.dim) ? prefs.dim : 0.2,
      title: "",
      artist: prefs.artist || "",
      credit: "",
      bgCredit: "",
      bgKey: `g:${MV_GRADIENTS[0].id}`,
      bgSrcs: null, // 背景素材の、向きごとの画像
      ratio: MV_RATIOS[prefs.ratio] ? prefs.ratio : "16:9",
      anim: { ...DEFAULT_MV_ANIM, ...(prefs.anim || {}) }, // 🎞 アニメーション（K30）
      karaoke: true,
      // 🎬 もっと編集（K40）。ロゴの文字・位置などだけはこの端末に覚える（画像はプロジェクトと一緒に保存）
      edit: normalizeMvEdit({ logo: { ...(prefs.logo || {}), hasImage: false } })
    }
    this.mvSlideImages = new Map() // スライドの id → 読み込んだ画像
    this.mvSlideFiles = new Map()  // 手元の画像から足したスライドの id → ファイル（保存用）
    this.mvLogoImage = null
    this.mvLogoFile = null
    this.applyMvRatio()
    this.lyrics = []
    this.tapIndex = null
    this.renderLyricList()
    // 🎆 おまかせ演出（4c）
    const fx = prefs.fx || {}
    this.fxPrefs = {
      strength: Number.isFinite(fx.strength) ? fx.strength : 60,
      beat: fx.beat !== false,
      chorus: fx.chorus !== false,
      sparkle: fx.sparkle !== false,
      // 🪄 部分の名前ごとの演出（K41）。表で変えた所だけ覚える
      byName: Object.fromEntries(Object.entries({ ...DEFAULT_PART_STYLES, ...(fx.byName || {}) }).filter(([, v]) => MV_PART_STYLES[v]))
    }
    this.beatInfo = null
    this.autoChoruses = []
    if (this.hasFxStrengthTarget) {
      this.fxStrengthTarget.value = String(this.fxPrefs.strength)
      this.fxBeatTarget.checked = this.fxPrefs.beat
      this.fxChorusTarget.checked = this.fxPrefs.chorus
      this.fxSparkleTarget.checked = this.fxPrefs.sparkle
    }
    this.updateFxInfo()
    this.mvSeekSec = 0
    this.mvFeatures = null
    if (this.hasMvArtistTarget) this.mvArtistTarget.value = this.mv.artist
    if (this.hasMvDimTarget) this.mvDimTarget.value = String(Math.round(this.mv.dim * 100))
    this.buildMvBackgrounds()
    this.loadMyBackgrounds()
    this.updateMvControls()
    this.renderMvEdit() // 🎬 もっと編集（K40）
    this.updateMvAnimControls()
  }

  // 背景の候補：色（グラデーション）→ KotoBouquet の背景素材 → マイ画像（あとから足す）
  buildMvBackgrounds() {
    if (!this.hasMvBgListTarget) return
    const list = this.mvBgListTarget
    list.replaceChildren()
    const add = (key, label, { thumb = null, css = null, data = {} } = {}) => {
      const b = document.createElement("button")
      b.type = "button"
      b.className = "sg-bg"
      b.title = label
      b.dataset.bgKey = key
      b.dataset.action = "singing-mixer#selectMvBackground"
      Object.entries(data).forEach(([k, v]) => { b.dataset[k] = v })
      if (thumb) {
        const img = document.createElement("img")
        img.src = thumb
        img.alt = label
        img.loading = "lazy"
        b.appendChild(img)
      } else {
        b.style.background = css
        b.textContent = label
      }
      list.appendChild(b)
      return b
    }
    MV_GRADIENTS.forEach((gr) => add(`g:${gr.id}`, gr.label, { css: `linear-gradient(135deg, ${gr.stops[0]}, ${gr.stops[1]})`, data: { bgGradient: gr.id } }))
    this.backgroundsValue.forEach((m) => add(`m:${m.id}`, m.name, {
      thumb: m.thumb,
      data: { bgSrc: m.src, bgCredit: m.source || "", bgSrcs: JSON.stringify(m.srcs || {}) }
    }))
    this.mySlot = document.createElement("span")
    this.mySlot.className = "sg-bg-mine"
    list.appendChild(this.mySlot)
  }

  // マイ画像（KotoBouquet で入れた背景・部品）。ログインしている本人のものだけ返ってくる
  async loadMyBackgrounds() {
    if (!this.mySlot) return
    try {
      const res = await fetch("/user_images", { headers: { Accept: "application/json" }, credentials: "same-origin" })
      if (!res.ok) return
      const images = await res.json()
      images.slice(0, 40).forEach((i) => {
        const b = document.createElement("button")
        b.type = "button"
        b.className = "sg-bg"
        b.title = `マイ画像：${i.name}`
        b.dataset.bgKey = `u:${i.id}`
        b.dataset.bgSrc = `/user_images/${i.id}`
        b.dataset.action = "singing-mixer#selectMvBackground"
        const img = document.createElement("img")
        img.src = i.thumb ? `/user_images/${i.id}/thumb` : `/user_images/${i.id}`
        img.alt = i.name
        img.loading = "lazy"
        b.appendChild(img)
        this.mySlot.appendChild(b)
      })
      this.updateMvControls()
    } catch (e) {
      console.warn("マイ画像を読み込めませんでした", e)
    }
  }

  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.decoding = "async"
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = src
    })
  }

  async selectMvBackground(event) {
    const el = event.currentTarget
    const key = el.dataset.bgKey
    if (el.dataset.bgGradient) {
      const gr = MV_GRADIENTS.find((x) => x.id === el.dataset.bgGradient) || MV_GRADIENTS[0]
      Object.assign(this.mv, { image: null, gradient: gr, colors: gradientColors(gr), bgCredit: "", bgKey: key, bgSrcs: null })
      this.updateMvControls()
      return
    }
    try {
      this.setStatus("🖼 背景を読み込んでいます…")
      let srcs = null
      try { srcs = el.dataset.bgSrcs ? JSON.parse(el.dataset.bgSrcs) : null } catch (e) {}
      const img = await this.loadImage((srcs && srcs[this.mv.ratio]) || el.dataset.bgSrc)
      Object.assign(this.mv, { image: img, colors: pickColors(img), bgCredit: el.dataset.bgCredit || "", bgKey: key, bgSrcs: srcs, bgSrc: el.dataset.bgSrc })
      this.setStatus("🖼 背景を変えました。文字や波の色は、背景に合わせて自動で決めています")
    } catch (e) {
      this.setStatus("背景の画像を読み込めませんでした")
    }
    this.updateMvControls()
  }

  // 手元の画像（プロジェクトと一緒にアカウントに保存する・K39）
  async loadMvImage(event) {
    const file = event.target.files[0]
    event.target.value = ""
    if (!file) return
    try {
      if (this.mvObjectUrl) URL.revokeObjectURL(this.mvObjectUrl)
      this.mvObjectUrl = URL.createObjectURL(file)
      const img = await this.loadImage(this.mvObjectUrl)
      Object.assign(this.mv, { image: img, colors: pickColors(img), bgCredit: "", bgKey: "file", bgSrcs: null })
      this.mvImageFile = file // 💾 プロジェクトに画像も保存する（アカウントに・K39）
      this.setStatus("🖼 手元の画像を背景にしました（プロジェクトと一緒にアカウントに保存されます）")
    } catch (e) {
      this.setStatus("この画像は使えませんでした")
    }
    this.updateMvControls()
  }

  // 📐 動画の向き（4d）：横・縦・正方形
  async selectMvRatio(event) {
    const ratio = event.currentTarget.dataset.mvRatio
    if (!MV_RATIOS[ratio] || this.mode === "exporting") return
    this.mv.ratio = ratio
    this.applyMvRatio()
    this.saveMvPrefs()
    // 背景素材に、その向き用の画像があれば読み直す
    const src = this.mv.bgSrcs && (this.mv.bgSrcs[ratio] || this.mv.bgSrc)
    if (src) {
      try {
        const img = await this.loadImage(src)
        this.mv.image = img
      } catch (e) {}
    }
    await this.reloadMvSlidesForRatio() // 🎬 切りかえる背景も、その向き用の画像があれば（K40）
    this.updateMvControls()
    const tip = ratio === "9:16" ? "。うすい赤の所は TikTok・ショートでボタンや説明が重なるので、大事な文字は入れていません" : ""
    this.setStatus(`📐 ${MV_RATIOS[ratio].label} にしました${tip}`)
  }

  // キャンバスの大きさを向きに合わせる（書き出す動画の大きさもこれ）
  applyMvRatio() {
    const r = MV_RATIOS[this.mv.ratio]
    const c = this.canvasTarget
    if (c.width !== r.width || c.height !== r.height) {
      c.width = r.width
      c.height = r.height
    }
    c.style.aspectRatio = `${r.width} / ${r.height}`
    this.element.dataset.mvRatio = this.mv.ratio
  }

  toggleMvSafe() {
    this.element.dataset.mvSafe = this.mvSafeTarget.checked ? "on" : "off"
  }

  selectMvTemplate(event) {
    const name = event.currentTarget.dataset.mvTemplate
    if (!MV_TEMPLATES[name]) return
    this.mv.template = name
    this.saveMvPrefs()
    this.updateMvControls()
    this.setStatus(`🎬 テンプレート：${MV_TEMPLATES[name].label}（${MV_TEMPLATES[name].hint}）`)
  }

  changeMvText() {
    this.mv.title = this.mvTitleTarget.value.trim()
    this.mv.artist = this.mvArtistTarget.value.trim()
    this.mv.credit = this.mvCreditTarget.value.trim()
    this.mv.dim = Number(this.mvDimTarget.value) / 100
    this.saveMvPrefs()
    this.updateMvControls()
  }

  // 止まっているときに、曲のどこの絵かを選んで見る（最初の曲名・最後のクレジットも確かめられる）
  seekMv() {
    this.mvSeekSec = (Number(this.mvSeekTarget.value) / 1000) * this.duration
    this.updateMvControls()
  }

  mvJump(event) {
    const where = event.currentTarget.dataset.mvJump
    const d = this.duration
    const sec = where === "intro" ? 1.5 : where === "outro" ? Math.max(0, d - 2.5) : d * 0.4
    this.mvSeekSec = sec
    if (this.hasMvSeekTarget && d > 0) this.mvSeekTarget.value = String(Math.round((sec / d) * 1000))
    this.updateMvControls()
  }

  updateMvControls() {
    if (!this.mv) return
    if (this.hasMvTemplateButtonTarget) {
      this.mvTemplateButtonTargets.forEach((el) => el.setAttribute("aria-pressed", String(el.dataset.mvTemplate === this.mv.template)))
    }
    if (this.hasMvRatioButtonTarget) {
      this.mvRatioButtonTargets.forEach((el) => el.setAttribute("aria-pressed", String(el.dataset.mvRatio === this.mv.ratio)))
    }
    if (this.hasMvTemplateHintTarget) this.mvTemplateHintTarget.textContent = MV_TEMPLATES[this.mv.template].hint
    if (this.hasMvBgListTarget) {
      this.mvBgListTarget.querySelectorAll("[data-bg-key]").forEach((el) => el.setAttribute("aria-pressed", String(el.dataset.bgKey === this.mv.bgKey)))
    }
    if (this.hasMvBgCreditTarget) this.mvBgCreditTarget.textContent = "" // 背景の出典はクレジットに入れないので出さない（K28）
    if (this.hasMvDimValueTarget) this.mvDimValueTarget.textContent = `${Math.round(this.mv.dim * 100)}%`
    if (this.hasMvSeekValueTarget) this.mvSeekValueTarget.textContent = `${this.formatSec(this.mvSeekSec)} / ${this.formatSec(this.duration)}`
  }

  // ---------- 🎬 もっと編集（K40・11/10） ----------
  // 背景の切りかえ・スライドショー／自由なテロップ／色のフィルター／書き出す範囲／フェード／ロゴ・透かし。
  // 設定は this.mv.edit（normalizeMvEdit の形）。画像は this.mvSlideImages（id → 画像）・this.mvLogoImage。
  // 手元の画像は this.mvSlideFiles・this.mvLogoFile に持って、プロジェクトと一緒にアカウントに保存する（K39）

  get mvEdit() {
    if (!this.mv) return normalizeMvEdit(null)
    if (!this.mv.edit) this.mv.edit = normalizeMvEdit(null)
    return this.mv.edit
  }

  newMvId(prefix) {
    this.mvIdSeq = (this.mvIdSeq || 0) + 1
    return `${prefix}${Date.now().toString(36)}${this.mvIdSeq}`
  }

  // 今の位置（再生中は鳴っている所、止まっているときは「見る所」）
  mvNowSec() {
    const now = this.songNow
    return Math.max(0, now !== null ? now : (this.mvSeekSec || 0))
  }

  // 部分（④の帯）・📍ピン・時間 → 曲の秒（見つからなければ null）
  mvAnchorSec(anchor) {
    if (!anchor) return 0
    if (anchor.type === "section") {
      const s = (this.sections || []).find((x) => x.id === anchor.id)
      return s ? s.startSec : null
    }
    if (anchor.type === "pin") {
      const p = (this.pins || []).find((x) => x.id === anchor.id)
      return p ? p.sec : null
    }
    return Math.max(0, Number(anchor.sec) || 0)
  }

  mvSlideLook(s) {
    return {
      image: this.mvSlideImages ? this.mvSlideImages.get(s.id) || null : null,
      gradient: s.gradientId ? MV_GRADIENTS.find((g) => g.id === s.gradientId) || null : null
    }
  }

  // 🖼 背景の並び（renderFrame に渡す）。1つ目はいつもの背景（「🖼 背景」で選んだもの）
  get mvBgTimeline() {
    const e = this.mvEdit
    if (!this.mv || e.bgMode === "off" || !e.slides.length) return null
    const usable = e.slides.filter((s) => s.gradientId || (this.mvSlideImages && this.mvSlideImages.get(s.id)))
    if (!usable.length) return null
    const main = { startSec: 0, image: this.mv.image, gradient: this.mv.gradient }
    if (e.bgMode === "cycle") {
      const all = [main, ...usable.map((s) => this.mvSlideLook(s))]
      const step = Math.max(2, e.bgInterval)
      const dur = Math.max(this.duration || 0, step)
      const out = []
      for (let i = 0; i * step < dur + step && out.length < 2000; i++) out.push({ ...all[i % all.length], startSec: i * step })
      return out
    }
    let first = main
    const rest = []
    usable.forEach((s) => {
      const sec = this.mvAnchorSec(s.anchor)
      if (sec === null || !Number.isFinite(sec)) return
      const p = { ...this.mvSlideLook(s), startSec: sec }
      if (sec <= 0.01) first = { ...p, startSec: 0 }
      else rest.push(p)
    })
    rest.sort((a, b) => a.startSec - b.startSec)
    if (!rest.length) return first === main ? null : [first, { ...first }]
    return [first, ...rest]
  }

  // 🎨 部分ごとのフィルター → [{ startSec, endSec, kind }]
  get mvFilterSpans() {
    const parts = this.mvEdit.filterParts || {}
    return (this.sections || [])
      .filter((s) => parts[s.id] && MV_FILTERS[parts[s.id]])
      .map((s) => ({ startSec: s.startSec, endSec: s.endSec, kind: parts[s.id] }))
  }

  // ✂️ 書き出す範囲（オンで、1秒以上あるときだけ）
  get mvClipRange() {
    const r = this.mvEdit.range
    if (!r || r.enabled === false) return null
    const d = this.duration || 0
    const startSec = Math.max(0, Math.min(d, r.startSec))
    const endSec = Math.max(0, Math.min(d, r.endSec))
    return endSec - startSec >= 1 ? { startSec, endSec } : null
  }

  // renderFrame に渡す値（mvScene に入れる）。何も設定していなければ、今までと同じ絵
  get mvEditScene() {
    const e = this.mvEdit
    const lg = e.logo
    const clipOn = this.mvClipActive && (this.mode === "playing" || this.mode === "exporting")
    return {
      bgTimeline: this.mvBgTimeline,
      bgFade: e.bgFade,
      filter: e.filter,
      filterAmount: e.filterAmount,
      filterSpans: this.mvFilterSpans,
      telops: e.telops.filter((t) => t.text && t.endSec > t.startSec),
      logo: lg.enabled ? { ...lg, image: lg.kind === "image" ? this.mvLogoImage : null } : null,
      fadeIn: e.fadeIn,
      fadeOut: e.fadeOut,
      clip: clipOn ? this.mvClipRange : null
    }
  }

  // ----- 🖼 背景の切りかえ・スライドショー -----

  selectMvBgMode(event) {
    const mode = event.currentTarget.dataset.bgMode
    if (!MV_BG_MODES[mode]) return
    this.mvEdit.bgMode = mode
    this.renderMvEdit()
    const tip = mode === "off" ? "（いつもの背景だけを使います）"
      : !this.mvEdit.slides.length ? "。下の小さい背景を押して、切りかえる背景を足してね" : ""
    this.setStatus(`🖼 背景の切りかえ：${MV_BG_MODES[mode]}${tip}`)
  }

  // 新しいスライドの「切りかえる所」：選んでいる部分 → 今の位置
  defaultSlideAnchor() {
    const s = this.editingSection
    if (s) return { type: "section", id: s.id }
    return { type: "time", sec: Math.round(this.mvNowSec() * 10) / 10 }
  }

  // 背景の候補（色・KotoBouquet の素材・マイ画像）を押す → スライドに足す
  async addMvSlideFrom(event) {
    const el = event.currentTarget
    const e = this.mvEdit
    if (e.slides.length >= 30) { this.setStatus("🖼 背景の切りかえは 30 枚までです"); return }
    const id = this.newMvId("b")
    const slide = { id, key: el.dataset.bgKey || "", label: el.title || "背景", anchor: this.defaultSlideAnchor() }
    if (el.dataset.bgGradient) {
      slide.gradientId = el.dataset.bgGradient
    } else {
      let srcs = null
      try { srcs = el.dataset.bgSrcs ? JSON.parse(el.dataset.bgSrcs) : null } catch (err) {}
      slide.src = el.dataset.bgSrc
      slide.srcs = srcs
      const thumb = el.querySelector("img")
      if (thumb) slide.thumb = thumb.src
      try {
        this.setStatus("🖼 背景を読み込んでいます…")
        this.mvSlideImages.set(id, await this.loadImage((srcs && srcs[this.mv.ratio]) || slide.src))
      } catch (err) {
        this.setStatus("この背景は読み込めませんでした")
        return
      }
    }
    e.slides.push(slide)
    if (e.bgMode === "off") e.bgMode = "cycle"
    this.renderMvEdit()
    this.setStatus(`🖼「${slide.label}」を足しました（${e.slides.length}枚）。${e.bgMode === "cycle" ? `${e.bgInterval}秒ごとに切りかわります` : "切りかえる所を選んでね"}`)
  }

  // 手元の画像をスライドに足す（プロジェクトと一緒にアカウントに保存）
  async addMvSlideFile(event) {
    const file = event.target.files[0]
    event.target.value = ""
    if (!file) return
    const e = this.mvEdit
    if (e.slides.length >= 30) { this.setStatus("🖼 背景の切りかえは 30 枚までです"); return }
    try {
      const id = this.newMvId("b")
      const url = URL.createObjectURL(file)
      const img = await this.loadImage(url)
      this.mvSlideImages.set(id, img)
      this.mvSlideFiles.set(id, file)
      e.slides.push({ id, key: "file", label: file.name || "手元の画像", file: true, thumb: url, anchor: this.defaultSlideAnchor() })
      if (e.bgMode === "off") e.bgMode = "cycle"
      this.renderMvEdit()
      this.setStatus("🖼 手元の画像を足しました（プロジェクトと一緒にアカウントに保存されます）")
    } catch (err) {
      this.setStatus("この画像は使えませんでした")
    }
  }

  mvSlideOf(event) {
    const id = event.currentTarget.dataset.slideId
    return this.mvEdit.slides.find((s) => s.id === id) || null
  }

  changeMvSlideAnchor(event) {
    const s = this.mvSlideOf(event)
    if (!s) return
    const v = event.currentTarget.value
    if (v.startsWith("section:")) s.anchor = { type: "section", id: v.slice(8) }
    else if (v.startsWith("pin:")) s.anchor = { type: "pin", id: v.slice(4) }
    else s.anchor = { type: "time", sec: Math.round((this.mvAnchorSec(s.anchor) || this.mvNowSec()) * 10) / 10 }
    this.renderMvEdit()
  }

  changeMvSlideTime(event) {
    const s = this.mvSlideOf(event)
    if (!s) return
    const sec = this.parseTime(event.currentTarget.value)
    if (sec === null) { this.setStatus("⏱ 時間は「1:23.4」か「83.4」の形で入れてね"); this.renderMvEdit(); return }
    s.anchor = { type: "time", sec: Math.max(0, sec) }
    this.updateMvEditControls()
  }

  mvSlideNow(event) {
    const s = this.mvSlideOf(event)
    if (!s) return
    s.anchor = { type: "time", sec: Math.round(this.mvNowSec() * 10) / 10 }
    this.renderMvEdit()
  }

  moveMvSlide(event) {
    const e = this.mvEdit
    const i = e.slides.findIndex((s) => s.id === event.currentTarget.dataset.slideId)
    const j = i + Number(event.currentTarget.dataset.dir || 0)
    if (i < 0 || j < 0 || j >= e.slides.length) return
    const [s] = e.slides.splice(i, 1)
    e.slides.splice(j, 0, s)
    this.renderMvEdit()
  }

  deleteMvSlide(event) {
    const s = this.mvSlideOf(event)
    if (!s) return
    this.mvEdit.slides = this.mvEdit.slides.filter((x) => x.id !== s.id)
    this.mvSlideImages.delete(s.id)
    this.mvSlideFiles.delete(s.id)
    this.renderMvEdit()
  }

  // 向きを変えたとき、素材に「その向き用の画像」があれば読み直す
  async reloadMvSlidesForRatio() {
    for (const s of this.mvEdit.slides) {
      if (!s.srcs || !s.srcs[this.mv.ratio]) continue
      try { this.mvSlideImages.set(s.id, await this.loadImage(s.srcs[this.mv.ratio])) } catch (e) {}
    }
  }

  // ----- 💬 テロップ -----

  addMvTelop() {
    const e = this.mvEdit
    if (e.telops.length >= 50) { this.setStatus("💬 テロップは 50 個までです"); return }
    const at = Math.round(this.mvNowSec() * 10) / 10
    const end = Math.max(at + 1, Math.min(this.duration || at + 4, at + 4))
    e.telops.push({ id: this.newMvId("t"), text: "", startSec: at, endSec: end, pos: "bottom", size: "m", color: "#ffffff" })
    this.renderMvEdit()
    const inputs = this.hasMvTelopListTarget ? this.mvTelopListTarget.querySelectorAll("input[data-field=text]") : []
    if (inputs.length) inputs[inputs.length - 1].focus()
    this.setStatus(`💬 テロップを足しました（${this.formatSec(at)}〜${this.formatSec(end)}）。文字を入れてね`)
  }

  mvTelopOf(event) {
    const id = event.currentTarget.dataset.telopId
    return this.mvEdit.telops.find((t) => t.id === id) || null
  }

  changeMvTelop(event) {
    const tp = this.mvTelopOf(event)
    if (!tp) return
    const el = event.currentTarget
    const field = el.dataset.field
    if (field === "text") tp.text = el.value.slice(0, 80)
    else if (field === "pos") tp.pos = MV_TELOP_POSITIONS[el.value] ? el.value : "bottom"
    else if (field === "size") tp.size = MV_TELOP_SIZES[el.value] ? el.value : "m"
    else if (field === "color") tp.color = /^#[0-9a-fA-F]{6}$/.test(el.value) ? el.value : "#ffffff"
    else if (field === "start" || field === "end") {
      const sec = this.parseTime(el.value)
      if (sec === null) { this.setStatus("⏱ 時間は「1:23.4」か「83.4」の形で入れてね"); this.renderMvEdit(); return }
      if (field === "start") tp.startSec = Math.max(0, sec)
      else tp.endSec = Math.max(0, sec)
      if (tp.endSec < tp.startSec + 0.3) {
        if (field === "start") tp.endSec = tp.startSec + 1
        else tp.startSec = Math.max(0, tp.endSec - 1)
      }
      this.renderMvEdit()
      return
    }
    this.updateMvEditControls()
  }

  // ⏱ 今の位置から出す（長さはそのまま）
  mvTelopNow(event) {
    const tp = this.mvTelopOf(event)
    if (!tp) return
    const len = Math.max(1, tp.endSec - tp.startSec)
    tp.startSec = Math.round(this.mvNowSec() * 10) / 10
    tp.endSec = tp.startSec + len
    this.renderMvEdit()
  }

  // 🟨 ④の波形で選んだ範囲（なければ選んでいる部分・📍〜📍）に合わせる
  mvTelopFromSel(event) {
    const tp = this.mvTelopOf(event)
    const r = this.mixSel || this.editingSection
    if (!tp) return
    if (!r) { this.setStatus("🟨 先に ④ミックスの波形で範囲を選ぶか、部分を押してね"); return }
    tp.startSec = r.startSec
    tp.endSec = r.endSec
    this.renderMvEdit()
  }

  async playMvTelop(event) {
    const tp = this.mvTelopOf(event)
    if (!tp) return
    await this.playMvSpan(Math.max(0, tp.startSec - 1), tp.endSec + 0.5, "💬 テロップの所を試聴中…")
  }

  deleteMvTelop(event) {
    const tp = this.mvTelopOf(event)
    if (!tp) return
    this.mvEdit.telops = this.mvEdit.telops.filter((t) => t.id !== tp.id)
    this.renderMvEdit()
  }

  // 決めた所だけ鳴らす（MV のプレビューもそこが動く）
  async playMvSpan(fromSec, untilSec, message, { clip = false } = {}) {
    if (this.mode !== "idle" || (!this.backingBuffer && !this.vocalBuffer)) return
    this.ensureContext()
    await this.ctx.resume()
    this.endMixBypass()
    this.mvClipActive = clip
    this.setMode("playing")
    this.startSources(() => {
      this.mvClipActive = false
      this.setMode("idle")
      this.setStatus("試聴おわり")
    }, { fromSec, untilSec })
    this.setStatus(message)
  }

  // ----- 🎨 色のフィルター -----

  selectMvFilter(event) {
    const kind = event.currentTarget.dataset.filter
    if (!MV_FILTERS[kind]) return
    this.mvEdit.filter = kind
    this.updateMvEditControls()
    this.setStatus(`🎨 曲全体の色：${MV_FILTERS[kind].label}（${MV_FILTERS[kind].hint}）`)
  }

  changeMvFilterPart(event) {
    const id = event.currentTarget.dataset.sectionId
    const v = event.currentTarget.value
    const parts = { ...(this.mvEdit.filterParts || {}) }
    if (!MV_FILTERS[v]) delete parts[id]
    else parts[id] = v
    this.mvEdit.filterParts = parts
    this.updateMvEditControls()
  }

  // ----- ✂️ 書き出す範囲 -----

  setMvRange(startSec, endSec, label) {
    const d = this.duration || 0
    const a = Math.max(0, Math.min(d, startSec))
    const b = Math.max(0, Math.min(d, endSec))
    if (b - a < 1) { this.setStatus("✂️ 書き出す範囲は1秒以上にしてね"); return false }
    this.mvEdit.range = { startSec: Math.round(a * 10) / 10, endSec: Math.round(b * 10) / 10, enabled: true }
    this.updateMvEditControls()
    this.setStatus(`✂️ 書き出す範囲：${label ? `${label}・` : ""}${this.formatSec(a)}〜${this.formatSec(b)}（${(b - a).toFixed(1)}秒）。⚡・🎬の書き出しがこの範囲だけになります`)
    return true
  }

  toggleMvRange(event) {
    const on = event.currentTarget.checked
    const e = this.mvEdit
    if (on) {
      if (e.range) { e.range.enabled = true; this.updateMvEditControls(); return }
      const r = this.mixSel || this.editingSection
      if (r) this.setMvRange(r.startSec, r.endSec, "選んだ範囲")
      else this.setMvRange(this.mvNowSec(), this.mvNowSec() + 30, "今の位置から30秒")
    } else if (e.range) {
      e.range.enabled = false
      this.updateMvEditControls()
      this.setStatus("✂️ 書き出す範囲をやめました（曲の最初から最後まで書き出します）")
    }
  }

  changeMvRange(event) {
    const sec = this.parseTime(event.currentTarget.value)
    if (sec === null) { this.setStatus("⏱ 時間は「1:23.4」か「83.4」の形で入れてね"); this.updateMvEditControls(); return }
    const r = this.mvEdit.range || { startSec: 0, endSec: Math.min(this.duration || 30, 30) }
    if (event.currentTarget.dataset.side === "start") this.setMvRange(sec, Math.max(r.endSec, sec + 1))
    else this.setMvRange(Math.min(r.startSec, sec - 1), sec)
  }

  mvRangeFromSel() {
    const r = this.mixSel || this.editingSection
    if (!r) { this.setStatus("🟨 先に ④ミックスの波形で範囲を選ぶか、部分を押してね"); return }
    this.setMvRange(r.startSec, r.endSec, "選んだ範囲")
  }

  // 🔥 サビ1つぶん：④で「サビ」「ラスサビ」を付けた所（なければ自動で見つけたサビっぽい所）
  mvRangeChorus() {
    const mine = (this.sections || []).filter((s) => s.name === "サビ" || s.name === "ラスサビ")
    const r = mine[0] || (this.autoChoruses || [])[0]
    if (!r) { this.setStatus("🔥 サビの場所が分かりません。④で部分に「サビ」を付けるか、🪄曲の構成を推測してね"); return }
    this.setMvRange(r.startSec, r.endSec, mine[0] ? "④で付けたサビ" : "自動で見つけたサビっぽい所（目安）")
  }

  mvRange30() {
    const a = this.mvNowSec()
    this.setMvRange(a, a + 30, "今の位置から30秒")
  }

  async playMvRange() {
    const r = this.mvClipRange
    if (!r) { this.setStatus("✂️ 先に書き出す範囲を決めてね"); return }
    await this.playMvSpan(r.startSec, r.endSec, "✂️ 書き出す範囲を試聴中…（曲名・フェードも範囲に合わせて出ます）", { clip: true })
  }

  // ----- 🌅 フェード・🏷 ロゴ -----

  changeMvEdit(event) {
    const el = event.currentTarget
    const key = el.dataset.editKey
    const e = this.mvEdit
    const n = Number(el.value)
    switch (key) {
      case "bgInterval": e.bgInterval = Math.max(2, Math.min(60, n || 8)); break
      case "filterAmount": e.filterAmount = Math.max(0, Math.min(100, Number.isFinite(n) ? n : 70)); break
      case "fadeIn": e.fadeIn = Math.max(0, Math.min(10, n || 0)); break
      case "fadeOut": e.fadeOut = Math.max(0, Math.min(10, n || 0)); break
      case "fadeAudio": e.fadeAudio = el.checked; break
      case "logoEnabled": e.logo.enabled = el.checked; break
      case "logoText": e.logo.text = el.value.slice(0, 40); if (e.logo.text && e.logo.kind === "text") e.logo.enabled = true; break
      case "logoCorner": e.logo.corner = MV_LOGO_CORNERS[el.value] ? el.value : "br"; break
      case "logoSize": e.logo.size = MV_LOGO_SIZES[el.value] ? el.value : "m"; break
      case "logoOpacity": e.logo.opacity = Math.max(0.1, Math.min(1, (n || 80) / 100)); break
      default: return
    }
    if (key.startsWith("logo")) this.saveMvPrefs()
    this.updateMvEditControls()
  }

  selectMvLogoKind(event) {
    const kind = event.currentTarget.dataset.logoKind === "image" ? "image" : "text"
    this.mvEdit.logo.kind = kind
    if (kind === "image" && !this.mvLogoImage) this.setStatus("🏷 下の「🖼 ロゴの画像を選ぶ」で画像を入れてね（透明な PNG がおすすめ）")
    this.saveMvPrefs()
    this.updateMvEditControls()
  }

  async loadMvLogo(event) {
    const file = event.target.files[0]
    event.target.value = ""
    if (!file) return
    try {
      if (this.mvLogoUrl) URL.revokeObjectURL(this.mvLogoUrl)
      this.mvLogoUrl = URL.createObjectURL(file)
      this.mvLogoImage = await this.loadImage(this.mvLogoUrl)
      this.mvLogoFile = file
      Object.assign(this.mvEdit.logo, { kind: "image", enabled: true, hasImage: true })
      this.updateMvEditControls()
      this.setStatus("🏷 ロゴの画像を入れました（プロジェクトと一緒にアカウントに保存されます）")
    } catch (e) {
      this.setStatus("この画像は使えませんでした")
    }
  }

  // ----- 画面 -----

  // 背景の候補のボタンを、スライドを足す用にもう1組作る（「🖼 背景」の一覧と同じ並び）
  buildMvSlidePicker(box) {
    if (!this.hasMvBgListTarget) return
    const src = [...this.mvBgListTarget.querySelectorAll("[data-bg-key]")]
    if (box.dataset.count === String(src.length)) return
    box.replaceChildren(...src.map((b) => {
      const c = b.cloneNode(true)
      c.dataset.action = "singing-mixer#addMvSlideFrom"
      c.removeAttribute("aria-pressed")
      c.title = `${b.title}（切りかえる背景に足す）`
      return c
    }))
    box.dataset.count = String(src.length)
  }

  mvAnchorOptions(selected) {
    const opts = [["time", "⏱ 時間で決める"]]
    ;(this.sections || []).forEach((s) => opts.push([`section:${s.id}`, `🧩 ${this.sectionLabel(s)}`]))
    ;(this.pins || []).forEach((p) => opts.push([`pin:${p.id}`, `📍 ${p.name || "ピン"} ${this.formatSec(p.sec)}`]))
    return opts.map(([v, label]) => {
      const o = document.createElement("option")
      o.value = v
      o.textContent = label
      if (v === selected) o.selected = true
      return o
    })
  }

  // 部分・📍ピンが変わったとき：切りかえる所・部分ごとの色の一覧だけ作り直す（テロップの入力中に邪魔しない）
  refreshMvEditAnchors() {
    if (!this.mv) return
    const sig = (this.sections || []).map((s) => `${s.id},${s.name},${s.startSec.toFixed(1)},${s.endSec.toFixed(1)}`).join("|") +
      "#" + (this.pins || []).map((p) => `${p.id},${p.name},${Number(p.sec).toFixed(1)}`).join("|")
    if (sig === this.mvAnchorSig) return
    this.mvAnchorSig = sig
    // なくなった部分のフィルターは消す
    const ids = new Set((this.sections || []).map((s) => s.id))
    const parts = this.mvEdit.filterParts || {}
    Object.keys(parts).forEach((id) => { if (!ids.has(id)) delete parts[id] })
    this.renderMvEdit({ telops: false })
  }

  renderMvEdit({ telops = true } = {}) {
    if (!this.mv) return
    const e = this.mvEdit
    const mk = (tag, cls, text) => {
      const el = document.createElement(tag)
      if (cls) el.className = cls
      if (text !== undefined) el.textContent = text
      return el
    }
    const btn = (text, action, data = {}, cls = "sg-btn sg-btn--small") => {
      const b = mk("button", cls, text)
      b.type = "button"
      b.dataset.action = `singing-mixer#${action}`
      Object.entries(data).forEach(([k, v]) => { b.dataset[k] = v })
      return b
    }
    if (this.hasMvSlideListTarget) {
      const box = this.mvSlideListTarget
      const picker = box.parentElement && box.parentElement.querySelector(".sg-slide-picker")
      if (picker) this.buildMvSlidePicker(picker)
      box.replaceChildren(...e.slides.map((s, i) => {
        const row = mk("div", "sg-slide")
        const th = mk("span", "sg-slide__thumb")
        if (s.gradientId) {
          const gr = MV_GRADIENTS.find((x) => x.id === s.gradientId) || MV_GRADIENTS[0]
          th.style.background = `linear-gradient(135deg, ${gr.stops[0]}, ${gr.stops[1]})`
        } else if (s.thumb) {
          const im = document.createElement("img")
          im.src = s.thumb
          im.alt = ""
          th.appendChild(im)
        }
        row.appendChild(th)
        row.appendChild(mk("span", "sg-slide__label", `${i + 1}. ${s.label || "背景"}${this.mvSlideImages.get(s.id) || s.gradientId ? "" : "（読み込めていません）"}`))
        const where = mk("span", "sg-slide__where")
        const sel = document.createElement("select")
        sel.className = "sg-select sg-select--small"
        sel.dataset.slideId = s.id
        sel.dataset.action = "change->singing-mixer#changeMvSlideAnchor"
        sel.setAttribute("aria-label", "切りかえる所")
        const cur = s.anchor && s.anchor.type !== "time" ? `${s.anchor.type}:${s.anchor.id}` : "time"
        sel.append(...this.mvAnchorOptions(cur))
        where.appendChild(sel)
        if (!s.anchor || s.anchor.type === "time") {
          const inp = document.createElement("input")
          inp.type = "text"
          inp.inputMode = "decimal"
          inp.className = "sg-num-input sg-slide__time"
          inp.value = this.formatSec(this.mvAnchorSec(s.anchor) || 0)
          inp.dataset.slideId = s.id
          inp.dataset.action = "change->singing-mixer#changeMvSlideTime"
          inp.setAttribute("aria-label", "切りかえる時間（分:秒）")
          where.appendChild(inp)
          where.appendChild(btn("⏱ 今の位置", "mvSlideNow", { slideId: s.id }))
        } else if (this.mvAnchorSec(s.anchor) === null) {
          where.appendChild(mk("span", "sg-help", "（その部分・ピンが見つかりません）"))
        }
        row.appendChild(where)
        const ops = mk("span", "sg-slide__ops")
        ops.append(
          btn("▲", "moveMvSlide", { slideId: s.id, dir: "-1" }, "sg-btn sg-btn--small is-icon"),
          btn("▼", "moveMvSlide", { slideId: s.id, dir: "1" }, "sg-btn sg-btn--small is-icon"),
          btn("🗑", "deleteMvSlide", { slideId: s.id }, "sg-btn sg-btn--small sg-btn--ghost is-icon")
        )
        row.appendChild(ops)
        return row
      }))
      if (!e.slides.length) box.appendChild(mk("p", "sg-help", "まだありません。上の小さい背景を押すと、切りかえる背景として足せます"))
    }
    if (telops && this.hasMvTelopListTarget) {
      const box = this.mvTelopListTarget
      box.replaceChildren(...e.telops.map((tp) => {
        const row = mk("div", "sg-telop")
        const text = document.createElement("input")
        text.type = "text"
        text.maxLength = 80
        text.className = "sg-telop__text"
        text.placeholder = "例：Thank you for listening!"
        text.value = tp.text
        text.dataset.telopId = tp.id
        text.dataset.field = "text"
        text.dataset.action = "input->singing-mixer#changeMvTelop"
        text.setAttribute("aria-label", "テロップの文字")
        const time = (field, value, label) => {
          const inp = document.createElement("input")
          inp.type = "text"
          inp.inputMode = "decimal"
          inp.className = "sg-num-input sg-telop__time"
          inp.value = this.formatSec(value)
          inp.dataset.telopId = tp.id
          inp.dataset.field = field
          inp.dataset.action = "change->singing-mixer#changeMvTelop"
          inp.setAttribute("aria-label", label)
          return inp
        }
        const select = (field, map, value, label) => {
          const s = document.createElement("select")
          s.className = "sg-select sg-select--small"
          s.dataset.telopId = tp.id
          s.dataset.field = field
          s.dataset.action = "change->singing-mixer#changeMvTelop"
          s.setAttribute("aria-label", label)
          Object.entries(map).forEach(([k, v]) => {
            const o = document.createElement("option")
            o.value = k
            o.textContent = typeof v === "string" ? v : v.label
            if (k === value) o.selected = true
            s.appendChild(o)
          })
          return s
        }
        const color = document.createElement("input")
        color.type = "color"
        color.value = tp.color || "#ffffff"
        color.className = "sg-telop__color"
        color.dataset.telopId = tp.id
        color.dataset.field = "color"
        color.dataset.action = "input->singing-mixer#changeMvTelop"
        color.setAttribute("aria-label", "文字の色")
        const line2 = mk("div", "sg-telop__opts")
        line2.append(
          time("start", tp.startSec, "出す時間（分:秒）"), mk("span", "sg-help", "〜"), time("end", tp.endSec, "消す時間（分:秒）"),
          select("pos", MV_TELOP_POSITIONS, tp.pos, "置き場所"), select("size", MV_TELOP_SIZES, tp.size, "大きさ"), color,
          btn("⏱ 今の位置", "mvTelopNow", { telopId: tp.id }),
          btn("🟨 選んだ範囲", "mvTelopFromSel", { telopId: tp.id }),
          btn("▶", "playMvTelop", { telopId: tp.id }, "sg-btn sg-btn--small is-icon"),
          btn("🗑", "deleteMvTelop", { telopId: tp.id }, "sg-btn sg-btn--small sg-btn--ghost is-icon")
        )
        row.append(text, line2)
        return row
      }))
      if (!e.telops.length) box.appendChild(mk("p", "sg-help", "まだありません。「＋ テロップを足す」で、今の位置から4秒の文字を足せます"))
    }
    if (this.hasMvFilterPartsTarget) {
      const box = this.mvFilterPartsTarget
      const parts = e.filterParts || {}
      box.replaceChildren(...(this.sections || []).map((s) => {
        const row = mk("label", "sg-filter-part")
        row.appendChild(mk("span", "", this.sectionLabel(s)))
        const sel = document.createElement("select")
        sel.className = "sg-select sg-select--small"
        sel.dataset.sectionId = s.id
        sel.dataset.action = "change->singing-mixer#changeMvFilterPart"
        const same = document.createElement("option")
        same.value = "same"
        same.textContent = "曲全体と同じ"
        sel.appendChild(same)
        Object.entries(MV_FILTERS).forEach(([k, f]) => {
          const o = document.createElement("option")
          o.value = k
          o.textContent = k === "none" ? "フィルターなし" : f.label
          if (parts[s.id] === k) o.selected = true
          sel.appendChild(o)
        })
        row.appendChild(sel)
        return row
      }))
      if (!(this.sections || []).length) box.appendChild(mk("p", "sg-help", "④ミックスで部分（Aメロ・サビなど）を作ると、部分ごとに色を変えられます"))
    }
    this.updateMvEditControls()
  }

  updateMvEditControls() {
    if (!this.mv) return
    const e = this.mvEdit
    this.element.dataset.mvBgMode = e.bgMode
    if (this.hasMvBgModeButtonTarget) this.mvBgModeButtonTargets.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.bgMode === e.bgMode)))
    if (this.hasMvBgIntervalTarget && document.activeElement !== this.mvBgIntervalTarget) this.mvBgIntervalTarget.value = String(e.bgInterval)
    if (this.hasMvBgIntervalValueTarget) this.mvBgIntervalValueTarget.textContent = `${e.bgInterval}秒ごと`
    if (this.hasMvFilterButtonTarget) this.mvFilterButtonTargets.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filter === e.filter)))
    if (this.hasMvFilterAmountTarget && document.activeElement !== this.mvFilterAmountTarget) this.mvFilterAmountTarget.value = String(e.filterAmount)
    if (this.hasMvFilterAmountValueTarget) this.mvFilterAmountValueTarget.textContent = String(e.filterAmount)
    if (this.hasMvFilterHintTarget) {
      const n = Object.keys(e.filterParts || {}).length
      this.mvFilterHintTarget.textContent = `${MV_FILTERS[e.filter].hint}${n ? `・部分ごとの色 ${n}か所` : ""}`
    }
    const r = e.range
    const clip = this.mvClipRange
    if (this.hasMvRangeToggleTarget) this.mvRangeToggleTarget.checked = !!(r && r.enabled !== false)
    if (this.hasMvRangeStartTarget && document.activeElement !== this.mvRangeStartTarget) this.mvRangeStartTarget.value = r ? this.formatSec(r.startSec) : ""
    if (this.hasMvRangeEndTarget && document.activeElement !== this.mvRangeEndTarget) this.mvRangeEndTarget.value = r ? this.formatSec(r.endSec) : ""
    if (this.hasMvRangeInfoTarget) {
      this.mvRangeInfoTarget.textContent = clip
        ? `✂️ ${this.formatSec(clip.startSec)}〜${this.formatSec(clip.endSec)}（${(clip.endSec - clip.startSec).toFixed(1)}秒）だけ書き出します`
        : r && r.enabled !== false ? "⚠ 範囲が短すぎるか、曲の外です（1秒以上にしてね）" : "曲の最初から最後まで書き出します"
    }
    if (this.hasMvRangePlayButtonTarget) this.mvRangePlayButtonTarget.disabled = !(clip && this.mode === "idle")
    if (this.hasMvFadeInTarget && document.activeElement !== this.mvFadeInTarget) this.mvFadeInTarget.value = String(e.fadeIn)
    if (this.hasMvFadeOutTarget && document.activeElement !== this.mvFadeOutTarget) this.mvFadeOutTarget.value = String(e.fadeOut)
    if (this.hasMvFadeInValueTarget) this.mvFadeInValueTarget.textContent = e.fadeIn ? `${e.fadeIn}秒` : "なし"
    if (this.hasMvFadeOutValueTarget) this.mvFadeOutValueTarget.textContent = e.fadeOut ? `${e.fadeOut}秒` : "なし"
    if (this.hasMvFadeAudioTarget) this.mvFadeAudioTarget.checked = e.fadeAudio
    const lg = e.logo
    if (this.hasMvLogoToggleTarget) this.mvLogoToggleTarget.checked = lg.enabled
    if (this.hasMvLogoKindButtonTarget) this.mvLogoKindButtonTargets.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.logoKind === lg.kind)))
    if (this.hasMvLogoTextTarget && document.activeElement !== this.mvLogoTextTarget) this.mvLogoTextTarget.value = lg.text
    if (this.hasMvLogoCornerTarget) this.mvLogoCornerTarget.value = lg.corner
    if (this.hasMvLogoSizeTarget) this.mvLogoSizeTarget.value = lg.size
    if (this.hasMvLogoOpacityTarget && document.activeElement !== this.mvLogoOpacityTarget) this.mvLogoOpacityTarget.value = String(Math.round(lg.opacity * 100))
    if (this.hasMvLogoOpacityValueTarget) this.mvLogoOpacityValueTarget.textContent = `${Math.round(lg.opacity * 100)}%`
    this.element.dataset.mvLogoKind = lg.kind
    if (this.hasMvLogoInfoTarget) {
      this.mvLogoInfoTarget.textContent = !lg.enabled ? "ロゴは出しません"
        : lg.kind === "image" ? (this.mvLogoImage ? "🖼 画像のロゴを出します" : "⚠ ロゴの画像がまだありません")
          : lg.text ? `「${lg.text}」を出します` : "⚠ ロゴの文字がまだありません"
    }
  }

  // ---------- 🎤 歌詞テロップ（手順4b） ----------
  // this.lyrics = [{ text, startSec }]（曲の時間。startSec が null の行は、まだ時間が決まっていない）
  // 終わりの時間は「次の行が始まるまで」。間奏などで次の行まで長いときは、6秒で消す

  // 歌詞の欄が変わったとき。同じ行の時間は残す。LRC（[01:23.45]歌詞）なら時間も読む
  changeLyricsText() {
    this.lyrics = this.parseLyrics(this.lyricsTextTarget.value, this.lyrics || [])
    this.renderLyricList()
  }

  parseLyrics(text, old) {
    const lrc = /^\[(\d{1,2}):(\d{1,2}(?:[.:]\d{1,3})?)\]\s*(.*)$/
    const lines = []
    text.split(/\r?\n/).forEach((raw) => {
      const line = raw.trim()
      if (!line) return
      if (/^\[[a-z]+:.*\]$/i.test(line)) return // [ti:曲名] のような情報の行は飛ばす
      const m = line.match(lrc)
      if (m) {
        const text = m[3].trim()
        const sec = Number(m[1]) * 60 + Number(m[2].replace(":", "."))
        if (text) lines.push({ text, startSec: sec, locked: true })
        // 文字のない時間の行＝1つ前の行がここで消える（K27：LRC で終わりの時間を表す書き方）
        else if (lines.length && lines[lines.length - 1].startSec !== null && sec > lines[lines.length - 1].startSec) lines[lines.length - 1].endSec = sec
      } else {
        lines.push({ text: line, startSec: null })
      }
    })
    // 時間が書いていない行は、前と同じ文の行の時間を引きつぐ
    return lines.map((l, i) => {
      if (l.startSec !== null) return l
      const same = old[i] && old[i].text === l.text ? old[i] : null
      return same ? { ...same } : { text: l.text, startSec: null }
    })
  }

  // MV に渡す行（時間が決まっている行だけ・時間順・終わりの時間つき）。
  // 終わりの決め方（K27・K35 案2）：
  //   ① 行に終わりの時間があればそれ（手で決めた・自動で合わせた・LRC の空行）
  //   ② なければ、録った声が止まった所（間奏・長い息つぎ）で消す
  //   ③ 声がないときは、次の行の少し前まで（10秒より空くときは6秒で消す）
  get timedLyrics() {
    const list = (this.lyrics || []).filter((l) => l.startSec !== null).sort((a, b) => a.startSec - b.startSec)
    const voice = this.voiceSegmentsSong()
    return list.map((l, i) => {
      const next = list[i + 1]
      const gap = next ? next.startSec - l.startSec : Infinity
      let end = gap > 10 ? l.startSec + 6 : next.startSec - 0.05
      if (l.endSec) {
        end = Math.min(l.endSec, next ? next.startSec - 0.05 : l.endSec)
      } else if (voice) {
        const v = this.voiceEndAfter(voice, l.startSec, next ? next.startSec : Infinity)
        if (v !== null) end = Math.min(end, v + 0.4)
      }
      return { text: l.text, startSec: l.startSec, endSec: Math.min(end, Math.max(this.duration, l.startSec + 1)) }
    })
  }

  // 録った声が出ている所（曲の時間）。声やずれ補正が変わったら作り直す
  voiceSegmentsSong() {
    const buf = this.vocalForMatch || this.vocalBuffer
    if (!buf) return null
    const c = this.voiceSegCache
    if (c && c.buffer === buf && c.offsetMs === this.vocalOffsetMs) return c.segs
    let segs = []
    try {
      const off = this.vocalOffsetMs / 1000
      segs = findVoiceSegments(toMono(buf), buf.sampleRate, { minGap: 0.35, minLen: 0.15 }).segments
        .map((s) => ({ start: s.start + off, end: s.end + off }))
    } catch (e) {
      console.error(e)
    }
    this.voiceSegCache = { buffer: buf, offsetMs: this.vocalOffsetMs, segs }
    return segs
  }

  // startSec から歌い始めた行が、声が1秒以上止まったところで終わるとみなす（その手前の声の終わり）
  voiceEndAfter(segs, startSec, limit) {
    let end = null
    for (const s of segs) {
      if (s.end <= startSec) continue
      if (s.start >= limit) break
      if (end !== null && s.start - end > 1.0) break // 間奏・長い息つぎ
      end = s.end
    }
    return end
  }

  // 👆 タップで合わせる：曲を流しながら、歌い始めでタップ（スペースキーでもOK）
  async startTapSync(event) {
    if (!this.lyrics?.length) {
      this.setStatus("先に歌詞を貼り付けてね（1行が1つのテロップになります）")
      return
    }
    if (this.mode !== "idle" || (!this.backingBuffer && !this.vocalBuffer)) return
    const from = Number(event?.currentTarget?.dataset?.lyricIndex ?? 0)
    const startLine = this.lyrics[from]
    // 途中から合わせ直すときは、1つ前の行の少し前から流す
    const prev = this.lyrics.slice(0, from).reverse().find((l) => l.startSec !== null)
    const fromSec = from > 0 && prev ? Math.max(0, prev.startSec - 1) : 0
    this.ensureContext()
    await this.ctx.resume()
    this.tapIndex = from
    this.setMode("playing")
    this.startSources(() => this.endTapSync("曲が終わりました"), { fromSec })
    this.tapPanelTarget.hidden = false
    this.updateTapPanel()
    this.tapButtonTarget.focus()
    this.setStatus(`👆 「${startLine.text}」の歌い始めでタップ！（スペースキーでもOK）`)
  }

  tap(event) {
    if (this.tapIndex === null || this.tapIndex === undefined) return
    event?.preventDefault?.()
    const now = this.songNow
    if (now === null) return
    // 人がタップするのは少し遅れるので、0.2秒前から出す
    Object.assign(this.lyrics[this.tapIndex], { startSec: Math.max(0, now - TAP_LEAD), endSec: null, unsure: false, locked: true })
    this.tapIndex++
    this.renderLyricList()
    if (this.tapIndex >= this.lyrics.length) {
      this.stopSources()
      this.endTapSync("全部の行を合わせました！")
      return
    }
    this.updateTapPanel()
  }

  // ⏹ ここで消す（K27）：いま出ている行（1つ前にタップした行）を、ここで消す。間奏の頭で押す
  tapEnd(event) {
    if (this.tapIndex === null || this.tapIndex === undefined) return
    event?.preventDefault?.()
    const now = this.songNow
    const l = this.lyrics[this.tapIndex - 1]
    if (now === null || !l || l.startSec === null || now <= l.startSec + 0.2) return
    l.endSec = now
    l.locked = true
    this.renderLyricList()
    this.setStatus(`⏹「${l.text}」を ${this.formatSec(now)} で消すようにしました。次の行の歌い始めでタップしてね`)
  }

  // 1つ前の行に戻って、タップし直す
  tapBack() {
    if (this.tapIndex === null || this.tapIndex === undefined || this.tapIndex === 0) return
    this.tapIndex--
    this.updateTapPanel()
  }

  // スペース・エンターでタップ、E か「.」で⏹ここで消す（合わせている間だけ）
  tapKey(event) {
    // 歌詞のタップ合わせ中でなければ、P キーで📍ピン（K32）。タップ合わせ中はピンを立てない
    if (this.tapIndex === null || this.tapIndex === undefined) { this.pinKey(event); return }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || "")) return
    if (event.key === " " || event.key === "Enter") this.tap(event)
    else if (event.key === "e" || event.key === "E" || event.key === ".") this.tapEnd(event)
    else if (event.key === "Backspace") { event.preventDefault(); this.tapBack() }
  }

  endTapSync(message) {
    if (this.tapIndex === null || this.tapIndex === undefined) return
    this.tapIndex = null
    this.tapPanelTarget.hidden = true
    this.setMode("idle")
    this.renderLyricList()
    this.setStatus(`👆 ${message} 行ごとの ±0.1秒 で細かく直せます。▶試聴で確かめてね`)
  }

  stopTapSync() {
    this.stopSources()
    this.endTapSync("合わせるのをやめました")
  }

  updateTapPanel() {
    const cur = this.lyrics[this.tapIndex]
    const next = this.lyrics[this.tapIndex + 1]
    this.tapCurrentTarget.textContent = cur ? cur.text : ""
    this.tapNextTarget.textContent = next ? `次：${next.text}` : "これが最後の行"
    this.tapCountTarget.textContent = `${this.tapIndex + 1} / ${this.lyrics.length}`
  }

  // 行ごとに少しずらす・消す・その行から試聴
  nudgeLyric(event) {
    const i = Number(event.currentTarget.dataset.lyricIndex)
    const d = Number(event.currentTarget.dataset.nudge)
    const l = this.lyrics[i]
    if (!l || l.startSec === null) return
    l.startSec = Math.max(0, Math.round((l.startSec + d) * 100) / 100)
    if (l.endSec) l.endSec = Math.max(l.startSec + 0.3, l.endSec + d)
    l.unsure = false // 手で直した → 確認ずみ
    l.locked = true  // 🔒 自動で合わせ直しても動かさない（K35 案1）
    this.renderLyricList()
  }

  // 終わりの時間を ±0.1秒（K27）。まだ終わりがない行は、今の表示の終わりから動かす
  nudgeLyricEnd(event) {
    const i = Number(event.currentTarget.dataset.lyricIndex)
    const d = Number(event.currentTarget.dataset.nudge)
    const l = this.lyrics[i]
    if (!l || l.startSec === null) return
    const cur = l.endSec ?? this.shownLyricEnd(l)
    if (cur === null) return
    l.endSec = Math.max(l.startSec + 0.3, Math.round((cur + d) * 100) / 100)
    l.unsure = false
    l.locked = true
    this.renderLyricList()
  }

  // 終わりを「自動」に戻す（声が止まった所・次の行の前で消える）
  clearLyricEnd(event) {
    const l = this.lyrics[Number(event.currentTarget.dataset.lyricIndex)]
    if (!l) return
    l.endSec = null
    this.renderLyricList()
  }

  // 今の画面での終わりの時間（timedLyrics と同じ決め方）
  shownLyricEnd(l) {
    const t = this.timedLyrics.find((x) => x.startSec === l.startSec && x.text === l.text)
    return t ? t.endSec : null
  }

  // 🔒 固定する／外す（固定した行は 🪄 で合わせ直しても動かない・目印になる）
  toggleLyricLock(event) {
    const l = this.lyrics[Number(event.currentTarget.dataset.lyricIndex)]
    if (!l || l.startSec === null) return
    l.locked = !l.locked
    if (l.locked) l.unsure = false
    this.renderLyricList()
  }

  unlockAllLyrics() {
    ;(this.lyrics || []).forEach((l) => { l.locked = false })
    this.renderLyricList()
    this.setStatus("🔓 全部の行の固定を外しました。🪄 で全部合わせ直せます")
  }

  clearLyricTime(event) {
    const l = this.lyrics[Number(event.currentTarget.dataset.lyricIndex)]
    if (!l) return
    l.startSec = null
    l.endSec = null
    l.locked = false
    l.unsure = false
    this.renderLyricList()
  }

  // 全部の行をまとめてずらす（ぜんぶ少し遅い・早いとき）
  shiftAllLyrics(event) {
    const d = Number(event.currentTarget.dataset.nudge)
    ;(this.lyrics || []).forEach((l) => {
      if (l.startSec === null) return
      l.startSec = Math.max(0, Math.round((l.startSec + d) * 100) / 100)
      if (l.endSec) l.endSec += d
    })
    this.renderLyricList()
    this.setStatus(`テロップを全部 ${d > 0 ? "+" : ""}${d}秒 ずらしました`)
  }

  async playLyric(event) {
    const l = this.lyrics[Number(event.currentTarget.dataset.lyricIndex)]
    if (!l || l.startSec === null || this.mode !== "idle") return
    this.ensureContext()
    await this.ctx.resume()
    this.setMode("playing")
    this.startSources(() => { this.setMode("idle"); this.setStatus("試聴おわり") }, { fromSec: Math.max(0, l.startSec - 1.5) })
    this.setStatus(`「${l.text}」の少し前から試聴中…`)
  }

  renderLyricList() {
    if (!this.hasLyricListTarget) return
    const list = this.lyricListTarget
    const lyrics = this.lyrics || []
    // 表示の終わりの時間（自動の行の分）を1回だけ計算しておく
    const timedNow = this.timedLyrics
    const endOf = (l) => {
      const t = timedNow.find((x) => x.startSec === l.startSec && x.text === l.text)
      return t ? t.endSec : null
    }
    list.replaceChildren(...lyrics.map((l, i) => {
      const row = document.createElement("div")
      row.className = `sg-lyric${l.unsure ? " is-unsure" : ""}`
      row.dataset.lyricRow = String(i)
      if (l.unsure) row.title = "自動で合わせたけど自信がない行。▶で聴いて確かめてね"
      const time = l.startSec === null ? "--:--.-" : this.formatSec(l.startSec)
      const btn = (label, action, extra = {}, cls = "") => {
        const b = document.createElement("button")
        b.type = "button"
        b.className = `sg-lyric__btn ${cls}`
        b.textContent = label
        b.dataset.action = `singing-mixer#${action}`
        b.dataset.lyricIndex = String(i)
        Object.entries(extra).forEach(([k, v]) => { b.dataset[k] = v })
        return b
      }
      const t = document.createElement("span")
      t.className = `sg-lyric__time${l.startSec === null ? " is-empty" : ""}`
      t.textContent = time
      const text = document.createElement("span")
      text.className = "sg-lyric__text"
      text.textContent = `${l.locked ? "🔒 " : ""}${l.unsure ? "⚠ " : ""}${l.text}`
      // 終わりの時間（K27）：決めていれば数字、決めていなければ「自動」（声が止まった所・次の行の前）
      const shown = l.startSec === null ? null : (l.endSec ?? endOf(l))
      const e = document.createElement("span")
      e.className = `sg-lyric__time sg-lyric__end${l.endSec ? "" : " is-auto"}`
      e.textContent = shown === null ? "〜--:--.-" : `〜${this.formatSec(shown)}${l.endSec ? "" : "（自動）"}`
      e.title = l.endSec ? "この行が消える時間（手で決めた）" : "この行が消える時間（自動：声が止まった所か、次の行の少し前）"
      const lock = btn(l.locked ? "🔒" : "🔓", "toggleLyricLock", {}, "is-icon")
      lock.title = l.locked ? "固定中：🪄で合わせ直しても動きません（押すと外す）" : "押すと固定（🪄で合わせ直しても動かない目印になる）"
      const endRow = document.createElement("div")
      endRow.className = "sg-lyric__endrow"
      const endLabel = document.createElement("span")
      endLabel.className = "sg-help"
      endLabel.textContent = "消える時間"
      endRow.append(endLabel, btn("−0.1", "nudgeLyricEnd", { nudge: "-0.1" }, "is-end"), e, btn("+0.1", "nudgeLyricEnd", { nudge: "0.1" }, "is-end"), btn("自動", "clearLyricEnd", {}, "is-end"), lock)
      row.append(
        btn("−0.1", "nudgeLyric", { nudge: "-0.1" }), t, btn("+0.1", "nudgeLyric", { nudge: "0.1" }),
        text,
        btn("▶", "playLyric", {}, "is-icon"), btn("👆ここから", "startTapSync", {}, "is-tap"), btn("✖", "clearLyricTime", {}, "is-icon"),
        endRow
      )
      row.querySelectorAll("button").forEach((b) => {
        if (b.dataset.action !== "singing-mixer#startTapSync") b.disabled = l.startSec === null
      })
      row.querySelector('[data-action="singing-mixer#clearLyricEnd"]').disabled = !l.endSec
      if (i === this.lyricSel) row.classList.add("is-selected")
      return row
    }))
    const timed = lyrics.filter((l) => l.startSec !== null).length
    const locked = lyrics.filter((l) => l.locked && l.startSec !== null).length
    if (this.hasLyricInfoTarget) {
      this.lyricInfoTarget.textContent = lyrics.length
        ? `${lyrics.length}行（時間が決まっている行 ${timed}・🔒固定 ${locked}）`
        : "歌詞を貼り付けると、ここに行ごとに並びます"
    }
    if (this.hasLrcButtonTarget) this.lrcButtonTarget.disabled = timed === 0
    if (this.hasUndoAlignButtonTarget) this.undoAlignButtonTarget.disabled = !this.lyricsBackup
    if (this.hasUnlockLyricsButtonTarget) this.unlockLyricsButtonTarget.disabled = locked === 0
    if (this.hasAutoAlignButtonTarget) {
      this.autoAlignButtonTarget.textContent = locked > 0 ? "🪄 固定した行を目印に、残りを合わせ直す" : "🪄 歌声から自動で合わせる"
    }
    this.lastLyricRow = -2
    this.lyricLastDraw = null
  }

  // 再生中の行を、一覧で光らせる（変わったときだけ）
  highlightLyricRow(t) {
    if (!this.hasLyricListTarget || !this.lyrics?.length) return
    const timed = this.timedLyrics
    const k = lyricIndexAt(timed, t)
    const idx = k >= 0 ? this.lyrics.findIndex((l) => l.startSec === timed[k].startSec && l.text === timed[k].text) : -1
    if (idx === this.lastLyricRow) return
    this.lastLyricRow = idx
    this.lyricListTarget.querySelectorAll("[data-lyric-row]").forEach((el) => el.classList.toggle("is-now", Number(el.dataset.lyricRow) === idx))
  }

  // 🪄 歌声と歌詞の長さから、自動で時間を合わせる（方式A）
  async autoAlignLyrics() {
    if (!this.lyrics?.length) {
      this.setStatus("先に歌詞を貼り付けてね")
      return
    }
    if (!this.vocalBuffer || this.mode !== "idle") {
      if (!this.vocalBuffer) this.setStatus("自動で合わせるには、先に歌声を録音（またはファイルで入れて）ね")
      return
    }
    this.setMode("processing")
    this.setStatus("🪄 歌声を聴いて、歌詞を合わせています…")
    await new Promise((resolve) => setTimeout(resolve, 30))
    try {
      const offset = this.vocalOffsetMs / 1000 // 声の時間 → 曲の時間
      // 🔒 固定した行は目印（声の時間に直して渡す・K35 案1）
      const anchors = this.lyrics.map((l) => (l.locked && l.startSec !== null)
        ? { startSec: l.startSec - offset + AUTO_LEAD, endSec: l.endSec ? l.endSec - offset - 0.4 : null }
        : null)
      const nLocked = anchors.filter(Boolean).length
      const texts = this.lyrics.map((l) => l.text)
      const data = toMono(this.vocalBuffer)
      const r = nLocked
        ? alignLyricsAnchored(texts, data, this.vocalBuffer.sampleRate, anchors)
        : alignLyrics(texts, data, this.vocalBuffer.sampleRate)
      if (!r.lines) {
        this.setStatus(`🪄 自動で合わせられませんでした（${r.reason}）。👆タップで合わせてね`)
      } else {
        this.lyricsBackup = this.lyrics.map((l) => ({ ...l }))
        let changed = 0
        r.lines.forEach((a, i) => {
          if (!a || a.locked || this.lyrics[i].locked) return // 固定した行・合わせられなかった行はそのまま
          Object.assign(this.lyrics[i], {
            startSec: Math.max(0, a.startSec + offset - AUTO_LEAD),
            endSec: a.endSec + offset + 0.4,
            unsure: !a.sure
          })
          changed++
        })
        const unsure = this.lyrics.filter((l) => l.unsure).length
        const failed = r.failed ? `・合わせられなかった ${r.failed}行はそのまま` : ""
        const how = nLocked ? `🔒固定した${nLocked}行を目印に、残りの${changed}行を合わせ直しました` : `${changed}行を自動で合わせました`
        this.setStatus(`🪄 ${how}${failed}${unsure ? `（⚠の${unsure}行は自信なし。▶で聴いて、直したら🔒になります → もう一度🪄で残りがそろいます）` : ""}`)
      }
    } catch (e) {
      console.error(e)
      this.setStatus("🪄 自動で合わせるのに失敗しました。👆タップで合わせてね")
    }
    this.setMode("idle")
    this.renderLyricList()
  }

  undoAutoAlign() {
    if (!this.lyricsBackup) return
    this.lyrics = this.lyricsBackup
    this.lyricsBackup = null
    this.renderLyricList()
    this.setStatus("自動で合わせる前に戻しました")
  }

  // 📄 LRC（時間つき歌詞）で保存。ほかのアプリでも使える形式
  exportLrc() {
    const timed = this.timedLyrics
    if (!timed.length) return
    const two = (n) => String(n).padStart(2, "0")
    const stamp = (sec) => {
      const m = Math.floor(sec / 60)
      const s = sec - m * 60
      return `[${two(m)}:${two(Math.floor(s))}.${two(Math.floor((s % 1) * 100))}]`
    }
    const head = [this.mv.title && `[ti:${this.mv.title}]`, this.mv.artist && `[ar:${this.mv.artist}]`].filter(Boolean)
    // 終わりの時間（K27）：次の行まで0.5秒以上空くときは、文字のない時間の行で「ここで消える」を書く
    const body = []
    timed.forEach((l, i) => {
      body.push(`${stamp(l.startSec)}${l.text}`)
      const next = timed[i + 1]
      if (!next || next.startSec - l.endSec > 0.5) body.push(stamp(l.endSec))
    })
    const blob = new Blob([[...head, ...body].join("\n") + "\n"], { type: "text/plain" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `${this.mv.title || "lyrics"}.lrc`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    this.setStatus("📄 時間つきの歌詞（LRC）を保存しました。次からはそのファイルを読み込めば、合わせ直さなくてOK")
  }

  async importLrc(event) {
    const file = event.target.files[0]
    event.target.value = ""
    if (!file) return
    const text = await file.text()
    this.lyricsTextTarget.value = text
    this.lyrics = this.parseLyrics(text, [])
    this.renderLyricList()
    const timed = this.lyrics.filter((l) => l.startSec !== null).length
    this.setStatus(`📄 歌詞を読み込みました（${this.lyrics.length}行・時間つき ${timed}行）`)
  }

  toggleKaraoke() {
    this.mv.karaoke = this.karaokeTarget.checked
  }

  // ---------- 🎶 ハモリ（K29）・🐸 ケロケロ風 ----------
  // 自動：録った声の音程（YIN）→ オケから推定したキーに沿って「3度上」などにずらした声を作り、声と同じミックスに重ねる。
  // 手動：2本目の声として録る（オケ＋1本目の声を流しながら）。🎯ハモる音程と🎤いまの声の音程を図で見せる。
  // ずらした声は、オケのキー変更と同じ方式（WSOLA）で音符ごとに作る。キーの推定はまちがえることがあるので手で選べる

  initHarmony() {
    this.harmony = {
      keyChoice: "auto", // "auto" か "0:major" のような手で選んだキー
      keyGuess: null,
      keyFor: null,
      pitch: null,       // 1本目の声の音程（声が変わったら null）
      pitchFor: null,
      // 🎶 自動ハモリのトラック（K37・11/10）：何本でも重ねられる。範囲は「曲全体」「部分」「時間で指定」
      // { id, name, interval, range: { type: "all" } | { type: "section", sectionId } | { type: "time", startSec, endSec }, gain, pan, enabled }
      tracks: [],
      selectedId: null,  // 選んでいるトラック（🎯ガイド・🎹ガイドメロディはこのトラックの音程）
      voices: new Map(), // ずらした声のキャッシュ：「ハモり方|キー」→ { buffer, builtFor }（同じハモり方のトラックは共有）
      trackSeq: 1,
      guideInterval: "up3", // トラックが1本もないときのガイドの音程
      manual: { enabled: true, gain: 0.8, pan: 0.3, offsetMs: 0, raw: null, base: null, noiseRange: null, buffer: null },
      kero: { enabled: false, amount: 70 },
      rec: null          // ハモリを録音している間のガイド
    }
    this.harmonyLastDraw = null
    this.buildHarmonyKeySelect()
    this.renderHarmonyTracks()
    this.updateHarmonyControls()
  }

  buildHarmonyKeySelect() {
    if (!this.hasHarmonyKeySelectTarget) return
    const opts = [["auto", "🪄 キーは自動（推定）"]]
    ;["major", "minor"].forEach((mode) => {
      for (let t = 0; t < 12; t++) opts.push([`${t}:${mode}`, keyName({ tonic: t, mode })])
    })
    this.harmonyKeySelectTarget.replaceChildren(...opts.map(([v, label]) => {
      const o = document.createElement("option")
      o.value = v
      o.textContent = label
      return o
    }))
  }

  // ハモリに使うキー（手で選んだもの → 推定 → 分からなければハ長調）
  harmonyKey() {
    const h = this.harmony
    if (h.keyChoice !== "auto") {
      const [t, m] = h.keyChoice.split(":")
      return { tonic: Number(t), mode: m === "minor" ? "minor" : "major" }
    }
    return this.ensureKeyGuess() || { tonic: 0, mode: "major" }
  }

  ensureKeyGuess() {
    const h = this.harmony
    if (!this.backingBuffer) return h.keyGuess
    if (h.keyGuess && h.keyFor === this.backingBuffer) return h.keyGuess
    try {
      h.keyGuess = estimateKey(this.backingBuffer)
      h.keyFor = this.backingBuffer
    } catch (e) {
      console.error(e)
    }
    return h.keyGuess
  }

  async detectHarmonyKey() {
    if (!this.backingBuffer) { this.setStatus("🔍 キーを調べるには、先に 🎼オケを入れてね"); return }
    if (this.mode !== "idle") return
    this.setStatus("🔍 オケのキーを調べています…")
    await new Promise((resolve) => setTimeout(resolve, 30))
    const k = this.ensureKeyGuess()
    this.updateHarmonyControls()
    if (k) this.setStatus(`🔍 推定キー：${keyName(k)}（自信 ${this.keyConfidenceText(k)}）。外れていそうなら手で選んでね`)
  }

  keyConfidenceText(k) {
    return k.confidence >= 0.6 ? "高" : k.confidence >= 0.3 ? "中" : "低"
  }

  ensureMainPitch() {
    const h = this.harmony
    if (!this.vocalBuffer) return null
    if (h.pitch && h.pitchFor === this.vocalBuffer) return h.pitch
    h.pitch = detectPitch(this.vocalBuffer)
    h.pitchFor = this.vocalBuffer
    return h.pitch
  }

  // ---------- 🎶 自動ハモリのトラック（K37・11/10） ----------
  // ずらした声は「ハモり方｜キー」ごとに1回だけ作り、同じハモり方のトラックで共有する。
  // 鳴らす範囲（部分・時間）は鳴らすときに音量で切る（境目は30msでフェード）→ 範囲を変えても作り直さない

  harmonyVoiceKey(interval) {
    const k = this.harmonyKey()
    return `${interval}|${k.tonic}:${k.mode}`
  }

  // トラックのずらした声（作ってあれば）
  trackVoice(tr) {
    const v = this.harmony.voices.get(this.harmonyVoiceKey(tr.interval))
    return v && v.builtFor === this.vocalBuffer ? v.buffer : null
  }

  // only＝そのトラックだけ。作ってあるハモり方は作り直さない
  async buildAutoHarmony({ quiet = false, only = null } = {}) {
    const h = this.harmony
    // 声が変わった古いものは捨てる
    for (const [k, v] of h.voices) if (v.builtFor !== this.vocalBuffer) h.voices.delete(k)
    if (!this.vocalBuffer) {
      if (!quiet) this.setStatus("🎶 自動でハモるには、先に歌声を録音（またはファイルで入れて）ね")
      this.updateHarmonyControls()
      return
    }
    const want = [...new Set(h.tracks.filter((t) => t.enabled && (!only || t.id === only)).map((t) => t.interval))]
      .filter((iv) => !h.voices.has(this.harmonyVoiceKey(iv)))
    if (!want.length) { this.updateHarmonyControls(); return }
    this.ensureContext()
    const before = this.mode
    if (before === "idle") this.setMode("processing")
    this.setStatus(`🎶 ハモリを作っています…（${want.length}種類。声の音程を調べて、キーに合わせてずらします。長い曲だと1種類で十数秒かかることがあります）`)
    await new Promise((resolve) => setTimeout(resolve, 30))
    const key = this.harmonyKey()
    let made = 0
    try {
      const p = this.ensureMainPitch()
      for (const iv of want) {
        const semis = harmonySemitones(p, key, iv)
        const buffer = harmonyVoice(this.ctx, this.vocalBuffer, semis, p.hop, (chs, sr, s) => changeKeyTempoChannels(chs, sr, { semitones: s }))
        h.voices.set(this.harmonyVoiceKey(iv), { buffer, builtFor: this.vocalBuffer })
        made++
        await new Promise((resolve) => setTimeout(resolve, 0)) // 画面を止めすぎない
      }
      if (!quiet) this.setStatus(`🎶 ハモリ（${want.map((iv) => intervalInfo(iv).label).join("・")}／${keyName(key)}）を作りました。▶試聴で確かめてね。外れて聞こえたらキーを選び直してね`)
    } catch (e) {
      console.error(e)
      this.setStatus(`🎶 ハモリを作れませんでした${made ? `（${made}種類は作れました）` : ""}`)
    }
    if (before === "idle") this.setMode("idle")
    this.updateHarmonyControls()
  }

  // トラックの鳴らす範囲（曲の時間）[start, end]。null＝曲全体。部分が無くなっていたら undefined（鳴らさない）
  trackRange(tr) {
    const r = (tr && tr.range) || { type: "all" }
    if (r.type === "section") {
      const s = (this.sections || []).find((x) => x.id === r.sectionId)
      return s ? [s.startSec, s.endSec] : undefined
    }
    if (r.type === "time" && Number.isFinite(r.startSec) && Number.isFinite(r.endSec) && r.endSec - r.startSec >= 0.1) return [r.startSec, r.endSec]
    return null
  }

  trackRangeLabel(tr) {
    const r = this.trackRange(tr)
    if (r === undefined) return "⚠ 部分が消えたので鳴りません"
    if (!r) return "曲全体"
    const s = tr.range.type === "section" ? `${(this.sections.find((x) => x.id === tr.range.sectionId) || {}).name || "部分"} ` : ""
    return `${s}${this.formatSec(r[0])}〜${this.formatSec(r[1])}`
  }

  // いま鳴らすハモリ（scheduleSources から呼ぶ）。startSec＝曲の時間で、どこから鳴らすか。ranges＝鳴らす範囲（null＝全部）
  harmonyTracks() {
    const h = this.harmony
    if (!h) return []
    const out = []
    h.tracks.forEach((tr) => {
      if (!tr.enabled) return
      const buffer = this.trackVoice(tr)
      if (!buffer) return
      const r = this.trackRange(tr)
      if (r === undefined) return
      out.push({ buffer, startSec: this.vocalOffsetMs / 1000, gain: tr.gain, pan: tr.pan, ranges: r ? [r] : null })
    })
    if (h.manual.enabled && h.manual.buffer) {
      out.push({ buffer: h.manual.buffer, startSec: h.manual.offsetMs / 1000, gain: h.manual.gain, pan: h.manual.pan, ranges: null })
    }
    return out
  }

  selectedTrack() {
    const h = this.harmony
    return (h && h.tracks.find((t) => t.id === h.selectedId)) || null
  }

  // 🎯 ガイド（図・🔔・🎹）に使う音程：選んでいるトラック → なければ guideInterval
  guideInterval() {
    const t = this.selectedTrack()
    return t ? t.interval : this.harmony.guideInterval
  }

  // ガイドを出す範囲（null＝曲全体・undefined＝出さない）
  guideRange() {
    const t = this.selectedTrack()
    return t ? this.trackRange(t) : null
  }

  inGuideRange(songSec) {
    const r = this.guideRange()
    if (r === undefined) return false
    return !r || (songSec >= r[0] && songSec < r[1])
  }

  // ＋ ハモリを足す：範囲は「黄色の選択」→「いま編集中の部分」→「曲全体」の順で決める
  async addHarmonyTrack() {
    const h = this.harmony
    const id = `h${Date.now()}${h.trackSeq}`
    let range = { type: "all" }
    if (this.mixSel) range = { type: "time", startSec: this.mixSel.startSec, endSec: this.mixSel.endSec }
    else if (this.editingSection) range = { type: "section", sectionId: this.editingSection.id }
    const last = h.tracks[h.tracks.length - 1]
    const interval = last ? (last.interval === "up3" ? "down3" : "up3") : (h.guideInterval || "up3")
    const pan = h.tracks.length % 2 === 0 ? -0.3 : 0.3
    const tr = { id, name: `ハモリ${h.trackSeq++}`, interval, range, gain: 0.7, pan, enabled: true }
    h.tracks.push(tr)
    h.selectedId = id
    this.harmonyLastDraw = null
    this.renderHarmonyTracks()
    this.setStatus(`🎶 「${tr.name}」を足しました（${intervalInfo(interval).label}・${this.trackRangeLabel(tr)}）`)
    if (this.mode === "idle" && this.vocalBuffer) await this.buildAutoHarmony({ only: id })
    this.updateHarmonyControls()
  }

  trackFromEvent(event) {
    const row = event.currentTarget.closest("[data-track-id]")
    const id = row ? row.dataset.trackId : null
    return this.harmony.tracks.find((t) => t.id === id) || null
  }

  deleteHarmonyTrack(event) {
    const tr = this.trackFromEvent(event)
    if (!tr || this.mode !== "idle") return
    const h = this.harmony
    h.tracks = h.tracks.filter((t) => t !== tr)
    if (h.selectedId === tr.id) h.selectedId = h.tracks[0] ? h.tracks[0].id : null
    this.harmonyLastDraw = null
    this.renderHarmonyTracks()
    this.updateHarmonyControls()
    this.setStatus(`🗑 「${tr.name}」を消しました`)
  }

  selectHarmonyTrack(event) {
    const tr = this.trackFromEvent(event)
    if (!tr) return
    this.harmony.selectedId = tr.id
    this.harmonyLastDraw = null
    this.renderHarmonyTracks()
    this.updateHarmonyControls()
  }

  async changeHarmonyTrack(event) {
    const tr = this.trackFromEvent(event)
    if (!tr) return
    const el = event.currentTarget
    const f = el.dataset.trackField
    let rebuild = false
    if (f === "enabled") { tr.enabled = el.checked; rebuild = tr.enabled }
    else if (f === "interval") { if (isValidInterval(el.value)) { tr.interval = el.value; rebuild = true } }
    else if (f === "gain") tr.gain = Number(el.value)
    else if (f === "pan") tr.pan = Number(el.value)
    else if (f === "name") tr.name = el.value.trim() || tr.name
    else if (f === "range") {
      const v = el.value
      if (v === "all") tr.range = { type: "all" }
      else if (v === "time") {
        const cur = this.trackRange(tr)
        tr.range = { type: "time", startSec: cur ? cur[0] : 0, endSec: cur ? cur[1] : Math.min(this.mixTimelineLength, 30) }
      } else if (v.startsWith("section:")) tr.range = { type: "section", sectionId: v.slice(8) }
    } else if (f === "start" || f === "end") {
      const sec = this.parseTime(el.value)
      const cur = this.trackRange(tr) || [0, this.mixTimelineLength]
      if (sec !== null) {
        let [a, b] = cur
        if (f === "start") a = sec
        else b = sec
        if (b - a >= 0.1) tr.range = { type: "time", startSec: Math.max(0, a), endSec: b }
        else this.setStatus("🎶 終わりは始まりより後にしてね")
      }
    }
    if (tr.id === this.harmony.selectedId) this.harmonyLastDraw = null
    if (f !== "gain" && f !== "pan") this.renderHarmonyTracks()
    else this.updateTrackKnobLabels(tr)
    this.updateHarmonyControls()
    if ((f === "gain" || f === "pan") && this.songNow !== null) this.setStatus("🎶 ハモリの音量・左右は、次に ▶ を押したときから変わります")
    if (rebuild && this.mode === "idle" && this.vocalBuffer) await this.buildAutoHarmony({ only: tr.id })
  }

  // 黄色の範囲（波形ドラッグ・📍〜📍で選んだ所）をこのトラックの範囲にする
  useSelForTrack(event) {
    const tr = this.trackFromEvent(event)
    if (!tr) return
    if (!this.mixSel) { this.setStatus("🎶 先に④ミックスの波形をドラッグするか、「📍〜📍」で範囲を選んでね"); return }
    tr.range = { type: "time", startSec: this.mixSel.startSec, endSec: this.mixSel.endSec }
    this.harmonyLastDraw = null
    this.renderHarmonyTracks()
    this.updateHarmonyControls()
    this.setStatus(`🎶 「${tr.name}」は ${this.trackRangeLabel(tr)} だけハモります`)
  }

  // ▶ このトラックの所を試聴（1秒前から）
  async playHarmonyTrack(event) {
    const tr = this.trackFromEvent(event)
    if (!tr || this.mode !== "idle") return
    this.harmony.selectedId = tr.id
    this.harmonyLastDraw = null
    this.renderHarmonyTracks()
    if (tr.enabled && !this.trackVoice(tr) && this.vocalBuffer) await this.buildAutoHarmony({ only: tr.id })
    const r = this.trackRange(tr)
    this.ensureContext()
    await this.ctx.resume()
    const from = r ? Math.max(0, r[0] - 1) : 0
    this.setMode("playing")
    this.startSources(() => {
      this.setMode("idle")
      this.setStatus("試聴おわり")
    }, { fromSec: from, untilSec: r ? r[1] + 1 : null })
    this.setStatus(`🎶 「${tr.name}」（${this.trackRangeLabel(tr)}）を試聴中…`)
  }

  // トラックの一覧を作り直す
  renderHarmonyTracks() {
    if (!this.hasHarmonyTrackListTarget) return
    const h = this.harmony
    // 変わっていなければ作り直さない（入力中の欄が消えないように・部分の変更からも呼ばれる）
    const sig = JSON.stringify([h.selectedId, h.tracks.map((t) => [t.id, t.name, t.interval, t.range, t.enabled]),
      (this.sections || []).map((s) => [s.id, s.name, Math.round(s.startSec * 10), Math.round(s.endSec * 10)])])
    if (sig === this.harmonyTrackSig && this.harmonyTrackListTarget.childElementCount) return
    this.harmonyTrackSig = sig
    const el = (tag, attrs = {}, text = null) => {
      const e = document.createElement(tag)
      Object.entries(attrs).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v === true ? "" : String(v)) })
      if (text !== null) e.textContent = text
      return e
    }
    const field = (f, ev = "change") => ({ "data-track-field": f, "data-action": `${ev}->singing-mixer#changeHarmonyTrack` })
    const rows = h.tracks.map((tr) => {
      const row = el("div", { class: `sg-htrack${tr.id === h.selectedId ? " is-selected" : ""}`, "data-track-id": tr.id })
      // 1行目：ON/OFF・名前（押すと🎯ガイドにする）・ハモり方・🗑
      const head = el("div", { class: "sg-htrack__head" })
      const on = el("input", { type: "checkbox", "aria-label": `${tr.name}を鳴らす`, ...field("enabled") })
      on.checked = tr.enabled
      head.append(on)
      head.append(el("button", { type: "button", class: "sg-htrack__name", "data-action": "singing-mixer#selectHarmonyTrack", "aria-pressed": String(tr.id === h.selectedId), title: "押すと、🎯ガイド・🎹ガイドメロディをこのハモリの音程にします" }, `${tr.id === h.selectedId ? "🎯 " : ""}${tr.name}`))
      const sel = el("select", { class: "sg-select", "aria-label": `${tr.name}のハモり方`, ...field("interval") })
      const group = (label, items) => {
        const g = el("optgroup", { label })
        items.forEach(([v, t]) => g.append(el("option", { value: v }, t)))
        sel.append(g)
      }
      group("よく使う", Object.entries(HARMONY_INTERVALS).map(([k, v]) => [k, v.label]))
      group("1度ずつ選ぶ（上へ）", MANUAL_DEGREES.map((n) => [manualIntervalId(1, n), `上へ${n}度`]))
      group("1度ずつ選ぶ（下へ）", MANUAL_DEGREES.map((n) => [manualIntervalId(-1, n), `下へ${n}度`]))
      sel.value = tr.interval
      head.append(sel)
      head.append(el("span", { class: "sg-help", "data-track-status": tr.id }, ""))
      head.append(el("button", { type: "button", class: "sg-btn sg-btn--small sg-btn--ghost", "data-action": "singing-mixer#deleteHarmonyTrack", "aria-label": `${tr.name}を消す` }, "🗑"))
      row.append(head)
      // 2行目：範囲
      const rr = el("div", { class: "sg-htrack__range" })
      const rs = el("select", { class: "sg-select", "aria-label": `${tr.name}をハモる所`, ...field("range") })
      rs.append(el("option", { value: "all" }, "曲全体"))
      ;(this.sections || []).forEach((s) => rs.append(el("option", { value: `section:${s.id}` }, `部分：${s.name} ${this.formatSec(s.startSec)}〜${this.formatSec(s.endSec)}`)))
      if (tr.range && tr.range.type === "section" && !(this.sections || []).some((s) => s.id === tr.range.sectionId)) rs.append(el("option", { value: `section:${tr.range.sectionId}` }, "⚠ 消えた部分"))
      rs.append(el("option", { value: "time" }, "時間で指定"))
      rs.value = !tr.range || tr.range.type === "all" ? "all" : tr.range.type === "section" ? `section:${tr.range.sectionId}` : "time"
      rr.append(rs)
      if (tr.range && tr.range.type === "time") {
        const r = this.trackRange(tr) || [0, 0]
        rr.append(el("input", { type: "text", inputmode: "decimal", class: "sg-num-input", value: this.formatSec(r[0]), "aria-label": "始まり", ...field("start") }))
        rr.append(el("span", { class: "sg-help" }, "〜"))
        rr.append(el("input", { type: "text", inputmode: "decimal", class: "sg-num-input", value: this.formatSec(r[1]), "aria-label": "終わり", ...field("end") }))
      }
      rr.append(el("button", { type: "button", class: "sg-btn sg-btn--small", "data-action": "singing-mixer#useSelForTrack", title: "④ミックスの波形で選んだ黄色の範囲（📍〜📍でもOK）をここにする" }, "🟨 選んだ範囲にする"))
      rr.append(el("button", { type: "button", class: "sg-btn sg-btn--small", "data-action": "singing-mixer#playHarmonyTrack" }, "▶"))
      row.append(rr)
      // 3行目：音量・左右
      const kn = el("div", { class: "sg-htrack__knobs" })
      const knob = (label, f, min, max, step, val) => {
        const k = el("div", { class: "sg-knob" })
        const l = el("label", {}, `${label} `)
        l.append(el("span", { class: "sg-val", "data-track-label": f }, ""))
        k.append(l)
        k.append(el("input", { type: "range", min, max, step, value: val, "aria-label": `${tr.name}の${label}`, ...field(f, "input") }))
        return k
      }
      kn.append(knob("音量", "gain", 0, 1.5, 0.01, tr.gain))
      kn.append(knob("左右", "pan", -1, 1, 0.05, tr.pan))
      row.append(kn)
      return row
    })
    if (!rows.length) rows.push(el("p", { class: "sg-help" }, "まだハモリはありません。「＋ ハモリを足す」で足してね（④ミックスの波形で範囲を選んでから押すと、その所だけハモります）"))
    this.harmonyTrackListTarget.replaceChildren(...rows)
    h.tracks.forEach((tr) => this.updateTrackKnobLabels(tr))
  }

  updateTrackKnobLabels(tr) {
    if (!this.hasHarmonyTrackListTarget) return
    const row = this.harmonyTrackListTarget.querySelector(`[data-track-id="${tr.id}"]`)
    if (!row) return
    const pct = (v) => `${Math.round(v * 100)}%`
    const lr = (v) => (Math.abs(v) < 0.03 ? "まん中" : v < 0 ? `左 ${Math.round(-v * 100)}` : `右 ${Math.round(v * 100)}`)
    const g = row.querySelector('[data-track-label="gain"]')
    if (g) g.textContent = pct(tr.gain)
    const p = row.querySelector('[data-track-label="pan"]')
    if (p) p.textContent = lr(tr.pan)
  }

  // トラックが無いときに、🎯ガイドの音程を選ぶ（前の版の「ハモり方」ボタン）
  async selectHarmonyInterval(event) {
    const id = event.currentTarget.dataset.interval
    if (!isValidInterval(id)) return
    const t = this.selectedTrack()
    if (t) t.interval = id
    else this.harmony.guideInterval = id
    this.harmonyLastDraw = null
    this.renderHarmonyTracks()
    this.updateHarmonyControls()
    if (t && t.enabled && this.mode === "idle" && this.vocalBuffer) await this.buildAutoHarmony({ only: t.id })
  }

  // 前の版の「🪄 自動でハモる」チェック：ON でトラックが無ければ1本足す、OFF で全部止める
  async toggleHarmonyAuto(event) {
    const on = !!event.currentTarget.checked
    if (on && !this.harmony.tracks.length) { await this.addHarmonyTrack(); return }
    this.harmony.tracks.forEach((t) => { t.enabled = on })
    this.renderHarmonyTracks()
    if (on && this.mode === "idle") await this.buildAutoHarmony()
    this.updateHarmonyControls()
  }

  async changeHarmonyKey() {
    this.harmony.keyChoice = this.harmonyKeySelectTarget.value || "auto"
    this.harmonyLastDraw = null
    if (this.harmony.kero.enabled && this.vocalBase && this.mode === "idle") await this.rebuildVocal() // ケロケロ風もキーを使う（自動ハモリも作り直す）
    else if (this.harmony.tracks.some((t) => t.enabled) && this.mode === "idle") await this.buildAutoHarmony()
    this.updateHarmonyControls()
  }

  async buildHarmonyNow() {
    if (this.mode !== "idle") return
    await this.buildAutoHarmony()
  }

  changeHarmonyMix(event) {
    const el = event.currentTarget
    const part = this.harmony[el.dataset.harmonyPart]
    if (!part) return
    part[el.dataset.harmonyParam] = Number(el.value)
    this.updateHarmonyControls()
    if (this.songNow !== null) this.setStatus("🎶 ハモリの音量・左右は、次に ▶ を押したときから変わります")
  }

  toggleHarmonyManual(event) {
    this.harmony.manual.enabled = !!event.currentTarget.checked
    this.updateHarmonyControls()
  }

  nudgeHarmonyManual(event) {
    const m = this.harmony.manual
    if (!m.buffer) return
    m.offsetMs = Math.max(-1000, Math.min(1000, m.offsetMs + Number(event.currentTarget.dataset.nudge || 0)))
    this.updateHarmonyControls()
  }

  clearHarmonyManual() {
    const m = this.harmony.manual
    if (!m.base || !window.confirm("録ったハモリを消しますか？")) return
    Object.assign(m, { raw: null, base: null, noiseRange: null, buffer: null, offsetMs: 0 })
    this.updateHarmonyControls()
    this.setStatus("🗑 録ったハモリを消しました")
  }

  async toggleKero(event) {
    this.harmony.kero.enabled = !!event.currentTarget.checked
    this.updateHarmonyControls()
    if (this.vocalBase && this.mode === "idle") {
      await this.rebuildVocal()
      this.setStatus(this.harmony.kero.enabled ? `🐸 ケロケロ風にしました（キー：${keyName(this.harmonyKey())}）。▶試聴で確かめてね` : "🐸 ケロケロ風をやめました")
    }
  }

  async changeKeroAmount() {
    this.harmony.kero.amount = Number(this.keroAmountTarget.value) || 70
    this.updateHarmonyControls()
    if (this.harmony.kero.enabled && this.vocalBase && this.mode === "idle") await this.rebuildVocal()
  }

  // 録ったハモリに、1本目と同じノイズ消し・入力ゲインをかける
  rebuildHarmonyManual() {
    const m = this.harmony.manual
    if (!m.base) { m.buffer = null; m.builtWith = null; return }
    const strength = this.hasDenoiseStrengthTarget ? Number(this.denoiseStrengthTarget.value) : 0
    // 同じ設定で作ってあれば作り直さない（声を編集するたびに重い計算をしないように）
    const sig = `${strength}|${this.useRaw ? 1 : 0}|${this.inputGainDb || 0}`
    if (m.buffer && m.builtFrom === m.base && m.builtWith === sig) return
    let buf = m.base
    if (!this.useRaw && strength > 0 && m.noiseRange) {
      try {
        buf = denoise(this.ctx, buf, { strength, noiseStart: m.noiseRange[0], noiseEnd: m.noiseRange[1], noiseBuffer: m.raw })
      } catch (e) {
        console.error(e)
      }
    }
    if (this.inputGainDb) buf = this.applyGain(buf, Math.pow(10, this.inputGainDb / 20))
    m.buffer = buf
    m.builtFrom = m.base
    m.builtWith = sig
  }

  // 🎙 ハモリを録る（2本目の声）：オケと1本目の声を流しながら録る。ずれの直し方は1本目と同じ（手拍子 → 📏 → ブラウザの値）
  async startHarmonyRecording() {
    if (!this.backingBuffer || !this.vocalBuffer) {
      this.setStatus("🎙 ハモリを録るには、先にオケと1本目の声（主旋律）を入れてね")
      return
    }
    if (this.mode !== "idle") return
    this.ensureContext()
    await this.ctx.resume()
    this.ensureMainPitch()
    const stream = await this.openMic()
    if (!stream) return
    const countIn = this.countInTarget.checked
    const rec = this.startRecorder(stream)
    const t0 = this.ctx.currentTime + 0.1
    const countAt = t0 + COUNT_SILENCE
    const clapAt = countAt + 3 * BEAT
    const songAt = countIn ? countAt + 4 * BEAT : countAt
    if (countIn) {
      for (let i = 0; i < 4; i++) this.tone(countAt + i * BEAT, { freq: i === 0 ? 1500 : 1000, length: 0.04, volume: 0.5 })
    }
    this.harmony.rec = { buf: new Float32Array(2048), frame: 0, micMidi: 0, trail: [] }
    // 🎹 ガイドメロディ（K36）：🔔がONなら、🎯ハモる音をピアノっぽい音で先に並べて鳴らす（書き出しには入らない）
    this.startSources(() => this.stopMicRecording(), { startAt: songAt, noHarmony: true, guide: this.hasHarmonyGuideToneTarget && this.harmonyGuideToneTarget.checked })
    this.setMode("micRecording")
    this.setStatus(countIn
      ? "🔴 ハモリを録音中… 最初は静かに → 「1・2・3・4」の4つ目で手拍子 → 🎯の音程でハモってね（⏹で終了）"
      : "🔴 ハモリを録音中… 最初の1.5秒は静かに → 🎯の音程でハモってね（⏹で終了）")

    const blob = await rec.done
    this.harmony.rec = null
    this.harmonyLastDraw = null
    this.stopSources()
    this.stopMicStream()
    const buffer = await this.decodeBlob(blob, "録音したハモリ")
    if (!buffer) { this.setMode("idle"); return }
    const mono = toMono(buffer)
    const sr = buffer.sampleRate
    const rel = (t) => t - rec.startedAt
    const noiseRange = [Math.max(0, rel(t0) + 0.2), Math.max(0, rel(countAt) - 0.1)]
    const floor = rmsOf(mono, sr, noiseRange[0], noiseRange[1])
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
      method = fb.method
    }
    const base = trimBuffer(this.ctx, buffer, rel(songAt) + lat)
    if (!base) {
      this.setMode("idle")
      this.setStatus("録音が短すぎました。オケが始まってから歌ってね")
      return
    }
    Object.assign(this.harmony.manual, { raw: buffer, base, noiseRange, offsetMs: 0, enabled: true })
    if (this.hasHarmonyManualTarget) this.harmonyManualTarget.checked = true
    this.setMode("processing")
    this.setStatus("✨ ハモリにノイズ消しをかけています…")
    await new Promise((resolve) => setTimeout(resolve, 30))
    this.rebuildHarmonyManual()
    this.setMode("idle")
    this.updateHarmonyControls()
    this.setStatus(`🎙 ハモリを録りました（${base.duration.toFixed(1)}秒・ずれ ${Math.round(lat * 1000)}ms を自動で直しました：${method}）。ずれていたら ±10ms で直してね。${this.levelAdvice(base)}`)
  }

  // 🔔 ガイドの音：🎯の音を小さく鳴らす（スピーカー／ヘッドホンへ直接。書き出しには入らない）
  startGuideTone() {
    this.stopGuideTone()
    if (!(this.hasHarmonyGuideToneTarget && this.harmonyGuideToneTarget.checked) || !this.ctx) return
    const osc = this.ctx.createOscillator()
    osc.type = "triangle"
    const g = this.ctx.createGain()
    g.gain.value = 0
    osc.connect(g)
    g.connect(this.ctx.destination)
    osc.start()
    this.guideTone = { osc, g }
  }

  stopGuideTone() {
    const t = this.guideTone
    if (!t) return
    try { t.osc.stop() } catch (e) {}
    try { t.g.disconnect() } catch (e) {}
    this.guideTone = null
  }

  // いまの曲の時間でハモる音（midi・0＝声がない所・選んだトラックの範囲の外）。音程は選んでいるトラック（K37）
  harmonyTargetNow(songSec) {
    const p = this.harmony.pitch && this.harmony.pitchFor === this.vocalBuffer ? this.harmony.pitch : null
    if (!p) return 0
    if (!this.inGuideRange(songSec)) return 0
    return harmonyTargetAt(p, this.harmonyKey(), this.guideInterval(), songSec - this.vocalOffsetMs / 1000)
  }

  // 🎯 ハモる音程のガイド（再生中・ハモリ録音中）。左＝少し前、右＝これから
  drawHarmonyGuide() {
    if (!this.hasHarmonyGuideTarget || !this.harmony) return
    const c = this.harmonyGuideTarget
    if (!c.offsetParent) return
    const h = this.harmony
    const now = this.songNow
    const playing = now !== null && now >= 0
    const rec = h.rec
    // 再生中にガイドが見えていて、まだ1本目の音程を調べていなければ、少しあとで調べる（描く処理を止めないように）
    if (playing && this.vocalBuffer && !(h.pitch && h.pitchFor === this.vocalBuffer) && !this.harmonyPitchPending) {
      this.harmonyPitchPending = true
      setTimeout(() => {
        try { this.ensureMainPitch() } catch (e) { console.error(e) }
        this.harmonyPitchPending = false
        this.harmonyLastDraw = null
      }, 50)
    }
    // マイクのいまの音程（録音中だけ・3コマに1回）
    if (rec && this.meter && this.meter.an && this.ctx) {
      rec.frame++
      if (rec.frame % 3 === 0) {
        const an = this.meter.an
        if (rec.buf.length !== an.fftSize) rec.buf = new Float32Array(an.fftSize)
        an.getFloatTimeDomainData(rec.buf)
        let s = 0
        for (let i = 0; i < rec.buf.length; i++) s += rec.buf[i] * rec.buf[i]
        const rms = Math.sqrt(s / rec.buf.length)
        const hz = rms > 0.01 ? yinFrame(rec.buf, this.ctx.sampleRate, { minHz: 70, maxHz: 1100 }) : 0
        rec.micMidi = hz ? hzToMidi(hz) : 0
        if (playing) {
          rec.trail.push({ t: now, m: rec.micMidi })
          if (rec.trail.length > 300) rec.trail.shift()
        }
      }
    }
    const target = playing ? this.harmonyTargetNow(now) : 0
    // ガイドの音
    if (this.guideTone && this.ctx) {
      const t = this.ctx.currentTime
      if (target) this.guideTone.osc.frequency.setTargetAtTime(midiToHz(target), t, 0.015)
      this.guideTone.g.gain.setTargetAtTime(target ? 0.06 : 0, t, 0.03)
    }
    const giv = this.guideInterval() // 🎯 選んでいるトラックのハモり方（K37）
    const key = [c.clientWidth, c.clientHeight, playing ? Math.round(now * 30) : -1, giv, JSON.stringify(this.guideRange() ?? "none"), h.keyChoice, !!rec, this.objId(h.pitch), this.vocalOffsetMs].join(";")
    if (key === this.harmonyLastDraw) return
    this.harmonyLastDraw = key

    const u = this.fitCanvas(c)
    const g = c.getContext("2d")
    const w = c.width
    const hh = c.height
    g.fillStyle = "#0e1a33"
    g.fillRect(0, 0, w, hh)
    const p = h.pitch && h.pitchFor === this.vocalBuffer ? h.pitch : null
    if (!p) {
      g.fillStyle = "rgba(255,255,255,0.6)"
      g.font = `${13 * u}px sans-serif`
      g.fillText(this.vocalBuffer ? "▶試聴か「🎙 ハモリを録る」で、ハモる音程が出ます" : "1本目の声を入れると、ハモる音程が出ます", 10 * u, 24 * u)
      return
    }
    const center = playing ? now : 0
    const from = center - 2
    const to = center + 4
    const toX = (sec) => ((sec - from) / (to - from)) * w
    const off = this.vocalOffsetMs / 1000
    const key2 = this.harmonyKey()
    // 音の高さの範囲（見えている所の主旋律＋ハモリから）
    let lo = Infinity
    let hi = -Infinity
    const f0 = Math.max(0, Math.floor((from - off) / p.hop))
    const f1 = Math.min(p.midi.length, Math.ceil((to - off) / p.hop))
    for (let f = f0; f < f1; f++) {
      const m = p.midi[f]
      if (!m) continue
      const t = harmonyTargetAt(p, key2, giv, f * p.hop)
      lo = Math.min(lo, m, t || m)
      hi = Math.max(hi, m, t || m)
    }
    if (!Number.isFinite(lo)) { lo = 57; hi = 72 }
    lo = Math.floor(lo) - 3
    hi = Math.ceil(hi) + 3
    const toY = (m) => hh - ((m - lo) / Math.max(1, hi - lo)) * hh
    // ドの線と名前
    g.font = `${10 * u}px sans-serif`
    for (let m = Math.ceil(lo); m <= hi; m++) {
      const pc = ((m % 12) + 12) % 12
      if (pc !== 0 && pc !== key2.tonic) continue
      g.fillStyle = pc === key2.tonic ? "rgba(255,215,90,0.25)" : "rgba(255,255,255,0.12)"
      g.fillRect(0, toY(m), w, Math.max(1, u))
      g.fillStyle = "rgba(255,255,255,0.5)"
      g.fillText(noteName(m), 4 * u, toY(m) - 2 * u)
    }
    // 主旋律（うすい白）と 🎯ハモる音（色つき）
    const drawCurve = (fn, color, width) => {
      g.strokeStyle = color
      g.lineWidth = width * u
      g.beginPath()
      let pen = false
      for (let f = f0; f < f1; f++) {
        const v = fn(f)
        if (!v) { pen = false; continue }
        const x = toX(off + f * p.hop)
        const y = toY(v)
        if (pen) g.lineTo(x, y)
        else { g.moveTo(x, y); pen = true }
      }
      g.stroke()
    }
    drawCurve((f) => p.midi[f], "rgba(255,255,255,0.35)", 2)
    drawCurve((f) => (p.midi[f] && this.inGuideRange(off + f * p.hop) ? harmonyTargetAt(p, key2, giv, f * p.hop) : 0), "#ffd75a", 4)
    // 🎤 いまの声（録音中）：🎯に近ければ緑、離れていればオレンジ
    if (rec) {
      rec.trail.forEach((pt) => {
        if (!pt.m || pt.t < from) return
        const tg = this.harmonyTargetNow(pt.t)
        const ok = tg && Math.abs(pt.m - tg) < 0.5
        g.fillStyle = ok ? "#44c77a" : "#ff9a3c"
        g.beginPath()
        g.arc(toX(pt.t), toY(pt.m), 3 * u, 0, Math.PI * 2)
        g.fill()
      })
    }
    if (playing) {
      g.fillStyle = "#ffffff"
      g.fillRect(toX(now) - u, 0, 2 * u, hh)
    }
    if (this.hasHarmonyGuideInfoTarget && playing) {
      let text = target ? `🎯 ハモる音：${noteName(target)}` : "🎯 （ここは歌っていない所）"
      if (rec && rec.micMidi) {
        const diff = target ? Math.round((rec.micMidi - target) * 100) : null
        text += `　🎤 いまの声：${noteName(rec.micMidi)}${diff !== null ? `（${diff > 0 ? "+" : ""}${diff}セント${Math.abs(diff) < 50 ? "・OK" : diff > 0 ? "・高い" : "・低い"}）` : ""}`
      }
      this.harmonyGuideInfoTarget.textContent = text
    }
  }

  updateHarmonyControls() {
    const h = this.harmony
    if (!h) return
    const idle = this.mode === "idle"
    const k = h.keyGuess && h.keyFor === this.backingBuffer ? h.keyGuess : null
    if (this.hasHarmonyKeyInfoTarget) {
      this.harmonyKeyInfoTarget.textContent = k
        ? `推定キー：${keyName(k)}（自信 ${this.keyConfidenceText(k)}）`
        : this.backingBuffer ? "キーはまだ調べていません（🔍 か、🎶を使うと調べます）" : "オケを入れると、キー（調）を調べられます"
    }
    if (this.hasHarmonyKeySelectTarget && this.harmonyKeySelectTarget.value !== h.keyChoice) this.harmonyKeySelectTarget.value = h.keyChoice
    if (this.hasHarmonyIntervalButtonTarget) {
      this.harmonyIntervalButtonTargets.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.interval === this.guideInterval())))
    }
    const anyOn = h.tracks.some((t) => t.enabled)
    if (this.hasHarmonyAutoTarget) this.harmonyAutoTarget.checked = anyOn
    if (this.hasHarmonyBuildButtonTarget) this.harmonyBuildButtonTarget.disabled = !(idle && this.vocalBuffer && anyOn)
    if (this.hasHarmonyAddButtonTarget) this.harmonyAddButtonTarget.disabled = !idle
    // トラックごとの「作った／まだ」の表示
    let missing = 0
    h.tracks.forEach((tr) => {
      const ready = !!this.trackVoice(tr)
      if (tr.enabled && !ready) missing++
      const st = this.hasHarmonyTrackListTarget ? this.harmonyTrackListTarget.querySelector(`[data-track-status="${tr.id}"]`) : null
      if (st) {
        const r = this.trackRange(tr)
        st.textContent = !tr.enabled ? "OFF" : r === undefined ? "⚠ 部分が消えた" : !this.vocalBuffer ? "歌声が要ります" : ready ? `✅ ${this.trackRangeLabel(tr)}` : "⏳ まだ作っていません（🎶 作り直す）"
      }
    })
    if (this.hasHarmonyTrackListTarget) {
      this.harmonyTrackListTarget.querySelectorAll("[data-track-field], [data-action$='#deleteHarmonyTrack'], [data-action$='#useSelForTrack'], [data-action$='#playHarmonyTrack']").forEach((e) => { e.disabled = !idle })
    }
    if (this.hasHarmonyInfoTarget) {
      const on = h.tracks.filter((t) => t.enabled)
      this.harmonyInfoTarget.textContent = !h.tracks.length ? "" : !this.vocalBuffer ? "歌声を入れると作れます"
        : missing ? `⚠ ${missing}本まだ作っていません →「🎶 作り直す」` : on.length ? `${on.length}本のハモリを重ねています` : "全部 OFF です"
    }
    const pct = (v) => `${Math.round(v * 100)}%`
    const lr = (v) => (Math.abs(v) < 0.03 ? "まん中" : v < 0 ? `左 ${Math.round(-v * 100)}` : `右 ${Math.round(v * 100)}`)
    if (this.hasHarmonyGuideVolumeTarget && this.hasHarmonyGuideVolumeValueTarget) this.harmonyGuideVolumeValueTarget.textContent = pct(Number(this.harmonyGuideVolumeTarget.value))
    if (this.hasHarmonyGuideTargetInfoTarget) {
      const t = this.selectedTrack()
      this.harmonyGuideTargetInfoTarget.textContent = t ? `🎯 ガイドの音程：「${t.name}」（${intervalInfo(t.interval).label}・${this.trackRangeLabel(t)}）` : `🎯 ガイドの音程：${intervalInfo(h.guideInterval).label}（ハモリを足すと、選んだハモリの音程になります）`
    }
    if (this.hasHarmonyManualVolumeTarget) this.harmonyManualVolumeTarget.value = String(h.manual.gain)
    if (this.hasHarmonyManualPanTarget) this.harmonyManualPanTarget.value = String(h.manual.pan)
    const gl = this.element.querySelector('[data-harmony-label="manual-gain"]')
    if (gl) gl.textContent = pct(h.manual.gain)
    const pl = this.element.querySelector('[data-harmony-label="manual-pan"]')
    if (pl) pl.textContent = lr(h.manual.pan)
    if (this.hasHarmonyManualTarget) this.harmonyManualTarget.checked = h.manual.enabled
    if (this.hasHarmonyManualInfoTarget) {
      this.harmonyManualInfoTarget.textContent = h.manual.buffer
        ? `録ったハモリ：${h.manual.buffer.duration.toFixed(1)}秒・ずれ ${h.manual.offsetMs > 0 ? "+" : ""}${h.manual.offsetMs}ms`
        : "まだ録っていません"
    }
    if (this.hasHarmonyRecordButtonTarget) this.harmonyRecordButtonTarget.disabled = !(idle && this.backingBuffer && this.vocalBuffer)
    if (this.hasHarmonyClearButtonTarget) this.harmonyClearButtonTarget.disabled = !(idle && h.manual.base)
    if (this.hasKeroToggleTarget) {
      this.keroToggleTarget.checked = h.kero.enabled
      this.keroToggleTarget.disabled = !idle
    }
    if (this.hasKeroAmountTarget) {
      this.keroAmountTarget.value = String(h.kero.amount)
      this.keroAmountTarget.disabled = !(idle && h.kero.enabled)
    }
    if (this.hasKeroValueTarget) this.keroValueTarget.textContent = String(h.kero.amount)
  }

  // 💾 プロジェクト保存（K24）用
  harmonyForSave() {
    const h = this.harmony
    if (!h) return null
    return {
      keyChoice: h.keyChoice,
      v: 2, // K37：トラック方式
      tracks: h.tracks.map((t) => ({ id: t.id, name: t.name, interval: t.interval, range: { ...(t.range || { type: "all" }) }, gain: t.gain, pan: t.pan, enabled: t.enabled })),
      selectedId: h.selectedId,
      trackSeq: h.trackSeq,
      guideInterval: h.guideInterval,
      guidePlay: this.hasHarmonyGuidePlayTarget ? this.harmonyGuidePlayTarget.checked : false,
      guideRec: this.hasHarmonyGuideToneTarget ? this.harmonyGuideToneTarget.checked : true,
      guideVolume: this.hasHarmonyGuideVolumeTarget ? Number(this.harmonyGuideVolumeTarget.value) : 0.5,
      manual: { enabled: h.manual.enabled, gain: h.manual.gain, pan: h.manual.pan, offsetMs: h.manual.offsetMs, raw: h.manual.raw, base: h.manual.base, noiseRange: h.manual.noiseRange },
      kero: { ...h.kero }
    }
  }

  async restoreHarmony(st) {
    const h = this.harmony
    if (!h || !st) return
    h.keyChoice = st.keyChoice || "auto"
    h.voices.clear()
    if (Array.isArray(st.tracks)) {
      h.tracks = st.tracks.filter((t) => t && t.id).map((t) => ({
        id: String(t.id), name: t.name || "ハモリ", interval: isValidInterval(t.interval) ? t.interval : "up3",
        range: t.range && ["all", "section", "time"].includes(t.range.type) ? { ...t.range } : { type: "all" },
        gain: Number.isFinite(t.gain) ? t.gain : 0.7, pan: Number.isFinite(t.pan) ? t.pan : 0, enabled: t.enabled !== false
      }))
      h.selectedId = h.tracks.some((t) => t.id === st.selectedId) ? st.selectedId : (h.tracks[0] ? h.tracks[0].id : null)
      h.trackSeq = Math.max(Number(st.trackSeq) || 1, h.tracks.length + 1)
    } else if (st.auto) {
      // 前の版（自動ハモリ1本）→ トラック1本目として引き継ぐ
      const a = st.auto
      h.tracks = [{ id: `h${Date.now()}1`, name: "ハモリ1", interval: isValidInterval(a.interval) ? a.interval : "up3", range: { type: "all" }, gain: Number.isFinite(a.gain) ? a.gain : 0.7, pan: Number.isFinite(a.pan) ? a.pan : -0.3, enabled: !!a.enabled }]
      h.selectedId = h.tracks[0].id
      h.trackSeq = 2
    } else h.tracks = []
    h.guideInterval = isValidInterval(st.guideInterval) ? st.guideInterval : "up3"
    if (this.hasHarmonyGuidePlayTarget && st.guidePlay !== undefined) this.harmonyGuidePlayTarget.checked = !!st.guidePlay
    if (this.hasHarmonyGuideToneTarget && st.guideRec !== undefined) this.harmonyGuideToneTarget.checked = !!st.guideRec
    if (this.hasHarmonyGuideVolumeTarget && Number.isFinite(st.guideVolume)) this.harmonyGuideVolumeTarget.value = String(st.guideVolume)
    Object.assign(h.manual, { ...(st.manual || {}), buffer: null })
    Object.assign(h.kero, st.kero || {})
    this.rebuildHarmonyManual()
    this.renderHarmonyTracks()
    if (h.kero.enabled && this.vocalBase) await this.rebuildVocal() // ケロケロ風・自動ハモリも作り直す
    else if (h.tracks.some((t) => t.enabled) && this.vocalBuffer) await this.buildAutoHarmony({ quiet: true })
    this.updateHarmonyControls()
  }

  // ---------- 💾 ミックス設定のテンプレート（K42・11/10） ----------
  // 中身：雰囲気・スライダー・詳細モードの値・🎛エフェクト・入力ゲイン・ハモリトラックの設定（音程・音量・左右・ON/OFF。範囲は入れない）。
  // 曲ごとのもの（部分の位置・ピン・歌詞・ずれ・音のデータ）は入れない。
  // アカウントに保存（本人のものだけ）。つながらない・ログインが切れたときは、この端末（localStorage）に予備として置き、次に一覧を開いてつながったら送る

  readLocalMixTemplates() {
    try {
      const v = JSON.parse(window.localStorage.getItem(MIX_TEMPLATE_KEY) || "[]")
      return Array.isArray(v) ? v.filter((t) => t && t.id && t.data && t.data.mix) : []
    } catch (e) {
      return []
    }
  }

  writeLocalMixTemplates(list) {
    try { window.localStorage.setItem(MIX_TEMPLATE_KEY, JSON.stringify(list || [])) } catch (e) {}
  }

  // 今編集しているミックス（④で部分を選んでいればその部分、なければ曲全体）をテンプレートの形に
  mixTemplateData() {
    const s = this.editingSection
    const mix = JSON.parse(JSON.stringify({ ...this.editingSettings, reverbLength: this.mix.reverbLength })) // 響きの長さは曲全体のもの
    delete mix.preset
    const h = this.harmony
    return {
      version: 1,
      from: s ? "section" : "whole",
      fromLabel: s ? this.sectionLabel(s) : "曲全体",
      mix,
      preset: this.editingPreset || "custom",
      inputGainDb: this.inputGainDb || 0,
      harmony: h ? h.tracks.map((t) => ({ name: t.name, interval: t.interval, gain: t.gain, pan: t.pan, enabled: t.enabled })) : []
    }
  }

  async openMixTemplates(event) {
    if (event && event.currentTarget && !event.currentTarget.open) return
    this.updateMixTemplateInfo("☁ テンプレートを読み込んでいます…")
    await this.loadMixTemplates()
  }

  async saveMixTemplate() {
    const input = this.hasMixTemplateNameTarget ? this.mixTemplateNameTarget : null
    let name = (input ? input.value : "").trim()
    if (!name) {
      const preset = MIX_PRESETS[this.editingPreset]
      name = `${preset ? preset.label : "ミックス"} ${new Date().toLocaleDateString("ja-JP")}`
    }
    name = name.slice(0, 40)
    const data = this.mixTemplateData()
    try {
      await srvCreateMixTemplate(name, data)
      this.setStatus(`💾 「${name}」をアカウントに保存しました（${data.fromLabel}のミックス）。ほかの曲でも「📋 テンプレートから読み込む」から使えます`)
    } catch (e) {
      if (e instanceof ServerError && (e.offline || e.auth)) {
        const list = this.readLocalMixTemplates()
        list.unshift({ id: `local-${Date.now()}`, name, data, updatedAt: Date.now() })
        this.writeLocalMixTemplates(list.slice(0, 50))
        this.setStatus(`💾 サーバーにつながらなかったので、「${name}」をこの端末に予備として保存しました。次につながったときにアカウントへ送ります`)
      } else {
        this.setStatus(`💾 テンプレートを保存できませんでした：${e.message || e}`)
        return
      }
    }
    if (input) input.value = ""
    await this.loadMixTemplates()
  }

  async loadMixTemplates() {
    let server = null
    let note = ""
    try {
      server = await srvListMixTemplates()
      // この端末に予備として置いていたものを、アカウントへ送る
      const local = this.readLocalMixTemplates()
      if (local.length) {
        const left = []
        for (const t of local) {
          try { await srvCreateMixTemplate(t.name, t.data) } catch (e) { left.push(t) }
        }
        this.writeLocalMixTemplates(left)
        if (left.length < local.length) {
          note = `この端末の予備 ${local.length - left.length}個をアカウントに送りました。`
          server = await srvListMixTemplates()
        }
      }
    } catch (e) {
      console.error(e)
      server = null
      note = e instanceof ServerError && e.auth
        ? "ログインが切れているので、この端末の予備だけを出しています。"
        : "サーバーにつながらないので、この端末の予備だけを出しています。"
    }
    this.mixTemplates = [...(server || []), ...this.readLocalMixTemplates().map((t) => ({ ...t, local: true }))]
    this.mixTemplateNote = note
    this.renderMixTemplates()
  }

  // 「どこに当てるか」の案内（④で部分を選ぶと変わる）
  updateMixTemplateInfo(message = null) {
    if (!this.hasMixTemplateInfoTarget) return
    if (message) { this.mixTemplateInfoTarget.textContent = message; return }
    const s = this.editingSection
    this.mixTemplateInfoTarget.textContent = s
      ? `${this.mixTemplateNote || ""}読み込むと「${this.sectionLabel(s)}」（④で選んでいる部分）だけに当てます（雰囲気・スライダー・詳細の値・🎛エフェクト。入力ゲイン・ハモリ・響きの長さは曲全体のものなので変えません）。`
      : `${this.mixTemplateNote || ""}読み込むと曲全体に当てます（入力ゲイン・ハモリも）。④で部分を選んでから読み込むと、その部分だけに当てられます。`
  }

  renderMixTemplates() {
    this.updateMixTemplateInfo()
    if (!this.hasMixTemplateListTarget) return
    const box = this.mixTemplateListTarget
    box.replaceChildren()
    const list = this.mixTemplates || []
    if (!list.length) {
      const p = document.createElement("p")
      p.className = "sg-help"
      p.textContent = "まだテンプレートがありません。上の 💾 で今のミックスを保存してね"
      box.appendChild(p)
      return
    }
    const btn = (label, action, cls, aria = null) => {
      const b = document.createElement("button")
      b.type = "button"
      b.className = cls
      b.dataset.action = `singing-mixer#${action}`
      b.textContent = label
      if (aria) b.setAttribute("aria-label", aria)
      return b
    }
    list.forEach((t) => {
      const d = t.data || {}
      const row = document.createElement("div")
      row.className = "sg-mixtpl__row"
      row.dataset.templateId = String(t.id)
      const name = document.createElement("span")
      name.className = "sg-mixtpl__name"
      name.textContent = `${t.local ? "📱 " : "☁ "}${t.name}`
      name.title = t.local ? "この端末だけ（まだアカウントに送れていない予備）" : "アカウントに保存"
      const meta = document.createElement("span")
      meta.className = "sg-help sg-mixtpl__meta"
      const preset = MIX_PRESETS[d.preset]
      const bits = [preset ? preset.label : "カスタム"]
      if (d.mix && d.mix.fx && d.mix.fx !== "none" && FX_TYPES[d.mix.fx]) bits.push(`🎛${FX_TYPES[d.mix.fx].label}`)
      if (Array.isArray(d.harmony) && d.harmony.length) bits.push(`🎶ハモリ${d.harmony.length}本`)
      if (d.inputGainDb) bits.push(`🎚${d.inputGainDb > 0 ? "+" : ""}${d.inputGainDb}dB`)
      meta.textContent = bits.join("・") + (t.updatedAt ? `（${new Date(t.updatedAt).toLocaleDateString("ja-JP")}）` : "")
      row.append(
        name, meta,
        btn("📋 読み込む", "applyMixTemplate", "sg-btn sg-btn--small sg-btn--primary"),
        btn("✏️ 名前", "renameMixTemplate", "sg-btn sg-btn--small", `${t.name}の名前を変える`),
        btn("🗑", "deleteMixTemplate", "sg-btn sg-btn--small sg-btn--ghost", `${t.name}を消す`)
      )
      box.appendChild(row)
    })
  }

  templateFromEvent(event) {
    const row = event.currentTarget.closest("[data-template-id]")
    const id = row ? row.dataset.templateId : null
    return (this.mixTemplates || []).find((t) => String(t.id) === id) || null
  }

  async applyMixTemplate(event) {
    const t = this.templateFromEvent(event)
    if (!t || !t.data || !t.data.mix) return
    if (this.mode !== "idle") { this.setStatus("再生・録音が止まってから読み込んでね"); return }
    const d = t.data
    const s = this.editingSection
    const where = s ? `「${this.sectionLabel(s)}」` : "曲全体"
    if (!window.confirm(`「${t.name}」を${where}に当てます。${where}の今のミックスは置きかわります${s ? "" : "（入力ゲイン・ハモリも）"}。よろしいですか？`)) return
    const next = { ...DEFAULT_MIX, ...d.mix, pro: { ...((d.mix && d.mix.pro) || {}) } }
    delete next.preset
    if (!FX_TYPES[next.fx]) next.fx = "none"
    const preset = MIX_PRESETS[d.preset] ? d.preset : "custom"
    if (s) {
      // 部分：響きの長さ・響きの元（曲全体で共通）は入れない
      delete next.reverbLength
      GLOBAL_PRO_KEYS.forEach((k) => { delete next.pro[k] })
      s.settings = next
      s.preset = preset
      this.mixBypass = false
      this.refreshMix()
      this.setStatus(`📋 「${t.name}」を${where}に当てました。▶試聴で確かめてね（入力ゲイン・ハモリは曲全体のままです）`)
      return
    }
    this.mix = next
    this.mixPreset = preset
    this.mixBypass = false
    this.refreshMix()
    const notes = []
    const g = Number(d.inputGainDb)
    if (Number.isFinite(g) && this.hasInputGainTarget && g !== (this.inputGainDb || 0)) {
      this.inputGainTarget.value = String(Math.max(-12, Math.min(12, Math.round(g))))
      await this.changeInputGain()
      notes.push(`入力ゲイン ${g > 0 ? "+" : ""}${g}dB`)
    }
    if (Array.isArray(d.harmony) && d.harmony.length && this.harmony) {
      const h = this.harmony
      const now = Date.now()
      h.tracks = d.harmony.filter(Boolean).map((x, i) => ({
        id: `h${now}${i}`,
        name: String(x.name || `ハモリ${i + 1}`).slice(0, 30),
        interval: isValidInterval(x.interval) ? x.interval : "up3",
        range: { type: "all" }, // 範囲はテンプレートに入れていないので、曲全体
        gain: Number.isFinite(x.gain) ? x.gain : 0.7,
        pan: Number.isFinite(x.pan) ? x.pan : 0,
        enabled: x.enabled !== false
      }))
      h.selectedId = h.tracks[0] ? h.tracks[0].id : null
      h.trackSeq = h.tracks.length + 1
      this.harmonyLastDraw = null
      this.renderHarmonyTracks()
      if (h.tracks.some((x) => x.enabled) && this.vocalBuffer) await this.buildAutoHarmony({ quiet: true })
      this.updateHarmonyControls()
      notes.push(`ハモリ${h.tracks.length}本（範囲は曲全体）`)
    }
    this.setStatus(`📋 「${t.name}」を曲全体に当てました${notes.length ? `（${notes.join("・")}も）` : ""}。▶試聴で確かめてね`)
  }

  async renameMixTemplate(event) {
    const t = this.templateFromEvent(event)
    if (!t) return
    const name = (window.prompt("テンプレートの新しい名前", t.name) || "").trim().slice(0, 40)
    if (!name || name === t.name) return
    if (t.local) {
      this.writeLocalMixTemplates(this.readLocalMixTemplates().map((x) => (x.id === t.id ? { ...x, name, updatedAt: Date.now() } : x)))
    } else {
      try {
        await srvUpdateMixTemplate(t.id, { name })
      } catch (e) {
        this.setStatus(`✏️ 名前を変えられませんでした：${e.message || e}`)
        return
      }
    }
    this.setStatus(`✏️ テンプレートの名前を「${name}」にしました`)
    await this.loadMixTemplates()
  }

  async deleteMixTemplate(event) {
    const t = this.templateFromEvent(event)
    if (!t) return
    if (!window.confirm(`テンプレート「${t.name}」を消しますか？（今の曲のミックスは変わりません）`)) return
    if (t.local) {
      this.writeLocalMixTemplates(this.readLocalMixTemplates().filter((x) => x.id !== t.id))
    } else {
      try {
        await srvDeleteMixTemplate(t.id)
      } catch (e) {
        this.setStatus(`🗑 消せませんでした：${e.message || e}`)
        return
      }
    }
    this.setStatus(`🗑 テンプレート「${t.name}」を消しました`)
    await this.loadMixTemplates()
  }

  // ---------- 💾 プロジェクト保存（K24 → K39・11/10） ----------
  // アカウント（サーバー）に自動保存する。ほかの端末からも続きができる（N1・N2 は 11/10 に廃止）。
  // サーバーにつながらない・ログインが切れたときは、この端末のブラウザ（IndexedDB）に一時保存して、つながったら送り直す。
  // 音は「元の音」だけ保存して、ノイズ消し・キー変更などは開くときに計算し直す（保存を小さくするため）

  initProjects() {
    this.projectId = null
    this.projectName = ""
    this.projectCreatedAt = null
    this.audioKeys = new WeakMap()   // AudioBuffer → 保存した key
    this.savedAudioKeys = new Set()  // もうサーバーに保存してある音の key
    this.localAudioKeys = new Set()  // もうこの端末（IndexedDB）に一時保存してある音の key
    this.audioSeq = 1
    this.projectSavedFp = null       // 前に保存したときの中身（同じなら保存しない）
    this.projectSaving = false
    this.projectRestoring = false
    this.pendingServer = false       // サーバーに送れていない変更がある（この端末に一時保存した）
    this.localCopy = false           // この端末にも同じプロジェクトの一時保存がある（サーバーに送れたら消す）
    this.openSource = "server"       // 開いたプロジェクトの場所（"server" か "local"）
    this.openFiles = null            // サーバーのプロジェクトのファイルの URL（key → url）
    this.savedMvImage = null         // サーバーに送った MV の背景の画像（同じなら送り直さない）
    this.autosaveTimer = setInterval(() => this.autosave(), 4000)
    this.onPageHide = () => { this.autosave({ force: true }) }
    window.addEventListener("pagehide", this.onPageHide)
    this.updateProjectInfo("💾 オケか歌声を入れると、あなたのアカウントに自動で保存されます（ほかの端末からも続きができます・ほかの人には見えません）")
    this.showResume()
  }

  stopProjects() {
    clearInterval(this.autosaveTimer)
    if (this.onPageHide) window.removeEventListener("pagehide", this.onPageHide)
  }

  updateProjectInfo(text) {
    if (this.hasProjectInfoTarget) this.projectInfoTarget.textContent = text
  }

  formatDate(ts) {
    const d = new Date(ts)
    const two = (n) => String(n).padStart(2, "0")
    return `${d.getMonth() + 1}/${d.getDate()} ${two(d.getHours())}:${two(d.getMinutes())}`
  }

  defaultProjectName() {
    const base = (this.mv && this.mv.title) || this.backingFileName || "歌ってみた"
    return `${base}（${this.formatDate(Date.now())}）`
  }

  // サーバーの一覧＋この端末にだけある一時保存（まだ送れていないもの・前の版でブラウザに保存したもの）
  async loadProjectList() {
    let server = []
    this.serverListError = null
    try {
      server = (await srvListProjects()).filter((p) => (p.kind || "singing") === "singing").map((p) => ({ ...p, source: "server" }))
    } catch (e) {
      console.error(e)
      this.serverListError = e
    }
    let local = []
    if (storeSupported()) {
      try { local = (await listProjects("singing")).map((p) => ({ ...p, source: "local" })) } catch (e) { console.error(e) }
    }
    const ids = new Set(server.map((p) => p.id))
    return [...server, ...local.filter((p) => !ids.has(p.id))].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  }

  // 開いたとき：前のプロジェクトがあれば「続きから／新しく始める」を出す
  async showResume() {
    let fresh = false
    try {
      fresh = window.sessionStorage.getItem("kotobouquet.singing.fresh") === "1"
      window.sessionStorage.removeItem("kotobouquet.singing.fresh")
    } catch (e) {}
    const list = await this.loadProjectList()
    await this.renderProjectList(list)
    if (fresh || !list.length || !this.hasProjectResumeTarget) return
    const p = list[0]
    const el = this.projectResumeTarget
    const text = document.createElement("span")
    text.textContent = `💾 前の続きがあります：「${p.name}」（${this.formatDate(p.updatedAt)}${p.source === "local" ? "・この端末だけ" : ""}）`
    const open = document.createElement("button")
    open.type = "button"
    open.className = "sg-btn sg-btn--primary"
    open.textContent = "▶ 続きから"
    open.dataset.action = "singing-mixer#openProject"
    open.dataset.projectId = p.id
    open.dataset.projectSource = p.source
    const fresh2 = document.createElement("button")
    fresh2.type = "button"
    fresh2.className = "sg-btn sg-btn--ghost"
    fresh2.textContent = "🆕 新しく始める"
    fresh2.dataset.action = "singing-mixer#dismissResume"
    el.replaceChildren(text, open, fresh2)
    el.hidden = false
  }

  dismissResume() {
    if (this.hasProjectResumeTarget) this.projectResumeTarget.hidden = true
  }

  async renderProjectList(list = null) {
    if (!this.hasProjectListTarget) return
    if (!list) list = await this.loadProjectList()
    const rows = list.map((p) => {
      const row = document.createElement("div")
      row.className = `sg-project${p.id === this.projectId ? " is-current" : ""}`
      const name = document.createElement("span")
      name.className = "sg-project__name"
      name.textContent = `${p.id === this.projectId ? "▶ " : ""}${p.name}`
      const meta = document.createElement("span")
      meta.className = "sg-help"
      meta.textContent = `${this.formatDate(p.updatedAt)}・${formatBytes(p.bytes || 0)}${p.source === "local" ? "・📱この端末だけ（開くとアカウントに送ります）" : "・☁ アカウント"}`
      const open = document.createElement("button")
      open.type = "button"
      open.className = "sg-btn sg-btn--small"
      open.textContent = "開く"
      open.dataset.action = "singing-mixer#openProject"
      open.dataset.projectId = p.id
      open.dataset.projectSource = p.source || "server"
      open.disabled = p.id === this.projectId
      const del = document.createElement("button")
      del.type = "button"
      del.className = "sg-btn sg-btn--small sg-btn--ghost"
      del.textContent = "🗑"
      del.title = "このプロジェクトを消す"
      del.dataset.action = "singing-mixer#deleteProjectItem"
      del.dataset.projectId = p.id
      del.dataset.projectSource = p.source || "server"
      row.append(name, meta, open, del)
      return row
    })
    const foot = document.createElement("p")
    foot.className = "sg-help"
    foot.textContent = `${list.length ? `${list.length}件` : "まだ保存したプロジェクトはありません"}。☁ はアカウントに保存（ほかの端末からも開けます・1つ ${formatBytes(SERVER_MAX_BYTES)} まで）${this.serverListError ? `。⚠ いまサーバーの一覧を読めませんでした（${this.serverListError.message}）` : ""}`
    this.projectListTarget.replaceChildren(...rows, foot)
  }

  // 保存用の形にする：AudioBuffer は保存した音の key に置きかえる
  packValue(v, refs) {
    if (typeof AudioBuffer !== "undefined" && v instanceof AudioBuffer) return { __audio: this.audioRef(v, refs) }
    if (Array.isArray(v)) return v.map((x) => this.packValue(x, refs))
    if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
      const o = {}
      Object.entries(v).forEach(([k, x]) => { if (typeof x !== "function") o[k] = this.packValue(x, refs) })
      return o
    }
    if (typeof v === "function") return undefined
    return v
  }

  audioRef(buf, refs) {
    let key = this.audioKeys.get(buf)
    if (!key || !key.startsWith(`${this.projectId}:`)) {
      key = `${this.projectId}:a${this.audioSeq++}`
      this.audioKeys.set(buf, key)
    }
    if (!refs.used.has(key)) {
      refs.used.add(key)
      if (refs.bufs) refs.bufs.set(key, buf)
      if (!this.savedAudioKeys.has(key)) refs.fresh.push([key, buf])
    }
    return key
  }

  collectState(refs) {
    const P = (v) => this.packValue(v, refs)
    const mv = this.mv ? {
      template: this.mv.template, dim: this.mv.dim, title: this.mv.title, artist: this.mv.artist, credit: this.mv.credit,
      ratio: this.mv.ratio, karaoke: this.mv.karaoke, bgKey: this.mv.bgKey, gradientId: this.mv.gradient ? this.mv.gradient.id : null,
      bgSrc: this.mv.bgSrc || null, bgSrcs: this.mv.bgSrcs || null, anim: this.mv.anim || null,
      edit: this.mvEditForSave() // 🎬 もっと編集（K40）
    } : null
    return {
      v: 1,
      backing: this.backingOriginal ? P(this.backingOriginal) : null,
      backingKey: this.backingKey, backingRate: this.backingRate, backingFileName: this.backingFileName || "",
      vocal: this.vocalBase ? {
        noiseSource: P(this.vocalNoiseSource), base: P(this.vocalBase), noiseRange: this.noiseRange,
        takes: P(this.takes), edits: P(this.edits)
      } : null,
      vocalOffsetMs: this.vocalOffsetMs, recommendedOffsetMs: this.recommendedOffsetMs, autoInfo: this.autoInfo,
      lastLatencySec: this.lastLatencySec, useRaw: this.useRaw,
      denoise: this.hasDenoiseStrengthTarget ? Number(this.denoiseStrengthTarget.value) : null,
      keyFollow: this.hasKeyFollowTarget ? this.keyFollowTarget.checked : false,
      mix: P(this.mix), mixPreset: this.mixPreset, sections: P(this.sections), pins: P(this.pins),
      lyrics: P(this.lyrics || []), lyricsText: this.hasLyricsTextTarget ? this.lyricsTextTarget.value : "",
      mv, mvImage: this.mv && this.mv.bgKey === "file" && this.mvImageFile ? this.mvImageFile : null,
      mvFiles: this.mvFilesForSave(), // 🎬 切りかえる背景・ロゴの手元の画像（K40）
      harmony: this.harmonyForSave ? P(this.harmonyForSave()) : null
    }
  }

  // 🎬 もっと編集（K40）の保存用。画像そのものは mvFiles に分けて入れる
  mvEditForSave() {
    if (!this.mv) return null
    const e = this.mvEdit
    return {
      ...e,
      slides: e.slides.map((s) => {
        const c = { ...s, anchor: { ...(s.anchor || { type: "time", sec: 0 }) } }
        if (c.file) delete c.thumb // その場で作った URL は保存しない
        return c
      }),
      telops: e.telops.map((t) => ({ ...t })),
      filterParts: { ...(e.filterParts || {}) },
      range: e.range ? { ...e.range } : null,
      logo: { ...e.logo, hasImage: !!this.mvLogoFile }
    }
  }

  mvFilesForSave() {
    if (!this.mv) return null
    const out = {}
    this.mvEdit.slides.forEach((s) => {
      const f = s.file && this.mvSlideFiles ? this.mvSlideFiles.get(s.id) : null
      if (f) out[s.id] = f
    })
    if (this.mvLogoFile) out.logo = this.mvLogoFile
    return Object.keys(out).length ? out : null
  }

  // 自動保存：4秒ごとに中身を見て、変わっていれば保存（録音・書き出し・処理中はあとで）
  // アカウント（サーバー）へ保存 → だめならこの端末に一時保存して、あとで送り直す（K39）
  async autosave({ force = false } = {}) {
    if (this.projectSaving || this.projectRestoring) return
    if (!force && !["idle", "playing"].includes(this.mode)) return
    if (!this.backingOriginal && !this.vocalBase) return
    if (!this.projectId) {
      this.projectId = newProjectId()
      this.projectCreatedAt = Date.now()
      if (!this.projectName) this.projectName = this.defaultProjectName()
      if (this.hasProjectNameTarget) this.projectNameTarget.value = this.projectName
    }
    const refs = { used: new Set(), fresh: [], bufs: new Map() }
    let state
    try {
      state = this.collectState(refs)
    } catch (e) {
      console.error(e)
      return
    }
    const fp = JSON.stringify(state, (k, v) => (typeof Blob !== "undefined" && v instanceof Blob ? `blob:${v.size}:${v.name || ""}` : v)) + this.projectName
    if (fp === this.projectSavedFp && !refs.fresh.length && !this.pendingServer) return
    // つながらなかったあとは、30秒ごとにだけ送り直す（毎回待たされないように）
    if (!force && this.pendingServer && fp === this.projectSavedFp && Date.now() - (this.serverRetryAt || 0) < 30000) return
    this.projectSaving = true
    if (this.hasProjectSaveButtonTarget) this.projectSaveButtonTarget.disabled = true
    let ok = false
    try {
      const bytes = await this.saveToServer(state, refs)
      this.pendingServer = false
      this.projectSavedFp = fp
      ok = true
      if (this.localCopy && storeSupported()) {
        try { await deleteProject(this.projectId) } catch (e) { console.error(e) } // 送れたので、この端末の一時保存は消す
        this.localCopy = false
        this.localAudioKeys = new Set()
      }
      this.updateProjectInfo(`💾 アカウントに自動保存しました（${this.formatDate(Date.now())}・${formatBytes(bytes)}）`)
      this.renderProjectList()
    } catch (e) {
      console.error(e)
      if (e && e.tooLarge) {
        this.projectSavedFp = fp // 同じ中身でくり返し送らない（何か変えたらまた試す）
        this.updateProjectInfo(`⚠ ${e.message}。使っていない録り直し・編集・ハモリの録音を消すか、短いオケにしてね（いまの状態はアカウントに保存されていません）`)
      } else {
        this.serverRetryAt = Date.now()
        const saved = await this.saveToLocal(state, refs)
        this.pendingServer = true
        if (saved) this.projectSavedFp = fp
        const why = e && e.auth ? "ログインが切れているので" : "サーバーにつながらないので"
        this.updateProjectInfo(saved
          ? `⚠ ${why}、この端末に一時保存しました（${this.formatDate(Date.now())}）。つながったら自動でアカウントに送ります`
          : `⚠ 保存できませんでした（${e && e.message ? e.message : "サーバーにもこの端末にも保存できません"}）`)
        if (saved) this.renderProjectList()
      }
    }
    this.projectSaving = false
    if (this.hasProjectSaveButtonTarget) this.projectSaveButtonTarget.disabled = false
    return ok
  }

  // ☁ アカウントに保存：まだ送っていない音だけ送る → 中身（設定・歌詞など）→ 使っていないファイルを消す。合計の大きさを返す
  async saveToServer(state, refs) {
    this.audioBytes = this.audioBytes || new Map()
    const keep = [...refs.used]
    let st = state
    // ④MV の背景に使った手元の画像（Blob）もファイルとして送る
    if (typeof Blob !== "undefined" && state.mvImage instanceof Blob) {
      const key = `${this.projectId}:mvimage`
      if (this.savedMvImage !== state.mvImage) {
        await srvPutFile(this.projectId, key, state.mvImage)
        this.savedMvImage = state.mvImage
      }
      st = { ...state, mvImage: { __file: key, type: state.mvImage.type || "image/png" } }
      keep.push(key)
    }
    // 🎬 もっと編集（K40）：切りかえる背景・ロゴの手元の画像も、ファイルとして送る
    if (state.mvFiles && typeof state.mvFiles === "object") {
      this.savedMvFiles = this.savedMvFiles || new Map()
      const files = {}
      for (const [id, blob] of Object.entries(state.mvFiles)) {
        if (!(typeof Blob !== "undefined" && blob instanceof Blob)) continue
        const key = `${this.projectId}:mv${String(id).replace(/[^A-Za-z0-9]/g, "").slice(0, 36)}`
        if (this.savedMvFiles.get(key) !== blob) {
          await srvPutFile(this.projectId, key, blob)
          this.savedMvFiles.set(key, blob)
        }
        files[id] = { __file: key, type: blob.type || "image/png" }
        keep.push(key)
      }
      st = { ...st, mvFiles: files }
    }
    // 大きさは先に見る（サーバーでも確かめる）
    let total = 0
    refs.used.forEach((k) => { total += this.audioBytes.get(k) || 0 })
    const need = [...refs.used].filter((k) => !this.savedAudioKeys.has(k))
    let i = 0
    for (const key of need) {
      const blob = packAudioRecord(encodeAudioBuffer(refs.bufs.get(key)))
      if (!this.audioBytes.has(key)) total += blob.size
      this.audioBytes.set(key, blob.size)
      if (total > SERVER_MAX_BYTES) {
        throw new ServerError(`1つのプロジェクトで保存できるのは ${formatBytes(SERVER_MAX_BYTES)} までです（いま ${formatBytes(total)}）`, { status: 413, tooLarge: true })
      }
      i++
      const label = `💾 アカウントに送っています…（音 ${i}/${need.length}・${formatBytes(blob.size)}`
      this.updateProjectInfo(`${label}）`)
      await srvPutFile(this.projectId, key, blob, (pct) => this.updateProjectInfo(`${label}・${pct}%）`))
      this.savedAudioKeys.add(key)
    }
    await srvPutProject({
      id: this.projectId, kind: "singing", name: this.projectName || this.defaultProjectName(),
      createdAt: this.projectCreatedAt || Date.now(), state: st, audioKeys: [...refs.used], audioSeq: this.audioSeq
    })
    await srvPruneFiles(this.projectId, keep) // もう使っていない音（作り直した声など）は消す
    let bytes = 0
    refs.used.forEach((k) => { bytes += this.audioBytes.get(k) || 0 })
    return bytes
  }

  // 📱 この端末に一時保存（サーバーに送れなかったとき）。次に送れたら消す
  async saveToLocal(state, refs) {
    if (!storeSupported()) return false
    try {
      this.audioBytes = this.audioBytes || new Map()
      for (const key of refs.used) {
        if (this.localAudioKeys.has(key)) continue
        const rec = encodeAudioBuffer(refs.bufs.get(key))
        await putAudio(key, rec)
        this.localAudioKeys.add(key)
        if (!this.audioBytes.has(key)) this.audioBytes.set(key, rec.bytes)
      }
      let bytes = 0
      refs.used.forEach((k) => { bytes += this.audioBytes.get(k) || 0 })
      await putProject({
        id: this.projectId, kind: "singing", name: this.projectName || this.defaultProjectName(),
        createdAt: this.projectCreatedAt || Date.now(), updatedAt: Date.now(),
        state, audioKeys: [...refs.used], bytes, audioSeq: this.audioSeq, pendingServer: true
      })
      await deleteAudioExcept(this.projectId, [...refs.used])
      this.localCopy = true
      askPersist()
      return true
    } catch (e) {
      console.error(e)
      return false
    }
  }

  async saveProjectNow() {
    this.projectSavedFp = null
    if (!this.backingOriginal && !this.vocalBase) { this.setStatus("💾 保存するものがまだありません（オケか歌声を入れてね）"); return }
    const ok = await this.autosave({ force: true })
    this.setStatus(ok ? "💾 アカウントに保存しました（ほかの端末からも続きができます）" : "💾 アカウントには保存できませんでした（上の 💾 の表示を見てね）")
  }

  renameProject() {
    this.projectName = this.projectNameTarget.value.trim() || this.defaultProjectName()
    this.autosave({ force: true })
  }

  async newProject() {
    if (!window.confirm("今の作業は自動保存されています（💾 プロジェクト一覧から開けます）。\n新しく始めますか？")) return
    await this.autosave({ force: true })
    try { window.sessionStorage.setItem("kotobouquet.singing.fresh", "1") } catch (e) {}
    window.location.reload()
  }

  async deleteProjectItem(event) {
    const id = event.currentTarget.dataset.projectId
    const source = event.currentTarget.dataset.projectSource || "server"
    if (!id || !window.confirm("このプロジェクトを消しますか？（元に戻せません）")) return
    try {
      if (source === "server") await srvDeleteProject(id)
      if (storeSupported()) { try { await deleteProject(id) } catch (e) { console.error(e) } } // この端末の一時保存も消す
      if (id === this.projectId) {
        // 今のプロジェクトを消した：次の自動保存では新しいプロジェクトとして保存し直す
        this.projectId = null
        this.projectSavedFp = null
        this.savedAudioKeys = new Set()
        this.localAudioKeys = new Set()
        this.savedMvImage = null
        this.savedMvFiles = new Map()
        this.localCopy = false
        this.pendingServer = false
      }
      this.setStatus("🗑 プロジェクトを消しました")
    } catch (e) {
      console.error(e)
      this.setStatus(`プロジェクトを消せませんでした（${e.message || e}）`)
    }
    this.renderProjectList()
  }

  // 保存した形 → 元に戻す（音の key は読み込んで AudioBuffer に）
  async unpackValue(v, cache) {
    if (v && typeof v === "object" && typeof v.__audio === "string") return this.loadAudioKey(v.__audio, cache)
    if (Array.isArray(v)) {
      const out = []
      for (const x of v) out.push(await this.unpackValue(x, cache))
      return out
    }
    if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
      const o = {}
      for (const [k, x] of Object.entries(v)) o[k] = await this.unpackValue(x, cache)
      return o
    }
    return v
  }

  async loadAudioKey(key, cache) {
    if (cache.has(key)) return cache.get(key)
    let rec = null
    if (this.openSource === "server") {
      // ☁ アカウントのファイルを読む（K39）
      const url = this.openFiles && this.openFiles[key]
      if (url) { try { rec = unpackAudioRecord(await srvFetchFile(url)) } catch (e) { console.error(e) } }
    } else {
      rec = await getAudio(key)
    }
    const buf = rec ? decodeAudioRecord(this.ctx, rec) : null
    if (buf) {
      this.audioKeys.set(buf, key)
      if (this.openSource === "server") this.savedAudioKeys.add(key)
      else this.localAudioKeys.add(key)
      this.audioBytes = this.audioBytes || new Map()
      this.audioBytes.set(key, rec.bytes || 0)
    }
    cache.set(key, buf)
    return buf
  }

  // ▶ 続きから／開く
  async openProject(event) {
    const id = event?.currentTarget?.dataset?.projectId
    const source = event?.currentTarget?.dataset?.projectSource || "server"
    if (!id || this.mode !== "idle" || this.projectRestoring) return
    if (this.projectId && this.projectId !== id) await this.autosave({ force: true })
    this.ensureContext()
    try { await this.ctx.resume() } catch (e) {}
    this.dismissResume()
    this.projectRestoring = true
    this.setMode("processing")
    this.setStatus("💾 プロジェクトを開いています…（音を読み込んで、ノイズ消しなどを計算し直します）")
    await new Promise((resolve) => setTimeout(resolve, 30))
    try {
      // ☁ アカウント（サーバー）か、📱 この端末の一時保存か（K39）
      let p
      if (source === "local") {
        p = await getProject(id)
        this.openFiles = null
      } else {
        p = await srvGetProject(id)
        this.openFiles = (p && p.files) || {}
      }
      if (!p) throw new Error("プロジェクトが見つかりません")
      this.openSource = source
      this.localCopy = source === "local"
      this.pendingServer = source === "local" // この端末だけのものは、開いたらアカウントに送る
      const st = p.state || {}
      const cache = new Map()
      this.projectId = p.id
      this.projectName = p.name
      this.projectCreatedAt = p.createdAt
      this.savedAudioKeys = new Set()
      this.localAudioKeys = new Set()
      this.savedMvImage = null
      this.savedMvFiles = new Map()
      this.audioSeq = Math.max(p.audioSeq || 1, ...(p.audioKeys || []).map((k) => Number(String(k).split(":a")[1]) + 1 || 1))
      if (this.hasProjectNameTarget) this.projectNameTarget.value = this.projectName

      // オケ（キー・速さは計算し直す）
      const backing = st.backing ? await this.unpackValue(st.backing, cache) : null
      this.backingFileName = st.backingFileName || ""
      this.backingOriginal = backing
      this.backingKey = st.backingKey || 0
      this.backingRate = st.backingRate || 1
      this.pendingKey = this.backingKey
      if (this.hasTempoSliderTarget) this.tempoSliderTarget.value = String(Math.round(this.backingRate * 100))
      this.backingBuffer = backing
      if (backing && (this.backingKey !== 0 || Math.abs(this.backingRate - 1) > 1e-6)) {
        this.setStatus("💾 オケのキー・速さを計算し直しています…")
        await new Promise((resolve) => setTimeout(resolve, 20))
        this.backingBuffer = changeKeyTempo(this.ctx, backing, { semitones: this.backingKey, rate: this.backingRate })
      }
      this.backingPeaks = this.backingBuffer ? waveformPeaks(this.backingBuffer, 1000) : null
      this.mixView = null
      if (this.backingBuffer) this.analyzeBacking()

      // 歌声（録り直し・編集・ノイズ消しは計算し直す）
      const vo = st.vocal ? await this.unpackValue(st.vocal, cache) : null
      this.stop()
      this.vocalNoiseSource = vo ? vo.noiseSource : null
      this.vocalBase = vo ? vo.base : null
      this.noiseRange = vo ? vo.noiseRange : null
      this.takes = (vo && vo.takes) || []
      this.edits = (vo && vo.edits) || []
      this.editSel = null
      this.editZoom = null
      this.viewCenterSec = null
      this.clearPunch()
      this.lastLatencySec = st.lastLatencySec ?? null
      this.useRaw = !!st.useRaw
      if (this.hasDenoiseStrengthTarget && Number.isFinite(st.denoise)) {
        this.denoiseStrengthTarget.value = String(st.denoise)
        this.updateDenoiseValue()
      }
      if (this.hasKeyFollowTarget) this.keyFollowTarget.checked = !!st.keyFollow
      this.setOffset(st.vocalOffsetMs || 0)
      this.recommendedOffsetMs = st.recommendedOffsetMs ?? null
      this.autoInfo = st.autoInfo || "なし"
      this.voiceSegCache = null
      await this.rebuildVocal()

      // ミックス・部分・ピン・歌詞
      this.mix = { ...DEFAULT_MIX, ...(st.mix || {}) }
      if (st.mixPreset) this.mixPreset = st.mixPreset
      this.sections = st.sections || []
      this.editId = null
      this.mixSel = null
      this.refreshMix({ save: false })
      this.pins = st.pins || []
      this.pinId = null
      this.renderPins()
      this.lyrics = st.lyrics || []
      this.lyricsBackup = null
      this.lyricSel = null
      if (this.hasLyricsTextTarget) this.lyricsTextTarget.value = st.lyricsText || ""
      this.renderLyricList()
      // MV の背景に使った手元の画像：アカウントのものは { __file: key } で入っている（K39）
      let mvImage = st.mvImage
      if (mvImage && typeof mvImage === "object" && mvImage.__file) {
        const url = this.openFiles && this.openFiles[mvImage.__file]
        const type = mvImage.type || "image/png"
        mvImage = null
        if (url) { try { mvImage = new Blob([await srvFetchFile(url)], { type }) } catch (e) { console.error(e) } }
        if (mvImage) this.savedMvImage = mvImage
      }
      await this.restoreMv(st.mv, mvImage)
      // 🎬 もっと編集（K40）：切りかえる背景・ロゴの手元の画像（アカウントのものは { __file: key }）
      const mvFiles = {}
      if (st.mvFiles && typeof st.mvFiles === "object") {
        for (const [id, v] of Object.entries(st.mvFiles)) {
          let blob = v
          if (v && typeof v === "object" && v.__file) {
            blob = null
            const url = this.openFiles && this.openFiles[v.__file]
            if (url) { try { blob = new Blob([await srvFetchFile(url)], { type: v.type || "image/png" }) } catch (e) { console.error(e) } }
            if (blob) this.savedMvFiles.set(v.__file, blob)
          }
          if (typeof Blob !== "undefined" && blob instanceof Blob) mvFiles[id] = blob
        }
      }
      await this.restoreMvEdit(st.mv ? st.mv.edit : null, mvFiles)
      if (st.harmony && this.restoreHarmony) await this.restoreHarmony(await this.unpackValue(st.harmony, cache))

      this.updateMixZoomControls()
      this.updateKeyTempoControls()
      this.updateOffsetDisplay()
      this.updateSectionControls()
      this.projectSavedFp = null
      const missing = [...cache.values()].filter((b) => !b).length
      this.setStatus(`💾「${this.projectName}」を開きました${missing ? `（⚠ 音が${missing}つ読み込めませんでした）` : ""}。続きからどうぞ`)
    } catch (e) {
      console.error(e)
      this.setStatus(`💾 プロジェクトを開けませんでした（${e.message || e}）`)
    }
    this.projectRestoring = false
    this.setMode("idle")
    this.renderProjectList()
  }

  async restoreMv(mv, imageBlob) {
    if (!mv || !this.mv) return
    try {
      Object.assign(this.mv, {
        template: MV_TEMPLATES[mv.template] ? mv.template : this.mv.template,
        dim: Number.isFinite(mv.dim) ? mv.dim : this.mv.dim,
        title: mv.title || "", artist: mv.artist || this.mv.artist, credit: mv.credit || "",
        ratio: MV_RATIOS[mv.ratio] ? mv.ratio : this.mv.ratio,
        karaoke: mv.karaoke !== false
      })
      if (mv.anim) this.mv.anim = { ...(this.mv.anim || {}), ...mv.anim }
      if (this.hasMvTitleTarget) this.mvTitleTarget.value = this.mv.title
      if (this.hasMvArtistTarget) this.mvArtistTarget.value = this.mv.artist
      if (this.hasMvCreditTarget) this.mvCreditTarget.value = this.mv.credit
      if (this.hasMvDimTarget) this.mvDimTarget.value = String(Math.round(this.mv.dim * 100))
      if (this.hasKaraokeTarget) this.karaokeTarget.checked = this.mv.karaoke
      this.applyMvRatio()
      if (mv.bgKey === "file" && imageBlob) {
        if (this.mvObjectUrl) URL.revokeObjectURL(this.mvObjectUrl)
        this.mvObjectUrl = URL.createObjectURL(imageBlob)
        const img = await this.loadImage(this.mvObjectUrl)
        Object.assign(this.mv, { image: img, colors: pickColors(img), bgCredit: "", bgKey: "file", bgSrcs: null })
        this.mvImageFile = imageBlob
      } else if (mv.bgSrc) {
        const img = await this.loadImage((mv.bgSrcs && mv.bgSrcs[this.mv.ratio]) || mv.bgSrc)
        Object.assign(this.mv, { image: img, colors: pickColors(img), bgCredit: "", bgKey: mv.bgKey, bgSrcs: mv.bgSrcs, bgSrc: mv.bgSrc })
      } else if (mv.gradientId) {
        const gr = MV_GRADIENTS.find((x) => x.id === mv.gradientId) || MV_GRADIENTS[0]
        Object.assign(this.mv, { image: null, gradient: gr, colors: gradientColors(gr), bgCredit: "", bgKey: mv.bgKey || `g:${gr.id}`, bgSrcs: null })
      }
    } catch (e) {
      console.error(e)
    }
    if (this.updateMvAnimControls) this.updateMvAnimControls()
    this.updateMvControls()
  }

  // 🎬 もっと編集（K40）を開いたプロジェクトから戻す。files＝{ スライドの id | "logo": 画像の Blob }
  async restoreMvEdit(edit, files = {}) {
    if (!this.mv) return
    const e = normalizeMvEdit(edit || null)
    if (!edit) e.logo = { ...this.mvEdit.logo } // 前の版のプロジェクト：ロゴはこの端末の値のまま
    this.mv.edit = e
    this.mvSlideImages = new Map()
    this.mvSlideFiles = new Map()
    for (const s of e.slides) {
      try {
        if (s.file) {
          const f = files[s.id]
          if (!f) continue
          this.mvSlideFiles.set(s.id, f)
          s.thumb = URL.createObjectURL(f)
          this.mvSlideImages.set(s.id, await this.loadImage(s.thumb))
        } else if (s.src) {
          this.mvSlideImages.set(s.id, await this.loadImage((s.srcs && s.srcs[this.mv.ratio]) || s.src))
        }
      } catch (err) {
        console.error(err)
      }
    }
    this.mvLogoImage = null
    this.mvLogoFile = null
    if (files.logo) {
      try {
        this.mvLogoFile = files.logo
        if (this.mvLogoUrl) URL.revokeObjectURL(this.mvLogoUrl)
        this.mvLogoUrl = URL.createObjectURL(files.logo)
        this.mvLogoImage = await this.loadImage(this.mvLogoUrl)
      } catch (err) {
        console.error(err)
      }
    }
    this.mvAnchorSig = null
    this.renderMvEdit()
  }

  // ---------- 🎤 歌詞のタイムライン（K27） ----------
  // 波形の上に、歌詞の行をブロックで並べる。真ん中をつかむ＝移動、左右の端＝始まり／終わりを伸び縮み。
  // 手で動かした行は 🔒固定 になる（🪄で合わせ直しても動かない目印・K35 案1）

  get lyricRange() {
    const len = this.timelineLength
    if (!this.lyricView) return { startSec: 0, endSec: len }
    const span = Math.max(Math.min(2, len), Math.min(len, this.lyricView.endSec - this.lyricView.startSec))
    const start = Math.max(0, Math.min(len - span, this.lyricView.startSec))
    return { startSec: start, endSec: start + span }
  }

  setLyricView(a, b) {
    const len = this.timelineLength
    this.lyricView = { startSec: a, endSec: b }
    const r = this.lyricRange
    this.lyricView = r.endSec - r.startSec >= len - 0.01 ? null : r
    this.updateLyricZoomInfo()
  }

  zoomLyricBy(k, center = null) {
    const r = this.lyricRange
    const span = r.endSec - r.startSec
    const c = center ?? (r.startSec + span / 2)
    const ratio = (c - r.startSec) / span
    const ns = span / k
    this.setLyricView(c - ratio * ns, c - ratio * ns + ns)
  }

  zoomLyricIn() {
    const now = this.songNow
    const r = this.lyricRange
    this.zoomLyricBy(2, now !== null && now >= r.startSec && now <= r.endSec ? now : null)
  }

  zoomLyricOut() { this.zoomLyricBy(0.5) }
  zoomLyricAll() { this.setLyricView(0, this.timelineLength) }

  updateLyricZoomInfo() {
    if (!this.hasLyricZoomInfoTarget) return
    const r = this.lyricRange
    this.lyricZoomInfoTarget.textContent = this.lyricView
      ? `${this.formatSec(r.startSec)}〜${this.formatSec(r.endSec)}（×${(this.timelineLength / (r.endSec - r.startSec)).toFixed(1)}）`
      : "全体を表示中"
  }

  lyricTimeAt(event) {
    const rect = this.lyricTimelineTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left))
    const r = this.lyricRange
    return r.startSec + (x / rect.width) * (r.endSec - r.startSec)
  }

  // 画面の 1px が何秒か
  get lyricPxSec() {
    const rect = this.hasLyricTimelineTarget ? this.lyricTimelineTarget.getBoundingClientRect() : { width: 1000 }
    const r = this.lyricRange
    return (r.endSec - r.startSec) / Math.max(1, rect.width)
  }

  // 時間が決まっている行のブロック（時間順・終わりは表示と同じ決め方）
  lyricBlocks() {
    const timed = this.timedLyrics
    const out = []
    ;(this.lyrics || []).forEach((l, i) => {
      if (l.startSec === null) return
      const t = timed.find((x) => x.startSec === l.startSec && x.text === l.text)
      out.push({ i, l, startSec: l.startSec, endSec: t ? t.endSec : l.startSec + 1 })
    })
    return out.sort((a, b) => a.startSec - b.startSec)
  }

  // 押した所に何があるか：ブロックの端（start/end）か真ん中（move）
  lyricHit(event) {
    const t = this.lyricTimeAt(event)
    const grab = (event.pointerType === "touch" ? 16 : 8) * this.lyricPxSec
    const blocks = this.lyricBlocks()
    for (const b of blocks) {
      if (Math.abs(t - b.startSec) <= grab) return { b, part: "start" }
      if (Math.abs(t - b.endSec) <= grab) return { b, part: "end" }
    }
    const inside = blocks.find((b) => t > b.startSec && t < b.endSec)
    return inside ? { b: inside, part: "move" } : null
  }

  // 吸い付く先：📍ピン・声の始まり／終わり・ほかの行の端（🧲が ON のとき・Alt で外す）
  lyricSnap(sec, event, exclude) {
    const on = !this.hasSnapBeatTarget || this.snapBeatTarget.checked
    if (!on || (event && event.altKey)) return sec
    const cands = []
    ;(this.pins || []).forEach((p) => cands.push(p.sec))
    ;(this.voiceSegmentsSong() || []).forEach((s) => { cands.push(s.start, s.end) })
    this.lyricBlocks().forEach((b) => { if (b.i !== exclude) cands.push(b.startSec, b.endSec) })
    if (!cands.length) return sec
    const best = cands.reduce((a, b) => (Math.abs(b - sec) < Math.abs(a - sec) ? b : a))
    return Math.abs(best - sec) <= 8 * this.lyricPxSec ? best : sec
  }

  lyricTimelineDown(event) {
    if (!this.lyrics?.length || this.mode !== "idle" && this.mode !== "playing") return
    const hit = this.lyricHit(event)
    this.lyricTimelineTarget.setPointerCapture?.(event.pointerId)
    if (!hit) {
      this.lyricSel = null
      this.lyricDrag = { none: true, x: event.clientX }
      this.lyricLastDraw = null
      return
    }
    const blocks = this.lyricBlocks()
    const k = blocks.findIndex((b) => b.i === hit.b.i)
    this.lyricDrag = {
      i: hit.b.i, part: hit.part, x: event.clientX, moved: false, from: this.lyricTimeAt(event),
      orig: { startSec: hit.b.l.startSec, endSec: hit.b.l.endSec, shownEnd: hit.b.endSec },
      prev: blocks[k - 1] || null, next: blocks[k + 1] || null
    }
  }

  lyricTimelineMove(event) {
    const d = this.lyricDrag
    if (!this.hasLyricTimelineTarget) return
    if (!d) {
      // カーソルの形（端＝↔、ブロック＝✋）
      const hit = this.lyrics?.length ? this.lyricHit(event) : null
      this.lyricTimelineTarget.style.cursor = !hit ? "default" : hit.part === "move" ? "grab" : "ew-resize"
      return
    }
    if (d.none) return
    if (!d.moved && Math.abs(event.clientX - d.x) < 6) return // 6px までは「押しただけ」
    d.moved = true
    const l = this.lyrics[d.i]
    const t = this.lyricTimeAt(event)
    const lo = d.prev ? d.prev.startSec + 0.05 : 0
    const hi = d.next ? d.next.startSec - 0.05 : this.timelineLength
    if (d.part === "start") {
      const endNow = l.endSec ?? d.orig.shownEnd
      l.startSec = Math.max(lo, Math.min(endNow - 0.3, this.lyricSnap(t, event, d.i)))
    } else if (d.part === "end") {
      l.endSec = Math.max(l.startSec + 0.3, Math.min(hi, this.lyricSnap(t, event, d.i)))
    } else {
      const len = d.orig.shownEnd - d.orig.startSec
      let s = d.orig.startSec + (t - d.from)
      const snapped = this.lyricSnap(s, event, d.i)
      s = Math.max(lo, Math.min(hi - 0.3, snapped))
      l.startSec = Math.round(s * 100) / 100
      if (d.orig.endSec !== null && d.orig.endSec !== undefined) l.endSec = Math.min(hi, l.startSec + len)
    }
    this.lyricLastDraw = null
  }

  lyricTimelineUp() {
    const d = this.lyricDrag
    this.lyricDrag = null
    if (!d || d.none) { this.lyricLastDraw = null; return }
    const l = this.lyrics[d.i]
    if (!d.moved) {
      // 押しただけ：その行を選んで、一覧でも見えるようにする
      this.lyricSel = d.i
      this.renderLyricList()
      this.lyricListTarget?.querySelector(`[data-lyric-row="${d.i}"]`)?.scrollIntoView?.({ block: "nearest" })
      this.setStatus(`「${l.text}」${this.formatSec(l.startSec)}〜。端をドラッグで伸び縮み、真ん中で移動（▶は一覧から）`)
      return
    }
    l.locked = true
    l.unsure = false
    this.lyricSel = d.i
    this.renderLyricList()
    this.setStatus(`🔒「${l.text}」を ${this.formatSec(l.startSec)}〜${l.endSec ? this.formatSec(l.endSec) : "（自動）"} にしました（固定）。🪄で残りを合わせ直せます`)
  }

  // Ctrl＋ホイール＝拡大・縮小、拡大中のホイール＝横に移動
  lyricWheel(event) {
    const r = this.lyricRange
    const span = r.endSec - r.startSec
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      this.zoomLyricBy(Math.pow(1.0015, -event.deltaY), this.lyricTimeAt(event))
      return
    }
    if (!this.lyricView) return
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (!delta) return
    event.preventDefault()
    const rect = this.lyricTimelineTarget.getBoundingClientRect()
    const shift = (delta / rect.width) * span
    this.setLyricView(r.startSec + shift, r.endSec + shift)
  }

  drawLyricTimeline() {
    if (!this.hasLyricTimelineTarget) return
    const c = this.lyricTimelineTarget
    if (!c.offsetParent) return // 見えていないとき（ステップで別のページ）は描かない
    const now = this.songNow
    // 再生中に画面の外に出たら、ついていく
    if (this.lyricView && now !== null && now >= 0 && !this.lyricDrag) {
      const r0 = this.lyricRange
      if (now > r0.endSec || now < r0.startSec) {
        const span = r0.endSec - r0.startSec
        this.setLyricView(now - span * 0.1, now + span * 0.9)
      }
    }
    const r = this.lyricRange
    const blocks = this.lyricBlocks()
    const key = [c.clientWidth, c.clientHeight, r.startSec, r.endSec, this.lyricSel, this.objId(this.vocalPeaks), this.vocalOffsetMs,
      blocks.map((b) => `${b.startSec},${b.endSec},${b.l.locked ? 1 : 0},${b.l.unsure ? 1 : 0}`).join("|"),
      (this.pins || []).map((p) => `${p.sec},${p.color}`).join("|"), now !== null && now >= 0 ? now : -1].join(";")
    if (key === this.lyricLastDraw) return
    this.lyricLastDraw = key

    const u = this.fitCanvas(c)
    const g = c.getContext("2d")
    const w = c.width
    const h = c.height
    const span = r.endSec - r.startSec
    const toX = (sec) => ((sec - r.startSec) / span) * w
    g.fillStyle = "#0e1a33"
    g.fillRect(0, 0, w, h)
    // 目盛り
    const tick = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60].find((t) => (t / span) * w >= 70 * u) || 60
    g.font = `${10 * u}px sans-serif`
    g.textAlign = "left"
    for (let t = Math.ceil(r.startSec / tick) * tick; t <= r.endSec; t += tick) {
      g.fillStyle = "rgba(255,255,255,0.10)"
      g.fillRect(toX(t), 0, Math.max(1, u), h)
      g.fillStyle = "rgba(255,255,255,0.45)"
      g.fillText(this.formatSec(t), toX(t) + 3 * u, h - 4 * u)
    }
    // 声の波形（下半分）
    const peaks = this.vocalPeaks
    const dur = this.vocalBuffer?.duration
    if (peaks && dur) {
      const off = this.vocalOffsetMs / 1000
      const step = dur / peaks.length
      const mid = h * 0.72
      g.fillStyle = "rgba(79,182,255,0.55)"
      const i0 = Math.max(0, Math.floor((r.startSec - off) / step))
      const i1 = Math.min(peaks.length, Math.ceil((r.endSec - off) / step) + 1)
      for (let i = i0; i < i1; i++) {
        const x = toX(off + i * step)
        const ph = peaks[i] * h * 0.4
        g.fillRect(x, mid - ph / 2, Math.max(1, toX(off + (i + 1) * step) - x), ph)
      }
    }
    // 歌詞のブロック（上半分）
    const top = 8 * u
    const bh = h * 0.38
    g.font = `bold ${12 * u}px sans-serif`
    blocks.forEach((b) => {
      if (b.endSec < r.startSec || b.startSec > r.endSec) return
      const x = toX(b.startSec)
      const bw = Math.max(3 * u, toX(b.endSec) - x)
      const sel = b.i === this.lyricSel
      g.fillStyle = b.l.unsure ? "rgba(255,170,60,0.55)" : b.l.locked ? "rgba(120,220,160,0.50)" : "rgba(140,120,255,0.50)"
      g.fillRect(x, top, bw, bh)
      g.strokeStyle = sel ? "#ffffff" : "rgba(255,255,255,0.35)"
      g.lineWidth = (sel ? 2 : 1) * u
      g.strokeRect(x + u / 2, top + u / 2, bw - u, bh - u)
      // 端のツマミ（つかめる所）
      g.fillStyle = sel ? "#ffffff" : "rgba(255,255,255,0.6)"
      g.fillRect(x, top, 3 * u, bh)
      if (b.l.endSec) g.fillRect(x + bw - 3 * u, top, 3 * u, bh)
      g.save()
      g.beginPath(); g.rect(x, top, bw, bh); g.clip()
      g.fillStyle = "#ffffff"
      g.fillText(`${b.l.locked ? "🔒" : ""}${b.l.unsure ? "⚠" : ""}${b.l.text}`, Math.max(x, 0) + 6 * u, top + bh / 2 + 4 * u)
      g.restore()
    })
    // 📍ピン（K32）も目印に出す
    ;(this.pins || []).forEach((p) => {
      if (p.sec < r.startSec || p.sec > r.endSec) return
      g.fillStyle = "rgba(255,90,90,0.8)"
      g.fillRect(toX(p.sec) - u / 2, 0, Math.max(1, u), h)
    })
    if (now !== null && now >= 0) {
      g.fillStyle = "#ffffff"
      g.fillRect(toX(now) - u, 0, 2 * u, h)
    }
  }

  // ---------- 🧭 ステップで進める（1ページずつ案内する）／🗂 まとめて編集 ----------

  setupFlow() {
    let saved = null
    try { saved = window.localStorage.getItem(FLOW_KEY) } catch (e) {}
    this.flow = saved === "all" ? "all" : "wizard" // はじめての人は、ステップで進めるのがおすすめ
    this.flowStep = 0
    this.applyFlow()
  }

  selectFlow(event) {
    this.flow = event.currentTarget.dataset.flow === "all" ? "all" : "wizard"
    try { window.localStorage.setItem(FLOW_KEY, this.flow) } catch (e) {}
    this.applyFlow()
    this.setStatus(this.flow === "wizard" ? "🧭 ステップで進めます。画面の案内にそって、次へ →" : "🗂 全部の機能を1ページで編集できます")
  }

  goStep(event) {
    const i = Number(event.currentTarget.dataset.step)
    if (!Number.isFinite(i)) return
    this.showStep(i)
  }

  nextStep() {
    const step = FLOW_STEPS[this.flowStep]
    if (step && !this.stepReady(step)) return
    // キーを選んだのに反映していないときは、知らせる（そのまま録音するとオケは元のキー）
    if (step.id === "sg-key" && (this.pendingKey !== this.backingKey || Math.abs(this.pendingRate - this.backingRate) > 1e-6)) {
      this.setStatus("🎹 選んだキー・速さが、まだオケに反映されていません。「🎹 オケに反映する」を押してから次へ進んでね")
      return
    }
    this.showStep(this.flowStep + 1)
  }

  prevStep() {
    this.showStep(this.flowStep - 1)
  }

  // 「音声だけでいい」：動画・歌詞をとばして保存へ
  skipToSave() {
    this.showStep(FLOW_STEPS.findIndex((s) => s.id === "sg-save"))
  }

  showStep(i) {
    this.flowStep = Math.max(0, Math.min(FLOW_STEPS.length - 1, i))
    this.applyFlow()
    if (this.flow === "wizard") window.scrollTo({ top: 0, behavior: "smooth" })
  }

  stepReady(step) {
    if (step.need === "backing") return !!this.backingBuffer
    if (step.need === "vocal") return !!this.vocalBase
    return true
  }

  applyFlow() {
    this.element.dataset.flow = this.flow
    const active = FLOW_STEPS[this.flowStep]
    FLOW_STEPS.forEach((s) => {
      const card = this.element.querySelector(`#${s.id}`)
      if (card) card.classList.toggle("is-active", s === active)
    })
    if (this.hasFlowButtonTarget) {
      this.flowButtonTargets.forEach((el) => el.setAttribute("aria-pressed", String(el.dataset.flow === this.flow)))
    }
    this.renderFlow()
  }

  // 上の「ステップ ◯ / 7」と、下の「← 戻る・次へ →」
  renderFlow() {
    if (!this.hasFlowHeaderTarget || !this.hasFlowNavTarget || this.flow !== "wizard") return
    const i = this.flowStep
    const step = FLOW_STEPS[i]
    const ready = this.stepReady(step)
    const dots = FLOW_STEPS.map((s, k) => {
      const done = k < i
      const cls = k === i ? "is-now" : done ? "is-done" : ""
      return `<button type="button" class="sg-dot ${cls}" data-step="${k}" data-action="singing-mixer#goStep" aria-label="ステップ${k + 1}：${s.short}"${k === i ? ' aria-current="step"' : ""}><span>${done ? "✓" : k + 1}</span><small>${s.short}</small></button>`
    }).join("")
    const html = `
      <div class="sg-dots">${dots}</div>
      <p class="sg-flow__count">ステップ ${i + 1} / ${FLOW_STEPS.length}${step.optional ? "（とばしてもOK）" : ""}</p>
      <h2 class="sg-flow__title">${step.title}</h2>
      <p class="sg-flow__lead">${step.lead}</p>
      <ul class="sg-flow__tips">${step.tips.map((t) => `<li>${t}</li>`).join("")}</ul>`
    if (this.flowHeaderHtml !== html) {
      this.flowHeaderTarget.innerHTML = html
      this.flowHeaderHtml = html
    }
    const next = FLOW_STEPS[i + 1]
    const nav = `
      <button type="button" class="sg-btn" data-action="singing-mixer#prevStep"${i === 0 ? " disabled" : ""}>← 戻る</button>
      ${step.id === "sg-mix" ? '<button type="button" class="sg-btn sg-btn--ghost" data-action="singing-mixer#skipToSave">🎵 音声だけでいい → 保存へ</button>' : ""}
      ${next
        ? `<button type="button" class="sg-btn sg-btn--primary sg-flow__next${ready ? " is-ready" : ""}" data-action="singing-mixer#nextStep"${ready ? "" : " disabled"}>次へ：${next.short} →</button>`
        : '<span class="sg-help">🎉 おつかれさま！ 気になる所はいつでも ← 戻る で直せます</span>'}
      ${ready ? "" : `<p class="sg-help sg-flow__wait">${step.wait}</p>`}`
    if (this.flowNavHtml !== nav) {
      this.flowNavTarget.innerHTML = nav
      this.flowNavHtml = nav
    }
  }

  // ---------- 🎆 おまかせ演出（手順4c） ----------

  // オケから拍（テンポ）と盛り上がりを調べる。オケを入れたとき・キーや速さを変えたときに1回だけ
  async analyzeBacking() {
    if (!this.backingBuffer) return
    this.beatInfo = null
    this.updateFxInfo("🥁 オケのリズムを調べています…")
    await new Promise((resolve) => setTimeout(resolve, 30))
    try {
      this.beatInfo = analyzeBeats(this.backingBuffer)
      this.autoChoruses = suggestChoruses(this.backingBuffer)
    } catch (e) {
      console.error(e)
      this.beatInfo = null
    }
    this.updateFxInfo()
  }

  changeFx() {
    this.fxPrefs = {
      strength: Number(this.fxStrengthTarget.value),
      beat: this.fxBeatTarget.checked,
      chorus: this.fxChorusTarget.checked,
      sparkle: this.fxSparkleTarget.checked,
      byName: { ...((this.fxPrefs && this.fxPrefs.byName) || DEFAULT_PART_STYLES) }
    }
    this.saveMvPrefs()
    this.updateFxInfo()
  }

  // 🪄 部分の名前ごとの演出を変える（K41）
  changeFxNameStyle(event) {
    const name = event.currentTarget.dataset.partName
    const style = event.currentTarget.value
    if (!this.fxPrefs || !name || !MV_PART_STYLES[style]) return
    this.fxPrefs.byName = { ...(this.fxPrefs.byName || DEFAULT_PART_STYLES), [name]: style }
    this.saveMvPrefs()
    this.updateFxInfo()
    this.setStatus(`🎆「${name}」の演出を「${MV_PART_STYLES[style].label}」にしました`)
  }

  resetFxNameStyles() {
    if (!this.fxPrefs) return
    this.fxPrefs.byName = { ...DEFAULT_PART_STYLES }
    this.saveMvPrefs()
    this.updateFxInfo()
    this.setStatus("🎆 部分ごとの演出を最初の組み合わせに戻しました")
  }

  // 部分の名前 → 演出（「サビ2」のように名前を含むものも、長い名前から順に当てる）
  partStyleOf(name) {
    const table = (this.fxPrefs && this.fxPrefs.byName) || DEFAULT_PART_STYLES
    if (!name) return null
    if (table[name] && MV_PART_STYLES[table[name]]) return table[name]
    const key = Object.keys(table).sort((a, b) => b.length - a.length).find((k) => name.includes(k))
    return key && MV_PART_STYLES[table[key]] ? table[key] : null
  }

  // 演出に使う部分：④の部分に名前（イントロ・Aメロ・サビ…）があれば、名前どおりの演出（K41）。
  // 名前の付いた部分が無ければ今までどおり：名前に「サビ」の部分、それも無ければ自動で見つけたサビっぽい所
  get fxSections() {
    const named = (this.sections || [])
      .map((s) => ({ s, style: this.partStyleOf(s.name) }))
      .filter((x) => x.style)
      .map(({ s, style }) => ({
        startSec: s.startSec, endSec: s.endSec, style, name: s.name,
        kind: style === "high" ? "chorus" : style === "calm" ? "calm" : "part"
      }))
    if (named.length) {
      if (named.some((s) => s.kind === "chorus")) return { list: named, from: "names" }
      const extra = (this.autoChoruses || [])
        .filter((r) => !named.some((s) => r.startSec < s.endSec && r.endSec > s.startSec))
        .map((r) => ({ ...r, style: "high", name: "サビ（自動）", kind: "chorus" }))
      return { list: named.concat(extra).sort((a, b) => a.startSec - b.startSec), from: extra.length ? "names+auto" : "names" }
    }
    const mine = (this.sections || [])
      .filter((s) => s.name.includes("サビ"))
      .map((s) => ({ startSec: s.startSec, endSec: s.endSec, kind: s.name === "落ちサビ" ? "calm" : "chorus" }))
    if (mine.some((s) => s.kind === "chorus")) return { list: mine, from: "mix" }
    return { list: mine.concat((this.autoChoruses || []).map((r) => ({ ...r, kind: "chorus" }))), from: "auto" }
  }

  get mvFx() {
    if (!this.fxPrefs || this.fxPrefs.strength <= 0) return null
    const b = this.beatInfo
    return {
      beats: b && b.confidence > 0.05 ? b.beats : [],
      energy: b ? b.energy : null,
      energyHop: b ? b.energyHop : 0.1,
      sections: this.fxSections.list,
      strength: this.fxPrefs.strength / 100,
      beat: this.fxPrefs.beat,
      chorus: this.fxPrefs.chorus,
      sparkle: this.fxPrefs.sparkle
    }
  }

  updateFxInfo(message = null) {
    if (this.hasFxStrengthValueTarget && this.fxPrefs) {
      const v = this.fxPrefs.strength
      this.fxStrengthValueTarget.textContent = v === 0 ? "なし" : v < 35 ? `ひかえめ（${v}）` : v < 70 ? `ふつう（${v}）` : `はで（${v}）`
    }
    this.renderFxNameTable()
    if (!this.hasFxInfoTarget) return
    if (message) { this.fxInfoTarget.textContent = message; return }
    if (!this.backingBuffer) { this.fxInfoTarget.textContent = "オケを入れると、リズムとサビを自動で調べます"; return }
    const b = this.beatInfo
    const beat = b && b.bpm && b.confidence > 0.05 ? `テンポ 約${Math.round(b.bpm)} BPM` : "リズムがはっきりしない曲なので、拍の動きは控えめ"
    const sec = this.fxSections
    if (sec.from === "names" || sec.from === "names+auto") {
      const n = sec.list.filter((s) => s.name !== "サビ（自動）").length
      const extra = sec.from === "names+auto" ? "（サビが無いので、サビっぽい所の目安も足しています）" : ""
      this.fxInfoTarget.textContent = `${beat}・④の部分 ${n}か所の名前どおりに演出します${extra}`
      return
    }
    const choruses = sec.list.filter((s) => s.kind === "chorus").length
    const chorus = choruses
      ? sec.from === "mix" ? `サビ：④で付けた ${choruses}か所` : `サビ：自動で見つけた目安 ${choruses}か所（④で部分を付けると、その名前どおりに演出します）`
      : "サビ：見つかりませんでした（④で「サビ」を付けると盛り上がります）"
    this.fxInfoTarget.textContent = `${beat}・${chorus}`
  }

  // 🪄 部分の名前ごとの演出の表（K41）
  renderFxNameTable() {
    if (!this.hasFxNameTableTarget || !this.fxPrefs) return
    const box = this.fxNameTableTarget
    const table = this.fxPrefs.byName || DEFAULT_PART_STYLES
    const used = new Set((this.sections || []).map((s) => s.name))
    const sig = JSON.stringify([table, [...used].sort()])
    if (box.dataset.sig === sig && box.childElementCount) return // 変わっていなければ作り直さない（選んでいる途中に消えないように）
    box.dataset.sig = sig
    box.replaceChildren()
    Object.keys(DEFAULT_PART_STYLES).forEach((name) => {
      const row = document.createElement("label")
      row.className = "sg-fxname" + (used.has(name) ? " is-used" : "")
      const span = document.createElement("span")
      span.className = "sg-fxname__name"
      span.textContent = name
      const sel = document.createElement("select")
      sel.className = "sg-select sg-select--small"
      sel.dataset.partName = name
      sel.dataset.action = "change->singing-mixer#changeFxNameStyle"
      Object.entries(MV_PART_STYLES).forEach(([key, st]) => {
        const o = document.createElement("option")
        o.value = key
        o.textContent = st.label
        if ((table[name] || DEFAULT_PART_STYLES[name]) === key) o.selected = true
        sel.appendChild(o)
      })
      row.append(span, sel)
      box.appendChild(row)
    })
  }

  get mvScene() {
    const show = (t) => !this.hasMvIntroTarget || t.checked
    return {
      ...this.mv,
      duration: this.duration,
      showIntro: this.hasMvIntroTarget ? show(this.mvIntroTarget) : true,
      showOutro: this.hasMvOutroTarget ? show(this.mvOutroTarget) : true,
      showProgress: this.hasMvProgressTarget ? show(this.mvProgressTarget) : true,
      features: this.mvFeatures,
      lyrics: this.timedLyrics,
      fx: this.mvFx,
      // 🎞 場面転換のきっかけ（K30）：サビ・落ちサビが始まる時間（演出の強さが0でも使う）
      animCuts: ((this.fxSections && this.fxSections.list) || []).map((s) => s.startSec),
      // 🎬 もっと編集（K40）：背景の切りかえ・テロップ・フィルター・範囲・フェード・ロゴ
      ...this.mvEditScene
    }
  }

  // 🎞 MV のアニメーション（K30）：歌詞の出し方・場面転換・背景の動き
  selectMvAnim(event) {
    const kind = event.currentTarget.dataset.animKind
    const value = event.currentTarget.dataset.animValue
    if (!MV_ANIMS[kind] || !MV_ANIMS[kind][value] || !this.mv) return
    this.mv.anim = { ...DEFAULT_MV_ANIM, ...(this.mv.anim || {}), [kind]: value }
    this.saveMvPrefs()
    this.updateMvAnimControls()
    const name = { lyric: "歌詞の出し方", transition: "サビの入りの切りかえ", bg: "背景の動き" }[kind]
    const tip = kind === "transition" && value !== "none" && value !== "flash" ? "（サビ・落ちサビの始まりで動きます。④で「サビ」を付けるとそこで、付けていなければ自動で見つけた所で）" : ""
    this.setStatus(`🎞 ${name}：${MV_ANIMS[kind][value]}${tip}`)
  }

  updateMvAnimControls() {
    if (!this.hasMvAnimPanelTarget || !this.mv) return
    const anim = { ...DEFAULT_MV_ANIM, ...(this.mv.anim || {}) }
    const panel = this.mvAnimPanelTarget
    if (!panel.dataset.built) {
      const title = { lyric: "✍️ 歌詞の出し方", transition: "⚡ サビの入りの切りかえ", bg: "🖼 背景の動き" }
      panel.replaceChildren(...Object.keys(MV_ANIMS).map((kind) => {
        const row = document.createElement("div")
        row.className = "sg-anim__row"
        const label = document.createElement("span")
        label.className = "sg-inline"
        label.textContent = title[kind]
        const chips = document.createElement("div")
        chips.className = "sg-anim__chips"
        Object.entries(MV_ANIMS[kind]).forEach(([value, text]) => {
          const b = document.createElement("button")
          b.type = "button"
          b.className = "sg-chip"
          b.textContent = text
          b.dataset.animKind = kind
          b.dataset.animValue = value
          b.dataset.action = "singing-mixer#selectMvAnim"
          chips.appendChild(b)
        })
        row.append(label, chips)
        return row
      }))
      panel.dataset.built = "1"
    }
    panel.querySelectorAll("[data-anim-kind]").forEach((b) => {
      b.setAttribute("aria-pressed", String(anim[b.dataset.animKind] === b.dataset.animValue))
    })
  }

  // 1コマ描く。再生中は鳴っている音で動かし、止まっているときは見本の形で見せる
  drawMv(g, w, h) {
    const now = this.songNow
    const playing = now !== null && this.analyser
    if (playing) {
      if (!this.mvFreq) {
        this.mvFreq = new Uint8Array(this.analyser.frequencyBinCount)
        this.mvTime = new Uint8Array(this.analyser.fftSize)
      }
      this.mvFeatures = readFeatures(this.analyser, this.mvFeatures, this.mvFreq, this.mvTime)
    } else {
      const n = 64
      const bands = new Float32Array(n)
      for (let i = 0; i < n; i++) bands[i] = 0.12 + 0.45 * Math.pow(1 - i / n, 1.5) * (0.7 + 0.3 * Math.sin(i * 0.9))
      this.mvFeatures = { level: 0.3, bands }
    }
    const t = playing ? Math.max(0, now) : this.mvSeekSec
    renderFrame(g, w, h, t, this.mvScene)
    this.highlightLyricRow(t)
  }

  // MV の絵（録画にも写る）と、波形たち（録画には写らない）をずっと描き続ける
  drawWaveform() {
    const canvas = this.canvasTarget
    const g = canvas.getContext("2d")

    const draw = () => {
      try {
        this.drawMv(g, canvas.width, canvas.height)
      } catch (e) {
        console.error(e)
      }
      this.drawTimeline()
      this.drawOffsetView()
      this.drawMixTimeline()
      this.drawEditView()
      this.drawLyricTimeline()
      this.drawHarmonyGuide()
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
