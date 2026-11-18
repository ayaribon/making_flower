// 👤 アバターの 絵：Sprout Lands の 町に なじむ 2頭身（町と キャラメイク で 使う）。docs/town/requirements.md
// （前の 絵 avatar_sprite.js の drawAvatar は もう 画面では 使っていない。データの 形・パーツの 表 は avatar_sprite.js）
// - データは avatar_sprite.js と 同じ（normalizeAvatar）。保存してある キャラは そのまま この 絵で 描ける
// - 体は 16×20 ドット。頭は 大きく まるく、目は 小さい 点。色は パステル寄り
// - ふちは 黒ではなく、となりの 色を こくした 色（自動で つける）。右と 下に うすい かげ
// - 絵は オリジナル（Sprout Lands の 絵柄を 参考に した。ライセンスで ゆるされている）

import { normalizeAvatar } from "avatar_sprite"

export const CHIBI_W = 16
export const CHIBI_H = 20

// 色（avatar_sprite.js の 色の 表と 同じ ならび。保存してある 番号の まま 使える）
export const CHIBI_SKINS = ["#f7e0cf", "#f0c9a8", "#dba67f", "#b8825f", "#8a5e45"]
export const CHIBI_HAIRS = ["#4b3b55", "#8a5a44", "#c08552", "#eec170", "#f2a7b8", "#7f9bd9", "#a389d4", "#e6e2ea", "#d9685e"]
export const CHIBI_CLOTHS = ["#a8775a", "#e07a7a", "#f4a6c4", "#f2b880", "#f2df8c", "#8cc589", "#7fa7e0", "#5d6aa6", "#ab8bd6", "#5b5566", "#f6f1e7"]
const INK = "#4e3448" // いちばん こい 色（目・ふちの もと）

// ---- 色の 計算 ----
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function hex([r, g, b]) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")
}
function mix(a, b, t) {
  const [x, y] = [rgb(a), rgb(b)]
  return hex(x.map((v, i) => v + (y[i] - v) * t))
}
export const shadeOf = (c) => mix(c, INK, 0.22) // かげ
export const lineOf = (c) => mix(c, INK, 0.62) // ふち
export const lightOf = (c) => mix(c, "#ffffff", 0.35) // ひかり

// ---- 形（"." は 何もない） ----
// 体：S はだ・T うわぎ・W うちがわ（えり・シャツ）・P した・F くつ・E 目・c ほっぺ・m くち
const HEAD = [
  "................",
  "................",
  "................",
  ".....SSSSSS.....",
  "...SSSSSSSSSS...",
  "..SSSSSSSSSSSS..",
  "..SSSSSSSSSSSS..",
  "..SSSSSSSSSSSS..",
  "..SSSSSSSSSSSS..",
  "..SSSSSSSSSSSS..",
  "..ScSSSSSSSScS..",
  "...SSSSmmSSSS...",
  "....SSSSSSSS...."
]
const BODY = {
  jacket: [
    ".....TWWWWT.....",
    "....TTTWWTTT....",
    "...STTTWWTTTS...",
    "....TTTTTTTT...."
  ],
  tee: [
    ".....TTTTTT.....",
    "....TTTTTTTT....",
    "...STTTTTTTTS...",
    "....TTTTTTTT...."
  ],
  hoodie: [
    "....WWWWWWWW....",
    "....TTTWWTTT....",
    "...STTTTTTTTS...",
    "....TTWWWWTT...."
  ]
}
const LEGS = {
  pants: [
    [".....PP..PP.....", ".....PP..PP.....", "....FFF..FFF...."],
    [".....PP...PP....", "....PP....PP....", "....FFF...FFF..."] // あるく
  ],
  skirt: [
    ["...PPPPPPPPPP...", ".....SS..SS.....", "....FFF..FFF...."],
    ["...PPPPPPPPPP...", "....SS....SS....", "....FFF...FFF..."]
  ]
}
// 目（顔の 上に かさねる。y は 8 から。E 目・o ひかり）
const EYES = {
  dot: [".....E....E.....", ".....E....E....."],
  smile: [".....E....E.....", "....E.E..E.E...."],
  big: [".....oE..oE.....", ".....EE..EE....."],
  sharp: [".....EE..EE.....", "......E..E......"]
}

