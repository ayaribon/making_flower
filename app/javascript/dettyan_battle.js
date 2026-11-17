// ⚔️ ぼうけん の バトル（手動・オート）と、ステータス・職業・スキル（docs/dettyan/requirements.md の4章）
// - ここは計算だけ（画面・音は さわらない）。同じ種（seed）と同じ行動なら、いつも同じ結果になる
// - バトルの中身（b）は ただのデータ。takeTurn(b, 行動) で1ターン進めて、起きたこと（events）を返す
// - セーブ（s）を変える関数は「s を どう変えるか」だけ。保存は呼んだ側が store.update(...) の中で行う
// 数字を変えるときは、test/javascript/dettyan_battle_test.mjs の勝率のテストも見る

import { gearBonus } from "dettyan_gear"

// ---- ステータス ----
//   per：1ポイントで上がる量
export const STATS = [
  { id: "hp", name: "たいりょく", short: "HP", per: 4, desc: "0 になると まけ" },
  { id: "atk", name: "こうげき", short: "こうげき", per: 1, desc: "こうげき・せんし の わざ が強くなる" },
  { id: "def", name: "まもり", short: "まもり", per: 1, desc: "うける ダメージ が へる" },
  { id: "mag", name: "まほう", short: "まほう", per: 1, desc: "まほう・うた が強くなる・MP がふえる" },
  { id: "spd", name: "すばやさ", short: "すばやさ", per: 1, desc: "先に動ける・かいしん が出やすい" }
]
export const POINTS_PER_LEVEL = 3 // レベルが1つ上がるごとに ふりわけられるポイント
const BASE = { hp: 24, atk: 4, def: 2, mag: 2, spd: 3 } // レベル1・職業・ポイント・そうび なしの強さ

export function expToNext(level) {
  return 10 + (level - 1) * 8
}

// ---- 職業 ----
// さいしょは みんな「みならい」。レベル JOB_CHANGE_LEVEL に なると ジョブチェンジ できる（そのあとは いつでも ただで かえられる）
//   tier：0＝みならい、1＝ジョブチェンジで なれる職業
//   grow：レベルが1つ上がるごとに上がる量（小数は たして切りすて）
//   auto：「おまかせ」で ポイントを ふる わりあい、mpRegen：毎ターン もどる MP
export const JOB_CHANGE_LEVEL = 5
export const JOBS = [
  { id: "novice", name: "みならい", icon: "🔰", tier: 0, desc: "なんでも すこしずつ のびる。Lv" + JOB_CHANGE_LEVEL + " で ジョブチェンジ できる",
    grow: { hp: 4.6, atk: 1.3, def: 0.9, mag: 0.8, spd: 0.7 }, auto: { hp: 2, atk: 2, def: 1, mag: 1, spd: 1 }, mpRegen: 1 },
  { id: "warrior", name: "せんし", icon: "⚔️", tier: 1, desc: "たいりょく と こうげき が のびる。わざ で ガツンと たたく",
    grow: { hp: 5.5, atk: 1.7, def: 1.2, mag: 0.3, spd: 0.6 }, auto: { hp: 2, atk: 3, def: 1, mag: 0, spd: 1 }, mpRegen: 1 },
  { id: "mage", name: "まほうつかい", icon: "🔮", tier: 1, desc: "まほう が のびる。ファイア・サンダー で 大ダメージ",
    grow: { hp: 3.6, atk: 0.7, def: 0.7, mag: 1.8, spd: 0.8 }, auto: { hp: 3, atk: 0, def: 1, mag: 3, spd: 0 }, mpRegen: 1 },
  { id: "singer", name: "うたうたい", icon: "🎤", tier: 1, desc: "うた で 回復・おうえん。バランスよく のびる",
    grow: { hp: 4, atk: 1.2, def: 0.8, mag: 1.5, spd: 0.8 }, auto: { hp: 3, atk: 1, def: 1, mag: 2, spd: 1 }, mpRegen: 1 }
]

export function findJob(id) {
  return JOBS.find((j) => j.id === id) || JOBS[0]
}

