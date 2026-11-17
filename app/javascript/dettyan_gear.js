// 🗡️ そうび（モンスター退治でときどき落ちる。そうびすると強くなり、見た目も変わる）
// 体のパーツごとに1つずつ：あたま・からだ・て・せなか・あし（SLOTS）
// 増やすときは GEAR に1つ足して、落ちる行き先（dettyan_adventure.js の PLACES の gear）に id を書く
//
//   id     セーブに入る名前（あとから変えない）
//   slot   SLOTS の id。"head" | "outfit" | "weapon" | "back" | "feet"
//          ※ "weapon"（て）と "outfit"（からだ）は、前からあるセーブの名前なので変えない
//   atk    こうげきが上がる量
//   hp     たいりょく（バトルの体力）が上がる量
//   colors 絵の色（文字 → 色）。K は書かなければ ふちの色
//   絵：
//     て      ：hand（手に持つ絵）
//     からだ  ：colors だけ（Dettyan の色のうち J：ジャケット・j：えり・W：シャツ・P：ズボン を入れかえる）
//     あし    ：colors だけ（F：くつ・f：くつの ひかり。Q を書くと ひざから下も その色＝ブーツ）
//     あたま  ：art（Dettyan の絵の上に重ねる）。backArt があれば うしろすがた のときに使う
//     せなか  ：behind（体のうしろに描く）・front（体の前に描く。ベルトなど）・backView（うしろすがた のとき）
//   art などは { x, y, rows }。x, y は Dettyan の絵（20×24）の左上からの位置。"." は透明

import { drawDettyan, dettyanPalette } from "dettyan_sprite"

export const SLOTS = [
  { id: "head", name: "あたま", icon: "🧢" },
  { id: "outfit", name: "からだ", icon: "👕" },
  { id: "weapon", name: "て", icon: "✋" },
  { id: "back", name: "せなか", icon: "🎒" },
  { id: "feet", name: "あし", icon: "👟" }
]

export function slotName(id) {
  return SLOTS.find((s) => s.id === id)?.name || ""
}

const OUTLINE = "#1a1414"

// てんしのはね（左のはねを書いて、右は左右をひっくり返して作る）
const WING_LEFT = [
  "....KKK..",
  "..KKWWWK.",
  ".KWWWWWWK",
  "KWWwWWWWW",
  "KWwWWwWWW",
  ".KWwWWwWW",
  "..KWwWwWW",
  "...KWWwWW",
  "....KKWWK"
]
const WINGS = { x: -5, y: 12, rows: WING_LEFT.map((r) => r + ".".repeat(12) + [...r].reverse().join("")) }