// かみ：front は 顔の 上、back は 体の うしろ（H かみ・h ひかり・r リボンなどの かざり）
const HAIR = {
  short: {
    front: [
      "................",
      "................",
      ".....HHHHHH.....",
      "...HHHhhHHHHH...",
      "..HHHhHHHHHHHH..",
      "..HHHHHHHHHHHH..",
      "..HHH.HHHH.HHH..",
      "..HH........HH..",
      "..H..........H.."
    ]
  },
  bun: {
    front: [
      "......HHHH......",
      ".....HhHHHH.....",
      ".....HHHHHH.....",
      "...HHHhhHHHHH...",
      "..HHHhHHHHHHHH..",
      "..HHHHHHHHHHHH..",
      "..HHHHH..HHHHH..",
      "..HH........HH..",
      "..H..........H.."
    ]
  },
  bob: {
    front: [
      "................",
      "................",
      ".....HHHHHH.....",
      "...HHHhhHHHHH...",
      "..HHHhHHHHHHHH..",
      ".HHHHHHHHHHHHHH.",
      ".HHHHHHHHHHHHHH.",
      ".HH..........HH.",
      ".HH..........HH.",
      ".HH..........HH.",
      ".HH..........HH.",
      ".HHH........HHH."
    ]
  },
  long: {
    front: [
      "................",
      "................",
      ".....HHHHHH.....",
      "...HHHhhHHHHH...",
      "..HHHhHHHHHHHH..",
      ".HHHHHHHHHHHHHH.",
      ".HHHH.HHHH.HHHH.",
      ".HH..........HH.",
      ".HH..........HH.",
      ".HH..........HH.",
      ".HH..........HH.",
      ".HH..........HH."
    ],
    back: [
      "................", "................", "................", "................", "................",
      ".HHHHHHHHHHHHHH.", ".HHHHHHHHHHHHHH.", ".HHHHHHHHHHHHHH.", ".HHHHHHHHHHHHHH.", ".HHHHHHHHHHHHHH.",
      ".HHHHHHHHHHHHHH.", ".HHHHHHHHHHHHHH.", ".HHHHHHHHHHHHHH.", ".HHHHHHHHHHHHHH.", ".HHHHHHHHHHHHHH.",
      "..HHHHHHHHHHHH..", "..HH.HH..HH.HH.."
    ]
  },
  twin: {
    front: [
      "................",
      "................",
      ".....HHHHHH.....",
      "...HHHhhHHHHH...",
      "..HHHhHHHHHHHH..",
      "..HHHHHHHHHHHH..",
      "..HHHHHHHHHHHH..",
      "..HH........HH..",
      "..H..........H.."
    ],
    back: [
      "................", "................", "................", "................",
      "rr............rr", "HH............HH", "HHH..........HHH", "HHH..........HHH", "HHH..........HHH",
      "HHH..........HHH", ".HH..........HH.", ".HH..........HH.", ".HH..........HH.", "..H..........H.."
    ]
  },
  pony: {
    front: [
      "................",
      "................",
      ".....HHHHHH.....",
      "...HHHhhHHHHH...",
      "..HHHhHHHHHHHH..",
      "..HHHHHHHHHHHH..",
      "..HHHH.HHHHHHH..",
      "..HH........HH..",
      "..H..........H.."
    ],
    back: [
      "................", "................", "................",
      "............rr..", ".............HH.", ".............HHH", ".............HHH", "..............HH",
      "..............HH", "..............HH", ".............HH.", "..............H."
    ]
  }
}

