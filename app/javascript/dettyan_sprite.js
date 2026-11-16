// 🧑‍💼 Dettyan のドット絵（黒髪のマンバン・茶色のジャケット）
// 1マス＝1ドット。"." は透明。目（E）はまばたきのときに入れかえる
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
  ".....KPPK..KPPK.....",
  ".....KKK....KKK....."
]

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
  P: "#3a3a4a"  // ズボン
}

// Dettyan を描く。eyes："open" | "blink"
export function drawDettyan(g, ox, oy, { eyes = "open" } = {}) {
  const sprite = DETTYAN_SPRITE
  for (let y = 0; y < sprite.length; y++) {
    const row = sprite[y]
    for (let x = 0; x < row.length; x++) {
      let c = row[x]
      if (c === "E" && eyes === "blink") c = y === 11 ? "K" : "S"
      if (c === ".") continue
      g.fillStyle = DETTYAN_COLORS[c]
      g.fillRect(ox + x, oy + y, 1, 1)
    }
  }
}