export const GEAR = [
  // ---- て ----
  { id: "stick", name: "木のぼう", slot: "weapon", atk: 2, hp: 0,
    hand: ["..w", ".w.", ".w.", "w..", "w.."], colors: { w: "#9a6a3a" } },
  { id: "harisen", name: "ハリセン", slot: "weapon", atk: 5, hp: 0,
    hand: ["www", "wfw", "www", ".h.", ".h."], colors: { w: "#fff6d6", f: "#e8d49a", h: "#c0392b" } },
  { id: "mic", name: "マイク", slot: "weapon", atk: 8, hp: 0,
    hand: [".m.", "mMm", ".m.", ".s.", ".s."], colors: { m: "#4a4a58", M: "#9aa0b0", s: "#2b2b35" } },
  { id: "goldmic", name: "金のマイク", slot: "weapon", atk: 13, hp: 0,
    hand: [".m.", "mMm", ".m.", ".s.", ".s."], colors: { m: "#b8860b", M: "#ffe066", s: "#8a6a10" } },

  // ---- からだ ----
  { id: "jersey", name: "ジャージ", slot: "outfit", atk: 0, hp: 8,
    colors: { J: "#2f6fd0", j: "#1d4a96", W: "#ffffff", P: "#2f6fd0" } },
  { id: "suit", name: "スーツ", slot: "outfit", atk: 1, hp: 15,
    colors: { J: "#2b2b35", j: "#16161c", W: "#ffffff", P: "#2b2b35" } },
  { id: "stage", name: "ステージいしょう", slot: "outfit", atk: 2, hp: 25,
    colors: { J: "#ff5fa2", j: "#c23a7a", W: "#ffe066", P: "#3a2a6b" } },
  { id: "kira", name: "キラキラいしょう", slot: "outfit", atk: 4, hp: 40,
    colors: { J: "#f0f0ff", j: "#b0a0ff", W: "#ffd84d", P: "#7a5fd0" } },

  // ---- あたま ----
  { id: "cap", name: "キャップ", slot: "head", atk: 0, hp: 4,
    colors: { C: "#d94a3a", c: "#ffffff", B: "#a8322a" },
    art: { x: 3, y: 4, rows: [
      "..KKKKKKKKKK..",
      ".KCCCCCCCCCCK.",
      "KCCCCCccCCCCCK",
      "KBBBBBBBBBBBBK"
    ] },
    icon: [
      "............",
      "............",
      "....KKKK....",
      "...KCCCCK...",
      "..KCCccCCK..",
      "..KCCCCCCK..",
      "..KCCCCCCK..",
      "..KBBBBBBBBK",
      "...KKKKKKKK.",
      "............",
      "............",
      "............"
    ] },
  { id: "headphones", name: "ヘッドホン", slot: "head", atk: 1, hp: 7,
    colors: { b: "#2b2b35", C: "#e0484d", c: "#ff9a9a" },
    art: { x: 2, y: 4, rows: [
      "...bbbbbbbbbb...",
      "..b..........b..",
      ".b............b.",
      ".b............b.",
      "KKK..........KKK",
      "KCc..........cCK",
      "KCC..........CCK",
      "KCC..........CCK",
      "KKK..........KKK"
    ] },
    icon: [
      "............",
      "...bbbbbb...",
      "..b......b..",
      ".b........b.",
      ".b........b.",
      "KKKK....KKKK",
      "KCcK....KcCK",
      "KCCK....KCCK",
      "KCCK....KCCK",
      "KKKK....KKKK",
      "............",
      "............"
    ] },
  { id: "helmet", name: "ライトつきヘルメット", slot: "head", atk: 1, hp: 12,
    colors: { Y: "#f0c020", y: "#c89a10", L: "#fffbe0", l: "#9aa0b0" },
    art: { x: 2, y: 0, rows: [
      "......KKKK......",
      "....KKYYYYKK....",
      "...KYYYllYYYK...",
      "..KYYYlLLlYYYK..",
      "..KYYYlLLlYYYK..",
      ".KYYYYYllYYYYYK.",
      ".KyyyyyyyyyyyyK.",
      "KYYYYYYYYYYYYYYK"
    ] },
    backArt: { x: 2, y: 0, rows: [
      "......KKKK......",
      "....KKYYYYKK....",
      "...KYYYYYYYYK...",
      "..KYYYYYYYYYYK..",
      "..KYYYYYYYYYYK..",
      ".KYYYYYYYYYYYYK.",
      ".KyyyyyyyyyyyyK.",
      "KYYYYYYYYYYYYYYK"
    ] },
    icon: [
      "............",
      "....KKKK....",
      "..KKYYYYKK..",
      ".KYYYllYYYK.",
      ".KYYlLLlYYK.",
      ".KYYlLLlYYK.",
      ".KYYYllYYYK.",
      ".KyyyyyyyyK.",
      "KYYYYYYYYYYK",
      "KKKKKKKKKKKK",
      "............",
      "............"
    ] },
  { id: "crown", name: "おうかん", slot: "head", atk: 3, hp: 18,
    colors: { Y: "#ffd84d", o: "#8a6a10", r: "#e0484d", g: "#3fbf7f" },
    art: { x: 5, y: 1, rows: [
      "o...oo...o",
      "Yo.oYYo.oY",
      "YYoYYYYoYY",
      "YYYYYYYYYY",
      "YrYYYgYYrY",
      "oooooooooo"
    ] },
    icon: [
      "............",
      "............",
      ".o...oo...o.",
      ".Yo.oYYo.oY.",
      ".YYoYYYYoYY.",
      ".YYYYYYYYYY.",
      ".YrYYYgYYrY.",
      ".YYYYYYYYYY.",
      ".oooooooooo.",
      "............",
      "............",
      "............"
    ] },

  // ---- せなか ----
  { id: "backpack", name: "リュック", slot: "back", atk: 0, hp: 5,
    colors: { R: "#3f8fd0", r: "#2a6aa0", s: "#24507a" },
    behind: { x: 1, y: 15, rows: [
      "...KKKKKKKKKKKK...",
      "..KRRRRRRRRRRRRK..",
      ".KRRRRRRRRRRRRRRK.",
      "KRRRRRRRRRRRRRRRRK",
      "KrRRRRRRRRRRRRRRrK",
      "KrRRRRRRRRRRRRRRrK",
      ".KrrrrrrrrrrrrrrK.",
      "..KKKKKKKKKKKKKK.."
    ] },
    front: { x: 6, y: 16, rows: ["s......s", "s......s", "s......s", "s......s"] },
    backView: { x: 4, y: 15, rows: [
      "..KKKKKKKK..",
      ".KRRRRRRRRK.",
      ".KRrrrrrrRK.",
      ".KRRRRRRRRK.",
      ".KRRRssRRRK.",
      ".KRRRRRRRRK.",
      "..KKKKKKKK.."
    ] },
    icon: [
      "............",
      "....KKKK....",
      "...Ks..sK...",
      "..KKKKKKKK..",
      ".KRRRRRRRRK.",
      ".KRrrrrrrRK.",
      ".KRRRRRRRRK.",
      ".KRRRssRRRK.",
      ".KRRRRRRRRK.",
      ".KRRRRRRRRK.",
      "..KKKKKKKK..",
      "............"
    ] },
  { id: "cape", name: "マント", slot: "back", atk: 1, hp: 9,
    colors: { M: "#c0392b", m: "#8a2a20", g: "#ffd84d" },
    behind: { x: 0, y: 15, rows: [
      "....KKKKKKKKKKKK....",
      "...KMMMMMMMMMMMMK...",
      "..KMMMMMMMMMMMMMMK..",
      "..KMMMMMMMMMMMMMMK..",
      ".KMMMMMMMMMMMMMMMMK.",
      ".KmMMMMMMMMMMMMMMmK.",
      "KmMMMMMMMMMMMMMMMMmK",
      "KmMmMMMMMMMMMMMMmMmK",
      ".KKKKKKKKKKKKKKKKKK."
    ] },
    front: { x: 8, y: 16, rows: ["g..g"] },
    backView: { x: 3, y: 15, rows: [
      ".KKKKKKKKKKKK.",
      "KMMMMMMMMMMMMK",
      "KMMMMMMMMMMMMK",
      "KMMMMMmMMMMMMK",
      "KMMMMMMMMMMMMK",
      "KMMmMMMMMMmMMK",
      "KMMMMMMMMMMMMK",
      "KmMMmMMMMmMMmK",
      ".KKKKKKKKKKKK."
    ] },
    icon: [
      "............",
      "...g.KK.g...",
      "...KMMMMK...",
      "..KMMMMMMK..",
      "..KMMMMMMK..",
      ".KMMMmMMMMK.",
      ".KMMMMMMMMK.",
      ".KMMmMMMmMK.",
      "KMMMMMMMMMMK",
      "KmMMmMMmMMmK",
      ".KKKKKKKKKK.",
      "............"
    ] },
  { id: "guitar", name: "ギター", slot: "back", atk: 3, hp: 6,
    colors: { G: "#d9822b", g: "#8a4a1a", n: "#5e3a1f", w: "#2b2220", t: "#d0d0d0", s: "#2b2b35" },
    behind: { x: 0, y: 5, rows: [
      ".................KKK",
      ".................KtK",
      "................KnnK",
      "................Knn.",
      "...............Knn..",
      "...............Knn..",
      "..............Knn...",
      "..............Knn...",
      ".............Knn....",
      ".............Knn....",
      "............Knn.....",
      "....................",
      "KKKK................",
      "GGGGK...............",
      "GwGGGK..............",
      "GGGGGK..............",
      "gGGGGK..............",
      "KgGGK...............",
      ".KKK................"
    ] },
    front: { x: 5, y: 16, rows: [
      ".........s",
      "........s.",
      "......ss..",
      "....ss....",
      "..ss......",
      "ss........"
    ] },
    backView: { x: 2, y: 8, rows: [
      "..............KK",
      ".............KtK",
      "............Knn.",
      "...........Knn..",
      "..........Knn...",
      ".........Knn....",
      "........Knn.....",
      ".......Knn......",
      "..KKKKKnn.......",
      ".KGGGGGGK.......",
      "KGGGwwGGGK......",
      "KGGwwwwGGK......",
      "KGGGwwGGGK......",
      "KgGGGGGGgK......",
      ".KggggggK.......",
      "..KKKKKK........"
    ] },
    icon: [
      ".........KtK",
      "........KnnK",
      ".......Knn..",
      "......Knn...",
      ".....Knn....",
      "..KKKnn.....",
      ".KGGGGGK....",
      "KGGwwGGGK...",
      "KGwwwwGGK...",
      "KGGwwGGGK...",
      ".KgGGGgK....",
      "..KKKKK....."
    ] },
  { id: "wings", name: "てんしのはね", slot: "back", atk: 2, hp: 16,
    colors: { W: "#ffffff", w: "#d8e0f0", K: "#8a9ab8" },
    behind: WINGS,
    backView: WINGS,
    icon: [
      "............",
      "KK........KK",
      "KWK......KWK",
      "KWWK....KWWK",
      "KWwWK..KWwWK",
      ".KWwWKKWwWK.",
      ".KWWwWWwWWK.",
      "..KWWWWWWK..",
      "...KKWWKK...",
      "............",
      "............",
      "............"
    ] },

  // ---- あし ----
  { id: "sneakers", name: "スニーカー", slot: "feet", atk: 1, hp: 2,
    colors: { F: "#f4f1ea", f: "#e0484d" } },
  { id: "loafers", name: "かわぐつ", slot: "feet", atk: 1, hp: 5,
    colors: { F: "#4a2a14", f: "#b07a4a" } },
  { id: "boots", name: "ブーツ", slot: "feet", atk: 2, hp: 8,
    colors: { F: "#5a3a1f", f: "#8a5a33", Q: "#6b4626" } },
  { id: "kirashoes", name: "キラキラくつ", slot: "feet", atk: 3, hp: 12,
    colors: { F: "#ff7ab6", f: "#fff6c0", Q: "#ffd84d" } }
]

