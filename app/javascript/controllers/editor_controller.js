import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["canvas"]

  addText() {
    const text = document.createElement("div")

    text.classList.add("editor-text")
    text.textContent = "テキスト"

    text.contentEditable = false
    text.setAttribute("spellcheck", "false")

    text.style.left = "50%"
    text.style.top = "50%"

    // ドラッグ操作
    text.addEventListener("pointerdown", this.startDrag.bind(this))

    // ダブルクリックで文字編集
    text.addEventListener("dblclick", () => {
      text.contentEditable = true
      text.focus()
    })

    // 編集終了
    text.addEventListener("blur", () => {
      text.contentEditable = false
    })

    this.canvasTarget.appendChild(text)
  }

  startDrag(event) {
    // 編集中はドラッグしない
    if (event.currentTarget.isContentEditable) return

    event.preventDefault()

    const text = event.currentTarget
    const canvasRect = this.canvasTarget.getBoundingClientRect()
    const textRect = text.getBoundingClientRect()

    const offsetX = event.clientX - textRect.left
    const offsetY = event.clientY - textRect.top

    text.setPointerCapture(event.pointerId)

    const move = (moveEvent) => {
      const x = moveEvent.clientX - canvasRect.left - offsetX
      const y = moveEvent.clientY - canvasRect.top - offsetY

      text.style.left = `${x}px`
      text.style.top = `${y}px`
      text.style.transform = "none"
    }

    const stop = () => {
      text.removeEventListener("pointermove", move)
      text.removeEventListener("pointerup", stop)
      text.removeEventListener("pointercancel", stop)
    }

    text.addEventListener("pointermove", move)
    text.addEventListener("pointerup", stop)
    text.addEventListener("pointercancel", stop)
  }
}
