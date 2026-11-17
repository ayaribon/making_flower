// 🗡️ そうび（ぼうけん でときどき落ちる・ショップで買える。そうびすると強くなり、見た目も変わる）
// 体のパーツごとに1つずつ：あたま・からだ・て・せなか・あし（SLOTS）
// 増やすときは GEAR に1つ足して、落ちる行き先（dettyan_adventure.js の PLACES の gear）に id を書く
// ショップで売るものは price（ねだん）を書く（ぼうけん では落ちない）
//
//   id     セーブに入る名前（あとから変えない）
//   slot   SLOTS の id。"head" | "outfit" | "weapon" | "back" | "feet"
//          ※ "weapon"（て）と "outfit"（からだ）は、前からあるセーブの名前なので変えない
//   hp・atk・def・mag・spd  上がる強さ（たいりょく・こうげき・まもり・まほう・すばやさ。書かないものは 0）
//          hp は たいりょく（パラメータ）。じっさいの HP は たいりょく × 100（dettyan_battle.js の HP_PER_VIT）
//          強さの つけかた：て＝こうげき・まほう、からだ・あたま＝たいりょく・まもり、あし・はね＝すばやさ
//   price  ショップのねだん（コイン）。書いたものだけ ショップの「いしょう」に出る
//   colors 絵の色（文字 → 色）。K は書かなければ ふちの色
//   絵：
//     て      ：hand（手に持つ絵）
//     からだ  ：colors（Dettyan の色のうち J：ジャケット・j：えり・W：シャツ・P：ズボン を入れかえる）
//               art / backArt があれば上に重ねる（ポケット・おび など）
//     あし    ：colors（F：くつ・f：くつの ひかり。Q を書くと ひざから下も その色＝ブーツ）
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
const WINGS = { x: -5, y: 12, rows: mirror(WING_LEFT, 12) }

// 左がわの絵と、まんなかの すきま から、左右おなじ形の絵を作る
function mirror(left, gap) {
  return left.map((r) => r + ".".repeat(gap) + [...r].reverse().join(""))
}

const BUTTERFLY_LEFT = [
  "KK......",
  "KPPK....",
  "KPpPPK..",
  "KPPyPPK.",
  ".KPPPPPK",
  "..KKKPPK",
  ".KLLLKK.",
  "KLlLLK..",
  "KLLLK...",
  ".KKK...."
]
const BUTTERFLY = { x: -4, y: 12, rows: mirror(BUTTERFLY_LEFT, 12) }

