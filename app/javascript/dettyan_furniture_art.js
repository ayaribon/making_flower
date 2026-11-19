// 🛋️ Sprout の 家具 を へや（128×96 ドット）に 描く（家具の 表は dettyan_home.js の FURNITURE）
// - 素材は 買った もの（Sprout Lands・Sprout Sorry pack）。公開リポジトリには 入れない（S3 の game_assets/。GameAsset の キー）
// - おく場所は きまっている（PLACES。ゆかの ものは いれかえ できる）。かべ・ゆかに しく もの は うごかない 絵（createRoom の あとに 1回）、
//   ゆかに おく もの は Dettyan と 前後が 入れかわる ので、足もとの 高さ（base）の 順に 毎コマ 描く
// - 絵は 時間 t だけで きまる（ツリーの キラキラ・かぼちゃの ゆらぎ）
import { furnitureOpt, placeOf } from "dettyan_home"

// 素材の 中の 場所（x, y, w, h）
const WOOD_ROW = 32 // new Wooden Furniture.png は 木の 色 ごとに 32 ドット ずつ 下へ（さくら・しらかば・オーク・くるみ）
const WOOD = {
  dresser: [1, 16, 14, 16],
  chairR: [19, 17, 10, 13], // せもたれ が 左（右を むく）
  chairL: [35, 17, 10, 13],
  table: [81, 17, 14, 14],
  sofa: [115, 16, 25, 15],
  bed: [145, 9, 14, 22] // ふとんの 色 ごとに 16 ドット ずつ 右へ
}
const BASIC = {
  flower: [[51, 0, 11, 15], [68, 4, 8, 9], [84, 1, 7, 12]],
  picture: [[1, 6, 15, 7], [19, 6, 11, 7], [35, 5, 12, 8]],
  mat: [[52, 82, 24, 13], [84, 82, 24, 13], [116, 82, 24, 13]]
}
const CHEST_KEYS = ["chest_cherry", "chest_birch", "chest_oak", "chest_pine"]
const CHEST = [8, 18, 16, 14] // しまっている たからばこ
const TREE = { x: 5, y: 10, w: 39, h: 53, step: 48, frames: 8 }
const PUMPKIN = { y: 16, w: 16, h: 15, frames: 4 } // 2だんめ（はっぱ なし）。4コマ で ゆらゆら
const SNOWMAN = [128, 64, 16, 32]
const PRESENT = { x: 96, y: 96, w: 16, h: 16 }

// へやの どこに おくか（x：左はし、base：足もと＝絵の 下の はし。かべの もの は top）
//   ゆかに おく もの（FLOOR）は「おき場所」。ほかの 家具と いれかえ られる（s.home.place。dettyan_home.js の placeOf）
//   いれかえた ときは、おき場所の まんなかに 足もとを そろえて おく
export const PLACES = {
  picture: { right: 127, top: 12 },
  flower: { x: 24, base: 30 },  // まどべ
  mat: { x: 64, top: 77 },
  dresser: { x: 22, base: 47 }, // まどの 下
  table: { x: 60, base: 88 },   // いす・テーブル・いす
  bed: { x: 0, base: 92 },
  sofa: { x: 101, base: 91 },
  chest: { x: 112, base: 73 },
  pumpkin: { x: 40, base: 52 },
  snowman: { x: 48, base: 62 },
  xmas_tree: { x: -4, base: 70 }, // 左の すみ（かんようしょくぶつ・スピーカー の 前）
  present: { x: 22, base: 76 }
}

// ゆかに おく 家具の 大きさ（はば・たかさ）
const SIZE = {
  dresser: [14, 16], table: [33, 14], bed: [14, 22], sofa: [25, 15], chest: [16, 14],
  pumpkin: [16, 15], snowman: [16, 32], xmas_tree: [39, 53], present: [16, 16]
}