// ---- スキル（わざ・まほう・うた） ----
//   job / level：おぼえる職業とレベル、mp：つかう MP
//   type："phys"（こうげき × power × hits）| "magic"（まほう × power）| "heal"（まほう × power ＋ flat 回復）| "buff"（自分の stat を mult 倍・turns ターン）
//   debuff：あいての stat を さげる、stun：あいてが1回 休む かくりつ、drain：あたえたダメージの わりあい 回復
export const SKILLS = [
  { id: "punch", job: "novice", level: 1, name: "がんばりパンチ", icon: "👊", mp: 3, type: "phys", power: 1.6, desc: "こうげき の 1.6ばい" },
  { id: "rest", job: "novice", level: 3, name: "ひとやすみ", icon: "🍵", mp: 4, type: "heal", power: 1.5, flat: 8, desc: "HP を すこし 回復" },

  { id: "smash", job: "warrior", level: 1, name: "つよいいちげき", icon: "💥", mp: 3, type: "phys", power: 1.8, desc: "こうげき の 1.8ばい" },
  { id: "guardup", job: "warrior", level: 3, name: "てっぺきのかまえ", icon: "🛡️", mp: 4, type: "buff", stat: "def", mult: 1.8, turns: 3, desc: "3ターン まもり が 1.8ばい" },
  { id: "double", job: "warrior", level: 6, name: "れんぞくぎり", icon: "⚔️", mp: 6, type: "phys", power: 1.2, hits: 2, desc: "2回 きる" },
  { id: "giga", job: "warrior", level: 10, name: "ギガスラッシュ", icon: "🌟", mp: 10, type: "phys", power: 2.6, desc: "こうげき の 2.6ばい" },

  { id: "fire", job: "mage", level: 1, name: "ファイア", icon: "🔥", mp: 3, type: "magic", power: 1.7, desc: "ほのお の まほう" },
  { id: "heal", job: "mage", level: 3, name: "ヒール", icon: "💚", mp: 5, type: "heal", power: 1.6, flat: 6, desc: "HP を 回復" },
  { id: "ice", job: "mage", level: 5, name: "アイス", icon: "🧊", mp: 5, type: "magic", power: 1.4, debuff: { stat: "atk", mult: 0.7, turns: 3 }, desc: "こおらせて あいての こうげき を さげる" },
  { id: "thunder", job: "mage", level: 8, name: "サンダー", icon: "⚡", mp: 7, type: "magic", power: 2.4, desc: "かみなり の 大まほう" },

  { id: "healsong", job: "singer", level: 1, name: "いやしのうた", icon: "🎶", mp: 4, type: "heal", power: 2.2, flat: 10, desc: "HP を 回復" },
  { id: "cheer", job: "singer", level: 3, name: "エールのうた", icon: "📣", mp: 4, type: "buff", stat: "atk", mult: 1.5, turns: 3, desc: "3ターン こうげき が 1.5ばい" },
  { id: "hightone", job: "singer", level: 5, name: "ハイトーンボイス", icon: "🎤", mp: 6, type: "magic", power: 2.1, stun: 0.35, desc: "ときどき あいてが しびれて 休む" },
  { id: "encore", job: "singer", level: 8, name: "アンコール", icon: "✨", mp: 8, type: "magic", power: 2.3, drain: 0.5, desc: "ダメージ の 半分 回復" }
]

export function findSkill(id) {
  return SKILLS.find((k) => k.id === id) || null
}

// いまの職業で おぼえている スキル（レベルの低い順）
export function learnedSkills(s) {
  const job = findJob(s.dettyan.job)
  return SKILLS.filter((k) => k.job === job.id && k.level <= s.dettyan.level).sort((a, b) => a.level - b.level)
}

