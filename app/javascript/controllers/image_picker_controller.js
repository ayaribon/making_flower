import { Controller } from "@hotwired/stimulus"

// 🖼 画像をいくつも選ぶ（切り抜きの依頼・素材を送る）
// ふつうのファイル選択は、選び直すと前の選択が消えるので、ここで「選んだ画像の一覧」を持つ。
//   ＋ 追加 → 一覧に足す（同じ画像は2回入れない）／ × → 1枚ずつ消す／ 枠にドロップでも足せる
// 送るときは、一覧の画像を <input type="file"> に入れなおす（DataTransfer）。サーバーの決まりと同じ上限で、その場で知らせる
const TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]

export default class extends Controller {
  static targets = ["input", "list", "count", "message", "drop"]
  static values = { maxFiles: { type: Number, default: 12 }, maxEach: { type: Number, default: 8 }, maxTotal: { type: Number, default: 30 } }

  connect() {
    this.files = []
    this.urls = new Map()
    this.render()
  }

  disconnect() {
    this.urls.forEach((u) => URL.revokeObjectURL(u))
  }

  // ＋ 画像を追加（ファイルを選ぶ画面を開く）
  pick(event) {
    event.preventDefault()
    this.inputTarget.click()
  }

  // ファイルを選んだ：前に選んだものに足す
  picked() {
    this.add(Array.from(this.inputTarget.files || []))
  }

  dragover(event) {
    event.preventDefault()
    if (this.hasDropTarget) this.dropTarget.classList.add("is-over")
  }

  dragleave() {
    if (this.hasDropTarget) this.dropTarget.classList.remove("is-over")
  }

  dropped(event) {
    event.preventDefault()
    this.dragleave()
    this.add(Array.from(event.dataTransfer?.files || []))
  }

  add(list) {
    const mb = (n) => n * 1024 * 1024
    const notes = []
    for (const f of list) {
      const key = this.keyOf(f)
      if (this.files.some((x) => this.keyOf(x) === key)) continue // 同じ画像はもう入っている
      if (!TYPES.includes(f.type)) { notes.push(`「${f.name}」は画像（PNG・JPEG・WebP・GIF）ではないので入れませんでした`); continue }
      if (f.size > mb(this.maxEachValue)) { notes.push(`「${f.name}」は${this.maxEachValue}MBより大きいので入れませんでした`); continue }
      if (this.files.length >= this.maxFilesValue) { notes.push(`画像は${this.maxFilesValue}枚までです`); break }
      if (this.totalBytes() + f.size > mb(this.maxTotalValue)) { notes.push(`合計${this.maxTotalValue}MBまでなので、「${f.name}」は入れませんでした`); continue }
      this.files.push(f)
    }
    this.sync()
    this.render(notes)
  }

  // × この画像を消す
  remove(event) {
    event.preventDefault()
    const key = event.currentTarget.dataset.key
    const f = this.files.find((x) => this.keyOf(x) === key)
    if (!f) return
    this.files = this.files.filter((x) => x !== f)
    const u = this.urls.get(key)
    if (u) { URL.revokeObjectURL(u); this.urls.delete(key) }
    this.sync()
    this.render()
  }

  keyOf(f) {
    return `${f.name}|${f.size}|${f.lastModified}`
  }

  totalBytes() {
    return this.files.reduce((s, f) => s + f.size, 0)
  }

  // 一覧の画像を、送るための <input type="file"> に入れなおす
  sync() {
    try {
      const dt = new DataTransfer()
      this.files.forEach((f) => dt.items.add(f))
      this.inputTarget.files = dt.files
    } catch (e) {
      // とても古いブラウザ：最後に選んだものだけ送られる（画面はそのまま）
      console.warn(e)
    }
  }

  render(notes = []) {
    const mb = (n) => (n / 1024 / 1024).toFixed(1)
    if (this.hasCountTarget) {
      this.countTarget.textContent = `${this.files.length} / ${this.maxFilesValue}枚・${mb(this.totalBytes())} / ${this.maxTotalValue}MB`
    }
    if (this.hasMessageTarget) {
      this.messageTarget.textContent = notes.join("／")
      this.messageTarget.hidden = notes.length === 0
    }
    if (!this.hasListTarget) return
    this.listTarget.replaceChildren(...this.files.map((f) => {
      const key = this.keyOf(f)
      if (!this.urls.has(key)) this.urls.set(key, URL.createObjectURL(f))
      const li = document.createElement("li")
      li.className = "ip-item"
      const img = document.createElement("img")
      img.src = this.urls.get(key)
      img.alt = ""
      const name = document.createElement("span")
      name.className = "ip-item__name"
      name.textContent = f.name
      const size = document.createElement("span")
      size.className = "ip-item__size"
      size.textContent = `${mb(f.size)}MB`
      const del = document.createElement("button")
      del.type = "button"
      del.className = "ip-item__del"
      del.textContent = "×"
      del.title = "この画像を消す"
      del.setAttribute("aria-label", `${f.name} を消す`)
      del.dataset.key = key
      del.dataset.action = "image-picker#remove"
      li.append(img, name, size, del)
      return li
    }))
    this.listTarget.hidden = this.files.length === 0
  }
}
