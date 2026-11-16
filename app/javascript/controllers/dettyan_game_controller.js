import { Controller } from "@hotwired/stimulus"
import { DETTYAN_SPRITE, drawDettyan } from "dettyan_sprite"
import { DettyanStore } from "dettyan_save"
import { DettyanSound } from "dettyan_sound"
import { FOODS, findFood, foodGokigen, drawFood } from "dettyan_foods"
import { applyIdle, claimDailyReward, doCare, buyFood, feedFood, dirtCount } from "dettyan_care"

// 🧑‍💼 Dettyan 育成ゲーム：事務所の部屋の中を Dettyan がちょこちょこ歩く。タップでおせわ、ショップでごはん
// セーブは dettyan_save.js、音は dettyan_sound.js、ごはんの表は dettyan_foods.js、おせわの計算は dettyan_care.js
// 仕様は docs/dettyan/requirements.md

const W = 128 // 部屋の大きさ（ドット）
const H = 96
const FLOOR_TOP = 46 // 足がここより下を歩く
const FLOOR_BOTTOM = 92
const SPRITE_W = DETTYAN_SPRITE[0].length
const SPRITE_H = DETTYAN_SPRITE.length
const SPEED = 16 // 1秒に進むドット
const STEP_SEC = 0.22 // 足を入れかえる間かく

const IDLE_TICK_MS = 60 * 1000 // 遊んでいる間も1分ごとに放置の計算をする
const MENU_SEC = 7 // おせわのメニューを出している間、Dettyan は止まっている
const EAT_SEC = 1.5
// ほこりの場所（そうじするまで、床に1つずつ増える）
const DIRT_SPOTS = [[24, 60], [100, 82], [64, 88], [110, 56], [36, 80]]

