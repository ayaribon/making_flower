import { Controller } from "@hotwired/stimulus"
import { SPRITE_W, SPRITE_H } from "dettyan_sprite"
import { DettyanStore } from "dettyan_save"
import { DettyanSound } from "dettyan_sound"
import { FOODS, findFood, foodGokigen, drawFood } from "dettyan_foods"
import { applyIdle, claimDailyReward, doCare, buyFood, feedFood, dirtCount, maxGenki } from "dettyan_care"
import { PLACES, MONSTERS, canGo, goAdventure, expToNext, dettyanPower, drawSlime } from "dettyan_adventure"
import { GEAR, SLOTS, slotName, findGear, equipped, gearBonus, toggleGear, drawGearIcon, drawDressed, drawHeldMic, shopGear, buyGear } from "dettyan_gear"
import { ROOM_W, ROOM_H, createRoom, drawRoomLive, drawChair, drawSpeaker, drawNightLight, drawWindowLight, CHAIR, SPEAKER, SEAT, WORK_SPOT, SING_SPOT } from "dettyan_room"
import { drawScene } from "dettyan_scenes"

// 🧑‍💼 Dettyan 育成ゲーム：事務所の部屋の中を Dettyan がちょこちょこ歩く。タップでおせわ、ショップでごはん
// ときどき PC で編集作業をしたり、マイクを持って歌ったりする（見ているだけ。セーブは変えない）
// セーブは dettyan_save.js、音は dettyan_sound.js、ごはんの表は dettyan_foods.js、おせわの計算は dettyan_care.js
// ぼうけん（モンスター退治）は dettyan_adventure.js（その場で行って帰ってきて、結果を再生する）、そうびは dettyan_gear.js
// ショップは「🍙 たべもの」（dettyan_foods.js）と「👗 いしょう」（dettyan_gear.js の price があるもの）の2つのタブ
// 部屋の絵は dettyan_room.js、モンスター退治の けしきは dettyan_scenes.js
// 仕様は docs/dettyan/requirements.md

const W = ROOM_W // 部屋の大きさ（ドット）
const H = ROOM_H
const FLOOR_TOP = 46 // 足がここより下を歩く
const FLOOR_BOTTOM = 92
const SPEED = 16 // 1秒に進むドット
const STEP_SEC = 0.22 // 足を入れかえる間かく

const IDLE_TICK_MS = 60 * 1000 // 遊んでいる間も1分ごとに放置の計算をする
const MENU_SEC = 7 // おせわのメニューを出している間、Dettyan は止まっている
const EAT_SEC = 1.5
// ほこりの場所（そうじするまで、床に1つずつ増える）
const DIRT_SPOTS = [[24, 60], [100, 84], [66, 90], [120, 66], [36, 82]]
// バトルの場所（ドット）
const BATTLE_ME_X = 34
const BATTLE_FOE_X = 94
const BATTLE_FEET = 82
const BATTLE_MAX_SEC = 12 // 長いバトルも、だいたいこの秒数で見終わるように速くする

// 部屋でひとりで すること（PC で作業・歌う）
const ACT_GAP_SEC = 14   // 前にしてから、これだけたつまで次はしない
const ACT_CHANCE = 0.4   // 歩き終わって止まったとき、作業か歌を始める確率
const SING_BEAT = 60 / 104 // 事務所の BGM の1拍
const WORK_LINES = ["MV の へんしゅう できた！", "サムネ できた！", "切り抜き 1本 できた！", "歌ってみた の ミックス おわり！"]
const SING_LINES = ["きもちよかった〜", "いい声 でた！", "歌ってみた、とろうかな", "ラララ〜♪"]
const NOTE_COLORS = ["#ff7ab6", "#5ec8ff", "#ffd84a", "#9b7bff"]