// こもの（A かざりの 色・a その ひかり・H かみの 色・i うちがわ）。y0 が 頭の いちばん 上（マイナスは 上に はみ出す）
const ACCS = {
  cap: { y: 1, colors: { A: "#e07a7a", a: "#f4a6a6", d: "#b85a66", w: "#f6f1e7" }, art: [
    ".....AAwwAA.....",
    "...AAaaAAAAAA...",
    "..AAaAAAAAAAAA..",
    "..dddddddddddd..",
    ".AAAAAAAAAAAAAA."
  ] },
  headphones: { y: 1, colors: { A: "#5d6aa6", a: "#9ab0e8" }, art: [
    "....AAAAAAAA....",
    "...A........A...",
    "..A..........A..",
    "..A..........A..",
    "..A..........A..",
    ".AA..........AA.",
    ".Aa..........aA.",
    ".AA..........AA."
  ] },
  ribbon: { y: 1, colors: { A: "#f28aa8", a: "#ffc6d6" }, art: [
    "..........A...A.",
    "..........AaAaA.",
    "...........AAA..",
    "..........A...A."
  ] },
  nekomimi: { y: 0, colors: { i: "#f4a6c4" }, art: [
    "...H........H...",
    "..HiH......HiH..",
    "..HHHH....HHHH.."
  ] },
  usamimi: { y: -4, colors: { A: "#f6f1e7", i: "#f4a6c4" }, art: [
    "....AA....AA....",
    "....Ai....Ai....",
    "....Ai....Ai....",
    "....Ai....Ai....",
    "....AA....AA....",
    "....AA....AA...."
  ] },
  hanakanmuri: { y: 2, colors: { A: "#f4a6c4", a: "#f2df8c", g: "#8cc589" }, art: [
    "...A..a..A..a...",
    "..gAggagAggaAg.."
  ] },
  crown: { y: -1, colors: { A: "#eec170", a: "#fff1b8", r: "#e07a7a" }, art: [
    ".....A.AA.A.....",
    ".....AArAAA.....",
    ".....AAAAaA....."
  ] }
}

// ---- 描く ----
function paletteOf(a) {
  const skin = CHIBI_SKINS[a.skin] || CHIBI_SKINS[0]
  const hair = CHIBI_HAIRS[a.hairColor] || CHIBI_HAIRS[0]
  const top = CHIBI_CLOTHS[a.topColor] || CHIBI_CLOTHS[6]
  const bottom = CHIBI_CLOTHS[a.bottomColor] || CHIBI_CLOTHS[9]
  const shoes = CHIBI_CLOTHS[a.shoes] || CHIBI_CLOTHS[9]
  const inner = a.top === "jacket" ? "#f6f1e7" : a.top === "hoodie" ? lightOf(top) : top
  return {
    S: skin, c: mix(skin, "#f28aa8", 0.45), m: shadeOf(shadeOf(skin)),
    T: top, W: inner, P: bottom, F: shoes, E: INK, o: "#ffffff",
    H: hair, h: lightOf(hair), r: "#f28aa8"
  }
}

// 1まいの 小さな 方眼に 色を おいてから、ふち と かげ を つけて、最後に まとめて 描く
class Grid {
  constructor() { this.cells = new Map() }
  key(x, y) { return `${x},${y}` }
  get(x, y) { return this.cells.get(this.key(x, y)) }
  set(x, y, c) { this.cells.set(this.key(x, y), c) }
  // art（文字の 表）を おく。colors：文字 → 色
  put(art, colors, dx = 0, dy = 0, { under = false } = {}) {
    art.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x]
        if (ch === "." || !colors[ch]) continue
        if (under && this.get(x + dx, y + dy)) continue
        this.set(x + dx, y + dy, colors[ch])
      }
    })
  }
}

// アバターを 描く（opts：{ frame：0|1（歩く）, blink, mood："smile" }）。ox, oy は 16×20 の 左上
export function drawChibi(g, ox, oy, raw, { frame = 0, blink = false, mood = null } = {}) {
  const a = normalizeAvatar(raw)
  const colors = paletteOf(a)
  const grid = new Grid()
  const style = HAIR[a.hair] || HAIR.short
  // うしろの かみ → 体 → 顔 → 目 → まえがみ → こもの
  if (style.back) grid.put(style.back, colors)
  const legs = LEGS[a.bottom] || LEGS.pants
  grid.put(legs[frame ? 1 : 0], colors, 0, 17)
  grid.put(BODY[a.top] || BODY.tee, colors, 0, 13)
  grid.put(HEAD, colors, 0, 0)
  const eyes = blink ? ["................", "....EE....EE...."] : EYES[mood === "smile" ? "smile" : a.eyes] || EYES.dot
  grid.put(eyes, colors, 0, 8)
  grid.put(style.front, colors, 0, 0)
  const acc = ACCS[a.acc]
  if (acc) grid.put(acc.art, { ...colors, ...acc.colors }, 0, acc.y)

  render(g, grid, ox, oy)
}

