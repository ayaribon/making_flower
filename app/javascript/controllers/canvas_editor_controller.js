import { Controller } from "@hotwired/stimulus"
import { Canvas, Textbox, Gradient, Shadow, FabricImage, Point, util, ActiveSelection, PencilBrush } from "fabric"
import { STYLES, STYLE_DEFAULTS } from "text_styles"
import { saveImage, listImages, getImageUrl, deleteImage, getThumbUrl, makeThumb, uploadThumb } from "image_store"
import { ColorKey } from "color_key_filter"
import { segmentPoints } from "ai_cutout"

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
  "locked", "imageId", "materialKey", "materialId", "ratioSrcs", "sourceName", "sourceUrl", "placeholder", "effect", "effectKey", "effectStrength", "effectColor", "selectable", "evented", "editable", "hasControls", "hoverCursor",
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
    "templatesPanel", "templateList", "replaceButton", "replaceHint",
    "saveDialog", "saveName", "saveIcon", "saveOverwrite", "saveNote", "saveStatus",
    "viewAllButton", "trash",
    "colorKeyStart", "colorKeyTools", "colorKeyHint", "colorKeyToolButton",
    "colorKeyStrengthInput", "colorKeyStrengthValue", "colorKeyUndo",
    "partSettings", "colorKeySizeRow", "colorKeySizeInput", "colorKeySizeValue", "colorKeyStrengthRow",
    "colorKeyAiRow", "colorKeyAiSign", "colorKeySharpRow", "colorKeySharpInput", "colorKeySharpValue",
    "colorKeyFeatherInput", "colorKeyFeatherValue"
  ]
  static values = { width: Number, height: Number, materials: Object, editTemplate: Object, mediapipeBase: String }

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

    // 下に引っぱって捨てる：動かしている間だけ「🗑 ここで離すと削除」を出す
    this.canvas.on("object:moving", (opt) => this.onTrashMove(opt))
    this.canvas.on("mouse:up", () => this.onTrashDrop())

    // 指2本で拡大縮小・回転（スマホ）／Ctrl＋ホイールで拡大縮小（PC）
    this.setupGestures()

    // 🪄 透過：🖌🧽はなぞる、🌈はタップする
    this.colorKeyPart = null
    this.colorKeyTool = "keep"
    this.colorKeySize = 24
    this.colorKeyStrength = ColorKey.defaults.strength
    this.canvas.on("mouse:down", (opt) => this.onColorKeyDown(opt))
    this.canvas.on("mouse:move", (opt) => this.onColorKeyMove(opt))
    this.canvas.on("mouse:up", (opt) => this.onColorKeyUp(opt))
    // なぞった線は目印だけ。キャンバスには残さない
    this.canvas.on("path:created", ({ path }) => { if (this.colorKeyPart) this.canvas.remove(path) })

    // 「全体を見る」の途中で、何もないところをタップしたら、バーとパネルを戻す
    this.canvas.on("mouse:down", ({ target }) => {
      if (!target) this.setViewing(false)
    })

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

    // 管理画面の「🎨 編集画面で開く」から来たときは、そのテンプレを読み込んでおく
    if (this.editTemplateValue?.id) {
      this.ratioPickerTarget.hidden = true
      this.ratioChosen = true
      this.openTemplateForEdit(this.editTemplateValue)
    }
  }

  async openTemplateForEdit(t) {
    await this.applyTemplate(t, { confirm: false })
    this.editingTemplate = { id: t.id, name: t.label, icon: t.icon }
    // 読み込んだ状態を「最初の状態」にする（戻すで空っぽに戻らないように）
    this.undoStack = []
    this.redoStack = []
    this.lastState = this.serialize()
    this.updateHistoryButtons()
  }

  disconnect() {
    clearTimeout(this.snapshotTimer)
    ;["input", "change", "click"].forEach(name => this.element.removeEventListener(name, this.onUiChange))
    this.resizeObserver?.disconnect()
    this.teardownGestures?.()
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
      this.templatesPromise = fetch("/design_templates.json", { cache: "no-cache", headers: { Accept: "application/json" } })
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
        // 保存したときのサムネがあれば、それを見せる
        if (t.thumb) {
          button.classList.add("has-thumb")
          button.style.backgroundImage = `url("${encodeURI(t.thumb)}")`
        }
        if (t.visible === false) button.classList.add("is-hidden-template")
        button.innerHTML = '<span class="studio-template-icon"></span><span class="studio-template-label"></span>'
        button.querySelector(".studio-template-icon").textContent = t.icon || "📋"
        button.querySelector(".studio-template-label").textContent = t.visible === false ? `🙈 ${t.label}` : t.label
        button.addEventListener("click", () => this.applyTemplate(t))
        list.appendChild(button)
      })
    } catch (error) {
      console.error(error)
      list.innerHTML = '<p class="studio-tab-note">テンプレを読み込めませんでした</p>'
    }
  }

  // テンプレを読み込む（今の中身は置き換える。「戻す」で取り消せる）
  async applyTemplate(t, { confirm = true } = {}) {
    const hasContent = this.canvas.getObjects().length > 0 || this.canvas.backgroundImage
    if (confirm && hasContent && !window.confirm(`今の中身を「${t.label}」に置き換えますか？\n（「↩️ 戻す」で元に戻せます）`)) return

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
      // 比率ごとの画像があれば、今の比率の画像を使う
      const bgMaterial = this.findMaterial(bg.material)
      if (bgMaterial) {
        await this.placeBackground(bgMaterial.src, null, {
          key: bg.material, srcs: bgMaterial.srcs,
          sourceName: bgMaterial.sourceName, sourceUrl: bgMaterial.sourceUrl
        })
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
      textAlign: props.textAlign || "center"
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
    img.set({ materialKey: item.material })

    const scale = ((item.h || 0.2) * H) / img.height
    img.set({
      originX: "center",
      originY: "center",
      left: item.x * W,
      top: item.y * H,
      scaleX: scale * (item.stretch || 1),   // stretch：横だけ伸ばしたとき（横の倍率 ÷ 縦の倍率）
      scaleY: scale,
      angle: item.angle || 0,
      flipX: !!item.flipX,
      flipY: !!item.flipY,
      opacity: item.opacity ?? 1
    })
    if (item.colorKey?.ops?.length) {
      img.filters = [await ColorKey.fromObject(item.colorKey)]
      img.applyFilters()
    }
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

  // ===== テンプレとして保存（管理者だけ） =====
  // 今のキャンバスを、テンプレの形（位置や大きさはキャンバスに対する割合）に直して保存する。
  // 素材は「キー」で覚える。自分の画像（マイ素材）は、ほかの人に見えないので「ここに画像」の枠にする。

  openSaveDialog() {
    if (!this.hasSaveDialogTarget) return
    this.finishColorKey()
    this.element.querySelector(".studio-user-menu")?.removeAttribute("open")
    const editing = this.editingTemplate
    this.saveNameTarget.value = editing?.name || ""
    this.saveIconTarget.value = editing?.icon || "📋"
    this.saveOverwriteTarget.hidden = !editing
    if (editing) this.saveOverwriteTarget.textContent = `📋 「${editing.name}」に上書き保存`
    const mine = this.countMyImages()
    this.saveNoteTarget.textContent = mine > 0
      ? `📷 自分の画像が${mine}つ入っています。テンプレでは「ここに画像」の枠になります（背景の自分の画像は外れます）`
      : ""
    this.saveNoteTarget.hidden = mine === 0
    this.saveStatusTarget.textContent = ""
    this.saveDialogTarget.showModal()
    this.saveNameTarget.focus()
  }

  closeSaveDialog() {
    if (this.hasSaveDialogTarget) this.saveDialogTarget.close()
  }

  countMyImages() {
    const objs = this.canvas.getObjects().filter(o => !o.effect && !(o instanceof Textbox) && !o.placeholder && this.isMyImage(o))
    return objs.length + (this.canvas.backgroundImage && this.isMyImage(this.canvas.backgroundImage) ? 1 : 0)
  }

  // 自分の画像（マイ素材）か、素材かわからない画像か
  isMyImage(obj) {
    return !!obj.imageId || !this.materialRefOf(obj)
  }

  // 画像が、どの素材か（{ material: キー } か { materialId: 番号 }）。わからなければ null
  materialRefOf(obj) {
    if (obj.imageId) return null
    if (obj.materialKey) return { material: obj.materialKey }
    if (obj.materialId) return { materialId: obj.materialId }
    // 前に置いた部品など、覚えていないときは画像の場所から探す
    const path = (() => {
      try { return new URL(obj.getSrc?.() || "", window.location.href).pathname } catch { return "" }
    })()
    if (!path) return null
    for (const [key, m] of Object.entries(this.materialsValue || {})) {
      const paths = [m.src, ...Object.values(m.srcs || {})]
        .map(s => { try { return new URL(s, window.location.href).pathname } catch { return "" } })
      if (paths.includes(path)) return { material: key }
    }
    return null
  }

  round(n, digits = 4) {
    const p = 10 ** digits
    return Math.round(n * p) / p
  }

  // 今のキャンバスを、テンプレの中身（JSON）にする
  buildTemplateData() {
    const W = this.widthValue
    const H = this.heightValue
    const data = { background: {}, items: [], filters: [], frame: null }

    // 背景の色
    const color = this.canvas.backgroundColor
    if (color instanceof Gradient) {
      const stops = color.colorStops
      data.background.gradient = [stops[0]?.color || "#ffffff", stops[stops.length - 1]?.color || "#ffffff", this.directionOf(color)]
    } else if (typeof color === "string" && color) {
      data.background.color = color
    }
    // 背景の画像（素材だけ。自分の画像は外す）
    const bgImg = this.canvas.backgroundImage
    if (bgImg) {
      const ref = this.materialRefOf(bgImg)
      if (ref) Object.assign(data.background, ref)
    }

    for (const obj of this.canvas.getObjects()) {
      if (obj.effect) continue
      const c = obj.getCenterPoint()
      const x = this.round(c.x / W)
      const y = this.round(c.y / H)
      const angle = this.round(obj.angle || 0, 1)

      if (obj instanceof Textbox) {
        data.items.push({ type: "text", text: obj.text, x, y, w: this.round((obj.width * obj.scaleX) / W),
          size: Math.round(obj.fontSize * obj.scaleY), angle, props: this.textPropsOf(obj) })
        continue
      }

      const w = this.round((obj.width * obj.scaleX) / W)
      const h = this.round((obj.height * obj.scaleY) / H)
      const ref = obj.placeholder ? null : this.materialRefOf(obj)
      if (ref) {
        const item = { type: "part", ...ref, x, y, h, angle }
        if (obj.flipX) item.flipX = true
        if (obj.flipY) item.flipY = true
        if ((obj.opacity ?? 1) !== 1) item.opacity = this.round(obj.opacity, 2)
        const stretch = obj.scaleY ? obj.scaleX / obj.scaleY : 1
        if (Math.abs(stretch - 1) > 0.01) item.stretch = this.round(stretch, 3)
        const ck = this.colorKeyOf(obj)
        if (ck && !ck.isNeutralState()) item.colorKey = { strength: ck.strength, sharp: ck.sharp || 0, feather: ck.feather || 0, ops: ck.ops.map(op => ({ ...op })) }
        data.items.push(item)
      } else {
        // 「ここに画像」の枠・自分の画像・どの素材かわからない画像は、「ここに画像」の枠にする
        data.items.push({ type: "placeholder", x, y, w, h })
      }
    }

    for (const o of this.effectObjects("filter")) {
      const f = { key: o.effectKey, strength: this.round(o.effectStrength ?? 0.5, 2) }
      if (o.effectColor) f.color = o.effectColor
      data.filters.push(f)
    }
    data.frame = this.effectObjects("frame")[0]?.effectKey || null
    if (!data.frame) delete data.frame

    // テンプレ一覧のカードの色（サムネがないときに使う）
    const g = data.background.gradient
    data.preview = g ? [g[0], g[1]] : [data.background.color || "#9b7bff", "#3fd6d0"]
    return data
  }

  // 文字の見た目を、テンプレの props の形にする
  textPropsOf(text) {
    const props = {
      fontFamily: text.fontFamily,
      fontWeight: text.fontWeight,
      fontStyle: text.fontStyle,
      stroke: text.stroke || null,
      strokeWidth: text.strokeWidth || 0,
      paintFirst: text.paintFirst,
      strokeLineJoin: text.strokeLineJoin,
      backgroundColor: text.backgroundColor || "",
      skewX: text.skewX || 0,
      charSpacing: text.charSpacing || 0,
      lineHeight: text.lineHeight,
      textAlign: text.textAlign,
      opacity: text.opacity ?? 1
    }
    if (text.fill instanceof Gradient) {
      const stops = text.fill.colorStops
      props.fill = { gradient: [stops[0]?.color, stops[stops.length - 1]?.color], direction: this.directionOf(text.fill) }
    } else {
      props.fill = text.fill
    }
    if (text.shadow) {
      const s = text.shadow
      props.shadow = { color: s.color, blur: s.blur, offsetX: s.offsetX, offsetY: s.offsetY }
    }
    return props
  }

  // テンプレ一覧用の小さい画像（自分の画像と「ここに画像」の枠は写さない）
  makeTemplateThumbnail() {
    this.canvas.discardActiveObject()
    const hide = this.canvas.getObjects().filter(o => !o.effect && o.visible !== false &&
      (o.placeholder || (!(o instanceof Textbox) && this.isMyImage(o))))
    hide.forEach(o => o.set("visible", false))
    const bg = this.canvas.backgroundImage
    const hideBg = bg && this.isMyImage(bg)
    if (hideBg) this.canvas.backgroundImage = null
    this.canvas.renderAll()
    try {
      const zoom = this.canvas.getZoom()
      const longSide = Math.max(this.widthValue, this.heightValue)
      return this.canvas.toDataURL({
        format: "jpeg",
        quality: 0.82,
        multiplier: 480 / longSide / zoom,
        enableRetinaScaling: false
      })
    } catch (error) {
      console.warn("サムネを作れませんでした", error)
      return null
    } finally {
      hide.forEach(o => o.set("visible", true))
      if (hideBg) this.canvas.backgroundImage = bg
      this.canvas.requestRenderAll()
    }
  }

  // 「新しいテンプレとして保存」（mode: new）／「上書き保存」（mode: overwrite）
  async saveTemplate(event) {
    event?.preventDefault()
    if (this.savingTemplate) return
    const overwrite = event?.params?.mode === "overwrite" && this.editingTemplate
    const name = this.saveNameTarget.value.trim()
    if (!name) {
      this.saveStatusTarget.textContent = "名前を入れてね"
      this.saveNameTarget.focus()
      return
    }

    this.savingTemplate = true
    this.saveStatusTarget.textContent = "保存しています…"
    try {
      const body = this.buildTemplateData()
      const thumbnail = this.makeTemplateThumbnail()
      const url = overwrite ? `/admin/design_templates/${this.editingTemplate.id}.json` : "/admin/design_templates.json"
      const response = await fetch(url, {
        method: overwrite ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || ""
        },
        body: JSON.stringify({
          design_template: {
            name,
            icon: this.saveIconTarget.value.trim() || "📋",
            ratio: this.ratioKey(),
            body: JSON.stringify(body),
            thumbnail
          }
        })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || `保存できませんでした（${response.status}）`)

      const t = result.template
      this.editingTemplate = { id: t.id, name: t.label, icon: t.icon }
      // キーを付けた素材があれば、テンプレから探せるように表に足す
      if (result.materials) this.materialsValue = { ...(this.materialsValue || {}), ...result.materials }
      this.templatesPromise = null   // 次にテンプレを開いたとき、読み込み直す
      this.saveStatusTarget.textContent = ""
      this.closeSaveDialog()
      window.alert(`📋 「${t.label}」を${overwrite ? "上書き保存" : "テンプレに保存"}しました！（みんなのテンプレ一覧に出ています）`)
    } catch (error) {
      console.error(error)
      this.saveStatusTarget.textContent = error.message || "保存できませんでした"
    } finally {
      this.savingTemplate = false
    }
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

      case "noise": {
        // ザラザラしたフィルムっぽいノイズ
        return head +
          `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4"/>` +
          `<feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.4 -0.4"/></filter>` +
          `<rect width="${W}" height="${H}" filter="url(#n)" opacity="${(0.55 * s).toFixed(3)}"/></svg>`
      }

      case "glitch": {
        // 横にずれた色の帯（グリッチ）。いつも同じ位置になるよう固定シード
        const rand = this.seededRandom(1104)
        let bars = ""
        const count = Math.round(6 + 14 * s)
        for (let i = 0; i < count; i++) {
          const y = (rand() * H).toFixed(0)
          const h = (2 + rand() * 18 * (H / 720)).toFixed(1)
          const x = (rand() * W * 0.3).toFixed(0)
          const w = (W * (0.3 + rand() * 0.7)).toFixed(0)
          const c = ["#ff2bd6", "#00f0ff", "#ffffff"][i % 3]
          bars += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}" fill-opacity="${(0.15 + 0.35 * s).toFixed(2)}"/>`
        }
        return head + bars + `</svg>`
      }

      case "retro": {
        // 色あせた写真っぽく：セピア寄りの色＋ふちを少し焼く
        return head +
          `<defs><radialGradient id="r" cx="50%" cy="50%" r="75%">` +
          `<stop offset="0.6" stop-color="#5a3a1a" stop-opacity="0"/>` +
          `<stop offset="1" stop-color="#5a3a1a" stop-opacity="${(0.55 * s).toFixed(3)}"/></radialGradient></defs>` +
          `<rect width="${W}" height="${H}" fill="#f2c27a" fill-opacity="${(0.28 * s).toFixed(3)}"/>` +
          `<rect width="${W}" height="${H}" fill="url(#r)"/></svg>`
      }

      case "light-leak": {
        // 角から光がもれたような、やわらかい虹色
        return head +
          `<defs><radialGradient id="a" cx="0%" cy="0%" r="70%"><stop offset="0" stop-color="#ff8ccf" stop-opacity="${(0.7 * s).toFixed(3)}"/><stop offset="1" stop-color="#ff8ccf" stop-opacity="0"/></radialGradient>` +
          `<radialGradient id="b" cx="100%" cy="100%" r="70%"><stop offset="0" stop-color="#ffd34d" stop-opacity="${(0.6 * s).toFixed(3)}"/><stop offset="1" stop-color="#ffd34d" stop-opacity="0"/></radialGradient></defs>` +
          `<rect width="${W}" height="${H}" fill="url(#a)"/><rect width="${W}" height="${H}" fill="url(#b)"/></svg>`
      }
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

      case "hearts": {
        // フチにハートをぐるっと並べる
        const pad = m * 0.045
        const gap = m * 0.1
        const hs = m * 0.022
        const heart = (x, y, s) =>
          `<path d="M${x},${y + s * 0.9} C${x - s * 1.3},${y} ${x - s * 0.9},${y - s * 0.9} ${x},${y - s * 0.35} ` +
          `C${x + s * 0.9},${y - s * 0.9} ${x + s * 1.3},${y} ${x},${y + s * 0.9} Z"/>`
        let d = ""
        for (let x = pad; x <= W - pad; x += gap) { d += heart(x, pad, hs) + heart(x, H - pad, hs) }
        for (let y = pad + gap; y < H - pad; y += gap) { d += heart(pad, y, hs) + heart(W - pad, y, hs) }
        return head +
          `<rect x="${pad * 0.4}" y="${pad * 0.4}" width="${W - pad * 0.8}" height="${H - pad * 0.8}" rx="${m * 0.03}" ` +
          `fill="none" stroke="#ffffff" stroke-width="${(m * 0.006).toFixed(1)}"/>` +
          `<g fill="#ff8ccf" stroke="#ffffff" stroke-width="${(m * 0.004).toFixed(1)}">${d}</g></svg>`
      }

      case "stars": {
        // フチに星をぐるっと並べる（黄色と白を交互に）
        const pad = m * 0.045
        const gap = m * 0.11
        let d = ""
        let i = 0
        const add = (x, y) => {
          const r = m * (i % 2 ? 0.02 : 0.03)
          d += `<path d="${this.starPath(x, y, r)}" fill="${i++ % 2 ? "#ffffff" : "#ffd34d"}"/>`
        }
        for (let x = pad; x <= W - pad; x += gap) { add(x, pad); add(x, H - pad) }
        for (let y = pad + gap; y < H - pad; y += gap) { add(pad, y); add(W - pad, y) }
        return head + d + `</svg>`
      }

      case "polaroid": {
        // ポラロイド写真っぽく、白いフチ（下だけ太め）
        const t = m * 0.05
        const b = m * 0.16
        return head +
          `<path fill-rule="evenodd" fill="#ffffff" d="M0,0H${W}V${H}H0Z M${t},${t}H${W - t}V${H - b}H${t}Z"/>` +
          `<rect x="${t}" y="${t}" width="${W - t * 2}" height="${H - b - t}" fill="none" stroke="#000" stroke-opacity="0.08" stroke-width="2"/></svg>`
      }

      case "tape": {
        // 四すみをマスキングテープで留めたような感じ
        const tw = m * 0.22
        const th = m * 0.07
        const tape = (x, y, a, c) =>
          `<rect x="${-tw / 2}" y="${-th / 2}" width="${tw}" height="${th}" rx="${th * 0.15}" fill="${c}" fill-opacity="0.8" ` +
          `transform="translate(${x} ${y}) rotate(${a})"/>`
        const o = m * 0.06
        return head +
          tape(o, o, -40, "#ffc6dc") + tape(W - o, o, 40, "#bfe6ff") +
          tape(o, H - o, 40, "#c9f2d8") + tape(W - o, H - o, -40, "#fff1a8") + `</svg>`
      }
    }
    return head + `</svg>`
  }

  // ===== 元に戻す・やり直す・リセット =====

  // 今の状態を文字列にする（比率も一緒に覚えておく）
  serialize() {
    // 🪄 透過の編集中は、部品が動かないように一時的に変えている設定を、元の値で記録する
    const part = this.colorKeyPart
    const editing = part ? this.colorKeyLockState(part) : null
    if (part) part.set(this.colorKeySaved)
    try {
      return JSON.stringify({
        width: this.widthValue,
        height: this.heightValue,
        canvas: this.canvas.toObject(EXTRA_PROPS)
      })
    } finally {
      if (part) part.set(editing)
    }
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
    this.finishColorKey()
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

    // 背景画像：新しいキャンバスいっぱいに敷き直す（比率ごとの画像があれば、あとで差し替える）
    const img = this.canvas.backgroundImage
    if (img) {
      const scale = Math.max(newW / img.width, newH / img.height)
      img.set({ left: newW / 2, top: newH / 2, scaleX: scale, scaleY: scale })
      if (img.ratioSrcs) this.swapBackgroundForRatio()
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

  // ===== 指2本の操作 =====
  // Fabric.js 7 には指2本の操作がないので、自分で作る。
  // 指が2本になったら、Fabric に1本指の動きを渡さないようにして、こっちで拡大縮小・回転・移動をする
  setupGestures() {
    this.touches = new Map()   // 今キャンバスに触れている指（pointerId → 画面上の位置）
    this.pinch = null          // 指2本で操作している間の情報
    this.blockTouch = false    // true の間は、指の動きを Fabric に渡さない
    this.pinchDone = null      // 指2本で動かし終わった部品（全部の指が離れたら選び直す）

    const frame = this.frameTarget

    // 指を置いた（Fabric より先に受け取るため capture で聞く）
    this.onGestureDown = (e) => {
      if (e.pointerType !== "touch" || e.target.tagName !== "CANVAS") return
      if (this.touches.size === 0) {
        this.pinchCandidate = this.canvas.getActiveObject()
        this.pinchUsed = false
      }
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (this.touches.size === 2) this.startPinch()
    }

    // 指を動かした（window の capture なので、Fabric のどの処理よりも先に来る）
    this.onGestureMove = (e) => {
      if (e.pointerType !== "touch" || !this.touches.has(e.pointerId)) return
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (!this.blockTouch) return
      e.stopImmediatePropagation()
      if (this.pinch) this.updatePinch()
    }

    // 指を離した（Fabric にもそのまま渡す。Fabric 側の操作をきれいに終わらせるため）
    this.onGestureUp = (e) => {
      if (e.pointerType !== "touch" || !this.touches.has(e.pointerId)) return
      this.touches.delete(e.pointerId)
      if (this.pinch && this.touches.size < 2) this.endPinch()
      // 指が全部離れるまでは止めたままにする（残った1本の指で、部品がとばないように）
      if (this.touches.size === 0) {
        this.blockTouch = false
        const target = this.pinchDone
        this.pinchDone = null
        // Fabric が指を離したときの処理を終えてから、動かした部品を選び直す
        if (target) setTimeout(() => {
          if (!this.canvas.getObjects().includes(target)) return
          this.canvas.setActiveObject(target)
          this.canvas.requestRenderAll()
          this.updatePanel()
        }, 0)
      }
    }

    // iPhone の Safari で、画面全体がズームされないようにする
    this.onGestureStart = (e) => e.preventDefault()

    // PC：Ctrl＋ホイール（トラックパッドのピンチもこれで届く）で、選んでいる部品を拡大縮小
    this.onWheel = (e) => this.wheelZoom(e)

    frame.addEventListener("pointerdown", this.onGestureDown, true)
    window.addEventListener("pointermove", this.onGestureMove, true)
    window.addEventListener("pointerup", this.onGestureUp, true)
    window.addEventListener("pointercancel", this.onGestureUp, true)
    frame.addEventListener("gesturestart", this.onGestureStart)
    frame.addEventListener("wheel", this.onWheel, { passive: false })
  }

  teardownGestures() {
    const frame = this.frameTarget
    frame.removeEventListener("pointerdown", this.onGestureDown, true)
    window.removeEventListener("pointermove", this.onGestureMove, true)
    window.removeEventListener("pointerup", this.onGestureUp, true)
    window.removeEventListener("pointercancel", this.onGestureUp, true)
    frame.removeEventListener("gesturestart", this.onGestureStart)
    frame.removeEventListener("wheel", this.onWheel, { passive: false })
    clearTimeout(this.wheelTimer)
  }

  // 指2本・ホイールで動かしていいもの（ロック中・エフェクト・触れないものはダメ）
  canGesture(obj) {
    return !!obj && !obj.locked && !obj.effect &&
      obj.selectable !== false && obj.evented !== false &&
      !obj.lockScalingX && !obj.lockRotation
  }

  // 画面上の位置 → キャンバスの中の位置（1280×720 などの座標）
  toScene(x, y) {
    const rect = this.canvasTarget.getBoundingClientRect()
    const zoom = this.canvas.getZoom()
    return new Point((x - rect.left) / zoom, (y - rect.top) / zoom)
  }

  // その位置にある、いちばん上の動かせるもの
  objectAt(point) {
    return [...this.canvas.getObjects()].reverse()
      .find(o => this.canGesture(o) && o.containsPoint(point))
  }

  startPinch() {
    const [a, b] = [...this.touches.values()]
    const mid = this.toScene((a.x + b.x) / 2, (a.y + b.y) / 2)

    // 動かすもの：指を置く前に選んでいたもの → 2本の指の真ん中にあるもの
    let target = this.pinchCandidate
    if (!this.canGesture(target) || !this.canvas.getObjects().includes(target)) target = this.objectAt(mid)

    // 指2本の間は、何もないところでも Fabric の1本指の操作（範囲選択など）を止める
    this.blockTouch = true
    this.pinchUsed = true
    this.hideTrash()
    this.trashObject = null
    if (!target) return

    this.pinch = {
      target,
      dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      mid,
      center: target.getCenterPoint(),
      scaleX: target.scaleX,
      scaleY: target.scaleY,
      objAngle: target.angle || 0
    }
    if (this.canvas.getActiveObject() !== target) this.canvas.setActiveObject(target)
    this.element.classList.add("is-dragging")
    this.canvas.requestRenderAll()
  }

  updatePinch() {
    const p = this.pinch
    const [a, b] = [...this.touches.values()]

    // 指の間の広さ → 大きさ（小さくなりすぎないようにする）
    const min = 0.02 / Math.min(Math.abs(p.scaleX), Math.abs(p.scaleY))
    const k = Math.max(Math.hypot(b.x - a.x, b.y - a.y) / p.dist, min)

    // ひねった角度 → 回転。0°・90°・180°・270° の近く（±4°）では吸い付かせる
    let angle = p.objAngle + (Math.atan2(b.y - a.y, b.x - a.x) - p.angle) * 180 / Math.PI
    const snapped = Math.round(angle / 90) * 90
    if (Math.abs(angle - snapped) < 4) angle = snapped
    const rad = (angle - p.objAngle) * Math.PI / 180

    // 指の下にあった場所が、指についてくるように動かす
    const mid = this.toScene((a.x + b.x) / 2, (a.y + b.y) / 2)
    const dx = (p.center.x - p.mid.x) * k
    const dy = (p.center.y - p.mid.y) * k
    const center = new Point(
      mid.x + dx * Math.cos(rad) - dy * Math.sin(rad),
      mid.y + dx * Math.sin(rad) + dy * Math.cos(rad)
    )

    p.target.set({ scaleX: p.scaleX * k, scaleY: p.scaleY * k, angle: ((angle % 360) + 360) % 360 })
    p.target.setPositionByOrigin(center, "center", "center")
    p.target.setCoords()
    this.syncInputs()
    this.canvas.requestRenderAll()
  }

  endPinch() {
    const { target } = this.pinch
    this.pinch = null
    target.setCoords()
    this.pinchDone = target
    this.element.classList.remove("is-dragging")
    // 元に戻す／やり直すに1回だけ記録する
    this.canvas.fire("object:modified", { target })
  }

  // PC：Ctrl＋ホイールで、選んでいるものを拡大縮小する
  wheelZoom(e) {
    if (!e.ctrlKey) return                       // ふつうのホイールは何もしない
    const target = this.canvas.getActiveObject()
    if (!this.canGesture(target)) return         // 何も選んでいないときは、ブラウザの拡大に任せる
    e.preventDefault()                           // ブラウザの画面ズームを止める

    // マウスのホイール1目盛りで約0.74倍、トラックパッドのピンチはなめらかに
    const delta = Math.max(-30, Math.min(30, e.deltaY))
    const min = 0.02 / Math.min(Math.abs(target.scaleX), Math.abs(target.scaleY))
    const k = Math.max(Math.exp(-delta * 0.01), min)

    const center = target.getCenterPoint()
    target.set({ scaleX: target.scaleX * k, scaleY: target.scaleY * k })
    target.setPositionByOrigin(center, "center", "center")
    target.setCoords()
    this.element.classList.add("is-dragging")
    this.syncInputs()
    this.canvas.requestRenderAll()

    // 回し終わったら（0.3秒なにもなければ）、バーとパネルを戻して、記録を1回だけ残す
    clearTimeout(this.wheelTimer)
    this.wheelTimer = setTimeout(() => {
      this.element.classList.remove("is-dragging")
      this.canvas.fire("object:modified", { target })
    }, 300)
  }

  // ===== 全体を見る =====
  // 下のバーとパネルをしまって、キャンバス全体を見る（選んでいるものはそのまま）
  toggleViewAll() {
    this.setViewing(!this.element.classList.contains("is-viewing"))
  }

  setViewing(on) {
    this.element.classList.toggle("is-viewing", on)
    if (!this.hasViewAllButtonTarget) return
    const button = this.viewAllButtonTarget
    button.setAttribute("aria-pressed", String(on))
    button.querySelector(".studio-toolbar-icon").textContent = on ? "↩︎" : "👀"
    button.querySelector(".studio-toolbar-label").textContent = on ? "戻す" : "全体"
    button.title = on ? "バーとパネルを戻す" : "バーとパネルをしまって全体を見る"
  }

  // ===== 下に引っぱって捨てる（🗑） =====
  canTrash(obj) {
    return !!obj && !obj.locked && !obj.effect && obj !== this.colorKeyPart
  }

  onTrashMove(opt) {
    const target = opt.target || opt.transform?.target
    // 捨てられないもの・指2本で操作しているときは出さない
    if (!this.canTrash(target) || this.blockTouch || (this.touches?.size || 0) > 1) {
      this.hideTrash()
      return
    }
    this.trashObject = target
    this.element.classList.add("is-trash-ready")

    const point = opt.e?.touches?.[0] || opt.e
    const wasOver = this.element.classList.contains("is-over-trash")
    const over = this.isOverTrash(point?.clientX, point?.clientY)
    this.element.classList.toggle("is-over-trash", over)
    if (over && !wasOver) navigator.vibrate?.(10)   // 入った瞬間に軽く震わせる（対応している端末だけ）
  }

  // 指（マウス）が削除の場所の上にあるか。狙いやすいように、見た目より少し広く取る
  isOverTrash(x, y) {
    if (!this.hasTrashTarget || x == null || y == null) return false
    const r = this.trashTarget.getBoundingClientRect()
    const pad = 24
    return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad
  }

  onTrashDrop() {
    const obj = this.trashObject
    const over = this.element.classList.contains("is-over-trash")
    this.trashObject = null
    this.hideTrash()
    if (!obj || !over || obj.isEditing) return

    // Fabric が「指を離した」処理を終えてから消す（元に戻すで、1回で戻せる）
    setTimeout(() => {
      const items = obj instanceof ActiveSelection ? obj.getObjects() : [obj]
      this.canvas.discardActiveObject()
      items.filter(o => !o.locked).forEach(o => this.canvas.remove(o))
      this.canvas.requestRenderAll()
      this.updatePanel()
    }, 0)
  }

  hideTrash() {
    this.element.classList.remove("is-trash-ready", "is-over-trash")
  }

  // ===== PNG書き出し =====
  // 画面では縮小して見せているので、元の大きさ（1280×720 など）に戻して書き出す
  async exportPng() {
    if (this.exporting) return
    this.exporting = true
    this.finishColorKey()

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
    // 🖌 なぞっている間は Fabric が選択を外すので、透過している部品を選んでいることにする
    const drawingPart = this.canvas.isDrawingMode && this.canvas.getObjects().includes(this.colorKeyPart)
    const active = this.canvas.getActiveObject() || (drawingPart ? this.colorKeyPart : null)
    const isText = active instanceof Textbox
    const isPart = active instanceof FabricImage

    // 🪄 透過の編集中に、ほかのものを選んだり選択をやめたりしたら、編集を終える
    if (this.colorKeyPart && active !== this.colorKeyPart) this.finishColorKey()

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
      this.syncColorKeyPanel(active)
    }
  }

  // 選択をやめる（パネルの「閉じる」ボタン）
  deselect() {
    this.finishColorKey()
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
    const { source, sourceUrl, key, materialId } = event.params
    const img = await this.placePart(event.params.src)
    if (img && source) img.set({ sourceName: source, sourceUrl: sourceUrl || "" })
    // テンプレとして保存するときに、どの素材かわかるように覚えておく
    if (img) img.set({ materialKey: key || null, materialId: materialId || null })
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

  // ===== 🪄 透過（カラーキー） =====
  // 指定した色を透明にする。元の画像は書き換えず、「どこをタップしたか」を部品のフィルタに覚えさせる

  colorKeyOf(part) {
    return part?.filters?.find(f => f instanceof ColorKey) || null
  }

  colorKeyLockState(part) {
    return {
      lockMovementX: part.lockMovementX, lockMovementY: part.lockMovementY,
      hasControls: part.hasControls, hoverCursor: part.hoverCursor
    }
  }

  // 部品パネルの「🪄 透過」の表示を、選んでいる部品に合わせる
  syncColorKeyPanel(part) {
    if (!this.hasColorKeyStartTarget || !part) return
    const editing = this.colorKeyPart === part
    const ck = this.colorKeyOf(part)
    // 編集中は、透明度・左右反転をしまって、透過の道具だけにする
    if (this.hasPartSettingsTarget) this.partSettingsTarget.hidden = editing
    this.colorKeyStartTarget.hidden = editing
    this.colorKeyStartTarget.textContent = ck && !ck.isNeutralState() ? "🪄 透過を直す" : "🪄 背景を透過"
    this.colorKeyToolsTarget.hidden = !editing
    if (!editing) return

    const tool = this.colorKeyTool
    const brush = tool === "keep" || tool === "erase"
    this.colorKeyToolButtonTargets.forEach(b => b.classList.toggle("is-active", b.dataset.tool === this.colorKeyTool))
    this.colorKeySizeRowTarget.hidden = !brush
    this.colorKeyStrengthRowTarget.hidden = tool !== "all"
    if (this.hasColorKeyAiRowTarget) {
      this.colorKeyAiRowTarget.hidden = tool !== "ai"
      this.colorKeyAiSignTargets.forEach(b => b.classList.toggle("is-active", (b.dataset.sign === "plus") === this.aiPlus))
      this.colorKeySharpRowTarget.hidden = tool !== "ai"
      this.colorKeySharpInputTarget.value = this.colorKeySharp ?? 0
      this.colorKeySharpValueTarget.textContent = this.colorKeySharp ?? 0
    }
    this.colorKeyFeatherInputTarget.value = this.colorKeyFeather ?? 0
    this.colorKeyFeatherValueTarget.textContent = this.colorKeyFeather ?? 0
    this.colorKeySizeInputTarget.value = this.colorKeySize
    this.colorKeySizeValueTarget.textContent = this.colorKeySize
    this.colorKeyStrengthInputTarget.value = this.colorKeyStrength
    this.colorKeyStrengthValueTarget.textContent = this.colorKeyStrength
    const hints = {
      ai: "残したいもの（キャラなど）をタップ。−に切り替えてタップすると、その場所を外します",
      keep: "残したい所をなぞる（最初の1回で、なぞっていない所が消えます）",
      erase: "消したい所をなぞる",
      all: "消したい色の所をタップ（同じ色が全部消えます）"
    }
    this.colorKeyHintTarget.textContent = hints[this.colorKeyTool]
    this.colorKeyUndoTarget.disabled = !(ck && ck.ops.length)
  }

  // 「🪄 背景を透過」：編集を始める
  startColorKey() {
    const part = this.canvas.getActiveObject()
    if (!(part instanceof FabricImage)) return
    this.colorKeyPart = part
    this.colorKeyTool = "keep"
    this.aiPoints = []
    this.aiPlus = true
    this.colorKeyStrength = this.colorKeyOf(part)?.strength ?? ColorKey.defaults.strength
    this.colorKeySharp = this.colorKeyOf(part)?.sharp ?? 0
    this.colorKeyFeather = this.colorKeyOf(part)?.feather ?? 0
    // 編集している間は、タップで部品が動かないようにする（終わったら元に戻す）
    this.colorKeySaved = this.colorKeyLockState(part)
    this.colorKeyWasLocked = !!part.locked
    part.set({ lockMovementX: true, lockMovementY: true, hasControls: false, hoverCursor: "crosshair" })
    this.setColorKeyPreview(part, true)
    this.applyColorKeyTool()
    this.syncColorKeyPanel(part)
  }

  // 「✓ 完了」：編集を終えて、いつもの操作に戻す
  finishColorKey() {
    const part = this.colorKeyPart
    if (!part) return
    this.canvas.isDrawingMode = false
    this.colorKeyStroke = null
    this.colorKeyDown = null
    part.set(this.colorKeySaved || {})
    // 編集中に 🔒 を押していたら、ロックの設定に合わせ直す
    if (!!part.locked !== this.colorKeyWasLocked) this.setLocked(part, !!part.locked)
    this.colorKeyPart = null
    this.colorKeySaved = null
    this.setColorKeyPreview(part, false)
    this.syncColorKeyPanel(part)
  }

  // 消える所をうっすら見せる（編集中）／完全に透明にする（完了）
  setColorKeyPreview(part, on) {
    const ck = this.colorKeyOf(part)
    if (ck) {
      ck.preview = on
      part.applyFilters()
    }
    this.canvas.requestRenderAll()
  }

  // 選んだ道具に合わせて、キャンバスを「なぞる」か「タップする」にする
  applyColorKeyTool() {
    const brush = !!this.colorKeyPart && (this.colorKeyTool === "keep" || this.colorKeyTool === "erase")
    this.canvas.isDrawingMode = brush
    if (!brush) return
    const pen = new PencilBrush(this.canvas)
    pen.color = this.colorKeyTool === "keep" ? "rgba(46, 204, 113, 0.55)" : "rgba(240, 115, 154, 0.55)"
    pen.width = this.colorKeySize / this.canvas.getZoom()   // 画面の上で同じ太さに見えるようにする
    this.canvas.freeDrawingBrush = pen
  }

  chooseColorKeyTool(event) {
    this.colorKeyTool = event.currentTarget.dataset.tool
    this.aiPoints = []
    this.aiPlus = true
    this.applyColorKeyTool()
    this.syncColorKeyPanel(this.colorKeyPart)
  }

  changeColorKeySize(event) {
    this.colorKeySize = Number(event.target.value)
    this.colorKeySizeValueTarget.textContent = this.colorKeySize
    if (this.canvas.isDrawingMode) this.canvas.freeDrawingBrush.width = this.colorKeySize / this.canvas.getZoom()
  }

  // 画面の位置 → 部品の画像の中の位置（0〜1）。回転・反転・拡大していても合うように、部品の変形を逆にかける
  toPartPoint(part, e) {
    const p = this.canvas.getScenePoint(e)
    const local = util.transformPoint(p, util.invertTransform(part.calcTransformMatrix()))
    return { x: local.x / part.width + 0.5, y: local.y / part.height + 0.5 }
  }

  onColorKeyDown(opt) {
    const part = this.colorKeyPart
    if (!part) return
    if (opt.e?.pointerType !== "touch") this.pinchUsed = false   // マウスのときは、前の「指2本」の印を消す
    if (this.canvas.isDrawingMode) {
      this.colorKeyStroke = [this.toPartPoint(part, opt.e)]
      return
    }
    if (opt.target !== part) return
    this.colorKeyDown = { x: opt.e.clientX, y: opt.e.clientY }
  }

  onColorKeyMove(opt) {
    if (!this.colorKeyStroke || !this.colorKeyPart) return
    this.colorKeyStroke.push(this.toPartPoint(this.colorKeyPart, opt.e))
  }

  onColorKeyUp(opt) {
    const part = this.colorKeyPart
    if (!part) return

    // 🖌🧽：なぞり終わり
    const stroke = this.colorKeyStroke
    if (stroke) {
      this.colorKeyStroke = null
      // Fabric がなぞり始めに外した選択を、戻しておく
      setTimeout(() => {
        if (this.colorKeyPart !== part || !this.canvas.getObjects().includes(part)) return
        this.canvas.setActiveObject(part)
        this.canvas.requestRenderAll()
      }, 0)
      if (!this.pinchUsed) this.addColorKeyStroke(part, stroke)   // 指2本を使った線は捨てる
      return
    }

    // 🌈：タップ（指2本を使ったとき・指がずれたときはタップにしない）
    const down = this.colorKeyDown
    this.colorKeyDown = null
    if (!down || this.pinchUsed) return
    if (Math.hypot(opt.e.clientX - down.x, opt.e.clientY - down.y) > 10) return
    const p = this.toPartPoint(part, opt.e)
    if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return
    if (this.colorKeyTool === "ai") {
      this.aiTap(part, p)
      return
    }
    this.updateColorKey(part, ck => ck.ops.push({ act: "all", x: this.round(p.x), y: this.round(p.y) }))
  }

  // なぞった線を、部品のフィルタに足す
  addColorKeyStroke(part, stroke) {
    const long = Math.max(part.width, part.height)
    // ブラシの太さ（画面の px）→ 画像の長い辺に対する半径の割合
    const scale = Math.sqrt(Math.abs(part.scaleX * part.scaleY)) || 1
    const r = (this.colorKeySize / 2) / this.canvas.getZoom() / scale / long
    // 近すぎる点は間引いて、保存するデータを小さくする（半径の4割より近い点は飛ばす）
    const pts = []
    let last = null
    for (const p of stroke) {
      if (last && Math.hypot((p.x - last.x) * part.width, (p.y - last.y) * part.height) / long < r * 0.4) continue
      pts.push(this.round(p.x), this.round(p.y))
      last = p
    }
    const end = stroke[stroke.length - 1]
    if (last !== end) pts.push(this.round(end.x), this.round(end.y))
    this.updateColorKey(part, ck => ck.ops.push({ act: this.colorKeyTool, r: this.round(r, 5), pts }))
  }

  chooseAiSign(event) {
    this.aiPlus = event.currentTarget.dataset.sign === "plus"
    this.syncColorKeyPanel(this.colorKeyPart)
  }

  // ✨：タップした点を足して、AI に切り抜いてもらう
  async aiTap(part, p) {
    if (this.aiBusy) return
    const points = [...(this.aiPoints || []), { x: this.round(p.x), y: this.round(p.y), plus: this.aiPlus }]
    if (!points.some(q => q.plus)) {
      this.colorKeyHintTarget.textContent = "まず「＋ 足す」で、残したいものをタップしてね"
      return
    }
    this.aiBusy = true
    this.showLoading(this.aiReady ? "AIが考え中…" : "AIを準備中…（最初だけ、約44MB読み込みます）")
    try {
      // AI が動いている間は画面が止まるので、先に「準備中」を表示させる
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)))
      const image = part._originalElement || part.getElement()
      const src = await segmentPoints(this.mediapipeBaseValue || "/mediapipe", image, points)
      this.aiReady = true
      await ColorKey.loadMask(src)
      // 同じ ✨ で2回目以降のタップなら、前の結果と入れ替える
      const replace = (this.aiPoints || []).length > 0
      this.aiPoints = points
      this.updateColorKey(part, ck => {
        const op = { act: "ai", src }
        if (replace && ck.ops[ck.ops.length - 1]?.act === "ai") ck.ops[ck.ops.length - 1] = op
        else ck.ops.push(op)
      })
    } catch (e) {
      console.error(e)
      this.colorKeyHintTarget.textContent = "AIの準備に失敗しました。もう一度タップしてみてね"
    } finally {
      this.aiBusy = false
      this.hideLoading()
    }
  }

  // 透過の設定を変えて、計算し直す
  updateColorKey(part, change) {
    const ck = this.colorKeyOf(part) || new ColorKey({ strength: this.colorKeyStrength, sharp: this.colorKeySharp || 0, feather: this.colorKeyFeather || 0 })
    change(ck)
    ck.preview = this.colorKeyPart === part
    part.filters = ck.isNeutralState() ? [] : [ck]
    part.applyFilters()
    this.canvas.requestRenderAll()
    this.syncColorKeyPanel(part)
    this.canvas.fire("object:modified", { target: part })   // 元に戻すの記録
  }

  changeColorKeyStrength(event) {
    const part = this.colorKeyPart
    if (!part) return
    this.colorKeyStrength = Number(event.target.value)
    this.colorKeyStrengthValueTarget.textContent = this.colorKeyStrength
    // スライダーを動かしている間は、1コマに1回だけ計算する（大きい画像でも重くなりすぎないように）
    cancelAnimationFrame(this.colorKeyFrame)
    this.colorKeyFrame = requestAnimationFrame(() => {
      this.updateColorKey(part, ck => { ck.strength = this.colorKeyStrength })
    })
  }

  changeColorKeyFeather(event) {
    const part = this.colorKeyPart
    if (!part) return
    this.colorKeyFeather = Number(event.target.value)
    this.colorKeyFeatherValueTarget.textContent = this.colorKeyFeather
    // 動かしている間は、1コマに1回だけ計算する
    cancelAnimationFrame(this.colorKeyFeatherFrame)
    this.colorKeyFeatherFrame = requestAnimationFrame(() => {
      this.updateColorKey(part, ck => { ck.feather = this.colorKeyFeather })
    })
  }

  changeColorKeySharp(event) {
    const part = this.colorKeyPart
    if (!part) return
    this.colorKeySharp = Number(event.target.value)
    this.colorKeySharpValueTarget.textContent = this.colorKeySharp
    // 動かしている間は、1コマに1回だけ計算する
    cancelAnimationFrame(this.colorKeySharpFrame)
    this.colorKeySharpFrame = requestAnimationFrame(() => {
      this.updateColorKey(part, ck => { ck.sharp = this.colorKeySharp })
    })
  }

  // 「↶ 1つ戻す」：最後のタップを取り消す
  undoColorKey() {
    this.aiPoints = []
    if (this.colorKeyPart) this.updateColorKey(this.colorKeyPart, ck => ck.ops.pop())
  }

  // 「↺ リセット」：透過を全部やめて、元の画像に戻す
  resetColorKey() {
    this.aiPoints = []
    if (this.colorKeyPart) this.updateColorKey(this.colorKeyPart, ck => { ck.ops = [] })
  }

  // 「💾 マイ素材に保存」：透過したあとの画像を PNG にして、マイ素材（部品）に追加する。
  // キャンバスの部品はそのまま。左右反転・回転は入れない（置くときにまた変えられる）
  async saveColorKeyAsMaterial() {
    const part = this.colorKeyPart
    const ck = part && this.colorKeyOf(part)
    if (!ck || ck.isNeutralState()) {
      this.colorKeyHintTarget.textContent = "まだ透過していません"
      return
    }
    this.showLoading("透過した画像を作っています…")
    this.setLoadingProgress(0)
    try {
      // 元の画像に、うっすら表示なしの同じ透過をかける
      const src = part._originalElement || part.getElement()
      const w = src.naturalWidth || src.width
      const h = src.naturalHeight || src.height
      const canvas = document.createElement("canvas")
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d", { willReadFrequently: true })
      ctx.drawImage(src, 0, 0, w, h)
      const imageData = ctx.getImageData(0, 0, w, h)
      const finalKey = new ColorKey({ strength: ck.strength, sharp: ck.sharp || 0, feather: ck.feather || 0, ops: ck.ops })
      finalKey.applyTo2d({ imageData })
      ctx.putImageData(imageData, 0, 0)

      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"))
      if (!blob) throw new Error("画像を作れませんでした")
      const file = new File([blob], `transparent-${this.timestamp()}.png`, { type: "image/png" })

      await saveImage(file, "part", (percent) => {
        this.setLoadingText(percent >= 100 ? "保存しています…" : `アップロード中… ${percent}%`)
        this.setLoadingProgress(percent)
      })
      await this.renderMyImages("part")
      this.colorKeyHintTarget.textContent = "💾 マイ素材に保存しました（部品の📷から置けます）"
    } catch (e) {
      console.error(e)
      alert(e.message || "保存できませんでした。もう一度ためしてね")
    } finally {
      this.hideLoading()
    }
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
    const { source, sourceUrl, key, materialId, srcs } = event.params
    await this.placeBackground(event.params.src, null, {
      key, materialId, srcs, sourceName: source, sourceUrl: sourceUrl || ""
    })
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
  // meta.srcs に比率ごとの画像があれば、今の比率の画像を使う（比率を変えたときも差し替える）
  async placeBackground(src, imageId = null, meta = {}) {
    const srcs = meta.srcs && typeof meta.srcs === "object" ? meta.srcs : null
    const chosen = srcs?.[this.ratioKey()] || src
    const img = await FabricImage.fromURL(chosen)

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
    img.set({
      materialKey: meta.key || null,
      materialId: meta.materialId || null,
      ratioSrcs: srcs ? { ...srcs, base: src } : null
    })
    if (meta.sourceName) img.set({ sourceName: meta.sourceName, sourceUrl: meta.sourceUrl || "" })

    this.canvas.backgroundImage = img
    this.canvas.requestRenderAll()
  }

  // 比率を変えたとき：比率ごとの画像がある背景なら、その比率の画像に敷き直す
  async swapBackgroundForRatio() {
    const bg = this.canvas.backgroundImage
    const srcs = bg?.ratioSrcs
    if (!srcs) return
    const want = srcs[this.ratioKey()] || srcs.base
    const now = new URL(bg.getSrc(), window.location.href).pathname
    if (!want || new URL(want, window.location.href).pathname === now) return

    const seq = this.bgSwapSeq = (this.bgSwapSeq || 0) + 1
    const { base, ...ratioSrcs } = srcs
    const meta = {
      key: bg.materialKey, materialId: bg.materialId, srcs: ratioSrcs,
      sourceName: bg.sourceName, sourceUrl: bg.sourceUrl
    }
    try {
      await FabricImage.fromURL(want)   // 先に読み込んでおく（2回目はすぐ終わる）
      if (seq !== this.bgSwapSeq || this.canvas.backgroundImage !== bg) return  // そのあいだに背景が変わった
      await this.placeBackground(base, null, meta)
      this.scheduleSnapshot()
    } catch (error) {
      console.warn("比率に合わせた背景を読み込めませんでした", error)
    }
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
    this.showLoading("画像をアップロード中… 0%")
    this.setLoadingProgress(0)
    try {
      const id = await saveImage(file, kind, (percent) => {
        // 送り終わったら、サーバー側の保存を待っている状態になる
        const label = percent >= 100 ? "保存しています…" : `画像をアップロード中… ${percent}%`
        this.setLoadingText(label)
        this.setLoadingProgress(percent)
      })
      this.setLoadingText("キャンバスに置いています…")
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
      // 一覧はサムネを使う。まだない画像は元の画像を出して、読めたらサムネを作って送っておく（次から速くなる）
      if (record.thumb) {
        img.src = getThumbUrl(record.id)
      } else {
        img.addEventListener("load", async () => {
          try {
            const blob = await makeThumb(img)
            if (blob) await uploadThumb(record.id, blob)
          } catch (e) {
            console.warn("サムネを作れませんでした", e)
          }
        }, { once: true })
        img.src = url
      }

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
      this.loadingEl.innerHTML =
        `<div class="studio-loading-card"><span class="studio-spinner"></span>` +
        `<span class="studio-loading-text"></span>` +
        `<span class="studio-progress" hidden><span class="studio-progress-bar"></span></span></div>`
      this.element.appendChild(this.loadingEl)
    }
    this.setLoadingText(message)
    this.loadingEl.querySelector(".studio-progress").hidden = true  // ％を出すときだけ setLoadingProgress で出す
    this.loadingEl.hidden = false
  }

  setLoadingText(message) {
    this.loadingEl?.querySelector(".studio-loading-text")?.replaceChildren(message)
  }

  // 0〜100 の進み具合をバーで見せる
  setLoadingProgress(percent) {
    const wrap = this.loadingEl?.querySelector(".studio-progress")
    if (!wrap) return
    wrap.hidden = false
    wrap.querySelector(".studio-progress-bar").style.width = `${Math.min(100, Math.max(0, percent))}%`
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
