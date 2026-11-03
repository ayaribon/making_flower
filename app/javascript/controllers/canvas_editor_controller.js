import { Controller } from "@hotwired/stimulus"
import { Canvas, Textbox, Gradient, Shadow } from "fabric"
import { STYLES, STYLE_DEFAULTS } from "text_styles"

// グラデーションの向きごとの座標（0〜1 の割合で指定）
const GRADIENT_COORDS = {
  vertical:   { x1: 0, y1: 0, x2: 0, y2: 1 },
  horizontal: { x1: 0, y1: 0, x2: 1, y2: 0 },
  diagonal:   { x1: 0, y1: 0, x2: 1, y2: 1 }
}

export default class extends Controller {
  static targets = [
    "frame", "canvas", "textPanel",
    "colorInput", "sizeInput", "sizeValue",
    "tab", "tabPage",
    "fillModeButton", "colorLabel", "color2Input", "directionInput", "gradientOnly",
    "strokeColorInput", "strokeWidthInput", "strokeWidthValue",
    "shadowColorInput",
    "shadowOpacityInput", "shadowOpacityValue", "shadowBlurInput", "shadowBlurValue",
    "shadowXInput", "shadowXValue", "shadowYInput", "shadowYValue"
  ]
  static values = { width: Number, height: Number }

  connect() {
    this.canvas = new Canvas(this.canvasTarget, {
      backgroundColor: "#ffffff",
      preserveObjectStacking: true
    })

        // 選択の変化を見張る
    this.canvas.on("selection:created", () => this.updatePanel())
    this.canvas.on("selection:updated", () => this.updatePanel())
    this.canvas.on("selection:cleared", () => this.updatePanel())

    // ハンドルで拡大縮小したら、サイズの表示を合わせる
    this.canvas.on("object:scaling", () => this.syncInputs())
    this.canvas.on("object:modified", () => this.syncInputs())

    this.fit()

    this.resizeObserver = new ResizeObserver(() => this.fit())
    this.resizeObserver.observe(this.frameTarget)
  }

  disconnect() {
    this.resizeObserver?.disconnect()
    this.canvas?.dispose()
  }

  // 枠の幅に合わせてキャンバスを縮小する
  fit() {
    const frameWidth = this.frameTarget.clientWidth
    if (frameWidth === 0) return

    const scale = frameWidth / this.widthValue

    this.canvas.setDimensions({
      width: this.widthValue * scale,
      height: this.heightValue * scale
    })
    this.canvas.setZoom(scale)
    this.canvas.requestRenderAll()
  }

  // キャンバスの真ん中にテキストを追加する
  addText() {
    const text = new Textbox("テキスト", {
      left: this.widthValue / 2,
      top: this.heightValue / 2,
      originX: "center",
      originY: "center",
      width: 600,
      fontSize: 96,
      fill: "#333333",
      textAlign: "center",
      fontWeight: "bold"
    })

    this.canvas.add(text)
    this.canvas.setActiveObject(text)
    this.canvas.requestRenderAll()
  }

  // 選ばれているものに合わせて、パネルを出したり引っ込めたりする
  updatePanel() {
    const active = this.canvas.getActiveObject()
    const isText = active instanceof Textbox
    this.textPanelTarget.hidden = !isText
    if (isText) this.syncInputs()
  }

  // 選択をやめる（パネルの「閉じる」ボタン）
  deselect() {
    this.canvas.discardActiveObject()
    this.canvas.requestRenderAll()
    this.updatePanel()
  }

  // パネルのタブを切り替える
  switchTab(event) {
    const name = event.params.tab

    this.tabTargets.forEach(tab => {
      tab.classList.toggle("is-active", tab.dataset.tab === name)
    })
    this.tabPageTargets.forEach(page => {
      page.hidden = page.dataset.tab !== name
    })
  }

  // 選んでいるテキストに、文字スタイルをまとめてかける
  async applyStyle(event) {
    const text = this.canvas.getActiveObject()
    if (!(text instanceof Textbox)) return

    const style = STYLES[event.params.style]
    if (!style) return

    // フォントの読み込みを待ってからかける（待たないと別のフォントで描かれてしまう）
    const weight = style.fontWeight || "normal"
    await document.fonts.load(`${weight} 40px "${style.fontFamily}"`, text.text)

    const { label, ...props } = style
    text.set({ ...STYLE_DEFAULTS, ...this.toFabricProps(props) })

    text.initDimensions()
    text.setCoords()
    this.canvas.requestRenderAll()
    this.syncInputs()
  }