function blit(g, img, [sx, sy, w, h], dx, dy) {
  if (img) g.drawImage(img, sx, sy, w, h, Math.round(dx), Math.round(dy), w, h)
}

const woodRect = (rect, wood) => [rect[0], rect[1] + wood * WOOD_ROW, rect[2], rect[3]]

// いま どこに あるか（左上 x・y と はば・たかさ）。もようがえ で えらんだ 家具の しるし に つかう
export function furnitureBox(s, id) {
  if (SIZE[id]) {
    const slot = placeOf(s, id)
    const P = PLACES[slot]
    const [w, h] = SIZE[id]
    const x = Math.round(P.x + SIZE[slot][0] / 2 - w / 2)
    return { x, y: P.base - h, w, h }
  }
  if (id === "picture") return { x: PLACES.picture.right - 15, y: PLACES.picture.top, w: 15, h: 8 }
  if (id === "flower") return { x: PLACES.flower.x, y: PLACES.flower.base - 15, w: 11, h: 15 }
  if (id === "mat") return { x: PLACES.mat.x, y: PLACES.mat.top, w: 24, h: 13 }
  return null
}

// うごかない もの（かべ・ゆかに しく もの）。f：出して いる 家具 { id: true }、s：セーブ（色・がら）
export function drawFurnitureBack(g, sp, s, f) {
  if (!sp) return
  if (f.mat && sp.furniture) {
    const r = BASIC.mat[furnitureOpt(s, "mat", "mat")]
    blit(g, sp.furniture, r, PLACES.mat.x, PLACES.mat.top)
  }
  if (f.picture && sp.furniture) {
    const r = BASIC.picture[furnitureOpt(s, "picture", "picture")]
    blit(g, sp.furniture, r, PLACES.picture.right - r[2], PLACES.picture.top)
  }
}

// ゆかに おく 家具 を (x, base) に 描く
const FLOOR_DRAW = {
  dresser: (g, sp, s, x, base) => sp.furn_wood && blit(g, sp.furn_wood, woodRect(WOOD.dresser, furnitureOpt(s, "dresser", "wood")), x, base - 16),
  bed: (g, sp, s, x, base) => {
    if (!sp.furn_wood) return
    const cover = furnitureOpt(s, "bed", "cover")
    const r = woodRect([WOOD.bed[0] + cover * 16, WOOD.bed[1], WOOD.bed[2], WOOD.bed[3]], furnitureOpt(s, "bed", "wood"))
    blit(g, sp.furn_wood, r, x, base - r[3])
  },
  table: (g, sp, s, x, base) => {
    if (!sp.furn_wood) return
    const wood = furnitureOpt(s, "table", "wood")
    const cr = woodRect(WOOD.chairR, wood)
    const tb = woodRect(WOOD.table, wood)
    const cl = woodRect(WOOD.chairL, wood)
    blit(g, sp.furn_wood, cr, x, base - cr[3])
    blit(g, sp.furn_wood, cl, x + cr[2] + tb[2] - 1, base - cl[3])
    blit(g, sp.furn_wood, tb, x + cr[2] - 1, base - tb[3])
  },
  sofa: (g, sp, s, x, base) => sp.furn_wood && blit(g, sp.furn_wood, woodRect(WOOD.sofa, furnitureOpt(s, "sofa", "wood")), x, base - 15),
  chest: (g, sp, s, x, base) => {
    const img = sp[CHEST_KEYS[furnitureOpt(s, "chest", "chestWood")]] || sp.chest_oak
    blit(g, img, CHEST, x, base - CHEST[3])
  },
  pumpkin: (g, sp, s, x, base, t) => sp.deco_pumpkin && blit(g, sp.deco_pumpkin, [(Math.floor(t * 4) % PUMPKIN.frames) * 16, PUMPKIN.y, PUMPKIN.w, PUMPKIN.h], x, base - PUMPKIN.h),
  snowman: (g, sp, s, x, base) => sp.deco_winter && blit(g, sp.deco_winter, SNOWMAN, x, base - SNOWMAN[3]),
  xmas_tree: (g, sp, s, x, base, t) => sp.deco_tree && blit(g, sp.deco_tree, [TREE.x + (Math.floor(t * 5) % TREE.frames) * TREE.step, TREE.y, TREE.w, TREE.h], x, base - TREE.h),
  present: (g, sp, s, x, base) => sp.deco_winter && blit(g, sp.deco_winter, [PRESENT.x + furnitureOpt(s, "present", "present") * 16, PRESENT.y, PRESENT.w, PRESENT.h], x, base - PRESENT.h)
}

