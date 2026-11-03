import { Controller } from "@hotwired/stimulus"

// 部品・背景の一覧を、上のタグボタンで絞り込む（プリクラの編集画面みたいな感じ）
//   すべて … 全部出す
//   各タグ … data-tags にそのタグを持つ素材だけ出す
//   マイ素材 … 自分で入れた画像（と「自分の画像を追加」ボタン）だけ出す
export default class extends Controller {
  static targets = ["button", "item"]

  connect() {
    this.current = "all"
    this.apply()
  }

  choose(event) {
    this.current = event.params.tag
    this.apply()
  }

  apply() {
    this.buttonTargets.forEach(b => b.classList.toggle("is-active", b.dataset.tag === this.current))

    // 自分の画像は、あとから一覧に足されるので、その場で探す
    const mine = this.element.querySelectorAll(".studio-my-list, .studio-my-add")
    const showMine = this.current === "all" || this.current === "mine"
    mine.forEach(el => { el.hidden = !showMine })

    this.itemTargets.forEach(item => {
      if (this.current === "all") { item.hidden = false; return }
      if (this.current === "mine") { item.hidden = !item.dataset.keepInMine; return }
      const tags = (item.dataset.tags || "").split(",")
      item.hidden = !tags.includes(this.current)
    })
  }
}