// かげ（右と 下の はし を 少し こく）と ふち（外がわ に となりの 色を こくした 色）を つけて 描く
function render(g, grid, ox, oy) {
  const filled = [...grid.cells.entries()].map(([k, c]) => { const [x, y] = k.split(",").map(Number); return { x, y, c } })
  const shade = []
  for (const p of filled) {
    if (p.c === INK || p.c === "#ffffff") continue
    if (!grid.get(p.x + 1, p.y) || !grid.get(p.x, p.y + 1)) shade.push(p)
  }
  for (const p of shade) grid.set(p.x, p.y, shadeOf(p.c))
  const lines = new Map()
  for (const p of filled) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = p.x + dx
      const ny = p.y + dy
      if (grid.get(nx, ny) || lines.has(`${nx},${ny}`)) continue
      lines.set(`${nx},${ny}`, p.c === INK ? INK : lineOf(p.c))
    }
  }
  for (const [k, c] of lines) {
    const [x, y] = k.split(",").map(Number)
    g.fillStyle = c
    g.fillRect(ox + x, oy + y, 1, 1)
  }
  for (const [k, c] of grid.cells) {
    const [x, y] = k.split(",").map(Number)
    g.fillStyle = c
    g.fillRect(ox + x, oy + y, 1, 1)
  }
}

// ==== シュッとした 絵柄（見本）：16×26。頭を 小さめ・体を 細く・足を 長く（3頭身くらい） ====
export const SLIM_W = 16
export const SLIM_H = 26

