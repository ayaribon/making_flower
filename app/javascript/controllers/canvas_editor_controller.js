import { Controller } from "@hotwired/stimulus"
import { Canvas, Textbox, Gradient, Shadow, FabricImage } from "fabric"
import { STYLES, STYLE_DEFAULTS } from "text_styles"
import { saveImage, listImages, getImageUrl, deleteImage } from "image_store"

// 選べる比率とキャンバスの実寸
const RATIOS = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 1080, height: 1920 },
  "1:1":  { width: 1080, height: 1080 }
}

// グラデーションの向きごとの座標（0〜1 の割合で指定）
const GRADIENT_COORDS = {
  vertical:   { x1: 0, y1: 0, x2: 0, y2: 1 },
  horizontal: { x1: 0, y1: 0, x2: 1, y2: 0 },
  diagonal:   { x1: 0, y1: 0, x2: 1, y2: 1 }
}

// 元に戻す／やり直すで覚えておく最大の回数
const HISTORY_LIMIT = 30

// 保存するときに、Fabric.js の標準の項目に加えて残しておく項目
const EXTRA_PROPS = [
  "locked", "imageId", "sourceName", "sourceUrl", "placeholder", "effect", "effectKey", "effectStrength", "effectColor", "selectable", "evented", "editable", "hasControls", "hoverCursor",
  "lockMovementX", "lockMovementY", "lockScalingX", "lockScalingY", "lockRotation"
]

export default class extends Controller {
  static targets = [
    "frame", "canvas", "textPanel",
    "colorInput", "sizeInput", "sizeValue",
    "tab", "tabPage",
    "fillModeButton", "colorLabel", "color2Input", "directionInput", "gradientOnly",
    "strokeColorInput", "strokeWidthInput", "strokeWidthValue",
    "shadowColorInput",
    "shadowOpacityInput", "shadowOpacityValue", "shadowBlurInput", "shadowBlurValue",
    "shadowXInput", "shadowXValue", "shadowYInput", "shadowYValue",
    "bgPanel", "bgModeButton", "bgColorLabel", "bgColorInput", "bgColor2Input",
    "bgDirectionInput", "bgGradientOnly",
    "partsPanel", "partPanel", "partOpacityInput", "partOpacityValue",
    "lockButton",
    "ratioPicker", "ratioClose", "sizeBadge",
    "partFileInput", "bgFileInput", "myPartList", "myBgList",
    "undoButton", "redoButton", "credit",
    "effectsPanel", "effectTab", "effectPage", "effectToggle", "effectStrength", "tintInput", "frameButton",
    "templatesPanel", "templateList", "replaceButton", "replaceHint"
  ]
  static values = { width: Number, height: Number, materials: Object }

  connect() {
    this.canvas = new Canvas(this.canvasTarget, {
      backgroundColor: "#ffffff",
      preserveObjectStacking: true
    })

        // 選択の変化を見張る
    this.canvas.on("selection:created", () => this.updatePanel())
    // 引用元のある素材を選んだら、右下に引用元を出す
    const credit = () => {
      const a = this.canvas.getActiveObject()
      if (a?.sourceName) this.showCredit(a.sourceName, a.sourceUrl)
    }
    this.canvas.on("selection:created", credit)
    this.canvas.on("selection:updated", credit)
    this.canvas.on("selection:updated", () => this.updatePanel())
    this.canvas.on("selection:cleared", () => this.updatePanel())

    // ハンドルで拡大縮小したら、サイズの表示を合わせる
    this.canvas.on("object:scaling", () => this.syncInputs())
    this.canvas.on("object:modified", () => this.syncInputs())

    // 触ったものをいちばん上に持ってくる（ロック中のものは動かさない）
    this.canvas.on("mouse:down", ({ target }) => {
      if (!target || target.locked) return
      this.canvas.bringObjectToFront(target)
      this.raiseEffects()  // エフェクトはいつもいちばん上
      this.canvas.requestRenderAll()
    })

    // 動かしている間は、下のバーとパネルを隠す（指を離したら戻す）
    const startDrag = () => this.element.classList.add("is-dragging")
    this.canvas.on("object:moving", startDrag)
    this.canvas.on("object:scaling", startDrag)
    this.canvas.on("object:rotating", startDrag)
    this.canvas.on("mouse:up", () => this.element.classList.remove("is-dragging"))

    this.fit()

    // 文字や部品を足したら、エフェクトをいちばん上に戻す
    this.effectSeq = {}
    this.canvas.on("object:added", ({ target }) => {
      if (target && !target.effect) this.raiseEffects()
    })

    // ===== 元に戻す／やり直すの記録 =====
    this.undoStack = []
    this.redoStack = []
    this.restoring = false
    this.lastState = this.serialize()
    this.updateHistoryButtons()

    // キャンバスの中で何か変わったら記録する
    const schedule = () => this.scheduleSnapshot()
    ;["object:added", "object:removed", "object:modified", "text:editing:exited"]
      .forEach(name => this.canvas.on(name, schedule))

    // パネルのボタン・色・スライダーなどを触ったときも記録する
    // （スライダーを動かしている間は何度も呼ばれるが、止まってから1回だけ記録する）
    this.onUiChange = () => this.scheduleSnapshot()
    ;["input", "change", "click"].forEach(name => this.element.addEventListener(name, this.onUiChange))

    this.resizeObserver = new ResizeObserver(() => this.fit())
    this.resizeObserver.observe(this.frameTarget)
  }

  disconnect() {
    clearTimeout(this.snapshotTimer)
    ;["input", "change", "click"].forEach(name => this.element.removeEventListener(name, this.onUiChange))
    this.resizeObserver?.disconnect()
    this.canvas?.dispose()
  }

  // ===== テンプレート =====

  async toggleTemplatesPanel() {
    if (!this.templatesPanelTarget.hidden) {
      this.closeTemplatesPanel()
      return
    }
    this.canvas.discardActiveObject()
    this.canvas.requestRenderAll()
    ;[this.textPanelTarget, this.partPanelTarget, this.bgPanelTarget, this.partsPanelTarget, this.effectsPanelTarget]
      .forEach(panel => { panel.hidden = true })
    this.templatesPanelTarget.hidden = false
    await this.renderTemplates()
  }

  closeTemplatesPanel() {
    this.templatesPanelTarget.hidden = true
  }

