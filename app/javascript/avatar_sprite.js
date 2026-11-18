// 👤 みんなの アバター（キャラメイク）。docs/town/requirements.md
// Dettyan と同じ 20×24 ドットの 体に、はだ・かみがた・め・ふく・こもの を かさねて描く
// - アバターの中身は ただのデータ（normalizeAvatar で いつも 使える形に そろえる）。サーバーには この形で保存する
// - こもの は Dettyan 育成ゲームの「あたま」の そうび の絵を つかう（dettyan_gear.js）
// えらべるものを 増やすときは、下の表に 1つ足す（id はサーバーに 保存されるので、あとから変えない）

import { drawArt, findGear } from "dettyan_gear"

export const AV_W = 20
export const AV_H = 24

export const SKINS = ["#f6d3b3", "#f0c39a", "#dda57a", "#b97c55", "#8a5638"]
export const HAIR_COLORS = ["#1f1f24", "#5e3a1f", "#a0642e", "#e8c060", "#f0a0c0", "#5a7ae0", "#9a6ad0", "#d8d8e8", "#d0483a"]
export const CLOTH_COLORS = ["#8a5a33", "#e0484d", "#ff8ac6", "#ffb347", "#ffe066", "#5cc46a", "#4f8fe8", "#2a3a7a", "#9b5fd0", "#2b2b35", "#f4f1ea"]

export const HAIRS = [
  { id: "short", name: "ショート" },
  { id: "bun", name: "おだんご" },
  { id: "bob", name: "ボブ" },
  { id: "long", name: "ロング" },
  { id: "twin", name: "ツインテール" },
  { id: "pony", name: "ポニーテール" }
]
export const EYES = [
  { id: "dot", name: "ふつう" },
  { id: "smile", name: "にっこり" },
  { id: "big", name: "キラキラ" },
  { id: "sharp", name: "きりっ" }
]
export const TOPS = [
  { id: "jacket", name: "ジャケット" },
  { id: "tee", name: "Tシャツ" },
  { id: "hoodie", name: "パーカー" }
]
export const BOTTOMS = [
  { id: "pants", name: "ズボン" },
  { id: "skirt", name: "スカート" }
]
// こもの（"none" か、dettyan_gear.js の あたま の そうび の id）
export const ACCESSORIES = ["none", "cap", "headphones", "ribbon", "nekomimi", "usamimi", "hanakanmuri", "crown"]

export const DEFAULT_AVATAR = {
  v: 1, skin: 0, hair: "short", hairColor: 0, eyes: "dot",
  top: "jacket", topColor: 6, bottom: "pants", bottomColor: 9, shoes: 9, acc: "none"
}

const idsOf = (list) => list.map((x) => x.id)
const CHOICES = {
  hair: idsOf(HAIRS), eyes: idsOf(EYES), top: idsOf(TOPS), bottom: idsOf(BOTTOMS), acc: ACCESSORIES
}
const RANGES = { skin: SKINS.length, hairColor: HAIR_COLORS.length, topColor: CLOTH_COLORS.length, bottomColor: CLOTH_COLORS.length, shoes: CLOTH_COLORS.length }

// どんな データでも、いつも 使える形に そろえる（知らない値は 初めの値）
export function normalizeAvatar(raw) {
  const a = { ...DEFAULT_AVATAR }
  if (!raw || typeof raw !== "object") return a
  for (const [k, n] of Object.entries(RANGES)) {
    const v = Number(raw[k])
    if (Number.isInteger(v) && v >= 0 && v < n) a[k] = v
  }
  for (const [k, list] of Object.entries(CHOICES)) if (list.includes(raw[k])) a[k] = raw[k]
  return a
}

// 🎲 おまかせ
export function randomAvatar(rand = Math.random) {
  const pick = (list) => list[Math.floor(rand() * list.length)]
  const idx = (n) => Math.floor(rand() * n)
  return normalizeAvatar({
    skin: idx(SKINS.length), hair: pick(CHOICES.hair), hairColor: idx(HAIR_COLORS.length), eyes: pick(CHOICES.eyes),
    top: pick(CHOICES.top), topColor: idx(CLOTH_COLORS.length), bottom: pick(CHOICES.bottom), bottomColor: idx(CLOTH_COLORS.length),
    shoes: idx(CLOTH_COLORS.length), acc: rand() < 0.5 ? "none" : pick(ACCESSORIES)
  })
}

