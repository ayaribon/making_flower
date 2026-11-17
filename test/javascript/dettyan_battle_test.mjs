// ⚔️ バトル（手動・オート）・ステータス・職業・スキル のテスト
// 動かし方：node --test test/javascript/*.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { pathToFileURL } from "node:url"
import path from "node:path"

const JS_DIR = path.resolve(import.meta.dirname, "../../app/javascript")
registerHooks({
  resolve(specifier, context, next) {
    if (/^dettyan_[a-z_]+$/.test(specifier)) return { url: pathToFileURL(path.join(JS_DIR, `${specifier}.js`)).href, shortCircuit: true }
    return next(specifier, context)
  }
})
const bt = await import("dettyan_battle")
const adv = await import("dettyan_adventure")
const { defaultState, migrate, SAVE_VERSION } = await import("dettyan_save")

function hero(level = 1, job = level >= bt.JOB_CHANGE_LEVEL ? "warrior" : "novice", kit = {}) {
  const s = defaultState()
  s.stats = { genki: 999, gokigen: 60 }
  s.dettyan.level = level
  s.dettyan.job = job
  s.dettyan.points = (level - 1) * bt.POINTS_PER_LEVEL
  bt.autoAllocate(s)
  for (const [slot, id] of Object.entries(kit)) { s.gear[slot] = id; s.gear.owned[id] = true }
  return s
}

const KITS = {
  park: { weapon: "stick", outfit: "jersey", head: "cap", back: "backpack", feet: "sneakers" },
  forest: { weapon: "harisen", outfit: "suit", head: "headphones", back: "cape", feet: "loafers" },
  cave: { weapon: "mic", outfit: "stage", head: "helmet", back: "guitar", feet: "boots" },
  mountain: { weapon: "goldmic", outfit: "kira", head: "crown", back: "wings", feet: "kirashoes" }
}

function winRate(s, placeId, n = 200) {
  const place = adv.findPlace(placeId)
  let w = 0
  for (let seed = 1; seed <= n; seed++) {
    const b = bt.createBattle(s, place, seed)
    bt.runAuto(b)
    if (b.win) w++
  }
  return w / n
}

// ---- ステータス・ポイント ----
test("前のセーブ（version 1）には、今のレベルまでの ポイント が まとめて入る", () => {
  const s = migrate({ version: 1, dettyan: { level: 6, exp: 4 } })
  assert.equal(s.version, SAVE_VERSION)
  assert.equal(s.dettyan.points, 15)
  assert.equal(s.dettyan.job, "novice") // さいしょは みならい（Lv5 から ジョブチェンジ できる）
  assert.deepEqual(s.dettyan.alloc, { hp: 0, atk: 0, def: 0, mag: 0, spd: 0 })
  assert.equal(s.settings.autoBattle, false)
  // 2回読んでも ふえない
  assert.equal(migrate(s).dettyan.points, 15)
})

test("ポイントを ふると強くなり、もどすと もとにもどる。ふりなおし も できる", () => {
  const s = defaultState()
  s.dettyan.points = 3
  const base = bt.dettyanStats(s)
  assert.ok(bt.addPoint(s, "hp"))
  assert.ok(bt.addPoint(s, "atk"))
  assert.equal(bt.dettyanStats(s).hp, base.hp + bt.STATS.find((x) => x.id === "hp").per)
  assert.equal(bt.dettyanStats(s).atk, base.atk + 1)
  assert.equal(s.dettyan.points, 1)
  assert.ok(bt.removePoint(s, "atk"))
  assert.equal(bt.removePoint(s, "atk"), false) // もう ふっていない
  assert.equal(bt.addPoint(s, "nope"), false)
  assert.equal(bt.resetPoints(s), 1)
  assert.equal(s.dettyan.points, 3)
  assert.deepEqual(bt.dettyanStats(s).hp, base.hp)
})