  // スタイルのデータを、Fabric.js が分かる形に変換する
  toFabricProps(props) {
    const result = { ...props }

    if (props.fill && props.fill.gradient) {
      const [top, bottom] = props.fill.gradient
      result.fill = this.buildGradient(top, bottom, props.fill.direction || "vertical")
    }

    if (props.shadow) {
      result.shadow = new Shadow(props.shadow)
    }

    return result
  }

  // 2色と向きから、Fabric.js のグラデーションを作る
  buildGradient(color1, color2, direction) {
    return new Gradient({
      type: "linear",
      gradientUnits: "percentage",
      coords: GRADIENT_COORDS[direction] || GRADIENT_COORDS.vertical,
      colorStops: [
        { offset: 0, color: color1 },
        { offset: 1, color: color2 }
      ]
    })
  }

  // グラデーションの座標から、向きの名前を調べる
  directionOf(gradient) {
    const c = gradient.coords || {}
    if (c.x2 > 0 && c.y2 > 0) return "diagonal"
    if (c.x2 > 0) return "horizontal"
    return "vertical"
  }

  // カラーピッカーに入れられる形（#rrggbb）にそろえる
  toHex(color, fallback = "#ffffff") {
    return typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback
  }

  // 選んでいるテキストの今の状態を、入力欄に映す
  syncInputs() {
    const text = this.canvas.getActiveObject()
    if (!(text instanceof Textbox)) return

    // 文字色（単色かグラデーションか）
    if (text.fill instanceof Gradient) {
      const stops = text.fill.colorStops
      this.colorInputTarget.value = this.toHex(stops[0]?.color)
      this.color2InputTarget.value = this.toHex(stops[stops.length - 1]?.color)
      this.directionInputTarget.value = this.directionOf(text.fill)
      this.showFillMode("gradient")
    } else {
      this.colorInputTarget.value = this.toHex(text.fill, "#333333")
      this.showFillMode("solid")
    }

    // フチ
    const strokeWidth = Math.round(text.stroke ? text.strokeWidth : 0)
    this.strokeColorInputTarget.value = this.toHex(text.stroke, "#111111")
    this.strokeWidthInputTarget.value = strokeWidth
    this.strokeWidthValueTarget.textContent = strokeWidth

    // 影
    const shadow = text.shadow
    if (shadow) {
      const { hex, alpha } = this.parseColor(shadow.color)
      this.shadowColorInputTarget.value = hex
      this.setShadowInputs(Math.round(alpha * 100), shadow.blur || 0, shadow.offsetX || 0, shadow.offsetY || 0)
    } else {
      this.shadowColorInputTarget.value = "#000000"
      this.setShadowInputs(0, 0, 0, 0)
    }

    const size = Math.round(text.fontSize * text.scaleY)
    this.sizeInputTarget.value = size
    this.sizeValueTarget.textContent = size
  }

  // 「単色／グラデーション」の表示を切り替える（見た目だけ）
  showFillMode(mode) {
    this.fillMode = mode
    const isGradient = mode === "gradient"

    this.fillModeButtonTargets.forEach(button => {
      button.classList.toggle("is-active", button.dataset.mode === mode)
    })
    this.gradientOnlyTargets.forEach(el => {
      el.hidden = !isGradient
    })
    this.colorLabelTarget.textContent = isGradient ? "色1" : "文字色"
  }

  // 「単色／グラデーション」のボタンを押したとき
  changeFillMode(event) {
    const text = this.canvas.getActiveObject()
    if (!(text instanceof Textbox)) return

    const mode = event.params.mode

    // 初めてグラデーションにするときは、色2を少し違う色にしておく
    if (mode === "gradient" && this.color2InputTarget.value === this.colorInputTarget.value) {
      this.color2InputTarget.value = "#ff4fd8"
    }

    this.showFillMode(mode)
    this.applyFill(text)
  }

  // 色・色2・向きが変わったとき
  changeFill() {
    const text = this.canvas.getActiveObject()
    if (!(text instanceof Textbox)) return

    this.applyFill(text)
  }

  // フチの色・太さが変わったとき
  // 影のスライダー4つに値を入れて、数字の表示もそろえる
  setShadowInputs(opacity, blur, x, y) {
    this.shadowOpacityInputTarget.value = opacity
    this.shadowBlurInputTarget.value = Math.round(blur)
    this.shadowXInputTarget.value = Math.round(x)
    this.shadowYInputTarget.value = Math.round(y)
    this.updateShadowLabels()
  }

