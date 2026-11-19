// 🛋️ Sprout の 家具 を へや（128×96 ドット）に 描く（家具の 表は dettyan_home.js の FURNITURE）
// - 素材は 買った もの（Sprout Lands・Sprout Sorry pack）。公開リポジトリには 入れない（S3 の game_assets/。GameAsset の キー）
// - おく場所は きまっている（PLACES）。かべ・ゆかに しく もの は うごかない 絵（createRoom の あとに 1回）、
//   ゆかに おく もの は Dettyan と 前後が 入れかわる ので、足もとの 高さ（base）の 順に 毎コマ 描く
// - 絵は 時間 t だけで きまる（ツリーの キラキラ・かぼちゃの ゆらぎ）
import { furnitureOpt } from "dettyan_home"

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
export const PLACES = {
  picture: { right: 127, top: 12 },
  flower: { x: 24, base: 30 },  // まどべ
  dresser: { x: 22, base: 47 }, // まどの 下
  mat: { x: 64, top: 77 },
  table: { x: 60, base: 88 },   // いす・テーブル・いす
  bed: { x: 0, base: 92 },
  sofa: { x: 101, base: 91 },
  chest: { x: 112, base: 73 },
  pumpkin: { x: 40, base: 52 },
  snowman: { x: 48, base: 62 },
  xmas_tree: { x: -4, base: 70 }, // 左の すみ（かんようしょくぶつ・スピーカー の 前）
  present: { x: 22, base: 76 }
}

function blit(g, img, [sx, sy, w, h], dx, dy) {
  if (img) g.drawImage(img, sx, sy, w, h, Math.round(dx), Math.round(dy), w, h)
}

const woodRect = (rect, wood) => [rect[0], rect[1] + wood * WOOD_ROW, rect[2], rect[3]]

// うごかない もの（かべ・まどべ・ゆかに しく もの）。f：出して いる 家具 { id: true }、home：セーブの s（色・がら）
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
  if (f.dresser && sp.furn_wood) {
    const r = woodRect(WOOD.dresser, furnitureOpt(s, "dresser", "wood"))
    blit(g, sp.furn_wood, r, PLACES.dresser.x, PLACES.dresser.base - r[3])
  }
}

// ゆかに おく もの：[{ y: 足もと, draw }]（呼んだ 側が Dettyan と いっしょに y の 順に 描く）
export function furnitureLayers(g, sp, s, f, t) {
  const out = []
  if (!sp) return out
  const at = (id, draw) => out.push({ y: PLACES[id].base, draw })
  // まどべの 花：まどの 外（空）は 毎コマ 描く ので、その あとに
  if (f.flower && sp.furniture) at("flower", () => {
    const r = BASIC.flower[furnitureOpt(s, "flower", "flower")]
    blit(g, sp.furniture, r, PLACES.flower.x, PLACES.flower.base - r[3])
  })
  if (f.bed && sp.furn_wood) at("bed", () => {
    const wood = furnitureOpt(s, "bed", "wood")
    const cover = furnitureOpt(s, "bed", "cover")
    const r = woodRect([WOOD.bed[0] + cover * 16, WOOD.bed[1], WOOD.bed[2], WOOD.bed[3]], wood)
    blit(g, sp.furn_wood, r, PLACES.bed.x, PLACES.bed.base - r[3])
  })
  if (f.table && sp.furn_wood) at("table", () => {
    const wood = furnitureOpt(s, "table", "wood")
    const { x, base } = PLACES.table
    const cr = woodRect(WOOD.chairR, wood)
    const tb = woodRect(WOOD.table, wood)
    const cl = woodRect(WOOD.chairL, wood)
    blit(g, sp.furn_wood, cr, x, base - cr[3])
    blit(g, sp.furn_wood, cl, x + cr[2] + tb[2] - 1, base - cl[3])
    blit(g, sp.furn_wood, tb, x + cr[2] - 1, base - tb[3])
  })
  if (f.sofa && sp.furn_wood) at("sofa", () => {
    const r = woodRect(WOOD.sofa, furnitureOpt(s, "sofa", "wood"))
    blit(g, sp.furn_wood, r, PLACES.sofa.x, PLACES.sofa.base - r[3])
  })
  if (f.chest) {
    const img = sp[CHEST_KEYS[furnitureOpt(s, "chest", "chestWood")]] || sp.chest_oak
    if (img) at("chest", () => blit(g, img, CHEST, PLACES.chest.x, PLACES.chest.base - CHEST[3]))
  }
  if (f.pumpkin && sp.deco_pumpkin) at("pumpkin", () => {
    const k = Math.floor(t * 4) % PUMPKIN.frames
    blit(g, sp.deco_pumpkin, [k * 16, PUMPKIN.y, PUMPKIN.w, PUMPKIN.h], PLACES.pumpkin.x, PLACES.pumpkin.base - PUMPKIN.h)
  })
  if (f.snowman && sp.deco_winter) at("snowman", () => blit(g, sp.deco_winter, SNOWMAN, PLACES.snowman.x, PLACES.snowman.base - SNOWMAN[3]))
  if (f.xmas_tree && sp.deco_tree) at("xmas_tree", () => {
    const k = Math.floor(t * 5) % TREE.frames
    blit(g, sp.deco_tree, [TREE.x + k * TREE.step, TREE.y, TREE.w, TREE.h], PLACES.xmas_tree.x, PLACES.xmas_tree.base - TREE.h)
  })
  if (f.present && sp.deco_winter) at("present", () => {
    const v = furnitureOpt(s, "present", "present")
    blit(g, sp.deco_winter, [PRESENT.x + v * 16, PRESENT.y, PRESENT.w, PRESENT.h], PLACES.present.x, PLACES.present.base - PRESENT.h)
  })
  return out
}

// ショップの 小さな 絵（いまの 色・がら で）。なければ null
export function furnitureIcon(sp, s, id) {
  if (!sp) return null
  const opt = (key) => furnitureOpt(s, id, key)
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
