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
  { id: "bob", name: "ボブ" },
  { id: "long", name: "ロング" },
  { id: "twin", name: "ツインテール" },
  { id: "pony", name: "ポニーテール" },
  // 💇 人の アバター（髪の パーツ）で ふえた 髪型。2頭身の 絵では ショートと 同じ
  { id: "blunt", name: "ぱっつんボブ" },
  { id: "braid", name: "みつあみ" },
  { id: "wolf", name: "ウルフカット" }
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
  v: 1, hs: "original", skin: 0, hair: "short", hairColor: 0, eyes: "dot",
  top: "jacket", topColor: 6, bottom: "pants", bottomColor: 9, shoes: 9, acc: "none",
  costume: "default", hat: "none", accessory: "none",
  eye_style: "default", brows: "none", mouth: "none", cheeks: "none", beard: "none"
}

const idsOf = (list) => list.map((x) => x.id)
// 💇 人の アバターの 髪型（素体＋髪レイヤー。docs/town/requirements.md の「髪型レイヤー」）。データの キーは hs
// id は 保存されるので あとから 変えない。file が null は 髪なし
export const HUMAN_HAIRSTYLES = [
  { id: "original", name: "ツンツン", file: "hair_original.png" },
  { id: "manbun", name: "マンバン", file: "hair_manbun.png", showsBrows: true },
  { id: "wolf_long", name: "ウルフロング", file: "hair_wolf_long.png" },
  { id: "pattsun_bob", name: "ぱっつんボブ", file: "hair_pattsun_bob.png" },
  { id: "pattsun_long", name: "ぱっつんロング", file: "hair_pattsun_long.png" },
  { id: "short_perm", name: "短髪パーマ", file: "hair_short_perm.png", showsBrows: true },
  { id: "fluffy_bob", name: "ふわふわボブ", file: "hair_fluffy_bob.png" },
  { id: "odango", name: "おだんご", file: "hair_odango.png" },
  { id: "bald", name: "ハゲ", file: null, showsBrows: true }
]
export const DEFAULT_HAIRSTYLE = "original"

