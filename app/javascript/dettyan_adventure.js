// ⚔️ モンスター退治（docs/dettyan/requirements.md の4章）
// げんき を使って、その場で行って帰ってくる。バトルは自動で、結果を再生して見せる
// 行き先・スライムを増やすときは、PLACES / MONSTERS に1つ足すだけ
// ここは「セーブの state をどう変えるか」だけを書く。保存は呼んだ側が store.update(...) の中で行う

import { FOODS } from "dettyan_foods"
import { GEAR, gearBonus } from "dettyan_gear"
import { maxGenki } from "dettyan_care"

// スライム。hp：体力、atk：こうげき、coins / exp：1ぴきたおすともらえる量
// 絵はみんな同じ形（SLIME_SPRITE）で、色だけちがう
export const MONSTERS = {
  green:  { name: "みどりスライム", hp: 8,  atk: 2,  coins: 2, exp: 3,  colors: { O: "#1f5a2a", B: "#5cc46a", L: "#a6eaa0" } },
  blue:   { name: "あおスライム",   hp: 16, atk: 7,  coins: 4, exp: 6,  colors: { O: "#1d3d7a", B: "#4f8fe8", L: "#a9cdff" } },
  purple: { name: "むらさきスライム", hp: 26, atk: 9,  coins: 6, exp: 10, colors: { O: "#4a2369", B: "#9b5fd0", L: "#d6b3f2" } },
  red:    { name: "あかスライム",   hp: 40, atk: 13, coins: 9, exp: 16, colors: { O: "#6a1a1a", B: "#e0484d", L: "#ffb0a8" } },
  king:   { name: "キングスライム", hp: 60, atk: 15, coins: 15, exp: 25, colors: { O: "#6b4a00", B: "#f0b52a", L: "#ffe38a" }, crown: true }
}

// 行き先ごとに落ちる そうび（あたま・からだ・て・せなか・あし が1つずつ）
const PARK_GEAR = ["stick", "jersey", "cap", "backpack", "sneakers"]
const FOREST_GEAR = ["harisen", "suit", "headphones", "cape", "loafers"]
const CAVE_GEAR = ["mic", "stage", "helmet", "guitar", "boots"]
const MOUNTAIN_GEAR = ["goldmic", "kira", "crown", "wings", "kirashoes"]

