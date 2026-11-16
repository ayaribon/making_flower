// 🧑‍🎨 ドット絵の子（歌ってみたの「歌う子」と、画像編集の「ほめてくれる子」で同じ子を使う）
// 1マス＝1ドット。"." は透明。口（9〜10行目の 8・9列目）と目（E）は、描くときに入れかえる

// 🎤 マイクを持っている（歌ってみた）
export const SINGER_SPRITE = [
  "....FF............",
  "...FfF.KKKK.......",
  "....FKKHHHHKK.....",
  "....KHHhhHHHHK....",
  "...KHHHHHHHHHHK...",
  "...KHSSSSSSSSHK...",
  "...KHSESSSSESHK...",
  "...KHSESSSSESHKmm.",
  "...KHsSSSSSSsHKmm.",
  "...KHSSS..SSSHKKM.",
  "....KKSS..SSKK..M.",
  ".....KDDDDDDK...M.",
  "....KDDDDDDDDKSSM.",
  "...KSKDDDDDDDKK...",
  "....KdDDDDDDdK....",
  "....KddddddddK....",
  ".....KSK..KSK.....",
  ".....KK....KK....."
]

// 🖌 筆を持っている（画像編集）
export const PAINTER_SPRITE = [
  "....FF............",
  "...FfF.KKKK.......",
  "....FKKHHHHKK.....",
  "....KHHhhHHHHK....",
  "...KHHHHHHHHHHK...",
  "...KHSSSSSSSSHK.p.",
  "...KHSESSSSESHKpp.",
  "...KHSESSSSESHKpp.",
  "...KHsSSSSSSsHKKg.",
  "...KHSSS..SSSHK.B.",
  "....KKSS..SSKK..B.",
  ".....KDDDDDDK...B.",
  "....KDDDDDDDDKSSB.",
  "...KSKDDDDDDDKK...",
  "....KdDDDDDDdK....",
  "....KddddddddK....",
  ".....KSK..KSK.....",
  ".....KK....KK....."
]

export const BUDDY_COLORS = {
  K: "#2b1d2e", H: "#7a4fb5", h: "#b08ae0", S: "#ffdcc8", s: "#ff9eb5", E: "#2b1d2e",
  F: "#ff7ab6", f: "#ffe066", D: "#5ec8ff", d: "#3a9ad9", M: "#4a4a5a", m: "#c9c9d6", O: "#c2304a",
  p: "#ff5fa2", g: "#c9c9d6", B: "#a0673a"
}

// 子を描く。mouth：0＝とじる／1＝少しあける／2＝大きくあける。eyes："open" | "blink" | "happy"
export function drawBuddy(g, sprite, ox, oy, { mouth = 0, eyes = "open" } = {}) {
  for (let y = 0; y < sprite.length; y++) {
    const row = sprite[y]
    for (let x = 0; x < row.length; x++) {
      let c = row[x]
      if ((x === 8 || x === 9) && (y === 9 || y === 10)) {
        if (y === 9) c = mouth === 0 ? "K" : "O"
        else c = mouth === 2 ? "O" : "S"
      }
      if (c === "E" && eyes === "blink") c = y === 7 ? "K" : "S"
      if (c === "E" && eyes === "happy") c = y === 6 ? "K" : "S"
      if (c === ".") continue
      g.fillStyle = BUDDY_COLORS[c]
      g.fillRect(ox + x, oy + y, 1, 1)
    }
  }
}

// ✋ つままれているとき：うつぶせ（横になって）、手足をじたばた、あせが飛ぶ。t は秒
// ox, oy は、ふつうに立っているときの左上（同じ所を中心にして描く）
export function drawDangling(g, sprite, ox, oy, t) {
  const n = sprite.length
  const cx = ox + n / 2
  const cy = oy + n / 2
  const flap = Math.floor(t * 14) % 2 // じたばたの速さ
  const shake = Math.floor(t * 9) % 2
  g.save()
  // 横向きに寝かせる（90°なので、ドットはくずれない）。ぶるぶる小さくゆれる
  g.translate(Math.round(cx), Math.round(cy) + shake)
  g.rotate(Math.PI / 2)
  g.translate(-n / 2, -n / 2)
  drawBuddy(g, sprite, 0, 0, { mouth: 2, eyes: "blink" }) // ぎゅっと目をつぶって、口を大きくあけて「ﾜｧ~」
  g.restore()
  // 下にぶらさがる手足（交互にパタパタ）
  const by = Math.round(cy) + shake + 6
  const limbs = [[-6, 0], [-3, 1], [2, 0], [5, 1]]
  limbs.forEach(([dx, ph]) => {
    const len = (flap + ph) % 2 ? 4 : 2
    const x = Math.round(cx) + dx + ((flap + ph) % 2 ? 1 : 0)
    g.fillStyle = BUDDY_COLORS.K
    g.fillRect(x, by, 1, len + 1)
    g.fillStyle = BUDDY_COLORS.S
    g.fillRect(x + 1, by, 1, len)
  })
  // あせ（頭のほうから、交互に飛ぶ）
  g.fillStyle = "#6ec8ff"
  const sx = Math.round(cx) + 9
  const sy = Math.round(cy) - 7
  if (flap) { g.fillRect(sx, sy, 1, 2); g.fillRect(sx + 3, sy + 2, 1, 1) }
  else { g.fillRect(sx + 1, sy - 2, 1, 2); g.fillRect(sx + 4, sy, 1, 1) }
}

