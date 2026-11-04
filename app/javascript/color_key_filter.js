import { filters, classRegistry, config } from "fabric"

// 自作のフィルタは画素を直接さわる（Canvas 2D）ので、WebGL でフィルタをかける設定を切る。
// このアプリは Fabric のほかのフィルタを使っていないので、影響はない
config.configure({ enableGLFiltering: false })

// 指定した色を透明にするフィルタ（カラーキー）。元の画像は書き換えない。
// ops：タップした順の操作。x, y は画像の中の位置（0〜1）
//   { x, y, act: "erase" }            タップした所から、似た色でつながっている部分を消す
//   { x, y, act: "erase", all: true } タップした所と似た色を、画像の中から全部消す
//   { x, y, act: "keep" }             タップした所から、似た色でつながっている部分を元に戻す
// strength：どこまで似た色を同じとみなすか（1〜80。RGB それぞれの差が strength × 2.55 まで）
export class ColorKey extends filters.BaseFilter {
  static type = "ColorKey"
  static defaults = { strength: 20, ops: [] }

  constructor(options = {}) {
    super(options)
    this.ops = (options.ops || []).map(op => ({ ...op }))  // 配列をほかと共有しない
  }

  isNeutralState() {
    return !this.ops || this.ops.length === 0
  }

  applyTo2d({ imageData }) {
    const { data, width: w, height: h } = imageData
    const n = w * h
    const tol = Math.round((this.strength ?? 20) * 2.55)
    const visible = new Uint8Array(n).fill(1)   // 1：見える、0：透明にする
    const seen = new Uint8Array(n)
    const stack = new Int32Array(n)

    // i 番目の画素が、色 (r, g, b) に似ているか（元から透明な所は、色がないので似ていない扱い）
    const like = (i, r, g, b) => {
      const j = i * 4
      return data[j + 3] >= 10 &&
        Math.abs(data[j] - r) <= tol && Math.abs(data[j + 1] - g) <= tol && Math.abs(data[j + 2] - b) <= tol
    }

    for (const op of this.ops) {
      const px = Math.min(w - 1, Math.max(0, Math.round(op.x * (w - 1))))
      const py = Math.min(h - 1, Math.max(0, Math.round(op.y * (h - 1))))
      const seed = py * w + px
      const j = seed * 4
      if (data[j + 3] < 10) continue   // 元から透明な所をタップしたときは何もしない
      const r = data[j], g = data[j + 1], b = data[j + 2]
      const value = op.act === "keep" ? 1 : 0

      if (op.all && op.act !== "keep") {
        for (let i = 0; i < n; i++) if (like(i, r, g, b)) visible[i] = value
        continue
      }

      // ペイントの塗りつぶしと同じやり方で、つながっている所だけをたどる（上下左右）
      seen.fill(0)
      let top = 0
      stack[top++] = seed
      seen[seed] = 1
      while (top > 0) {
        const i = stack[--top]
        visible[i] = value
        const x = i % w
        if (x > 0 && !seen[i - 1]) { seen[i - 1] = 1; if (like(i - 1, r, g, b)) stack[top++] = i - 1 }
        if (x < w - 1 && !seen[i + 1]) { seen[i + 1] = 1; if (like(i + 1, r, g, b)) stack[top++] = i + 1 }
        if (i - w >= 0 && !seen[i - w]) { seen[i - w] = 1; if (like(i - w, r, g, b)) stack[top++] = i - w }
        if (i + w < n && !seen[i + w]) { seen[i + w] = 1; if (like(i + w, r, g, b)) stack[top++] = i + w }
      }
    }

    for (let i = 0; i < n; i++) if (!visible[i]) data[i * 4 + 3] = 0
  }
}

// 保存したデータ（type: "ColorKey"）から、このフィルタを作り直せるように登録する
classRegistry.setClass(ColorKey)
