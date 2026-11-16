// 🍽️ Dettyan のごはん（ショップの商品）の表。docs/dettyan/requirements.md の5章
// ごはんを増やすときは、FOODS に1行（1かたまり）足すだけ。ショップと持ち物に自動で出る
//
//   id        セーブに入る名前（あとから変えない。変えるときは dettyan_save.js の MIGRATIONS で移しかえる）
//   name      画面に出す名前
//   price     ねだん（コイン）
//   genki     あげたときに上がる げんき
//   gokigen   あげたときに上がる ごきげん
//   favorite  好物なら true（大きくよろこぶ。ごきげんに FAVORITE_BONUS が足される）
//   line      食べたときのセリフ
//   sprite    ドット絵（12×12。"." は透明）と colors（文字 → 色）

export const FAVORITE_BONUS = 10

export const FOODS = [
  {
    id: "junsai",
    name: "じゅんさい",
    price: 15,
    genki: 20,
    gokigen: 25,
    favorite: true,
    line: "じゅんさい だいすき！",
    sprite: [
      "............",
      "....GgG.....",
      "..GgGJJGgG..",
      ".JJGGgGGJGJ.",
      "WBBBBBBBBBBW",
      "WbJGJJGJGJbW",
      ".WbGbbJbGbW.",
      "..WbbbbbbW..",
      "...WWWWWW...",
      "....WbbW....",
      "...WWWWWW...",
      "............"
    ],
    colors: { G: "#3f7d3a", g: "#9ad48a", J: "#d9f2e4", W: "#7fa9bf", B: "#eef9ff", b: "#cfe8f3" }
  },
  {
    id: "onigiri",
    name: "おにぎり",
    price: 8,
    genki: 15,
    gokigen: 5,
    favorite: false,
    line: "もぐもぐ… おいしい",
    sprite: [
      "............",
      ".....OO.....",
      "....ORRO....",
      "...ORRRRO...",
      "..ORRRRRRO..",
      "..ORRrRRRO..",
      ".ORRRRRRRRO.",
      ".ORNNNNNNRO.",
      ".ONNNNNNNNO.",
      ".ONNNNNNNNO.",
      "..OOOOOOOO..",
      "............"
    ],
    colors: { O: "#6b6658", R: "#fbfbf5", r: "#e4e2d6", N: "#1f3a2a" }
  }
]

export function findFood(id) {
  return FOODS.find((f) => f.id === id) || null
}

// ごきげんの上がり方（好物なら少し多い）
export function foodGokigen(food) {
  return food.gokigen + (food.favorite ? FAVORITE_BONUS : 0)
}

// ごはんの絵を描く（scale 倍の大きさで）
export function drawFood(g, food, ox, oy, scale = 1) {
  food.sprite.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x]
      if (c === ".") continue
      g.fillStyle = food.colors[c]
      g.fillRect(ox + x * scale, oy + y * scale, scale, scale)
    }
  })
}
