// 🏘️ はじまりのまち：Sprout Lands（Cup Nooble）の 素材で 描く 版。docs/town/requirements.md
// - 素材の画像（地面・草・木・花・柵・井戸・看板・ニワトリ）は 買ったもの。配布禁止なので リポジトリには ない
//   本番は S3、手元は private_assets/ から、ログインした人にだけ 出す（app/models/game_asset.rb）。URL は data 属性で わたす
//   画像が ない／読めないときは town_world.js の コードで描く 町に もどる
// - 建物・街灯・ベンチ は ここで コードで 描く（Sprout Lands の 色と 雰囲気に あわせた オリジナル。ライセンスで ゆるされている）
// - 町の 大きさ・建物の 場所・歩ける ところ は town_world.js と 同じ（town_controller.js は そのまま 使える）
// Assets - From: Sprout Lands - By: Cup Nooble（https://cupnooble.itch.io/sprout-lands-asset-pack）

import { TOWN_W, TOWN_H, GROUND, BUILDINGS, FOUNTAIN, drawSign } from "town_world"
import { AVATAR_EQUIP, avatarAssetKey } from "avatar_sprite"

// 使う 素材（キー → 素材パックの 中の 場所）。サーバー（GameAsset::SPROUT）と そろえる。URL は キーごとに サーバーが わたす
export const SPROUT_FILES = {
  grass: "Tilesets/ground tiles/New tiles/Grass_Tile_Layers.png",
  soil: "Tilesets/ground tiles/New tiles/Soil_Ground_Tiles.png",
  trees: "Objects/Trees, stumps and bushes.png",
  flowers: "Objects/Mushrooms, Flowers, Stones.png",
  fences: "Tilesets/Building parts/Fences.png",
  well: "Objects/Water well.png",
  signs: "Objects/signs.png",
  chicken: "Animals/Chicken/chicken default.png",
  chara: "Characters/Premium Charakter Spritesheet.png", // 🐱 Teemo 型の アバター（avatar_teemo.js。なくても よい）
  human: "../sprout_sorry/Tests/free_character_spritesheet_by-cupnooble.png" // 🧑 人の テンプレート（avatar_human.js。なくても よい）
}
// 💇 髪の パーツ（hair_<ファイル名>_back / _front。avatar_human.js の HAIR_PARTS）
export const HAIR_PART_STEMS = ["short_bob", "blunt_bob", "long_straight", "twin_tails", "ponytail", "braids", "wolf_cut"]
for (const stem of HAIR_PART_STEMS) for (const side of ["back", "front"]) SPROUT_FILES[`hair_${stem}_${side}`] = `../sprout_hair/${stem}_${side}.png`
// 💇 素体＋髪レイヤー（avatar_human.js の avatarLayersOf）
export const AVATAR_LAYER_KEYS = [
  "avatar_base", ...["original", "manbun", "wolf_long", "pattsun_bob", "pattsun_long", "short_perm", "fluffy_bob", "odango"].map((id) => `avatar_hair_${id}`),
  // 👕 装備の 枠（avatar_sprite.js の AVATAR_EQUIP）
  "avatar_body_base",
  ...Object.values(AVATAR_EQUIP).flatMap((s) => s.items.map((it) => avatarAssetKey(it.file)))
]
SPROUT_FILES.avatar_base = "../sprout_avatar/base_bald.png"
for (const k of AVATAR_LAYER_KEYS.slice(1)) SPROUT_FILES[k] = `../sprout_avatar/${k.replace("avatar_", "")}.png`
// なくても 町を 出せる もの
export const SPROUT_OPTIONAL = ["chara", "human", ...HAIR_PART_STEMS.flatMap((s) => [`hair_${s}_back`, `hair_${s}_front`]), ...AVATAR_LAYER_KEYS]

// 読みこんだ 画像から 髪の パーツを まとめる { ファイル名: { back, front } }
export function hairPartsOf(sheets) {
  const parts = {}
  for (const stem of HAIR_PART_STEMS) {
    const back = sheets[`hair_${stem}_back`]
    const front = sheets[`hair_${stem}_front`]
    if (back && front) parts[stem] = { back, front }
  }
  return parts
}

const T = 16

