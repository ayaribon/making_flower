import { Controller } from "@hotwired/stimulus"
import { drawAvatar, normalizeAvatar, AV_W, AV_H } from "avatar_sprite"
import { drawDettyan, SPRITE_W, SPRITE_H } from "dettyan_sprite"
import { TOWN_W, TOWN_H, VIEW_NARROW, BUILDINGS, BUILDING_W, WALK, doorOf, clampWalk, drawTownBase, drawTownSky, drawTownLive, drawTownNight } from "town_world"

// 🏘️ はじまりのまち（トップページ）。docs/town/requirements.md
// - 自分の アバター を タップした所へ 歩かせる。建物を タップすると、入口まで 歩いて 入る
//   入るときは、下の カード（data-town-place）を 押したのと同じ（main_menu_controller.js が 画像を出して 移動する）
// - ほかの人の アバター（さいきん キャラを つくった人）が うろうろ。タップすると あいさつ
// - Dettyan が 事務所の前に 立っている
// - 町は 横に 長い（256 ドット）。広い画面では ぜんぶ見せる。せまい画面（スマホ）は 160 はば を見せて、自分の キャラに ついて 横に 動く
const WIDE_PX = 700 // これより 広い 画面では 町を ぜんぶ 見せる
// - まだ キャラを つくっていない人には「まずは キャラを つくろう」
const SPEED = 22 // 1秒に 進むドット
const STEP_SEC = 0.2
const BUBBLE_MS = 2600
const GREETINGS = ["やっほー！", "こんにちは！", "いい天気だね", "歌ってきた！", "サムネ つくってる", "がんばろ〜", "またね！"]
const DETTYAN_LINES = ["ようこそ、はじまりのまち へ！", "事務所で まってるよ", "じゅんさい たべたいな"]
const OWNER_LINES = ["俺やん！", "お、俺が 立ってる", "本物の 俺やん"]

export default class extends Controller {
  static targets = ["canvas", "layer", "intro", "building", "edgeLeft", "edgeRight"]
  static values = { me: Object, name: String, others: Array, owner: Boolean }

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
    drawTownBase(this.base.getContext("2d"))
    this.reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)

    const mine = this.meValue && Object.keys(this.meValue).length ? this.meValue : null
    this.me = this.actor({ x: TOWN_W / 2 - 24, y: 110, avatar: normalizeAvatar(mine), name: this.nameValue, self: true })
    this.camX = this.cameraTarget()
    this.others = (this.othersValue || []).slice(0, 8).map((o, i) => {
      const spot = clampWalk(WALK.left + ((i * 37) % (WALK.right - WALK.left)), WALK.top + ((i * 23) % (WALK.bottom - WALK.top)))
      return this.actor({ ...spot, avatar: normalizeAvatar(o.avatar), name: o.name, wait: 1 + (i % 4) })
    })
    // Dettyan は 事務所の 前の ひろば に 立っている（建物の ボタンと かさならない 高さ）
    const door = doorOf("dettyan")
    this.dettyan = { x: door.x + 10, y: door.y + 18, blink: 0, nextBlink: 2 }
    if (!mine && this.hasIntroTarget) this.introTarget.hidden = false

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
    const wide = this.element.clientWidth >= WIDE_PX
    const viewW = wide ? TOWN_W : VIEW_NARROW
    if (viewW === this.viewW) return
    this.viewW = viewW
    this.canvasTarget.width = viewW
    this.canvasTarget.style.aspectRatio = `${viewW} / ${TOWN_H}`
    if (this.me) this.camX = this.cameraTarget()
  }

  // カメラ：自分の キャラが まんなか（町の はし では 止まる）
  cameraTarget() {
    return Math.max(0, Math.min(TOWN_W - this.viewW, Math.round(this.me.x - this.viewW / 2)))
  }

  actor(o) {
    return { tx: o.x, ty: o.y, frame: 0, stepT: 0, walking: false, plan: null, blink: 0, nextBlink: 1 + Math.random() * 3, wait: 2, ...o }
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
    if (this.entering) return
    const rect = this.canvasTarget.getBoundingClientRect()
    const x = this.camX + ((event.clientX - rect.left) / rect.width) * this.viewW
    const y = ((event.clientY - rect.top) / rect.height) * TOWN_H
    // ほかの人・Dettyan を タップしたら あいさつ
    const hit = (a, w, h) => x >= a.x - w / 2 - 2 && x <= a.x + w / 2 + 2 && y >= a.y - h - 2 && y <= a.y + 2
    const other = this.others.find((o) => hit(o, AV_W, AV_H))
    if (other) return this.say(other, `${other.name}「${GREETINGS[Math.floor(Math.random() * GREETINGS.length)]}」`)
    if (hit(this.dettyan, SPRITE_W, SPRITE_H)) {
      const lines = this.ownerValue ? OWNER_LINES : DETTYAN_LINES
      return this.say(this.dettyan, `Dettyan「${lines[Math.floor(Math.random() * lines.length)]}」`)
    }
    if (hit(this.me, AV_W, AV_H)) return this.say(this.me, `${this.nameValue}`)
    const p = clampWalk(x, y)
    this.me.plan = null
    this.me.tx = p.x
    this.me.ty = p.y
    this.me.walking = true
  }

  // 建物を タップ：入口まで 歩いて 入る
  goPlace(event) {
    if (this.entering) return
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
    drawTownSky(g, now, this.t)
    g.drawImage(this.base, 0, 0)
    drawTownLive(g, this.t)
    const actors = [...this.others, this.me, { ...this.dettyan, npc: true }].sort((a, b) => a.y - b.y)
    for (const a of actors) {
      g.fillStyle = "rgba(0, 0, 0, 0.18)"
      g.fillRect(Math.round(a.x) - 6, Math.round(a.y) - 1, 12, 2)
      if (a.npc) {
        drawDettyan(g, Math.round(a.x - SPRITE_W / 2), Math.round(a.y - SPRITE_H), { eyes: a.blink > 0 ? "blink" : "open" })
      } else {
        const fade = a.self && this.entering ? 0.4 : 1
        g.globalAlpha = fade
        drawAvatar(g, Math.round(a.x - AV_W / 2), Math.round(a.y - AV_H) - (a.frame === 1 ? 1 : 0), a.avatar, { frame: a.frame, blink: a.blink > 0 })
        g.globalAlpha = 1
      }
    }
    drawTownNight(g, now)
    g.restore()
    this.placeBuildings(cam)
    // 名前・ふきだし（画面の ことば）
    this.place(this.nameTag, this.me.x, this.me.y + 1)
    for (const a of [this.me, ...this.others, this.dettyan]) if (a.bubble && !a.bubble.hidden) this.place(a.bubble, a.x, a.y - AV_H - 2)
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
}