// ---- スライム ----
//   hp・atk・def・spd：強さ、coins / exp：1ぴき たおすと もらえる量
//   special：every ターンごとに 大わざ（mult 倍）。絵は dettyan_adventure.js の SLIME_SPRITE（色だけちがう）
export const MONSTERS = {
  green:  { name: "みどりスライム", hp: 10, atk: 4, def: 0, spd: 2, coins: 2, exp: 3, colors: { O: "#1f5a2a", B: "#5cc46a", L: "#a6eaa0" } },
  blue:   { name: "あおスライム", hp: 18, atk: 7, def: 1, spd: 3, coins: 4, exp: 6, colors: { O: "#1d3d7a", B: "#4f8fe8", L: "#a9cdff" } },
  purple: { name: "むらさきスライム", hp: 30, atk: 10, def: 3, spd: 5, coins: 6, exp: 10, colors: { O: "#4a2369", B: "#9b5fd0", L: "#d6b3f2" } },
  red:    { name: "あかスライム", hp: 44, atk: 14, def: 5, spd: 6, coins: 9, exp: 16, colors: { O: "#6a1a1a", B: "#e0484d", L: "#ffb0a8" },
    special: { name: "ほのおの たいあたり", every: 3, mult: 1.5 } },
  king:   { name: "キングスライム", hp: 70, atk: 16, def: 6, spd: 3, coins: 18, exp: 30, colors: { O: "#6b4a00", B: "#f0b52a", L: "#ffe38a" }, crown: true,
    special: { name: "のしかかり", every: 3, mult: 1.7 } }
}

// ---- 強さ（レベル・職業・ふりわけ・そうび） ----
// 返すもの：{ hp, atk, def, mag, spd, mp, parts: { level, alloc, gear } }（parts は画面の内わけ用）
export function dettyanStats(s) {
  const lv = Math.max(1, s.dettyan.level || 1)
  const job = findJob(s.dettyan.job)
  const alloc = s.dettyan.alloc || {}
  const gear = gearBonus(s)
  const out = { parts: { level: {}, alloc: {}, gear: {} } }
  for (const st of STATS) {
    const base = BASE[st.id] + Math.floor(job.grow[st.id] * (lv - 1) + 1e-9)
    const pts = (alloc[st.id] || 0) * st.per
    const g = gear[st.id] || 0
    out[st.id] = base + pts + g
    out.parts.level[st.id] = base
    out.parts.alloc[st.id] = pts
    out.parts.gear[st.id] = g
  }
  out.mp = 5 + lv + out.mag
  return out
}

// ---- ポイントの ふりわけ ----
function allocOf(s) {
  if (!s.dettyan.alloc) s.dettyan.alloc = {}
  for (const st of STATS) s.dettyan.alloc[st.id] = s.dettyan.alloc[st.id] || 0
  return s.dettyan.alloc
}

export function addPoint(s, id) {
  if (!STATS.some((st) => st.id === id) || !(s.dettyan.points > 0)) return false
  allocOf(s)[id] += 1
  s.dettyan.points -= 1
  return true
}

export function removePoint(s, id) {
  const alloc = allocOf(s)
  if (!(alloc[id] > 0)) return false
  alloc[id] -= 1
  s.dettyan.points = (s.dettyan.points || 0) + 1
  return true
}

// ふりなおし：ふったポイントを ぜんぶ もどす（何度でも ただ）
export function resetPoints(s) {
  const alloc = allocOf(s)
  let back = 0
  for (const st of STATS) {
    back += alloc[st.id]
    alloc[st.id] = 0
  }
  s.dettyan.points = (s.dettyan.points || 0) + back
  return back
}

// おまかせ：のこりのポイントを、職業の わりあい（JOBS の auto）に ちかくなるように ふる
export function autoAllocate(s) {
  const alloc = allocOf(s)
  const w = findJob(s.dettyan.job).auto
  const sumW = STATS.reduce((a, st) => a + (w[st.id] || 0), 0)
  let n = 0
  while (s.dettyan.points > 0) {
    const total = STATS.reduce((a, st) => a + alloc[st.id], 0) + 1
    let best = null
    let bestGap = -Infinity
    for (const st of STATS) {
      const gap = ((w[st.id] || 0) / sumW) * total - alloc[st.id]
      if (gap > bestGap + 1e-9) { best = st.id; bestGap = gap }
    }
    alloc[best] += 1
    s.dettyan.points -= 1
    n += 1
  }
  return n
}