// ゆかに おく もの：[{ y: 足もと, draw }]（呼んだ 側が Dettyan と いっしょに y の 順に 描く）
export function furnitureLayers(g, sp, s, f, t) {
  const out = []
  if (!sp) return out
  // まどべの 花：まどの 外（空）は 毎コマ 描く ので、その あとに
  if (f.flower && sp.furniture) out.push({ y: PLACES.flower.base, draw: () => {
    const r = BASIC.flower[furnitureOpt(s, "flower", "flower")]
    blit(g, sp.furniture, r, PLACES.flower.x, PLACES.flower.base - r[3])
  } })
  for (const id of Object.keys(FLOOR_DRAW)) {
    if (!f[id]) continue
    const box = furnitureBox(s, id)
    out.push({ y: box.y + box.h, draw: () => FLOOR_DRAW[id](g, sp, s, box.x, box.y + box.h, t) })
  }
  return out
}

// ショップの 小さな 絵（いまの 色・がら で）。なければ null
//   over：ためしの 色・がら（{ wood: 2 } など。もようがえ の 色の ボタン）
export function furnitureIcon(sp, s, id, over = null) {
  if (!sp) return null
  const opt = (key) => over?.[key] ?? furnitureOpt(s, id, key)
  const pick = {
    bed: () => sp.furn_wood && [sp.furn_wood, woodRect([WOOD.bed[0] + opt("cover") * 16, WOOD.bed[1], WOOD.bed[2], WOOD.bed[3]], opt("wood"))],
    dresser: () => sp.furn_wood && [sp.furn_wood, woodRect(WOOD.dresser, opt("wood"))],
    table: () => sp.furn_wood && [sp.furn_wood, woodRect(WOOD.table, opt("wood"))],
    sofa: () => sp.furn_wood && [sp.furn_wood, woodRect(WOOD.sofa, opt("wood"))],
    chest: () => { const img = sp[CHEST_KEYS[opt("chestWood")]] || sp.chest_oak; return img && [img, CHEST] },
    flower: () => sp.furniture && [sp.furniture, BASIC.flower[opt("flower")]],
    picture: () => sp.furniture && [sp.furniture, BASIC.picture[opt("picture")]],
    mat: () => sp.furniture && [sp.furniture, BASIC.mat[opt("mat")]],
    pumpkin: () => sp.deco_pumpkin && [sp.deco_pumpkin, [0, PUMPKIN.y, PUMPKIN.w, PUMPKIN.h]],
    xmas_tree: () => sp.deco_tree && [sp.deco_tree, [TREE.x, TREE.y, TREE.w, TREE.h]],
    present: () => sp.deco_winter && [sp.deco_winter, [PRESENT.x + opt("present") * 16, PRESENT.y, PRESENT.w, PRESENT.h]],
    snowman: () => sp.deco_winter && [sp.deco_winter, SNOWMAN]
  }[id]?.()
  if (!pick) return null
  const [img, r] = pick
  const size = Math.max(r[2], r[3])
  const c = document.createElement("canvas")
  c.width = size
  c.height = size
  c.getContext("2d").drawImage(img, r[0], r[1], r[2], r[3], Math.floor((size - r[2]) / 2), Math.floor((size - r[3]) / 2), r[2], r[3])
  return c
}
