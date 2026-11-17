// 🧑‍💼 Dettyan のドット絵（黒髪のマンバン・茶色のジャケット）
// 1マス＝1ドット。"." は透明。目（E）はまばたきのときに入れかえる
// そうび（あたま・からだ・て・せなか・あし）を重ねて描くのは dettyan_gear.js の drawDressed
export const DETTYAN_SPRITE = [
  "........KKKK........",
  ".......KHHHHK.......",
  ".......KHhHHK.......",
  "........KbbK........",
  ".....KKKHHHHKKK.....",
  "....KHHHHHHHHHHK....",
  "...KHHHhHHHHHHHHK...",
  "...KHHSSSSSSSSHHK...",
  "...KHSKKSSSSKKSHK...",
  "...KHSSSSSSSSSSHK...",
  "...KSSESSSSSSESSK...",
  "...KSSESSSSSSESSK...",
  "...KsSSSSSSSSSSsK...",
  "....KSSSSmmSSSSK....",
  ".....KKSSSSSSKK.....",
  ".......KSSSSK.......",
  "....KJJJWWWWJJJK....",
  "...KJJJjWWWWjJJJK...",
  "...KJJJJjWWjJJJJK...",
  "...KJJJJJjjJJJJJK...",
  "...KSJJJJJJJJJJSK...",
  "....KPPPPPPPPPPK....",
  ".....KQQK..KQQK.....",
  "....KFfFK..KFfFK...."
]

// うしろすがた（PC で作業するとき）。おだんごとジャケットのせなか
export const DETTYAN_BACK = [
  "........KKKK........",
  ".......KHHHHK.......",
  ".......KHhHHK.......",
  "........KbbK........",
  ".....KKKHHHHKKK.....",
  "....KHHHHHHHHHHK....",
  "...KHHHhHHHHHHHHK...",
  "...KHHHHHHHHHHHHK...",
  "...KHHHHHHHhHHHHK...",
  "...KHHHHHHHHHHHHK...",
  "...KSHHHHHHHHHHSK...",
  "...KSHHHHHHHHHHSK...",
  "....KHHHHHHHHHHK....",
  ".....KHHHHHHHHK.....",
  "......KKHHHHKK......",
  ".......KSSSSK.......",
  "....KJJJjjjjJJJK....",
  "...KJJJJJJJJJJJJK...",
  "...KJJJJJJJJJJJJK...",
  "...KJJJJJjjJJJJJK...",
  "...KSJJJJJJJJJJSK...",
  "....KPPPPPPPPPPK....",
  ".....KQQK..KQQK.....",
  "....KFfFK..KFfFK...."
]

export const SPRITE_W = DETTYAN_SPRITE[0].length
export const SPRITE_H = DETTYAN_SPRITE.length

export const DETTYAN_COLORS = {
  K: "#1a1414", // ふち
  H: "#1f1f24", // 髪
  h: "#4a4a58", // 髪のつや
  b: "#6b4a2e", // おだんごのゴム
  S: "#f6d3b3", // はだ
  s: "#f2a3a3", // ほっぺ
  E: "#1a1414", // 目
  m: "#9a4a3a", // 口
  J: "#8a5a33", // ジャケット
  j: "#5e3a1f", // えり
  W: "#f4f1ea", // シャツ
  P: "#3a3a4a", // ズボン
  // Q：ひざから下（ふだんは P と同じ色。ブーツをはくと変わる）
  F: "#3a2a22", // くつ
  f: "#5a4234"  // くつの ひかり
}

// 歩くときの2コマ目（足のところだけ入れかえる。左足を少し上げる）
const WALK_LEGS = {
  22: ".....KQQK..KQQK.....",
  23: ".....KFfK..KFfFK...."
}

// 色を決める。colors は上からかぶせる（いしょう・くつ）。Q がなければ P と同じ
export function dettyanPalette(...layers) {
  const p = Object.assign({}, DETTYAN_COLORS, ...layers.filter(Boolean))
  if (!p.Q) p.Q = p.P
  return p
}

// Dettyan を描く
//   eyes  ："open" | "blink" | "happy"（歌うとき。目をつむって にっこり）
//   frame ：0 | 1（歩くときに交互に）
//   mouth ："close" | "open"（歌うとき）
//   view  ："front" | "back"（うしろすがた）
//   palette：dettyanPalette(...) で作った色（いしょう・くつ）
export function drawDettyan(g, ox, oy, { eyes = "open", frame = 0, mouth = "close", view = "front", palette = null, colors = null } = {}) {
  const pal = palette || dettyanPalette(colors)
  const sprite = view === "back" ? DETTYAN_BACK : DETTYAN_SPRITE
  for (let y = 0; y < sprite.length; y++) {
    const row = frame === 1 && WALK_LEGS[y] ? WALK_LEGS[y] : sprite[y]
    for (let x = 0; x < row.length; x++) {
      let c = row[x]
      if (c === ".") continue
      if (c === "E") {
        if (eyes === "blink") c = y === 11 ? "K" : "S"
        else if (eyes === "happy") c = y === 10 ? "K" : "S"
      }
      g.fillStyle = pal[c]
      g.fillRect(ox + x, oy + y, 1, 1)
    }
  }
  if (view === "front" && eyes === "happy") {
    // にっこり目（∩ の形）
    g.fillStyle = pal.K
    g.fillRect(ox + 5, oy + 11, 1, 1)
    g.fillRect(ox + 7, oy + 11, 1, 1)
    g.fillRect(ox + 12, oy + 11, 1, 1)
    g.fillRect(ox + 14, oy + 11, 1, 1)
  }
  if (view === "front" && mouth === "open") {
    // 歌っている口（大きく あける）
    g.fillStyle = pal.K
    g.fillRect(ox + 8, oy + 13, 4, 1)
    g.fillStyle = "#5a1a1a"
    g.fillRect(ox + 9, oy + 13, 2, 1)
    g.fillStyle = pal.K
    g.fillRect(ox + 9, oy + 14, 2, 1)
    g.fillStyle = "#e86a6a"
    g.fillRect(ox + 9, oy + 14, 1, 1)
  }
}