const SLIM = {
  head: [
    "................",
    "................",
    "......SSSS......",
    "....SSSSSSSS....",
    "...SSSSSSSSSS...",
    "...SSSSSSSSSS...",
    "...SSSSSSSSSS...",
    "...SSSSSSSSSS...",
    "...SSSSSSSSSS...",
    "...ScSSSSSScS...",
    "....SSSmmSSS....",
    ".....SSSSSS.....",
    ".......SS......."
  ],
  body: {
    jacket: [
      ".....TTWWTT.....",
      "....TTTWWTTT....",
      "....TTTWWTTT....",
      "....TTTWWTTT....",
      "....STTTTTTS....",
      ".....TTTTTT....."
    ],
    tee: [
      ".....TTTTTT.....",
      "....TTTTTTTT....",
      "....STTTTTTS....",
      "....STTTTTTS....",
      "....STTTTTTS....",
      ".....TTTTTT....."
    ],
    hoodie: [
      "....WWWWWWWW....",
      "....TTTWWTTT....",
      "....TTTTTTTT....",
      "....TTTTTTTT....",
      "....STWWWWTS....",
      ".....TTTTTT....."
    ]
  },
  legs: {
    pants: [
      [".....PPPPPP.....", ".....PP..PP.....", ".....PP..PP.....", ".....PP..PP.....", ".....PP..PP.....", ".....PP..PP.....", "....FFF..FFF...."],
      [".....PPPPPP.....", ".....PP..PP.....", ".....PP..PP.....", "....PP....PP....", "....PP....PP....", "....PP....PP....", "...FFF....FFF..."]
    ],
    skirt: [
      [".....PPPPPP.....", "....PPPPPPPP....", "....PPPPPPPP....", ".....SS..SS.....", ".....SS..SS.....", ".....SS..SS.....", "....FFF..FFF...."],
      [".....PPPPPP.....", "....PPPPPPPP....", "....PPPPPPPP....", ".....SS..SS.....", "....SS....SS....", "....SS....SS....", "...FFF....FFF..."]
    ]
  },
  eyes: {
    dot: [".....E....E.....", ".....E....E....."],
    smile: [".....E....E.....", "....E.E..E.E...."],
    big: [".....oE..oE.....", ".....EE..EE....."],
    sharp: [".....EE..EE.....", "......E..E......"]
  },
  blink: ["................", "....EE....EE...."],
  hair: {
    short: { front: [
      "................",
      "......HHHH......",
      "....HHHhhHHH....",
      "...HHhHHHHHHH...",
      "..HHHHHHHHHHHH..",
      "..HHH.HHHH.HHH..",
      "..HH........HH..",
      "..H..........H.."
    ] },
    bun: { front: [
      ".......HH.......",
      "......HhHH......",
      "....HHHHHHHH....",
      "...HHhHHHHHHH...",
      "..HHHHHHHHHHHH..",
      "..HHHH..HHHHHH..",
      "..HH........HH..",
      "..H..........H.."
    ] },
    bob: { front: [
      "................",
      "......HHHH......",
      "....HHHhhHHH....",
      "...HHhHHHHHHH...",
      "..HHHHHHHHHHHH..",
      "..HHHHHHHHHHHH..",
      "..HH........HH..",
      "..HH........HH..",
      "..HH........HH..",
      "..HH........HH..",
      "..HHH......HHH.."
    ] },
    long: {
      front: [
        "................",
        "......HHHH......",
        "....HHHhhHHH....",
        "...HHhHHHHHHH...",
        "..HHHHHHHHHHHH..",
        "..HHHH.HHH.HHH..",
        "..HH........HH..",
        "..HH........HH..",
        "..HH........HH..",
        "..HH........HH..",
        "..HH........HH..",
        "..HH........HH.."
      ],
      back: [
        "................", "................", "................", "................",
        "..HHHHHHHHHHHH..", "..HHHHHHHHHHHH..", "..HHHHHHHHHHHH..", "..HHHHHHHHHHHH..", "..HHHHHHHHHHHH..",
        "..HHHHHHHHHHHH..", "..HHHHHHHHHHHH..", "..HHHHHHHHHHHH..", "..HHHHHHHHHHHH..", "..HHHHHHHHHHHH..",
        "..HHHHHHHHHHHH..", "..HHHHHHHHHHHH..", "...HHHHHHHHHH...", "...HH.HH.HH.H.."
      ]
    },
    twin: {
      front: [
        "................",
        "......HHHH......",
        "....HHHhhHHH....",
        "...HHhHHHHHHH...",
        "..HHHHHHHHHHHH..",
        "..HHHHHHHHHHHH..",
        "..HH........HH..",
        "..H..........H.."
      ],
      back: [
        "................", "................", "................", "................",
        ".rr..........rr.", ".HH..........HH.", "HHH..........HHH", "HHH..........HHH", "HHH..........HHH",
        "HHH..........HHH", "HH............HH", "HH............HH", "HH............HH", "HH............HH",
        ".H............H.", ".H............H."
      ]
    },
    pony: {
      front: [
        "................",
        "......HHHH......",
        "....HHHhhHHH....",
        "...HHhHHHHHHH...",
        "..HHHHHHHHHHHH..",
        "..HHHH.HHHHHHH..",
        "..HH........HH..",
        "..H..........H.."
      ],
      back: [
        "................", "................", "................",
        "...........rr...", "............HH..", "............HHH.", ".............HHH", ".............HHH",
        ".............HH.", ".............HH.", ".............HH.", "............HH..", ".............H.."
      ]
    }
  },
  accs: {
    cap: { y: 0, colors: { A: "#e07a7a", a: "#f4a6a6", d: "#b85a66", w: "#f6f1e7" }, art: [
      "......AwwA......",
      "....AAaaAAAA....",
      "...AAaAAAAAAA...",
      "...dddddddddd...",
      "..AAAAAAAAAAAA.."
    ] },
    headphones: { y: 0, colors: { A: "#5d6aa6", a: "#9ab0e8" }, art: [
      ".....AAAAAA.....",
      "....A......A....",
      "...A........A...",
      "...A........A...",
      "...A........A...",
      "..AA........AA..",
      "..Aa........aA..",
      "..AA........AA.."
    ] },
    ribbon: { y: 0, colors: { A: "#f28aa8", a: "#ffc6d6" }, art: [
      "..........A...A.",
      "..........AaAaA.",
      "...........AAA..",
      "..........A...A."
    ] },
    nekomimi: { y: -1, colors: { i: "#f4a6c4" }, art: [
      "...H........H...",
      "..HiH......HiH..",
      "..HHHH....HHHH.."
    ] },
    usamimi: { y: -5, colors: { A: "#f6f1e7", i: "#f4a6c4" }, art: [
      ".....AA..AA.....",
      ".....Ai..Ai.....",
      ".....Ai..Ai.....",
      ".....Ai..Ai.....",
      ".....AA..AA.....",
      ".....AA..AA....."
    ] },
    hanakanmuri: { y: 1, colors: { A: "#f4a6c4", a: "#f2df8c", g: "#8cc589" }, art: [
      "....A..a..A.....",
      "...gAggagAggg..."
    ] },
    crown: { y: -2, colors: { A: "#eec170", a: "#fff1b8", r: "#e07a7a" }, art: [
      "......A.AA.A....",
      "......AArAAA....",
      "......AAAAaA...."
    ] }
  }
}

