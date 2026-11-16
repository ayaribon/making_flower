import { Controller } from "@hotwired/stimulus"
import { DETTYAN_SPRITE, drawDettyan } from "dettyan_sprite"

// 🧑‍💼 Dettyan のドット絵をキャンバスに描く。ときどきまばたきする
export default class extends Controller {
  static targets = ["canvas"]

  connect() {
    const c = this.canvasTarget
    c.width = DETTYAN_SPRITE[0].length
    c.height = DETTYAN_SPRITE.length
    this.g = c.getContext("2d")
    this.draw("open")
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (!still) this.blinkLoop()
  }

  disconnect() {
    clearTimeout(this.timer)
  }

  draw(eyes) {
    this.g.clearRect(0, 0, this.canvasTarget.width, this.canvasTarget.height)
    drawDettyan(this.g, 0, 0, { eyes })
  }

  blinkLoop() {
    this.timer = setTimeout(() => {
      this.draw("blink")
      this.timer = setTimeout(() => {
        this.draw("open")
        this.blinkLoop()
      }, 140)
    }, 2500 + Math.random() * 2500)
  }
}