export default class extends Controller {
  static targets = ["canvas", "start", "startText", "startNote", "money", "genki", "gokigen", "soundButton", "soundPanel", "bgmToggle", "seToggle", "bubble",
    "menu", "sheet", "sheetTitle", "sheetMoney", "sheetList", "toast", "level", "genkiNum", "skip"]
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
    this.room = createRoom()
    // mode："idle" | "walk" | "look" | "work"（PC で作業）| "sing"（歌う）。plan：歩いた先で始めること
    this.chara = { x: W / 2, y: 74, tx: W / 2, ty: 74, mode: "idle", until: 1.5, stepT: 0, frame: 0, blink: 0, nextBlink: 3, hop: 0, plan: null, act: null, lastActAt: -ACT_GAP_SEC }
    this.t = 0 // 開いてからの秒（部屋の動くところに使う）
    this.particles = [] // コイン・ハート・きらきら
    this.eating = null  // { food, t }
    this.battle = null  // モンスター退治の再生中

    this.last = performance.now()
    this.loop = (now) => {
      const dt = Math.min(0.1, (now - this.last) / 1000)
      this.last = now
      this.t += dt
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
    if (this.battle) return this.tickBattle(dt)
    if (!this.started) return

    if (ch.mode === "walk") {
      const dx = ch.tx - ch.x
      const dy = ch.ty - ch.y
      const dist = Math.hypot(dx, dy)
      if (dist < 0.5) {
        ch.mode = "idle"
        ch.frame = 0
        ch.until = 1 + Math.random() * 2.5
        if (ch.plan) this.startActivity(ch.plan)
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
    } else if (ch.act) {
      this.tickActivity(dt)
    } else {
      ch.until -= dt
      if (ch.until <= 0) {
        if (ch.mode === "look") {
          this.hideBubble()
          this.hideMenu()
        }
        this.wander()
      }
    }
  }

  // 止まっていたあと、次にすること：ときどき PC で作業・歌う。ふだんは ぶらぶら歩く
  wander() {
    const ch = this.chara
    if (!this.eating && this.t - ch.lastActAt > ACT_GAP_SEC && Math.random() < ACT_CHANCE) {
      const plan = Math.random() < 0.5 ? "work" : "sing"
      const spot = plan === "work" ? WORK_SPOT : SING_SPOT
      this.walkTo(spot.x, spot.y)
      ch.plan = plan
      return
    }
    this.walkTo(12 + Math.random() * (W - 24), FLOOR_TOP + 2 + Math.random() * (FLOOR_BOTTOM - FLOOR_TOP - 4))
  }

  walkTo(x, y) {
    this.standUp()
    const ch = this.chara
    ch.plan = null
    ch.tx = Math.max(SPRITE_W / 2, Math.min(W - SPRITE_W / 2, x))
    ch.ty = Math.max(FLOOR_TOP, Math.min(FLOOR_BOTTOM, y))
    ch.mode = "walk"
  }

  // ---- 部屋でひとりで すること（PC で作業・歌う） ----
  startActivity(kind) {
    const ch = this.chara
    ch.plan = null
    ch.mode = kind
    ch.frame = 0
    ch.act = { kind, t: 0, dur: kind === "work" ? 9 + Math.random() * 4 : 8 + Math.random() * 3, fx: 0.3, note: 0.2, typing: true }
    if (kind === "work") {
      // いすに すわる（うしろすがた）
      ch.x = SEAT.x
      ch.y = SEAT.y
    } else {
      this.sound.duck(true)
      this.say("♪")
    }
  }

  tickActivity(dt) {
    const ch = this.chara
    const act = ch.act
    act.t += dt
    act.fx -= dt
    if (act.kind === "work") {
      // カタカタ…（ときどき手を止めて考える）
      if (act.fx <= 0) {
        if (act.typing && Math.random() < 0.08) {
          act.typing = false
          act.fx = 0.6 + Math.random() * 0.8
        } else {
          act.typing = true
          this.sound.se("type")
          act.fx = 0.07 + Math.random() * 0.12
        }
      }
    } else {
      if (act.fx <= 0) {
        this.sound.se("sing")
        act.fx = SING_BEAT * 4
      }
      act.note -= dt
      if (act.note <= 0) {
        this.note()
        act.note = SING_BEAT * 1.5
      }
    }
    if (act.t >= act.dur) this.endActivity(true)
  }

  // done：さいごまでした（ひとことを言う）。false：タップなどで やめた
  endActivity(done) {
    const ch = this.chara
    const act = ch.act
    if (!act) return
    ch.act = null
    ch.lastActAt = this.t
    ch.mode = "idle"
    ch.until = 2.5
    if (act.kind === "work") {
      // いすから 立つ
      ch.x = WORK_SPOT.x
      ch.y = WORK_SPOT.y
    } else {
      this.sound.duck(false)
    }
    if (done) {
      if (act.kind === "sing") {
        this.chara.hop = 0.6
        this.hearts(2)
      }
      this.say(pick(act.kind === "work" ? WORK_LINES : SING_LINES))
    }
  }

  // 作業中・歌っている途中なら やめて立つ
  standUp() {
    if (this.chara.act) this.endActivity(false)
  }

  draw() {
    const g = this.g
    const ch = this.chara
    if (this.battle) return this.drawBattle(g)
    const now = this.store.now()
    const act = ch.act
    g.drawImage(this.room, 0, 0)
    drawWindowLight(g, now)
    drawRoomLive(g, { now, t: this.t, mode: act?.kind, workT: act?.kind === "work" ? act.t : 0 })
    if (this.store.state) {
      const dirt = dirtCount(this.store.state, now)
      for (let i = 0; i < dirt; i++) drawDust(g, ...DIRT_SPOTS[i])
    }
    // いす・スピーカー・Dettyan を、足もとが上（おく）のものから順に描く
    const layers = [
      { y: CHAIR.base, draw: () => drawChair(g) },
      { y: SPEAKER.base, draw: () => drawSpeaker(g, act?.kind === "sing", this.t) },
      { y: ch.y + 0.5, draw: () => this.drawChara(g) }
    ]
    layers.sort((a, b) => a.y - b.y).forEach((l) => l.draw())
    drawNightLight(g, now, act?.kind === "work")
    this.drawParticles(g)
  }

  drawChara(g) {
    const ch = this.chara
    const act = ch.act
    if (act?.kind === "work") {
      // うしろすがたで PC に向かう。打っている間は 少し ゆれる
      const bob = act.typing && Math.floor(act.t * 9) % 2 ? 1 : 0
      this.drawMe(g, SEAT.left, SEAT.top + bob, { view: "back" })
      return
    }
    // ぴょん（よろこぶとき）
    const hopY = ch.hop > 0 ? Math.round(Math.abs(Math.sin(ch.hop * Math.PI * 3)) * 4) : 0
    const left = Math.round(ch.x - SPRITE_W / 2)
    let top = Math.round(ch.y - SPRITE_H) - (ch.frame === 1 ? 1 : 0) - hopY
    // かげ
    g.fillStyle = "rgba(0, 0, 0, 0.18)"
    g.fillRect(Math.round(ch.x) - 6, Math.round(ch.y) - 1, 12, 2)
    if (act?.kind === "sing") {
      // マイクを持って歌う：拍に合わせて ゆれて、口をぱくぱく
      const beat = (act.t / SING_BEAT) % 1
      top += beat < 0.5 ? 0 : 1
      const mouth = Math.floor(act.t / (SING_BEAT / 2)) % 2 ? "open" : "close"
      const eyes = Math.floor(act.t / (SING_BEAT * 4)) % 2 ? "happy" : ch.blink > 0 ? "blink" : "open"
      this.drawMe(g, left, top, { eyes, mouth, hideHand: true })
      drawHeldMic(g, left, top, this.gearSet())
      return
    }
    // もぐもぐ：食べている間は口のあたりで小さく上下する
    const munch = this.eating ? Math.round(Math.abs(Math.sin(this.eating.t * 10))) : 0
    this.drawMe(g, left, top + munch, { eyes: ch.blink > 0 || this.eating ? "blink" : "open", frame: ch.frame })
    if (this.eating) this.drawEating(g, left, top)
  }

  gearSet() {
    return this.store.state ? equipped(this.store.state) : {}
  }

  // そうびしているもの（あたま・からだ・て・せなか・あし）で描く
  drawMe(g, left, top, opts = {}) {
    drawDressed(g, left, top, this.gearSet(), opts)
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

  // 歌っているときの 音符（マイクのあたりから ふわっと上がる）
  note() {
    const ch = this.chara
    this.particles.push({ type: "note", x: ch.x + 4 + Math.random() * 4, y: ch.y - SPRITE_H + 8, vx: 4 + Math.random() * 6, vy: -12 - Math.random() * 6, life: 1.6, color: pick(NOTE_COLORS), wob: Math.random() * 6 })
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
      if (p.type === "note") p.x += Math.sin(p.life * 6 + p.wob) * 0.15
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
      else if (p.type === "note") drawNote(g, x, y, p.color)
      else drawSpark(g, x, y)
      g.globalAlpha = 1
    }
  }

  // ---- タップ ----
  tap(event) {
    if (!this.started) return
    if (this.battle) return this.skipBattle()
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
    this.standUp()
    const ch = this.chara
    ch.plan = null
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
    if (!this.started || this.battle) return
    this.sound.se("tap")
    this.hideMenu()
    this.sheetMode = "shop"
    this.renderSheet()
    this.sheetTarget.hidden = false
  }

  // ショップのタブ（たべもの・いしょう）
  shopTabs() {
    const tabs = el("div", "dt-tabs")
    tabs.setAttribute("role", "tablist")
    for (const [id, label] of [["food", "🍙 たべもの"], ["wear", "👗 いしょう"]]) {
      const on = (this.shopTabId || "food") === id
      const b = el("button", "dt-tabs__tab" + (on ? " is-on" : ""), label)
      b.type = "button"
      b.setAttribute("role", "tab")
      b.setAttribute("aria-selected", String(on))
      b.dataset.action = "dettyan-game#shopTab"
      b.dataset.dettyanGameTabParam = id
      tabs.append(b)
    }
    return tabs
  }

  shopTab(event) {
    const tab = event.params.tab
    if (this.shopTabId === tab) return
    this.sound.se("tap")
    this.shopTabId = tab
    this.renderSheet()
    this.sheetListTarget.scrollTop = 0
  }

  // いしょう：パーツごとに。持っているものは「そうびする」
  renderWearShop(list, s) {
    for (const slot of SLOTS) {
      const items = shopGear().filter((g) => g.slot === slot.id)
      if (!items.length) continue
      list.append(el("div", "dt-sheet__section", `${slot.icon} ${slot.name}`))
      for (const gear of items) {
        let button
        let sub
        if (s.gear.owned[gear.id]) {
          const on = s.gear[gear.slot] === gear.id
          button = el("button", "dt-item__button" + (on ? " dt-item__button--on" : ""), on ? "はずす" : "そうびする")
          button.dataset.action = "dettyan-game#equip"
          sub = on ? "もっている・そうび中" : "もっている"
        } else {
          button = el("button", "dt-item__button", "かう")
          button.disabled = s.money < gear.price
          button.dataset.action = "dettyan-game#buyWear"
          sub = `💰${gear.price}`
        }
        button.type = "button"
        button.dataset.dettyanGameIdParam = gear.id
        list.append(gearRow(gear, sub, button))
      }
    }
  }

  buyWear(event) {
    let result = null
    this.store.update((s) => { result = buyGear(s, event.params.id) })
    if (result.ok) {
      this.sound.se("buy")
      this.toast(`${result.gear.name} を かったよ！`)
    } else {
      this.sound.se("no")
      if (result.reason === "money") this.toast("コインが たりないよ")
    }
    this.renderHud(this.store.state)
    this.renderSheet()
  }

  openBag() {
    if (!this.started || this.battle) return
    this.sound.se("tap")
    this.hideMenu()
    this.sheetMode = "bag"
    this.renderSheet()
    this.sheetTarget.hidden = false
  }

  closeSheet() {
    this.sound.se("tap")
    if (this.sheetMode === "result") this.backFromBattle()
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
      list.append(this.shopTabs())
      if (this.shopTabId === "wear") return this.renderWearShop(list, s)
      for (const food of FOODS) {
        const have = s.items[food.id] || 0
        const button = el("button", "dt-item__button", "かう")
        button.type = "button"
        button.disabled = s.money < food.price
        button.dataset.action = "dettyan-game#buy"
        button.dataset.dettyanGameIdParam = food.id
        list.append(itemRow(food, `💰${food.price}${have ? `・もっている ${have}` : ""}`, button))
      }
    } else if (this.sheetMode === "quest") {
      this.renderQuest(list, s)
    } else if (this.sheetMode === "result") {
      this.renderResult(list, s)
    } else if (this.sheetMode === "gear") {
      this.renderGear(list, s)
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
      // そうび は べつの画面
      const gearCount = GEAR.filter((g) => s.gear.owned[g.id]).length
      list.append(el("div", "dt-sheet__section", `👕 そうび（${gearCount}/${GEAR.length}）`))
      const go = el("button", "dt-item__button dt-sheet__wide", "👕 そうび を ひらく")
      go.type = "button"
      go.dataset.action = "dettyan-game#openGear"
      list.append(go)
    }
  }