  // テンプレの一覧は、最初の1回だけ読み込む
  loadTemplates() {
    if (!this.templatesPromise) {
      this.templatesPromise = fetch("/design_templates/templates.json", { cache: "no-cache" })
        .then(response => {
          if (!response.ok) throw new Error(`テンプレの読み込みに失敗しました（${response.status}）`)
          return response.json()
        })
        .catch(error => {
          this.templatesPromise = null
          throw error
        })
    }
    return this.templatesPromise
  }

  // 今の比率の名前（"16:9" など）
  ratioKey() {
    const entry = Object.entries(RATIOS)
      .find(([, size]) => size.width === this.widthValue && size.height === this.heightValue)
    return entry ? entry[0] : "16:9"
  }

  async renderTemplates() {
    const list = this.templateListTarget
    list.innerHTML = '<p class="studio-tab-note">読み込み中…</p>'
    try {
      const data = await this.loadTemplates()
      const items = data.templates.filter(t => t.ratio === this.ratioKey())
      list.innerHTML = ""
      if (items.length === 0) {
        list.innerHTML = '<p class="studio-tab-note">この比率のテンプレはまだありません</p>'
        return
      }
      items.forEach(t => {
        const button = document.createElement("button")
        button.type = "button"
        button.className = "studio-template-card"
        button.style.setProperty("--tpl-a", t.preview?.[0] || "#9b7bff")
        button.style.setProperty("--tpl-b", t.preview?.[1] || "#3fd6d0")
        button.style.aspectRatio = `${t.width} / ${t.height}`
        button.innerHTML = '<span class="studio-template-icon"></span><span class="studio-template-label"></span>'
        button.querySelector(".studio-template-icon").textContent = t.icon || "📋"
        button.querySelector(".studio-template-label").textContent = t.label
        button.addEventListener("click", () => this.applyTemplate(t))
        list.appendChild(button)
      })
    } catch (error) {
      console.error(error)
      list.innerHTML = '<p class="studio-tab-note">テンプレを読み込めませんでした</p>'
    }
  }

  // テンプレを読み込む（今の中身は置き換える。「戻す」で取り消せる）
  async applyTemplate(t) {
    const hasContent = this.canvas.getObjects().length > 0 || this.canvas.backgroundImage
    if (hasContent && !window.confirm(`今の中身を「${t.label}」に置き換えますか？\n（「↩️ 戻す」で元に戻せます）`)) return

    clearTimeout(this.snapshotTimer)
    this.takeSnapshot()

    this.restoring = true
    try {
      this.canvas.discardActiveObject()
      this.canvas.remove(...this.canvas.getObjects())
      this.canvas.backgroundImage = null
      this.canvas.backgroundColor = "#ffffff"
      this.replaceTarget = null

      if (t.width !== this.widthValue || t.height !== this.heightValue) {
        this.resizeCanvas(t.width, t.height)
        this.ratioChosen = true
      }
      const W = this.widthValue
      const H = this.heightValue

      const bg = t.background || {}
      if (bg.gradient) {
        const [c1, c2, direction] = bg.gradient
        this.canvas.backgroundColor = this.buildCanvasGradient(c1, c2, direction || "vertical")
      } else if (bg.color) {
        this.canvas.backgroundColor = bg.color
      }
      // 背景の画像は、素材のキー（material）で探す。見つからなければ背景画像なしで続ける
      const bgMaterial = this.findMaterial(bg.material)
      if (bgMaterial) {
        await this.placeBackground(bgMaterial.src)
        const bgImg = this.canvas.backgroundImage
        if (bgImg && bgMaterial.sourceName) bgImg.set({ sourceName: bgMaterial.sourceName, sourceUrl: bgMaterial.sourceUrl })
      }

      // 文字・部品・「ここに画像」（書いてある順に下から重ねる）
      for (const item of t.items || []) {
        if (item.type === "text") await this.addTemplateText(item, W, H)
        else if (item.type === "part") await this.addTemplatePart(item, W, H)
        else if (item.type === "placeholder") await this.addPlaceholder(item, W, H)
      }

      for (const f of t.filters || []) await this.setFilter(f.key, f.strength, f.color || null)
      if (t.frame) await this.applyFrame(t.frame)

      this.raiseEffects()
      this.canvas.requestRenderAll()
    } catch (error) {
      console.error(error)
      window.alert("テンプレの読み込み中にエラーが出ました。「↩️ 戻す」で元に戻せます")
    } finally {
      this.restoring = false
    }

    this.closeTemplatesPanel()
    this.syncEffectInputs()
    this.takeSnapshot()
  }

  // 位置（x, y）と幅（w）は、キャンバスに対する割合（0〜1）で書いてある
  async addTemplateText(item, W, H) {
    const { label, ...styleProps } = (item.style && STYLES[item.style]) || {}
    const props = {
      ...STYLE_DEFAULTS,
      ...this.toFabricProps(styleProps),
      ...this.toFabricProps(item.props || {})
    }
    if (item.size) props.fontSize = item.size
    if (item.angle !== undefined) props.angle = item.angle

    if (props.fontFamily) {
      await document.fonts.load(`${props.fontWeight || "normal"} 40px "${props.fontFamily}"`, item.text)
    }

    const text = new Textbox(item.text, {
      ...props,
      left: item.x * W,
      top: item.y * H,
      originX: "center",
      originY: "center",
      width: (item.w || 0.8) * W,
      textAlign: "center"
    })
    this.canvas.add(text)
  }

  // 部品の大きさ（h）は、キャンバスの高さに対する割合
  async addTemplatePart(item, W, H) {
    // 部品は、素材のキー（material）で探す。見つからない部品は飛ばして、ほかは読み込む
    const material = this.findMaterial(item.material)
    if (!material) return

    const img = await FabricImage.fromURL(material.src)
    if (material.sourceName) img.set({ sourceName: material.sourceName, sourceUrl: material.sourceUrl })

    const scale = ((item.h || 0.2) * H) / img.height
    img.set({
      originX: "center",
      originY: "center",
      left: item.x * W,
      top: item.y * H,
      scaleX: scale,
      scaleY: scale,
      angle: item.angle || 0,
      flipX: !!item.flipX,
      opacity: item.opacity ?? 1
    })
    this.canvas.add(img)
  }

  // テンプレが使う素材を、キーから探す（管理画面の素材から作った表）
  findMaterial(key) {
    if (!key) return null
    const material = this.materialsValue?.[key]
    if (!material) console.warn(`テンプレの素材「${key}」が見つかりません（管理画面の素材にキーがあるか確認してね）`)
    return material || null
  }