test("おまかせ は のこりを ぜんぶ、職業の わりあいで ふる", () => {
  for (const job of bt.JOBS) {
    const s = defaultState()
    s.dettyan.job = job.id
    s.dettyan.points = 21
    assert.equal(bt.autoAllocate(s), 21)
    assert.equal(s.dettyan.points, 0)
    const total = Object.values(s.dettyan.alloc).reduce((a, b) => a + b, 0)
    assert.equal(total, 21)
    // いちばん わりあいの大きい ステータスに いちばん多く ふる
    const top = Object.entries(job.auto).sort((a, b) => b[1] - a[1])[0][0]
    assert.equal(Math.max(...Object.values(s.dettyan.alloc)), s.dettyan.alloc[top], job.id)
  }
})

test("さいしょは みならい。Lv5 から ジョブチェンジ できる。みならい には もどれない", () => {
  const s = defaultState()
  assert.equal(s.dettyan.job, "novice")
  assert.deepEqual(bt.learnedSkills(s).map((k) => k.id), ["punch"])
  s.dettyan.level = bt.JOB_CHANGE_LEVEL - 1
  assert.equal(bt.canChangeJob(s), false)
  assert.equal(bt.setJob(s, "warrior"), false)
  assert.equal(s.dettyan.job, "novice")
  s.dettyan.level = bt.JOB_CHANGE_LEVEL
  assert.ok(bt.canChangeJob(s))
  assert.ok(bt.setJob(s, "warrior"))
  assert.ok(bt.setJob(s, "singer")) // そのあとは いつでも かえられる
  assert.equal(bt.setJob(s, "novice"), false)
  assert.equal(s.dettyan.job, "singer")
})

test("前のセーブ：Lv5 より下で 職業が ついていたら みならい に もどす。Lv5 から上は そのまま", () => {
  const low = migrate({ version: 4, dettyan: { level: 3, exp: 0, job: "mage", points: 6 } })
  assert.equal(low.dettyan.job, "novice")
  assert.equal(low.dettyan.points, 6)
  const high = migrate({ version: 4, dettyan: { level: 8, exp: 0, job: "mage", points: 0 } })
  assert.equal(high.dettyan.job, "mage")
})

test("職業で 育ち方と スキルが かわる。スキルは レベルで おぼえる", () => {
  const s = defaultState()
  s.dettyan.level = 5
  assert.ok(bt.setJob(s, "warrior"))
  const war = bt.dettyanStats(s)
  assert.ok(bt.setJob(s, "mage"))
  const mage = bt.dettyanStats(s)
  assert.ok(mage.mag > war.mag && war.atk > mage.atk)
  assert.equal(bt.setJob(s, "ninja"), false)
  assert.deepEqual(bt.learnedSkills(s).map((k) => k.id), ["fire", "heal", "ice"].filter((id) => bt.findSkill(id).level <= 5).sort((a, b) => bt.findSkill(a).level - bt.findSkill(b).level))
  for (const job of bt.JOBS) {
    const skills = bt.SKILLS.filter((k) => k.job === job.id)
    assert.ok(skills.some((k) => k.level === 1), `${job.id} は レベル1から スキルがある`)
  }
})

// ---- バトル ----
test("こうげき：あいての HP が へる。スキル：MP を つかう。MP が たりないと ふつうの こうげき", () => {
  const s = hero(1, "warrior")
  const b = bt.createBattle(s, adv.findPlace("park"), 5)
  const hp0 = b.foe.hp
  bt.takeTurn(b, { type: "attack" })
  assert.ok(b.foe.hp < hp0 || b.idx > 0)
  const b2 = bt.createBattle(s, adv.findPlace("park"), 5)
  const mp0 = b2.me.mp
  const ev = bt.takeTurn(b2, { type: "skill", id: "smash" })
  assert.equal(ev.find((e) => e.who === "me").name, "つよいいちげき")
  assert.equal(b2.me.mp, mp0 - bt.findSkill("smash").mp + b2.me.mpRegen)
  b2.me.mp = 0
  const ev2 = bt.takeTurn(b2, { type: "skill", id: "smash" })
  if (!b2.over) assert.equal(ev2.find((e) => e.who === "me")?.name ?? "こうげき", "こうげき")
  // おぼえていない スキル も ふつうの こうげき
  const b3 = bt.createBattle(s, adv.findPlace("park"), 5)
  assert.equal(bt.takeTurn(b3, { type: "skill", id: "thunder" }).find((e) => e.who === "me").name, "こうげき")
})

