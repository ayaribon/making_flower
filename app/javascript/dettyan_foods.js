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
    price: 150,
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
    price: 80,
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
  },
  {
    id: "purin",
    name: "プリン",
    price: 200,
    genki: 10,
    gokigen: 20,
    favorite: false,
    line: "ぷるぷる〜",
    sprite: [
      "............",
      "............",
      "....CCCC....",
      "...CCCCCC...",
      "...YyYYYY...",
      "..YyYYYYYY..",
      "..YYYYYYYY..",
      ".YYYYYYYYYY.",
      ".YYYYYYYYYY.",
      "WWWWWWWWWWWW",
      ".WWWWWWWWWW.",
      "............"
    ],
    colors: { C: "#8a4a1a", Y: "#ffd870", y: "#fff2b8", W: "#b8d0e8" }
  },
  {
    id: "shortcake",
    name: "ショートケーキ",
    price: 350,
    genki: 15,
    gokigen: 30,
    favorite: false,
    line: "いちご のってる！",
    sprite: [
      "............",
      ".....RR.....",
      "....RrRR....",
      "..OWWRRWWO..",
      ".OWWWWWWWWO.",
      ".OYYYYYYYYO.",
      ".OPPPPPPPPO.",
      ".OYYYYYYYYO.",
      ".OWWWWWWWWO.",
      ".OYYYYYYYYO.",
      "..OOOOOOOO..",
      "............"
    ],
    colors: { R: "#e0303a", r: "#ffb0b0", O: "#c8a070", W: "#fffaf0", Y: "#f6d08a", P: "#ff8aa0" }
  },
  {
    id: "taiyaki",
    name: "たいやき",
    price: 150,
    genki: 15,
    gokigen: 10,
    favorite: false,
    line: "あんこ たっぷり",
    sprite: [
      "............",
      "............",
      "............",
      "..TTTTTT..T.",
      ".TTtTTTTTTT.",
      "TTKTTtTTTTT.",
      "TTTTTTtTTTTT",
      "TTTTtTTTTTT.",
      ".TTTTTTtTTT.",
      "..TTTTTT..T.",
      "............",
      "............"
    ],
    colors: { T: "#d9963a", t: "#a8641f", K: "#3a2010" }
  },
  {
    id: "donut",
    name: "ドーナツ",
    price: 180,
    genki: 12,
    gokigen: 15,
    favorite: false,
    line: "あまくて しあわせ",
    sprite: [
      "............",
      "...DPPPPD...",
      "..PsPPPPyP..",
      ".PPPPPPPPPP.",
      ".PPbP..PPsP.",
      ".PPP....PPP.",
      ".PsP....PbP.",
      ".PPPP..PPPP.",
      "..DPPPPPPD..",
      "...DDDDDD...",
      "............",
      "............"
    ],
    colors: { D: "#d9963a", P: "#ff8ac6", s: "#ffffff", y: "#ffe066", b: "#5ec8ff" }
  },
  {
    id: "ichigomilk",
    name: "いちごミルク",
    price: 120,
    genki: 8,
    gokigen: 12,
    favorite: false,
    line: "ごくごく… ぷは〜",
    sprite: [
      "........S...",
      ".......S....",
      "..GGGGSGGG..",
      "..GPPPSPPG..",
      "..GPPPPPPG..",
      "..GPpPPPPG..",
      "..GPPPPPPG..",
      "..GPPPPPpG..",
      "..GPPPPPPG..",
      "...GGGGGG...",
      "............",
      "............"
    ],
    colors: { G: "#9fc8dc", P: "#ffb0c8", p: "#ffffff", S: "#ff5f8f" }
  },
  {
    id: "karaage",
    name: "からあげ",
    price: 250,
    genki: 30,
    gokigen: 10,
    favorite: false,
    line: "ジューシー！",
    sprite: [
      "............",
      "............",
      "....BBB.....",
      "..BBbBBBB...",
      ".BBBBBbBBB..",
      ".BbBBBBBBBB.",
      "..BBBbBBbBB.",
      "..LBBBBBBYY.",
      ".LLLLLLLYYY.",
      "..LLLLLL.Y..",
      "............",
      "............"
    ],
    colors: { B: "#c8782a", b: "#8a4a1a", L: "#5cc46a", Y: "#ffe066" }
  },
  {
    id: "ramen",
    name: "ラーメン",
    price: 400,
    genki: 50,
    gokigen: 15,
    favorite: false,
    line: "ずるずる… げんき でた！",
    sprite: [
      "............",
      ".......kk...",
      "..EEe..kk...",
      ".RRRRRRRRRR.",
      "RyyyyEEyNyyR",
      "RyYyyyyyyYyR",
      ".RRRRRRRRRR.",
      "..RRRRRRRR..",
      "...RRRRRR...",
      "....RRRR....",
      "............",
      "............"
    ],
    colors: { R: "#e0484d", y: "#ffe08a", Y: "#f0c050", E: "#ffffff", e: "#ffb030", k: "#2a4a2a", N: "#ffb0d0" }
  },
  {
    id: "dango",
    name: "さんしょくだんご",
    price: 220,
    genki: 15,
    gokigen: 18,
    favorite: false,
    line: "もちもち〜",
    sprite: [
      "....PPPP....",
      "...PpPPPP...",
      "...PPPPPP...",
      "....PPPP....",
      "....oooo....",
      "...oWwWWo...",
      "...oWWWWo...",
      "....oooo....",
      "....GGGG....",
      "...GgGGGG...",
      "...GGGGGG...",
      "....GGGG...."
    ],
    colors: { P: "#ffb0c8", p: "#ffffff", o: "#d8c0a8", W: "#fffaf0", w: "#ffffff", G: "#8ad08a", g: "#c8f0c8" }
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