// シュッとした 絵柄で 描く（見本）。ox, oy は 16×26 の 左上
export function drawSlim(g, ox, oy, raw, { frame = 0, blink = false, mood = null } = {}) {
  const a = normalizeAvatar(raw)
  const colors = paletteOf(a)
  const grid = new Grid()
  const style = SLIM.hair[a.hair] || SLIM.hair.short
  if (style.back) grid.put(style.back, colors)
  const legs = SLIM.legs[a.bottom] || SLIM.legs.pants
  grid.put(legs[frame ? 1 : 0], colors, 0, 19)
  grid.put(SLIM.body[a.top] || SLIM.body.tee, colors, 0, 13)
  grid.put(SLIM.head, colors, 0, 0)
  const eyes = blink ? SLIM.blink : SLIM.eyes[mood === "smile" ? "smile" : a.eyes] || SLIM.eyes.dot
  grid.put(eyes, colors, 0, 7)
  grid.put(style.front, colors, 0, 0)
  const acc = SLIM.accs[a.acc]
  if (acc) grid.put(acc.art, { ...colors, ...acc.colors }, 0, acc.y)
  render(g, grid, ox, oy)
}

// ==== 頭の 大きい 絵柄（見本）：16×25。頭 15ドット（6割）・横に 広い 顔・目は 顔の 下の ほうで 大きく 色つき ====
// 2026-11-18 に ayaribon が 見せてくれた 参考の 絵の つりあい（2頭身・頭が 大きく 横に 広い）に あわせた。絵は オリジナル
export const CUTE_W = 16
export const CUTE_H = 25
const IRIS = "#5b7fc9" // 瞳の 色（見本では 青 に そろえる）

