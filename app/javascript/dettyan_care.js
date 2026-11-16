// 🤚 おせわ・ショップ・放置の計算（docs/dettyan/requirements.md の2・3・5章）
// ここは「セーブの state をどう変えるか」だけを書く。保存は呼んだ側が store.update(...) の中で行う
// 時間はぜんぶサーバーの時計（store.now()）で数える。日付は日本の時間で区切る

import { findFood, foodGokigen } from "dettyan_foods"

export const MAX_STAT = 100               // ごきげん の上限・レベル1の げんき の上限
export const GENKI_PER_LEVEL = 5          // レベルが1上がるごとに、げんき の上限が増える
export const DAILY_REWARD = 20            // 毎日のごほうび（その日はじめて開いたとき）
export const DAILY_CARE_COIN_LIMIT = 30   // おせわで落ちるコインの1日の上限
export const CARE_COOLDOWN_MS = 20 * 1000 // 同じおせわを続けてしても、この間はほとんど効かない
export const GENKI_PER_HOUR = 4           // 放置で げんき が回復する（レベル1のとき。上限に合わせて増える）
export const GOKIGEN_DOWN_PER_HOUR = 1.5  // 放置で ごきげん が少し下がる（GOKIGEN_FLOOR より下がらない）
export const GOKIGEN_FLOOR = 30
export const DIRT_EVERY_MS = 3 * 60 * 60 * 1000 // 3時間ごとに ほこり が1つ
export const MAX_DIRT = 5
const MAX_IDLE_MS = 3 * 24 * 60 * 60 * 1000 // 放置で数えるのは3日まで
const JST_OFFSET_MS = 9 * 60 * 60 * 1000

// おせわの種類。gokigen：上がる量、coinChance：コインが落ちる確率、coins：落ちる枚数 [少ない, 多い]
export const CARE = {
  pet: {
    gokigen: 6, coinChance: 0.35, coins: [1, 2],
    lines: ["えへへ", "うれしいな", "もっと なでて", "きもちいい〜"]
  },
  talk: {
    gokigen: 3, coinChance: 0.25, coins: [1, 1],
    lines: ["きょうも がんばろ", "事務所、もっと大きくしたいね", "SiVA は げんきかな", "じゅんさい たべたいな", "歌ってみた、きいたよ！"]
  },
  clean: {
    gokigen: 2, coinChance: 0, coins: [0, 0], // ほこり1つにつき ごきげん+3・コイン1枚（必ず）
    lines: ["ぴかぴか！", "すっきりした！"]
  }
}

// げんき の上限（たいりょくポイント）。レベルで増える
export function maxGenki(s) {
  return MAX_STAT + (Math.max(1, s.dettyan?.level || 1) - 1) * GENKI_PER_LEVEL
}

function clampGenki(s, v) {
  return Math.max(0, Math.min(maxGenki(s), Math.round(v * 10) / 10))
}

// 日本の日付（例："2026-11-17"）
export function dayKey(ms) {
  return new Date(ms + JST_OFFSET_MS).toISOString().slice(0, 10)
}

function clampStat(v) {
  return Math.max(0, Math.min(MAX_STAT, Math.round(v * 10) / 10))
}

// 日付が変わっていたら、その日の数（おせわのコイン）をリセット
function ensureDay(s, now) {
  const today = dayKey(now)
  if (s.daily.day !== today) {
    s.daily.day = today
    s.daily.careCoins = 0
  }
}

// 放置していた間の変化（lastSeenAt から今まで）。何度呼んでも二重には数えない
export function applyIdle(s, now) {
  if (!s.room.cleanedAt) s.room.cleanedAt = now
  const last = s.lastSeenAt
  s.lastSeenAt = now
  if (!last || now <= last) return { hours: 0 }
  const hours = Math.min(now - last, MAX_IDLE_MS) / 3600000
  s.stats.genki = clampGenki(s, s.stats.genki + hours * GENKI_PER_HOUR * (maxGenki(s) / MAX_STAT))
  if (s.stats.gokigen > GOKIGEN_FLOOR) {
    s.stats.gokigen = clampStat(Math.max(GOKIGEN_FLOOR, s.stats.gokigen - hours * GOKIGEN_DOWN_PER_HOUR))
  }
  return { hours }
}