// 👕 装備の 枠（2026-11-19 の ハンドオフ layers/avatar_catalog.json）。画像は S3 の game_assets/sprout_avatar/
//   アイテムを 足す ときは 画像1まい（128×96。素体と 同じ 並び）を 置いて、ここに 1行（app/models/game_asset.rb にも ファイル名）
//   maker：町の キャラメイクで えらべる もの（ほかは Dettyan 育成ゲームの そうび。id は dettyan_gear.js の GEAR と 同じ）
//   hides：これを つけると 描かない 枠（ヘルメットで 髪・きぐるみで 髪と あたま）
//   いろが かわるのは ふだん着（costume default）と ふつうの靴（shoes default）だけ（ほかは 色が きまった 画像）
//   足・手（盾）の 枠は まだ 中身が ない
// 町の キャラの 保存の キー（枠 → キー。"none" は なし）。のこりの 枠は Dettyan の そうび から（look.equip）
//   目は 前から ある eyes（2頭身の 目）と かぶるので eye_style
export const AVATAR_SAVE_KEYS = { costume: "costume", hat: "hat", accessory: "accessory", eyes: "eye_style", brows: "brows", mouth: "mouth", cheeks: "cheeks", beard: "beard" }
export const AVATAR_SAVE_SLOTS = Object.keys(AVATAR_SAVE_KEYS)
// 😊 顔の パーツ（2026-11-19 の ハンドオフ。体の すぐ上・髪より下に 重ねる）。recolor：base＝はだ・目の 色、hair＝髪の 色
//   まゆげは 前髪で かくれる 髪型が ある（HUMAN_HAIRSTYLES の showsBrows が ない 髪型では えらべない）
export const AVATAR_FACE_SLOTS = ["eyes", "brows", "mouth", "cheeks", "beard"]
export const AVATAR_EQUIP = {
  eyes: {
    name: "め", def: "default", recolor: "base",
    items: [
      { id: "default", name: "ふつう", file: null, maker: true },
      { id: "smile", name: "にっこり", file: "eyes_smile.png", maker: true },
      { id: "sleepy", name: "ねむそう", file: "eyes_sleepy.png", maker: true },
      { id: "lash", name: "まつげ", file: "eyes_lash.png", maker: true }
    ]
  },
  brows: { name: "まゆげ", def: "none", recolor: "base", items: [{ id: "normal", name: "まゆげ", file: "brows_normal.png", maker: true }] },
  mouth: { name: "くち", def: "none", items: [{ id: "small", name: "ちいさい くち", file: "mouth_small.png", maker: true }] },
  cheeks: { name: "ほっぺ", def: "none", items: [{ id: "pink", name: "ピンク", file: "cheeks_pink.png", maker: true }] },
  beard: { name: "ひげ", def: "none", recolor: "hair", items: [{ id: "chin", name: "あごひげ", file: "beard_chin.png", maker: true }] },
  costume: {
    name: "いしょう", def: "default",
    items: [
      { id: "default", name: "ふだん着", file: "costume_default.png", maker: true },
      { id: "longsleeve", name: "長そでシャツ", file: "costume_longsleeve.png", maker: true },
      { id: "border", name: "ボーダー", file: "costume_border.png", maker: true },
      { id: "overalls", name: "オーバーオール", file: "costume_overalls.png", maker: true },
      { id: "dress", name: "ワンピース", file: "costume_dress.png", maker: true },
      { id: "robe", name: "ローブ", file: "costume_robe.png", maker: true },
      { id: "dettyan", name: "Dettyan の いつもの服", file: "costume_dettyan.png" },
      { id: "jersey", name: "ジャージ", file: "costume_jersey.png" },
      { id: "suit", name: "スーツ", file: "costume_suit.png" },
      { id: "stage", name: "ステージいしょう", file: "costume_stage.png" },
      { id: "kira", name: "キラキラいしょう", file: "costume_kira.png" },
      { id: "parka", name: "ゆめかわパーカー", file: "costume_parka.png" },
      { id: "sailor", name: "セーラーふく", file: "costume_sailor.png" },
      { id: "kuma", name: "くまの きぐるみ", file: "costume_kuma.png", hides: ["hair", "hat"] },
      { id: "yukata", name: "ゆかた", file: "costume_yukata.png" },
      { id: "ouji", name: "おうじさまの ふく", file: "costume_ouji.png" }
    ]
  },
  hat: {
    name: "あたま", def: "none",
    items: [
      { id: "ribbon", name: "リボン", file: "hat_ribbon.png", maker: true }, // Dettyan の「おおきなリボン」も この 絵
      { id: "beanie", name: "ニット帽", file: "hat_beanie.png", maker: true },
      { id: "straw", name: "むぎわら帽子", file: "hat_straw.png", maker: true },
      { id: "wizard", name: "とんがり帽子", file: "hat_wizard.png", maker: true },
      { id: "cap", name: "キャップ", file: "hat_cap.png" },
      { id: "headphones", name: "ヘッドホン", file: "hat_headphones.png" },
      { id: "helmet", name: "ライトつきヘルメット", file: "hat_helmet.png", hides: ["hair"] },
      { id: "crown", name: "おうかん", file: "hat_crown.png" },
      { id: "nekomimi", name: "ねこみみ", file: "hat_nekomimi.png" },
      { id: "usamimi", name: "うさみみ", file: "hat_usamimi.png" },
      { id: "hanakanmuri", name: "はなかんむり", file: "hat_hanakanmuri.png" }
    ]
  },
  accessory: {
    name: "アクセサリー", def: "none",
    items: [{ id: "glasses", name: "まるめがね", file: "accessory_glasses.png", maker: true }]
  },
  shoes: {
    name: "くつ", def: "default",
    items: [
      { id: "default", name: "ふつうの くつ", file: "shoes_default.png" },
      { id: "sneakers", name: "スニーカー", file: "shoes_sneakers.png" },
      { id: "loafers", name: "かわぐつ", file: "shoes_loafers.png" },
      { id: "boots", name: "ブーツ", file: "shoes_boots.png" },
      { id: "kirashoes", name: "キラキラくつ", file: "shoes_kirashoes.png" },
      { id: "geta", name: "げた", file: "shoes_geta.png" },
      { id: "usaslipper", name: "うさぎスリッパ", file: "shoes_usaslipper.png" },
      { id: "yumeboots", name: "ゆめかわブーツ", file: "shoes_yumeboots.png" }
    ]
  },
  hand_main: {
    name: "て", def: "none",
    items: [
      { id: "stick", name: "木のぼう", file: "hand_main_stick.png" },
      { id: "harisen", name: "ハリセン", file: "hand_main_harisen.png" },
      { id: "mic", name: "マイク", file: "hand_main_mic.png" },
      { id: "goldmic", name: "金のマイク", file: "hand_main_goldmic.png" },
      { id: "penlight", name: "ペンライト", file: "hand_main_penlight.png" },
      { id: "uchiwa", name: "ハートのうちわ", file: "hand_main_uchiwa.png" },
      { id: "magicwand", name: "まほうのステッキ", file: "hand_main_magicwand.png" }
    ]
  },
  back: {
    name: "せなか", def: "none",
    items: [
      { id: "backpack", name: "リュック", file: "back_backpack.png" },
      { id: "cape", name: "マント", file: "back_cape.png" },
      { id: "guitar", name: "ギター", file: "back_guitar.png" },
      { id: "wings", name: "てんしのはね", file: "back_wings.png" },
      { id: "kumapack", name: "くまリュック", file: "back_kumapack.png" },
      { id: "chouchou", name: "ちょうちょのはね", file: "back_chouchou.png" },
      { id: "shippo", name: "ねこのしっぽ", file: "back_shippo.png" }
    ]
  }
}
// 重ねる じゅん（うしろ向きの 3方向は せなか・手 の 前後が 入れかわる）。legs・hand_*・back は まだ 画像が ない
export const AVATAR_DRAW_ORDER = {
  default: ["back", "body", "cheeks", "mouth", "beard", "eyes", "brows", "legs", "shoes", "costume", "hair", "accessory", "hat", "hand_off", "hand_main"],
  facingAway: ["hand_main", "hand_off", "body", "cheeks", "mouth", "beard", "eyes", "brows", "legs", "shoes", "costume", "hair", "accessory", "hat", "back"]
}
// 画像の キー（town_sprout.js・GameAsset）："avatar_" ＋ ファイル名（.png なし）
export const avatarAssetKey = (file) => `avatar_${file.replace(/\.png$/, "")}`