export function findGear(id) {
  return GEAR.find((g) => g.id === id) || null
}

// そうびしているもの { head, outfit, weapon, back, feet }（ないときは null）
export function equipped(s) {
  const out = {}
  for (const slot of SLOTS) out[slot.id] = findGear(s.gear?.[slot.id])
  return out
}

// そうびの強さの合計
export function gearBonus(s) {
  const set = equipped(s)
  let atk = 0
  let hp = 0
  for (const slot of SLOTS) {
    atk += set[slot.id]?.atk || 0
    hp += set[slot.id]?.hp || 0
  }
  return { atk, hp }
}

// そうびする・はずす（同じものをもう一度えらぶと はずす）
export function toggleGear(s, id) {
  const gear = findGear(id)
  if (!gear || !s.gear.owned[id]) return { ok: false }
  const on = s.gear[gear.slot] !== id
  s.gear[gear.slot] = on ? id : null
  return { ok: true, gear, on }
}

// ---- 絵 ----

// { x, y, rows } の絵を描く
export function drawArt(g, art, colors, ox, oy, scale = 1) {
  if (!art) return
  art.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x]
      if (c === ".") continue
      g.fillStyle = colors[c] || (c === "K" ? OUTLINE : "#ff00ff")
      g.fillRect(ox + (art.x + x) * scale, oy + (art.y + y) * scale, scale, scale)
    }
  })
}

