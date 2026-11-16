import { Controller } from "@hotwired/stimulus"
import { DETTYAN_SPRITE, drawDettyan } from "dettyan_sprite"
import { DettyanStore } from "dettyan_save"
import { DettyanSound } from "dettyan_sound"

// 🧑‍💼 Dettyan 育成ゲーム（土台）：事務所の部屋の中を Dettyan がちょこちょこ歩く
// セーブは dettyan_save.js、音は dettyan_sound.js。仕様は docs/dettyan/requirements.md

const W = 128 // 部屋の大きさ（ドット）
const H = 96
const FLOOR_TOP = 46 // 足がここより下を歩く
const FLOOR_BOTTOM = 92
const SPRITE_W = DETTYAN_SPRITE[0].length
const SPRITE_H = DETTYAN_SPRITE.length
const SPEED = 16 // 1秒に進むドット
const STEP_SEC = 0.22 // 足を入れかえる間かく

const LINES = ["なに？", "きょうも がんばろ", "じゅんさい たべたいな", "事務所、もっと大きくしたいね", "SiVA は げんきかな"]

export default class extends Controller {
  static targets = ["canvas", "start", "startText", "startNote", "money", "genki", "gokigen", "soundButton", "soundPanel", "bgmToggle", "seToggle", "bubble"]
  static values = { userId: Number }

  connect() {
    this.store = new DettyanStore({ userId: this.userIdValue })
    this.sound = new DettyanSound()
    this.ready = false
    this.started = false

    const c = this.canvasTarget
    c.width = W
    c.height = H
    this.g = c.getContext("2d")
    this.room = drawRoom()
    this.chara = { x: W / 2, y: 74, tx: W / 2, ty: 74, mode: "idle", until: 1.5, stepT: 0, frame: 0, blink: 0, nextBlink: 3 }

    this.last = performance.now()
    this.loop = (now) => {
      const dt = Math.min(0.1, (now - this.last) / 1000)
      this.last = now
      this.tick(dt)
      this.draw()
      this.raf = requestAnimationFrame(this.loop)
    }
    this.raf = requestAnimationFrame(this.loop)

    this.onHide = () => this.saveOnLeave()
    this.onVisibility = () => { if (document.hidden) this.saveOnLeave() }
    window.addEventListener("pagehide", this.onHide)
    document.addEventListener("visibilitychange", this.onVisibility)

    this.store.load({ onCache: (s) => this.renderHud(s) }).then((s) => this.afterLoad(s))
  }

  disconnect() {
    cancelAnimationFrame(this.raf)
    clearTimeout(this.bubbleTimer)
    window.removeEventListener("pagehide", this.onHide)
    document.removeEventListener("visibilitychange", this.onVisibility)
    this.saveOnLeave()
    this.sound.destroy()
  }

  afterLoad(state) {
    this.ready = true
    this.renderHud(state)
    this.renderSoundButtons()
    this.sound.setBgm(state.settings.bgm)
    this.sound.setSe(state.settings.se)
    const soundOn = state.settings.bgm || state.settings.se
    if (soundOn) {
      // 音が出る人には「はじめる」画面で先に知らせる（iPhone はタップするまで音を出せないので、ここでタップしてもらう）
      this.startTextTarget.textContent = "タップしてはじめる"
      this.startNoteTarget.hidden = false
    } else {
      // 前に🔇にした人は、注意を出さずに音なしではじめる
      this.begin()
    }
  }

  // 「はじめる」画面をタップ
  start() {
    if (!this.ready || this.started) return
    this.sound.unlock()
    this.sound.se("tap")
    this.begin()
  }

  begin() {
    this.started = true
    this.startTarget.hidden = true
    this.sound.playSong("office")
    this.store.update((s) => {
      s.settings.soundAsked = true
      s.lastSeenAt = this.store.now()
    })
  }

  saveOnLeave() {
    if (!this.started) return
    this.store.update((s) => { s.lastSeenAt = this.store.now() })
    this.store.flush({ keepalive: true })
  }

  // ---- 動き ----
  tick(dt) {
    const ch = this.chara
    ch.nextBlink -= dt
    if (ch.blink > 0) ch.blink -= dt
    if (ch.nextBlink <= 0) {
      ch.blink = 0.14
      ch.nextBlink = 2.5 + Math.random() * 3
    }
    if (!this.started) return

    if (ch.mode === "walk") {
      const dx = ch.tx - ch.x
      const dy = ch.ty - ch.y
      const dist = Math.hypot(dx, dy)
      if (dist < 0.5) {
        ch.mode = "idle"
        ch.frame = 0
        ch.until = 1 + Math.random() * 2.5
        return
      }
      const move = Math.min(dist, SPEED * dt)
      ch.x += (dx / dist) * move
      ch.y += (dy / dist) * move
      ch.stepT += dt
      if (ch.stepT >= STEP_SEC) {
        ch.stepT = 0
        ch.frame = 1 - ch.frame
        this.sound.se("step")
      }
    } else {
      ch.until -= dt
      if (ch.until <= 0) {
        if (ch.mode === "look") this.hideBubble()
        this.walkTo(12 + Math.random() * (W - 24), FLOOR_TOP + 2 + Math.random() * (FLOOR_BOTTOM - FLOOR_TOP - 4))
      }
    }
  }

  walkTo(x, y) {
    const ch = this.chara
    ch.tx = Math.max(SPRITE_W / 2, Math.min(W - SPRITE_W / 2, x))
    ch.ty = Math.max(FLOOR_TOP, Math.min(FLOOR_BOTTOM, y))
    ch.mode = "walk"
  }

