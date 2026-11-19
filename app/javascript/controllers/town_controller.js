import { Controller } from "@hotwired/stimulus"
import { normalizeAvatar, avatarFromName, cleanMsg } from "avatar_sprite"
import { drawChibi, CHIBI_W as AV_W, CHIBI_H as AV_H } from "avatar_chibi"
import { drawDettyan, SPRITE_W, SPRITE_H } from "dettyan_sprite"
import { TOWN_W, TOWN_H, VIEW_NARROW, BUILDINGS, BUILDING_W, WALK, doorOf, clampWalk, drawTownBase, drawTownSky, drawTownLive, drawTownNight } from "town_world"
import { loadSprout, drawSproutBase, drawSproutLive, sproutWindows, SPROUT_LAMPS, hairPartsOf } from "town_sprout"
import { drawTeemo, facing, DETTYAN_TEEMO, TEEMO_W, TEEMO_H } from "avatar_teemo"
import { drawHuman, facing8, avatarLayersOf, HUMAN_W, HUMAN_H } from "avatar_human"
// 🧑 町の Dettyan（人の テンプレート）：黒い 髪・マンバン・茶色の ジャケット
const DETTYAN_HUMAN = { skin: "#f7e0cf", hair: "#3a3242", top: "#8a5a33", bottom: "#3a3a4a", shoes: "#4a3a32", acc: "manbun", hs: "manbun" }

// 🏘️ はじまりのまち（トップページ）。docs/town/requirements.md
// - 自分の アバター を タップした所へ 歩かせる。建物を タップすると、入口まで 歩いて 入る
//   入るときは、下の カード（data-town-place）を 押したのと同じ（main_menu_controller.js が 画像を出して 移動する）
// - ほかの人（キャラを つくった人）の アバターが うろうろ。タップすると ひとこと か あいさつ
//   （サーバーが キャラの ない人を わたしたときだけ、名前から きまる おまかせの 見た目に する）
// - 💬 ひとこと：キャラに ひとこと を 書いておくと、ときどき ふきだしで 言う（ほかの人にも 見える）
// - 📖 はじめて 開いた人には「SiVA へ ようこそ！」からの あんない（見たかどうかは この端末の localStorage だけ）
// - Dettyan が 事務所の前に 立っている
// - 町は 横に 長い（256 ドット）。広い画面では ぜんぶ見せる。せまい画面（スマホ）は 160 はば を見せて、自分の キャラに ついて 横に 動く
// - 🌱 Sprout Lands の 素材の URL（sprites）が わたされたら、その絵で 描く（town_sprout.js）。読めなければ コードで描く 町のまま
const WIDE_PX = 700 // これより 広い 画面では 町を ぜんぶ 見せる
// - まだ キャラを つくっていない人には「まずは キャラを つくろう」
const SPEED = 22 // 1秒に 進むドット
const STEP_SEC = 0.2
const BUBBLE_MS = 2600
const MAX_OTHERS = 20 // homes_controller.rb の TOWN_OTHERS と そろえる
const CHAT_FIRST = 1.4 // ひらいてから 最初の ひとこと まで（秒）
const GUIDE_KEY = "town:guide:v1" // あんない を 見たか（+ ":呼び名"）。中身を かえたら v2 に して もう一度 見せる
const GREETINGS = ["やっほー！", "こんにちは！", "いい天気だね", "歌ってきた！", "サムネ つくってる", "がんばろ〜", "またね！"]
const DETTYAN_LINES = ["ようこそ、はじまりのまち へ！", "事務所で まってるよ", "じゅんさい たべたいな"]
const OWNER_LINES = ["俺やん！", "お、俺が 立ってる", "本物の 俺やん"]
// Sprout Lands の 町では、Dettyan の ふちを 黒ではなく やわらかい 色に する（アバターは avatar_chibi.js が もともと やわらかい）
// 🐱 Teemo 型（人の 形に した もの）は いったん やめ（2026-11-18 ayaribon）。true に すると 町で 使う
const USE_TEEMO = false
const SOFT_LINE = "#4e3448"
const SOFT_DETTYAN = { K: SOFT_LINE, E: SOFT_LINE }

