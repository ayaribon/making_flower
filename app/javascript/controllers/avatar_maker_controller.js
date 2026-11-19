import { Controller } from "@hotwired/stimulus"
import {
  normalizeAvatar, randomAvatar, cleanMsg, DEFAULT_AVATAR, HAIRS, EYES, TOPS, BOTTOMS, ACCESSORIES
} from "avatar_sprite"
import { drawHuman, avatarLayersOf, USE_HAIR_VARIANTS, USE_ACCESSORIES } from "avatar_human"
import { HUMAN_HAIRSTYLES, AVATAR_EQUIP, AVATAR_SAVE_KEYS, AVATAR_FACE_SLOTS } from "avatar_sprite"
import { CHIBI_SKINS as SKINS, CHIBI_HAIRS as HAIR_COLORS, CHIBI_CLOTHS as CLOTH_COLORS } from "avatar_chibi"
import { findGear } from "dettyan_gear"

// 👤 キャラメイク。docs/town/requirements.md
// 左に 大きく 見本（まばたき・ときどき 足ぶみ）、右で えらぶ。💾 で サーバーに 保存して まち へ もどる
// 💬 ひとこと（まちで キャラが 言う ことば）も ここで かえられる（まちの 下の 入力でも かえられる）
// 絵は avatar_chibi.js（16×20。Sprout Lands の 町と 同じ 細かさ）
const ACC_NAMES = { manbun: "マンバン" }
// 見本の むき（右まわり の じゅん）
const DIRS = ["down", "downright", "right", "upright", "up", "upleft", "left", "downleft"]
const PW = 20 // 見本の 大きさ（ドット。こもの が 上に はみ出しても 入るように）
const PH = 28
const OX = 2
const OY = 6

export default class extends Controller {
  static targets = ["preview", "groups", "save", "status", "msg", "displayName", "nameLabel", "turn", "spinButton"]
  static values = { avatar: Object, url: String, back: String, account: String, humanUrl: String, hairUrls: Object, layerUrls: Object }

  connect() {
    this.saved = normalizeAvatar(this.hasSaved() ? this.avatarValue : DEFAULT_AVATAR)
    this.avatar = { ...this.saved }
    if (this.hasMsgTarget) this.msgTarget.value = this.saved.msg || ""
    const c = this.previewTarget
    c.width = PW
    c.height = PH
    this.g = c.getContext("2d")
    this.renderGroups()
    // 🧑 人の テンプレートが あれば、町と 同じ 絵で 見本を 出す（色と こもの を えらぶ）
    // 🧑 人の テンプレートで 見本を 出す。読めなければ「よみこめなかった」（前の 2頭身の 絵は 2026-11-19 に やめた）
    const artError = () => { this.statusTarget.textContent = "キャラの 絵を よみこめなかったよ… ページを ひらきなおしてね" }
    if (!this.humanUrlValue) artError()
    if (this.humanUrlValue) {
      const img = new Image()
      img.onload = () => { this.human = img; this.useHumanPreview(); this.renderGroups() }
      img.onerror = artError
      img.src = this.humanUrlValue
      this.loadHairParts()
      this.loadLayers()
    }
    this.t = 0
    this.last = performance.now()
    this.loop = (now) => {
      this.t += Math.min(0.1, (now - this.last) / 1000)
      this.last = now
      this.drawPreview()
      this.raf = requestAnimationFrame(this.loop)
    }
    this.raf = requestAnimationFrame(this.loop)
  }

  disconnect() {
    cancelAnimationFrame(this.raf)
  }

  // ---- 🔄 むきを かえる（2026-11-19 に ayaribon が「まわし、こちらでも できるように」） ----
  turnLeft() { this.turn(-1) }
  turnRight() { this.turn(1) }

  turn(step) {
    this.setSpin(false)
    this.dirIndex = (this.dirIndex || 0) + step
  }

  toggleSpin() { this.setSpin(this.spinning === false) }