// 🫠 落とされたあと：落ちる → べちゃっ（ぺたんと寝る・ほこり）→ ｳﾝｼｮｯ（しゃがんで起きる）→ ぴょんと立つ
// t は落としてからの秒。DROP_LEN をこえたら、ふつうに戻る
export const DROP_LEN = 1.45
export const DROP_GETUP_AT = 0.8 // 「ｳﾝｼｮｯ」を出す時間
export function drawDropped(g, sprite, ox, oy, t) {
  const n = sprite.length
  const cx = Math.round(ox + n / 2)
  const ground = oy + n // 足もとの高さ
  const lying = (dy, eyes) => {
    g.save()
    g.translate(cx, Math.round(ground - n / 2 + 3 + dy)) // 寝ると低くなる
    g.rotate(Math.PI / 2)
    g.translate(-n / 2, -n / 2)
    drawBuddy(g, sprite, 0, 0, { mouth: 0, eyes })
    g.restore()
  }
  if (t < 0.12) {
    // 落ちる（少し上から、ぺたんと）
    lying(-6 + (t / 0.12) * 6, "blink")
    return
  }
  if (t < DROP_GETUP_AT) {
    // べちゃっ：寝たまま、ほこりが左右に飛ぶ。少しだけぴくぴく
    lying(t > 0.5 && Math.floor(t * 10) % 3 === 0 ? -1 : 0, "blink")
    if (t < 0.45) {
      const s = (t - 0.12) / 0.33
      g.fillStyle = "rgba(200, 190, 205, 0.9)"
      const spread = Math.round(10 + s * 6)
      const y = ground - 1 - Math.round(s * 2)
      ;[[-spread, 0], [-spread - 2, -1], [spread, 0], [spread + 2, -1]].forEach(([dx, dy]) => g.fillRect(cx + dx, y + dy, 2, 1))
    }
    return
  }
  if (t < 1.15) {
    // ｳﾝｼｮｯ：しゃがんで、うでで起き上がる（下のほうを地面にうめるように、低く描く）
    const up = (t - DROP_GETUP_AT) / (1.15 - DROP_GETUP_AT) // 0 → 1
    const sink = Math.round(5 - up * 5)
    g.save()
    g.beginPath()
    g.rect(0, 0, 999, ground)
    g.clip()
    drawBuddy(g, sprite, ox, oy + sink, { mouth: 0, eyes: "blink" })
    g.restore()
    // ふんばるあせ
    if (Math.floor(t * 8) % 2) { g.fillStyle = "#6ec8ff"; g.fillRect(cx + 8, oy + sink + 2, 1, 2) }
    return
  }
  // 立った！ぴょん
  const p = (t - 1.15) / (DROP_LEN - 1.15)
  drawBuddy(g, sprite, ox, oy - Math.round(Math.sin(Math.min(1, p) * Math.PI) * 3), { mouth: 1, eyes: "happy" })
}

// 小さなドットの形（音符・ハート・キラキラ）
export const PIXEL_SHAPES = {
  note: ["..K..", "..KK.", "..K.K", "..K..", "KKK..", "KKK.."],
  heart: [".K.K.", "KKKKK", "KKKKK", ".KKK.", "..K.."],
  sparkle: ["..K..", "..K..", "KKKKK", "..K..", "..K.."]
}

export function drawShape(g, shape, x, y, color) {
  g.fillStyle = color
  shape.forEach((row, dy) => { for (let dx = 0; dx < row.length; dx++) if (row[dx] === "K") g.fillRect(x + dx, y + dy, 1, 1) })
}