test("ぼうぎょ：うける ダメージが へって、MP が もどる", () => {
  let guarded = 0
  let normal = 0
  for (let seed = 1; seed <= 60; seed++) {
    const a = bt.createBattle(hero(3), adv.findPlace("forest"), seed)
    const b = bt.createBattle(hero(3), adv.findPlace("forest"), seed)
    const ea = bt.takeTurn(a, { type: "guard" })
    const eb = bt.takeTurn(b, { type: "attack" })
    guarded += ea.find((e) => e.who === "foe")?.dmg || 0
    normal += eb.find((e) => e.who === "foe")?.dmg || 0
    assert.ok(ea.some((e) => e.t === "guard"))
  }
  assert.ok(guarded < normal * 0.7, `ぼうぎょ ${guarded} / ふつう ${normal}`)
})

test("回復・つよくなる わざ・にげる", () => {
  const s = hero(5, "singer")
  const b = bt.createBattle(s, adv.findPlace("forest"), 3)
  b.me.hp = 10
  const ev = bt.takeTurn(b, { type: "skill", id: "healsong" })
  assert.ok(ev.find((e) => e.skill === "healsong").heal > 0)
  const c = bt.createBattle(s, adv.findPlace("forest"), 3)
  bt.takeTurn(c, { type: "skill", id: "cheer" })
  assert.ok(c.me.buffs.atk)
  const d = bt.createBattle(s, adv.findPlace("forest"), 3)
  bt.takeTurn(d, { type: "run" })
  assert.ok(d.over && d.ran && !d.win)
  assert.deepEqual(bt.takeTurn(d, { type: "attack" }), []) // おわったら何も起きない
})

test("ぜんぶ たおすと かち。たおすたびに コインと経験値（down）", () => {
  const b = bt.createBattle(hero(8, "warrior", KITS.cave), adv.findPlace("park"), 11)
  const ev = bt.runAuto(b)
  assert.ok(b.win)
  const downs = ev.filter((e) => e.t === "down")
  assert.equal(downs.length, b.foes.length)
  const all = [...b.intro, ...ev]
  const coins = all.filter((e) => e.t === "down" || e.t === "chest").reduce((a, e) => a + (e.coins || 0), 0)
  assert.equal(coins, b.coins) // たおした分 ＋ 宝箱の お金
  assert.equal(ev.at(-1).t, "win")
})

test("オート：HP が少ないと 回復する", () => {
  const b = bt.createBattle(hero(5, "singer"), adv.findPlace("forest"), 2)
  b.me.hp = 5
  assert.deepEqual(bt.autoAction(b), { type: "skill", id: "healsong" })
})

// ---- 強さの つりあい（オート・おまかせ で ふった とき） ----
test("公園は レベル1・そうびなし でも だいたい勝てる（みならい）", () => {
  assert.ok(winRate(hero(1), "park") >= 0.8)
})

test("森・どうくつ・山：行けるようになったばかり・そうびなし は 半分くらい、その行き先の そうび が そろうと だいたい勝てる", () => {
  for (const place of adv.PLACES.filter((p) => p.id !== "park")) {
    // Lv5 より前は みんな みならい。そこから先は ジョブチェンジ した 3つの職業
    const jobs = place.level < bt.JOB_CHANGE_LEVEL ? ["novice"] : bt.JOBS.filter((j) => j.tier >= 1).map((j) => j.id)
    const none = jobs.map((j) => winRate(hero(place.level, j), place.id))
    const kit = jobs.map((j) => winRate(hero(place.level, j, KITS[place.id]), place.id))
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length
    assert.ok(avg(none) >= 0.35 && avg(none) <= 0.75, `${place.id} そうびなし ${none.join("/")}`)
    for (const r of none) assert.ok(r >= 0.25, `${place.id} どの職業も 勝ち目がある ${none.join("/")}`)
    assert.ok(avg(kit) >= 0.75, `${place.id} そうびあり ${kit.join("/")}`)
    assert.ok(avg(kit) > avg(none) + 0.2, `${place.id} そうびの 効きめ`)
  }
})