const CUTE = {
  face: [
    "................", "................", "................", "................", "................",
    "....SSSSSSSS....",
    "...SSSSSSSSSS...",
    "..SSSSSSSSSSSS..",
    "..SSSSSSSSSSSS..",
    "..SSSSSSSSSSSS..",
    ".SSSSSSSSSSSSSS.",
    ".SSSSSSSSSSSSSS.",
    "..SSSSSSSSSSSS..",
    "..ccSSSSSSSScc..",
    "....SSSmmSSS...."
  ],
  body: {
    jacket: [
      "....TTTWWTTT....",
      "...TTTTWWTTTT...",
      "...TTTTWWTTTT...",
      "..STTTTWWTTTTS..",
      "..STTTTTTTTTTS..",
      "...TTTTTTTTTT..."
    ],
    tee: [
      "....TTTTTTTT....",
      "...TTTTTTTTTT...",
      "..SSTTTTTTTTSS..",
      "..STTTTTTTTTTS..",
      "..STTTTTTTTTTS..",
      "...TTTTTTTTTT..."
    ],
    hoodie: [
      "...WWWWWWWWWW...",
      "...TTTTWWTTTT...",
      "...TTTTTTTTTT...",
      "..STTTTTTTTTTS..",
      "..STTWWWWWWTTS..",
      "...TTTTTTTTTT..."
    ]
  },
  legs: {
    pants: [
      ["....PPPPPPPP....", ".....PP..PP.....", ".....PP..PP.....", "....FFF..FFF...."],
      ["....PPPPPPPP....", "....PP....PP....", "....PP....PP....", "...FFF....FFF..."]
    ],
    skirt: [
      ["..PPPPPPPPPPPP..", ".....SS..SS.....", ".....SS..SS.....", "....FFF..FFF...."],
      ["..PPPPPPPPPPPP..", "....SS....SS....", "....SS....SS....", "...FFF....FFF..."]
    ]
  },
  // 目（y 9 から 4だん。E まつげ・I 瞳の 上（こい）・J 瞳の まんなか・L 瞳の 下（明るい）・o ひかり・w 小さい ひかり）
  eyes: {
    dot: ["...EEE....EEE...", "....oI....oI....", "....JJ....JJ....", "....Lw....Lw...."],
    smile: ["................", "....EE....EE....", "...E..E..E..E...", "................"],
    big: ["..EEEE....EEEE..", "...oII....oII...", "...JJJ....JJJ...", "...LwL....LwL..."],
    sharp: ["...EEE....EEE...", "....oI....oI....", "....JJ....JJ....", "................"]
  },
  blink: ["................", "................", "...EEE....EEE...", "................"],
  hair: {
    short: { front: [
      "....HHHHHHHH....",
      "..HHHHhhHHHHHH..",
      ".HHHhHHHHHHHHHH.",
      ".HHhHHHHHHHHHHH.",
      "HHHHHHHHHHHHHHHH",
      "HHHHHHHHHHHHHHHH",
      "HHHHHHH..HHHHHHH",
      "HHH.HH....HH.HHH",
      "HH............HH",
      "H..............H"
    ] },
    bun: { front: [
      "....HHHHHHHH....",
      "..HHHHhhHHHHHH..",
      ".HHHhHHHHHHHHHH.",
      ".HHhHHHHHHHHHHH.",
      "HHHHHHHHHHHHHHHH",
      "HHHHHHHHHHHHHHHH",
      "HHHHHH....HHHHHH",
      "HHHH........HHHH",
      "HH............HH",
      "H..............H"
    ], top: ["......HHHH......", ".....HhHHHH.....", ".....HHHHHH....."] },
    bob: { front: [
      "....HHHHHHHH....",
      "..HHHHhhHHHHHH..",
      ".HHHhHHHHHHHHHH.",
      ".HHhHHHHHHHHHHH.",
      "HHHHHHHHHHHHHHHH",
      "HHHHHHHHHHHHHHHH",
      "HHHHHHH..HHHHHHH",
      "HHHHH......HHHHH",
      "HHH..........HHH",
      "HHH..........HHH",
      "HHH..........HHH",
      "HHH..........HHH",
      "HHH..........HHH",
      "HHHH........HHHH",
      "HHHH........HHHH"
    ] },
    long: {
      front: [
        "....HHHHHHHH....",
        "..HHHHhhHHHHHH..",
        ".HHHhHHHHHHHHHH.",
        ".HHhHHHHHHHHHHH.",
        "HHHHHHHHHHHHHHHH",
        "HHHHHHHHHHHHHHHH",
        "HHHHHH.HH.HHHHHH",
        "HHHH........HHHH",
        "HHH..........HHH",
        "HHH..........HHH",
        "HHH..........HHH",
        "HHH..........HHH",
        "HHH..........HHH",
        "HHH..........HHH",
        "HHH..........HHH"
      ],
      back: [
        "................", "................", "................", "................",
        "HHHHHHHHHHHHHHHH", "HHHHHHHHHHHHHHHH", "HHHHHHHHHHHHHHHH", "HHHHHHHHHHHHHHHH", "HHHHHHHHHHHHHHHH",
        "HHHHHHHHHHHHHHHH", "HHHHHHHHHHHHHHHH", "HHHHHHHHHHHHHHHH", "HHHHHHHHHHHHHHHH", "HHHHHHHHHHHHHHHH",
        "HHHHHHHHHHHHHHHH", "HHHHHHHHHHHHHHHH", ".HHHHHHHHHHHHHH.", ".HHHHHHHHHHHHHH.", ".HHHHHHHHHHHHHH.",
        "..HH.HHHHHH.HH.."
      ]
    },
    twin: {
      front: [
        "....HHHHHHHH....",
        "..HHHHhhHHHHHH..",
        ".HHHhHHHHHHHHHH.",
        ".HHhHHHHHHHHHHH.",
        "HHHHHHHHHHHHHHHH",
        "HHHHHHHHHHHHHHHH",
        "HHHHHHH..HHHHHHH",
        "HHHHH......HHHHH",
        "HHH..........HHH",
        "HH............HH"
      ],
      // ツインテールは 顔の 外がわ（x -2〜-1 と 16〜17）。dx -2 で おく
      back: [
        "....................", "....................", "....................",
        "rr................rr", "HHH..............HHH", "HHH..............HHH", "HHHH............HHHH",
        "HHHH............HHHH", "HHHH............HHHH", "HHHH............HHHH", "HHH..............HHH",
        "HHH..............HHH", "HHH..............HHH", "HH................HH", ".H................H."
      ],
      backDx: -2
    },
    pony: {
      front: [
        "....HHHHHHHH....",
        "..HHHHhhHHHHHH..",
        ".HHHhHHHHHHHHHH.",
        ".HHhHHHHHHHHHHH.",
        "HHHHHHHHHHHHHHHH",
        "HHHHHHHHHHHHHHHH",
        "HHHHHHH..HHHHHHH",
        "HHHH.......HHHHH",
        "HH...........HHH",
        "H.............HH"
      ],
      back: [
        "..................", "..................", "..............rr..", "..............HHH.",
        "...............HHH", "...............HHH", "...............HHH", "...............HHH",
        "................HH", "................HH", "...............HH.", "................H."
      ]
    }
  },
  accs: {
    cap: { y: -1, colors: { A: "#e07a7a", a: "#f4a6a6", d: "#b85a66", w: "#f6f1e7" }, art: [
      ".....AAwwAA.....",
      "....AAaaAAAA....",
      "...AAaAAAAAAA...",
      "..AAAAAAAAAAAA..",
      "..dddddddddddd..",
      ".AAAAAAAAAAAAAA."
    ] },
    headphones: { y: -1, colors: { A: "#5d6aa6", a: "#9ab0e8" }, art: [
      "...AAAAAAAAAA...",
      "..A..........A..",
      ".A............A.",
      ".A............A.",
      ".A............A.",
      ".A............A.",
      ".A............A.",
      "AAA..........AAA",
      "AaA..........AaA",
      "AAA..........AAA"
    ] },
    ribbon: { y: -1, colors: { A: "#f28aa8", a: "#ffc6d6" }, art: [
      "..........A...A.",
      "..........AaAaA.",
      "...........AAA..",
      "..........A...A."
    ] },
    nekomimi: { y: -2, colors: { i: "#f4a6c4" }, art: [
      ".HH..........HH.",
      ".HiH........HiH.",
      ".HiiH......HiiH."
    ] },
    usamimi: { y: -6, colors: { A: "#f6f1e7", i: "#f4a6c4" }, art: [
      "....AA....AA....",
      "....Ai....Ai....",
      "....Ai....Ai....",
      "....Ai....Ai....",
      "....AA....AA....",
      "....AA....AA....",
      "....AA....AA...."
    ] },
    hanakanmuri: { y: 0, colors: { A: "#f4a6c4", a: "#f2df8c", g: "#8cc589" }, art: [
      "..A..a..A..a..A.",
      ".gAggagAggaggAg."
    ] },
    crown: { y: -3, colors: { A: "#eec170", a: "#fff1b8", r: "#e07a7a" }, art: [
      ".....A.AA.A.....",
      ".....AArrAA.....",
      ".....AAAAaA....."
    ] }
  }
}