  setSpin(on) {
    if (on && this.spinning === false) {
      // いまの むき から くるくる を つづける
      this.spinFrom = this.dirIndex || 0
      this.spinT0 = this.t
    }
    this.spinning = on
    if (this.hasSpinButtonTarget) {
      this.spinButtonTarget.setAttribute("aria-pressed", String(on))
      this.spinButtonTarget.textContent = on ? "⏸ くるくる" : "▶ くるくる"
    }
  }

  // キャラを よこに なぞると まわる（24px ごとに 1つ となりの むき）
  dragStart(e) {
    if (!this.human) return
    this.drag = { x: e.clientX, from: this.dirIndex || 0 }
    this.previewTarget.setPointerCapture?.(e.pointerId)
  }

  dragMove(e) {
    if (!this.drag) return
    const steps = Math.round((e.clientX - this.drag.x) / 24)
    if (steps === 0 && this.spinning !== false) return
    this.setSpin(false)
    this.dirIndex = this.drag.from + steps
  }

  // なぞらずに タップ（クリック）したら 1つ となりの むきへ（2026-11-19 に ayaribon が「タップで 1こずつ」）
  dragEnd(e) {
    const d = this.drag
    this.drag = null
    if (!d || e.type === "pointercancel") return
    if (Math.abs(e.clientX - d.x) < 8) this.turn(1)
  }

  // ← → キーでも まわる
  turnKey(e) {
    if (e.key === "ArrowLeft") { e.preventDefault(); this.turn(-1) }
    if (e.key === "ArrowRight") { e.preventDefault(); this.turn(1) }
  }

  hasSaved() {
    return this.avatarValue && Object.keys(this.avatarValue).length > 0
  }

  // 💇 髪の パーツ（hair_<ファイル名>_back / _front）を 読んで、そろった ものから 使う
  loadHairParts() {
    this.hairParts = {}
    for (const [key, url] of Object.entries(this.hairUrlsValue || {})) {
      const m = key.match(/^hair_(.+)_(back|front)$/)
      if (!m) continue
      const img = new Image()
      img.onload = () => {
        this.hairParts[m[1]] = { ...(this.hairParts[m[1]] || {}), [m[2]]: img }
        if (this.human) this.renderGroups()
      }
      img.src = url
    }
  }

  // 💇 素体＋髪レイヤー（ぜんぶ 読めたら 使う）
  loadLayers() {
    const entries = Object.entries(this.layerUrlsValue || {})
    if (!entries.find(([k]) => k === "avatar_base")) return
    const images = {}
    let left = entries.length
    for (const [key, url] of entries) {
      const img = new Image()
      const done = () => {
        if (--left > 0) return
        this.layers = avatarLayersOf(images)
        if (this.human) this.renderGroups()
      }
      img.onload = () => { images[key] = img; done() }
      img.onerror = done
      img.src = url
    }
  }

  useHumanPreview() {
    if (this.hasTurnTarget) this.turnTarget.hidden = false
    const c = this.previewTarget
    c.width = 24
    c.height = 40
    c.style.width = "144px"
    c.style.height = "240px"
    this.g = c.getContext("2d")
  }

  drawPreview() {
    const g = this.g
    if (!this.human) return // 絵を 読むまでは からっぽ
    if (this.human) {
      // ぐるっと 回って 見せる（2秒ごとに 向きを かえて、ときどき 歩く）
      g.clearRect(0, 0, 24, 40)
      g.fillStyle = "rgba(0, 0, 0, 0.18)"
      g.fillRect(6, 36, 12, 2)
      // 🔄 じぶんで まわしている ときは その むきで 立つ。くるくる の ときは 1.5秒ごとに となりの むきへ
      if (this.spinning !== false) this.dirIndex = (this.spinFrom || 0) + Math.floor((this.t - (this.spinT0 || 0)) / 1.5)
      const dir = DIRS[((this.dirIndex || 0) % DIRS.length + DIRS.length) % DIRS.length]
      const walking = this.spinning !== false && this.t % 6 > 3
      drawHuman(g, this.human, 12, 37, this.avatar, { dir, walking, t: this.t, parts: this.hairParts, layers: this.layers })
      return
    }
  }

