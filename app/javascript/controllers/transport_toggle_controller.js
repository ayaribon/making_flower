import { Controller } from "@hotwired/stimulus"

// 🎤 歌ってみた画面の 下の再生バー（.sg-transport）
// - 画面の何もない所をタップすると、再生バーを かくす。もう一度タップするか、右下の「▲ 再生バー」で出す
// - 再生バーの本当の高さぶん、ページの下に すきま をあける（スマホでボタンが2段・メッセージが2行になっても「次へ」がかくれない）
// - 録音・書き出し・処理中は かくさない（止めるボタンが見えなくならないように）。かくしている間にそうなったら出す
// singing_mixer_controller.js は さわらない（data-mode を読むだけ）
const BUSY_MODES = ["micRecording", "punching", "exporting", "processing", "calibrating", "levelCheck"]
// ここをタップしたときは「何もない所」ではない（ボタン・入力・絵・動画など）
const NOT_BLANK = [
  "a", "button", "input", "select", "textarea", "label", "summary", "option",
  "canvas", "video", "audio", "svg", "iframe", "img", "dialog",
  "[data-action]", "[role=button]", "[role=slider]", "[role=tab]", "[contenteditable]", "[tabindex]",
  ".sg-transport"
].join(", ")

export default class extends Controller {
  connect() {
    this.bar = this.element.querySelector(".sg-transport")
    if (!this.bar) return
    this.hiddenBar = false

    this.handle = document.createElement("button")
    this.handle.type = "button"
    this.handle.className = "sg-transport-handle"
    this.handle.textContent = "▲ 再生バー"
    this.handle.setAttribute("aria-label", "再生バーを出す")
    this.handle.hidden = true
    this.handle.addEventListener("click", () => this.show())
    this.element.append(this.handle)

    this.onClick = (e) => this.toggleOnBlank(e)
    this.element.addEventListener("click", this.onClick)

    this.resizeObserver = new ResizeObserver(() => this.updateSpace())
    this.resizeObserver.observe(this.bar)
    this.modeObserver = new MutationObserver(() => { if (this.hiddenBar && this.busy()) this.show() })
    this.modeObserver.observe(this.element, { attributes: true, attributeFilter: ["data-mode"] })
    this.updateSpace()
  }

  disconnect() {
    if (!this.bar) return
    this.element.removeEventListener("click", this.onClick)
    this.resizeObserver.disconnect()
    this.modeObserver.disconnect()
    this.handle.remove()
    this.show()
    this.element.classList.remove("has-transport-space")
    this.element.style.removeProperty("--sg-transport-space")
  }

  busy() {
    return BUSY_MODES.includes(this.element.dataset.mode)
  }

  toggleOnBlank(e) {
    if (e.defaultPrevented || e.button > 0) return
    const target = e.target
    if (!(target instanceof Element)) return
    // 一番外がわ（.sg）にも data-action があるので、それは数えない
    const hit = target.closest(NOT_BLANK)
    if (hit && hit !== this.element) return
    // 文字を えらんでいるときは何もしない
    if (String(window.getSelection?.() || "").length > 0) return
    if (this.hiddenBar) this.show()
    else this.hide()
  }

  hide() {
    if (this.busy()) return
    this.hiddenBar = true
    this.element.classList.add("is-transport-hidden")
    this.bar.inert = true
    this.handle.hidden = false
    this.updateSpace()
  }

  show() {
    this.hiddenBar = false
    this.element.classList.remove("is-transport-hidden")
    this.bar.inert = false
    this.handle.hidden = true
    this.updateSpace()
  }

  // ページの下の すきま（CSS の --sg-transport-space）
  updateSpace() {
    const h = this.hiddenBar ? (this.handle.offsetHeight || 40) + 12 : this.bar.offsetHeight
    this.element.style.setProperty("--sg-transport-space", `${Math.ceil(h)}px`)
    this.element.classList.add("has-transport-space")
  }
}
