import { Controller } from "@hotwired/stimulus"
import { PAINTER_SPRITE, BUDDY_COLORS, drawBuddy, drawShape, PIXEL_SHAPES } from "pixel_buddy"

// 💻 ドット絵の子が、ノートPCで作業している（切り抜きを送ったあとのページ）
// 手がカタカタ動いて、ときどきまばたき。マグカップから湯気、たまに ♪
const W = 48
const H = 34
const BX = 15 // 子の左上
const BY = 3
const SCREEN = { x: 13, y: 14, w: 22, h: 9 } // ノートPCの画面（うら側）
const DESK_Y = 24
// 筆を持っていない子（筆のドットを消す）
const WORKER_SPRITE = PAINTER_SPRITE.map((row) => row.replace(/[pgB]/g, "."))

export default class extends Controller {
  static targets = ["canvas"]

  connect() {
    const c = this.canvasTarget
    c.width = W
    c.height = H
    this.g = c.getContext("2d")
    this.reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    this.start = performance.now()
    this.tick = this.tick.bind(this)
    this.raf = requestAnimationFrame(this.tick)
  }

  disconnect() {
    if (this.raf) cancelAnimationFrame(this.raf)
  }

  tick(now) {
    this.raf = requestAnimationFrame(this.tick)
    const t = this.reduced ? 0 : (now - this.start) / 1000
    // 1秒に15コマくらい（ドット絵らしく、かくかく）
    const frame = Math.floor(t * 15)
    if (frame === this.lastFrame) return
    this.lastFrame = frame
    this.draw(t)
  }

  draw(t) {
    const g = this.g
    g.clearRect(0, 0, W, H)
    const K = BUDDY_COLORS.K
    // 子（少しだけ前かがみで、ゆっくり上下）
    const bob = Math.floor(t * 2) % 2
    const blink = t % 3.4 > 3.25
    drawBuddy(g, WORKER_SPRITE, BX, BY + bob, { mouth: 0, eyes: blink ? "blink" : "open" })
    // 机
    g.fillStyle = "#c98b55"
    g.fillRect(0, DESK_Y, W, 3)
    g.fillStyle = "#9b6a3f"
    g.fillRect(0, DESK_Y + 3, W, 1)
    // ノートPC（うら側）：ふち・本体・まんなかの花のマーク
    const s = SCREEN
    g.fillStyle = K
    g.fillRect(s.x - 1, s.y - 1, s.w + 2, s.h + 1)
    g.fillStyle = "#c9c9d6"
    g.fillRect(s.x, s.y, s.w, s.h)
    g.fillStyle = "#e4e4ee"
    g.fillRect(s.x + 1, s.y + 1, s.w - 2, 1)
    const lx = s.x + Math.floor(s.w / 2) - 1
    const ly = s.y + 3
    g.fillStyle = BUDDY_COLORS.F
    g.fillRect(lx, ly - 1, 2, 1); g.fillRect(lx - 1, ly, 1, 2); g.fillRect(lx + 2, ly, 1, 2); g.fillRect(lx, ly + 2, 2, 1)
    g.fillStyle = BUDDY_COLORS.f
    g.fillRect(lx, ly, 2, 2)
    // キーボードの台
    g.fillStyle = K
    g.fillRect(s.x - 3, DESK_Y - 1, s.w + 6, 1)
    g.fillStyle = "#8a8a9e"
    g.fillRect(s.x - 2, DESK_Y - 1, s.w + 4, 1)
    // 手：左右で交互にカタカタ（押すと1ドット下がる）
    const tap = (k) => (Math.floor(t * 9 + k * 1.7) % 3 === 0 ? 1 : 0)
    ;[[s.x + 2, 0], [s.x + s.w - 4, 1]].forEach(([x, k]) => {
      const y = DESK_Y - 3 + tap(k)
      g.fillStyle = K
      g.fillRect(x - 1, y - 1, 4, 3)
      g.fillStyle = BUDDY_COLORS.S
      g.fillRect(x, y, 2, 1)
    })
    // 画面の明かり（顔がうっすら青白く光る）
    g.fillStyle = "rgba(150, 220, 255, 0.18)"
    g.fillRect(BX + 4, BY + bob + 5, 10, 5)
    // マグカップと湯気
    const mx = 39
    g.fillStyle = K
    g.fillRect(mx - 1, DESK_Y - 5, 6, 5)
    g.fillStyle = "#ffffff"
    g.fillRect(mx, DESK_Y - 4, 4, 4)
    g.fillStyle = "#ff8ccf"
    g.fillRect(mx, DESK_Y - 3, 4, 1)
    g.fillStyle = K
    g.fillRect(mx + 5, DESK_Y - 4, 1, 3)
    g.fillStyle = "rgba(255, 255, 255, 0.75)"
    const st = Math.floor(t * 3) % 3
    g.fillRect(mx + 1 + (st === 1 ? 1 : 0), DESK_Y - 7 - st, 1, 2)
    g.fillRect(mx + 3 - (st === 2 ? 1 : 0), DESK_Y - 9 + st, 1, 2)
    // たまに ♪（ごきげんで作業中）
    const p = (t % 4) / 4
    if (p < 0.45) {
      g.globalAlpha = 1 - p / 0.45
      drawShape(g, PIXEL_SHAPES.note, BX + 18, Math.round(BY + 4 - p * 10), "#9b7bff")
      g.globalAlpha = 1
    }
  }
}