// 行き先。level：行けるレベル、genki：使う げんき、count：出てくるスライムの数 [少ない, 多い]
// monsters：出てくるスライム（後ろほど出にくい）、drop：ごはんを持って帰る確率
// gear：落ちる そうび（dettyan_gear.js の id。1つ前の行き先のものも落ちる）、gearDrop：落ちる確率（持っていないものだけ落ちる）
// けしきの絵は dettyan_scenes.js（id ごと）。sky / ground は絵がないときの色
export const PLACES = [
  { id: "park",   name: "公園",   icon: "🌳", level: 1, genki: 15, count: [2, 3], monsters: ["green", "green", "blue"], drop: 0.1, gear: PARK_GEAR, gearDrop: 0.2,
    sky: "#9fd6ff", ground: "#7cc46a", line: "#5aa24c" },
  { id: "forest", name: "森",     icon: "🌲", level: 3, genki: 25, count: [3, 4], monsters: ["blue", "blue", "green", "purple"], drop: 0.2, gear: [...FOREST_GEAR, ...PARK_GEAR], gearDrop: 0.2,
    sky: "#5f8f6a", ground: "#3f6e3a", line: "#2f5a2c" },
  { id: "cave",   name: "どうくつ", icon: "🪨", level: 6, genki: 40, count: [3, 5], monsters: ["purple", "purple", "blue", "red", "king"], drop: 0.3, gear: [...CAVE_GEAR, ...FOREST_GEAR], gearDrop: 0.2,
    sky: "#3a3440", ground: "#5a5260", line: "#46404c" },
  { id: "mountain", name: "山", icon: "🏔️", level: 10, genki: 60, count: [4, 6], monsters: ["red", "red", "purple", "king"], drop: 0.4, gear: [...MOUNTAIN_GEAR, ...CAVE_GEAR], gearDrop: 0.2,
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

// 次のレベルまでの経験値
export function expToNext(level) {
  return 10 + (level - 1) * 8
}

// Dettyan の強さ（レベルとそうびで上がる。ごきげんが高いと少し強い）
export function dettyanPower(s) {
  const level = s.dettyan.level
  const bonus = gearBonus(s)
  const mood = s.stats.gokigen >= 70 ? 1.15 : s.stats.gokigen < 30 ? 0.9 : 1
  return {
    hp: 20 + level * 6 + bonus.hp,
    atk: Math.round((3 + level * 2 + bonus.atk) * mood * 10) / 10,
    crit: s.stats.gokigen >= 70 ? 0.2 : 0.1
  }
}

// 行けるかどうか。{ ok, reason：「level」|「genki」|「unknown」 }
export function canGo(s, id) {
  const place = findPlace(id)
  if (!place) return { ok: false, reason: "unknown" }
  if (s.dettyan.level < place.level) return { ok: false, reason: "level", place }
  if (s.stats.genki < place.genki) return { ok: false, reason: "genki", place }
  return { ok: true, place }
}

// 種から毎回同じ乱数を作る（同じ種なら同じバトルになる）
export function seededRandom(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// バトルを計算する（state は変えない）。返すもの：
//   { place, win, foes: [monster id], rounds: [{ foe, who:"me"|"foe", dmg, crit, foeHp, myHp, down }], coins, exp, drop }
export function simulate(s, place, seed) {
  const rand = seededRandom(seed)
  const me = dettyanPower(s)
  const n = place.count[0] + Math.floor(rand() * (place.count[1] - place.count[0] + 1))
  const foes = []
  for (let i = 0; i < n; i++) {
    // 後ろのスライムほど出にくい
    const r = rand()
    const idx = Math.min(place.monsters.length - 1, Math.floor(r * r * place.monsters.length))
    foes.push(place.monsters[idx])
  }

  let myHp = me.hp
  let coins = 0
  let exp = 0
  let beaten = 0
  const rounds = []
  for (let i = 0; i < foes.length && myHp > 0; i++) {
    const m = MONSTERS[foes[i]]
    let foeHp = m.hp
    for (let turn = 0; turn < 20 && foeHp > 0 && myHp > 0; turn++) {
      const crit = rand() < me.crit
      const dmg = Math.max(1, Math.round(me.atk * (0.8 + rand() * 0.4) * (crit ? 2 : 1)))
      foeHp = Math.max(0, foeHp - dmg)
      rounds.push({ foe: i, who: "me", dmg, crit, foeHp, myHp, down: foeHp === 0 })
      if (foeHp === 0) break
      const hit = Math.max(1, Math.round(m.atk * (0.7 + rand() * 0.6)))
      myHp = Math.max(0, myHp - hit)
      rounds.push({ foe: i, who: "foe", dmg: hit, crit: false, foeHp, myHp, down: myHp === 0 })
    }
    if (foeHp === 0) {
      beaten += 1
      coins += m.coins
      exp += m.exp
    }
  }
  const win = beaten === foes.length
  // ぜんぶ たおせたら、ときどき ごはんを持って帰る
  let drop = null
  if (win && rand() < place.drop) drop = FOODS[Math.floor(rand() * FOODS.length)].id
  // たたかうと、ときどき ぶき・いしょう が落ちる（まだ持っていないものだけ）
  let gear = null
  const notOwned = (place.gear || []).filter((id) => !s.gear.owned[id] && GEAR.some((g) => g.id === id))
  if (beaten > 0 && notOwned.length && rand() < place.gearDrop) gear = notOwned[Math.floor(rand() * notOwned.length)]
  // まけても、がんばった分の経験値は少しもらえる
  if (!win) exp = Math.max(1, Math.floor(exp / 2) + 1)
  return { place: place.id, win, foes, beaten, rounds, coins, exp, drop, gear, maxHp: me.hp }
}

// 行って帰ってくる：げんき を使い、バトルを計算して、もらったものを state に入れる
// 返すもの：{ ok, reason, battle, levelUps（上がったレベルの数）, level（今のレベル）}
// レベルが上がると、強さと げんき の上限（たいりょくポイント）が増える
export function goAdventure(s, id, seed) {
  const check = canGo(s, id)
  if (!check.ok) return check
  const place = check.place
  const battle = simulate(s, place, seed)
  s.stats.genki = Math.max(0, Math.round((s.stats.genki - place.genki) * 10) / 10)
  s.money += battle.coins
  if (battle.drop) s.items[battle.drop] = (s.items[battle.drop] || 0) + 1
  if (battle.gear) s.gear.owned[battle.gear] = true
  s.dettyan.exp += battle.exp
  let levelUps = 0
  while (s.dettyan.exp >= expToNext(s.dettyan.level)) {
    s.dettyan.exp -= expToNext(s.dettyan.level)
    s.dettyan.level += 1
    levelUps += 1
  }
  s.adventure.count += 1
  if (battle.win) s.adventure.wins += 1
  return { ok: true, place, battle, levelUps, level: s.dettyan.level }
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