  // ---- そうび（あたま・からだ・て・せなか・あし） ----
  openGear() {
    if (!this.started || this.battle) return
    this.sound.se("tap")
    this.hideMenu()
    this.sheetMode = "gear"
    this.renderSheet()
    this.sheetTarget.hidden = false
  }

  renderGear(list, s) {
    this.sheetTitleTarget.textContent = "👕 そうび"
    // いまの すがた と つよさ
    const top = el("div", "dt-gear-top")
    const preview = document.createElement("canvas")
    preview.className = "dt-gear-top__me"
    preview.width = 30
    preview.height = 31
    drawDressed(preview.getContext("2d"), 5, 5, equipped(s))
    const power = dettyanPower(s)
    const bonus = gearBonus(s)
    const stats = el("div", "dt-gear-top__stats")
    stats.append(el("div", "dt-gear-top__lv", `Lv${s.dettyan.level}`))
    stats.append(el("div", "", `たいりょく ${power.hp}${bonus.hp ? `（そうび +${bonus.hp}）` : ""}`))
    stats.append(el("div", "", `こうげき ${power.atk}${bonus.atk ? `（そうび +${bonus.atk}）` : ""}`))
    top.append(preview, stats)
    list.append(top)

    for (const slot of SLOTS) {
      const owned = GEAR.filter((g) => g.slot === slot.id && s.gear.owned[g.id])
      const wearing = findGear(s.gear[slot.id])
      list.append(el("div", "dt-sheet__section", `${slot.icon} ${slot.name}${wearing ? `：${wearing.name}` : "：なし"}`))
      if (owned.length === 0) list.append(el("div", "dt-sheet__none", "まだ ない（🗺️ ぼうけん や 🛒 ショップ で 手に入るよ）"))
      for (const gear of owned) {
        const on = s.gear[gear.slot] === gear.id
        const button = el("button", "dt-item__button" + (on ? " dt-item__button--on" : ""), on ? "はずす" : "そうびする")
        button.type = "button"
        button.dataset.action = "dettyan-game#equip"
        button.dataset.dettyanGameIdParam = gear.id
        list.append(gearRow(gear, on ? "そうび中" : "", button))
      }
    }
  }