// ---------- ✋ 指でなぞって運ぶ・10回たたくと「じゃま？」 ----------
// el：動かす箱（画面に固定して置き直す）／ handle：さわる所（なければ el）
// name：子ごとの名前（場所と「消した」を別々に覚える）
// 「消した」はログインの間だけ（<meta name="kb-login-id"> の番号と一緒に覚える。ログインし直すと番号が変わって、また出てくる）
const TAPS_TO_ASK = 10
const TAP_GAP_MS = 2500 // これより間があくと、数え直す

function loginId() {
  const m = document.querySelector('meta[name="kb-login-id"]')
  return (m && m.content) || "guest"
}
function store(key, value) {
  try {
    if (value === undefined) return window.localStorage.getItem(key)
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch (e) {}
  return null
}

export function buddyHidden(name) {
  return store(`kb-buddy-hidden-${name}`) === loginId()
}

export class BuddyHandle {
  constructor(el, { name, handle = null, onTap = null, onHide = null, onDragStart = null, onDragEnd = null } = {}) {
    this.el = el
    this.name = name
    this.handle = handle || el
    this.onTap = onTap
    this.onHide = onHide
    this.onDragStart = onDragStart
    this.onDragEnd = onDragEnd
    this.dragging = false
    this.wa = null
    this.droppedAt = -1
    this.sayTimers = []
    this.taps = 0
    this.lastTap = 0
    this.drag = null
    this.ask = null
    this.handle.style.touchAction = "none" // 指でなぞっても、画面がスクロールしないように
    this.handle.style.cursor = "grab"
    this.down = this.down.bind(this)
    this.move = this.move.bind(this)
    this.up = this.up.bind(this)
    this.onResize = () => this.clampIntoView()
    this.handle.addEventListener("pointerdown", this.down)
    window.addEventListener("resize", this.onResize)
    this.restore()
  }

  destroy() {
    this.handle.removeEventListener("pointerdown", this.down)
    window.removeEventListener("resize", this.onResize)
    this.closeAsk()
    this.clearSay()
    this.hideWa()
  }

  get hidden() {
    return buddyHidden(this.name)
  }

  // 前に置いた場所（画面に対する割合で覚えている）
  restore() {
    let pos = null
    try { pos = JSON.parse(store(`kb-buddy-pos-${this.name}`) || "null") } catch (e) {}
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) this.placeAt(pos.x * window.innerWidth, pos.y * window.innerHeight)
  }

  placeAt(left, top) {
    const r = this.el.getBoundingClientRect()
    const w = r.width || 80
    const h = r.height || 80
    const x = Math.max(0, Math.min(window.innerWidth - w, left))
    const y = Math.max(0, Math.min(window.innerHeight - h, top))
    Object.assign(this.el.style, { position: "fixed", left: `${x}px`, top: `${y}px`, right: "auto", bottom: "auto" })
    this.el.classList.add("is-moved")
    // 親に filter・transform などがあると、fixed が画面ではなく親に合わせて置かれる。そのときは body の直下に移す
    if (!this.el.hidden && this.el.parentElement !== document.body) {
      const r2 = this.el.getBoundingClientRect()
      if (Math.abs(r2.left - x) > 1 || Math.abs(r2.top - y) > 1) document.body.appendChild(this.el)
    }
  }

  clampIntoView() {
    if (!this.el.classList.contains("is-moved")) return
    const r = this.el.getBoundingClientRect()
    this.placeAt(r.left, r.top)
  }

  down(e) {
    if (e.button !== undefined && e.button !== 0) return
    const r = this.el.getBoundingClientRect()
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false }
    try { this.handle.setPointerCapture(e.pointerId) } catch (err) {}
    this.handle.addEventListener("pointermove", this.move)
    this.handle.addEventListener("pointerup", this.up)
    this.handle.addEventListener("pointercancel", this.up)
    e.preventDefault()
  }

  move(e) {
    const d = this.drag
    if (!d || e.pointerId !== d.id) return
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return // 6px までは「たたいただけ」
    if (!d.moved) {
      d.moved = true
      this.closeAsk()
      this.handle.style.cursor = "grabbing"
      this.el.classList.add("is-dragging")
      this.dragging = true
      this.droppedAt = -1
      this.clearSay()
      this.hideWa()
      this.showWa()
      if (this.onDragStart) this.onDragStart()
    }
    this.placeAt(e.clientX - d.dx, e.clientY - d.dy)
    this.moveWa()
  }

  // 落としてからの秒（落としていない・もう起きたときは null）
  get dropT() {
    if (this.droppedAt < 0) return null
    const t = (performance.now() - this.droppedAt) / 1000
    return t < DROP_LEN ? t : null
  }

  // 落とされた：べちゃっ → ｳﾝｼｮｯ
  drop() {
    this.droppedAt = performance.now()
    this.clearSay()
    this.say("べちゃっ", 650)
    this.sayTimers.push(setTimeout(() => this.say("ｳﾝｼｮｯ", 600), DROP_GETUP_AT * 1000))
  }

  // 子の上に、少しのあいだだけ言葉を出す
  say(text, ms) {
    this.hideWa()
    this.showWa(text)
    this.sayTimers.push(setTimeout(() => { if (!this.dragging) this.hideWa() }, ms))
  }

  clearSay() {
    this.sayTimers.forEach((id) => clearTimeout(id))
    this.sayTimers = []
  }

  // 「ﾜｧ~💦」の吹き出し（運んでいる間だけ、子の上に出る）
  showWa(text = "ﾜｧ~💦") {
    if (this.wa) return
    const el = document.createElement("div")
    el.className = "kb-buddy-wa"
    el.textContent = text
    el.setAttribute("aria-hidden", "true")
    document.body.appendChild(el)
    this.wa = el
    this.moveWa()
  }

  moveWa() {
    if (!this.wa) return
    const r = this.el.getBoundingClientRect()
    Object.assign(this.wa.style, { left: `${r.left + r.width / 2}px`, top: `${Math.max(4, r.top - 6)}px` })
  }

  hideWa() {
    if (this.wa) this.wa.remove()
    this.wa = null
  }

  up(e) {
    const d = this.drag
    if (!d || e.pointerId !== d.id) return
    this.drag = null
    this.handle.removeEventListener("pointermove", this.move)
    this.handle.removeEventListener("pointerup", this.up)
    this.handle.removeEventListener("pointercancel", this.up)
    this.handle.style.cursor = "grab"
    this.el.classList.remove("is-dragging")
    if (this.dragging) {
      this.dragging = false
      this.hideWa()
      this.drop() // 🫠 べちゃっ → ｳﾝｼｮｯ
      if (this.onDragEnd) this.onDragEnd()
    }
    if (d.moved) {
      const r = this.el.getBoundingClientRect()
      store(`kb-buddy-pos-${this.name}`, JSON.stringify({ x: r.left / window.innerWidth, y: r.top / window.innerHeight }))
      return
    }
    if (e.type === "pointercancel") return
    this.tap()
  }

  tap() {
    const now = performance.now()
    this.taps = now - this.lastTap > TAP_GAP_MS ? 1 : this.taps + 1
    this.lastTap = now
    if (this.taps >= TAPS_TO_ASK) {
      this.taps = 0
      this.openAsk()
      return
    }
    if (this.onTap) this.onTap(this.taps)
  }

  // 「じゃま？」：子の上に小さく出す（けす／このまま）
  openAsk() {
    this.closeAsk()
    const box = document.createElement("div")
    box.className = "kb-buddy-ask"
    box.setAttribute("role", "dialog")
    box.setAttribute("aria-label", "じゃま？")
    box.innerHTML = '<p class="kb-buddy-ask__q">じゃま？</p><div class="kb-buddy-ask__btns">' +
      '<button type="button" data-ans="hide">けす</button><button type="button" data-ans="keep">このまま</button></div>' +
      '<p class="kb-buddy-ask__note">けしても、ログインし直すと戻ってきます</p>'
    box.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-ans]")
      if (!b) return
      if (b.dataset.ans === "hide") this.hide()
      this.closeAsk()
    })
    document.body.appendChild(box)
    const r = this.el.getBoundingClientRect()
    const bw = box.offsetWidth
    const bh = box.offsetHeight
    const left = Math.max(8, Math.min(window.innerWidth - bw - 8, r.left + r.width / 2 - bw / 2))
    const top = r.top - bh - 8 >= 8 ? r.top - bh - 8 : Math.min(window.innerHeight - bh - 8, r.bottom + 8)
    Object.assign(box.style, { left: `${left}px`, top: `${top}px` })
    box.querySelector("button[data-ans=keep]").focus()
    this.ask = box
    this.onOutside = (e) => { if (this.ask && !this.ask.contains(e.target) && !this.el.contains(e.target)) this.closeAsk() }
    setTimeout(() => document.addEventListener("pointerdown", this.onOutside), 0)
  }

  closeAsk() {
    if (this.ask) this.ask.remove()
    this.ask = null
    if (this.onOutside) document.removeEventListener("pointerdown", this.onOutside)
    this.onOutside = null
  }

  hide() {
    store(`kb-buddy-hidden-${this.name}`, loginId())
    this.el.hidden = true
    if (this.onHide) this.onHide()
  }
}