// 頭の 大きい 絵柄で 描く（見本）。ox, oy は 16×25 の 左上
export function drawCute(g, ox, oy, raw, { frame = 0, blink = false, mood = null } = {}) {
  const a = normalizeAvatar(raw)
  const colors = { ...paletteOf(a), I: mix(IRIS, INK, 0.35), J: IRIS, L: lightOf(IRIS), w: "#e8f2ff", i: shadeOf(IRIS) }
  const grid = new Grid()
  const style = CUTE.hair[a.hair] || CUTE.hair.short
  if (style.back) grid.put(style.back, colors, style.backDx || 0, 0)
  const legs = CUTE.legs[a.bottom] || CUTE.legs.pants
  grid.put(legs[frame ? 1 : 0], colors, 0, 21)
  grid.put(CUTE.body[a.top] || CUTE.body.tee, colors, 0, 15)
  grid.put(CUTE.face, colors, 0, 0)
  const eyes = blink ? CUTE.blink : CUTE.eyes[mood === "smile" ? "smile" : a.eyes] || CUTE.eyes.dot
  grid.put(eyes, colors, 0, 10)
  if (style.top) grid.put(style.top, colors, 0, -3)
  grid.put(style.front, colors, 0, 0)
  // 天使の わ（頭の まるみに そった つや）
  for (let x = 3; x <= 12; x++) {
    const y = x < 6 || x > 9 ? 3 : 2
    if (x % 3 !== 0 && (grid.get(x, y) === colors.H)) grid.set(x, y, colors.h)
  }
  // まえがみ の 下の はし（顔との さかい）は こく して、髪と 顔を わける
  for (const [k, c] of [...grid.cells]) {
    if (c !== colors.H && c !== colors.h) continue
    const [x, y] = k.split(",").map(Number)
    if (grid.get(x, y + 1) === colors.S) grid.set(x, y, lineOf(colors.H))
  }
  const acc = CUTE.accs[a.acc]
  if (acc) grid.put(acc.art, { ...colors, ...acc.colors }, 0, acc.y)
  render(g, grid, ox, oy)
}