// そうびした Dettyan を描く（部屋・バトル・メニューのアイコンで同じ絵になる）
//   set：equipped(state) の形。opts は drawDettyan と同じ（eyes・frame・mouth・view）
//   hideHand：手に持っているものを描かない（歌うときに マイクを持つため）
export function drawDressed(g, left, top, set = {}, opts = {}) {
  const view = opts.view || "front"
  const palette = dettyanPalette(set.outfit?.colors, set.feet?.colors)
  const back = set.back
  const head = set.head
  if (view === "back") {
    drawDettyan(g, left, top, { ...opts, palette })
    if (back) drawArt(g, back.backView, back.colors, left, top)
    if (head) drawArt(g, head.backArt || head.art, head.colors, left, top)
    return
  }
  if (back) drawArt(g, back.behind, back.colors, left, top)
  drawDettyan(g, left, top, { ...opts, palette })
  if (back) drawArt(g, back.front, back.colors, left, top)
  if (head) drawArt(g, head.art, head.colors, left, top)
  if (set.weapon && !opts.hideHand) drawHand(g, set.weapon, left + 15, top + 15)
}

// アイコン（12×12）を描く
const OUTFIT_ICON = [
  "............",
  "...JJ..JJ...",
  "..JJJjjJJJ..",
  ".JJJJWWJJJJ.",
  ".JJJjWWjJJJ.",
  ".JJ.JWWJ.JJ.",
  ".JJ.JWWJ.JJ.",
  "....JWWJ....",
  "....JJJJ....",
  "....PPPP....",
  "....PP.PP...",
  "............"
]

