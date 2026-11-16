// 🎤 ドット絵の歌う子（▶ 試聴しているあいだだけ、再生バーの右上に出てくる）
// 鳴っている音の大きさで口が動いて、体がはずんで、音符がふわっと出る。
// 画面の飾りだけ（MV の絵や書き出しには入らない）。音のつなぎ方は変えない（AnalyserNode を読むだけ）。
// 指でなぞると運べる。たたくとぴょんとはねて、10回たたくと「じゃま？」（けすと、ログインし直すまで出ない）

import { SINGER_SPRITE, drawBuddy, drawDangling, drawShape, PIXEL_SHAPES, BuddyHandle, buddyHidden } from "pixel_buddy"

const NOTE_COLORS = ["#ff7ab6", "#5ec8ff", "#ffd84a", "#9b7bff"]

const W = 34 // 絵の大きさ（ドット）
const H = 30
const BODY_X = 7
const BODY_Y = 11

export class PixelSinger {
  constructor(canvas) {
    this.canvas = canvas
    // 再生バー（backdrop-filter つき）の中だと、指で運んだときに画面に固定できないので、body の直下に置く
    this.bar = canvas.closest(".sg-transport")
    if (canvas.parentElement !== document.body) document.body.appendChild(canvas)
    canvas.width = W
    canvas.height = H
    this.g = canvas.getContext("2d")
    this.analyser = null
    this.buf = null
    this.level = 0
    this.notes = []
    this.nextNote = 0
    this.raf = null
    this.active = false
    this.hideTimer = null
    this.reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    this.tick = this.tick.bind(this)
    this.hopAt = -1
    this.handle = new BuddyHandle(canvas, {
      name: "singer",
      onTap: () => { this.hopAt = performance.now() },
      onHide: () => this.setPlaying(false)
    })
  }

  // ▶ 再生が始まった／止まった
  setPlaying(on, analyser) {
    if (on && buddyHidden("singer")) on = false // 「けす」を選んだら、ログインし直すまで出ない
    if (on) {
      this.analyser = analyser || null
      if (this.analyser && (!this.buf || this.buf.length !== this.analyser.fftSize)) this.buf = new Uint8Array(this.analyser.fftSize)
      clearTimeout(this.hideTimer)
      if (this.active) return
      this.active = true
      // 運んでいなければ、再生バーのすぐ上の右すみ
      if (!this.canvas.classList.contains("is-moved")) this.canvas.style.bottom = `${Math.max(0, (this.bar ? this.bar.offsetHeight : 90) - 3)}px`
      this.canvas.hidden = false
      this.canvas.classList.remove("is-leaving")
      // 次のコマで付けると、出てくるときの動き（CSS）が毎回ちゃんと動く
      requestAnimationFrame(() => { if (this.active) this.canvas.classList.add("is-on") })
      this.notes = []
      this.start = performance.now()
      if (!this.raf) this.raf = requestAnimationFrame(this.tick)
    } else {
      if (!this.active) return
      this.active = false
      this.canvas.classList.remove("is-on")
      this.canvas.classList.add("is-leaving")
      clearTimeout(this.hideTimer)
      this.hideTimer = setTimeout(() => {
        if (this.active) return
        this.canvas.hidden = true
        this.canvas.classList.remove("is-leaving")
        if (this.raf) cancelAnimationFrame(this.raf)
        this.raf = null
      }, 400)
    }
  }

  destroy() {
    if (this.handle) this.handle.destroy()
    clearTimeout(this.hideTimer)
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = null
  }

  // いま鳴っている音の大きさ（0〜1）
  readLevel() {
    if (!this.active || !this.analyser || !this.buf) return 0
    this.analyser.getByteTimeDomainData(this.buf)
    let s = 0
    for (let i = 0; i < this.buf.length; i += 4) { const v = (this.buf[i] - 128) / 128; s += v * v }
    return Math.min(1, Math.sqrt(s / (this.buf.length / 4)) * 3.2)
  }

  tick(now) {
    this.raf = requestAnimationFrame(this.tick)
    const t = (now - (this.start || now)) / 1000
    const lv = this.readLevel()
    // 大きくなるのは速く、小さくなるのはゆっくり（口がパクパクしすぎないように）
    this.level = lv > this.level ? this.level * 0.4 + lv * 0.6 : this.level * 0.75 + lv * 0.25
    const singing = this.level > 0.05

    // 音符：歌っているあいだ、ときどき出る
    if (singing && !this.reduced && t >= this.nextNote) {
      this.notes.push({ born: t, x: BODY_X + 18 + (this.notes.length % 2), color: NOTE_COLORS[Math.floor(t * 7) % NOTE_COLORS.length], drift: (Math.floor(t * 10) % 2) ? 1 : -1 })
      this.nextNote = t + 0.45 + (1 - Math.min(1, this.level * 2)) * 0.5
    }
    this.notes = this.notes.filter((n) => t - n.born < 1.6)

    const g = this.g
    g.clearRect(0, 0, W, H)

    // 体：歌っているあいだは、ぴょこぴょこはずむ
    let bob = singing && !this.reduced && Math.floor(t / 0.3) % 2 === 0 ? 1 : 0
    // たたかれたら、ぴょんとはねる
    const hop = (now - this.hopAt) / 1000
    if (this.hopAt >= 0 && hop < 0.35) bob = Math.round(Math.sin((hop / 0.35) * Math.PI) * 5)
    const mouth = this.level > 0.22 ? 2 : singing ? 1 : 0
    const blink = (t % 3.2) > 3.05
    // ✋ 運ばれている間は、つままれてじたばた
    if (this.handle && this.handle.dragging) drawDangling(g, SINGER_SPRITE, BODY_X, BODY_Y - 2, t)
    else drawBuddy(g, SINGER_SPRITE, BODY_X, BODY_Y - bob, { mouth, eyes: blink ? "blink" : "open" })

    // 音符（上にふわっと上がって、消える）
    this.notes.forEach((n) => {
      const a = (t - n.born) / 1.6
      const nx = Math.round(n.x + Math.sin(a * 5) * 2 * n.drift)
      const ny = Math.round(BODY_Y + 2 - a * 13)
      g.globalAlpha = 1 - a * a
      drawShape(g, PIXEL_SHAPES.note, nx, ny, n.color)
      g.globalAlpha = 1
    })
  }
}
