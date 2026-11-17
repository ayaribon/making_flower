// 🎵 Dettyan 育成ゲームの音（BGM・SE）。音のファイルは使わず、Web Audio でチップチューン風に作る
// iPhone はタップするまで音を出せないので、unlock() はタップの中で呼ぶ
// 曲はすべてこのゲームのために作ったオリジナル

const NOTE_INDEX = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 }

function freq(note) {
  const m = /^([A-G]#?)(\d)$/.exec(note)
  if (!m) return 0
  const midi = (Number(m[2]) + 1) * 12 + NOTE_INDEX[m[1]]
  return 440 * Math.pow(2, (midi - 69) / 12)
}

// 曲：tempo（1分の拍）、melody / bass は [音, 拍の長さ]。"-" は休み
export const SONGS = {
  // 🏢 事務所（のんびり）
  office: {
    tempo: 104,
    melody: [
      ["C5", .5], ["E5", .5], ["G5", 1], ["E5", .5], ["G5", .5], ["A5", 1],
      ["G5", 1.5], ["E5", .5], ["C5", 1], ["D5", 1],
      ["E5", .5], ["F5", .5], ["G5", 1], ["A5", .5], ["G5", .5], ["E5", 1],
      ["D5", 2], ["-", 2],
      ["F5", .5], ["A5", .5], ["C6", 1], ["A5", .5], ["G5", .5], ["F5", 1],
      ["E5", .5], ["G5", .5], ["C6", 1], ["G5", 1], ["E5", 1],
      ["D5", .5], ["E5", .5], ["F5", 1], ["E5", .5], ["D5", .5], ["B4", 1],
      ["C5", 2], ["-", 2]
    ],
    // 1小節ごとのコードの根音（ベースは 根音・5度・オクターブ上・5度 の4分音符）
    bassRoots: ["C3", "A2", "C3", "G2", "F2", "C3", "G2", "C3"]
  },
  // ⚔️ モンスター退治の結果（少し速い）
  battle: {
    tempo: 152,
    melody: [
      ["A4", .5], ["C5", .5], ["E5", .5], ["A5", .5], ["G5", .5], ["E5", .5], ["C5", .5], ["E5", .5],
      ["F5", .5], ["E5", .5], ["D5", .5], ["C5", .5], ["B4", 1], ["E5", 1],
      ["A4", .5], ["C5", .5], ["E5", .5], ["A5", .5], ["B5", .5], ["A5", .5], ["G5", .5], ["E5", .5],
      ["F5", .5], ["G5", .5], ["A5", .5], ["G5", .5], ["E5", 1], ["-", 1],
      ["D5", .5], ["F5", .5], ["A5", .5], ["D6", .5], ["C6", .5], ["A5", .5], ["F5", .5], ["A5", .5],
      ["E5", .5], ["G5", .5], ["B5", .5], ["E6", .5], ["D6", 1], ["B5", 1],
      ["C6", .5], ["B5", .5], ["A5", .5], ["G5", .5], ["F5", .5], ["E5", .5], ["D5", .5], ["B4", .5],
      ["A4", 1.5], ["-", .5], ["E4", .5], ["A4", .5], ["-", 1]
    ],
    bassRoots: ["A2", "F2", "A2", "E2", "D2", "E2", "F2", "A2"]
  }
}

function bassLine(roots) {
  const out = []
  for (const r of roots) {
    const f = freq(r)
    out.push([f, 1], [f * 1.5, 1], [f * 2, 1], [f * 1.5, 1])
  }
  return out
}

export class DettyanSound {
  constructor() {
    this.ctx = null
    this.bgmOn = true
    this.seOn = true
    this.song = null
    this.timer = null
    this.stepFlip = false
    this.onVisibility = () => {
      if (!this.ctx) return
      if (document.hidden) this.ctx.suspend()
      else this.ctx.resume()
    }
  }

  // タップの中で呼ぶ。2回目からは何もしない
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume()
      return
    }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    this.ctx = new AC()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.5
    this.master.connect(this.ctx.destination)
    this.bgmGain = this.ctx.createGain()
    this.bgmGain.gain.value = this.bgmOn ? 0.35 : 0
    this.bgmGain.connect(this.master)
    this.seGain = this.ctx.createGain()
    this.seGain.gain.value = 0.6
    this.seGain.connect(this.master)
    // iPhone のマナーモードでも鳴らせるように、無音を1回鳴らしておく
    const buf = this.ctx.createBuffer(1, 1, 22050)
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.connect(this.ctx.destination)
    src.start(0)
    document.addEventListener("visibilitychange", this.onVisibility)
    if (this.song) this.startLoop()
  }

  setBgm(on) {
    this.bgmOn = on
    if (this.bgmGain) this.bgmGain.gain.setTargetAtTime(on ? (this.ducked ? 0.12 : 0.35) : 0, this.ctx.currentTime, 0.05)
  }

  setSe(on) {
    this.seOn = on
  }

  // 歌っている間は BGM を小さくする（Dettyan の歌が聞こえるように）
  duck(on) {
    this.ducked = on
    if (this.bgmGain) this.bgmGain.gain.setTargetAtTime(this.bgmOn ? (on ? 0.12 : 0.35) : 0, this.ctx.currentTime, 0.2)
  }

  // ---- BGM ----
  playSong(name) {
    const song = SONGS[name]
    if (!song || this.songName === name) return
    this.songName = name
    this.song = {
      beat: 60 / song.tempo,
      tracks: [
        { notes: song.melody.map(([n, len]) => [n === "-" ? 0 : freq(n), len]), type: "square", vol: 0.16, gate: 0.85 },
        { notes: bassLine(song.bassRoots), type: "triangle", vol: 0.32, gate: 0.7 }
      ]
    }
    if (this.ctx) this.startLoop()
  }

  stopSong() {
    this.songName = null
    this.song = null
    clearInterval(this.timer)
    this.timer = null
  }

  // 少し先まで音を予約していく（setInterval だけだとずれるため）
  startLoop() {
    clearInterval(this.timer)
    const start = this.ctx.currentTime + 0.1
    this.cursors = this.song.tracks.map(() => ({ i: 0, t: start }))
    this.timer = setInterval(() => this.schedule(), 25)
    this.schedule()
  }

  schedule() {
    if (!this.song || !this.ctx) return
    const ahead = this.ctx.currentTime + 0.15
    this.song.tracks.forEach((track, k) => {
      const c = this.cursors[k]
      // タブを裏にしていたなどで遅れたら、今に合わせる
      if (c.t < this.ctx.currentTime - 0.5) c.t = this.ctx.currentTime + 0.05
      while (c.t < ahead) {
        const [f, len] = track.notes[c.i]
        const dur = len * this.song.beat
        if (f) this.tone(this.bgmGain, track.type, f, c.t, dur * track.gate, track.vol)
        c.t += dur
        c.i = (c.i + 1) % track.notes.length
      }
    })
  }

  tone(dest, type, f, t, dur, vol, slideTo = null) {
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(f, t)
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.005)
    g.gain.setValueAtTime(vol, t + Math.max(0.006, dur - 0.03))
    g.gain.linearRampToValueAtTime(0, t + dur)
    o.connect(g)
    g.connect(dest)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  noise(t, dur, vol) {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur))
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
    const src = this.ctx.createBufferSource()
    const g = this.ctx.createGain()
    g.gain.value = vol
    src.buffer = buf
    src.connect(g)
    g.connect(this.seGain)
    src.start(t)
  }

  // ---- SE ----
  se(name) {
    if (!this.ctx || !this.seOn) return
    const t = this.ctx.currentTime + 0.01
    const out = this.seGain
    switch (name) {
      case "step": // ちょこちょこ歩く「ぺたぺた」（左右で少し高さを変える）
        this.stepFlip = !this.stepFlip
        this.tone(out, "triangle", this.stepFlip ? 330 : 294, t, 0.05, 0.25, 180)
        break
      case "coin": // チャリン
        this.tone(out, "square", 988, t, 0.07, 0.18)
        this.tone(out, "square", 1319, t + 0.07, 0.22, 0.18)
        break
      case "eat": // もぐもぐ
        for (let i = 0; i < 3; i++) this.tone(out, "square", 220 + i * 30, t + i * 0.13, 0.07, 0.15, 160)
        break
      case "buy": // かう
        ;["C6", "E6", "G6"].forEach((n, i) => this.tone(out, "square", freq(n), t + i * 0.06, 0.08, 0.14))
        break
      case "happy": // よろこぶ
        ;["G5", "C6", "E6", "G6"].forEach((n, i) => this.tone(out, "square", freq(n), t + i * 0.08, 0.1, 0.13))
        break
      case "talk": // 話す「ぽっ」
        this.tone(out, "square", 660, t, 0.06, 0.12, 880)
        break
      case "hit": // 攻撃
        this.noise(t, 0.12, 0.35)
        this.tone(out, "square", 200, t, 0.1, 0.15, 60)
        break
      case "levelup": // レベルアップ
        ;["C5", "E5", "G5", "C6", "G5", "C6"].forEach((n, i) => this.tone(out, "square", freq(n), t + i * 0.09, 0.12, 0.14))
        break
      case "pet": // なでる「ふわっ」
        this.tone(out, "triangle", 523, t, 0.12, 0.2, 784)
        this.tone(out, "triangle", 659, t + 0.12, 0.14, 0.18, 988)
        break
      case "sweep": // そうじ「さっさっ」
        this.noise(t, 0.08, 0.2)
        this.noise(t + 0.14, 0.08, 0.2)
        break
      case "no": // できない「ぶぶっ」
        this.tone(out, "square", 180, t, 0.08, 0.12)
        this.tone(out, "square", 150, t + 0.1, 0.12, 0.12)
        break
      case "tap": // ボタン
        this.tone(out, "square", 1046, t, 0.04, 0.1)
        break
      case "type": // PC のキーボード「カタッ」（小さく）
        this.noise(t, 0.025, 0.07)
        this.tone(out, "square", 1800 + Math.random() * 600, t, 0.02, 0.025)
        break
      case "sing": { // Dettyan が歌う（事務所の BGM と同じ ハ長調の5つの音から、短いフレーズ）
        const scale = ["C5", "D5", "E5", "G5", "A5", "C6"]
        let i = Math.floor(Math.random() * 3) + 1
        for (let k = 0; k < 4; k++) {
          i = Math.max(0, Math.min(scale.length - 1, i + Math.floor(Math.random() * 3) - 1))
          const f = freq(scale[i])
          const len = k === 3 ? 0.42 : 0.2
          const at = t + k * 0.22
          this.tone(out, "triangle", f * 0.985, at, len, 0.22, f)
        }
        break
      }
    }
  }

  destroy() {
    this.stopSong()
    document.removeEventListener("visibilitychange", this.onVisibility)
    if (this.ctx) this.ctx.close()
    this.ctx = null
  }
}
