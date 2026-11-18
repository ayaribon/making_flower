import { Controller } from "@hotwired/stimulus"
import {
  drawAvatar, normalizeAvatar, randomAvatar, cleanMsg, DEFAULT_AVATAR,
  SKINS, HAIR_COLORS, CLOTH_COLORS, HAIRS, EYES, TOPS, BOTTOMS, ACCESSORIES
} from "avatar_sprite"
import { findGear } from "dettyan_gear"

// 👤 キャラメイク。docs/town/requirements.md
// 左に 大きく 見本（まばたき・ときどき 足ぶみ）、右で えらぶ。💾 で サーバーに 保存して まち へ もどる
// 💬 ひとこと（まちで キャラが 言う ことば）も ここで かえられる（まちの 下の 入力でも かえられる）
const PW = 28 // 見本の 大きさ（ドット。こもの が はみ出しても 入るように）
const PH = 32
const OX = 4
const OY = 6

export default class extends Controller {
  static targets = ["preview", "groups", "save", "status", "msg", "displayName", "nameLabel"]
  static values = { avatar: Object, url: String, back: String, account: String }

  connect() {
    this.saved = normalizeAvatar(this.hasSaved() ? this.avatarValue : DEFAULT_AVATAR)
    this.avatar = { ...this.saved }
    if (this.hasMsgTarget) this.msgTarget.value = this.saved.msg || ""
    const c = this.previewTarget
    c.width = PW
    c.height = PH
    this.g = c.getContext("2d")
    this.renderGroups()
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

  hasSaved() {
    return this.avatarValue && Object.keys(this.avatarValue).length > 0
  }

  drawPreview() {
    const g = this.g
    g.clearRect(0, 0, PW, PH)
    g.fillStyle = "rgba(0, 0, 0, 0.18)"
    g.fillRect(OX + 4, OY + 23, 12, 2)
    const t = this.t
    const blink = t % 3.2 > 3.05
    const frame = t % 6 > 4.5 ? Math.floor(t * 5) % 2 : 0 // ときどき 足ぶみ
    drawAvatar(this.g, OX, OY - frame, this.avatar, { frame, blink })
  }

  // ---- えらぶところ ----
  renderGroups() {
    const box = this.groupsTarget
    box.replaceChildren()
    const a = this.avatar
    this.group(box, "はだ", this.swatches("skin", SKINS))
    this.group(box, "かみがた", this.choices("hair", HAIRS.map((h) => ({ id: h.id, label: h.name, preview: { ...a, hair: h.id } }))))
    this.group(box, "かみの いろ", this.swatches("hairColor", HAIR_COLORS))
    this.group(box, "め", this.choices("eyes", EYES.map((e) => ({ id: e.id, label: e.name, preview: { ...a, eyes: e.id }, face: true }))))
    this.group(box, "ふく", this.choices("top", TOPS.map((x) => ({ id: x.id, label: x.name, preview: { ...a, top: x.id } }))), this.swatches("topColor", CLOTH_COLORS))
    this.group(box, "した", this.choices("bottom", BOTTOMS.map((x) => ({ id: x.id, label: x.name, preview: { ...a, bottom: x.id } }))), this.swatches("bottomColor", CLOTH_COLORS))
    this.group(box, "くつ", this.swatches("shoes", CLOTH_COLORS))
    this.group(box, "こもの", this.choices("acc", ACCESSORIES.map((id) => ({ id, label: id === "none" ? "なし" : findGear(id)?.name || id, preview: { ...a, acc: id } }))))
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
      c.width = item.face ? 16 : 26
      c.height = item.face ? 8 : 30
      const g = c.getContext("2d")
      if (item.face) drawAvatar(g, -2, -7, item.preview) // 目のあたりだけ
      else drawAvatar(g, 3, 5, item.preview)
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