const CHOICES = {
  hair: idsOf(HAIRS), eyes: idsOf(EYES), top: idsOf(TOPS), bottom: idsOf(BOTTOMS), acc: ACCESSORIES, hs: idsOf(HUMAN_HAIRSTYLES),
  ...Object.fromEntries(AVATAR_SAVE_SLOTS.map((slot) => {
    const s = AVATAR_EQUIP[slot]
    return [AVATAR_SAVE_KEYS[slot], [...(s.def === "none" ? ["none"] : []), ...idsOf(s.items.filter((it) => it.maker))]]
  }))
}
const RANGES = { skin: SKINS.length, hairColor: HAIR_COLORS.length, topColor: CLOTH_COLORS.length, bottomColor: CLOTH_COLORS.length, shoes: CLOTH_COLORS.length }

// 💬 ひとこと（まちで みんなに 見える ことば）。20文字まで。サーバーの User.clean_avatar と 同じ きまり
export const MSG_MAX = 20

export function cleanMsg(text) {
  if (typeof text !== "string") return ""
  const flat = text.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, " ").replace(/\s+/g, " ").trim()
  return Array.from(flat).slice(0, MSG_MAX).join("")
}

// どんな データでも、いつも 使える形に そろえる（知らない値は 初めの値）
export function normalizeAvatar(raw) {
  const a = { ...DEFAULT_AVATAR }
  if (!raw || typeof raw !== "object") return a
  for (const [k, n] of Object.entries(RANGES)) {
    const v = Number(raw[k])
    if (Number.isInteger(v) && v >= 0 && v < n) a[k] = v
  }
  for (const [k, list] of Object.entries(CHOICES)) if (list.includes(raw[k])) a[k] = raw[k]
  const msg = cleanMsg(raw.msg)
  if (msg) a.msg = msg
  return a
}

// まだ キャラを つくっていない人：名前から きまる おまかせ（ひらくたびに かわらない）
export function avatarFromName(name) {
  let h = 2166136261
  for (const ch of String(name || "")) h = Math.imul(h ^ ch.codePointAt(0), 16777619)
  let s = h >>> 0
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return randomAvatar(rand)
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

// アバターを描く。opts：{ frame：0|1（歩く）, blink：まばたき, mood："smile"（にっこり目に する）, line：ふちと 目の 色（Sprout Lands の 町では やわらかい 色） }
export function drawAvatar(g, ox, oy, raw, { frame = 0, blink = false, mood = null, line = null } = {}) {
  const a = normalizeAvatar(raw)
  const pal = avatarPalette(a)
  if (line) {
    pal.K = line
    pal.E = line
  }
  const hair = HAIR_ART[a.hair] || HAIR_ART.short
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