// ---- 絵 ----

// かみ の ない 体（"." は透明）。E：目の場所、m：口
const BASE = [
  "....................",
  "....................",
  "....................",
  "....................",
  "......KKKKKKKK......",
  ".....KSSSSSSSSK.....",
  "....KSSSSSSSSSSK....",
  "...KSSSSSSSSSSSSK...",
  "...KSSSSSSSSSSSSK...",
  "...KSSSSSSSSSSSSK...",
  "...KSSESSSSSSESSK...",
  "...KSSESSSSSSESSK...",
  "...KsSSSSSSSSSSsK...",
  "....KSSSSmmSSSSK....",
  ".....KKSSSSSSKK.....",
  ".......KSSSSK.......",
  "....KTTTWWWWTTTK....",
  "...KTTTtWWWWtTTTK...",
  "...KTTTTtWWtTTTTK...",
  "...KTTTTTttTTTTTK...",
  "...KSTTTTTTTTTTSK...",
  "....KPPPPPPPPPPK....",
  ".....KPPK..KPPK.....",
  "....KFFFK..KFFFK...."
]
// スカート（21・22行目を入れかえる）と、歩くときの 2コマ目
const SKIRT = { 21: "...KPPPPPPPPPPPPK...", 22: ".....KSSK..KSSK....." }
const WALK = { 23: ".....KFFK..KFFFK...." }

