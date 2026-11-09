import { Controller } from "@hotwired/stimulus"

// 🏠 メインメニュー：ボタンを押したら、SiVA の画像を画面いっぱいに一瞬出してから移動する
// PC（横長の画面）はバナー、スマホ（縦長・小さい画面）はアイコンを真ん中に（どちらを出すかは CSS で切りかえ）
const SHOW_MS = 900 // 画像を見せる時間（ミリ秒）

export default class extends Controller {
  static targets = ["splash"]

  connect() {
    this.leaving = false
    // ブラウザの「戻る」でこのページに戻ったとき、画像が出たままにならないように
    this.onPageShow = (e) => { if (e.persisted) this.reset() }
    window.addEventListener("pageshow", this.onPageShow)
  }

  disconnect() {
    window.removeEventListener("pageshow", this.onPageShow)
    clearTimeout(this.timer)
  }

  go(event) {
    const href = event.currentTarget.getAttribute("href")
    if (!href) return
    // 新しいタブで開く（Ctrl・⌘・中クリック）ときは、ふつうのリンクのまま
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1) return
    event.preventDefault()
    if (this.leaving) return
    this.leaving = true

    // 動きを減らす設定の人には、画像は出すけど動かさない
    this.splashTarget.hidden = false
    // 次の描画で表示用のクラスを付ける（hidden を外した直後だとアニメーションが効かないため）
    requestAnimationFrame(() => this.splashTarget.classList.add("is-show"))

    this.timer = setTimeout(() => {
      // 編集画面・歌ってみたは重い画面なので、Turbo を使わずにふつうに移動する
      // （ほかの画面へのリンクも data-turbo=false にそろえている）
      window.location.href = href
    }, SHOW_MS)
  }

  reset() {
    clearTimeout(this.timer)
    this.leaving = false
    if (this.hasSplashTarget) {
      this.splashTarget.classList.remove("is-show")
      this.splashTarget.hidden = true
    }
  }
}