  // ---- えらぶところ ----
  renderGroups() {
    const box = this.groupsTarget
    box.replaceChildren()
    if (!this.human) return // 絵を 読むまでは 出さない
    const a = this.avatar
    if (this.human) {
      // 人の テンプレートで 変えられる のは 色 と こもの
      this.group(box, "はだ", this.swatches("skin", SKINS))
      if (this.layers) this.group(box, "かみがた", this.choices("hs", HUMAN_HAIRSTYLES.filter((h) => !h.file || this.layers.hairs[h.id]).map((h) => ({ id: h.id, label: h.name, preview: { ...a, hs: h.id } }))))
      else if (USE_HAIR_VARIANTS) this.group(box, "かみがた", this.choices("hair", HAIRS.map((h) => ({ id: h.id, label: h.name, preview: { ...a, hair: h.id } }))))
      this.group(box, "かみの いろ", this.swatches("hairColor", HAIR_COLORS))
      // 👕 装備の 枠（画像が ある ものだけ）。ふくの いろ・ズボンの いろ は ふだん着 の ときだけ
      // 😊 顔の パーツ → 👕 いしょう・あたま・アクセサリー（画像が ある ものだけ）
      const order = [...AVATAR_FACE_SLOTS, "costume", "hat", "accessory"]
      // いしょう は 体だけの 画像（body_base）が あるときだけ（ないと 前の ふく と かさなる）
      const slots = this.layers ? order.filter((slot) => slot !== "costume" || this.layers.body).map((slot) => [slot, AVATAR_EQUIP[slot]]) : []
      const costume = slots.length && this.layers.items.costume[a.costume] ? a.costume : "default"
      const browsShow = HUMAN_HAIRSTYLES.find((h) => h.id === a.hs)?.showsBrows
      for (const [slot, s] of slots) {
        const key = AVATAR_SAVE_KEYS[slot]
        const face = AVATAR_FACE_SLOTS.includes(slot)
        // 画像が ある もの（目の「ふつう」は 素体の 目なので 画像なし）
        const have = s.items.filter((it) => it.maker && (!it.file || this.layers.items[slot][it.id]))
        if (!have.some((it) => it.file)) continue
        if (slot === "brows" && !browsShow) continue // 前髪で かくれる 髪型
        // 顔の 見本は めがね・ぼうし を はずして 見せる
        const base = face ? { ...a, hat: "none", accessory: "none" } : a
        const items = [
          ...(s.def === "none" ? [{ id: "none", label: "なし", preview: { ...base, [key]: "none" }, zoom: face }] : []),
          ...have.map((it) => ({ id: it.id, label: it.name, preview: { ...base, [key]: it.id }, zoom: face }))
        ]
        this.group(box, s.name, this.choices(key, items))
        if (slot === "costume" && costume === "default") {
          this.group(box, "ふくの いろ", this.swatches("topColor", CLOTH_COLORS))
          this.group(box, "ズボンの いろ", this.swatches("bottomColor", CLOTH_COLORS))
        }
      }
      if (!this.layers?.body) {
        this.group(box, "ふくの いろ", this.swatches("topColor", CLOTH_COLORS))
        this.group(box, "ズボンの いろ", this.swatches("bottomColor", CLOTH_COLORS))
      }
      this.group(box, "くつ", this.swatches("shoes", CLOTH_COLORS))
      if (USE_ACCESSORIES) this.group(box, "こもの", this.choices("acc", ACCESSORIES.map((id) => ({ id, label: id === "none" ? "なし" : findGear(id)?.name || ACC_NAMES[id] || id, preview: { ...a, acc: id } }))))
      return
    }
  }

  group(box, title, ...parts) {
    const sec = document.createElement("section")
    sec.className = "av-group"
    const h = document.createElement("h2")
    h.className = "av-group__title"
    h.textContent = title
    sec.append(h, ...parts)
    box.append(sec)
  }