  // 立ち絵などを入れる「ここに画像」の仮の枠
  async addPlaceholder(item, W, H) {
    const w = Math.round((item.w || 0.4) * W)
    const h = Math.round((item.h || 0.8) * H)
    const r = Math.round(Math.min(w, h) * 0.06)
    const fs = Math.round(Math.min(w, h) * 0.09)
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      `<rect x="4" y="4" width="${w - 8}" height="${h - 8}" rx="${r}" fill="#ffffff" fill-opacity="0.3" ` +
      `stroke="#ffffff" stroke-width="6" stroke-dasharray="24 14"/>` +
      `<text x="50%" y="46%" text-anchor="middle" font-family="sans-serif" font-weight="bold" ` +
      `font-size="${fs}" fill="#ffffff">📷 ここに画像</text>` +
      `<text x="50%" y="58%" text-anchor="middle" font-family="sans-serif" ` +
      `font-size="${Math.round(fs * 0.55)}" fill="#ffffff">タップして差し替え</text></svg>`

    const img = await FabricImage.fromURL("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg))
    img.set({
      originX: "center",
      originY: "center",
      left: item.x * W,
      top: item.y * H,
      placeholder: true
    })
    this.canvas.add(img)
  }

  // 「ここに画像」を選んで「📷 自分の画像に差し替え」を押したとき
  replacePlaceholder() {
    const ph = this.canvas.getActiveObject()
    if (!ph?.placeholder) return

    this.togglePartsPanel()   // 部品パネル（自分の画像の一覧）を開く
    this.replaceTarget = ph
    if (this.hasReplaceHintTarget) this.replaceHintTarget.hidden = false
  }

  // ===== エフェクト（フィルター・フレーム） =====
  // どちらも「触れない画像」として、キャンバスのいちばん上に重ねる

  toggleEffectsPanel() {
    if (!this.effectsPanelTarget.hidden) {
      this.closeEffectsPanel()
      return
    }
    this.canvas.discardActiveObject()
    this.canvas.requestRenderAll()
    ;[this.textPanelTarget, this.partPanelTarget, this.bgPanelTarget, this.partsPanelTarget, this.templatesPanelTarget]
      .forEach(panel => { panel.hidden = true })
    this.syncEffectInputs()
    this.effectsPanelTarget.hidden = false
  }

  closeEffectsPanel() {
    this.effectsPanelTarget.hidden = true
  }

  switchEffectTab(event) {
    const name = event.params.tab
    this.effectTabTargets.forEach(tab => tab.classList.toggle("is-active", tab.dataset.tab === name))
    this.effectPageTargets.forEach(page => { page.hidden = page.dataset.tab !== name })
  }

  effectObjects(kind) {
    return this.canvas.getObjects().filter(o => o.effect && (!kind || o.effect === kind))
  }

  removeEffect(kind, key = null) {
    this.effectObjects(kind)
      .filter(o => key === null || o.effectKey === key)
      .forEach(o => this.canvas.remove(o))
  }

  // エフェクトを、文字や部品より上に持ってくる（フィルターの上にフレーム）
  raiseEffects() {
    this.effectObjects("filter").forEach(o => this.canvas.bringObjectToFront(o))
    this.effectObjects("frame").forEach(o => this.canvas.bringObjectToFront(o))
  }

  strengthOf(key) {
    const input = this.effectStrengthTargets.find(i => i.dataset.key === key)
    return input ? Number(input.value) / 100 : 0.5
  }

  async toggleFilter(event) {
    const key = event.params.key
    if (this.effectObjects("filter").some(o => o.effectKey === key)) {
      this.effectSeq[key] = (this.effectSeq[key] || 0) + 1  // 作りかけの分は捨てる
      this.removeEffect("filter", key)
      this.canvas.requestRenderAll()
    } else {
      await this.setFilter(key, this.strengthOf(key))
    }
    this.syncEffectInputs()
  }

  async changeFilterStrength(event) {
    const key = event.params.key
    if (!this.effectObjects("filter").some(o => o.effectKey === key)) return
    await this.setFilter(key, this.strengthOf(key))
  }

  async changeTint() {
    if (!this.effectObjects("filter").some(o => o.effectKey === "tint")) return
    await this.setFilter("tint", this.strengthOf("tint"))
  }

  async setFilter(key, strength, color = null) {
    const seq = this.effectSeq[key] = (this.effectSeq[key] || 0) + 1
    if (key === "tint") color = color || this.tintInputTarget.value

    const img = await this.svgToImage(this.buildFilterSvg(key, strength, color))
    if (seq !== this.effectSeq[key]) return  // スライダーを動かし続けている間は、最新の分だけ使う

    this.removeEffect("filter", key)
    img.set({ effect: "filter", effectKey: key, effectStrength: strength, effectColor: color })
    this.canvas.add(img)
    this.raiseEffects()
    this.canvas.requestRenderAll()
  }

  async setFrame(event) {
    await this.applyFrame(event.params.frame)
    this.syncEffectInputs()
  }

  async applyFrame(key) {
    const seq = this.effectSeq.__frame = (this.effectSeq.__frame || 0) + 1
    if (!key || key === "none") {
      this.removeEffect("frame")
      this.canvas.requestRenderAll()
      return
    }
    const img = await this.svgToImage(this.buildFrameSvg(key))
    if (seq !== this.effectSeq.__frame) return

    this.removeEffect("frame")
    img.set({ effect: "frame", effectKey: key })
    this.canvas.add(img)
    this.raiseEffects()
    this.canvas.requestRenderAll()
  }

  // 比率を変えたとき、エフェクトを新しい大きさで作り直す
  async rebuildEffects() {
    const filters = this.effectObjects("filter")
      .map(o => ({ key: o.effectKey, strength: o.effectStrength, color: o.effectColor }))
    const frame = this.effectObjects("frame")[0]?.effectKey
    for (const f of filters) await this.setFilter(f.key, f.strength, f.color)
    if (frame) await this.applyFrame(frame)
  }

  // 今のエフェクトの状態を、パネルのボタンとスライダーに映す
  syncEffectInputs() {
    if (!this.hasEffectsPanelTarget) return
    const filters = this.effectObjects("filter")

    this.effectToggleTargets.forEach(button => {
      button.classList.toggle("is-active", filters.some(o => o.effectKey === button.dataset.key))
    })
    filters.forEach(o => {
      const input = this.effectStrengthTargets.find(i => i.dataset.key === o.effectKey)
      if (input && o.effectStrength) input.value = Math.round(o.effectStrength * 100)
      if (o.effectKey === "tint" && o.effectColor) this.tintInputTarget.value = o.effectColor
    })

    const frame = this.effectObjects("frame")[0]?.effectKey || "none"
    this.frameButtonTargets.forEach(button => {
      button.classList.toggle("is-active", button.dataset.key === frame)
    })
  }

  // SVG の文字列を、触れない画像にする
  async svgToImage(svg) {
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg)
    const img = await FabricImage.fromURL(url)
    img.set({
      left: 0, top: 0, originX: "left", originY: "top",
      scaleX: this.widthValue / img.width,
      scaleY: this.heightValue / img.height,
      selectable: false, evented: false, hasControls: false, hoverCursor: "default"
    })
    return img
  }

