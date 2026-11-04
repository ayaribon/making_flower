import { filters, classRegistry, config } from "fabric"

// 自作のフィルタは画素を直接さわる（Canvas 2D）ので、WebGL でフィルタをかける設定を切る。
// このアプリは Fabric のほかのフィルタを使っていないので、影響はない
config.configure({ enableGLFiltering: false })

// 部品の画像の一部を透明にするフィルタ。元の画像は書き換えず、「どこをなぞったか」だけを覚える。
// ops：操作した順。位置（x, y, pts）は画像の中の割合（0〜1）
//   { act: "keep",  r, pts: [x0, y0, x1, y1, …] }  🖌 なぞった所を残す（最初の1回で、ほかは全部消える）
//   { act: "erase", r, pts: [...] }                🧽 なぞった所を消す
//   { act: "all", x, y }                           🌈 タップした所と似た色を、画像の中から全部消す
//   { act: "protect", r, pts: [...] }              🛡 なぞった所は、🌈で消えないようにする（順番は関係なし）
//   { act: "ai", src }                             ✨ AI が選んだ形（PNG）を残す（最初の1回で、ほかは全部消える）
// r：ブラシの半径（画像の長い辺に対する割合）
// strength：🌈で、どこまで似た色を同じとみなすか（1〜80。RGB それぞれの差が strength × 2.55 まで）
// preview：true の間は、消える所をうっすら見せる（編集中だけ。defaults に入れないので保存されない）
export class ColorKey extends filters.BaseFilter {
  static type = "ColorKey"
  static defaults = { strength: 20, sharp: 0, feather: 0, ops: [] }

  // AI の形（PNG）は、計算する前に読み込んでおく
  static masks = new Map()