// ジョブチェンジ できるか（レベル JOB_CHANGE_LEVEL から）
export function canChangeJob(s) {
  return (s.dettyan.level || 1) >= JOB_CHANGE_LEVEL
}

// ジョブチェンジ：レベルが たりないと できない。みならい には もどれない
export function setJob(s, id) {
  const job = JOBS.find((j) => j.id === id)
  if (!job || job.tier < 1 || !canChangeJob(s)) return false
  s.dettyan.job = id
  return true
}

// 経験値がたまっていたら レベルを上げる（1つ上がるごとに ポイント）。上がった数を返す
export function applyLevelUps(s) {
  let n = 0
  while (s.dettyan.exp >= expToNext(s.dettyan.level)) {
    s.dettyan.exp -= expToNext(s.dettyan.level)
    s.dettyan.level += 1
    s.dettyan.points = (s.dettyan.points || 0) + POINTS_PER_LEVEL
    n += 1
  }
  return n
}

// ---- バトル ----

// 種つきの乱数（状態を b.rng に持つので、バトルの中身ごと保存・再現できる）
export function rnd(b) {
  b.rng = (b.rng + 0x6d2b79f5) >>> 0
  let t = b.rng
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// 行き先の power（強さの倍率）を かける。同じスライムでも、おくの行き先ほど強い
function spawn(id, power = 1) {
  const m = MONSTERS[id]
  const hp = Math.round(m.hp * power)
  return { id, name: m.name, hp, maxHp: hp, atk: m.atk * power, def: m.def * power, spd: m.spd, special: m.special || null, buffs: {}, stun: false, turn: 0 }
}

// バトルを はじめる（s は読むだけ）。place は dettyan_adventure.js の PLACES の1つ
export function createBattle(s, place, seed) {
  const st = dettyanStats(s)
  const gokigen = s.stats?.gokigen ?? 70
  const mood = gokigen >= 70 ? 1.1 : gokigen < 30 ? 0.9 : 1 // ごきげん が高いと 少し強い
  const b = {
    place: place.id, power: place.power || 1, rng: seed >>> 0, turn: 0, over: false, win: false, ran: false,
    foes: [], idx: 0, beaten: 0, coins: 0, exp: 0,
    job: findJob(s.dettyan.job).id,
    skills: learnedSkills(s).map((k) => k.id),
    me: {
      maxHp: st.hp, hp: st.hp, maxMp: st.mp, mp: st.mp,
      atk: st.atk * mood, def: st.def, mag: st.mag * mood, spd: st.spd,
      crit: 0.05 + st.spd * 0.004 + (gokigen >= 70 ? 0.05 : 0),
      buffs: {}, guarding: false, mpRegen: findJob(s.dettyan.job).mpRegen || 1
    },
    foe: null
  }
  const n = place.count[0] + Math.floor(rnd(b) * (place.count[1] - place.count[0] + 1))
  for (let i = 0; i < n; i++) {
    const r = rnd(b) // 後ろのスライムほど出にくい
    b.foes.push(place.monsters[Math.min(place.monsters.length - 1, Math.floor(r * r * place.monsters.length))])
  }
  b.foe = spawn(b.foes[0], b.power)
  return b
}

function buffMult(who, stat) {
  return who.buffs[stat]?.mult || 1
}

// いま使える スキル（おぼえていて MP が たりる）
export function usableSkills(b) {
  return b.skills.map(findSkill).filter((k) => k && k.mp <= b.me.mp)
}

// まもり は「わりあいで へらす」（まもり 10 で だいたい 4わり へる。まほう は まもり が 3/4 しか きかない）
export function guardRate(def) {
  return 15 / (15 + Math.max(0, def))
}

function physical(b, power, random = true) {
  const atk = b.me.atk * buffMult(b.me, "atk")
  const v = atk * power * (random ? 0.9 + rnd(b) * 0.2 : 1) * guardRate(b.foe.def * buffMult(b.foe, "def"))
  return Math.max(1, v)
}

function magical(b, power, random = true) {
  const mag = b.me.mag * buffMult(b.me, "mag")
  const v = mag * power * (random ? 0.9 + rnd(b) * 0.2 : 1) * guardRate(b.foe.def * buffMult(b.foe, "def") * 0.75)
  return Math.max(1, v)
}

// 1ターン すすめる。action：{ type: "attack" } | { type: "skill", id } | { type: "guard" } | { type: "run" }
// 返すもの：起きたことの ならび（画面はこれを順に見せる）
//   { t: "act", who: "me"|"foe", name, dmg, crit, heal, hits, special } / { t: "buff" } / { t: "stun" } / { t: "guard" }
//   { t: "down", foe, coins, exp }（たおした。ここで コインと経験値）/ { t: "appear", foe } / { t: "win" } / { t: "lose" } / { t: "run" }
export function takeTurn(b, action) {
  const ev = []
  if (b.over) return ev
  b.turn += 1
  if (action.type === "run") {
    b.over = true
    b.ran = true
    ev.push({ t: "run" })
    return ev
  }
  const meFirst = b.me.spd >= b.foe.spd
  const foeBefore = b.foe
  if (meFirst) {
    myAct(b, action, ev)
    if (!b.over && b.foe === foeBefore) foeAct(b, ev)
  } else {
    foeAct(b, ev)
    if (!b.over) myAct(b, action, ev)
  }
  // ターンのおわり：つよくなる・よわくなる の のこりを へらす
  for (const who of [b.me, b.foe]) {
    for (const [k, v] of Object.entries(who.buffs)) {
      v.turns -= 1
      if (v.turns <= 0) delete who.buffs[k]
    }
  }
  b.me.guarding = false
  if (!b.over) b.me.mp = Math.min(b.me.maxMp, b.me.mp + b.me.mpRegen) // 毎ターン MP が もどる（まほうつかい は 2）
  return ev
}

function myAct(b, action, ev) {
  const me = b.me
  let skill = action.type === "skill" ? findSkill(action.id) : null
  if (skill && (!b.skills.includes(skill.id) || skill.mp > me.mp)) skill = null // 使えないときは ふつうの こうげき
  if (action.type === "guard") {
    me.guarding = true
    me.mp = Math.min(me.maxMp, me.mp + 2) // ぼうぎょ すると MP が少し もどる
    ev.push({ t: "guard", who: "me" })
    return
  }
  if (!skill) {
    const crit = rnd(b) < me.crit
    const dmg = Math.round(physical(b, 1) * (crit ? 1.6 : 1))
    hitFoe(b, ev, { name: "こうげき", dmg, crit })
    return
  }
  me.mp -= skill.mp
  if (skill.type === "phys") {
    let total = 0
    let crit = false
    for (let i = 0; i < (skill.hits || 1); i++) {
      const c = rnd(b) < me.crit
      crit = crit || c
      total += Math.round(physical(b, skill.power) * (c ? 1.6 : 1))
    }
    hitFoe(b, ev, { name: skill.name, skill: skill.id, dmg: total, crit, hits: skill.hits || 1 })
  } else if (skill.type === "magic") {
    const dmg = Math.round(magical(b, skill.power))
    const extra = {}
    if (skill.drain) {
      const heal = Math.min(me.maxHp - me.hp, Math.round(Math.min(dmg, b.foe.hp) * skill.drain))
      me.hp += heal
      extra.heal = heal
    }
    if (skill.debuff) b.foe.buffs[skill.debuff.stat] = { mult: skill.debuff.mult, turns: skill.debuff.turns + 1 }
    if (skill.stun && rnd(b) < skill.stun) {
      b.foe.stun = true
      extra.stun = true
    }
    hitFoe(b, ev, { name: skill.name, skill: skill.id, dmg, magic: true, ...extra })
  } else if (skill.type === "heal") {
    const heal = Math.min(me.maxHp - me.hp, Math.round(me.mag * buffMult(me, "mag") * skill.power + (skill.flat || 0)))
    me.hp += heal
    ev.push({ t: "act", who: "me", name: skill.name, skill: skill.id, heal, hp: me.hp })
  } else if (skill.type === "buff") {
    me.buffs[skill.stat] = { mult: skill.mult, turns: skill.turns + 1 }
    ev.push({ t: "buff", who: "me", name: skill.name, skill: skill.id, stat: skill.stat })
  }
}

function hitFoe(b, ev, info) {
  b.foe.hp = Math.max(0, b.foe.hp - info.dmg)
  ev.push({ t: "act", who: "me", ...info, foeHp: b.foe.hp })
  if (b.foe.hp > 0) return
  // たおした：コインと経験値（ここで もらう。とちゅうで やめても なくならない）
  const m = MONSTERS[b.foe.id]
  b.beaten += 1
  b.coins += m.coins
  b.exp += m.exp
  ev.push({ t: "down", foe: b.foe.id, coins: m.coins, exp: m.exp })
  b.idx += 1
  if (b.idx >= b.foes.length) {
    b.over = true
    b.win = true
    ev.push({ t: "win" })
  } else {
    b.foe = spawn(b.foes[b.idx], b.power)
    ev.push({ t: "appear", foe: b.foe.id, hp: b.foe.hp, maxHp: b.foe.maxHp })
  }
}

function foeAct(b, ev) {
  const foe = b.foe
  const me = b.me
  if (foe.stun) {
    foe.stun = false
    ev.push({ t: "stun", who: "foe" })
    return
  }
  foe.turn += 1
  const special = foe.special && foe.turn % foe.special.every === 0 ? foe.special : null
  const atk = foe.atk * buffMult(foe, "atk") * (special ? special.mult : 1)
  let v = atk * (0.85 + rnd(b) * 0.3) * guardRate(me.def * buffMult(me, "def"))
  if (me.guarding) v *= 0.5
  const dmg = Math.max(1, Math.round(v))
  me.hp = Math.max(0, me.hp - dmg)
  ev.push({ t: "act", who: "foe", name: special ? special.name : "たいあたり", special: !!special, dmg, hp: me.hp })
  if (me.hp <= 0) {
    b.over = true
    b.win = false
    ev.push({ t: "lose" })
  }
}

// オート：その場で よさそうな行動を えらぶ（乱数は つかわない）
export function autoAction(b) {
  const me = b.me
  const usable = usableSkills(b)
  const heals = usable.filter((k) => k.type === "heal")
  if (heals.length && me.hp < me.maxHp * 0.4) return { type: "skill", id: heals[heals.length - 1].id }
  const atk = physical(b, 1, false)
  if (b.foe.hp <= atk) return { type: "attack" } // ふつうの こうげき で たおせるなら MP を つかわない
  // つよくなる わざ：まだ かかっていなくて、あいてが まだ元気なら
  const buff = usable.find((k) => k.type === "buff" && !me.buffs[k.stat])
  if (buff && b.foe.hp > atk * 3 && me.mp - buff.mp >= 3) return { type: "skill", id: buff.id }
  // あいてを よわくする まほう：まだ かかっていなくて、あいてが まだ元気なら
  const weaken = usable.find((k) => k.debuff && !b.foe.buffs[k.debuff.stat])
  if (weaken && b.foe.hp > magical(b, weaken.power, false) * 3) return { type: "skill", id: weaken.id }
  let best = { type: "attack" }
  let bestDmg = atk
  for (const k of usable) {
    if (k.type !== "phys" && k.type !== "magic") continue
    const dmg = k.type === "phys" ? physical(b, k.power, false) * (k.hits || 1) : magical(b, k.power, false)
    if (dmg > bestDmg * 1.2 && dmg > bestDmg) {
      best = { type: "skill", id: k.id }
      bestDmg = dmg
    }
  }
  return best
}

// おわるまで オートで すすめる（とばすとき・テスト用）。起きたことを ぜんぶ返す
export function runAuto(b, maxTurns = 400) {
  const all = []
  while (!b.over && b.turn < maxTurns) all.push(...takeTurn(b, autoAction(b)))
  if (!b.over) {
    b.over = true
    b.ran = true
    all.push({ t: "run" })
  }
  return all
}