  // いつも同じ並びになる乱数（キラキラの位置が、作り直すたびに変わらないように）
  seededRandom(seed) {
    let s = seed
    return () => {
      s = (s * 16807) % 2147483647
      return (s - 1) / 2147483646
    }
  }

  starPath(x, y, r) {
    return `M${x},${y - r} Q${x},${y} ${x + r},${y} Q${x},${y} ${x},${y + r} ` +
           `Q${x},${y} ${x - r},${y} Q${x},${y} ${x},${y - r} Z`
  }

  buildFilterSvg(key, s, color) {
    const W = this.widthValue
    const H = this.heightValue
    const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`

    switch (key) {
      case "scanline":
        return head +
          `<defs><pattern id="p" width="4" height="4" patternUnits="userSpaceOnUse">` +
          `<rect width="4" height="2" fill="#000" fill-opacity="${(0.4 * s).toFixed(3)}"/></pattern></defs>` +
          `<rect width="${W}" height="${H}" fill="url(#p)"/></svg>`

      case "dots":
        return head +
          `<defs><pattern id="p" width="10" height="10" patternUnits="userSpaceOnUse">` +
          `<circle cx="5" cy="5" r="1.6" fill="#ffffff" fill-opacity="${(0.7 * s).toFixed(3)}"/></pattern></defs>` +
          `<rect width="${W}" height="${H}" fill="url(#p)"/></svg>`

      case "sparkle": {
        const rand = this.seededRandom(20261104)
        const count = Math.round(20 + 70 * s)
        const unit = Math.min(W, H) / 720
        let stars = ""
        for (let i = 0; i < count; i++) {
          const x = (rand() * W).toFixed(1)
          const y = (rand() * H).toFixed(1)
          const r = ((4 + rand() * 18) * unit).toFixed(1)
          const op = (0.5 + rand() * 0.5).toFixed(2)
          stars += `<path d="${this.starPath(Number(x), Number(y), Number(r))}" fill="#ffffff" fill-opacity="${op}"/>`
        }
        return head + stars + `</svg>`
      }

      case "vignette":
        return head +
          `<defs><radialGradient id="g" cx="50%" cy="50%" r="75%">` +
          `<stop offset="0.55" stop-color="#000" stop-opacity="0"/>` +
          `<stop offset="1" stop-color="#000" stop-opacity="${(0.85 * s).toFixed(3)}"/></radialGradient></defs>` +
          `<rect width="${W}" height="${H}" fill="url(#g)"/></svg>`

      case "tint":
        return head +
          `<rect width="${W}" height="${H}" fill="${color || "#7b5cff"}" fill-opacity="${(0.45 * s).toFixed(3)}"/></svg>`
    }
    return head + `</svg>`
  }

  buildFrameSvg(key) {
    const W = this.widthValue
    const H = this.heightValue
    const m = Math.min(W, H)
    const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`

    switch (key) {
      case "pixel": {
        // ドット絵っぽい、ガタガタのフチ
        const t = Math.round(m * 0.03)
        const u = Math.max(6, Math.round(t / 2))
        let d = `<path fill-rule="evenodd" fill="#1e8fd8" d="M0,0H${W}V${H}H0Z M${t},${t}V${H - t}H${W - t}V${t}Z"/>`
        let i = 0
        for (let x = t; x < W - t; x += u, i++) {
          const fill = i % 2 ? "#3fd6d0" : "#ffffff"
          d += `<rect x="${x}" y="${t}" width="${u}" height="${u}" fill="${fill}"/>`
          d += `<rect x="${x}" y="${H - t - u}" width="${u}" height="${u}" fill="${fill}"/>`
        }
        i = 0
        for (let y = t; y < H - t; y += u, i++) {
          const fill = i % 2 ? "#3fd6d0" : "#ffffff"
          d += `<rect x="${t}" y="${y}" width="${u}" height="${u}" fill="${fill}"/>`
          d += `<rect x="${W - t - u}" y="${y}" width="${u}" height="${u}" fill="${fill}"/>`
        }
        return head + d + `</svg>`
      }

      case "ribbon": {
        const pad = m * 0.025
        const bow = (cx, cy, r) =>
          `<g stroke="#ffffff" stroke-width="${(r * 0.12).toFixed(1)}">` +
          `<ellipse cx="${cx - r * 0.7}" cy="${cy}" rx="${r * 0.75}" ry="${r * 0.5}" fill="#ff8ccf"/>` +
          `<ellipse cx="${cx + r * 0.7}" cy="${cy}" rx="${r * 0.75}" ry="${r * 0.5}" fill="#ff8ccf"/>` +
          `<circle cx="${cx}" cy="${cy}" r="${r * 0.32}" fill="#ff5fb7"/></g>`
        const r = m * 0.06
        return head +
          `<rect x="${pad}" y="${pad}" width="${W - pad * 2}" height="${H - pad * 2}" rx="${m * 0.03}" ` +
          `fill="none" stroke="#ff8ccf" stroke-width="${(m * 0.012).toFixed(1)}"/>` +
          bow(pad + r * 1.4, pad + r * 0.8, r) + bow(W - pad - r * 1.4, pad + r * 0.8, r) +
          bow(pad + r * 1.4, H - pad - r * 0.8, r) + bow(W - pad - r * 1.4, H - pad - r * 0.8, r) +
          `</svg>`
      }

      case "sparkle": {
        const pad = m * 0.035
        const gap = m * 0.09
        let stars = ""
        let i = 0
        const add = (x, y) => {
          const r = (i++ % 2 ? 0.018 : 0.03) * m
          stars += `<path d="${this.starPath(x, y, r)}" fill="${i % 3 ? "#ffffff" : "#ffe58a"}"/>`
        }
        for (let x = pad; x <= W - pad; x += gap) { add(x, pad); add(x, H - pad) }
        for (let y = pad + gap; y < H - pad; y += gap) { add(pad, y); add(W - pad, y) }
        return head +
          `<rect x="${pad}" y="${pad}" width="${W - pad * 2}" height="${H - pad * 2}" rx="${m * 0.02}" ` +
          `fill="none" stroke="#ffffff" stroke-opacity="0.7" stroke-width="${(m * 0.004).toFixed(1)}"/>` +
          stars + `</svg>`
      }

      case "monitor": {
        const t = m * 0.05
        const rad = m * 0.06
        return head +
          `<path fill-rule="evenodd" fill="#111827" d="M0,0H${W}V${H}H0Z ` +
          `M${t + rad},${t} H${W - t - rad} Q${W - t},${t} ${W - t},${t + rad} V${H - t - rad} ` +
          `Q${W - t},${H - t} ${W - t - rad},${H - t} H${t + rad} Q${t},${H - t} ${t},${H - t - rad} ` +
          `V${t + rad} Q${t},${t} ${t + rad},${t} Z"/>` +
          `<rect x="${t}" y="${t}" width="${W - t * 2}" height="${H - t * 2}" rx="${rad}" fill="none" ` +
          `stroke="#3fd6d0" stroke-opacity="0.8" stroke-width="${(m * 0.006).toFixed(1)}"/>` +
          `<circle cx="${W - t * 0.5}" cy="${H - t * 0.5}" r="${t * 0.12}" fill="#3fd6d0"/></svg>`
      }
    }
    return head + `</svg>`
  }

  // ===== 元に戻す・やり直す・リセット =====

  // 今の状態を文字列にする（比率も一緒に覚えておく）
  serialize() {
    return JSON.stringify({
      width: this.widthValue,
      height: this.heightValue,
      canvas: this.canvas.toObject(EXTRA_PROPS)
    })
  }

  // 少し待ってから記録する。待っている間にまた変わったら、待ち直す
  scheduleSnapshot() {
    if (this.restoring) return
    clearTimeout(this.snapshotTimer)
    this.snapshotTimer = setTimeout(() => this.takeSnapshot(), 350)
  }

  takeSnapshot() {
    if (this.restoring) return

    // 文字を打ち替えている最中は、打ち終わってから記録する
    if (this.canvas.getActiveObject()?.isEditing) return

    const state = this.serialize()
    if (state === this.lastState) return  // 何も変わっていなければ記録しない

    this.undoStack.push(this.lastState)
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift()
    this.redoStack = []
    this.lastState = state
    this.updateHistoryButtons()
  }

  async undo() {
    // 記録待ちの変更があれば、先に記録してから戻す
    clearTimeout(this.snapshotTimer)
    this.takeSnapshot()

    const prev = this.undoStack.pop()
    if (!prev) return

    this.redoStack.push(this.lastState)
    await this.restore(prev)
  }

  async redo() {
    clearTimeout(this.snapshotTimer)

    const next = this.redoStack.pop()
    if (!next) return

    this.undoStack.push(this.lastState)
    await this.restore(next)
  }

  // 覚えておいた状態に戻す
  async restore(state) {
    this.restoring = true
    try {
      const data = JSON.parse(state)

      this.canvas.discardActiveObject()
      await this.canvas.loadFromJSON(data.canvas)

      // 比率も戻す
      this.widthValue = data.width
      this.heightValue = data.height
      this.element.style.setProperty("--ratio", data.width / data.height)
      this.sizeBadgeTarget.textContent = `${data.width} × ${data.height} ▾`

      this.fit()
      this.canvas.requestRenderAll()
      this.syncEffectInputs()
      this.lastState = state
    } finally {
      this.restoring = false
    }

    this.textPanelTarget.hidden = true
    this.partPanelTarget.hidden = true
    this.updateHistoryButtons()
  }

  // 全部消して、まっさらに戻す（比率はそのまま）
  resetCanvas() {
    if (!window.confirm("キャンバスの中身を全部消して、まっさらに戻しますか？\n（「↩️ 元に戻す」で取り消せます）")) return

    clearTimeout(this.snapshotTimer)
    this.takeSnapshot()

    this.restoring = true
    this.canvas.discardActiveObject()
    this.canvas.remove(...this.canvas.getObjects())
    this.canvas.backgroundColor = "#ffffff"
    this.canvas.backgroundImage = null
    this.canvas.requestRenderAll()
    this.restoring = false

    this.textPanelTarget.hidden = true
    this.partPanelTarget.hidden = true
    this.bgPanelTarget.hidden = true
    this.partsPanelTarget.hidden = true
    this.effectsPanelTarget.hidden = true
    this.templatesPanelTarget.hidden = true
    this.syncEffectInputs()

    this.takeSnapshot()
  }

  updateHistoryButtons() {
    if (this.hasUndoButtonTarget) this.undoButtonTarget.disabled = this.undoStack.length === 0
    if (this.hasRedoButtonTarget) this.redoButtonTarget.disabled = this.redoStack.length === 0
  }

  // ===== 比率（16:9 / 9:16 / 1:1） =====

  openRatioPicker() {
    // 編集を始めたあとは「このままにする」で戻れるようにする
    this.ratioCloseTarget.hidden = !this.ratioChosen
    this.ratioPickerTarget.hidden = false
  }

  closeRatioPicker() {
    this.ratioPickerTarget.hidden = true
  }

  chooseRatio(event) {
    const size = RATIOS[event.params.ratio]
    if (!size) return

    this.resizeCanvas(size.width, size.height)
    this.ratioChosen = true
    this.closeRatioPicker()
  }

  // キャンバスの実寸を変えて、置いてあるものを真ん中基準で並べ直す
  resizeCanvas(newW, newH) {
    const oldW = this.widthValue
    const oldH = this.heightValue

    if (newW !== oldW || newH !== oldH) {
      // はみ出さないように、縮める必要があるときだけ縮める
      const s = Math.min(1, newW / oldW, newH / oldH)

      this.canvas.getObjects().forEach(obj => {
        if (obj.effect) return  // エフェクトはあとで新しい大きさで作り直す
        const c = obj.getCenterPoint()
        obj.set({
          scaleX: obj.scaleX * s,
          scaleY: obj.scaleY * s
        })
        obj.setPositionByOrigin(
          { x: newW / 2 + (c.x - oldW / 2) * s, y: newH / 2 + (c.y - oldH / 2) * s },
          "center",
          "center"
        )
        obj.setCoords()
      })
    }

    this.widthValue = newW
    this.heightValue = newH
    this.element.style.setProperty("--ratio", newW / newH)
    this.sizeBadgeTarget.textContent = `${newW} × ${newH} ▾`

    // 背景画像：新しいキャンバスいっぱいに敷き直す
    const img = this.canvas.backgroundImage
    if (img) {
      const scale = Math.max(newW / img.width, newH / img.height)
      img.set({ left: newW / 2, top: newH / 2, scaleX: scale, scaleY: scale })
    }

    // 背景のグラデーション：新しい大きさで作り直す
    if (this.canvas.backgroundColor instanceof Gradient) {
      this.applyBackground()
    }

    this.rebuildEffects()
    this.fit()
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

  // ===== PNG書き出し =====
  // 画面では縮小して見せているので、元の大きさ（1280×720 など）に戻して書き出す
  async exportPng() {
    if (this.exporting) return
    this.exporting = true

    // 選択の枠・ハンドルが写らないように、選択を外す
    this.canvas.discardActiveObject()

    // 「ここに画像」の点線の枠は写さない
    const hidden = this.canvas.getObjects().filter(o => o.placeholder && o.visible !== false)
    hidden.forEach(o => o.set("visible", false))
    this.canvas.renderAll()

    try {
      const zoom = this.canvas.getZoom()
      const dataUrl = this.canvas.toDataURL({
        format: "png",
        multiplier: 1 / zoom,
        enableRetinaScaling: false
      })
      const blob = await (await fetch(dataUrl)).blob()
      const fileName = `kotobouquet_${this.timestamp()}.png`
      const file = new File([blob], fileName, { type: "image/png" })

      // スマホ・タブレット（指で操作する端末）だけ共有メニューを使う。PCはふつうにダウンロード
      const isTouchDevice = window.matchMedia("(pointer: coarse)").matches
      if (isTouchDevice && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "KotoBouquet" })
          return
        } catch (e) {
          if (e.name === "AbortError") return  // 共有をやめただけ
          // 共有できなかったときは、ふつうのダウンロードに切り替える
        }
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      console.error("書き出しに失敗:", e)
      const reason = e?.name === "SecurityError"
        ? "別のサーバーから読み込んだ画像が入っているため、書き出せませんでした。"
        : "画像の読み込みが終わってから、もう一度ためしてください。"
      alert(`書き出しに失敗しました。${reason}`)
    } finally {
      hidden.forEach(o => o.set("visible", true))
      this.canvas.requestRenderAll()
      this.exporting = false
    }
  }

  // 20261104_0237 のような日時の文字
  timestamp() {
    const d = new Date()
    const p = n => String(n).padStart(2, "0")
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
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
    const isPart = active instanceof FabricImage

    this.textPanelTarget.hidden = !isText
    this.partPanelTarget.hidden = !isPart

    if (isText || isPart) {
      // 何かを選んだら、背景パネルと部品の追加パネルは閉じる
      this.bgPanelTarget.hidden = true
      this.partsPanelTarget.hidden = true
    }
    if (isText || isPart) this.effectsPanelTarget.hidden = true
    if (isText || isPart) this.templatesPanelTarget.hidden = true
    if (this.hasReplaceButtonTarget) this.replaceButtonTarget.hidden = !(isPart && active.placeholder)
    if (isText || isPart) this.updateLockButtons(active)
    if (isText) this.syncInputs()
    if (isPart) {
      const opacity = Math.round((active.opacity ?? 1) * 100)
      this.partOpacityInputTarget.value = opacity
      this.partOpacityValueTarget.textContent = opacity
    }
  }

  // 選択をやめる（パネルの「閉じる」ボタン）
  deselect() {
    this.canvas.discardActiveObject()
    this.canvas.requestRenderAll()
    this.updatePanel()
  }

  // ===== 背景 =====

  // ツールバーの「背景」ボタン：背景パネルを開く／閉じる
  toggleBackgroundPanel() {
    if (!this.bgPanelTarget.hidden) {
      this.closeBackgroundPanel()
      return
    }
    this.renderMyImages("background")

    // 選んでいるテキストがあれば選択を外して、テキストパネルを閉じる
    this.canvas.discardActiveObject()
    this.canvas.requestRenderAll()
    this.textPanelTarget.hidden = true
    this.partPanelTarget.hidden = true
    this.partsPanelTarget.hidden = true

    this.syncBackgroundInputs()
    this.effectsPanelTarget.hidden = true
    this.templatesPanelTarget.hidden = true
    this.bgPanelTarget.hidden = false
  }

  closeBackgroundPanel() {
    this.bgPanelTarget.hidden = true
  }

  // ===== 部品 =====

  // ツールバーの「部品」ボタン：部品の一覧を開く／閉じる
  togglePartsPanel() {
    if (!this.partsPanelTarget.hidden) {
      this.closePartsPanel()
      return
    }
    this.renderMyImages("part")

    this.canvas.discardActiveObject()
    this.canvas.requestRenderAll()
    this.textPanelTarget.hidden = true
    this.partPanelTarget.hidden = true
    this.bgPanelTarget.hidden = true
    this.effectsPanelTarget.hidden = true
    this.templatesPanelTarget.hidden = true
    this.replaceTarget = null
    if (this.hasReplaceHintTarget) this.replaceHintTarget.hidden = true
    this.partsPanelTarget.hidden = false
  }

  closePartsPanel() {
    this.partsPanelTarget.hidden = true
    this.replaceTarget = null
    if (this.hasReplaceHintTarget) this.replaceHintTarget.hidden = true
  }

  // 部品をキャンバスの真ん中に置く
  async addPart(event) {
    const { source, sourceUrl } = event.params
    const img = await this.placePart(event.params.src)
    if (img && source) img.set({ sourceName: source, sourceUrl: sourceUrl || "" })
    this.showCredit(source, sourceUrl)
  }

  // 部品（URL）をキャンバスの真ん中に置く。imageId は自分の画像のときだけ入る
  async placePart(src, imageId = null) {
    const img = await FabricImage.fromURL(src)

    // キャンバスより大きい部品（枠など）はキャンバスに収まる大きさ、それ以外は高さの4割くらいにする
    const fitScale = Math.min(this.widthValue / img.width, this.heightValue / img.height)
    const scale = fitScale <= 1 ? fitScale : Math.min(1, (this.heightValue * 0.4) / img.height)

    img.set({
      originX: "center",
      originY: "center",
      left: this.widthValue / 2,
      top: this.heightValue / 2,
      scaleX: scale,
      scaleY: scale
    })
    if (imageId) img.set("imageId", imageId)

    // テンプレの「ここに画像」を、自分の画像に差し替えるとき
    const ph = this.replaceTarget
    if (imageId && ph && this.canvas.getObjects().includes(ph)) {
      const c = ph.getCenterPoint()
      const fit = Math.min((ph.width * ph.scaleX) / img.width, (ph.height * ph.scaleY) / img.height)
      img.set({ left: c.x, top: c.y, scaleX: fit, scaleY: fit, angle: ph.angle || 0 })
      this.canvas.remove(ph)
      this.closePartsPanel()
    }

    this.canvas.add(img)
    this.canvas.setActiveObject(img)
    this.canvas.requestRenderAll()
    return img
  }

  changePartOpacity(event) {
    const part = this.canvas.getActiveObject()
    if (!(part instanceof FabricImage)) return

    const value = Number(event.target.value)
    part.set("opacity", value / 100)
    this.partOpacityValueTarget.textContent = value
    this.canvas.requestRenderAll()
  }

  flipPart() {
    const part = this.canvas.getActiveObject()
    if (!(part instanceof FabricImage)) return

    part.set("flipX", !part.flipX)
    this.canvas.requestRenderAll()
  }

  // ===== ロック =====
  // ロックしたものは、触っても動かない・上に来ない。タップでパネルは開けるので、そこで解除できる
  toggleLock() {
    const active = this.canvas.getActiveObject()
    if (!active) return

    this.setLocked(active, !active.locked)
    this.canvas.requestRenderAll()
    this.updateLockButtons(active)
  }

  setLocked(obj, locked) {
    obj.set({
      locked,
      lockMovementX: locked,
      lockMovementY: locked,
      lockScalingX: locked,
      lockScalingY: locked,
      lockRotation: locked,
      hasControls: !locked,
      hoverCursor: locked ? "default" : "move"
    })
    // ロック中のテキストは、ダブルタップしても文字編集に入らない
    if (obj instanceof Textbox) obj.set("editable", !locked)
  }

  updateLockButtons(obj) {
    const label = obj?.locked ? "🔒 ロック中" : "🔓 ロック"
    this.lockButtonTargets.forEach(button => {
      button.textContent = label
      button.classList.toggle("is-locked", !!obj?.locked)
    })
  }

  // 今の背景を、入力欄に映す
  syncBackgroundInputs() {
    const bg = this.canvas.backgroundColor

    if (bg instanceof Gradient) {
      const stops = bg.colorStops
      this.bgColorInputTarget.value = this.toHex(stops[0]?.color)
      this.bgColor2InputTarget.value = this.toHex(stops[stops.length - 1]?.color)
      this.bgDirectionInputTarget.value = this.directionOf(bg)
      this.showBgMode("gradient")
    } else {
      this.bgColorInputTarget.value = this.toHex(bg, "#ffffff")
      this.showBgMode("solid")
    }
  }

  // 「単色／グラデーション」の表示を切り替える（見た目だけ）
  showBgMode(mode) {
    this.bgMode = mode
    const isGradient = mode === "gradient"

    this.bgModeButtonTargets.forEach(button => {
      button.classList.toggle("is-active", button.dataset.mode === mode)
    })
    this.bgGradientOnlyTargets.forEach(el => {
      el.hidden = !isGradient
    })
    this.bgColorLabelTarget.textContent = isGradient ? "色1" : "背景色"
  }

  changeBgMode(event) {
    const mode = event.params.mode

    // 初めてグラデーションにするときは、色2を少し違う色にしておく
    if (mode === "gradient" && this.bgColor2InputTarget.value === this.bgColorInputTarget.value) {
      this.bgColor2InputTarget.value = "#2b2d42"
    }

    this.showBgMode(mode)
    this.applyBackground()
  }

  changeBackground() {
    this.applyBackground()
  }

  // 今の入力欄の値で、背景をかけ直す
  applyBackground() {
    if (this.bgMode === "gradient") {
      this.canvas.backgroundColor = this.buildCanvasGradient(
        this.bgColorInputTarget.value,
        this.bgColor2InputTarget.value,
        this.bgDirectionInputTarget.value
      )
    } else {
      this.canvas.backgroundColor = this.bgColorInputTarget.value
    }
    this.canvas.requestRenderAll()
  }

  // 背景画像を敷く（キャンバスいっぱいに広げる。縦横比が違うときは、はみ出す方を切る）
  async setBackgroundImage(event) {
    const { source, sourceUrl } = event.params
    await this.placeBackground(event.params.src)
    const bg = this.canvas.backgroundImage
    if (bg && source) bg.set({ sourceName: source, sourceUrl: sourceUrl || "" })
    this.showCredit(source, sourceUrl)
  }

  // ===== 引用元（右下に数秒だけ出す） =====
  showCredit(name, url) {
    if (!this.hasCreditTarget || !name) return
    const el = this.creditTarget
    el.textContent = `引用元：${name}`
    if (url) {
      el.href = url
      el.classList.add("is-link")
    } else {
      el.removeAttribute("href")
      el.classList.remove("is-link")
    }
    el.hidden = false
    el.classList.remove("is-show")
    void el.offsetWidth          // アニメーションをやり直すため
    el.classList.add("is-show")
    clearTimeout(this.creditTimer)
    this.creditTimer = setTimeout(() => { el.hidden = true }, 4000)
  }

  // 背景画像（URL）を敷く。imageId は自分の画像のときだけ入る
  async placeBackground(src, imageId = null) {
    const img = await FabricImage.fromURL(src)

    const scale = Math.max(this.widthValue / img.width, this.heightValue / img.height)
    img.set({
      originX: "center",
      originY: "center",
      left: this.widthValue / 2,
      top: this.heightValue / 2,
      scaleX: scale,
      scaleY: scale
    })
    if (imageId) img.set("imageId", imageId)

    this.canvas.backgroundImage = img
    this.canvas.requestRenderAll()
  }

  clearBackgroundImage() {
    this.canvas.backgroundImage = null
    this.canvas.requestRenderAll()
  }

  // ===== 自分の画像（部品・背景） =====
  // 保存と読み込みは image_store（画像の保管係）にまかせる

  // 「📷 自分の画像」ボタン：ファイル選択を開く（スマホならカメラロール）
  pickMyImage(event) {
    const input = event.params.kind === "background" ? this.bgFileInputTarget : this.partFileInputTarget
    input.value = ""
    input.click()
  }

  async onMyImageSelected(event) {
    const input = event.target
    const file = input.files?.[0]
    if (!file) return

    const kind = input.dataset.kind
    this.showLoading("画像をアップロード中…")
    try {
      const id = await saveImage(file, kind)
      const url = await getImageUrl(id)
      if (kind === "background") {
        await this.placeBackground(url, id)
      } else {
        await this.placePart(url, id)
      }
      await this.renderMyImages(kind)
    } catch (e) {
      console.error(e)
      alert(e.message || "画像を読み込めませんでした。別の画像で試してみてね")
    } finally {
      this.hideLoading()
    }
  }

  // 保存してある自分の画像を、一覧に並べる
  async renderMyImages(kind) {
    const list = kind === "background" ? this.myBgListTarget : this.myPartListTarget

    // 一覧を取ってくるあいだは「読み込み中」を出しておく
    list.replaceChildren()
    const loadingNote = document.createElement("span")
    loadingNote.className = "studio-list-loading"
    loadingNote.innerHTML = `<span class="studio-spinner"></span>読み込み中…`
    list.appendChild(loadingNote)

    const records = await listImages(kind)

    list.replaceChildren()
    for (const record of records) {
      const url = await getImageUrl(record.id)
      const button = document.createElement("button")
      button.type = "button"
      button.className = (kind === "background" ? "studio-bg-thumb studio-my-thumb" : "studio-part-thumb studio-my-thumb") + " is-loading"
      button.title = record.name
      button.innerHTML = `<img alt=""><span class="studio-my-delete" title="一覧から消す">×</span>`
      const img = button.querySelector("img")
      // サムネが届くまでは、ふわふわ光る仮の四角を見せる
      img.addEventListener("load", () => button.classList.remove("is-loading"), { once: true })
      img.addEventListener("error", () => button.classList.remove("is-loading"), { once: true })
      img.src = url

      button.addEventListener("click", async (e) => {
        if (e.target.classList.contains("studio-my-delete")) {
          if (!confirm("この画像を消す？\nサーバーからも消えるので、キャンバスに置いてある分も、次に開いたときには表示されなくなります")) return
          this.showLoading("消しています…")
          try {
            await deleteImage(record.id)
            await this.renderMyImages(kind)
          } finally {
            this.hideLoading()
          }
          return
        }
        this.showLoading("画像を読み込み中…")
        try {
          if (kind === "background") {
            await this.placeBackground(url, record.id)
          } else {
            await this.placePart(url, record.id)
          }
        } finally {
          this.hideLoading()
        }
      })
      list.appendChild(button)
    }
  }

  // ===== 読み込み中の表示 =====
  // 画面の真ん中に「読み込み中…」を出す。重なって呼ばれても、全部終わるまで消さない
  showLoading(message = "読み込み中…") {
    this.loadingCount = (this.loadingCount || 0) + 1
    if (!this.loadingEl) {
      this.loadingEl = document.createElement("div")
      this.loadingEl.className = "studio-loading"
      this.loadingEl.setAttribute("role", "status")
      this.loadingEl.setAttribute("aria-live", "polite")
      this.loadingEl.innerHTML = `<div class="studio-loading-card"><span class="studio-spinner"></span><span class="studio-loading-text"></span></div>`
      this.element.appendChild(this.loadingEl)
    }
    this.loadingEl.querySelector(".studio-loading-text").textContent = message
    this.loadingEl.hidden = false
  }

  hideLoading() {
    this.loadingCount = Math.max(0, (this.loadingCount || 1) - 1)
    if (this.loadingCount === 0 && this.loadingEl) this.loadingEl.hidden = true
  }

  // 背景用のグラデーション。キャンバス全体（1280×720）の座標で作る
  buildCanvasGradient(color1, color2, direction) {
    const c = GRADIENT_COORDS[direction] || GRADIENT_COORDS.vertical
    return new Gradient({
      type: "linear",
      gradientUnits: "pixels",
      coords: {
        x1: c.x1 * this.widthValue,
        y1: c.y1 * this.heightValue,
        x2: c.x2 * this.widthValue,
        y2: c.y2 * this.heightValue
      },
      colorStops: [
        { offset: 0, color: color1 },
        { offset: 1, color: color2 }
      ]
    })
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

    // 文字を打ち替えている最中・ロック中は消さない
    if (active.isEditing || active.locked) return

    this.canvas.remove(active)
    this.canvas.discardActiveObject()
    this.canvas.requestRenderAll()
    this.updatePanel()
  }

  // PC用：Delete / Backspace キーで削除する
  onKeydown(event) {
    // PC用：Ctrl+Z で元に戻す、Ctrl+Shift+Z / Ctrl+Y でやり直す（Mac は ⌘）
    const mod = event.ctrlKey || event.metaKey
    if (mod && ["z", "Z", "y", "Y"].includes(event.key)) {
      const tag = document.activeElement?.tagName
      const editing = this.canvas.getActiveObject()?.isEditing
      if (tag === "INPUT" || tag === "TEXTAREA" || editing) return  // 文字入力中は、入力欄の取り消しを優先

      event.preventDefault()
      const isRedo = event.key === "y" || event.key === "Y" || event.shiftKey
      isRedo ? this.redo() : this.undo()
      return
    }

    if (event.key !== "Delete" && event.key !== "Backspace") return

    // カラーピッカーやスライダーなどの入力欄を触っているときは無視する
    const tag = document.activeElement?.tagName
    if (tag === "INPUT" || tag === "TEXTAREA") return

    const active = this.canvas.getActiveObject()
    if (!active || active.isEditing || active.locked) return

    // Backspace でブラウザが「前のページに戻る」のを防ぐ
    event.preventDefault()
    this.deleteSelected()
  }
}