  equip(event) {
    let result = null
    this.store.update((s) => { result = toggleGear(s, event.params.id) })
    if (!result?.ok) return
    this.sound.se(result.on ? "buy" : "tap")
    this.toast(result.on ? `${result.gear.name} を そうびした` : `${result.gear.name} を はずした`)
    this.renderSheet()
  }

  // ---- モンスター退治 ----
  openQuest() {
    if (!this.started || this.battle || this.eating) return
    this.sound.se("tap")
    this.hideMenu()
    this.sheetMode = "quest"
    this.renderSheet()
    this.sheetTarget.hidden = false
  }

  renderQuest(list, s) {
    this.sheetTitleTarget.textContent = "🗺️ ぼうけん"
    const power = dettyanPower(s)
    list.append(el("div", "dt-sheet__note", `Lv${s.dettyan.level}・たいりょく ${power.hp}・こうげき ${power.atk}　げんき ${Math.floor(s.stats.genki)}/${maxGenki(s)}`))
    for (const place of PLACES) {
      const check = canGo(s, place.id)
      const button = el("button", "dt-item__button", check.reason === "level" ? `Lv${place.level}から` : "いく")
      button.type = "button"
      button.disabled = !check.ok
      button.dataset.action = "dettyan-game#go"
      button.dataset.dettyanGameIdParam = place.id
      const row = el("div", "dt-item" + (check.reason === "level" ? " dt-item--locked" : ""))
      const icon = el("div", "dt-item__icon dt-item__icon--emoji", place.icon)
      const body = el("div", "dt-item__body")
      body.append(el("div", "dt-item__name", place.name))
      const kinds = [...new Set(place.monsters)].map((id) => MONSTERS[id].name).join("・")
      body.append(el("div", "dt-item__effect", `げんき −${place.genki}`))
      body.append(el("div", "dt-item__sub", check.reason === "genki" ? "げんき が たりないよ" : kinds))
      row.append(icon, body, button)
      list.append(row)
    }
  }