export const GEAR = [
  // ---- て ----
  { id: "stick", name: "木のぼう", slot: "weapon", atk: 1,
    hand: ["..w", ".w.", ".w.", "w..", "w.."], colors: { w: "#9a6a3a" } },
  { id: "harisen", name: "ハリセン", slot: "weapon", atk: 2,
    hand: ["www", "wfw", "www", ".h.", ".h."], colors: { w: "#fff6d6", f: "#e8d49a", h: "#c0392b" } },
  { id: "mic", name: "マイク", slot: "weapon", atk: 2, mag: 2,
    hand: [".m.", "mMm", ".m.", ".s.", ".s."], colors: { m: "#4a4a58", M: "#9aa0b0", s: "#2b2b35" } },
  { id: "goldmic", name: "金のマイク", slot: "weapon", atk: 3, mag: 3,
    hand: [".m.", "mMm", ".m.", ".s.", ".s."], colors: { m: "#b8860b", M: "#ffe066", s: "#8a6a10" } },

  // ---- からだ ----
  { id: "jersey", name: "ジャージ", slot: "outfit", hp: 1, spd: 1,
    colors: { J: "#2f6fd0", j: "#1d4a96", W: "#ffffff", P: "#2f6fd0" } },
  { id: "suit", name: "スーツ", slot: "outfit", hp: 1, def: 1,
    colors: { J: "#2b2b35", j: "#16161c", W: "#ffffff", P: "#2b2b35" } },
  { id: "stage", name: "ステージいしょう", slot: "outfit", hp: 2, def: 1, mag: 1,
    colors: { J: "#ff5fa2", j: "#c23a7a", W: "#ffe066", P: "#3a2a6b" } },
  { id: "kira", name: "キラキラいしょう", slot: "outfit", hp: 2, def: 2, mag: 2,
    colors: { J: "#f0f0ff", j: "#b0a0ff", W: "#ffd84d", P: "#7a5fd0" } },

  // ---- あたま ----
  { id: "cap", name: "キャップ", slot: "head", hp: 1, def: 1,
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
  { id: "headphones", name: "ヘッドホン", slot: "head", hp: 1, mag: 1,
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
  { id: "helmet", name: "ライトつきヘルメット", slot: "head", hp: 1, def: 2,
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
  { id: "crown", name: "おうかん", slot: "head", hp: 1, def: 1, mag: 2,
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
  { id: "backpack", name: "リュック", slot: "back", hp: 1,
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
  { id: "cape", name: "マント", slot: "back", hp: 1, def: 1,
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
  { id: "guitar", name: "ギター", slot: "back", atk: 2, mag: 1,
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
  { id: "wings", name: "てんしのはね", slot: "back", hp: 1, mag: 1, spd: 1,
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
  { id: "sneakers", name: "スニーカー", slot: "feet", spd: 1,
    colors: { F: "#f4f1ea", f: "#e0484d" } },
  { id: "loafers", name: "かわぐつ", slot: "feet", def: 1, spd: 1,
    colors: { F: "#4a2a14", f: "#b07a4a" } },
  { id: "boots", name: "ブーツ", slot: "feet", hp: 1, def: 1,
    colors: { F: "#5a3a1f", f: "#8a5a33", Q: "#6b4626" } },
  { id: "kirashoes", name: "キラキラくつ", slot: "feet", hp: 1, spd: 2,
    colors: { F: "#ff7ab6", f: "#fff6c0", Q: "#ffd84d" } },

  // ==== ここから ショップで買う かわいい いしょう（price あり） ====

  // ---- あたま ----
  { id: "nekomimi", name: "ねこみみ", slot: "head", spd: 1, price: 900,
    colors: { p: "#ff9ec4", H: "#4a4a5a", h: "#6a6a7e" },
    art: { x: 3, y: 0, rows: [
      ".K..........K.",
      ".KK........KK.",
      ".KpK......KpK.",
      "KhppK....KpphK",
      "KHHHHK..KHHHHK"
    ] },
    backArt: { x: 3, y: 0, rows: [
      ".K..........K.",
      ".KK........KK.",
      ".KhK......KhK.",
      "KhHHK....KHHhK",
      "KHHHHK..KHHHHK"
    ] },
    icon: [
      "............",
      ".K........K.",
      ".KK......KK.",
      ".KpK....KpK.",
      "KhppK..KpphK",
      "KHHHHKKHHHHK",
      ".KKKKKKKKKK.",
      "............",
      "............",
      "............",
      "............",
      "............"
    ] },
  { id: "ribbon", name: "おおきなリボン", slot: "head", hp: 1, mag: 1, price: 1200,
    colors: { R: "#ff5fa2", r: "#ffc0dc" },
    art: { x: 4, y: 1, rows: [
      ".KK......KK.",
      "KRRK....KRRK",
      "KRrRKRRKRrRK",
      "KRRK.KK.KRRK",
      ".KK......KK."
    ] },
    icon: [
      "............",
      "............",
      ".KK......KK.",
      "KRRKK..KKRRK",
      "KRrRRKKRRrRK",
      "KRrRRRRRRrRK",
      "KRrRRKKRRrRK",
      "KRRKK..KKRRK",
      ".KK.KRRK.KK.",
      "....KRRK....",
      ".....KK.....",
      "............"
    ] },
  { id: "usamimi", name: "うさみみ", slot: "head", hp: 1, spd: 1, price: 1500,
    colors: { W: "#ffffff", p: "#ffb0d0", b: "#ff8ac6" },
    art: { x: 5, y: -3, rows: [
      ".K......K.",
      "KWK....KWK",
      "KpK....KpK",
      "KpK....KpK",
      "KpK....KpK",
      "KWK....KWK",
      "KWK....KWK",
      "KbbbbbbbbK"
    ] },
    backArt: { x: 5, y: -3, rows: [
      ".K......K.",
      "KWK....KWK",
      "KWK....KWK",
      "KWK....KWK",
      "KWK....KWK",
      "KWK....KWK",
      "KWK....KWK",
      "KbbbbbbbbK"
    ] },
    icon: [
      "..KK....KK..",
      ".KWWK..KWWK.",
      ".KWpK..KpWK.",
      ".KWpK..KpWK.",
      ".KWpK..KpWK.",
      ".KWpK..KpWK.",
      ".KWWK..KWWK.",
      "..KWKKKKWK..",
      "..KbbbbbbK..",
      "...KKKKKK...",
      "............",
      "............"
    ] },
  { id: "hanakanmuri", name: "はなかんむり", slot: "head", hp: 1, mag: 1, price: 1000,
    colors: { P: "#ff8ac6", Y: "#ffe066", B: "#8ad0ff", g: "#5cc46a" },
    art: { x: 4, y: 3, rows: [
      ".PP..YY..BB.",
      "gPPggYYggBBg",
      ".g........g."
    ] },
    icon: [
      "............",
      "............",
      "...PP..YY...",
      "..gPPggYYg..",
      ".g........g.",
      "BB........PP",
      "BB........PP",
      ".g........g.",
      "..gYYggBBg..",
      "...YY..BB...",
      "............",
      "............"
    ] },

  // ---- からだ ----
  { id: "parka", name: "ゆめかわパーカー", slot: "outfit", hp: 1, def: 1, price: 1500,
    colors: { J: "#ffb0d0", j: "#ff8ac6", W: "#ffc8e0", P: "#b8b0d0", w: "#ffffff" },
    art: { x: 5, y: 15, rows: [
      "JJ......JJ",
      "..........",
      "...w..w...",
      "...w..w...",
      "..........",
      "..jjjjjj.."
    ] },
    backArt: { x: 5, y: 14, rows: [
      "..JJJJJJ..",
      ".JjjjjjjJ.",
      "..JJJJJJ.."
    ] } },
  { id: "sailor", name: "セーラーふく", slot: "outfit", hp: 1, def: 1, spd: 1, price: 1800,
    colors: { J: "#f4f4f8", j: "#2a3a7a", W: "#e0484d", P: "#2a3a7a", n: "#2a3a7a", w: "#ffffff" },
    art: { x: 5, y: 16, rows: ["nnn....nnn"] },
    backArt: { x: 5, y: 16, rows: [
      "nnnnnnnnnn",
      "nwwwwwwwwn",
      "nnnnnnnnnn"
    ] } },
  { id: "kuma", name: "くまの きぐるみ", slot: "outfit", hp: 2, def: 1, price: 2200,
    colors: { J: "#a8743f", j: "#7a4a24", W: "#e8c89a", P: "#a8743f", b: "#a8743f", c: "#e8c89a" },
    art: { x: 3, y: 3, rows: [
      ".KK........KK.",
      "KbbK......KbbK",
      "KbcK......KcbK",
      ".KK........KK."
    ] },
    backArt: { x: 3, y: 3, rows: [
      ".KK........KK.",
      "KbbK......KbbK",
      "KbbK......KbbK",
      ".KK........KK."
    ] } },
  { id: "yukata", name: "ゆかた", slot: "outfit", hp: 1, mag: 1, price: 2000,
    colors: { J: "#3a4a8a", j: "#f4f1ea", W: "#3a4a8a", P: "#3a4a8a", w: "#c8d8ff", o: "#e0484d", y: "#ffd84d" },
    art: { x: 4, y: 17, rows: [
      "..w.....w...",
      ".....w......",
      "oooooyyooooo",
      "............",
      "..w....w...."
    ] },
    backArt: { x: 4, y: 18, rows: [
      "....yyyy....",
      "oooooyyooooo",
      "....yyyy...."
    ] } },
  { id: "ouji", name: "おうじさまの ふく", slot: "outfit", hp: 1, atk: 1, def: 1, price: 2500,
    colors: { J: "#f4f4ff", j: "#d8b040", W: "#f4f4ff", P: "#3a4aa0", g: "#ffd84d", r: "#e0484d" },
    art: { x: 4, y: 16, rows: [
      "gg........gg",
      ".........r..",
      "........r...",
      ".......r....",
      "......r....."
    ] },
    backArt: { x: 4, y: 16, rows: ["gg........gg"] } },

  // ---- て ----
  { id: "penlight", name: "ペンライト", slot: "weapon", mag: 1, spd: 1, price: 600,
    hand: [".L.", ".L.", ".l.", ".s.", ".s."], colors: { L: "#ff7ab6", l: "#ffb0d8", s: "#f4f4f8" } },
  { id: "uchiwa", name: "ハートのうちわ", slot: "weapon", atk: 1, mag: 1, price: 800,
    hand: ["ppp", "pHp", "ppp", ".s.", ".s."], colors: { p: "#ffd0e4", H: "#ff3a7a", s: "#c8965a" } },
  { id: "magicwand", name: "まほうのステッキ", slot: "weapon", mag: 2, price: 1100,
    hand: [".y.", "yYy", ".y.", ".w.", ".w."], colors: { y: "#ffd84d", Y: "#fff6c0", w: "#ff9ec4" } },

  // ---- せなか ----
  { id: "kumapack", name: "くまリュック", slot: "back", hp: 1, price: 1600,
    colors: { B: "#a8743f", b: "#7a4a24", c: "#e8c89a", s: "#7a4a24" },
    behind: { x: 1, y: 13, rows: [
      "..KK..........KK..",
      ".KbbK........KbbK.",
      "...KKKKKKKKKKKK...",
      "..KBBBBBBBBBBBBK..",
      ".KBBBBBBBBBBBBBBK.",
      "KBBBBBBBBBBBBBBBBK",
      "KbBBBBBBBBBBBBBBbK",
      "KbBBBBBBBBBBBBBBbK",
      ".KbbbbbbbbbbbbbbK.",
      "..KKKKKKKKKKKKKK.."
    ] },
    front: { x: 6, y: 16, rows: ["s......s", "s......s", "s......s", "s......s"] },
    backView: { x: 4, y: 13, rows: [
      ".KK......KK.",
      "KbbK....KbbK",
      "KBBBBBBBBBBK",
      "KBBKBBBBKBBK",
      "KBBBBccBBBBK",
      "KBBBcKKcBBBK",
      "KBBBBccBBBBK",
      ".KBBBBBBBBK.",
      "..KKKKKKKK.."
    ] },
    icon: [
      "............",
      ".KK......KK.",
      "KbbK....KbbK",
      "KBBBBBBBBBBK",
      "KBBKBBBBKBBK",
      "KBBBBccBBBBK",
      "KBBBcKKcBBBK",
      "KBBBBccBBBBK",
      "KBBBBBBBBBBK",
      ".KBBBBBBBBK.",
      "..KKKKKKKK..",
      "............"
    ] },
  { id: "chouchou", name: "ちょうちょのはね", slot: "back", mag: 1, spd: 1, price: 2000,
    colors: { P: "#ffb0d0", p: "#ffffff", y: "#ffe066", L: "#c8a0ff", l: "#ffffff", K: "#8a5a9a" },
    behind: BUTTERFLY,
    backView: BUTTERFLY,
    icon: [
      "............",
      "KK........KK",
      "KPPK....KPPK",
      "KPpPK..KPpPK",
      "KPPyPKKPyPPK",
      ".KPPPKKPPPK.",
      "..KKKKKKKK..",
      ".KLLLKKLLLK.",
      ".KLlLKKLlLK.",
      "..KLK..KLK..",
      "...K....K...",
      "............"
    ] },
  { id: "shippo", name: "ねこのしっぽ", slot: "back", spd: 1, price: 900,
    colors: { H: "#2a2a32", w: "#ffffff" },
    behind: { x: 13, y: 13, rows: [
      ".....KK.",
      "....KwwK",
      "....KHK.",
      "....KHK.",
      ".....KHK",
      ".....KHK",
      "....KHK.",
      "..KKHK..",
      ".KHHK...",
      "..KK...."
    ] },
    backView: { x: 9, y: 18, rows: [
      "..KK..",
      ".KHHK.",
      ".KHK..",
      "KHK...",
      "KHK...",
      ".KHK..",
      "..KwK."
    ] },
    icon: [
      "........KK..",
      ".......KwwK.",
      ".......KHHK.",
      "......KHHK..",
      "......KHK...",
      ".....KHHK...",
      "....KHHK....",
      "...KHHK.....",
      "..KHHK......",
      ".KHHK.......",
      ".KKK........",
      "............"
    ] },

  // ---- あし ----
  { id: "geta", name: "げた", slot: "feet", def: 1, spd: 1, price: 600,
    colors: { F: "#c8965a", f: "#e0484d" } },
  { id: "usaslipper", name: "うさぎスリッパ", slot: "feet", hp: 1, price: 700,
    colors: { F: "#ffffff", f: "#ffb0d0" } },
  { id: "yumeboots", name: "ゆめかわブーツ", slot: "feet", hp: 1, spd: 1, price: 1300,
    colors: { F: "#c8a0ff", f: "#ffffff", Q: "#ffb0d0" } }
]

// ショップで売っている そうび
export function shopGear() {
  return GEAR.filter((g) => g.price > 0)
}

// ショップで買う。{ ok, gear, reason：「money」（お金が足りない）|「owned」（もう持っている）|「unknown」 }
export function buyGear(s, id) {
  const gear = findGear(id)
  if (!gear || !(gear.price > 0)) return { ok: false, reason: "unknown" }
  if (s.gear.owned[id]) return { ok: false, reason: "owned", gear }
  if (s.money < gear.price) return { ok: false, reason: "money", gear }
  s.money -= gear.price
  s.gear.owned[id] = true
  return { ok: true, gear }
}

export function findGear(id) {
  return GEAR.find((g) => g.id === id) || null
}

// そうびしているもの { head, outfit, weapon, back, feet }（ないときは null）
export function equipped(s) {
  const out = {}
  for (const slot of SLOTS) out[slot.id] = findGear(s.gear?.[slot.id])
  return out
}

// そうびの強さの合計 { hp, atk, def, mag, spd }
export const GEAR_STATS = ["hp", "atk", "def", "mag", "spd"]

export function gearBonus(s) {
  const set = equipped(s)
  const out = {}
  for (const k of GEAR_STATS) out[k] = 0
  for (const slot of SLOTS) {
    const g = set[slot.id]
    if (!g) continue
    for (const k of GEAR_STATS) out[k] += g[k] || 0
  }
  return out
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
    if (set.outfit) drawArt(g, set.outfit.backArt, set.outfit.colors, left, top)
    if (set.feet) drawArt(g, set.feet.backArt, set.feet.colors, left, top)
    if (back) drawArt(g, back.backView, back.colors, left, top)
    if (head) drawArt(g, head.backArt || head.art, head.colors, left, top)
    return
  }
  if (back) drawArt(g, back.behind, back.colors, left, top)
  drawDettyan(g, left, top, { ...opts, palette })
  if (set.outfit) drawArt(g, set.outfit.art, set.outfit.colors, left, top)
  if (set.feet) drawArt(g, set.feet.art, set.feet.colors, left, top)
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
