import { Controller } from "@hotwired/stimulus"
import { equipped, drawDressed } from "dettyan_gear"
import { peekCachedState } from "dettyan_save"
import { enableDettyanHuman } from "dettyan_human"

// 🏠 メインメニューの「Dettyan を育てる」のアイコン：ドット絵の Dettyan（まばたき・いきをする）
// カードにカーソルをのせると、うれしそうに足ぶみする
// ゲームで そうびしているものを着て出てくる（この端末にある セーブの控えを読むだけ。サーバーには聞かない）
const W = 32 // はね・ヘルメットが はみ出しても入る大きさ
const H = 30
const LEFT = 6
const TOP = 4
const TICK_MS = 120

export default class extends Controller {
  static values = { userId: Number, layers: Object } // layers：素体＋レイヤーの 画像（あれば 町と 同じ 絵）

  connect() {
    const c = this.element
    c.width = W
    c.height = H
    this.g = c.getContext("2d")
    const state = this.userIdValue ? peekCachedState(this.userIdValue) : null
    this.set = state ? equipped(state) : {}
    this.n = 0
    this.happy = false
    this.reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    this.draw()
    enableDettyanHuman(this.layersValue).then((ok) => { if (ok && this.g) this.draw() })
    if (this.reduced) return

    this.timer = setInterval(() => { this.n += 1; this.draw() }, TICK_MS)
    this.card = c.closest("a") || c
    this.onEnter = () => { this.happy = true }
    this.onLeave = () => { this.happy = false }
    this.card.addEventListener("pointerenter", this.onEnter)
    this.card.addEventListener("pointerleave", this.onLeave)
    this.card.addEventListener("focus", this.onEnter)
    this.card.addEventListener("blur", this.onLeave)
  }

  disconnect() {
    clearInterval(this.timer)
    if (!this.card) return
    this.card.removeEventListener("pointerenter", this.onEnter)
    this.card.removeEventListener("pointerleave", this.onLeave)
    this.card.removeEventListener("focus", this.onEnter)
    this.card.removeEventListener("blur", this.onLeave)
  }

  draw() {
    const g = this.g
    const n = this.n
    g.clearRect(0, 0, W, H)
    let top = TOP
    let frame = 0
    let eyes = n % 28 === 0 ? "blink" : "open" // ときどき まばたき
    if (this.happy) {
      // 足ぶみ＋にっこり
      frame = Math.floor(n / 2) % 2
      top -= frame
      eyes = "happy"
    } else if (Math.floor(n / 6) % 2) {
      top += 1 // いきをする（ゆっくり上下）
    }
    // かげ
    g.fillStyle = "rgba(0, 0, 0, 0.22)"
    g.fillRect(LEFT + 4, TOP + 23, 12, 2)
    drawDressed(g, LEFT, top, this.set, { eyes, frame })
  }
}