  go(event) {
    if (this.battle) return
    const id = event.params.id
    const before = { level: this.store.state.dettyan.level }
    let result = null
    // 結果は先に計算してセーブする（再生の途中で閉じても、もらったものはなくならない）
    this.store.update((s) => { result = goAdventure(s, id, Math.floor(Math.random() * 2 ** 31)) })
    if (!result.ok) {
      this.sound.se("no")
      this.toast(result.reason === "genki" ? "げんき が たりないよ" : `Lv${result.place?.level} から 行けるよ`)
      return
    }
    this.store.flush()
    this.sheetTarget.hidden = true
    this.sheetMode = null
    this.hideBubble()
    this.hideMenu()
    this.standUp()
    this.chara.plan = null
    this.particles = []
    this.startBattle(result, before)
  }

  startBattle(result, before) {
    const { battle, place } = result
    const steps = [{ type: "intro", dur: 1.1 }]
    let cur = -1
    for (const r of battle.rounds) {
      if (r.foe !== cur) {
        cur = r.foe
        steps.push({ type: "appear", foe: cur, dur: 0.9 })
      }
      steps.push({ type: "round", r, dur: 0.55 })
      if (r.down && r.who === "me") steps.push({ type: "down", foe: r.foe, dur: 0.5 })
    }
    steps.push({ type: "end", dur: 1.6 })
    const total = steps.reduce((sum, st) => sum + st.dur, 0)
    const speed = Math.max(1, total / BATTLE_MAX_SEC)
    for (const st of steps) st.dur /= speed
    this.battle = {
      result, before, place, steps, i: -1, t: 0,
      myHp: battle.maxHp, foe: null, foeHp: 0, foeMax: 1,
      lunge: 0, foeLunge: 0, flashMe: 0, flashFoe: 0, dying: 0, hop: 0, bob: 0
    }
    if (this.hasSkipTarget) this.skipTarget.hidden = false
    this.sound.playSong("battle")
    this.nextStep()
  }

