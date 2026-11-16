import { Controller } from "@hotwired/stimulus"
import { PAINTER_SPRITE, drawBuddy, drawDangling, drawShape, PIXEL_SHAPES, BuddyHandle, buddyHidden } from "pixel_buddy"

// 🧑‍🎨 画像編集の「ほめてくれる子」。キャンバスのすみっこにいて、編集が進むと「いいね！」とほめてくれる。
// 画面の飾りだけ（書き出す画像には入らない）。編集画面からは、次のできごとを受け取るだけ：
//   canvas-editor:changed（中身が変わった）／canvas-editor:template（テンプレを当てた）／canvas-editor:exported（画像を保存した）
// 何をしたかは、直前に押したボタンの data-action で見分ける（ほめる言葉を変えるため）

const W = 30 // 絵の大きさ（ドット）
const H = 30
const BODY_X = 6
const BODY_Y = 11

// 直前の操作 → ほめる言葉
const WORDS = {
  addText: ["文字いいね！", "読みやすい！", "いい言葉！"],
  applyStyle: ["その文字おしゃれ！", "かっこいい！", "目立ってる！"],
  addPart: ["かわいい！", "いい感じ！", "にぎやか！"],
  background: ["背景ステキ！", "雰囲気いいね！", "色がきれい！"],
  effect: ["雰囲気出てる！", "おしゃれ〜！", "エモい！"],
  color: ["いい色！", "色のセンス◎", "映える〜！"],
  image: ["いい写真！", "主役きた！", "ばっちり！"],
  delete: ["スッキリ！", "引き算じょうず！"],
  move: ["いい配置！", "バランス◎", "見やすい！"],
  any: ["いいね！", "じょうず！", "センスある〜！", "その調子！", "ステキ！"]
}
const MILESTONES = {
  10: "どんどん良くなってる！",
  25: "すごく作りこんでる！",
  50: "もうプロだね！"
}
// 押したボタン → 種類（ないものは「move」か「any」）
const KIND_OF_ACTION = {
  addText: "addText", applyStyle: "applyStyle", addPart: "addPart",
  changeBackground: "background", changeBgMode: "background", setBackgroundImage: "background",
  setFrame: "effect", toggleFilter: "effect", changeFilterStrength: "effect", changeTint: "effect",
  changeFill: "color", changeFillMode: "color", changeStroke: "color", changeShadow: "color",
  replacePlaceholder: "image", onMyImageSelected: "image", pickMyImage: "image",
  deleteSelected: "delete"
}
// これを押した直後の変化では、ほめない
const QUIET_ACTIONS = new Set(["undo", "redo", "resetCanvas", "chooseRatio", "closeRatioPicker", "openRatioPicker"])

const COOLDOWN_MS = 12000 // ほめるのは、少なくともこれだけあけて（うるさくならないように）
const SHOW_MS = 2400
const HEART_COLORS = ["#ff5fa2", "#ffd84a", "#5ec8ff", "#9b7bff"]

export default class extends Controller {
  static targets = ["canvas", "bubble", "body"]

  connect() {
    // 「けす」を選んでいたら、ログインし直すまで出ない
    if (buddyHidden("painter")) {
      this.element.hidden = true
      return
    }
    // ✋ 指でなぞると運べる。たたくと応援、10回たたくと「じゃま？」
    this.handle = new BuddyHandle(this.element, {
      name: "painter",
      handle: this.hasBodyTarget ? this.bodyTarget : null,
      onTap: () => this.poke(),
      onHide: () => this.disconnect(),
      // ✋ 運ばれている間は、つままれてじたばた（そのあいだは毎コマ描く）
      onDragStart: () => { if (!this.raf) this.raf = requestAnimationFrame(this.tick) },
      onDragEnd: () => {}
    })
    const c = this.canvasTarget
    c.width = W
    c.height = H
    this.g = c.getContext("2d")
    this.reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    this.changes = 0
    this.lastPraise = 0
    this.lastAction = null
    this.lastActionAt = 0
    this.cheerUntil = 0
    this.cheerStart = 0
    this.hearts = []
    this.wordIndex = {}
    this.onClick = (e) => this.rememberAction(e)
    this.onChanged = () => this.changed()
    this.onTemplate = () => this.praise(["いいテンプレ選んだね！", "ここから自分らしく！"][this.changes % 2], { big: true })
    this.onExported = () => this.praise("完成おめでとう！", { big: true, force: true })
    const root = this.editorRoot
    root.addEventListener("click", this.onClick, true)
    root.addEventListener("input", this.onClick, true)
    root.addEventListener("canvas-editor:changed", this.onChanged)
    root.addEventListener("canvas-editor:template", this.onTemplate)
    root.addEventListener("canvas-editor:exported", this.onExported)
    this.tick = this.tick.bind(this)
    this.draw(0)
    // ふだんは止まっていて、ときどきまばたきするだけ（電池のため）
    this.idleTimer = setInterval(() => { if (!this.raf) this.blink() }, 3500)
  }

  disconnect() {
    if (this.handle) { this.handle.destroy(); this.handle = null }
    if (!this.g) return // 出していないとき
    const root = this.editorRoot
    root.removeEventListener("click", this.onClick, true)
    root.removeEventListener("input", this.onClick, true)
    root.removeEventListener("canvas-editor:changed", this.onChanged)
    root.removeEventListener("canvas-editor:template", this.onTemplate)
    root.removeEventListener("canvas-editor:exported", this.onExported)
    clearInterval(this.idleTimer)
    clearTimeout(this.blinkTimer)
    clearTimeout(this.hideTimer)
    if (this.raf) cancelAnimationFrame(this.raf)
  }