  updateShadowLabels() {
    this.shadowOpacityValueTarget.textContent = this.shadowOpacityInputTarget.value
    this.shadowBlurValueTarget.textContent = this.shadowBlurInputTarget.value
    this.shadowXValueTarget.textContent = this.shadowXInputTarget.value
    this.shadowYValueTarget.textContent = this.shadowYInputTarget.value
  }

  // 影の色・濃さ・ぼかし・ずれが変わったとき
  changeShadow() {
    const text = this.canvas.getActiveObject()
    if (!(text instanceof Textbox)) return

    this.updateShadowLabels()

    const opacity = Number(this.shadowOpacityInputTarget.value)
    if (opacity === 0) {
      text.set("shadow", null)
    } else {
      text.set("shadow", new Shadow({
        color: this.toRgba(this.shadowColorInputTarget.value, opacity / 100),
        blur: Number(this.shadowBlurInputTarget.value),
        offsetX: Number(this.shadowXInputTarget.value),
        offsetY: Number(this.shadowYInputTarget.value)
      }))
    }
    this.canvas.requestRenderAll()
  }

  // "#rrggbb" と濃さ（0〜1）から "rgba(r,g,b,a)" を作る
  toRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${alpha})`
  }

  // "#rrggbb" や "rgba(r,g,b,a)" を、色（#rrggbb）と濃さ（0〜1）に分ける
  parseColor(color) {
    if (typeof color !== "string") return { hex: "#000000", alpha: 1 }

    if (/^#[0-9a-fA-F]{6}$/.test(color)) return { hex: color, alpha: 1 }

    const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/)
    if (!m) return { hex: "#000000", alpha: 1 }

    const hex = "#" + [m[1], m[2], m[3]]
      .map(n => Number(n).toString(16).padStart(2, "0"))
      .join("")
    const alpha = m[4] === undefined ? 1 : Number(m[4])
    return { hex, alpha }
  }

  // フチの色・太さが変わったとき
  changeStroke() {
    const text = this.canvas.getActiveObject()
    if (!(text instanceof Textbox)) return

    const width = Number(this.strokeWidthInputTarget.value)
    this.strokeWidthValueTarget.textContent = width

    if (width === 0) {
      text.set({ stroke: null, strokeWidth: 0 })
    } else {
      text.set({
        stroke: this.strokeColorInputTarget.value,
        strokeWidth: width,
        paintFirst: "stroke",       // フチを文字の外側に描く
        strokeLineJoin: "round"     // 角を丸くしてトゲトゲを防ぐ
      })
    }
    this.canvas.requestRenderAll()
  }

  // 今の入力欄の値で、文字色をかけ直す
  applyFill(text) {
    if (this.fillMode === "gradient") {
      text.set("fill", this.buildGradient(
        this.colorInputTarget.value,
        this.color2InputTarget.value,
        this.directionInputTarget.value
      ))
    } else {
      text.set("fill", this.colorInputTarget.value)
    }
    this.canvas.requestRenderAll()
  }

  // 見た目のサイズを変える（ハンドルで拡大していても、表示どおりの大きさになる）
  changeSize(event) {
    const text = this.canvas.getActiveObject()
    if (!(text instanceof Textbox)) return

    const size = Number(event.target.value)
    text.set("fontSize", size / text.scaleY)
    text.initDimensions()
    text.setCoords()

    this.sizeValueTarget.textContent = size
    this.canvas.requestRenderAll()
  }

  // 選んでいるものを削除する
  deleteSelected() {
    const active = this.canvas.getActiveObject()
    if (!active) return

    // 文字を打ち替えている最中は消さない
    if (active.isEditing) return

    this.canvas.remove(active)
    this.canvas.discardActiveObject()
    this.canvas.requestRenderAll()
    this.updatePanel()
  }

  // PC用：Delete / Backspace キーで削除する
  onKeydown(event) {
    if (event.key !== "Delete" && event.key !== "Backspace") return

    // カラーピッカーやスライダーなどの入力欄を触っているときは無視する
    const tag = document.activeElement?.tagName
    if (tag === "INPUT" || tag === "TEXTAREA") return

    const active = this.canvas.getActiveObject()
    if (!active || active.isEditing) return

    // Backspace でブラウザが「前のページに戻る」のを防ぐ
    event.preventDefault()
    this.deleteSelected()
  }
}