  draw() {
    const g = this.g
    const ch = this.chara
    g.drawImage(this.room, 0, 0)
    const left = Math.round(ch.x - SPRITE_W / 2)
    const top = Math.round(ch.y - SPRITE_H) - (ch.frame === 1 ? 1 : 0)
    // かげ
    g.fillStyle = "rgba(0, 0, 0, 0.18)"
    g.fillRect(Math.round(ch.x) - 6, Math.round(ch.y) - 1, 12, 2)
    drawDettyan(g, left, top, { eyes: ch.blink > 0 ? "blink" : "open", frame: ch.frame })
  }

  // ---- タップ ----
  tap(event) {
    if (!this.started) return
    const rect = this.canvasTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * W
    const y = ((event.clientY - rect.top) / rect.height) * H
    const ch = this.chara
    const hit = x >= ch.x - SPRITE_W / 2 - 2 && x <= ch.x + SPRITE_W / 2 + 2 && y >= ch.y - SPRITE_H - 2 && y <= ch.y + 2
    if (hit) {
      // Dettyan をタップ：止まってこっちを向く（おせわのメニューは次の段階で）
      ch.mode = "look"
      ch.frame = 0
      ch.until = 2.8
      this.sound.se("talk")
      this.say(LINES[Math.floor(Math.random() * LINES.length)])
    } else if (y >= FLOOR_TOP - 4) {
      // 床をタップ：そこまで歩いていく
      this.hideBubble()
      this.walkTo(x, y)
    }
  }

  say(text) {
    const b = this.bubbleTarget
    const ch = this.chara
    b.textContent = text
    b.style.left = `${(ch.x / W) * 100}%`
    b.style.top = `${((ch.y - SPRITE_H - 2) / H) * 100}%`
    b.hidden = false
    clearTimeout(this.bubbleTimer)
    this.bubbleTimer = setTimeout(() => this.hideBubble(), 2600)
  }

  hideBubble() {
    if (this.hasBubbleTarget) this.bubbleTarget.hidden = true
  }

  // ---- 表示 ----
  renderHud(s) {
    this.moneyTarget.textContent = s.money.toLocaleString()
    this.genkiTarget.style.width = `${clamp(s.stats.genki)}%`
    this.gokigenTarget.style.width = `${clamp(s.stats.gokigen)}%`
  }

  // ---- 音の設定（🔊） ----
  toggleSoundPanel() {
    this.soundPanelTarget.hidden = !this.soundPanelTarget.hidden
  }

  toggleBgm() {
    if (!this.ready) return
    const on = !this.store.state.settings.bgm
    this.store.update((s) => { s.settings.bgm = on })
    this.sound.unlock() // ボタンのタップで音を出せるようになる
    this.sound.setBgm(on)
    this.renderSoundButtons()
  }

  toggleSe() {
    if (!this.ready) return
    const on = !this.store.state.settings.se
    this.store.update((s) => { s.settings.se = on })
    this.sound.unlock()
    this.sound.setSe(on)
    this.sound.se("tap")
    this.renderSoundButtons()
  }

  renderSoundButtons() {
    const { bgm, se } = this.store.state.settings
    this.bgmToggleTarget.textContent = `🎵 BGM：${bgm ? "オン" : "オフ"}`
    this.bgmToggleTarget.setAttribute("aria-pressed", String(bgm))
    this.seToggleTarget.textContent = `🔔 こうかおん：${se ? "オン" : "オフ"}`
    this.seToggleTarget.setAttribute("aria-pressed", String(se))
    this.soundButtonTarget.textContent = bgm || se ? "🔊" : "🔇"
  }
}

function clamp(v) {
  return Math.max(0, Math.min(100, Number(v) || 0))
}

// 事務所の部屋（はじめに1回だけ描いておく）
function drawRoom() {
  const c = document.createElement("canvas")
  c.width = W
  c.height = H
  const g = c.getContext("2d")
  const rect = (color, x, y, w, h) => { g.fillStyle = color; g.fillRect(x, y, w, h) }

  // かべ（たてじま）
  rect("#e9dcc0", 0, 0, W, 40)
  for (let x = 0; x < W; x += 8) rect("#e1d1b0", x, 0, 4, 40)
  rect("#8a5a33", 0, 38, W, 3) // はばき
  // ゆか（板）
  rect("#c08a55", 0, 41, W, H - 41)
  for (let y = 47; y < H; y += 7) rect("#a8743f", 0, y, W, 1)
  for (let y = 41, row = 0; y < H; y += 7, row++) {
    for (let x = (row % 2) * 12; x < W; x += 24) rect("#a8743f", x, y, 1, 7)
  }
  // まど
  rect("#5e3a1f", 12, 8, 30, 22)
  rect("#9fd6ff", 14, 10, 26, 18)
  rect("#ffffff", 18, 13, 7, 2)
  rect("#ffffff", 30, 18, 5, 2)
  rect("#5e3a1f", 26, 10, 2, 18)
  // ポスター（KB）
  rect("#3a2a6b", 56, 8, 16, 20)
  rect("#ff5fa2", 58, 10, 12, 8)
  rect("#ffe066", 58, 20, 12, 2)
  rect("#4fb6ff", 58, 24, 8, 2)
  // つくえと PC
  rect("#6e4423", 86, 26, 34, 4)
  rect("#5e3a1f", 88, 30, 3, 16)
  rect("#5e3a1f", 115, 30, 3, 16)
  rect("#2b2b35", 96, 14, 16, 11)
  rect("#4fb6ff", 98, 16, 12, 7)
  rect("#2b2b35", 103, 25, 2, 1)
  // かんようしょくぶつ
  rect("#8a5a33", 4, 40, 8, 7)
  rect("#3f9a52", 3, 30, 4, 10)
  rect("#55b866", 7, 27, 4, 13)
  rect("#3f9a52", 10, 32, 3, 8)
  return c
}