// へやの ほこりの数（そうじしてからの時間で決まる）
export function dirtCount(s, now) {
  if (!s.room.cleanedAt) return 0
  return Math.max(0, Math.min(MAX_DIRT, Math.floor((now - s.room.cleanedAt) / DIRT_EVERY_MS)))
}

// 毎日のごほうび。その日はじめてなら money に足して、その数を返す（もうもらっていたら 0）
export function claimDailyReward(s, now) {
  const today = dayKey(now)
  if (s.daily.rewardDay === today) return 0
  s.daily.rewardDay = today
  s.money += DAILY_REWARD
  return DAILY_REWARD
}

// おせわをする。返すもの：{ gokigen（上がった量）, coins（落ちたコイン）, line, kind }
export function doCare(s, kind, now, rand = Math.random) {
  const care = CARE[kind]
  if (!care) return null
  ensureDay(s, now)
  const lastAt = s.care.lastAt[kind] || 0
  const tooSoon = now - lastAt < CARE_COOLDOWN_MS
  s.care.lastAt[kind] = now

  let gokigen = care.gokigen
  let coins = 0
  let line = pick(care.lines, rand)

  if (kind === "clean") {
    const dirt = dirtCount(s, now)
    if (dirt === 0) {
      gokigen = 0
      line = "もう きれいだよ"
    } else {
      gokigen = care.gokigen + dirt * 3
      coins = dirt
      s.room.cleanedAt = now
    }
  } else if (tooSoon) {
    gokigen = 1
    line = kind === "pet" ? "ちょっと くすぐったい" : "さっきも 話したね"
  } else if (rand() < care.coinChance) {
    const [lo, hi] = care.coins
    coins = lo + Math.floor(rand() * (hi - lo + 1))
  }

  if (kind !== "clean" && s.stats.genki < 20) line = "おなか すいたな…"

  coins = Math.max(0, Math.min(coins, DAILY_CARE_COIN_LIMIT - s.daily.careCoins))
  s.daily.careCoins += coins
  s.money += coins
  const before = s.stats.gokigen
  s.stats.gokigen = clampStat(before + gokigen)
  return { kind, gokigen: s.stats.gokigen - before, coins, line }
}

// ショップで買う。{ ok, reason：「money」（お金が足りない）| 「unknown」 }
export function buyFood(s, id) {
  const food = findFood(id)
  if (!food) return { ok: false, reason: "unknown" }
  if (s.money < food.price) return { ok: false, reason: "money", food }
  s.money -= food.price
  s.items[id] = (s.items[id] || 0) + 1
  return { ok: true, food }
}

// 持ち物からあげる。{ ok, food, genki, gokigen, reason：「none」（持っていない）| 「full」（おなかいっぱい）}
export function feedFood(s, id) {
  const food = findFood(id)
  if (!food) return { ok: false, reason: "unknown" }
  if (!(s.items[id] > 0)) return { ok: false, reason: "none", food }
  if (s.stats.genki >= maxGenki(s) && s.stats.gokigen >= MAX_STAT) return { ok: false, reason: "full", food }
  s.items[id] -= 1
  if (s.items[id] <= 0) delete s.items[id]
  const g0 = s.stats.genki
  const k0 = s.stats.gokigen
  s.stats.genki = clampGenki(s, g0 + food.genki)
  s.stats.gokigen = clampStat(k0 + foodGokigen(food))
  return { ok: true, food, genki: s.stats.genki - g0, gokigen: s.stats.gokigen - k0 }
}

function pick(list, rand) {
  return list[Math.floor(rand() * list.length) % list.length]
}
