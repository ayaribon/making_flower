// 🗡️ ぶき・いしょう（モンスター退治でときどき落ちる。そうびすると強くなり、見た目も変わる）
// 増やすときは GEAR に1つ足して、落ちる行き先（dettyan_adventure.js の PLACES の gear）に id を書く
//
//   id     セーブに入る名前（あとから変えない）
//   slot   "weapon"（ぶき）| "outfit"（いしょう）
//   atk    こうげきが上がる量
//   hp     たいりょく（バトルの体力）が上がる量
//   ぶき   ：hand（手に持つ絵・"." は透明）と colors
//   いしょう：colors（Dettyan の色のうち J：ジャケット・j：えり・W：シャツ・P：ズボン を入れかえる）

export const GEAR = [
  { id: "stick", name: "木のぼう", slot: "weapon", atk: 2, hp: 0,
    hand: ["..w", ".w.", ".w.", "w..", "w.."], colors: { w: "#9a6a3a" } },
  { id: "harisen", name: "ハリセン", slot: "weapon", atk: 5, hp: 0,
    hand: ["www", "wfw", "www", ".h.", ".h."], colors: { w: "#fff6d6", f: "#e8d49a", h: "#c0392b" } },
  { id: "mic", name: "マイク", slot: "weapon", atk: 8, hp: 0,
    hand: [".m.", "mMm", ".m.", ".s.", ".s."], colors: { m: "#4a4a58", M: "#9aa0b0", s: "#2b2b35" } },
  { id: "goldmic", name: "金のマイク", slot: "weapon", atk: 13, hp: 0,
    hand: [".m.", "mMm", ".m.", ".s.", ".s."], colors: { m: "#b8860b", M: "#ffe066", s: "#8a6a10" } },

  { id: "jersey", name: "ジャージ", slot: "outfit", atk: 0, hp: 8,
    colors: { J: "#2f6fd0", j: "#1d4a96", W: "#ffffff", P: "#2f6fd0" } },
  { id: "suit", name: "スーツ", slot: "outfit", atk: 1, hp: 15,
    colors: { J: "#2b2b35", j: "#16161c", W: "#ffffff", P: "#2b2b35" } },
  { id: "stage", name: "ステージいしょう", slot: "outfit", atk: 2, hp: 25,
    colors: { J: "#ff5fa2", j: "#c23a7a", W: "#ffe066", P: "#3a2a6b" } },
  { id: "kira", name: "キラキラいしょう", slot: "outfit", atk: 4, hp: 40,
    colors: { J: "#f0f0ff", j: "#b0a0ff", W: "#ffd84d", P: "#7a5fd0" } }
]

export function findGear(id) {
  return GEAR.find((g) => g.id === id) || null
}

// そうびしているもの { weapon, outfit }（ないときは null）
export function equipped(s) {
  return { weapon: findGear(s.gear.weapon), outfit: findGear(s.gear.outfit) }
}

// そうびの強さの合計
export function gearBonus(s) {
  const { weapon, outfit } = equipped(s)
  return {
    atk: (weapon?.atk || 0) + (outfit?.atk || 0),
    hp: (weapon?.hp || 0) + (outfit?.hp || 0)
  }
}

// そうびする・はずす（同じものをもう一度えらぶと はずす）
export function toggleGear(s, id) {
  const gear = findGear(id)
  if (!gear || !s.gear.owned[id]) return { ok: false }
  const on = s.gear[gear.slot] !== id
  s.gear[gear.slot] = on ? id : null
  return { ok: true, gear, on }
}

// アイコン（12×12）を描く。ぶきは手に持つ絵を大きく、いしょうは服の形に色をぬる
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

export function drawGearIcon(g, gear, ox, oy) {
  if (gear.slot === "outfit") {
    OUTFIT_ICON.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = row[x]
        if (c === ".") continue
        g.fillStyle = gear.colors[c]
        g.fillRect(ox + x, oy + y, 1, 1)
      }
    })
  } else {
    drawHand(g, gear, ox + 3, oy + 1, 2)
  }
}

// 手に持つぶきを描く（scale 倍）
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