  nextStep() {
    const b = this.battle
    b.i += 1
    b.t = 0
    const step = b.steps[b.i]
    if (!step) return this.finishBattle()
    const foes = b.result.battle.foes
    if (step.type === "intro") {
      this.toast(`${b.place.icon} ${b.place.name} に ついた！`)
    } else if (step.type === "appear") {
      b.foe = MONSTERS[foes[step.foe]]
      b.foeHp = b.foe.hp
      b.foeMax = b.foe.hp
      b.dying = 0
      this.sound.se("talk")
      this.toast(`${b.foe.name} が あらわれた！`)
    } else if (step.type === "round") {
      const r = step.r
      this.sound.se("hit")
      if (r.who === "me") {
        b.lunge = 0.3
        b.flashFoe = 0.25
        b.foeHp = r.foeHp
        this.popAt(r.crit ? `かいしん！${r.dmg}` : `${r.dmg}`, BATTLE_FOE_X, BATTLE_FEET - 26)
      } else {
        b.foeLunge = 0.3
        b.flashMe = 0.25
        b.myHp = r.myHp
        this.popAt(`${r.dmg}`, BATTLE_ME_X, BATTLE_FEET - 30)
      }
    } else if (step.type === "down") {
      b.dying = 0.001
      this.sound.se("coin")
    } else if (step.type === "end") {
      if (b.result.battle.win) {
        this.sound.se("happy")
        b.hop = 1.4
        this.toast("ぜんぶ たおした！")
      } else {
        this.sound.se("no")
        this.toast("まけちゃった… にげて かえってきた")
      }
    }
  }