export default class extends Controller {
  static targets = [
    "canvas", "layer", "intro", "building", "edgeLeft", "edgeRight",
    "guide", "guideSiva", "guideFace", "guideTitle", "guideText", "guideCount", "guideSkip", "guideMake", "guideNext",
    "sayForm", "sayInput", "sayButton", "sayStatus"
  ]
  // name：表示名（まちに 出る）。account：ログインの 呼び名（あんない を 見たか の しるし。表示名を かえても かわらない）
  // full：画面いっぱい（トップ）。画面の 形に あわせて 見せる はば を きめて、町を ぴったり おさめる
  static values = { me: Object, name: String, account: String, others: Array, owner: Boolean, avatarUrl: String, sprites: Object, full: Boolean }

  connect() {
    const c = this.canvasTarget
    c.height = TOWN_H
    this.g = c.getContext("2d")
    this.camX = 0
    this.fitView()
    this.resizeObserver = new ResizeObserver(() => this.fitView())
    this.resizeObserver.observe(this.element)
    this.base = document.createElement("canvas")
    this.base.width = TOWN_W
    this.base.height = TOWN_H
    const urls = this.spritesValue
    if (urls && Object.keys(urls).length) {
      // 素材の 絵が とどくまで 少し まつ（とどかなければ コードで描く 町）
      this.baseReady = false
      loadSprout(urls).then((sheets) => {
        this.sprout = sheets
        this.hairParts = hairPartsOf(sheets)
        this.avatarLayers = avatarLayersOf(sheets)
        drawSproutBase(this.base.getContext("2d"), sheets)
      }).catch(() => {
        drawTownBase(this.base.getContext("2d"))
      }).finally(() => { this.baseReady = true })
    } else {
      drawTownBase(this.base.getContext("2d"))
      this.baseReady = true
    }
    this.reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)

    const mine = this.meValue && Object.keys(this.meValue).length ? this.meValue : null
    this.hasMine = !!mine
    const myLook = normalizeAvatar(mine)
    this.me = this.actor({ x: TOWN_W / 2 - 24, y: 110, avatar: myLook, msg: myLook.msg || "", name: this.nameValue, self: true })
    this.camX = this.cameraTarget()
    this.others = (this.othersValue || []).slice(0, MAX_OTHERS).map((o, i) => {
      const spot = clampWalk(WALK.left + ((i * 37) % (WALK.right - WALK.left)), WALK.top + ((i * 23) % (WALK.bottom - WALK.top)))
      const guest = !o.avatar || !Object.keys(o.avatar).length
      const look = guest ? avatarFromName(o.name) : normalizeAvatar(o.avatar)
      return this.actor({ ...spot, avatar: look, msg: look.msg || "", guest, name: o.name, wait: 1 + (i % 4) })
    })
    // Dettyan は 事務所の 前の ひろば に 立っている（建物の ボタンと かさならない 高さ）
    const door = doorOf("dettyan")
    this.dettyan = { x: door.x + 10, y: door.y + 18, blink: 0, nextBlink: 2 }
    this.chatIn = CHAT_FIRST
    this.drawGuideFace()
    if (!this.guideSeen()) this.startGuide()
    else if (!mine && this.hasIntroTarget) this.introTarget.hidden = false