// 画像を ぜんぶ 読む。1つでも 読めなければ reject（町は コードで描く 版に もどる）
export function loadSprout(urls, timeoutMs = 6000) {
  const keys = Object.keys(SPROUT_FILES).filter((k) => !SPROUT_OPTIONAL.includes(k))
  if (!urls || keys.some((k) => !urls[k])) return Promise.reject(new Error("no sprout urls"))
  const extra = SPROUT_OPTIONAL.filter((k) => urls[k])
  const one = (k) => new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = "async"
    img.onload = () => resolve([k, img])
    img.onerror = () => reject(new Error(`load ${k}`))
    img.src = urls[k]
  })
  // なくても よい もの は、読めなければ 入れない
  const maybe = (k) => one(k).catch(() => null)
  const all = Promise.all([...keys.map(one), ...extra.map(maybe)]).then((pairs) => Object.fromEntries(pairs.filter(Boolean)))
  const timer = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs))
  return Promise.race([all, timer])
}

const px = (g, color, x, y, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), w, h) }
const tile = (g, img, col, row, x, y) => g.drawImage(img, col * T, row * T, T, T, x, y, T, T)
const part = (g, img, sx, sy, w, h, x, y) => g.drawImage(img, sx, sy, w, h, Math.round(x), Math.round(y), w, h)