  swatches(key, colors) {
    const row = document.createElement("div")
    row.className = "av-swatches"
    row.setAttribute("role", "radiogroup")
    colors.forEach((color, i) => {
      const b = document.createElement("button")
      b.type = "button"
      b.className = "av-swatch" + (this.avatar[key] === i ? " is-on" : "")
      b.style.background = color
      b.setAttribute("role", "radio")
      b.setAttribute("aria-checked", String(this.avatar[key] === i))
      b.setAttribute("aria-label", `${i + 1}ばんめ の いろ`)
      b.addEventListener("click", () => this.pick(key, i))
      row.append(b)
    })
    return row
  }

  choices(key, items) {
    const row = document.createElement("div")
    row.className = "av-choices"
    row.setAttribute("role", "radiogroup")
    for (const item of items) {
      const on = this.avatar[key] === item.id
      const b = document.createElement("button")
      b.type = "button"
      b.className = "av-choice" + (on ? " is-on" : "")
      b.setAttribute("role", "radio")
      b.setAttribute("aria-checked", String(on))
      const c = document.createElement("canvas")
      c.className = "av-choice__img" + (item.face ? " av-choice__img--face" : "")
      c.width = item.face ? 14 : 22
      c.height = item.face ? 7 : 26
      if (item.zoom) {
        // 顔の パーツは 顔の まわり だけ 大きく
        c.width = 14
        c.height = 11
        c.style.width = "56px"
        c.style.height = "44px"
        drawHuman(c.getContext("2d"), this.human, 7, 15, item.preview, { dir: "down", parts: this.hairParts, layers: this.layers })
      } else {
        c.width = 22
        c.height = 34
        c.style.width = "53px"
        c.style.height = "82px"
        drawHuman(c.getContext("2d"), this.human, 11, 32, item.preview, { dir: "down", parts: this.hairParts, layers: this.layers })
      }
      const label = document.createElement("span")
      label.textContent = item.label
      b.append(c, label)
      b.addEventListener("click", () => this.pick(key, item.id))
      row.append(b)
    }
    return row
  }

  pick(key, value) {
    this.avatar = normalizeAvatar({ ...this.avatar, [key]: value })
    this.statusTarget.textContent = ""
    const scroll = this.groupsTarget.scrollTop
    this.renderGroups()
    this.groupsTarget.scrollTop = scroll
  }

  random() {
    this.avatar = randomAvatar()
    this.renderGroups()
  }

  // 🏷️ なまえ を 打つと 見本の 下の なまえも かわる（空なら ログインの 呼び名）
  nameChanged() {
    if (this.hasNameLabelTarget) this.nameLabelTarget.textContent = cleanMsg(this.displayNameTarget.value) || this.accountValue
  }

  reset() {
    this.avatar = { ...this.saved }
    if (this.hasMsgTarget) this.msgTarget.value = this.saved.msg || ""
    this.renderGroups()
  }

  // 💾 保存して まち へ もどる
  async save() {
    this.saveTarget.disabled = true
    this.statusTarget.textContent = "ほぞん しています…"
    try {
      const res = await fetch(this.urlValue, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json", "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || "" },
        // msg は から でも 送る（サーバーは 送った 項目だけ かえるので、から ＝ けす）
        body: JSON.stringify({
          avatar: { ...this.avatar, msg: this.hasMsgTarget ? cleanMsg(this.msgTarget.value) : this.avatar.msg || "" },
          ...(this.hasDisplayNameTarget ? { display_name: cleanMsg(this.displayNameTarget.value) } : {})
        })
      })
      if (!res.ok) throw new Error(String(res.status))
      this.saved = { ...this.avatar }
      this.statusTarget.textContent = "ほぞん したよ！ まち へ もどるね"
      setTimeout(() => { window.location.href = this.backValue }, 700)
    } catch (e) {
      this.statusTarget.textContent = "ほぞん できなかった… もう一度 おしてね"
      this.saveTarget.disabled = false
    }
  }
}