    this.nameTag = this.label("hm-town__name", this.nameValue)
    this.t = 0
    this.last = performance.now()
    this.loop = (now) => {
      const dt = Math.min(0.1, (now - this.last) / 1000)
      this.last = now
      if (!document.hidden) {
        this.t += dt
        this.tick(dt)
        this.draw()
      }
      this.raf = requestAnimationFrame(this.loop)
    }
    this.raf = requestAnimationFrame(this.loop)
  }

  disconnect() {
    cancelAnimationFrame(this.raf)
    clearTimeout(this.enterTimer)
    this.resizeObserver?.disconnect()
  }

  // 画面の はば に あわせて、見せる はば を きめる（広い画面は 町ぜんぶ）
  fitView() {
    if (this.fullValue) return this.fitFull()
    const wide = this.element.clientWidth >= WIDE_PX
    const viewW = wide ? TOWN_W : VIEW_NARROW
    if (viewW === this.viewW) return
    this.viewW = viewW
    this.canvasTarget.width = viewW
    this.canvasTarget.style.aspectRatio = `${viewW} / ${TOWN_H}`
    if (this.me) this.camX = this.cameraTarget()
  }

  // 画面いっぱい：画面の 横長さ に あわせて 見せる はば（120〜256）を きめ、町を 画面に ぴったり おさめる
  fitFull() {
    const W = this.element.clientWidth || 1
    const H = this.element.clientHeight || 1
    const viewW = Math.max(120, Math.min(TOWN_W, Math.round((TOWN_H * W) / H)))
    const scale = Math.min(W / viewW, H / TOWN_H)
    const section = this.canvasTarget.parentElement
    section.style.width = `${Math.round(viewW * scale)}px`
    section.style.height = `${Math.round(TOWN_H * scale)}px`
    this.canvasTarget.style.height = "100%"
    if (viewW === this.viewW) return
    this.viewW = viewW
    this.canvasTarget.width = viewW
    this.canvasTarget.style.aspectRatio = `${viewW} / ${TOWN_H}`
    this.lastCam = null
    if (this.me) this.camX = this.cameraTarget()
  }

  // カメラ：自分の キャラが まんなか（町の はし では 止まる）。あんない の あいだは その 建物
  cameraTarget() {
    const x = this.focusX ?? this.me.x
    return Math.max(0, Math.min(TOWN_W - this.viewW, Math.round(x - this.viewW / 2)))
  }

  actor(o) {
    return { tx: o.x, ty: o.y, frame: 0, stepT: 0, walking: false, plan: null, blink: 0, nextBlink: 1 + Math.random() * 3, wait: 2, phase: Math.random() * 3, dir: "down", ...o }
  }

  label(cls, text) {
    const el = document.createElement("div")
    el.className = cls
    el.textContent = text
    el.setAttribute("aria-hidden", "true")
    this.layerTarget.append(el)
    return el
  }

  // ---- うごき ----
  tick(dt) {
    const target = this.cameraTarget()
    this.camX += (target - this.camX) * Math.min(1, dt * 4)
    if (Math.abs(target - this.camX) < 0.3) this.camX = target
    for (const a of [this.me, ...this.others]) {
      a.nextBlink -= dt
      if (a.blink > 0) a.blink -= dt
      if (a.nextBlink <= 0) {
        a.blink = 0.14
        a.nextBlink = 2 + Math.random() * 3
      }
      if (a.walking) this.walkStep(a, dt, a.self ? SPEED : SPEED * 0.55)
    }
    const d = this.dettyan
    d.nextBlink -= dt
    if (d.blink > 0) d.blink -= dt
    if (d.nextBlink <= 0) { d.blink = 0.14; d.nextBlink = 2.5 + Math.random() * 3 }
    // 💬 ときどき だれかが ひとこと（あんない の あいだは しずかに）
    if (!this.guiding) {
      this.chatIn -= dt
      if (this.chatIn <= 0) {
        this.chatter()
        this.chatIn = 3.5 + Math.random() * 3
      }
    }
    // ほかの人は ときどき うろうろ
    if (!this.reduced) {
      for (const o of this.others) {
        if (o.walking) continue
        o.wait -= dt
        if (o.wait <= 0) {
          const p = clampWalk(WALK.left + Math.random() * (WALK.right - WALK.left), WALK.top + Math.random() * (WALK.bottom - WALK.top))
          o.tx = p.x
          o.ty = p.y
          o.walking = true
          o.wait = 2 + Math.random() * 5
        }
      }
    }
  }

  walkStep(a, dt, speed) {
    const dx = a.tx - a.x
    const dy = a.ty - a.y
    const dist = Math.hypot(dx, dy)
    if (dist < 0.6) {
      a.walking = false
      a.frame = 0
      if (a.plan) {
        const plan = a.plan
        a.plan = null
        this.enter(plan)
      }
      return
    }
    const step = Math.min(dist, speed * dt)
    a.dir = facing(dx, dy, a.dir)
    a.dir8 = facing8(dx, dy, a.dir8)
    a.x += (dx / dist) * step
    a.y += (dy / dist) * step
    a.stepT += dt
    if (a.stepT >= STEP_SEC) {
      a.stepT = 0
      a.frame = 1 - a.frame
    }
  }

  // ---- タップ ----
  tap(event) {
    if (this.entering || this.guiding) return
    const rect = this.canvasTarget.getBoundingClientRect()
    const x = this.camX + ((event.clientX - rect.left) / rect.width) * this.viewW
    const y = ((event.clientY - rect.top) / rect.height) * TOWN_H
    // ほかの人・Dettyan を タップしたら あいさつ
    const hit = (a, w, h) => x >= a.x - w / 2 - 2 && x <= a.x + w / 2 + 2 && y >= a.y - h - 2 && y <= a.y + 2
    const [w, h] = this.sprout?.human ? [HUMAN_W, HUMAN_H] : USE_TEEMO && this.sprout?.chara ? [TEEMO_W, TEEMO_H] : [AV_W, AV_H]
    const other = this.others.find((o) => hit(o, w, h))
    if (other) return this.say(other, `${other.name}「${this.lineOf(other)}」`)
    if (hit(this.dettyan, SPRITE_W, SPRITE_H)) {
      const lines = this.ownerValue ? OWNER_LINES : DETTYAN_LINES
      return this.say(this.dettyan, `Dettyan「${lines[Math.floor(Math.random() * lines.length)]}」`)
    }
    if (hit(this.me, w, h)) return this.say(this.me, this.me.msg ? `${this.nameValue}「${this.me.msg}」` : `${this.nameValue}`)
    const p = clampWalk(x, y)
    this.me.plan = null
    this.me.tx = p.x
    this.me.ty = p.y
    this.me.walking = true
  }

  // 建物を タップ：入口まで 歩いて 入る
  goPlace(event) {
    if (this.entering || this.guiding) return
    const id = event.params.place
    const door = doorOf(id)
    if (!door) return
    this.me.tx = door.x
    this.me.ty = door.y
    this.me.plan = id
    this.me.walking = true
    if (Math.hypot(door.x - this.me.x, door.y - this.me.y) < 0.6) this.walkStep(this.me, 0, SPEED)
  }

  enter(id) {
    this.entering = id
    this.me.ty -= 3 // とびら に すいこまれる
    this.enterTimer = setTimeout(() => {
      this.entering = null
      const card = this.element.closest(".hm")?.querySelector(`[data-town-place="${id}"]`)
      if (card) card.click()
    }, 250)
  }

  closeIntro() {
    if (this.hasIntroTarget) this.introTarget.hidden = true
  }

  // ほかの人を タップした ときの ことば：ひとこと → まだ キャラが ない人 → あいさつ
  lineOf(other) {
    if (other.msg) return other.msg
    if (other.guest) return "キャラ、まだ つくってないんだ〜"
    return GREETINGS[Math.floor(Math.random() * GREETINGS.length)]
  }

  // 💬 見えている 人の 中から、ひとこと を 書いた人が 1人 言う（さいしょは 自分）
  chatter() {
    const shown = (a) => a.bubble && !a.bubble.hidden
    const inView = (a) => a.x >= this.camX - 4 && a.x <= this.camX + this.viewW + 4
    if (!this.chatted && this.me.msg && !shown(this.me)) {
      this.chatted = true
      return this.say(this.me, `${this.nameValue}「${this.me.msg}」`)
    }
    this.chatted = true
    const list = [this.me, ...this.others].filter((a) => a.msg && !shown(a) && inView(a))
    if (!list.length) return
    const a = list[Math.floor(Math.random() * list.length)]
    this.say(a, `${a.name}「${a.msg}」`)
  }

  say(actor, text) {
    if (!actor.bubble) actor.bubble = this.label("hm-town__bubble", "")
    actor.bubble.textContent = text
    actor.bubble.hidden = false
    clearTimeout(actor.bubbleTimer)
    actor.bubbleTimer = setTimeout(() => { actor.bubble.hidden = true }, BUBBLE_MS)
  }

  // ---- 描く ----
  draw() {
    const g = this.g
    const now = Date.now()
    const cam = Math.round(this.camX)
    g.save()
    g.translate(-cam, 0)
    if (!this.baseReady) {
      g.fillStyle = "#c0d470"
      g.fillRect(0, 0, TOWN_W, TOWN_H)
    } else if (this.sprout) {
      g.drawImage(this.base, 0, 0)
      drawSproutLive(g, this.t, this.sprout)
    } else {
      drawTownSky(g, now, this.t)
      g.drawImage(this.base, 0, 0)
      drawTownLive(g, this.t)
    }
    const actors = [...this.others, this.me, { ...this.dettyan, npc: true }].sort((a, b) => a.y - b.y)
    for (const a of actors) {
      g.fillStyle = "rgba(0, 0, 0, 0.18)"
      g.fillRect(Math.round(a.x) - 6, Math.round(a.y) - 1, 12, 2)
      if (this.sprout?.human) {
        // 🧑 人の テンプレート（8方向。色・こもの は その人の キャラ）
        g.globalAlpha = a.self && this.entering ? 0.4 : 1
        drawHuman(g, this.sprout.human, a.x, a.y, a.npc ? null : a.avatar, { dir: a.dir8 || "down", walking: !!a.walking, t: this.t + (a.phase || 0), look: a.npc ? DETTYAN_HUMAN : null, parts: this.hairParts, layers: this.avatarLayers })
        g.globalAlpha = 1
      } else if (USE_TEEMO && this.sprout?.chara) {
        // 🐱 Teemo 型（素材の キャラ画像。毛の 色・首の 色・こもの は その人の キャラ）
        const fade = a.self && this.entering ? 0.4 : 1
        g.globalAlpha = fade
        drawTeemo(g, this.sprout.chara, a.x, a.y, a.npc ? null : a.avatar, { dir: a.dir || "down", walking: !!a.walking, t: this.t + (a.phase || 0), look: a.npc ? DETTYAN_TEEMO : null })
        g.globalAlpha = 1
      } else if (a.npc) {
        drawDettyan(g, Math.round(a.x - SPRITE_W / 2), Math.round(a.y - SPRITE_H), { eyes: a.blink > 0 ? "blink" : "open", colors: this.sprout ? SOFT_DETTYAN : null })
      } else {
        const fade = a.self && this.entering ? 0.4 : 1
        g.globalAlpha = fade
        drawChibi(g, Math.round(a.x - AV_W / 2), Math.round(a.y - AV_H) - (a.frame === 1 ? 1 : 0), a.avatar, { frame: a.frame, blink: a.blink > 0 })
        g.globalAlpha = 1
      }
    }
    if (this.sprout) drawTownNight(g, now, sproutWindows(), SPROUT_LAMPS)
    else drawTownNight(g, now)
    g.restore()
    this.placeBuildings(cam)
    // 名前・ふきだし（画面の ことば）
    this.place(this.nameTag, this.me.x, this.me.y + 1)
    for (const a of [this.me, ...this.others, this.dettyan]) if (a.bubble && !a.bubble.hidden) this.placeBubble(a.bubble, a.x, a.y - (this.sprout?.human ? HUMAN_H + 1 : USE_TEEMO && this.sprout?.chara ? TEEMO_H + 4 : AV_H) - 2)
  }

  // ふきだし は 町の はし で はみ出さないように よせる
  placeBubble(el, wx, y) {
    const W = this.layerTarget.clientWidth || 1
    const half = el.offsetWidth / 2
    const x = ((wx - Math.round(this.camX)) / this.viewW) * W
    const left = `${Math.round(Math.max(half + 2, Math.min(W - half - 2, x)))}px`
    const top = `${(y / TOWN_H) * 100}%`
    if (el.style.left !== left) el.style.left = left
    if (el.style.top !== top) el.style.top = top
  }

  // 建物の ボタン を カメラに あわせて うごかす。見えていない 側に 建物があれば ◀ ▶
  placeBuildings(cam) {
    if (cam === this.lastCam && this.viewW === this.lastViewW) return
    this.lastCam = cam
    this.lastViewW = this.viewW
    this.buildingTargets.forEach((btn) => {
      const b = BUILDINGS.find((x) => x.id === btn.dataset.townPlaceParam)
      if (!b) return
      btn.style.left = `${((b.x - 3 - cam) / this.viewW) * 100}%`
      btn.style.width = `${((BUILDING_W + 6) / this.viewW) * 100}%`
    })
    if (this.hasEdgeLeftTarget) this.edgeLeftTarget.hidden = cam <= 0
    if (this.hasEdgeRightTarget) this.edgeRightTarget.hidden = cam >= TOWN_W - this.viewW
  }

  // ◀ ▶：その がわ へ 歩く
  walkLeft() { this.walkSide(-1) }
  walkRight() { this.walkSide(1) }

  walkSide(dir) {
    if (this.entering) return
    const p = clampWalk(this.me.x + dir * this.viewW * 0.6, this.me.y)
    this.me.plan = null
    this.me.tx = p.x
    this.me.ty = p.y
    this.me.walking = true
  }

  place(el, wx, y) {
    const x = wx - Math.round(this.camX)
    const left = `${(x / this.viewW) * 100}%`
    const top = `${(y / TOWN_H) * 100}%`
    if (el.style.left !== left) el.style.left = left
    if (el.style.top !== top) el.style.top = top
  }

  // ---- 💬 ひとこと ----
  async saveMsg(event) {
    event.preventDefault()
    if (this.saving || !this.hasSayInputTarget) return
    const msg = cleanMsg(this.sayInputTarget.value)
    this.saving = true
    this.sayButtonTarget.disabled = true
    this.sayStatusTarget.textContent = "ほぞん しています…"
    try {
      const res = await fetch(this.avatarUrlValue, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json", "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || "" },
        body: JSON.stringify({ avatar: { msg } })
      })
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json().catch(() => ({}))
      const saved = cleanMsg(data?.avatar?.msg || "")
      this.me.msg = saved
      this.sayInputTarget.value = saved
      this.sayStatusTarget.textContent = saved ? "かえたよ！ まちの みんなに 見えるよ" : "ひとこと を けしたよ"
      if (saved) this.say(this.me, `${this.nameValue}「${saved}」`)
      else if (this.me.bubble) this.me.bubble.hidden = true
    } catch (e) {
      this.sayStatusTarget.textContent = "かえられなかった… もう一度 おしてね"
    } finally {
      this.saving = false
      this.sayButtonTarget.disabled = false
    }
  }

  // ---- 📖 あんない ----
  guideKey() {
    return `${GUIDE_KEY}:${this.accountValue || this.nameValue}`
  }

  // 見たか どうか（おぼえられない 端末では 毎回 出さない。❓ あんない で 見られる）
  guideSeen() {
    try { return !!window.localStorage.getItem(this.guideKey()) } catch (e) { return true }
  }

  markGuideSeen() {
    try { window.localStorage.setItem(this.guideKey(), "1") } catch (e) { /* おぼえられなくても よい */ }
  }

  guideSteps() {
    const narrow = this.viewW < TOWN_W
    const steps = [
      { who: "siva", title: "SiVA へ ようこそ！", text: "ここは「はじまりのまち」。SiVA の みんなが あつまる 町だよ。" },
      {
        title: "Dettyan",
        focus: "npc",
        text: this.ownerValue ? "まちを あんない するで。…って、あんない してるの 俺やん！" : "Dettyan だよ。まちを かんたんに あんない するね！"
      },
      { place: "sing", title: "🎤 スタジオ", text: "歌ってみた を つくる ところ。録音・ミックス・ハモリ・MV まで できるよ。" },
      { place: "art", title: "🎨 アトリエ", text: "サムネ や 背景の 画像を つくる ところ。文字・部品・背景を ならべて つくれるよ。" },
      { place: "dettyan", title: "🏢 事務所", text: "Dettyan を 育てる ゲームが できる ところ。ぼうけん・ショップ・おうち も あるよ。" },
      { place: "clip", title: "✂️ 編集室", text: "配信の 切り抜き動画を たのめる ところ。「ここ！」を 送ってね。" },
      { title: "あるきかた", text: "地面を タップすると 歩くよ。建物を タップすると 中に 入れるよ。" + (narrow ? "◀ ▶ で 町の はし まで 行けるよ。" : "") }
    ]
    if (this.hasMine) {
      if (this.hasSayFormTarget) steps.push({ title: "💬 ひとこと", say: true, text: "下の「💬 ひとこと」に 書くと、まちの みんなに ひとこと のこせるよ。" })
      steps.push({ title: "いってらっしゃい！", text: "また 見たく なったら、下の「❓ あんない」を おしてね。" })
    } else {
      steps.push({ title: "さいごに", make: true, text: "じぶんの キャラを つくろう！ そのキャラで まちを 歩けるよ。" })
    }
    return steps
  }

  startGuide() {
    if (this.entering || !this.hasGuideTarget) return
    this.closeIntro()
    this.guiding = true
    this.guideList = this.guideSteps()
    this.guideAt = 0
    this.renderGuide()
    this.guideNextTarget.focus({ preventScroll: true })
  }

  nextGuide() {
    if (!this.guiding) return
    if (this.guideAt >= this.guideList.length - 1) return this.endGuide()
    this.guideAt += 1
    this.renderGuide()
  }

  endGuide() {
    if (!this.guiding) return
    const reachedEnd = this.guideAt >= this.guideList.length - 1
    this.guiding = false
    this.focusX = null
    this.guideTarget.hidden = true
    this.buildingTargets.forEach((b) => b.classList.remove("is-guide"))
    if (this.hasSayFormTarget) this.sayFormTarget.classList.remove("is-guide")
    this.markGuideSeen()
    // とちゅうで とばした まだ キャラが ない人には「キャラを つくろう」
    if (!this.hasMine && !reachedEnd && this.hasIntroTarget) this.introTarget.hidden = false
    this.chatIn = CHAT_FIRST
  }

  renderGuide() {
    const list = this.guideList
    const st = list[this.guideAt]
    const last = this.guideAt === list.length - 1
    this.guideTarget.hidden = false
    this.guideTarget.classList.toggle("is-welcome", st.who === "siva")
    if (this.hasGuideSivaTarget) this.guideSivaTarget.hidden = st.who !== "siva"
    if (this.hasGuideFaceTarget) this.guideFaceTarget.hidden = st.who === "siva"
    this.guideTitleTarget.textContent = st.title
    this.guideTextTarget.textContent = st.text
    this.guideCountTarget.textContent = `${this.guideAt + 1} / ${list.length}`
    this.guideSkipTarget.hidden = last
    this.guideMakeTarget.hidden = !st.make
    this.guideNextTarget.textContent = last ? (st.make ? "あとで" : "はじめる！") : "つぎへ ▶"
    // その 建物 を 光らせて、スマホでは カメラを そっちへ
    this.focusX = st.place ? doorOf(st.place).x : st.focus === "npc" ? this.dettyan.x : null
    this.buildingTargets.forEach((b) => b.classList.toggle("is-guide", b.dataset.townPlaceParam === st.place))
    if (this.hasSayFormTarget) this.sayFormTarget.classList.toggle("is-guide", !!st.say)
  }

  // あんない の 顔（Dettyan の 頭 だけ）
  drawGuideFace() {
    if (!this.hasGuideFaceTarget) return
    const c = this.guideFaceTarget
    c.width = SPRITE_W
    c.height = 16
    drawDettyan(c.getContext("2d"), 0, 0, { eyes: "open" })
  }
}