function seeded(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---- 色（Sprout Lands の パレットに あわせる） ----
const C = {
  line: "#754c60", // ふち（黒ではなく こい 赤むらさき）
  wood: "#e8cfa6", woodLine: "#dcb98a", woodDark: "#c49a6c", woodShade: "#b68962", woodLight: "#f3e5c2",
  door: "#aa7959", doorDark: "#90625d", knob: "#f2cf8c",
  glass: "#cbe0de", glassLight: "#f3f4e7",
  stone: "#c1c8b9", stoneDark: "#9da89a",
  shadow: "rgba(117, 76, 96, 0.22)"
}
// 屋根の 色（こい → うすい）。建物ごとに ちがう 色
const ROOFS = {
  sing: ["#4c468b", "#5f699c", "#7180b1", "#8599c7", "#a9c3e0"],
  art: ["#8a4a70", "#a35b70", "#bd757e", "#d99a9a", "#efc6bc"],
  dettyan: ["#a16159", "#ba7c54", "#d79e61", "#eeba77", "#f6d79c"],
  clip: ["#4a588e", "#658ca1", "#7ba6b4", "#8cbfc2", "#c2e8d4"]
}
// 建物の 外がわ（town_world.js の BUILDINGS の x から）
const HW = 40
const houseX = (b) => b.x - 3
const ROOF_TOP = 14
const ROOF_BOTTOM = 37
// 街灯（井戸と かさならない ところ）。夜の あかりも ここ
export const SPROUT_LAMPS = [50, 98, 158, 204]
// 夜に あかりが つく まど（drawTownNight に わたす）
export function sproutWindows() {
  return BUILDINGS.flatMap((b) => [[houseX(b) + 5, 43, 6, 5], [houseX(b) + 29, 43, 6, 5]])
}

// ---- 町の 下絵（1回だけ 描いて 使い回す） ----
export function drawSproutBase(g, s) {
  const rand = seeded(2026)
  g.imageSmoothingEnabled = false
  // つち（ひろば）
  for (let y = 0; y < TOWN_H; y += T) {
    for (let x = 0; x < TOWN_W; x += T) {
      const r = rand()
      tile(g, s.soil, r < 0.7 ? 0 : Math.floor(rand() * 5), r < 0.85 ? 5 : 6, x, y)
    }
  }
  // おくの くさはら（建物が 立つ ところ。下の はしは ふんわり）
  for (let y = 0; y < 48; y += T) {
    for (let x = 0; x < TOWN_W; x += T) {
      const r = rand()
      if (r < 0.8) tile(g, s.grass, 1, 1, x, y)
      else tile(g, s.grass, Math.floor(rand() * 6), 5 + Math.floor(rand() * 2), x, y)
    }
  }
  for (let x = 0; x < TOWN_W; x += T) tile(g, s.grass, 1, 2, x, 48)
  // 手前の くさはら
  for (let x = 0; x < TOWN_W; x += T) tile(g, s.grass, 1, 0, x, TOWN_H - T)

  // おくの 木と しげみ（建物より うしろ）
  const bush = (x, y, kind = 0) => part(g, s.trees, kind * T, 48, T, T, x, y)
  for (let x = -6; x < TOWN_W; x += 14) bush(x, -6 + Math.floor(rand() * 3), rand() < 0.75 ? 0 : 1 + Math.floor(rand() * 3))
  const roundTree = (x, y) => part(g, s.trees, 16, 0, 32, 32, x, y)
  const thinTree = (x, y) => part(g, s.trees, 0, 0, 16, 32, x, y)
  const bigTree = (x, y) => part(g, s.trees, 144, 48, 48, 48, x, y)
  bigTree(-22, 6)
  bigTree(232, 4)
  thinTree(44, 22)
  thinTree(196, 22)
  roundTree(98, 2)
  roundTree(128, -2)
  part(g, s.trees, 48, 0, 32, 32, 146, 10) // りんごの 木

  // 建物
  for (const b of BUILDINGS) drawHouse(g, b)

  // まんなかの おく：けいじばん（看板 2まい）
  part(g, s.signs, 0, 0, T, T, 112, 44)
  part(g, s.signs, 0, 0, T, T, 128, 44)
  px(g, "#f3f4e7", 115, 46, 6, 4)
  px(g, "#e8b5ac", 131, 46, 6, 3)
  px(g, "#cbe0de", 131, 50, 6, 2)
  for (const [lx, ly, lw] of [[116, 47, 4], [116, 49, 3]]) px(g, "#b2a486", lx, ly, lw, 1)
  px(g, "#d99a9a", 117, 45, 2, 1)
  px(g, "#7ba6b4", 133, 45, 2, 1)

  // 建物の 前の 花
  for (const b of BUILDINGS) {
    const hx = houseX(b)
    flower(g, s, hx - 6, 50, rand)
    flower(g, s, hx + HW - 10, 50, rand)
  }

  // 井戸（ひろばの まんなか。ふんすいの かわり）
  const f = FOUNTAIN
  g.fillStyle = C.shadow
  g.fillRect(f.x - 15, f.y + 2, 30, 3)
  part(g, s.well, 0, 0, 32, 32, f.x - 16, f.y - 26)

  // 手前：柵・花・しげみ
  const fence = (x, y, kind) => part(g, s.fences, kind * T, 48, T, T, x, y)
  for (const [x0, n] of [[0, 3], [208, 3]]) {
    for (let i = 0; i < n; i++) fence(x0 + i * T, TOWN_H - 18, i === 0 ? 1 : i === n - 1 ? 3 : 2)
  }
  for (const fx of [62, 90, 150, 178]) flower(g, s, fx, TOWN_H - 14, rand)
  for (const fx of [70, 158]) flower(g, s, fx, TOWN_H - 12, rand)
  bush(112, TOWN_H - 15, 0)
  bush(128, TOWN_H - 14, 2)

  // ベンチ と 街灯（オリジナル）
  for (const bx of [92, 152]) drawBench(g, bx, 95)
  for (const lx of SPROUT_LAMPS) drawLamp(g, lx, 64)
}

// ---- 町の 上と 下の 森（画面いっぱい で たて長の とき・ひいて 見たとき に 見える） ----
// g は 町の 座標（y が 0 より 上 と TOWN_H より 下 に margin ドットずつ）。町の 中には 描かない
export function drawSproutForest(g, s, margin) {
  const rand = seeded(1119)
  g.imageSmoothingEnabled = false
  g.save()
  g.beginPath()
  g.rect(0, -margin, TOWN_W, margin)
  g.rect(0, TOWN_H, TOWN_W, margin)
  g.clip()
  // くさ
  const rows = []
  for (let y = -T; y > -margin - T; y -= T) rows.push(y)
  for (let y = TOWN_H; y < TOWN_H + margin; y += T) rows.push(y)
  for (const y of rows) {
    for (let x = 0; x < TOWN_W; x += T) {
      const r = rand()
      if (r < 0.85) tile(g, s.grass, 1, 1, x, y)
      else tile(g, s.grass, Math.floor(rand() * 6), 5 + Math.floor(rand() * 2), x, y)
    }
  }
  const roundTree = (x, y) => part(g, s.trees, 16, 0, 32, 32, x, y)
  const appleTree = (x, y) => part(g, s.trees, 48, 0, 32, 32, x, y)
  const thinTree = (x, y) => part(g, s.trees, 0, 0, 16, 32, x, y)
  const bigTree = (x, y) => part(g, s.trees, 144, 48, 48, 48, x, y)
  const bush = (x, y, kind = 0) => part(g, s.trees, kind * T, 48, T, T, x, y)
  const tree = (x, y) => {
    const r = rand()
    if (r < 0.2) bigTree(x - 8, y - 16)
    else if (r < 0.3) appleTree(x, y)
    else if (r < 0.45) { thinTree(x, y); thinTree(x + 14, y + 2) }
    else roundTree(x, y)
  }
  // 上：おく から 手前（町に ちかい ほう）へ。木の 根もとが 町の 上の はし（y=0）まで
  for (let y = -margin - 24; y <= -30; y += 18) {
    const shift = Math.floor(rand() * 20) - 10
    for (let x = -20 + shift; x < TOWN_W; x += 24 + Math.floor(rand() * 6)) tree(x, y + Math.floor(rand() * 5))
  }
  for (let x = -4; x < TOWN_W; x += 13) bush(x, -14 + Math.floor(rand() * 3), rand() < 0.7 ? 0 : 1 + Math.floor(rand() * 3))
  // 下：町に ちかい ほうは しげみ と 花、その 先は 森
  for (let x = -4; x < TOWN_W; x += 12) {
    if (rand() < 0.55) bush(x, TOWN_H + 2 + Math.floor(rand() * 4), rand() < 0.7 ? 0 : 1 + Math.floor(rand() * 3))
    else flower(g, s, x, TOWN_H + 4 + Math.floor(rand() * 4), rand)
  }
  for (let y = TOWN_H + 14; y < TOWN_H + margin; y += 18) {
    const shift = Math.floor(rand() * 20) - 10
    for (let x = -20 + shift; x < TOWN_W; x += 24 + Math.floor(rand() * 6)) tree(x, y + Math.floor(rand() * 5))
  }
  g.restore()
}

// 花（Mushrooms, Flowers, Stones の 4〜5だん目から えらぶ）
function flower(g, s, x, y, rand) {
  const col = Math.floor(rand() * 11)
  const row = rand() < 0.5 ? 3 : 4
  part(g, s.flowers, col * T, row * T, T, T, Math.round(x), Math.round(y))
}

// ---- 建物（オリジナル。Sprout Lands の 木の家の 色に あわせた） ----
function drawHouse(g, b) {
  const x0 = houseX(b)
  const roof = ROOFS[b.id] || ROOFS.dettyan
  const wallTop = ROOF_BOTTOM - 1
  const wallBottom = GROUND - 1
  // かべ
  px(g, C.line, x0, wallTop, HW, wallBottom - wallTop + 1)
  px(g, C.wood, x0 + 1, wallTop, HW - 2, wallBottom - wallTop)
  for (let y = wallTop + 3; y < wallBottom - 3; y += 4) px(g, C.woodLine, x0 + 1, y, HW - 2, 1)
  for (const cx of [x0 + 1, x0 + HW - 4]) {
    px(g, C.woodDark, cx, wallTop, 3, wallBottom - wallTop)
    px(g, C.woodLight, cx, wallTop, 1, wallBottom - wallTop)
  }
  // 土台の いし
  px(g, C.line, x0, wallBottom - 3, HW, 4)
  px(g, C.stone, x0 + 1, wallBottom - 2, HW - 2, 2)
  for (let x = x0 + 2; x < x0 + HW - 2; x += 5) px(g, C.stoneDark, x, wallBottom - 2, 1, 2)
  // まど（2つ）と 花の はこ
  for (const wx of [x0 + 4, x0 + 28]) {
    px(g, C.line, wx, 42, 8, 7)
    px(g, C.glass, wx + 1, 43, 6, 5)
    px(g, C.glassLight, wx + 1, 43, 2, 2)
    px(g, C.woodShade, wx + 1, 45, 6, 1)
    px(g, C.woodShade, wx + 3, 43, 1, 5)
    px(g, C.line, wx - 1, 49, 10, 3)
    px(g, C.door, wx, 49, 8, 2)
    for (let i = 0; i < 4; i++) px(g, ["#e8b5ac", "#f2cf8c", "#d99a9a", "#c2e09a"][i], wx + 1 + i * 2, 48, 1, 1)
  }
  // とびら（入口：doorOf と 同じ ところ）
  const dx = b.x + 12
  px(g, C.line, dx - 1, 46, 12, wallBottom - 3 - 46 + 1)
  px(g, C.door, dx, 47, 10, wallBottom - 3 - 47)
  px(g, C.doorDark, dx + 4, 47, 1, wallBottom - 3 - 47)
  px(g, C.woodShade, dx + 1, 48, 3, 3)
  px(g, C.woodShade, dx + 6, 48, 3, 3)
  px(g, C.knob, dx + 7, 53, 1, 1)
  // かんばん（建物の しるし）
  px(g, C.line, b.x + 12, 37, 11, 9)
  px(g, C.woodLight, b.x + 13, 38, 9, 7)
  drawSign(g, b.sign, b.x + 13, 38, C.line)
  // やね の かげ
  px(g, C.shadow, x0 + 1, wallTop + 1, HW - 2, 2)
  drawRoof(g, x0 - 2, ROOF_TOP, HW + 4, ROOF_BOTTOM - ROOF_TOP, roof, b.id === "dettyan")
}

// やね：うろこの ように かさなる 板。てっぺんに むね、手前に はふ板
function drawRoof(g, x, y, w, h, ramp, chimney) {
  const [dark, mid, base, light, hi] = ramp
  if (chimney) {
    px(g, C.line, x + w - 13, y - 6, 7, 8)
    px(g, "#c1c8b9", x + w - 12, y - 5, 5, 7)
    px(g, "#9da89a", x + w - 12, y - 3, 5, 1)
  }
  px(g, C.line, x, y, w, h)
  px(g, base, x + 1, y + 1, w - 2, h - 2)
  // うろこ
  for (let row = 0, yy = y + 4; yy < y + h - 4; row++, yy += 4) {
    px(g, mid, x + 1, yy + 3, w - 2, 1)
    for (let xx = x + 1 + (row % 2) * 2; xx < x + w - 2; xx += 4) {
      px(g, dark, xx, yy + 3, 1, 1)
      px(g, light, xx + 1, yy, 2, 1)
    }
  }
  // むね（てっぺん）
  px(g, mid, x + 1, y + 1, w - 2, 3)
  px(g, hi, x + 2, y + 1, w - 4, 1)
  // はふ板（手前の ふち）
  px(g, C.line, x, y + h - 4, w, 4)
  px(g, C.woodDark, x + 1, y + h - 3, w - 2, 2)
  px(g, C.woodLight, x + 1, y + h - 3, w - 2, 1)
}

function drawBench(g, x, y) {
  px(g, C.shadow, x, y + 6, 14, 2)
  px(g, C.line, x - 1, y - 1, 16, 5)
  px(g, C.woodDark, x, y, 14, 3)
  px(g, C.woodLight, x, y, 14, 1)
  px(g, C.line, x + 1, y + 4, 2, 3)
  px(g, C.line, x + 11, y + 4, 2, 3)
}

function drawLamp(g, x, y) {
  px(g, C.shadow, x - 2, y + 27, 7, 2)
  px(g, C.line, x - 1, y + 4, 4, 24)
  px(g, C.woodDark, x, y + 4, 2, 23)
  px(g, C.woodLight, x, y + 4, 1, 23)
  px(g, C.line, x - 3, y - 2, 8, 7)
  px(g, "#f6d79c", x - 2, y - 1, 6, 5)
  px(g, "#fff6d8", x - 1, y, 2, 2)
  px(g, C.line, x - 4, y - 3, 10, 1)
}

// ---- 動くもの：ニワトリ（時間 t だけで きまる） ----
const CHICKENS = [
  { x: 30, y: 84, range: 16, speed: 0.35, phase: 0 },
  { x: 214, y: 80, range: 12, speed: 0.28, phase: 2 },
  { x: 176, y: 100, range: 10, speed: 0.4, phase: 4 }
]

export function drawSproutLive(g, t, s) {
  for (const c of CHICKENS) {
    const p = Math.sin(t * c.speed + c.phase)
    const v = Math.cos(t * c.speed + c.phase)
    const walking = Math.abs(v) > 0.25
    const x = c.x + p * c.range
    const frame = walking ? Math.floor(t * 8) % 8 : Math.floor(t * 3) % 4
    const row = walking ? 2 : 0
    g.save()
    if (v < 0) {
      g.translate(Math.round(x) + 8, 0)
      g.scale(-1, 1)
      g.drawImage(s.chicken, frame * T, row * T, T, T, -8, Math.round(c.y) - 14, T, T)
    } else {
      g.drawImage(s.chicken, frame * T, row * T, T, T, Math.round(x) - 8, Math.round(c.y) - 14, T, T)
    }
    g.restore()
  }
}