test("レベルを上げると 勝ちやすくなる", () => {
  for (const place of adv.PLACES.filter((p) => p.id !== "park")) {
    assert.ok(winRate(hero(place.level + 2), place.id) > winRate(hero(place.level), place.id), place.id)
  }
})

// ---- たんけん（歩く → みつけた！ → 宝箱・スライム・友達） ----
test("たんけん：出会う前に かならず 歩いて みつける。スライムは さいしょの数だけ、宝箱・友達も まざる", () => {
  let chests = 0
  let friends = 0
  for (let seed = 1; seed <= 100; seed++) {
    const b = bt.createBattle(hero(10, "warrior", KITS.mountain), adv.findPlace("cave"), seed)
    const ev = [...b.intro, ...bt.runAuto(b)]
    assert.equal(b.steps.filter((x) => x.kind === "foe").length, b.foes.length)
    // 出会い（appear・chest・friend）の まえは かならず walk → find
    ev.forEach((e, i) => {
      if (e.t === "appear" || e.t === "chest" || e.t === "friend") {
        assert.equal(ev[i - 1].t, "find", `seed ${seed}`)
        assert.equal(ev[i - 2].t, "walk", `seed ${seed}`)
      }
    })
    if (b.win) {
      assert.equal(ev.filter((e) => e.t === "find").length, b.steps.length) // さいごまで 歩いた
      assert.equal(ev.at(-1).t, "win")
    }
    chests += ev.filter((e) => e.t === "chest").length
    friends += ev.filter((e) => e.t === "friend").length
    for (const e of ev.filter((x) => x.t === "chest")) assert.ok(e.coins > 0 || e.food || e.gear, "宝箱は からっぽ じゃない")
  }
  assert.ok(chests > 50, `宝箱 ${chests}`)
  assert.ok(friends > 10 && friends < 60, `友達 ${friends}`)
})

test("たんけん：宝箱の そうび は まだ持っていないもの だけ。友達の ドット絵は 12×12", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const s = hero(6)
    s.gear.owned.mic = true
    const b = bt.createBattle(s, adv.findPlace("cave"), seed)
    const ev = [...b.intro, ...bt.runAuto(b)]
    for (const e of ev.filter((x) => x.t === "chest" && x.gear)) assert.notEqual(e.gear, "mic")
    const gears = ev.filter((x) => x.gear).map((x) => x.gear)
    assert.equal(new Set(gears).size, gears.length, "同じ そうびは 2回 出ない")
  }
  for (const f of bt.FRIENDS) {
    assert.equal(f.art.length, 12, f.id)
    for (const row of f.art) {
      assert.equal(row.length, 12, `${f.id} ${row}`)
      for (const ch of row) assert.ok(ch === "." || f.colors[ch], `${f.id} の色 ${ch}`)
    }
  }
})

test("たんけん：もらったもの（宝箱・友達）は セーブに入る。同じ種なら 同じ たんけん", () => {
  const s = hero(6)
  s.money = 0
  const r = adv.startAdventure(s, "cave", 77)
  adv.grantEvents(s, bt.runAuto(r.battle))
  assert.equal(s.money, r.battle.coins)
  for (const id of r.battle.found.foods) assert.ok(s.items[id] > 0)
  for (const id of r.battle.found.gear) assert.ok(s.gear.owned[id])
  const a = bt.createBattle(hero(6), adv.findPlace("cave"), 77)
  const b = bt.createBattle(hero(6), adv.findPlace("cave"), 77)
  assert.deepEqual(a.steps, b.steps)
  assert.deepEqual(a.intro, b.intro)
})