export default class extends Controller {
  static targets = ["canvas", "start", "startText", "startNote", "money", "genki", "gokigen", "soundButton", "soundPanel", "bgmToggle", "seToggle", "bubble",
    "menu", "sheet", "sheetTitle", "sheetMoney", "sheetList", "toast"]
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
    this.chara = { x: W / 2, y: 74, tx: W / 2, ty: 74, mode: "idle", until: 1.5, stepT: 0, frame: 0, blink: 0, nextBlink: 3, hop: 0 }
    this.particles = [] // コイン・ハート・きらきら
    this.eating = null  // { food, t }

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
    clearTimeout(this.toastTimer)
    clearInterval(this.idleTimer)
    clearTimeout(this.eatSoundTimer)
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
    let idle = { hours: 0 }
    let reward = 0
    this.store.update((s) => {
      s.settings.soundAsked = true
      const now = this.store.now()
      idle = applyIdle(s, now) // 放置していた間に げんき が回復する（サーバーの時計で数える）
      reward = claimDailyReward(s, now)
    })
    this.renderHud(this.store.state)
    if (reward) {
      setTimeout(() => {
        this.sound.se("coin")
        this.toast(`🎁 きょうの ごほうび 💰+${reward}`)
        for (let i = 0; i < 5; i++) this.dropCoin(this.chara.x - 16 + i * 8, this.chara.y - SPRITE_H - i * 4)
      }, 400)
    } else if (idle.hours >= 1) {
      this.say("おかえり！")
    }
    this.idleTimer = setInterval(() => this.idleTick(), IDLE_TICK_MS)
  }

  // 遊んでいる間も、少しずつ げんき が回復し、ほこり が増える
  idleTick() {
    this.store.update((s) => { applyIdle(s, this.store.now()) })
    this.renderHud(this.store.state)
  }

  // 画面を閉じる・裏にしたとき。戻ってきたら、そこからの時間を放置として数える
  saveOnLeave() {
    if (!this.started) return
    this.store.update((s) => { applyIdle(s, this.store.now()) })
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
    if (ch.hop > 0) ch.hop = Math.max(0, ch.hop - dt)
    this.tickParticles(dt)
    if (this.eating) {
      this.eating.t += dt
      if (this.eating.t >= EAT_SEC) this.finishEating()
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
        if (ch.mode === "look") {
          this.hideBubble()
          this.hideMenu()
        }
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
    if (this.store.state) {
      const dirt = dirtCount(this.store.state, this.store.now())
      for (let i = 0; i < dirt; i++) drawDust(g, ...DIRT_SPOTS[i])
    }
    // ぴょん（よろこぶとき）
    const hopY = ch.hop > 0 ? Math.round(Math.abs(Math.sin(ch.hop * Math.PI * 3)) * 4) : 0
    const left = Math.round(ch.x - SPRITE_W / 2)
    const top = Math.round(ch.y - SPRITE_H) - (ch.frame === 1 ? 1 : 0) - hopY
    // かげ
    g.fillStyle = "rgba(0, 0, 0, 0.18)"
    g.fillRect(Math.round(ch.x) - 6, Math.round(ch.y) - 1, 12, 2)
    // もぐもぐ：食べている間は口のあたりで小さく上下する
    const munch = this.eating ? Math.round(Math.abs(Math.sin(this.eating.t * 10))) : 0
    drawDettyan(g, left, top + munch, { eyes: ch.blink > 0 || this.eating ? "blink" : "open", frame: ch.frame })
    if (this.eating) this.drawEating(g, left, top)
    this.drawParticles(g)
  }

  // 食べているごはん（ひと口ごとに右から少しずつ減る）
  drawEating(g, left, top) {
    const { food, t } = this.eating
    const bites = Math.min(3, Math.floor((t / EAT_SEC) * 4))
    const keep = 12 - bites * 4
    if (keep <= 0) return
    const ox = left + SPRITE_W - 6
    const oy = top + 13
    g.save()
    g.beginPath()
    g.rect(ox, oy, keep, 12)
    g.clip()
    drawFood(g, food, ox, oy)
    g.restore()
  }

  // ---- コイン・ハート・きらきら ----
  dropCoin(x, y) {
    this.particles.push({ type: "coin", x, y, vx: (Math.random() - 0.5) * 30, vy: -40, floor: Math.min(FLOOR_BOTTOM, this.chara.y + 2 + Math.random() * 4), life: 1.6, bounced: 0 })
  }

  hearts(n) {
    for (let i = 0; i < n; i++) {
      this.particles.push({ type: "heart", x: this.chara.x - 8 + Math.random() * 16, y: this.chara.y - SPRITE_H - Math.random() * 4, vx: (Math.random() - 0.5) * 8, vy: -14 - Math.random() * 8, life: 1.2 + Math.random() * 0.6, delay: i * 0.12 })
    }
  }

  sparkle(x, y) {
    for (let i = 0; i < 4; i++) {
      this.particles.push({ type: "spark", x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 6, vx: 0, vy: -10, life: 0.6 + Math.random() * 0.3, delay: i * 0.08 })
    }
  }

  tickParticles(dt) {
    for (const p of this.particles) {
      if (p.delay > 0) { p.delay -= dt; continue }
      p.life -= dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.type === "coin") {
        p.vy += 160 * dt
        if (p.y >= p.floor && p.vy > 0) {
          p.y = p.floor
          p.vy = p.bounced++ < 2 ? -p.vy * 0.45 : 0
          p.vx *= 0.5
        }
      }
    }
    this.particles = this.particles.filter((p) => p.life > 0)
  }

  drawParticles(g) {
    for (const p of this.particles) {
      if (p.delay > 0) continue
      const x = Math.round(p.x)
      const y = Math.round(p.y)
      g.globalAlpha = Math.min(1, p.life / 0.4)
      if (p.type === "coin") drawCoin(g, x, y)
      else if (p.type === "heart") drawHeart(g, x, y)
      else drawSpark(g, x, y)
      g.globalAlpha = 1
    }
  }

  // ---- タップ ----
  tap(event) {
    if (!this.started) return
    const rect = this.canvasTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * W
    const y = ((event.clientY - rect.top) / rect.height) * H
    const ch = this.chara
    const hit = x >= ch.x - SPRITE_W / 2 - 2 && x <= ch.x + SPRITE_W / 2 + 2 && y >= ch.y - SPRITE_H - 2 && y <= ch.y + 2
    if (hit && this.eating) return
    if (hit) {
      // Dettyan をタップ：止まってこっちを向き、おせわのメニューが出る
      this.lookAtMe(MENU_SEC)
      this.sound.se("talk")
      this.say("なに？")
      this.showMenu()
    } else if (y >= FLOOR_TOP - 4 && !this.eating) {
      // 床をタップ：そこまで歩いていく
      this.hideBubble()
      this.hideMenu()
      this.walkTo(x, y)
    }
  }

  lookAtMe(sec) {
    const ch = this.chara
    ch.mode = "look"
    ch.frame = 0
    ch.until = sec
  }

  showMenu() {
    this.menuTarget.hidden = false
  }

  hideMenu() {
    if (this.hasMenuTarget) this.menuTarget.hidden = true
  }

  // ---- おせわ（なでる・そうじ・話しかける） ----
  care(event) {
    const kind = event.params.kind
    if (!this.started || this.eating) return
    const now = this.store.now()
    const dirtBefore = dirtCount(this.store.state, now)
    let result = null
    this.store.update((s) => { result = doCare(s, kind, now) })
    if (!result) return
    this.lookAtMe(3)
    this.hideMenu()

    if (kind === "pet") {
      this.sound.se("pet")
      if (result.gokigen > 1) {
        this.chara.hop = 0.6
        this.hearts(2)
      }
    } else if (kind === "clean") {
      this.sound.se("sweep")
      for (let i = 0; i < dirtBefore; i++) this.sparkle(...DIRT_SPOTS[i])
    } else {
      this.sound.se("talk")
    }
    this.say(result.line)

    if (result.coins > 0) {
      setTimeout(() => {
        this.sound.se("coin")
        if (kind === "clean") {
          for (let i = 0; i < result.coins; i++) {
            const [dx, dy] = DIRT_SPOTS[i % DIRT_SPOTS.length]
            this.particles.push({ type: "coin", x: dx, y: dy - 10, vx: 0, vy: -30, floor: dy, life: 1.6, bounced: 0 })
          }
        } else {
          for (let i = 0; i < result.coins; i++) this.dropCoin(this.chara.x, this.chara.y - SPRITE_H + 4)
        }
        this.pop(`💰+${result.coins}`)
        this.renderHud(this.store.state)
      }, 350)
    }
    this.renderHud(this.store.state)
  }

  // ---- ショップ・持ち物 ----
  openShop() {
    if (!this.started) return
    this.sound.se("tap")
    this.hideMenu()
    this.sheetMode = "shop"
    this.renderSheet()
    this.sheetTarget.hidden = false
  }

  openBag() {
    if (!this.started) return
    this.sound.se("tap")
    this.hideMenu()
    this.sheetMode = "bag"
    this.renderSheet()
    this.sheetTarget.hidden = false
  }

  closeSheet() {
    this.sound.se("tap")
    this.sheetTarget.hidden = true
    this.sheetMode = null
  }

  buy(event) {
    const id = event.params.id
    let result = null
    this.store.update((s) => { result = buyFood(s, id) })
    if (result.ok) {
      this.sound.se("buy")
      this.toast(`${result.food.name} を かったよ`)
    } else {
      this.sound.se("no")
      if (result.reason === "money") this.toast("コインが たりないよ")
    }
    this.renderHud(this.store.state)
    this.renderSheet()
  }

  feed(event) {
    const id = event.params.id
    if (this.eating) return
    let result = null
    this.store.update((s) => { result = feedFood(s, id) })
    if (!result.ok) {
      this.sound.se("no")
      if (result.reason === "full") this.toast("おなか いっぱい みたい")
      this.renderSheet()
      return
    }
    // 食べるところを見せる（セーブはもう済んでいる）
    this.sheetTarget.hidden = true
    this.sheetMode = null
    this.hideBubble()
    this.lookAtMe(EAT_SEC + 3)
    this.eating = { food: result.food, t: 0, result }
    this.sound.se("eat")
    this.eatSoundTimer = setTimeout(() => this.sound.se("eat"), 700)
  }

  finishEating() {
    const { result } = this.eating
    this.eating = null
    this.chara.until = 3
    this.renderHud(this.store.state)
    if (result.food.favorite) {
      // 好物：大きくよろこぶ
      this.sound.se("happy")
      this.chara.hop = 1.2
      this.hearts(6)
    } else {
      this.chara.hop = 0.5
      this.hearts(1)
    }
    this.say(result.food.line)
    this.pop(`げんき+${Math.round(result.genki)} ごきげん+${Math.round(result.gokigen)}`)
  }

  renderSheet() {
    if (!this.sheetMode) return
    const s = this.store.state
    const list = this.sheetListTarget
    list.replaceChildren()
    this.sheetMoneyTarget.textContent = `💰 ${s.money.toLocaleString()}`

    if (this.sheetMode === "shop") {
      this.sheetTitleTarget.textContent = "🛒 ショップ"
      for (const food of FOODS) {
        const have = s.items[food.id] || 0
        const button = el("button", "dt-item__button", "かう")
        button.type = "button"
        button.disabled = s.money < food.price
        button.dataset.action = "dettyan-game#buy"
        button.dataset.dettyanGameIdParam = food.id
        list.append(itemRow(food, `💰${food.price}${have ? `・もっている ${have}` : ""}`, button))
      }
    } else {
      this.sheetTitleTarget.textContent = "🎒 もちもの"
      const owned = FOODS.filter((f) => s.items[f.id] > 0)
      if (owned.length === 0) {
        const empty = el("div", "dt-sheet__empty", "なにも もっていないよ。")
        const go = el("button", "dt-item__button", "🛒 ショップへ")
        go.type = "button"
        go.dataset.action = "dettyan-game#openShop"
        empty.append(go)
        list.append(empty)
      }
      for (const food of owned) {
        const button = el("button", "dt-item__button", "あげる")
        button.type = "button"
        button.dataset.action = "dettyan-game#feed"
        button.dataset.dettyanGameIdParam = food.id
        list.append(itemRow(food, `× ${s.items[food.id]}`, button))
      }
    }
  }

  // ふきだしとは別に、ステージの上に小さく出す知らせ
  toast(text) {
    const t = this.toastTarget
    t.textContent = text
    t.hidden = false
    clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => { t.hidden = true }, 2400)
  }

  // Dettyan の上にふわっと出る数字
  pop(text) {
    const p = el("div", "dt-pop", text)
    p.style.left = `${(this.chara.x / W) * 100}%`
    p.style.top = `${((this.chara.y - SPRITE_H - 10) / H) * 100}%`
    this.canvasTarget.parentElement.append(p)
    setTimeout(() => p.remove(), 1500)
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
    this.genkiTarget.parentElement.title = `げんき ${Math.round(s.stats.genki)}`
    this.gokigenTarget.parentElement.title = `ごきげん ${Math.round(s.stats.gokigen)}`
    if (this.sheetMode && this.hasSheetTarget && !this.sheetTarget.hidden) this.renderSheet()
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

function el(tag, className, text = "") {
  const e = document.createElement(tag)
  e.className = className
  if (text) e.textContent = text
  return e
}

// ショップ・持ち物の1行（絵・名前・効き目・ボタン）
function itemRow(food, sub, button) {
  const row = el("div", "dt-item")
  const icon = document.createElement("canvas")
  icon.className = "dt-item__icon"
  icon.width = 12
  icon.height = 12
  drawFood(icon.getContext("2d"), food, 0, 0)
  const body = el("div", "dt-item__body")
  body.append(el("div", "dt-item__name", food.name + (food.favorite ? " ⭐すき" : "")))
  body.append(el("div", "dt-item__effect", `げんき+${food.genki} ごきげん+${foodGokigen(food)}`))
  body.append(el("div", "dt-item__sub", sub))
  row.append(icon, body, button)
  return row
}

const px = (g, color, x, y, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(x, y, w, h) }

function drawCoin(g, x, y) {
  px(g, "#b8860b", x - 2, y - 5, 5, 5)
  px(g, "#ffd84d", x - 1, y - 5, 3, 5)
  px(g, "#ffd84d", x - 2, y - 4, 5, 3)
  px(g, "#fff3b0", x - 1, y - 4, 1, 2)
}

function drawHeart(g, x, y) {
  px(g, "#ff5f8f", x - 2, y - 4, 2, 1)
  px(g, "#ff5f8f", x + 1, y - 4, 2, 1)
  px(g, "#ff5f8f", x - 2, y - 3, 5, 1)
  px(g, "#ff5f8f", x - 1, y - 2, 3, 1)
  px(g, "#ff5f8f", x, y - 1, 1, 1)
  px(g, "#ffd0de", x - 2, y - 4, 1, 1)
}

function drawSpark(g, x, y) {
  px(g, "#fffbe0", x, y - 2, 1, 5)
  px(g, "#fffbe0", x - 2, y, 5, 1)
}

function drawDust(g, x, y) {
  px(g, "#8f8a80", x - 2, y - 2, 5, 2)
  px(g, "#b3ada2", x - 1, y - 3, 3, 1)
  px(g, "#6f6a62", x + 2, y - 1, 1, 1)
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