// かみがた。back：体のうしろ（はみ出した所だけ見える）、front：顔の上
const SHORT_FRONT = [
  "......KKKKKKKK......",
  ".....KHHHHHHHHK.....",
  "....KHHhHHHHHHHK....",
  "...KHHHHHHHHHHHHK...",
  "...KHHHHHHHHHHHHK...",
  "...KHH.H....H.HHK...",
  "...KH..........HK..."
]
const BOB_FRONT = [
  "......KKKKKKKK......",
  ".....KHHHHHHHHK.....",
  "....KHHhHHHHHHHK....",
  "...KHHHHHHHHHHHHK...",
  "..KHHHHHHHHHHHHHHK..",
  "..KHHHHHHHHHHHHHHK..",
  "..KHHK........KHHK..",
  "..KHH..........HHK..",
  "..KHH..........HHK..",
  "..KHH..........HHK.."
]
const HAIR_ART = {
  short: { front: { x: 0, y: 3, rows: SHORT_FRONT } },
  bun: {
    front: { x: 0, y: 0, rows: ["........KKKK........", ".......KHHHHK.......", ".......KHhHHK.......", ...SHORT_FRONT] }
  },
  bob: { front: { x: 0, y: 3, rows: [...BOB_FRONT, "..KKK..........KKK.."] } },
  long: {
    back: { x: 0, y: 9, rows: [...Array(10).fill("..KHHHHHHHHHHHHHHK.."), "...KKKKKKKKKKKKKK..."] },
    front: { x: 0, y: 3, rows: [...BOB_FRONT, "..KHH..........HHK..", "..KHH..........HHK..", "..KHH..........HHK..", "..KKK..........KKK.."] }
  },
  twin: {
    back: { x: -2, y: 6, rows: [
      ".KK..................KK.",
      "KrrK................KrrK",
      "KHHK................KHHK",
      "KHhK................KhHK",
      "KHHK................KHHK",
      "KHHK................KHHK",
      "KHHK................KHHK",
      "KHHK................KHHK",
      ".KHHK..............KHHK.",
      ".KHHK..............KHHK.",
      "..KK................KK.."
    ] },
    front: { x: 0, y: 3, rows: [...BOB_FRONT.slice(0, 7), "..KHH..........HHK..", "..KKK..........KKK.."] }
  },
  pony: {
    back: { x: 13, y: 1, rows: [
      "..KKK..",
      ".KHHHK.",
      ".KHhHK.",
      "..KrrK.",
      "..KHHHK",
      "...KHHK",
      "...KHHK",
      "...KHHK",
      "...KHHK",
      "...KHHK",
      "...KHK.",
      "....K.."
    ] },
    front: { x: 0, y: 3, rows: SHORT_FRONT }
  }
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// 色を まぜる（amount < 0 で くらく、> 0 で あかるく）
export function shade(hex, amount) {
  const [r, g, b] = hexToRgb(hex)
  const to = amount < 0 ? 0 : 255
  const k = Math.abs(amount)
  const f = (c) => Math.round(c + (to - c) * k).toString(16).padStart(2, "0")
  return `#${f(r)}${f(g)}${f(b)}`
}

export function avatarPalette(a) {
  const top = CLOTH_COLORS[a.topColor]
  const hair = HAIR_COLORS[a.hairColor]
  const shoes = CLOTH_COLORS[a.shoes]
  return {
    K: "#1a1414",
    S: SKINS[a.skin],
    s: a.skin >= 3 ? shade(SKINS[a.skin], 0.25) : "#f2a3a3",
    E: "#1a1414",
    m: "#9a4a3a",
    T: top,
    t: a.top === "tee" ? top : shade(top, -0.3),
    W: a.top === "jacket" ? "#f4f1ea" : a.top === "tee" ? top : shade(top, 0.25),
    P: CLOTH_COLORS[a.bottomColor],
    F: shoes,
    H: hair,
    h: shade(hair, 0.35),
    r: "#ff5f8f",
    w: "#ffffff"
  }
}

// アバターを描く。opts：{ frame：0|1（歩く）, blink：まばたき, mood："smile"（にっこり目に する） }
export function drawAvatar(g, ox, oy, raw, { frame = 0, blink = false, mood = null } = {}) {
  const a = normalizeAvatar(raw)
  const pal = avatarPalette(a)
  const hair = HAIR_ART[a.hair]
  if (hair.back) drawArt(g, hair.back, pal, ox, oy)
  for (let y = 0; y < AV_H; y++) {
    let row = BASE[y]
    if (a.bottom === "skirt" && SKIRT[y]) row = SKIRT[y]
    if (frame === 1 && WALK[y]) row = WALK[y]
    for (let x = 0; x < AV_W; x++) {
      const c = row[x]
      if (c === "." || c === "E") continue
      g.fillStyle = pal[c]
      g.fillRect(ox + x, oy + y, 1, 1)
    }
  }
  drawEyes(g, ox, oy, blink ? "blink" : mood === "smile" ? "smile" : a.eyes, pal)
  if (a.top === "hoodie") {
    // パーカーの ひも
    g.fillStyle = "#ffffff"
    for (const [x, y] of [[8, 17], [8, 18], [11, 17], [11, 18]]) g.fillRect(ox + x, oy + y, 1, 1)
  }
  drawArt(g, hair.front, pal, ox, oy)
  const acc = a.acc !== "none" ? findGear(a.acc) : null
  if (acc?.art) drawArt(g, acc.art, acc.colors, ox, oy)
}

function drawEyes(g, ox, oy, style, pal) {
  const dot = (x, y, c) => { g.fillStyle = c; g.fillRect(ox + x, oy + y, 1, 1) }
  // まず目の場所を はだ に もどしてから描く
  for (const x of [5, 6, 7, 12, 13, 14]) for (const y of [10, 11]) dot(x, y, pal.S)
  for (const cx of [6, 13]) {
    const m = cx === 6 ? 1 : -1 // 外がわ（左目は 左、右目は 右）
    if (style === "blink") {
      dot(cx, 11, pal.K)
      dot(cx + m * -1, 11, pal.K)
    } else if (style === "smile") {
      dot(cx, 10, pal.K)
      dot(cx - 1, 11, pal.K)
      dot(cx + 1, 11, pal.K)
    } else if (style === "big") {
      const x0 = cx === 6 ? 5 : 13
      for (const [x, y] of [[x0, 10], [x0 + 1, 10], [x0, 11], [x0 + 1, 11]]) dot(x, y, pal.K)
      dot(x0, 10, pal.w)
    } else if (style === "sharp") {
      dot(cx, 10, pal.K)
      dot(cx - m, 10, pal.K)
      dot(cx, 11, pal.K)
    } else {
      dot(cx, 10, pal.K)
      dot(cx, 11, pal.K)
    }
  }
}