  // 編集画面の外側（できごとはここに届く）
  get editorRoot() {
    return this.element.closest("[data-controller~='canvas-editor']") || document
  }

  // 子をさわったら、はげましてくれる
  poke() {
    this.praise(["がんばって！", "応援してるよ！", "楽しんでね！"][Math.floor(performance.now() / 1000) % 3], { force: true })
  }

  rememberAction(event) {
    const el = event.target.closest && event.target.closest("[data-action]")
    const m = el && el.dataset.action.match(/canvas-editor#([a-zA-Z]+)/)
    if (!m) return
    this.lastAction = m[1]
    this.lastActionAt = performance.now()
  }

  changed() {
    const fresh = performance.now() - this.lastActionAt < 3000
    const action = fresh ? this.lastAction : null
    if (action && QUIET_ACTIONS.has(action)) return
    this.changes++
    if (MILESTONES[this.changes]) {
      this.praise(MILESTONES[this.changes], { big: true, force: true })
      return
    }
    // 最初の1回は、すぐほめる。あとは、あいだをあけて
    if (this.changes > 1 && performance.now() - this.lastPraise < COOLDOWN_MS) return
    const kind = (action && KIND_OF_ACTION[action]) || (fresh ? "any" : "move")
    this.praise(this.pickWord(kind))
  }

  // 同じ言葉が続かないように、順番に
  pickWord(kind) {
    const list = WORDS[kind] || WORDS.any
    const i = this.wordIndex[kind] || 0
    this.wordIndex[kind] = i + 1
    return list[i % list.length]
  }

  praise(text, { big = false, force = false } = {}) {
    const now = performance.now()
    if (!force && now < this.cheerUntil) return
    this.lastPraise = now
    this.cheerStart = now
    this.cheerUntil = now + SHOW_MS
    this.big = big
    if (this.hasBubbleTarget) {
      this.bubbleTarget.textContent = text
      this.bubbleTarget.hidden = false
      this.bubbleTarget.classList.remove("is-on")
      void this.bubbleTarget.offsetWidth // 出てくる動きを、毎回はじめから
      this.bubbleTarget.classList.add("is-on")
    }
    this.element.classList.add("is-cheering")
    clearTimeout(this.hideTimer)
    this.hideTimer = setTimeout(() => {
      if (this.hasBubbleTarget) {
        this.bubbleTarget.classList.remove("is-on")
        this.bubbleTarget.hidden = true
      }
      this.element.classList.remove("is-cheering")
    }, SHOW_MS)
    // ハート・キラキラ（大きくほめるときは多め）
    if (!this.reduced) {
      const n = big ? 5 : 2
      for (let i = 0; i < n; i++) {
        this.hearts.push({
          born: now + i * 180,
          x: i % 2 ? W - 6 : 0, // 顔にかからないように、左右のはしから
          y: BODY_Y + 6 + ((i * 3 + this.changes) % 4),
          shape: i % 2 ? PIXEL_SHAPES.sparkle : PIXEL_SHAPES.heart,
          color: HEART_COLORS[(i + this.changes) % HEART_COLORS.length]
        })
      }
    }
    if (!this.raf) this.raf = requestAnimationFrame(this.tick)
  }

  blink() {
    this.draw(0, "blink")
    clearTimeout(this.blinkTimer)
    this.blinkTimer = setTimeout(() => { if (!this.raf) this.draw(0) }, 140)
  }

  tick(now) {
    if (this.handle && this.handle.dragging) {
      this.raf = requestAnimationFrame(this.tick)
      const g = this.g
      g.clearRect(0, 0, W, H)
      drawDangling(g, PAINTER_SPRITE, BODY_X, BODY_Y - 2, now / 1000)
      return
    }
    const busy = now < this.cheerUntil || this.hearts.length
    if (!busy) {
      this.raf = null
      this.draw(0)
      return
    }
    this.raf = requestAnimationFrame(this.tick)
    const t = (now - this.cheerStart) / 1000
    // ぴょんぴょん：大きくほめるときは3回、ふつうは2回
    const jumps = this.big ? 3 : 2
    const jumpLen = 0.32
    let jump = 0
    if (!this.reduced && t < jumps * jumpLen) {
      const p = (t % jumpLen) / jumpLen
      jump = Math.round(Math.sin(p * Math.PI) * 4)
    }
    const talking = now < this.cheerUntil
    const mouth = talking ? (t < 1.2 ? (Math.floor(t / 0.12) % 2 ? 2 : 1) : 1) : 0
    this.draw(jump, talking ? "happy" : "open", mouth, now)
  }

  draw(jump = 0, eyes = "open", mouth = 0, now = performance.now()) {
    const g = this.g
    g.clearRect(0, 0, W, H)
    // 足もとの影
    g.fillStyle = "rgba(43, 29, 46, 0.18)"
    g.fillRect(BODY_X + 5, BODY_Y + 18, 8 - Math.min(2, jump), 1)
    drawBuddy(g, PAINTER_SPRITE, BODY_X, BODY_Y - jump, { mouth, eyes })
    // ハート・キラキラ（上にふわっと上がって消える）
    this.hearts = this.hearts.filter((h) => now - h.born < 1300)
    this.hearts.forEach((h) => {
      const a = (now - h.born) / 1300
      if (a < 0) return
      g.globalAlpha = 1 - a * a
      drawShape(g, h.shape, h.x, Math.round(h.y - a * 16), h.color)
      g.globalAlpha = 1
    })
  }
}