const SHOE_ICON = [
  "............",
  "............",
  "............",
  "............",
  "............",
  "...KKKK.....",
  "...KFFFKK...",
  "...KFffFFK..",
  "..KFFFFFFFK.",
  "..KKKKKKKKK.",
  "............",
  "............"
]

const BOOT_ICON = [
  "............",
  "...KKKK.....",
  "...KQQK.....",
  "...KQQK.....",
  "...KQQK.....",
  "...KQQK.....",
  "...KFFFKK...",
  "...KFffFFK..",
  "..KFFFFFFFK.",
  "..KKKKKKKKK.",
  "............",
  "............"
]

export function drawGearIcon(g, gear, ox, oy, scale = 1) {
  if (gear.slot === "weapon") return drawHand(g, gear, ox + 3 * scale, oy + scale, 2 * scale)
  let rows = gear.icon
  if (gear.slot === "outfit") rows = OUTFIT_ICON
  if (gear.slot === "feet") rows = gear.colors.Q ? BOOT_ICON : SHOE_ICON
  if (!rows) return
  drawArt(g, { x: 0, y: 0, rows }, gear.colors, ox, oy, scale)
}

// 手に持つものを描く（scale 倍）
export function drawHand(g, gear, ox, oy, scale = 1) {
  gear.hand.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x]
      if (c === ".") continue
      g.fillStyle = gear.colors[c]
      g.fillRect(ox + x * scale, oy + y * scale, scale, scale)
    }
  })
}

// 歌うときに 手に持つマイク（顔の横まで 手を上げる）。マイクを そうびしていたら その色
const HELD_MIC = { x: 11, y: 11, rows: [
  ".mm..",
  "mMMm.",
  "mMMm.",
  ".ss..",
  ".sSS.",
  "..SSJ",
  "...JJ"
] }
const DEFAULT_MIC = { m: "#4a4a58", M: "#9aa0b0", s: "#2b2b35" }

export function drawHeldMic(g, left, top, set = {}) {
  const palette = dettyanPalette(set.outfit?.colors, set.feet?.colors)
  const mic = set.weapon && /mic/.test(set.weapon.id) ? set.weapon.colors : DEFAULT_MIC
  // 下ろしていた手は、そでで かくす
  g.fillStyle = palette.J
  g.fillRect(left + 15, top + 20, 1, 1)
  drawArt(g, HELD_MIC, { ...mic, S: palette.S, J: palette.J }, left, top)
}