  static loadMask(src) {
    if (ColorKey.masks.has(src)) return Promise.resolve(ColorKey.masks.get(src))
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => { ColorKey.masks.set(src, img); resolve(img) }
      img.onerror = reject
      img.src = src
    })
  }

  static preload(ops = []) {
    return Promise.all(ops.filter(op => op.act === "ai" && op.src).map(op => ColorKey.loadMask(op.src)))
  }

  // 保存したデータから作り直すときも、先に AI の形を読み込む
  static async fromObject({ type, ...options }) {
    await ColorKey.preload(options.ops)
    return new this(options)
  }

  constructor(options = {}) {
    super(options)
    // 配列をほかと共有しない
    this.ops = (options.ops || []).map(op => (op.pts ? { ...op, pts: [...op.pts] } : { ...op }))
    this.preview = false
  }

  isNeutralState() {
    return !this.ops || this.ops.length === 0
  }

  applyTo2d({ imageData }) {
    const { data, width: w, height: h } = imageData
    const n = w * h
    const long = Math.max(w, h)

    // 見える所を表す「型紙」。塗ってある所が見える、透明な所が消える
    const mask = document.createElement("canvas")
    mask.width = w
    mask.height = h
    const ctx = mask.getContext("2d", { willReadFrequently: true })
    ctx.fillRect(0, 0, w, h)   // 最初は全部見える
    let kept = false
    // 🛡 守る：先に「守る型紙」を作っておく（🌈の前でもあとでも、なぞった所は守られる）
    const guard = this.buildGuard(w, h, long)

    for (const op of this.ops) {
      const act = op.all ? "all" : op.act   // all: true は前の形（🌈）
      if (act === "protect") continue
      if (act === "all") {
        this.removeSameColor(ctx, data, w, h, op, guard)
        continue
      }
      if (act === "ai") {
        const mask = ColorKey.masks.get(op.src)
        if (!mask) continue
        if (!kept) {
          ctx.clearRect(0, 0, w, h)
          kept = true
        }
        ctx.drawImage(this.sharpenMask(mask, w, h), 0, 0, w, h)
        continue
      }
      if (!Array.isArray(op.pts) || op.pts.length < 2) continue
      // 🖌 残す：最初の1回で、なぞっていない所を全部消す
      if (act === "keep" && !kept) {
        ctx.clearRect(0, 0, w, h)
        kept = true
      }
      ctx.globalCompositeOperation = act === "erase" ? "destination-out" : "source-over"
      this.drawStroke(ctx, op.pts, Math.max(1, op.r * 2 * long), w, h)
      ctx.globalCompositeOperation = "source-over"
    }

    // 型紙に合わせて、画像の透明度を変える（ふちは少しなめらかになる）
    const m = ctx.getImageData(0, 0, w, h).data
    // フチぼかし：型紙の透明度だけを、ぼかしてなめらかにする（2回かけて自然なぼけ方にする）
    const alpha = new Float32Array(n)
    for (let i = 0; i < n; i++) alpha[i] = m[i * 4 + 3]
    const r = Math.round(((this.feather || 0) / 1000) * long)
    if (r > 0) {
      this.boxBlur(alpha, w, h, r)
      this.boxBlur(alpha, w, h, r)
    }
    const ghost = this.preview ? 0.2 : 0
    for (let i = 0; i < n; i++) {
      const a = alpha[i]
      if (a >= 255) continue
      data[i * 4 + 3] = Math.round(data[i * 4 + 3] * (ghost + (1 - ghost) * a / 255))
    }
  }

  // なぞった線を型紙に描く（1点だけのときは丸を描く）
  drawStroke(ctx, pts, width, w, h) {
    ctx.beginPath()
    if (pts.length === 2) {
      ctx.arc(pts[0] * w, pts[1] * h, width / 2, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    ctx.lineWidth = width
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.moveTo(pts[0] * w, pts[1] * h)
    for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k] * w, pts[k + 1] * h)
    ctx.stroke()
  }

  // 🛡 守る型紙を作る。守る線がなければ null（いつもどおり）
  buildGuard(w, h, long) {
    const strokes = this.ops.filter(op => op.act === "protect" && Array.isArray(op.pts) && op.pts.length >= 2)
    if (strokes.length === 0) return null
    const c = document.createElement("canvas")
    c.width = w
    c.height = h
    const g = c.getContext("2d", { willReadFrequently: true })
    for (const op of strokes) this.drawStroke(g, op.pts, Math.max(1, op.r * 2 * long), w, h)
    return g.getImageData(0, 0, w, h).data
  }

  // くっきり：AI が迷った所（半透明）を、残すか消すかに寄せる。sharp は 0〜100（0 のときは何もしない）
  sharpenMask(mask, w, h) {
    const s = this.sharp || 0
    if (s <= 0) return mask
    const c = document.createElement("canvas")
    c.width = w
    c.height = h
    const ctx = c.getContext("2d", { willReadFrequently: true })
    ctx.drawImage(mask, 0, 0, w, h)
    const img = ctx.getImageData(0, 0, w, h)
    const d = img.data
    const k = 1 + (s / 100) * 19   // 100 で 20 倍の差をつける
    for (let i = 3; i < d.length; i += 4) {
      const a = (d[i] / 255 - 0.5) * k + 0.5
      d[i] = Math.round(Math.min(1, Math.max(0, a)) * 255)
    }
    ctx.putImageData(img, 0, 0)
    return c
  }

  // フチぼかし用：横→縦の順に、まわり r 画素の平均にする（ふちは、はしの値をのばして計算する）
  boxBlur(src, w, h, r) {
    const tmp = new Float32Array(src.length)
    const size = r * 2 + 1
    for (let y = 0; y < h; y++) {
      const row = y * w
      let sum = 0
      for (let k = -r; k <= r; k++) sum += src[row + Math.min(w - 1, Math.max(0, k))]
      for (let x = 0; x < w; x++) {
        tmp[row + x] = sum / size
        sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)]
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0
      for (let k = -r; k <= r; k++) sum += tmp[Math.min(h - 1, Math.max(0, k)) * w + x]
      for (let y = 0; y < h; y++) {
        src[y * w + x] = sum / size
        sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]
      }
    }
  }

  // 🌈：タップした所の色（元の画像の色）に似ている所を、型紙から消す
  removeSameColor(ctx, data, w, h, op, guard = null) {
    const px = Math.min(w - 1, Math.max(0, Math.round(op.x * (w - 1))))
    const py = Math.min(h - 1, Math.max(0, Math.round(op.y * (h - 1))))
    const j = (py * w + px) * 4
    if (data[j + 3] < 10) return   // 元から透明な所をタップしたときは何もしない
    const r = data[j], g = data[j + 1], b = data[j + 2]
    const tol = Math.round((this.strength ?? 20) * 2.55)
    const img = ctx.getImageData(0, 0, w, h)
    const m = img.data
    for (let k = 0; k < w * h * 4; k += 4) {
      if (guard && guard[k + 3] > 0) continue   // 🛡で守った所は消さない
      if (data[k + 3] >= 10 &&
        Math.abs(data[k] - r) <= tol && Math.abs(data[k + 1] - g) <= tol && Math.abs(data[k + 2] - b) <= tol) {
        m[k + 3] = 0
      }
    }
    ctx.putImageData(img, 0, 0)
  }
}

// 保存したデータ（type: "ColorKey"）から、このフィルタを作り直せるように登録する
classRegistry.setClass(ColorKey)