  tickBattle(dt) {
    const b = this.battle
    b.t += dt
    b.bob += dt
    b.lunge = Math.max(0, b.lunge - dt)
    b.foeLunge = Math.max(0, b.foeLunge - dt)
    b.flashMe = Math.max(0, b.flashMe - dt)
    b.flashFoe = Math.max(0, b.flashFoe - dt)
    b.hop = Math.max(0, b.hop - dt)
    if (b.dying > 0) b.dying = Math.min(1, b.dying + dt * 2.5)
    this.tickParticles(dt)
    const step = b.steps[b.i]
    if (step && b.t >= step.dur) this.nextStep()
  }

  // 再生をとばして、結果を見る
  skipBattle() {
    if (!this.battle) return
    this.sound.se("tap")
    this.finishBattle()
  }

  finishBattle() {
    const b = this.battle
    if (!b) return
    this.battle = null
    if (this.hasSkipTarget) this.skipTarget.hidden = true
    this.lastBattle = b
    if (b.result.levelUps > 0) this.sound.se("levelup")
    this.renderHud(this.store.state)
    this.sheetMode = "result"
    this.renderSheet()
    this.sheetTarget.hidden = false
  }

  backFromBattle() {
    this.sound.playSong("office")
    const ch = this.chara
    ch.x = W / 2
    ch.y = 74
    this.lookAtMe(3)
    const r = this.lastBattle?.result
    if (r) this.say(r.battle.win ? "ただいま！" : "いたた… ただいま")
  }

  renderResult(list, s) {
    const { result, before } = this.lastBattle
    const { battle, place } = result
    this.sheetTitleTarget.textContent = battle.win ? `🏆 ${place.name}：かち！` : `💦 ${place.name}：まけちゃった`
    const counts = {}
    battle.foes.slice(0, battle.beaten).forEach((id) => { counts[id] = (counts[id] || 0) + 1 })
    const beaten = Object.entries(counts).map(([id, n]) => `${MONSTERS[id].name}×${n}`).join("・")
    list.append(el("div", "dt-result__line", beaten ? `${beaten} を たおした` : "1ぴきも たおせなかった…"))
    list.append(el("div", "dt-result__line", `💰 +${battle.coins}　けいけんち +${battle.exp}`))
    const lv = s.dettyan.level
    list.append(el("div", "dt-result__line dt-result__line--sub", `Lv${lv}　つぎのレベルまで ${expToNext(lv) - s.dettyan.exp}`))
    if (battle.drop) {
      const food = findFood(battle.drop)
      if (food) list.append(itemRow(food, "ひろった！ もちもの に入れたよ", el("span", "")))
    }
    if (battle.gear) {
      const gear = findGear(battle.gear)
      if (gear) {
        const on = s.gear[gear.slot] === gear.id
        const button = el("button", "dt-item__button" + (on ? " dt-item__button--on" : ""), on ? "はずす" : "そうびする")
        button.type = "button"
        button.dataset.action = "dettyan-game#equip"
        button.dataset.dettyanGameIdParam = gear.id
        list.append(gearRow(gear, "✨ 手に入れた！", button))
      }
    }
    if (result.levelUps > 0) {
      list.append(el("div", "dt-result__levelup", `🎉 レベル ${lv} になった！　げんき の上限 ${maxGenki(s)}`))
      for (const p of PLACES) {
        if (p.level > before.level && p.level <= lv) list.append(el("div", "dt-result__levelup", `${p.icon} ${p.name} に 行けるようになった！`))
      }
    }
    const back = el("button", "dt-item__button dt-result__back", "🏠 じむしょに もどる")
    back.type = "button"
    back.dataset.action = "dettyan-game#closeSheet"
    list.append(back)
  }

