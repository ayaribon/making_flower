// 🗺️ ぼうけん（モンスター退治）の 行き先・行って帰ってくるまで（docs/dettyan/requirements.md の4章）
// げんき を使って出かけて、スライムと たたかう（手動 か オート）。バトルの計算は dettyan_battle.js
// 行き先を増やすときは PLACES に1つ足す。スライムは dettyan_battle.js の MONSTERS
// ここは「セーブの state をどう変えるか」だけを書く。保存は呼んだ側が store.update(...) の中で行う

import { FOODS } from "dettyan_foods"
import { GEAR } from "dettyan_gear"
import { MONSTERS, createBattle, rnd, applyLevelUps, expToNext, dettyanStats } from "dettyan_battle"

export { MONSTERS, expToNext, dettyanStats }

// 行き先ごとに落ちる そうび（あたま・からだ・て・せなか・あし が1つずつ）
const PARK_GEAR = ["stick", "jersey", "cap", "backpack", "sneakers"]
const FOREST_GEAR = ["harisen", "suit", "headphones", "cape", "loafers"]
const CAVE_GEAR = ["mic", "stage", "helmet", "guitar", "boots"]
const MOUNTAIN_GEAR = ["goldmic", "kira", "crown", "wings", "kirashoes"]

// 行き先。level：行けるレベル、genki：使う げんき、count：出てくるスライムの数 [少ない, 多い]
// monsters：出てくるスライム（後ろほど出にくい）、power：スライムの強さの倍率（おくほど強い）、drop：ごはんを持って帰る確率
// gear：落ちる そうび（dettyan_gear.js の id。1つ前の行き先のものも落ちる）、gearDrop：落ちる確率（持っていないものだけ落ちる）
// けしきの絵は dettyan_scenes.js（id ごと）。sky / ground は絵がないときの色
export const PLACES = [
  { id: "park",   name: "公園",   icon: "🌳", level: 1, genki: 15, power: 0.97, count: [2, 3], monsters: ["green", "green", "blue"], drop: 0.1, gear: PARK_GEAR, gearDrop: 0.2,
    sky: "#9fd6ff", ground: "#7cc46a", line: "#5aa24c" },
  { id: "forest", name: "森",     icon: "🌲", level: 3, genki: 25, power: 1.37, count: [3, 4], monsters: ["blue", "blue", "green", "purple"], drop: 0.2, gear: [...FOREST_GEAR, ...PARK_GEAR], gearDrop: 0.2,
    sky: "#5f8f6a", ground: "#3f6e3a", line: "#2f5a2c" },
  { id: "cave",   name: "どうくつ", icon: "🪨", level: 6, genki: 40, power: 1.47, count: [3, 5], monsters: ["purple", "purple", "blue", "red", "king"], drop: 0.3, gear: [...CAVE_GEAR, ...FOREST_GEAR], gearDrop: 0.2,
    sky: "#3a3440", ground: "#5a5260", line: "#46404c" },
  { id: "mountain", name: "山", icon: "🏔️", level: 10, genki: 60, power: 1.85, count: [3, 5], monsters: ["red", "red", "purple", "king"], drop: 0.4, gear: [...MOUNTAIN_GEAR, ...CAVE_GEAR], gearDrop: 0.2,
    sky: "#c9d8ec", ground: "#8a8a7a", line: "#6e6e60" }
]

// スライムのドット絵（12×10）。O：ふち、B：からだ、L：ひかり、E：目
export const SLIME_SPRITE = [
  "....OOOO....",
  "..OOBBBBOO..",
  ".OBLLBBBBBO.",
  ".OBLBBBBBBO.",
  "OBBBEBBEBBBO",
  "OBBBEBBEBBBO",
  "OBBBBBBBBBBO",
  "OBBBBBBBBBBO",
  ".OBBBBBBBBO.",
  "..OOOOOOOO.."
]

export function findPlace(id) {
  return PLACES.find((p) => p.id === id) || null
}

// 行けるかどうか。{ ok, reason：「level」|「genki」|「unknown」 }
export function canGo(s, id) {
  const place = findPlace(id)
  if (!place) return { ok: false, reason: "unknown" }
  if (s.dettyan.level < place.level) return { ok: false, reason: "level", place }
  if (s.stats.genki < place.genki) return { ok: false, reason: "genki", place }
  return { ok: true, place }
}

// 種から毎回同じ乱数を作る（同じ種なら同じ数がならぶ）
export function seededRandom(seed) {
  const b = { rng: seed >>> 0 }
  return () => rnd(b)
}

// 出かける：げんき を使って、バトルを はじめる。{ ok, reason, place, battle }
export function startAdventure(s, id, seed) {
  const check = canGo(s, id)
  if (!check.ok) return check
  const place = check.place
  s.stats.genki = Math.max(0, Math.round((s.stats.genki - place.genki) * 10) / 10)
  s.adventure.count += 1
  return { ok: true, place, battle: createBattle(s, place, seed) }
}

// スライムを たおした（takeTurn の { t: "down" }）：コインと経験値を もらう
export function grantKill(s, ev) {
  s.money += ev.coins
  s.dettyan.exp += ev.exp
}

// バトルが おわった：ごはん・そうび が落ちる・レベルが上がる
// 返すもの：{ drop（ごはんの id）, gear（そうびの id）, levelUps }
export function finishAdventure(s, b) {
  const place = findPlace(b.place)
  let drop = null
  let gear = null
  if (b.win) {
    s.adventure.wins += 1
    // ぜんぶ たおせたら、ときどき ごはんを持って帰る
    if (rnd(b) < place.drop) drop = FOODS[Math.floor(rnd(b) * FOODS.length)].id
  }
  // 1ぴきでも たおせたら、ときどき そうび が落ちる（まだ持っていないものだけ）
  const notOwned = (place.gear || []).filter((id) => !s.gear.owned[id] && GEAR.some((g) => g.id === id))
  if (b.beaten > 0 && notOwned.length && rnd(b) < place.gearDrop) gear = notOwned[Math.floor(rnd(b) * notOwned.length)]
  if (drop) s.items[drop] = (s.items[drop] || 0) + 1
  if (gear) s.gear.owned[gear] = true
  const levelUps = applyLevelUps(s)
  return { drop, gear, levelUps }
}

// スライムを描く（squash：0〜1。ぷよんとつぶれる）
export function drawSlime(g, monster, ox, oy, squash = 0) {
  const c = monster.colors
  const rows = SLIME_SPRITE.length
  const shrink = Math.round(squash * 2)
  for (let y = 0; y < rows; y++) {
    if (y < shrink) continue
    const row = SLIME_SPRITE[y]
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]
      if (ch === ".") continue
      g.fillStyle = ch === "E" ? "#1a1414" : c[ch]
      g.fillRect(ox + x, oy + y, 1, 1)
    }
  }
  if (monster.crown) {
    g.fillStyle = "#ffd84d"
    g.fillRect(ox + 4, oy - 2 + shrink, 4, 2)
    g.fillRect(ox + 4, oy - 3 + shrink, 1, 1)
    g.fillRect(ox + 7, oy - 3 + shrink, 1, 1)
    g.fillStyle = "#e0484d"
    g.fillRect(ox + 5, oy - 2 + shrink, 2, 1)
  }
}