  drawBattle(g) {
    const b = this.battle
    const p = b.place
    // けしき（dettyan_scenes.js。くも・ほたる・たいまつ・雪 などが動く）
    drawScene(g, p, b.bob)
    // Dettyan（左）
    const lunge = b.lunge > 0 ? Math.round(Math.sin((b.lunge / 0.3) * Math.PI) * 10) : 0
    const hop = b.hop > 0 ? Math.round(Math.abs(Math.sin(b.hop * Math.PI * 3)) * 5) : 0
    const meLeft = BATTLE_ME_X - SPRITE_W / 2 + lunge
    const meTop = BATTLE_FEET - SPRITE_H - hop
    g.fillStyle = "rgba(0, 0, 0, 0.2)"
    g.fillRect(BATTLE_ME_X - 6 + lunge, BATTLE_FEET - 1, 12, 2)
    if (!(b.flashMe > 0 && Math.floor(b.flashMe * 30) % 2)) this.drawMe(g, meLeft, meTop, { frame: lunge > 0 ? 1 : 0 })
    // スライム（右）。2倍の大きさ
    if (b.foe && b.dying < 1) {
      const fl = b.foeLunge > 0 ? Math.round(Math.sin((b.foeLunge / 0.3) * Math.PI) * 10) : 0
      const squash = (Math.sin(b.bob * 6) + 1) / 2
      g.fillStyle = "rgba(0, 0, 0, 0.2)"
      g.fillRect(BATTLE_FOE_X - 10 - fl, BATTLE_FEET - 1, 20, 2)
      if (!(b.flashFoe > 0 && Math.floor(b.flashFoe * 30) % 2)) {
        g.save()
        g.globalAlpha = 1 - b.dying
        g.translate(BATTLE_FOE_X - 12 - fl, BATTLE_FEET - 20)
        g.scale(2, 2)
        drawSlime(g, b.foe, 0, 0, squash * 0.5 + b.dying)
        g.restore()
      }
    }
    // たいりょくのバー
    hpBar(g, 6, 6, 40, b.myHp / b.result.battle.maxHp, "#7ed957")
    if (b.foe) hpBar(g, W - 46, 6, 40, b.foeHp / b.foeMax, "#ff6b6b")
    this.drawParticles(g)
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
    this.popAt(text, this.chara.x, this.chara.y - SPRITE_H - 10)
  }

  popAt(text, x, y) {
    const p = el("div", "dt-pop", text)
    p.style.left = `${(x / W) * 100}%`
    p.style.top = `${(y / H) * 100}%`
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
    const max = maxGenki(s)
    this.genkiTarget.style.width = `${clamp((s.stats.genki / max) * 100)}%`
    if (this.hasGenkiNumTarget) this.genkiNumTarget.textContent = `${Math.floor(s.stats.genki)}/${max}`
    if (this.hasLevelTarget) this.levelTarget.textContent = `Lv${s.dettyan.level}`
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

function pick(list) {
  return list[Math.floor(Math.random() * list.length)]
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

// ぶき・いしょうの1行
function gearRow(gear, sub, button) {
  const row = el("div", "dt-item")
  const icon = document.createElement("canvas")
  icon.className = "dt-item__icon"
  icon.width = 12
  icon.height = 12
  drawGearIcon(icon.getContext("2d"), gear, 0, 0)
  const body = el("div", "dt-item__body")
  body.append(el("div", "dt-item__name", `${gear.name}（${slotName(gear.slot)}）`))
  const fx = [gear.atk ? `こうげき+${gear.atk}` : "", gear.hp ? `たいりょく+${gear.hp}` : ""].filter(Boolean).join(" ")
  body.append(el("div", "dt-item__effect", fx))
  if (sub) body.append(el("div", "dt-item__sub", sub))
  row.append(icon, body, button)
  return row
}

const px = (g, color, x, y, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(x, y, w, h) }

function hpBar(g, x, y, w, ratio, color) {
  px(g, "rgba(0, 0, 0, 0.45)", x - 1, y - 1, w + 2, 5)
  px(g, color, x, y, Math.round(w * Math.max(0, Math.min(1, ratio))), 3)
}

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

// ♪（4×5）
function drawNote(g, x, y, color) {
  px(g, color, x + 2, y - 5, 2, 1)
  px(g, color, x + 2, y - 4, 1, 3)
  px(g, color, x, y - 2, 3, 2)
}
