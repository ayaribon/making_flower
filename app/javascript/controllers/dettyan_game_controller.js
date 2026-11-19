import { Controller } from "@hotwired/stimulus"
import { SPRITE_W, SPRITE_H } from "dettyan_sprite"
import { DettyanStore } from "dettyan_save"
import { DettyanSound } from "dettyan_sound"
import { FOODS, findFood, foodGokigen, drawFood } from "dettyan_foods"
import { applyIdle, claimDailyReward, doCare, buyFood, feedFood, dirtCount, maxGenki } from "dettyan_care"
import { PLACES, MONSTERS, canGo, startAdventure, grantEvents, finishAdventure, drawMonster, monsterSprite, findFriend } from "dettyan_adventure"
import { STATS, JOBS, SKILLS, POINTS_PER_LEVEL, JOB_CHANGE_LEVEL, HP_PER_VIT, findJob, findSkill, dettyanStats, expToNext, addPoint, removePoint, resetPoints, autoAllocate, setJob, canChangeJob, applyLevelUps, takeTurn, autoAction, runAuto } from "dettyan_battle"
import { enableDettyanHuman } from "dettyan_human"
import { loadDettyanSheets, createCampWide, drawCampNightWide, createBattleStrip, drawBattleWide, makeBattleTools, drawBattleTool, makeMonsterArt, drawMonsterArt, createStoryTownWide, drawStoryTownLive, drawFlashWide } from "dettyan_sprout"
import { usingHumanDraw } from "dettyan_gear"
import { facing8 } from "avatar_human"
import { GEAR, SLOTS, slotName, findGear, equipped, gearBonus, toggleGear, drawGearIcon, drawDressed, drawHeldMic, shopGear, buyGear } from "dettyan_gear"
import { ROOM_W, ROOM_H, createRoom, drawRoomLive, drawChair, drawSpeaker, drawNightLight, drawWindowLight, CHAIR, SPEAKER, SEAT, WORK_SPOT, SING_SPOT } from "dettyan_room"
import { HOUSE, FURNITURE, findFurniture, hasHouse, hasFurniture, canWork, buyHouse, buyFurniture } from "dettyan_home"
import { drawCampfire, drawLeaf, FIRE, CAMP_SING_SPOT, LEAF_SPOTS } from "dettyan_camp"
import { CLEAR_TEXT, currentGoal, checkStory, SCENES } from "dettyan_story"

// 🧑‍💼 Dettyan 育成ゲーム：事務所の部屋の中を Dettyan がちょこちょこ歩く。タップでおせわ、ショップでごはん
// ときどき PC で編集作業をしたり、マイクを持って歌ったりする（見ているだけ。セーブは変えない）
// セーブは dettyan_save.js、音は dettyan_sound.js、ごはんの表は dettyan_foods.js、おせわの計算は dettyan_care.js
// ぼうけん（モンスター退治）は dettyan_adventure.js（行き先）と dettyan_battle.js（バトル・ステータス・職業・スキル）、そうびは dettyan_gear.js
// バトルは手動（こうげき・スキル・ぼうぎょ・にげる をえらぶ）か 🤖オート。たおすたびに コインと経験値を セーブする
// ショップは「🍙 たべもの」（dettyan_foods.js）と「👗 いしょう」（dettyan_gear.js の price があるもの）の2つのタブ
// 部屋の絵は dettyan_room.js、モンスター退治の けしきは dettyan_scenes.js
// 📖 おはなし（dettyan_story.js）：さいしょは テントで 野宿（dettyan_camp.js）→ マイホーム と 家具 を買う（dettyan_home.js）
// 仕様は docs/dettyan/requirements.md

const W = ROOM_W // 部屋の大きさ（ドット）
const H = ROOM_H
const FLOOR_TOP = 46 // 足がここより下を歩く
const FLOOR_BOTTOM = 92
const SPEED = 16 // 1秒に進むドット
const STEP_SEC = 0.22 // 足を入れかえる間かく

const IDLE_TICK_MS = 60 * 1000 // 遊んでいる間も1分ごとに放置の計算をする
const MENU_SEC = 7 // おせわのメニューを出している間、Dettyan は止まっている
const EAT_SEC = 1.5
// ほこりの場所（そうじするまで、床に1つずつ増える）
const DIRT_SPOTS = [[24, 60], [100, 84], [66, 90], [120, 66], [36, 82]]
// バトルの場所（ドット）
const BATTLE_ME_X = 34
const BATTLE_FOE_X = 94
const BATTLE_FEET = 82
const AUTO_WAIT_SEC = 0.25 // オートで 次の行動まで まつ時間
const BATTLE_SPEEDS = [1, 2, 3] // ⏩ はやおくり（ボタンで 1倍 → 2倍 → 3倍）
const WALK_PX_PER_SEC = 34 // たんけん で 歩くとき、けしきが ながれる はやさ
// 宝箱のドット絵（12×10）。O：ふち、W：木、D：木のかげ、G：金具
const CHEST_SPRITE = [
  "............",
  "..OOOOOOOO..",
  ".OWWWWWWWWO.",
  ".OWDDDDDDWO.",
  "OOOOOGGOOOOO",
  "OWWWWGGWWWWO",
  "OWWWWWWWWWWO",
  "OWDDDDDDDDWO",
  "OWWWWWWWWWWO",
  "OOOOOOOOOOOO"
]
const CHEST_COLORS = { O: "#4a2a10", W: "#c0803a", D: "#94602a", G: "#ffd84d" }
// バトルの できごと を見せる時間（秒）。オートのときは少し速く
const EVENT_SEC = { arrive: 1, walk: 1.1, find: 0.7, chest: 1.3, friend: 1.7, appear: 0.8, act: 0.6, buff: 0.7, guard: 0.5, stun: 0.6, down: 0.55, win: 1.3, lose: 1.3, run: 0.9 }
const STAT_NAMES = Object.fromEntries(STATS.map((st) => [st.id, st.name]))

// 部屋でひとりで すること（PC で作業・歌う）
const ACT_GAP_SEC = 14   // 前にしてから、これだけたつまで次はしない
const ACT_CHANCE = 0.4   // 歩き終わって止まったとき、作業か歌を始める確率
const SING_BEAT = 60 / 104 // 事務所の BGM の1拍
const WORK_LINES = ["MV の へんしゅう できた！", "サムネ できた！", "切り抜き 1本 できた！", "歌ってみた の ミックス おわり！"]
const SING_LINES = ["きもちよかった〜", "いい声 でた！", "歌ってみた、とろうかな", "ラララ〜♪"]
const NOTE_COLORS = ["#ff7ab6", "#5ec8ff", "#ffd84a", "#9b7bff"]

// 🧑‍💼 Dettyan 本人が遊んでいるときだけの セリフ（ドット絵の Dettyan が「俺やん」と気づく）
// 本人かどうかはサーバーが決める（User#dettyan_owner?）。ほかの人には出ない
const OWNER_LINES = {
  hello: ["お、俺やん！", "本物の 俺やん", "俺が 俺を 育てるん？"],
  tap: ["俺やん", "なに？ 俺", "俺のこと 見すぎやろ", "本物の 俺も がんばってや"],
  pet: ["俺に なでられてる…", "俺やん", "俺に なでられるの へんな感じ"],
  talk: ["これ 俺やん…", "俺 ドット絵でも イケてるやん", "俺 育てて どうするん", "俺やん"],
  idle: ["俺やん", "…俺やん", "やっぱ 俺やん"],
  work: ["俺 仕事 できるやん", "さすが 俺やん"],
  sing: ["俺 歌 うまいやん", "さすが 俺やん"],
  favorite: ["じゅんさい わかってるやん 俺", "さすが 俺、好物 わかってる"],
  win: ["俺 つよいやん", "ただいま。俺 つよかったやろ"]
}
const OWNER_IDLE_CHANCE = 0.08 // 止まったとき、ひとりで「俺やん」と言う確率

export default class extends Controller {
  static targets = ["canvas", "start", "startText", "startNote", "money", "genki", "gokigen", "soundButton", "soundPanel", "bgmToggle", "seToggle", "bubble",
    "menu", "sheet", "sheetTitle", "sheetMoney", "sheetList", "toast", "level", "genkiNum", "cmd", "cmdStatus", "cmdButtons", "statusButton", "goal", "story", "storyWho", "storyText", "top", "bottom"]
  static values = { userId: Number, owner: Boolean, layers: Object, sprites: Object } // owner：Dettyan 本人のアカウント。layers：素体＋レイヤーの 画像（あれば 町と 同じ 絵）

  connect() {
    this.store = new DettyanStore({ userId: this.userIdValue })
    this.sound = new DettyanSound()
    this.ready = false
    this.started = false

    // 画面いっぱい：画面の canvas（this.screen）に、まんなか 128×96 の けしきを おき、まわりも 同じ けしきの つづきを 広く 描く
    this.screen = this.canvasTarget.getContext("2d")
    this.view = { ox: 0, oy: 0, VW: W, VH: H, scale: 1 }
    this.layout()
    this.resizeObserver = new ResizeObserver(() => this.layout())
    this.resizeObserver.observe(this.element)
    this.resizeObserver.observe(this.topTarget)
    this.resizeObserver.observe(this.bottomTarget)
    // mode："idle" | "walk" | "look" | "work"（PC で作業）| "sing"（歌う）。plan：歩いた先で始めること
    this.chara = { x: W / 2, y: 74, tx: W / 2, ty: 74, mode: "idle", until: 1.5, stepT: 0, frame: 0, blink: 0, nextBlink: 3, hop: 0, plan: null, act: null, lastActAt: -ACT_GAP_SEC }
    this.t = 0 // 開いてからの秒（部屋の動くところに使う）
    this.particles = [] // コイン・ハート・きらきら
    this.eating = null  // { food, t }
    this.battle = null  // モンスター退治の再生中

    this.last = performance.now()
    // dt は 0 より 小さく しない（さいしょの コマは now が this.last より 前の ことが あり、t が マイナスに なると
    // たき火の 絵が えらべず 止まって Dettyan が 消えていた。2026-11-19）
    // 次の コマを 先に たのむ：1コマ 描けなくても 止まらない
    this.loop = (now) => {
      this.raf = requestAnimationFrame(this.loop)
      const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000))
      this.last = now
      this.t += dt
      this.tick(dt)
      this.draw()
    }
    this.raf = requestAnimationFrame(this.loop)

    this.onHide = () => this.saveOnLeave()
    this.onVisibility = () => { if (document.hidden) this.saveOnLeave() }
    window.addEventListener("pagehide", this.onHide)
    document.addEventListener("visibilitychange", this.onVisibility)

    // 🧑 Dettyan の 新しい 絵 と 🌱 けしきの 素材 を 読みおわるまで（成功・失敗 どちらでも）ステージを 描かない
    //   読みおわる まえに 前の 絵が 一瞬 出ないように。読めなければ 前の 絵で 遊べる。6秒で あきらめる
    const giveUp = () => new Promise((resolve) => setTimeout(resolve, 6000))
    const art = Promise.race([Promise.allSettled([
      enableDettyanHuman(this.layersValue),
      // 🌱 けしきの 素材（そろえば 新しい 絵。なければ 前の 絵）
      loadDettyanSheets(this.spritesValue).then((sheets) => {
        if (!sheets) return
        this.sprout = sheets
        this.wideCache = {}
        this.tools = makeBattleTools(sheets.actions) // ⚔️ 農作業の 道具を こうげきの うごきに
        this.monsterArt = makeMonsterArt(sheets, MONSTERS) // 👾 モンスター（ある ものだけ）
      })
    ]), giveUp()]).then(() => {
      this.artLoaded = true
      // 新しい 絵（けしき と Dettyan）が そろわなければ 遊べない（前の 絵は もう 出さない）
      this.artOK = !!this.sprout && usingHumanDraw()
    })
    Promise.all([this.store.load({ onCache: (s) => this.renderHud(s) }), art]).then(([s]) => this.afterLoad(s))
  }

  disconnect() {
    cancelAnimationFrame(this.raf)
    this.resizeObserver?.disconnect()
    clearTimeout(this.bubbleTimer)
    clearTimeout(this.toastTimer)
    clearInterval(this.idleTimer)
    clearTimeout(this.eatSoundTimer)
    window.removeEventListener("pagehide", this.onHide)
    document.removeEventListener("visibilitychange", this.onVisibility)
    this.saveOnLeave()
    this.sound.destroy()
  }

  afterLoad(state) {
    if (!this.artOK) {
      // 絵が 読めなかった：タップで もう一度 ひらく
      this.artFailed = true
      this.startTextTarget.textContent = "絵を よみこめなかったよ… タップで もう一度"
      this.startNoteTarget.hidden = true
      return
    }
    this.ready = true
    this.rebuildHome()
    Object.assign(this.chara, { x: this.homeSpot.x, y: this.homeSpot.y, tx: this.homeSpot.x, ty: this.homeSpot.y })
    this.renderHud(state)
    this.renderSoundButtons()
    this.sound.setBgm(state.settings.bgm)
    this.sound.setSe(state.settings.se)
    const soundOn = state.settings.bgm || state.settings.se
    if (soundOn) {
      // 音が出る人には「はじめる」画面で先に知らせる（iPhone はタップするまで音を出せないので、ここでタップしてもらう）
      this.startTextTarget.textContent = "タップしてはじめる"
      this.startNoteTarget.hidden = false
    } else {
      // 前に🔇にした人は、注意を出さずに音なしではじめる
      this.begin()
    }
  }

  // 「はじめる」画面をタップ
  start() {
    if (this.artFailed) return window.location.reload()
    if (!this.ready || this.started) return
    this.sound.unlock()
    this.sound.se("tap")
    this.begin()
  }

  begin() {
    this.started = true
    this.startTarget.hidden = true
    this.sound.playSong("office")
    let idle = { hours: 0 }
    let reward = 0
    this.store.update((s) => {
      s.settings.soundAsked = true
      const now = this.store.now()
      idle = applyIdle(s, now) // 放置していた間に げんき が回復する（サーバーの時計で数える）
      reward = claimDailyReward(s, now)
      applyLevelUps(s) // ぼうけん の とちゅうで 閉じていたとき
    })
    this.renderHud(this.store.state)
    this.idleTimer = setInterval(() => this.idleTick(), IDLE_TICK_MS)
    // はじめて遊ぶ人（前から遊んでいる人も）は、はじまりの おはなし から（1回だけ）
    const s = this.store.state
    if (!s.story.prologue) {
      this.store.update((st) => { st.story.prologue = true })
      this.playStory(["prologue"], () => this.welcome(reward, idle))
      return
    }
    this.welcome(reward, idle)
  }

  // おかえり・ごほうび・ポイント の知らせ
  welcome(reward, idle) {
    if (this.store.state.dettyan.points > 0) setTimeout(() => this.toast(`📊 ポイントが ${this.store.state.dettyan.points} あるよ（つよさ で ふれるよ）`), reward ? 2800 : 1200)
    this.runStoryCheck()
    if (reward) {
      setTimeout(() => {
        this.sound.se("coin")
        this.toast(`🎁 きょうの ごほうび 💰+${reward}`)
        for (let i = 0; i < 5; i++) this.dropCoin(this.chara.x - 16 + i * 8, this.chara.y - SPRITE_H - i * 4)
      }, 400)
    }
    if (this.ownerValue) {
      // 本人が来たら、まず気づく
      setTimeout(() => {
        if (this.battle) return
        this.lookAtMe(3)
        this.sound.se("talk")
        this.say(pick(OWNER_LINES.hello))
      }, reward ? 1200 : 500)
    } else if (!reward && idle.hours >= 1) {
      this.say("おかえり！")
    }
  }

  // 遊んでいる間も、少しずつ げんき が回復し、ほこり が増える
  idleTick() {
    this.store.update((s) => { applyIdle(s, this.store.now()) })
    this.renderHud(this.store.state)
  }

  // 画面を閉じる・裏にしたとき。戻ってきたら、そこからの時間を放置として数える
  saveOnLeave() {
    if (!this.started) return
    this.store.update((s) => { applyIdle(s, this.store.now()) })
    this.store.flush({ keepalive: true })
  }

  // ---- 動き ----
  tick(dt) {
    const ch = this.chara
    ch.nextBlink -= dt
    if (ch.blink > 0) ch.blink -= dt
    if (ch.nextBlink <= 0) {
      ch.blink = 0.14
      ch.nextBlink = 2.5 + Math.random() * 3
    }
    if (ch.hop > 0) ch.hop = Math.max(0, ch.hop - dt)
    this.tickParticles(dt)
    if (this.eating) {
      this.eating.t += dt
      if (this.eating.t >= EAT_SEC) this.finishEating()
    }
    if (this.story) {
      this.story.t += dt
      return
    }
    if (this.battle) return this.tickBattle(dt)
    if (!this.started) return

    if (ch.mode === "walk") {
      const dx = ch.tx - ch.x
      const dy = ch.ty - ch.y
      const dist = Math.hypot(dx, dy)
      if (dist < 0.5) {
        ch.mode = "idle"
        ch.frame = 0
        ch.until = 1 + Math.random() * 2.5
        if (ch.plan) this.startActivity(ch.plan)
        else if (this.ownerValue && Math.random() < OWNER_IDLE_CHANCE) this.say(pick(OWNER_LINES.idle))
        return
      }
      const move = Math.min(dist, SPEED * dt)
      ch.x += (dx / dist) * move
      ch.y += (dy / dist) * move
      ch.stepT += dt
      if (ch.stepT >= STEP_SEC) {
        ch.stepT = 0
        ch.frame = 1 - ch.frame
        this.sound.se("step")
      }
    } else if (ch.act) {
      this.tickActivity(dt)
    } else {
      ch.until -= dt
      if (ch.until <= 0) {
        if (ch.mode === "look") {
          this.hideBubble()
          this.hideMenu()
        }
        this.wander()
      }
    }
  }

  // 止まっていたあと、次にすること：ときどき PC で作業・歌う。ふだんは ぶらぶら歩く
  wander() {
    const ch = this.chara
    if (!this.eating && this.t - ch.lastActAt > ACT_GAP_SEC && Math.random() < ACT_CHANCE) {
      // PC で作業するのは、つくえ・いす・パソコン が そろってから。テントでは たき火の そばで 歌う
      const s = this.store.state
      const plan = s && canWork(s) && Math.random() < 0.5 ? "work" : "sing"
      const spot = plan === "work" ? WORK_SPOT : this.inTent ? CAMP_SING_SPOT : SING_SPOT
      this.walkTo(spot.x, spot.y)
      ch.plan = plan
      return
    }
    let x = 12 + Math.random() * (W - 24)
    let y = FLOOR_TOP + 2 + Math.random() * (FLOOR_BOTTOM - FLOOR_TOP - 4)
    // テントでは たき火の上で 止まらない
    if (this.inTent && Math.abs(x - FIRE.x) < 14 && Math.abs(y - FIRE.y) < 8) y = FIRE.y + 14
    this.walkTo(x, y)
  }

  walkTo(x, y) {
    this.standUp()
    const ch = this.chara
    ch.plan = null
    ch.tx = Math.max(SPRITE_W / 2, Math.min(W - SPRITE_W / 2, x))
    ch.ty = Math.max(FLOOR_TOP, Math.min(FLOOR_BOTTOM, y))
    ch.mode = "walk"
  }

  // ---- 部屋でひとりで すること（PC で作業・歌う） ----
  startActivity(kind) {
    const ch = this.chara
    ch.plan = null
    ch.mode = kind
    ch.frame = 0
    ch.act = { kind, t: 0, dur: kind === "work" ? 9 + Math.random() * 4 : 8 + Math.random() * 3, fx: 0.3, note: 0.2, typing: true }
    if (kind === "work") {
      // いすに すわる（うしろすがた）
      ch.x = SEAT.x
      ch.y = SEAT.y
    } else {
      this.sound.duck(true)
      this.say("♪")
    }
  }

  tickActivity(dt) {
    const ch = this.chara
    const act = ch.act
    act.t += dt
    act.fx -= dt
    if (act.kind === "work") {
      // カタカタ…（ときどき手を止めて考える）
      if (act.fx <= 0) {
        if (act.typing && Math.random() < 0.08) {
          act.typing = false
          act.fx = 0.6 + Math.random() * 0.8
        } else {
          act.typing = true
          this.sound.se("type")
          act.fx = 0.07 + Math.random() * 0.12
        }
      }
    } else {
      if (act.fx <= 0) {
        this.sound.se("sing")
        act.fx = SING_BEAT * 4
      }
      act.note -= dt
      if (act.note <= 0) {
        this.note()
        act.note = SING_BEAT * 1.5
      }
    }
    if (act.t >= act.dur) this.endActivity(true)
  }

  // done：さいごまでした（ひとことを言う）。false：タップなどで やめた
  endActivity(done) {
    const ch = this.chara
    const act = ch.act
    if (!act) return
    ch.act = null
    ch.lastActAt = this.t
    ch.mode = "idle"
    ch.until = 2.5
    if (act.kind === "work") {
      // いすから 立つ
      ch.x = WORK_SPOT.x
      ch.y = WORK_SPOT.y
    } else {
      this.sound.duck(false)
    }
    if (done) {
      if (act.kind === "sing") {
        this.chara.hop = 0.6
        this.hearts(2)
      }
      this.say(this.ownerLine(act.kind, pick(act.kind === "work" ? WORK_LINES : SING_LINES)))
    }
  }

  // 作業中・歌っている途中なら やめて立つ
  standUp() {
    if (this.chara.act) this.endActivity(false)
  }

  // ---- 画面いっぱい ----
  // まんなか 128×96 を 上と 下の あいだに おさめる 大きさ を きめて、canvas を 画面 ぜんぶ に する
  layout() {
    const Wp = this.element.clientWidth || W
    const Hp = this.element.clientHeight || H
    const top = this.hasTopTarget ? this.topTarget.offsetHeight : 0
    const bottom = this.hasBottomTarget ? this.bottomTarget.offsetHeight : 0
    const safeH = Math.max(H, Hp - top - bottom - 6)
    const scale = Math.max(1, Math.min(Wp / W, safeH / H))
    const VW = Math.ceil(Wp / scale)
    const VH = Math.ceil(Hp / scale)
    const ox = Math.round((VW - W) / 2)
    const oy = Math.max(0, Math.min(VH - H, Math.round((top + (safeH - H * scale) / 2) / scale)))
    const c = this.canvasTarget
    if (c.width !== VW) c.width = VW
    if (c.height !== VH) c.height = VH
    c.style.width = `${VW * scale}px`
    c.style.height = `${VH * scale}px`
    const st = this.element.style
    st.setProperty("--dt-top", `${top}px`)
    st.setProperty("--dt-bottom", `${bottom}px`)
    st.setProperty("--scene-x", `${ox * scale}px`)
    st.setProperty("--scene-y", `${oy * scale}px`)
    st.setProperty("--scene-w", `${W * scale}px`)
    st.setProperty("--scene-h", `${H * scale}px`)
    const changed = VW !== this.view.VW || VH !== this.view.VH || ox !== this.view.ox || oy !== this.view.oy
    this.view = { ox, oy, VW, VH, scale }
    if (changed) this.wideCache = {}
  }

  // けしきの 中の 場所（128×96 の 座標）→ canvas の 中の わりあい（%）
  pctX(x) { return ((x + this.view.ox) / this.view.VW) * 100 }
  pctY(y) { return ((y + this.view.oy) / this.view.VH) * 100 }

  // 新しい 絵（Sprout Lands）だけで 描く（前の 絵は 2026-11-19 に やめた。読めないときは「よみこめなかった」）
  draw() {
    const sg = this.screen
    const v = this.view
    sg.setTransform(1, 0, 0, 1, 0, 0)
    sg.imageSmoothingEnabled = false
    // 絵を 読んでいる あいだ・読めなかった ときは 色だけ
    if (!this.artLoaded || !this.artOK || !this.store.state) {
      sg.fillStyle = "#2a1c12"
      sg.fillRect(0, 0, v.VW, v.VH)
      return
    }
    sg.save()
    sg.translate(v.ox, v.oy)
    this.drawStage(sg, this.wideArea())
    sg.restore()
  }

  // 動かない ところ（広く 描いた もの）を とっておく
  //   画面の 大きさが かわると layout() が wideCache を からに する
  wide(key, make) {
    this.wideCache ||= {}
    this.wideCache[key] ||= make(this.wideArea())
    return this.wideCache[key]
  }

  // 広く 描く ところ（128×96 の 座標で）
  wideArea() {
    const v = this.view
    return { x: -v.ox, y: -v.oy, w: v.VW, h: v.VH }
  }

  // area：広く 描く 広さ（128×96 の 座標）
  drawStage(g, area) {
    const ch = this.chara
    if (this.story) return this.drawStory(g, area)
    if (this.battle) return this.drawBattle(g, area)
    const now = this.store.now()
    const act = ch.act
    const s = this.store.state
    const dirt = s ? dirtCount(s, now) : 0
    if (this.inTent) {
      // ⛺ テント：空・遠くの まち・たき火（Dettyan と前後が入れかわる）。新しい 絵は 森の 中の ひろば
      g.drawImage(this.wide("camp", (a) => createCampWide(this.sprout, a)), area.x, area.y)
      for (let i = 0; i < dirt; i++) drawLeaf(g, ...LEAF_SPOTS[i])
      const layers = [
        { y: FIRE.y, draw: () => drawCampfire(g, now, this.t) },
        { y: ch.y + 0.5, draw: () => this.drawChara(g) }
      ]
      layers.sort((a, b) => a.y - b.y).forEach((l) => l.draw())
      drawCampNightWide(g, now, area)
      this.drawParticles(g)
      return
    }
    const f = s?.home.furniture || {}
    g.drawImage(this.wide("room", (a) => createRoom(f, a)), area.x, area.y)
    drawWindowLight(g, now)
    drawRoomLive(g, { now, t: this.t, mode: act?.kind, workT: act?.kind === "work" ? act.t : 0, f })
    for (let i = 0; i < dirt; i++) drawDust(g, ...DIRT_SPOTS[i])
    // いす・スピーカー（持っていれば）・Dettyan を、足もとが上（おく）のものから順に描く
    const layers = [{ y: ch.y + 0.5, draw: () => this.drawChara(g) }]
    if (f.chair) layers.push({ y: CHAIR.base, draw: () => drawChair(g) })
    if (f.speaker) layers.push({ y: SPEAKER.base, draw: () => drawSpeaker(g, act?.kind === "sing", this.t) })
    layers.sort((a, b) => a.y - b.y).forEach((l) => l.draw())
    drawNightLight(g, now, act?.kind === "work", f, area)
    this.drawParticles(g)
  }

  // テントに すんでいる（マイホーム を まだ買っていない）
  get inTent() {
    return !!this.store.state && !hasHouse(this.store.state)
  }

  // 帰ってきて立つ場所（テントでは たき火の よこ）
  get homeSpot() {
    return this.inTent ? { x: 40, y: 78 } : { x: W / 2, y: 74 }
  }

  // ほこり（テントでは 落ち葉）の場所
  get dirtSpots() {
    return this.inTent ? LEAF_SPOTS : DIRT_SPOTS
  }

  // 家具が かわったら、へや の絵を 描きなおす
  rebuildHome() {
    const s = this.store.state
    if (this.wideCache) delete this.wideCache.room
  }

  drawChara(g) {
    const ch = this.chara
    const act = ch.act
    if (act?.kind === "work") {
      // うしろすがたで PC に向かう。打っている間は 少し ゆれる
      const bob = act.typing && Math.floor(act.t * 9) % 2 ? 1 : 0
      this.drawMe(g, SEAT.left, SEAT.top + bob, { view: "back" })
      return
    }
    // ぴょん（よろこぶとき）
    const hopY = ch.hop > 0 ? Math.round(Math.abs(Math.sin(ch.hop * Math.PI * 3)) * 4) : 0
    const left = Math.round(ch.x - SPRITE_W / 2)
    let top = Math.round(ch.y - SPRITE_H) - (ch.frame === 1 ? 1 : 0) - hopY
    // かげ
    g.fillStyle = "rgba(0, 0, 0, 0.18)"
    g.fillRect(Math.round(ch.x) - 6, Math.round(ch.y) - 1, 12, 2)
    if (act?.kind === "sing") {
      // マイクを持って歌う：拍に合わせて ゆれて、口をぱくぱく
      const beat = (act.t / SING_BEAT) % 1
      top += beat < 0.5 ? 0 : 1
      const mouth = Math.floor(act.t / (SING_BEAT / 2)) % 2 ? "open" : "close"
      const eyes = Math.floor(act.t / (SING_BEAT * 4)) % 2 ? "happy" : ch.blink > 0 ? "blink" : "open"
      this.drawMe(g, left, top, { eyes, mouth, hideHand: true })
      drawHeldMic(g, left, top, this.gearSet())
      return
    }
    // もぐもぐ：食べている間は口のあたりで小さく上下する
    const munch = this.eating ? Math.round(Math.abs(Math.sin(this.eating.t * 10))) : 0
    // 歩く ときは 行く ほうを むく（新しい 絵。前の 絵は まえ だけ）
    const dir = ch.mode === "walk" ? facing8(ch.tx - ch.x, ch.ty - ch.y, "down") : "down"
    this.drawMe(g, left, top + munch, { eyes: ch.blink > 0 || this.eating ? "blink" : "open", frame: ch.frame, dir })
    if (this.eating) this.drawEating(g, left, top)
  }

  gearSet() {
    return this.store.state ? equipped(this.store.state) : {}
  }

  // そうびしているもの（あたま・からだ・て・せなか・あし）で描く
  drawMe(g, left, top, opts = {}) {
    drawDressed(g, left, top, this.gearSet(), opts)
  }

  // 食べているごはん（ひと口ごとに右から少しずつ減る）
  drawEating(g, left, top) {
    const { food, t } = this.eating
    const bites = Math.min(3, Math.floor((t / EAT_SEC) * 4))
    const keep = 12 - bites * 4
    if (keep <= 0) return
    const ox = left + SPRITE_W - 6
    const oy = top + 13
    g.save()
    g.beginPath()
    g.rect(ox, oy, keep, 12)
    g.clip()
    drawFood(g, food, ox, oy)
    g.restore()
  }

  // ---- コイン・ハート・きらきら ----
  dropCoin(x, y) {
    this.particles.push({ type: "coin", x, y, vx: (Math.random() - 0.5) * 30, vy: -40, floor: Math.min(FLOOR_BOTTOM, this.chara.y + 2 + Math.random() * 4), life: 1.6, bounced: 0 })
  }

  hearts(n) {
    for (let i = 0; i < n; i++) {
      this.particles.push({ type: "heart", x: this.chara.x - 8 + Math.random() * 16, y: this.chara.y - SPRITE_H - Math.random() * 4, vx: (Math.random() - 0.5) * 8, vy: -14 - Math.random() * 8, life: 1.2 + Math.random() * 0.6, delay: i * 0.12 })
    }
  }

  // 歌っているときの 音符（マイクのあたりから ふわっと上がる）
  note() {
    const ch = this.chara
    this.particles.push({ type: "note", x: ch.x + 4 + Math.random() * 4, y: ch.y - SPRITE_H + 8, vx: 4 + Math.random() * 6, vy: -12 - Math.random() * 6, life: 1.6, color: pick(NOTE_COLORS), wob: Math.random() * 6 })
  }

  sparkle(x, y) {
    for (let i = 0; i < 4; i++) {
      this.particles.push({ type: "spark", x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 6, vx: 0, vy: -10, life: 0.6 + Math.random() * 0.3, delay: i * 0.08 })
    }
  }

  tickParticles(dt) {
    for (const p of this.particles) {
      if (p.delay > 0) { p.delay -= dt; continue }
      p.life -= dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.type === "note") p.x += Math.sin(p.life * 6 + p.wob) * 0.15
      if (p.type === "coin") {
        p.vy += 160 * dt
        if (p.y >= p.floor && p.vy > 0) {
          p.y = p.floor
          p.vy = p.bounced++ < 2 ? -p.vy * 0.45 : 0
          p.vx *= 0.5
        }
      }
    }
    this.particles = this.particles.filter((p) => p.life > 0)
  }

  drawParticles(g) {
    for (const p of this.particles) {
      if (p.delay > 0) continue
      const x = Math.round(p.x)
      const y = Math.round(p.y)
      g.globalAlpha = Math.min(1, p.life / 0.4)
      if (p.type === "coin") drawCoin(g, x, y)
      else if (p.type === "heart") drawHeart(g, x, y)
      else if (p.type === "note") drawNote(g, x, y, p.color)
      else drawSpark(g, x, y)
      g.globalAlpha = 1
    }
  }

  // ---- タップ ----
  tap(event) {
    if (!this.started || this.story) return
    if (this.battle) return // バトル中は 下の コマンド で えらぶ
    const rect = this.canvasTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * this.view.VW - this.view.ox
    const y = ((event.clientY - rect.top) / rect.height) * this.view.VH - this.view.oy
    const ch = this.chara
    const hit = x >= ch.x - SPRITE_W / 2 - 2 && x <= ch.x + SPRITE_W / 2 + 2 && y >= ch.y - SPRITE_H - 2 && y <= ch.y + 2
    if (hit && this.eating) return
    if (hit) {
      // Dettyan をタップ：止まってこっちを向き、おせわのメニューが出る
      this.lookAtMe(MENU_SEC)
      this.sound.se("talk")
      this.say(this.ownerLine("tap", "なに？", 0.7))
      this.showMenu()
    } else if (y >= FLOOR_TOP - 4 && !this.eating) {
      // 床をタップ：そこまで歩いていく
      this.hideBubble()
      this.hideMenu()
      this.walkTo(x, y)
    }
  }

  lookAtMe(sec) {
    this.standUp()
    const ch = this.chara
    ch.plan = null
    ch.mode = "look"
    ch.frame = 0
    ch.until = sec
  }

  showMenu() {
    this.menuTarget.hidden = false
  }

  hideMenu() {
    if (this.hasMenuTarget) this.menuTarget.hidden = true
  }

  // ---- おせわ（なでる・そうじ・話しかける） ----
  care(event) {
    const kind = event.params.kind
    if (!this.started || this.eating) return
    const now = this.store.now()
    const dirtBefore = dirtCount(this.store.state, now)
    let result = null
    this.store.update((s) => { result = doCare(s, kind, now) })
    if (!result) return
    this.lookAtMe(3)
    this.hideMenu()

    if (kind === "pet") {
      this.sound.se("pet")
      if (result.gokigen > 1) {
        this.chara.hop = 0.6
        this.hearts(2)
      }
    } else if (kind === "clean") {
      this.sound.se("sweep")
      for (let i = 0; i < dirtBefore; i++) this.sparkle(...this.dirtSpots[i])
    } else {
      this.sound.se("talk")
    }
    this.say(OWNER_LINES[kind] ? this.ownerLine(kind, result.line) : result.line)

    if (result.coins > 0) {
      setTimeout(() => {
        this.sound.se("coin")
        if (kind === "clean") {
          for (let i = 0; i < result.coins; i++) {
            const [dx, dy] = this.dirtSpots[i % this.dirtSpots.length]
            this.particles.push({ type: "coin", x: dx, y: dy - 10, vx: 0, vy: -30, floor: dy, life: 1.6, bounced: 0 })
          }
        } else {
          for (let i = 0; i < result.coins; i++) this.dropCoin(this.chara.x, this.chara.y - SPRITE_H + 4)
        }
        this.pop(`💰+${result.coins}`)
        this.renderHud(this.store.state)
      }, 350)
    }
    this.renderHud(this.store.state)
  }

  // ---- ショップ・持ち物 ----
  openShop() {
    if (!this.started || this.battle) return
    this.sound.se("tap")
    this.hideMenu()
    this.sheetMode = "shop"
    this.renderSheet()
    this.sheetTarget.hidden = false
  }

  // ショップのタブ（たべもの・いしょう）
  shopTabs() {
    const tabs = el("div", "dt-tabs")
    tabs.setAttribute("role", "tablist")
    for (const [id, label] of [["food", "🍙 たべもの"], ["wear", "👗 いしょう"], ["home", "🏠 いえ・かぐ"]]) {
      const on = (this.shopTabId || "food") === id
      const b = el("button", "dt-tabs__tab" + (on ? " is-on" : ""), label)
      b.type = "button"
      b.setAttribute("role", "tab")
      b.setAttribute("aria-selected", String(on))
      b.dataset.action = "dettyan-game#shopTab"
      b.dataset.dettyanGameTabParam = id
      tabs.append(b)
    }
    return tabs
  }

  shopTab(event) {
    const tab = event.params.tab
    if (this.shopTabId === tab) return
    this.sound.se("tap")
    this.shopTabId = tab
    this.renderSheet()
    this.sheetListTarget.scrollTop = 0
  }

  // いしょう：パーツごとに。持っているものは「そうびする」
  renderWearShop(list, s) {
    for (const slot of SLOTS) {
      const items = shopGear().filter((g) => g.slot === slot.id)
      if (!items.length) continue
      list.append(el("div", "dt-sheet__section", `${slot.icon} ${slot.name}`))
      for (const gear of items) {
        let button
        let sub
        if (s.gear.owned[gear.id]) {
          const on = s.gear[gear.slot] === gear.id
          button = el("button", "dt-item__button" + (on ? " dt-item__button--on" : ""), on ? "はずす" : "そうびする")
          button.dataset.action = "dettyan-game#equip"
          sub = on ? "もっている・そうび中" : "もっている"
        } else {
          button = el("button", "dt-item__button", "かう")
          button.disabled = s.money < gear.price
          button.dataset.action = "dettyan-game#buyWear"
          sub = `💰${gear.price}`
        }
        button.type = "button"
        button.dataset.dettyanGameIdParam = gear.id
        list.append(gearRow(gear, sub, button))
      }
    }
  }

  // 🏠 いえ・かぐ：さいしょは マイホーム だけ買える。家を買ったら 家具（買うと すぐ へや に おかれる）
  renderHomeShop(list, s) {
    const house = hasHouse(s)
    list.append(el("div", "dt-sheet__section", "🏠 いえ"))
    const hb = el("button", "dt-item__button" + (house ? " dt-item__button--on" : ""), house ? "もっている" : "かう")
    hb.type = "button"
    hb.disabled = house || s.money < HOUSE.price
    hb.dataset.action = "dettyan-game#buyHome"
    hb.dataset.dettyanGameIdParam = HOUSE.id
    list.append(emojiRow(HOUSE.icon, HOUSE.name, HOUSE.desc, house ? "すんでいる" : `💰${HOUSE.price}　いまは テントで 野宿`, hb))
    list.append(el("div", "dt-sheet__section", "🛋️ かぐ"))
    if (!house) list.append(el("div", "dt-sheet__none", "マイホーム を 買ったら、家具を 買って おけるよ"))
    for (const item of FURNITURE) {
      const owned = hasFurniture(s, item.id)
      const need = (item.needs || []).map(findFurniture).find((n) => !hasFurniture(s, n.id))
      const b = el("button", "dt-item__button" + (owned ? " dt-item__button--on" : ""), owned ? "おいてある" : "かう")
      b.type = "button"
      b.disabled = owned || !house || !!need || s.money < item.price
      b.dataset.action = "dettyan-game#buyHome"
      b.dataset.dettyanGameIdParam = item.id
      const sub = owned ? "へや に おいてある" : need ? `💰${item.price}　さきに ${need.name} が いるよ` : `💰${item.price}`
      list.append(emojiRow(item.icon, item.name, item.desc, sub, b))
    }
  }

  buyHome(event) {
    const id = event.params.id
    let r = null
    this.store.update((s) => { r = id === HOUSE.id ? buyHouse(s) : buyFurniture(s, id) })
    if (!r.ok) {
      this.sound.se("no")
      if (r.reason === "money") this.toast("コインが たりないよ")
      return
    }
    this.sound.se("buy")
    this.rebuildHome()
    this.toast(id === HOUSE.id ? "🏠 マイホーム を 買った！" : `${r.item.icon} ${r.item.name} を おいたよ`)
    this.renderHud(this.store.state)
    this.runStoryCheck()
  }

  buyWear(event) {
    let result = null
    this.store.update((s) => { result = buyGear(s, event.params.id) })
    if (result.ok) {
      this.sound.se("buy")
      this.toast(`${result.gear.name} を かったよ！`)
    } else {
      this.sound.se("no")
      if (result.reason === "money") this.toast("コインが たりないよ")
    }
    this.renderHud(this.store.state)
    this.renderSheet()
  }

  openBag() {
    if (!this.started || this.battle) return
    this.sound.se("tap")
    this.hideMenu()
    this.sheetMode = "bag"
    this.renderSheet()
    this.sheetTarget.hidden = false
  }

  closeSheet() {
    this.sound.se("tap")
    if (this.sheetMode === "result") this.backFromBattle()
    this.sheetTarget.hidden = true
    this.sheetMode = null
  }

  buy(event) {
    const id = event.params.id
    let result = null
    this.store.update((s) => { result = buyFood(s, id) })
    if (result.ok) {
      this.sound.se("buy")
      this.toast(`${result.food.name} を かったよ`)
    } else {
      this.sound.se("no")
      if (result.reason === "money") this.toast("コインが たりないよ")
    }
    this.renderHud(this.store.state)
    this.renderSheet()
  }

  feed(event) {
    const id = event.params.id
    if (this.eating) return
    let result = null
    this.store.update((s) => { result = feedFood(s, id) })
    if (!result.ok) {
      this.sound.se("no")
      if (result.reason === "full") this.toast("おなか いっぱい みたい")
      this.renderSheet()
      return
    }
    // 食べるところを見せる（セーブはもう済んでいる）
    this.sheetTarget.hidden = true
    this.sheetMode = null
    this.hideBubble()
    this.lookAtMe(EAT_SEC + 3)
    this.eating = { food: result.food, t: 0, result }
    this.sound.se("eat")
    this.eatSoundTimer = setTimeout(() => this.sound.se("eat"), 700)
  }

  finishEating() {
    const { result } = this.eating
    this.eating = null
    this.chara.until = 3
    this.renderHud(this.store.state)
    if (result.food.favorite) {
      // 好物：大きくよろこぶ
      this.sound.se("happy")
      this.chara.hop = 1.2
      this.hearts(6)
    } else {
      this.chara.hop = 0.5
      this.hearts(1)
    }
    this.say(result.food.favorite ? this.ownerLine("favorite", result.food.line) : result.food.line)
    this.pop(`げんき+${Math.round(result.genki)} ごきげん+${Math.round(result.gokigen)}`)
  }

  renderSheet() {
    if (!this.sheetMode) return
    const s = this.store.state
    const list = this.sheetListTarget
    list.replaceChildren()
    this.sheetMoneyTarget.textContent = `💰 ${s.money.toLocaleString()}`

    if (this.sheetMode === "shop") {
      this.sheetTitleTarget.textContent = "🛒 ショップ"
      list.append(this.shopTabs())
      if (this.shopTabId === "wear") return this.renderWearShop(list, s)
      if (this.shopTabId === "home") return this.renderHomeShop(list, s)
      for (const food of FOODS) {
        const have = s.items[food.id] || 0
        const button = el("button", "dt-item__button", "かう")
        button.type = "button"
        button.disabled = s.money < food.price
        button.dataset.action = "dettyan-game#buy"
        button.dataset.dettyanGameIdParam = food.id
        list.append(itemRow(food, `💰${food.price}${have ? `・もっている ${have}` : ""}`, button))
      }
    } else if (this.sheetMode === "quest") {
      this.renderQuest(list, s)
    } else if (this.sheetMode === "result") {
      this.renderResult(list, s)
    } else if (this.sheetMode === "gear") {
      this.renderGear(list, s)
    } else if (this.sheetMode === "status") {
      this.renderStatus(list, s)
    } else {
      this.sheetTitleTarget.textContent = "🎒 もちもの"
      const owned = FOODS.filter((f) => s.items[f.id] > 0)
      if (owned.length === 0) {
        const empty = el("div", "dt-sheet__empty", "なにも もっていないよ。")
        const go = el("button", "dt-item__button", "🛒 ショップへ")
        go.type = "button"
        go.dataset.action = "dettyan-game#openShop"
        empty.append(go)
        list.append(empty)
      }
      for (const food of owned) {
        const button = el("button", "dt-item__button", "あげる")
        button.type = "button"
        button.dataset.action = "dettyan-game#feed"
        button.dataset.dettyanGameIdParam = food.id
        list.append(itemRow(food, `× ${s.items[food.id]}`, button))
      }
      // そうび は べつの画面
      const gearCount = GEAR.filter((g) => s.gear.owned[g.id]).length
      list.append(el("div", "dt-sheet__section", `👕 そうび（${gearCount}/${GEAR.length}）`))
      const go = el("button", "dt-item__button dt-sheet__wide", "👕 そうび を ひらく")
      go.type = "button"
      go.dataset.action = "dettyan-game#openGear"
      list.append(go)
    }
  }

  // ---- そうび（あたま・からだ・て・せなか・あし） ----
  openGear() {
    if (!this.started || this.battle) return
    this.sound.se("tap")
    this.hideMenu()
    this.sheetMode = "gear"
    this.renderSheet()
    this.sheetTarget.hidden = false
  }

  renderGear(list, s) {
    this.sheetTitleTarget.textContent = "👕 そうび"
    // いまの すがた と つよさ
    const top = el("div", "dt-gear-top")
    const preview = document.createElement("canvas")
    preview.className = "dt-gear-top__me"
    preview.width = 30
    preview.height = 31
    drawDressed(preview.getContext("2d"), 5, 5, equipped(s))
    const st = dettyanStats(s)
    const bonus = gearBonus(s)
    const job = findJob(s.dettyan.job)
    const stats = el("div", "dt-gear-top__stats")
    stats.append(el("div", "dt-gear-top__lv", `Lv${s.dettyan.level} ${job.icon}${job.name}`))
    for (const k of STATS) stats.append(el("div", "", `${k.name} ${st[k.id]}${bonus[k.id] ? `（そうび +${bonus[k.id]}）` : ""}${k.id === "hp" ? `　HP ${st.maxHp}` : ""}`))
    top.append(preview, stats)
    list.append(top)

    for (const slot of SLOTS) {
      const owned = GEAR.filter((g) => g.slot === slot.id && s.gear.owned[g.id])
      const wearing = findGear(s.gear[slot.id])
      list.append(el("div", "dt-sheet__section", `${slot.icon} ${slot.name}${wearing ? `：${wearing.name}` : "：なし"}`))
      if (owned.length === 0) list.append(el("div", "dt-sheet__none", "まだ ない（🗺️ ぼうけん や 🛒 ショップ で 手に入るよ）"))
      for (const gear of owned) {
        const on = s.gear[gear.slot] === gear.id
        const button = el("button", "dt-item__button" + (on ? " dt-item__button--on" : ""), on ? "はずす" : "そうびする")
        button.type = "button"
        button.dataset.action = "dettyan-game#equip"
        button.dataset.dettyanGameIdParam = gear.id
        list.append(gearRow(gear, on ? "そうび中" : "", button))
      }
    }
  }

  equip(event) {
    let result = null
    this.store.update((s) => { result = toggleGear(s, event.params.id) })
    if (!result?.ok) return
    this.sound.se(result.on ? "buy" : "tap")
    this.toast(result.on ? `${result.gear.name} を そうびした` : `${result.gear.name} を はずした`)
    this.renderSheet()
  }

  // ---- 📖 おはなし ----
  // 目標を たっせい していたら、その おはなし を見せる（バトル中・おはなし中は あとで）
  runStoryCheck() {
    if (!this.store.state || this.story || this.battle) return
    let scenes = []
    this.store.update((s) => { scenes = checkStory(s) })
    this.renderHud(this.store.state)
    if (scenes.length) this.playStory(scenes)
  }

  playStory(ids, onDone = null) {
    const pages = ids.flatMap((id) => SCENES[id] || [])
    if (!pages.length) return onDone?.()
    this.standUp()
    this.hideMenu()
    this.hideBubble()
    this.sheetTarget.hidden = true
    this.sheetMode = null
    this.story = { pages, i: 0, t: 0, onDone }
    clearTimeout(this.toastTimer)
    this.toastTarget.hidden = true
    this.element.classList.add("is-story")
    this.storyTarget.hidden = false
    this.showStoryPage()
  }

  showStoryPage() {
    const p = this.story.pages[this.story.i]
    this.story.t = 0
    this.storyWhoTarget.textContent = p.who || ""
    this.storyWhoTarget.hidden = !p.who
    this.storyTextTarget.textContent = p.text
    this.sound.se(p.bg === "flash" ? "levelup" : "talk")
  }

  storyNext() {
    if (!this.story) return
    this.story.i += 1
    if (this.story.i >= this.story.pages.length) return this.endStory()
    this.showStoryPage()
  }

  storySkip() {
    if (!this.story) return
    this.sound.se("tap")
    this.endStory()
  }

  endStory() {
    const done = this.story?.onDone
    this.story = null
    this.storyTarget.hidden = true
    this.element.classList.remove("is-story")
    this.renderHud(this.store.state)
    if (done) done()
  }

  // おはなし の けしき と Dettyan
  // 📖 おはなし の けしき（新しい 絵。広く）
  drawStory(g, area) {
    const p = this.story.pages[this.story.i]
    const t = this.story.t
    const now = this.store.now()
    const s = this.store.state
    let at = { x: 64, y: 64 } // 足もと（下の ことば の箱に かくれない高さ）
    if (p.bg === "flash") return drawFlashWide(g, area, t)
    if (p.bg === "stream") {
      // もとの世界の へや（ぜんぶ ある）。うしろすがたで 配信中
      g.drawImage(this.wide("streamRoom", (a) => createRoom(null, a)), area.x, area.y)
      drawRoomLive(g, { now, t, mode: "work", workT: t, f: null })
      this.drawMe(g, SEAT.left, SEAT.top + (Math.floor(t * 4) % 2), { view: "back" })
      drawChair(g)
      return
    }
    if (p.bg === "town") {
      g.drawImage(this.wide("storyTown", (a) => createStoryTownWide(this.sprout, a)), area.x, area.y)
      drawStoryTownLive(g, this.sprout, t)
      at = { x: 40, y: 70 }
    } else if (p.bg === "camp") {
      g.drawImage(this.wide("camp", (a) => createCampWide(this.sprout, a)), area.x, area.y)
      drawCampfire(g, now, t)
      at = { x: 88, y: 70 }
    } else {
      const f = s?.home.furniture || {}
      g.drawImage(this.wide("room", (a) => createRoom(f, a)), area.x, area.y)
      drawRoomLive(g, { now, t, mode: p.pose === "back" ? "work" : null, workT: t, f })
      if (p.pose === "back" && f.chair) {
        this.drawMe(g, SEAT.left, SEAT.top, { view: "back" })
        drawChair(g)
        return
      }
    }
    if (p.pose === "none") return
    const blink = t % 3 > 2.85
    this.drawMe(g, at.x - SPRITE_W / 2, at.y - SPRITE_H, { eyes: blink ? "blink" : "open" })
  }


  // ---- 📊 つよさ（ステータスの ふりわけ・職業・スキル） ----
  openStatus() {
    if (!this.started || this.battle) return
    if (this.sheetMode === "result") this.backFromBattle()
    this.sound.se("tap")
    this.hideMenu()
    this.sheetMode = "status"
    this.renderSheet()
    this.sheetTarget.hidden = false
  }

  renderStatus(list, s) {
    this.sheetTitleTarget.textContent = "📊 つよさ"
    const lv = s.dettyan.level
    const st = dettyanStats(s)
    const job = findJob(s.dettyan.job)
    list.append(el("div", "dt-sheet__note", `Lv${lv}　つぎのレベルまで けいけんち ${expToNext(lv) - s.dettyan.exp}（レベルが上がると ポイント +${POINTS_PER_LEVEL}）`))

    // しょくぎょう（さいしょは みならい。Lv5 から ジョブチェンジ）
    const can = canChangeJob(s)
    list.append(el("div", "dt-sheet__section", `🧑‍💼 しょくぎょう：${job.icon} ${job.name}`))
    list.append(el("div", "dt-sheet__note", job.desc))
    list.append(el("div", "dt-sheet__section", can ? "🔄 ジョブチェンジ（いつでも ただで かえられるよ）" : `🔒 ジョブチェンジ は Lv${JOB_CHANGE_LEVEL} から（あと ${JOB_CHANGE_LEVEL - lv} レベル）`))
    const jobs = el("div", "dt-jobs")
    for (const j of JOBS.filter((x) => x.tier >= 1)) {
      const on = j.id === job.id
      const b = el("button", "dt-jobs__job" + (on ? " is-on" : ""))
      b.type = "button"
      b.disabled = !can
      b.dataset.action = "dettyan-game#changeJob"
      b.dataset.dettyanGameIdParam = j.id
      b.setAttribute("aria-pressed", String(on))
      b.append(el("span", "dt-jobs__icon", can ? j.icon : "🔒"), el("span", "dt-jobs__name", j.name))
      jobs.append(b)
    }
    list.append(jobs)

    // ステータス
    const pts = s.dettyan.points || 0
    list.append(el("div", "dt-sheet__section", `📊 ステータス　のこり ${pts} ポイント`))
    list.append(el("div", "dt-sheet__note", `1ポイントで どれも +1。HP は たいりょく × ${HP_PER_VIT}`))
    for (const k of STATS) {
      const row = el("div", "dt-stat-row")
      const name = el("div", "dt-stat-row__name", k.name)
      const value = el("div", "dt-stat-row__value", String(st[k.id]))
      const parts = [`レベル ${st.parts.level[k.id]}`]
      if (st.parts.alloc[k.id]) parts.push(`ふりわけ +${st.parts.alloc[k.id]}`)
      if (st.parts.gear[k.id]) parts.push(`そうび +${st.parts.gear[k.id]}`)
      const sub = el("div", "dt-stat-row__sub", `${parts.join("・")}　${k.desc}`)
      const minus = el("button", "dt-stat-row__btn", "−")
      minus.type = "button"
      minus.disabled = !(s.dettyan.alloc?.[k.id] > 0)
      minus.dataset.action = "dettyan-game#statMinus"
      minus.dataset.dettyanGameIdParam = k.id
      minus.setAttribute("aria-label", `${k.name} を へらす`)
      const plus = el("button", "dt-stat-row__btn dt-stat-row__btn--plus", "+")
      plus.type = "button"
      plus.disabled = pts <= 0
      plus.dataset.action = "dettyan-game#statPlus"
      plus.dataset.dettyanGameIdParam = k.id
      plus.setAttribute("aria-label", `${k.name} に ふる`)
      const body = el("div", "dt-stat-row__body")
      body.append(name, sub)
      row.append(body, value, minus, plus)
      list.append(row)
    }
    list.append(el("div", "dt-sheet__note", `❤️ HP ${st.maxHp}（たいりょく ${st.hp} × ${HP_PER_VIT}）　💧 MP ${st.mp}（まほう が上がると ふえる。毎ターン ${job.mpRegen || 1} もどる）`))
    const tools = el("div", "dt-stat-tools")
    const auto = el("button", "dt-item__button", "🤖 おまかせ")
    auto.type = "button"
    auto.disabled = pts <= 0
    auto.dataset.action = "dettyan-game#statAuto"
    const reset = el("button", "dt-item__button dt-item__button--on", "↩ ふりなおし")
    reset.type = "button"
    reset.disabled = !Object.values(s.dettyan.alloc || {}).some((v) => v > 0)
    reset.dataset.action = "dettyan-game#statReset"
    tools.append(auto, reset)
    list.append(tools)

    // スキル
    list.append(el("div", "dt-sheet__section", `✨ スキル（${job.name}）`))
    for (const k of SKILLS.filter((x) => x.job === job.id).sort((a, b) => a.level - b.level)) {
      const learned = k.level <= lv
      const row = el("div", "dt-item" + (learned ? "" : " dt-item--locked"))
      const icon = el("div", "dt-item__icon dt-item__icon--emoji", k.icon)
      const body = el("div", "dt-item__body")
      body.append(el("div", "dt-item__name", `${k.name}　MP ${k.mp}`))
      body.append(el("div", "dt-item__effect", k.desc))
      body.append(el("div", "dt-item__sub", learned ? "おぼえている" : `Lv${k.level} で おぼえる`))
      row.append(icon, body)
      list.append(row)
    }
  }

  statPlus(event) {
    let ok = false
    this.store.update((s) => { ok = addPoint(s, event.params.id) })
    this.sound.se(ok ? "tap" : "no")
    this.renderHud(this.store.state)
  }

  statMinus(event) {
    let ok = false
    this.store.update((s) => { ok = removePoint(s, event.params.id) })
    this.sound.se(ok ? "tap" : "no")
    this.renderHud(this.store.state)
  }

  statAuto() {
    let n = 0
    this.store.update((s) => { n = autoAllocate(s) })
    if (!n) return
    this.sound.se("buy")
    this.toast(`🤖 おまかせで ${n} ポイント ふったよ`)
    this.renderHud(this.store.state)
  }

  statReset() {
    let n = 0
    this.store.update((s) => { n = resetPoints(s) })
    if (!n) return
    this.sound.se("tap")
    this.toast(`↩ ${n} ポイント もどしたよ`)
    this.renderHud(this.store.state)
  }

  changeJob(event) {
    const id = event.params.id
    if (this.store.state.dettyan.job === id) return
    let ok = false
    this.store.update((s) => { ok = setJob(s, id) })
    if (!ok) {
      this.sound.se("no")
      this.toast(`ジョブチェンジ は Lv${JOB_CHANGE_LEVEL} から だよ`)
      return
    }
    const job = findJob(id)
    this.sound.se("happy")
    this.toast(`🔄 ${job.icon} ${job.name} に ジョブチェンジ した！`)
    this.renderHud(this.store.state)
  }

  // ---- 🗺️ ぼうけん（行き先をえらぶ → バトル。手動 か 🤖オート） ----
  openQuest() {
    if (!this.started || this.battle || this.eating) return
    this.sound.se("tap")
    this.hideMenu()
    this.sheetMode = "quest"
    this.renderSheet()
    this.sheetTarget.hidden = false
  }

  renderQuest(list, s) {
    this.sheetTitleTarget.textContent = "🗺️ ぼうけん"
    const st = dettyanStats(s)
    const job = findJob(s.dettyan.job)
    list.append(el("div", "dt-sheet__note", `Lv${s.dettyan.level} ${job.icon}${job.name}・HP ${st.maxHp}・MP ${st.mp}・こうげき ${st.atk}・まもり ${st.def}・まほう ${st.mag}　げんき ${Math.floor(s.stats.genki)}/${maxGenki(s)}`))
    if (s.dettyan.points > 0) {
      const go = el("button", "dt-item__button dt-sheet__wide", `📊 ポイントが ${s.dettyan.points} あるよ（ふってから 行こう）`)
      go.type = "button"
      go.dataset.action = "dettyan-game#openStatus"
      list.append(go)
    }
    for (const place of PLACES) {
      const check = canGo(s, place.id)
      const button = el("button", "dt-item__button", check.reason === "level" ? `Lv${place.level}から` : "いく")
      button.type = "button"
      button.disabled = !check.ok
      button.dataset.action = "dettyan-game#go"
      button.dataset.dettyanGameIdParam = place.id
      const row = el("div", "dt-item" + (check.reason === "level" ? " dt-item--locked" : ""))
      const icon = el("div", "dt-item__icon dt-item__icon--emoji", place.icon)
      const body = el("div", "dt-item__body")
      body.append(el("div", "dt-item__name", place.name))
      const kinds = [...new Set(place.monsters)].map((id) => MONSTERS[id].name).join("・")
      body.append(el("div", "dt-item__effect", `げんき −${place.genki}`))
      body.append(el("div", "dt-item__sub", check.reason === "genki" ? "げんき が たりないよ" : kinds))
      row.append(icon, body, button)
      list.append(row)
    }
  }

  go(event) {
    if (this.battle) return
    const id = event.params.id
    const before = { level: this.store.state.dettyan.level }
    let r = null
    // げんき は ここで使う（とちゅうで 閉じても もどらない）。コインと経験値は たおすたびに セーブする
    this.store.update((s) => { r = startAdventure(s, id, Math.floor(Math.random() * 2 ** 31)) })
    if (!r.ok) {
      this.sound.se("no")
      this.toast(r.reason === "genki" ? "げんき が たりないよ" : `Lv${r.place?.level} から 行けるよ`)
      return
    }
    this.store.flush()
    this.sheetTarget.hidden = true
    this.sheetMode = null
    this.hideBubble()
    this.hideMenu()
    this.standUp()
    this.chara.plan = null
    this.particles = []
    this.startBattle(r, before)
  }

  // たんけん の はじまり：ついた → 歩く → みつけた！ →（宝箱・友達）→ スライム（battle.intro。もらうものは startAdventure で もう もらっている）
  startBattle({ battle, place }, before) {
    const speed = this.store.state.settings.battleSpeed
    this.battle = {
      b: battle, place, before,
      auto: !!this.store.state.settings.autoBattle,
      speed: BATTLE_SPEEDS.includes(speed) ? speed : 1,
      menu: "main", locked: true, queue: [{ t: "arrive" }, ...battle.intro], cur: null, t: 0, wait: 0,
      view: { myHp: battle.me.hp, myMp: battle.me.mp, foe: null, foeHp: 0, foeMax: 1, lunge: 0, foeLunge: 0, flashMe: 0, flashFoe: 0, dying: 0, hop: 0, bob: 0,
        walk: 0, scroll: 0, find: 0, thing: null }
    }
    // バトル中は、知らせ（あらわれた！など）を たいりょくのバー の下に出す（CSS の .is-battle）
    this.canvasTarget.parentElement.classList.add("is-battle")
    this.element.classList.add("is-battling") // 下のボタンの代わりに コマンド を出す（CSS）
    this.cmdTarget.hidden = false
    this.sound.playSong("battle")
    this.renderCmd()
  }

  // 1ターン すすめる（手動のボタン か オート）
  doTurn(action) {
    const B = this.battle
    if (!B || B.b.over || B.cur || B.queue.length) return
    const events = takeTurn(B.b, action)
    // たおした分の コインと経験値・宝箱・友達に もらったもの は すぐ セーブ（とちゅうで 閉じても なくならない）
    if (events.some((e) => e.t === "down" || e.t === "chest" || e.t === "friend")) this.store.update((s) => grantEvents(s, events))
    B.view.myMp = B.b.me.mp
    B.queue.push(...events)
    B.locked = true
    B.menu = "main"
    this.renderCmd()
  }

  tickBattle(dt) {
    const B = this.battle
    const v = B.view
    v.bob += dt
    v.lunge = Math.max(0, v.lunge - dt)
    if (v.swing) { v.swing.t -= dt; if (v.swing.t <= 0) v.swing = null }
    v.foeLunge = Math.max(0, v.foeLunge - dt)
    v.flashMe = Math.max(0, v.flashMe - dt)
    v.flashFoe = Math.max(0, v.flashFoe - dt)
    v.hop = Math.max(0, v.hop - dt)
    v.find = Math.max(0, v.find - dt)
    if (v.walk > 0) {
      // 歩いている：けしきが ながれて、ぺたぺた
      const before = Math.floor(v.walk * 6 * B.speed)
      v.walk = Math.max(0, v.walk - dt)
      v.scroll += dt * WALK_PX_PER_SEC * B.speed
      if (Math.floor(v.walk * 6 * B.speed) !== before) this.sound.se("step")
    }
    if (v.dying > 0) v.dying = Math.min(1, v.dying + dt * 2.5)
    this.tickParticles(dt)
    if (B.cur) {
      B.t += dt
      if (B.t < B.cur.dur) return
      B.cur = null
    }
    if (B.queue.length) {
      B.cur = B.queue.shift()
      B.t = 0
      B.cur.dur = ((EVENT_SEC[B.cur.t] || 0.5) * (B.auto ? 0.7 : 1)) / B.speed
      this.playEvent(B.cur)
      return
    }
    if (B.b.over) return this.endBattle()
    if (B.locked) {
      B.locked = false
      B.wait = AUTO_WAIT_SEC / B.speed
      this.renderCmd()
    }
    if (B.auto) {
      B.wait -= dt
      if (B.wait <= 0) this.doTurn(autoAction(B.b))
    }
  }

  // できごと を1つ見せる（音・ゆれ・数字・知らせ）
  playEvent(e) {
    this.showEvent(e)
    this.renderCmdStatus()
  }

  showEvent(e) {
    const B = this.battle
    const v = B.view
    if (e.t === "arrive") {
      this.toast(`${B.place.icon} ${B.place.name} に ついた！`)
    } else if (e.t === "walk") {
      v.walk = B.cur.dur
      v.foe = null
      v.thing = null
    } else if (e.t === "find") {
      v.find = B.cur.dur
      v.thing = e.kind === "chest" ? { kind: "chest", open: 0 } : null
      this.sound.se("talk")
      this.toast("❗ なにかを みつけた！")
    } else if (e.t === "chest") {
      v.thing = { kind: "chest", open: 1 }
      this.sparkle(BATTLE_FOE_X, BATTLE_FEET - 14)
      if (e.coins) {
        this.sound.se("coin")
        this.popAt(`💰+${e.coins}`, BATTLE_FOE_X, BATTLE_FEET - 26)
        this.toast(`📦 たからばこ！ 💰${e.coins} はいってた！`)
      } else if (e.food) {
        this.sound.se("happy")
        this.toast(`📦 たからばこ！ ${findFood(e.food)?.name || "ごはん"} を みつけた！`)
      } else if (e.gear) {
        this.sound.se("levelup")
        this.toast(`📦 たからばこ！ ✨${findGear(e.gear)?.name || "そうび"} を みつけた！`)
      }
    } else if (e.t === "friend") {
      const f = findFriend(e.friend)
      v.thing = { kind: "friend", friend: f }
      this.sound.se("happy")
      // ことば は 知らせ に、もらったもの は 小さな 文字で（長いと はみだすので 分ける）
      this.toast(`🤝 ${f.name}「${e.line}」`)
      if (e.heal > 0) {
        v.myHp = e.hp
        this.popAt(`+${e.heal}`, BATTLE_ME_X, BATTLE_FEET - 30)
        this.sparkle(BATTLE_ME_X, BATTLE_FEET - 14)
      } else if (e.mp !== undefined) {
        v.myMp = B.b.me.maxMp
        this.popAt("MP まんたん！", BATTLE_ME_X, BATTLE_FEET - 30)
      } else if (e.food) {
        this.popAt(`${findFood(e.food)?.name || "ごはん"} を もらった！`, BATTLE_ME_X + 10, BATTLE_FEET - 30)
      }
    } else if (e.t === "appear") {
      v.thing = null
      v.foe = MONSTERS[e.foe]
      v.foeId = e.foe
      v.foeHp = e.hp
      v.foeMax = e.maxHp
      v.dying = 0
      this.sound.se("talk")
      this.toast(`${v.foe.name} が あらわれた！`)
    } else if (e.t === "act" && e.who === "me") {
      const skill = e.skill ? findSkill(e.skill) : null
      if (skill) this.toast(`${skill.icon} ${skill.name}！`)
      if (e.heal !== undefined && !e.dmg) {
        // 回復
        v.myHp = e.hp
        this.sound.se("pet")
        this.popAt(`+${e.heal}`, BATTLE_ME_X, BATTLE_FEET - 30)
        this.sparkle(BATTLE_ME_X, BATTLE_FEET - 14)
        v.swing = { tool: "can", t: 0.45, dur: 0.45, still: true } // じょうろを かたむける
        return
      }
      v.lunge = 0.3
      // おの を ふる（まほう は じょうろ）
      v.swing = { tool: skill?.type === "magic" ? "can" : "axe", t: 0.3, dur: 0.3 }
      v.flashFoe = 0.25
      v.foeHp = e.foeHp
      this.sound.se("hit")
      const hits = e.hits > 1 ? `${e.hits}回 ` : ""
      this.popAt(e.crit ? `かいしん！${hits}${e.dmg}` : `${hits}${e.dmg}`, BATTLE_FOE_X, BATTLE_FEET - 26)
      if (e.heal) {
        v.myHp = Math.min(B.b.me.maxHp, v.myHp + e.heal)
        this.popAt(`+${e.heal}`, BATTLE_ME_X, BATTLE_FEET - 30)
      }
      if (e.stun) setTimeout(() => this.toast(`${v.foe?.name || "スライム"} は しびれた！`), 250)
    } else if (e.t === "act" && e.who === "foe") {
      v.foeLunge = 0.3
      v.flashMe = 0.25
      v.myHp = e.hp
      this.sound.se("hit")
      if (e.special) this.toast(`${v.foe?.name || "スライム"} の ${e.name}！`)
      this.popAt(`${e.dmg}`, BATTLE_ME_X, BATTLE_FEET - 30)
    } else if (e.t === "buff") {
      const skill = findSkill(e.skill)
      this.sound.se("happy")
      this.toast(`${skill?.icon || "✨"} ${e.name}！ ${STAT_NAMES[e.stat] || ""} アップ`)
      this.sparkle(BATTLE_ME_X, BATTLE_FEET - 14)
    } else if (e.t === "guard") {
      this.sound.se("tap")
      this.toast("🛡️ みをまもっている（MP が すこし もどった）")
    } else if (e.t === "stun") {
      this.toast(`${v.foe?.name || "スライム"} は しびれて うごけない！`)
    } else if (e.t === "down") {
      v.dying = 0.001
      v.foeHp = 0
      this.sound.se("coin")
      this.popAt(`💰+${e.coins}`, BATTLE_FOE_X, BATTLE_FEET - 26)
    } else if (e.t === "win") {
      this.sound.se("happy")
      v.hop = 1.4
      this.toast("ぜんぶ たおした！")
    } else if (e.t === "lose") {
      this.sound.se("no")
      this.toast("まけちゃった… にげて かえってきた")
    } else if (e.t === "run") {
      this.sound.se("step")
      this.toast("🏃 にげて かえってきた")
    }
  }

  // ---- コマンド（バトル中だけ、下のボタンの代わりに出る） ----
  renderCmd() {
    const B = this.battle
    if (!B || !this.hasCmdTarget) return
    const b = B.b
    this.renderCmdStatus()
    const box = this.cmdButtonsTarget
    box.replaceChildren()
    const btn = (label, action, { params = {}, disabled = false, cls = "" } = {}) => {
      const x = el("button", `dt-cmd__btn ${cls}`)
      x.type = "button"
      x.innerHTML = label
      x.dataset.action = `dettyan-game#${action}`
      for (const [k, val] of Object.entries(params)) x.dataset[`dettyanGame${k[0].toUpperCase()}${k.slice(1)}Param`] = val
      x.disabled = disabled || B.locked
      box.append(x)
      return x
    }
    // 下の だん：🤖 オート・⏭ スキップ・⏩ はやおくり（どの ばめん でも おせる）
    const subRow = () => {
      const tools = [
        btn(B.auto ? "✋<span>じぶんで</span>" : "🤖<span>オート</span>", "toggleAuto", { cls: "dt-cmd__btn--sub" + (B.auto ? " is-on" : "") }),
        btn("⏭<span>スキップ</span>", "skipBattle", { cls: "dt-cmd__btn--sub dt-cmd__btn--wide" }),
        btn(`⏩<span>×${B.speed}</span>`, "cycleSpeed", { cls: "dt-cmd__btn--sub" + (B.speed > 1 ? " is-on" : "") })
      ]
      for (const x of tools) x.disabled = false
    }
    if (B.auto) {
      box.append(el("div", "dt-cmd__note", "🤖 オートで たんけん・たたかい しています"))
      subRow()
      return
    }
    if (B.menu === "skills") {
      for (const id of b.skills) {
        const k = findSkill(id)
        btn(`${k.icon}<span>${k.name}</span><small>MP ${k.mp}</small>`, "cmdSkill", { params: { id }, disabled: k.mp > b.me.mp })
      }
      btn("↩<span>もどる</span>", "cmdBack")
      return
    }
    btn("⚔️<span>こうげき</span>", "cmdAttack")
    btn("✨<span>スキル</span>", "cmdSkills", { disabled: b.skills.length === 0 })
    btn("🛡️<span>ぼうぎょ</span>", "cmdGuard")
    btn("🏃<span>にげる</span>", "cmdRun")
    subRow()
  }

  // コマンドの上の HP・MP（ダメージを うけた ときにも すぐ かえる）
  renderCmdStatus() {
    const B = this.battle
    if (!B || !this.hasCmdStatusTarget) return
    const b = B.b
    const job = findJob(b.job)
    const step = Math.min(b.steps.length, Math.max(1, b.step + 1))
    this.cmdStatusTarget.textContent = `${job.icon} HP ${Math.max(0, Math.round(B.view.myHp))}/${b.me.maxHp}　MP ${B.view.myMp}/${b.me.maxMp}　🚶${step}/${b.steps.length}`
  }

  cmdAttack() { this.sound.se("tap"); this.doTurn({ type: "attack" }) }
  cmdGuard() { this.sound.se("tap"); this.doTurn({ type: "guard" }) }
  cmdRun() { this.sound.se("tap"); this.doTurn({ type: "run" }) }
  cmdSkill(event) { this.sound.se("tap"); this.doTurn({ type: "skill", id: event.params.id }) }

  cmdSkills() {
    if (!this.battle || this.battle.locked) return
    this.sound.se("tap")
    this.battle.menu = "skills"
    this.renderCmd()
  }

  cmdBack() {
    if (!this.battle) return
    this.sound.se("tap")
    this.battle.menu = "main"
    this.renderCmd()
  }

  // 🤖 オート ⇄ ✋ 手動（つぎから も おぼえておく）
  toggleAuto() {
    const B = this.battle
    if (!B) return
    B.auto = !B.auto
    B.menu = "main"
    B.wait = AUTO_WAIT_SEC
    this.store.update((s) => { s.settings.autoBattle = B.auto })
    this.sound.se("tap")
    this.renderCmd()
  }

  // ⏩ はやおくり：1倍 → 2倍 → 3倍 → 1倍（つぎから も おぼえておく）
  cycleSpeed() {
    const B = this.battle
    if (!B) return
    B.speed = BATTLE_SPEEDS[(BATTLE_SPEEDS.indexOf(B.speed) + 1) % BATTLE_SPEEDS.length]
    this.store.update((s) => { s.settings.battleSpeed = B.speed })
    this.sound.se("tap")
    this.renderCmd()
  }

  // ⏭ スキップ：のこりの たんけん と たたかい を オートで いっきに おわらせて、けっか を見る
  skipBattle() {
    const B = this.battle
    if (!B) return
    this.sound.se("tap")
    const events = runAuto(B.b)
    if (events.length) this.store.update((s) => grantEvents(s, events))
    B.queue = []
    B.cur = null
    this.endBattle()
  }

  endBattle() {
    const B = this.battle
    if (!B) return
    let fin = null
    this.store.update((s) => { fin = finishAdventure(s, B.b) })
    this.store.flush()
    this.battle = null
    this.canvasTarget.parentElement.classList.remove("is-battle")
    this.element.classList.remove("is-battling")
    this.cmdTarget.hidden = true
    this.lastBattle = { b: B.b, place: B.place, before: B.before, fin }
    if (fin.levelUps > 0) this.sound.se("levelup")
    this.renderHud(this.store.state)
    this.sheetMode = "result"
    this.renderSheet()
    this.sheetTarget.hidden = false
  }

  backFromBattle() {
    this.sound.playSong("office")
    const ch = this.chara
    const spot = this.homeSpot
    ch.x = spot.x
    ch.y = spot.y
    this.lookAtMe(3)
    const b = this.lastBattle?.b
    if (b) this.say(b.win ? this.ownerLine("win", "ただいま！") : b.ran ? "ふう… ただいま" : "いたた… ただいま")
    setTimeout(() => this.runStoryCheck(), 300)
  }

  renderResult(list, s) {
    const { b, place, before, fin } = this.lastBattle
    this.sheetTitleTarget.textContent = b.win ? `🏆 ${place.name}：かち！` : b.ran ? `🏃 ${place.name}：にげてきた` : `💦 ${place.name}：まけちゃった`
    const counts = {}
    b.foes.slice(0, b.beaten).forEach((id) => { counts[id] = (counts[id] || 0) + 1 })
    const beaten = Object.entries(counts).map(([id, n]) => `${MONSTERS[id].name}×${n}`).join("・")
    list.append(el("div", "dt-result__line", beaten ? `${beaten} を たおした` : "1ぴきも たおせなかった…"))
    list.append(el("div", "dt-result__line", `💰 +${b.coins}　けいけんち +${b.exp}`))
    const found = [b.found.chests ? `📦 たからばこ ${b.found.chests}こ` : "", b.found.friends ? `🤝 ともだち ${b.found.friends}人` : ""].filter(Boolean)
    if (found.length) list.append(el("div", "dt-result__line dt-result__line--sub", found.join("・")))
    for (const id of b.found.foods) {
      const food = findFood(id)
      if (food) list.append(itemRow(food, "みつけた！ もちもの に入れたよ", el("span", "")))
    }
    for (const id of b.found.gear) {
      const gear = findGear(id)
      if (!gear) continue
      const on = s.gear[gear.slot] === gear.id
      const button = el("button", "dt-item__button" + (on ? " dt-item__button--on" : ""), on ? "はずす" : "そうびする")
      button.type = "button"
      button.dataset.action = "dettyan-game#equip"
      button.dataset.dettyanGameIdParam = gear.id
      list.append(gearRow(gear, "📦 たからばこ で みつけた！", button))
    }
    const lv = s.dettyan.level
    list.append(el("div", "dt-result__line dt-result__line--sub", `Lv${lv}　つぎのレベルまで ${expToNext(lv) - s.dettyan.exp}`))
    if (fin.drop) {
      const food = findFood(fin.drop)
      if (food) list.append(itemRow(food, "ひろった！ もちもの に入れたよ", el("span", "")))
    }
    if (fin.gear) {
      const gear = findGear(fin.gear)
      if (gear) {
        const on = s.gear[gear.slot] === gear.id
        const button = el("button", "dt-item__button" + (on ? " dt-item__button--on" : ""), on ? "はずす" : "そうびする")
        button.type = "button"
        button.dataset.action = "dettyan-game#equip"
        button.dataset.dettyanGameIdParam = gear.id
        list.append(gearRow(gear, "✨ 手に入れた！", button))
      }
    }
    if (fin.levelUps > 0) {
      list.append(el("div", "dt-result__levelup", `🎉 レベル ${lv} になった！　ポイント +${fin.levelUps * POINTS_PER_LEVEL}・げんき の上限 ${maxGenki(s)}`))
      const learned = SKILLS.filter((k) => k.job === findJob(s.dettyan.job).id && k.level > before.level && k.level <= lv)
      for (const k of learned) list.append(el("div", "dt-result__levelup", `${k.icon} ${k.name} を おぼえた！`))
      if (before.level < JOB_CHANGE_LEVEL && lv >= JOB_CHANGE_LEVEL) list.append(el("div", "dt-result__levelup", "🔓 ジョブチェンジ が できるようになった！"))
      for (const p of PLACES) {
        if (p.level > before.level && p.level <= lv) list.append(el("div", "dt-result__levelup", `${p.icon} ${p.name} に 行けるようになった！`))
      }
    }
    if (s.dettyan.points > 0) {
      const go = el("button", "dt-item__button dt-result__back", `📊 ポイントを ふる（のこり ${s.dettyan.points}）`)
      go.type = "button"
      go.dataset.action = "dettyan-game#openStatus"
      list.append(go)
    }
    const back = el("button", "dt-item__button dt-result__back" + (s.dettyan.points > 0 ? " dt-item__button--on" : ""), "🏠 じむしょに もどる")
    back.type = "button"
    back.dataset.action = "dettyan-game#closeSheet"
    list.append(back)
  }

  drawBattle(g, area = null) {
    const B = this.battle
    const v = B.view
    // けしき（dettyan_scenes.js。くも・ほたる・たいまつ・雪 などが動く）。新しい 絵は dettyan_sprout.js（広く）
    const id = B.place.id
    drawBattleWide(g, this.wide(`battle:${id}`, (a) => createBattleStrip(this.sprout, id, a)), id, area, v.bob, v.scroll)
    // Dettyan（左）
    const lunge = v.lunge > 0 ? Math.round(Math.sin((v.lunge / 0.3) * Math.PI) * 10) : 0
    const hop = v.hop > 0 ? Math.round(Math.abs(Math.sin(v.hop * Math.PI * 3)) * 5) : 0
    const meLeft = BATTLE_ME_X - SPRITE_W / 2 + lunge
    const meTop = BATTLE_FEET - SPRITE_H - hop
    g.fillStyle = "rgba(0, 0, 0, 0.2)"
    g.fillRect(BATTLE_ME_X - 6 + lunge, BATTLE_FEET - 1, 12, 2)
    const walkFrame = v.walk > 0 ? Math.floor(v.bob * 8) % 2 : lunge > 0 ? 1 : 0
    const swing = v.swing && this.tools && usingHumanDraw() ? v.swing : null
    if (!(v.flashMe > 0 && Math.floor(v.flashMe * 30) % 2)) {
      this.drawMe(g, meLeft, meTop, { frame: swing ? 0 : walkFrame, eyes: v.myHp <= 0 ? "blink" : "open", dir: "downright", noHand: !!swing })
      if (swing) drawBattleTool(g, this.tools, swing.tool, BATTLE_ME_X + lunge, BATTLE_FEET - hop, 1 - swing.t / swing.dur)
    }
    // ❗ みつけた！
    if (v.find > 0) {
      g.fillStyle = "#ffffff"
      g.fillRect(BATTLE_ME_X - 2, meTop - 11, 5, 9)
      g.fillStyle = "#e0484d"
      g.fillRect(BATTLE_ME_X - 1, meTop - 10, 3, 4)
      g.fillRect(BATTLE_ME_X - 1, meTop - 5, 3, 2)
    }
    // 宝箱・友達（右。2倍の大きさ）
    if (v.thing) {
      const bounce = Math.round(Math.abs(Math.sin(v.bob * 4)) * 1)
      g.fillStyle = "rgba(0, 0, 0, 0.2)"
      g.fillRect(BATTLE_FOE_X - 10, BATTLE_FEET - 1, 20, 2)
      g.save()
      if (v.thing.kind === "chest") {
        g.translate(BATTLE_FOE_X - 12, BATTLE_FEET - 20)
        g.scale(2, 2)
        drawPixels(g, v.thing.open ? CHEST_SPRITE.map((row, y) => (y < 4 ? "............" : row)) : CHEST_SPRITE, CHEST_COLORS, 0, 0)
        if (v.thing.open) {
          // ふた が あいて、ひかる
          g.fillStyle = CHEST_COLORS.O
          g.fillRect(1, 0, 10, 2)
          g.fillStyle = "#fff4b0"
          g.fillRect(3, 2, 6, 2)
        }
      } else if (v.thing.kind === "friend") {
        g.translate(BATTLE_FOE_X - 12, BATTLE_FEET - 24 - bounce)
        g.scale(2, 2)
        drawPixels(g, v.thing.friend.art, v.thing.friend.colors, 0, 0)
      }
      g.restore()
    }
    // モンスター（右）。2倍の大きさ。とぶ モンスター は 少し 上で ふわふわ
    if (v.foe && v.dying < 1) {
      const fl = v.foeLunge > 0 ? Math.round(Math.sin((v.foeLunge / 0.3) * Math.PI) * 10) : 0
      const squash = (Math.sin(v.bob * 6) + 1) / 2
      const rows = monsterSprite(v.foe).length
      const lift = v.foe.fly ? 10 + Math.round(Math.sin(v.bob * 5) * 2) : 0
      g.fillStyle = "rgba(0, 0, 0, 0.2)"
      g.fillRect(BATTLE_FOE_X - 10 - fl, BATTLE_FEET - 1, 20, 2)
      const art = area && this.monsterArt?.[v.foeId]
      if (art && !(v.flashFoe > 0 && Math.floor(v.flashFoe * 30) % 2)) {
        // 新しい 絵（Sprout）。2ばい
        g.save()
        // やられた コマが ある ものは 地面に おちて つぶれる
        drawMonsterArt(g, art, v.foe, BATTLE_FOE_X - fl, BATTLE_FEET - (v.dying > 0 && art.die.length ? 0 : lift), v.bob, art.scale, v.dying)
        g.restore()
      } else if (!(v.flashFoe > 0 && Math.floor(v.flashFoe * 30) % 2)) {
        g.save()
        g.globalAlpha = 1 - v.dying
        g.translate(BATTLE_FOE_X - 12 - fl, BATTLE_FEET - rows * 2 - lift)
        g.scale(2, 2)
        drawMonster(g, v.foe, 0, 0, squash * 0.5 + v.dying)
        g.restore()
      }
    }
    // たいりょく（みどり）と MP（あお）のバー
    hpBar(g, 6, 6, 40, v.myHp / B.b.me.maxHp, "#7ed957")
    hpBar(g, 6, 11, 40, v.myMp / Math.max(1, B.b.me.maxMp), "#5ec8ff")
    if (v.foe) hpBar(g, W - 46, 6, 40, v.foeHp / v.foeMax, "#ff6b6b")
    this.drawParticles(g)
  }

  // ふきだしとは別に、ステージの上に小さく出す知らせ
  toast(text) {
    const t = this.toastTarget
    t.textContent = text
    t.hidden = false
    clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => { t.hidden = true }, 2400)
  }

  // Dettyan の上にふわっと出る数字
  pop(text) {
    this.popAt(text, this.chara.x, this.chara.y - SPRITE_H - 10)
  }

  popAt(text, x, y) {
    const p = el("div", "dt-pop", text)
    p.style.left = `${this.pctX(x)}%`
    p.style.top = `${this.pctY(y)}%`
    this.canvasTarget.parentElement.append(p)
    setTimeout(() => p.remove(), 1500)
  }

  // Dettyan 本人が遊んでいるときは、chance の確率で 本人だけの セリフにする
  ownerLine(kind, normal, chance = 0.5) {
    if (!this.ownerValue || !OWNER_LINES[kind] || Math.random() >= chance) return normal
    return pick(OWNER_LINES[kind])
  }

  say(text) {
    const b = this.bubbleTarget
    const ch = this.chara
    b.textContent = text
    b.style.left = `${this.pctX(ch.x)}%`
    b.style.top = `${this.pctY(ch.y - SPRITE_H - 2)}%`
    b.hidden = false
    clearTimeout(this.bubbleTimer)
    this.bubbleTimer = setTimeout(() => this.hideBubble(), 2600)
  }

  hideBubble() {
    if (this.hasBubbleTarget) this.bubbleTarget.hidden = true
  }

  // ---- 表示 ----
  renderHud(s) {
    this.moneyTarget.textContent = s.money.toLocaleString()
    const max = maxGenki(s)
    this.genkiTarget.style.width = `${clamp((s.stats.genki / max) * 100)}%`
    if (this.hasGenkiNumTarget) this.genkiNumTarget.textContent = `${Math.floor(s.stats.genki)}/${max}`
    if (this.hasLevelTarget) this.levelTarget.textContent = `Lv${s.dettyan.level}`
    // 📖 いまの目標
    if (this.hasGoalTarget && s.story) {
      const goal = currentGoal(s)
      this.goalTarget.textContent = goal ? `🎯 ${goal.text}${goal.progress ? `（${goal.progress(s)}）` : ""}` : CLEAR_TEXT
    }
    // まだ ふっていない ポイントがあるときは、📊 つよさ に しるし
    if (this.hasStatusButtonTarget) {
      this.statusButtonTarget.classList.toggle("has-points", s.dettyan.points > 0)
      this.statusButtonTarget.dataset.points = s.dettyan.points > 0 ? String(s.dettyan.points) : ""
    }
    this.gokigenTarget.style.width = `${clamp(s.stats.gokigen)}%`
    this.genkiTarget.parentElement.title = `げんき ${Math.round(s.stats.genki)}`
    this.gokigenTarget.parentElement.title = `ごきげん ${Math.round(s.stats.gokigen)}`
    if (this.sheetMode && this.hasSheetTarget && !this.sheetTarget.hidden) this.renderSheet()
  }

  // ---- 音の設定（🔊） ----
  toggleSoundPanel() {
    this.soundPanelTarget.hidden = !this.soundPanelTarget.hidden
  }

  toggleBgm() {
    if (!this.ready) return
    const on = !this.store.state.settings.bgm
    this.store.update((s) => { s.settings.bgm = on })
    this.sound.unlock() // ボタンのタップで音を出せるようになる
    this.sound.setBgm(on)
    this.renderSoundButtons()
  }

  toggleSe() {
    if (!this.ready) return
    const on = !this.store.state.settings.se
    this.store.update((s) => { s.settings.se = on })
    this.sound.unlock()
    this.sound.setSe(on)
    this.sound.se("tap")
    this.renderSoundButtons()
  }

  renderSoundButtons() {
    const { bgm, se } = this.store.state.settings
    this.bgmToggleTarget.textContent = `🎵 BGM：${bgm ? "オン" : "オフ"}`
    this.bgmToggleTarget.setAttribute("aria-pressed", String(bgm))
    this.seToggleTarget.textContent = `🔔 こうかおん：${se ? "オン" : "オフ"}`
    this.seToggleTarget.setAttribute("aria-pressed", String(se))
    this.soundButtonTarget.textContent = bgm || se ? "🔊" : "🔇"
  }
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)]
}

// 文字の ならび（"." は とうめい）を ドット絵 として描く
function drawPixels(g, rows, colors, ox, oy) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = colors[row[x]]
      if (!c) continue
      g.fillStyle = c
      g.fillRect(ox + x, oy + y, 1, 1)
    }
  })
}

function clamp(v) {
  return Math.max(0, Math.min(100, Number(v) || 0))
}

function el(tag, className, text = "") {
  const e = document.createElement(tag)
  e.className = className
  if (text) e.textContent = text
  return e
}

// ショップ・持ち物の1行（絵・名前・効き目・ボタン）
function itemRow(food, sub, button) {
  const row = el("div", "dt-item")
  const icon = document.createElement("canvas")
  icon.className = "dt-item__icon"
  icon.width = 12
  icon.height = 12
  drawFood(icon.getContext("2d"), food, 0, 0)
  const body = el("div", "dt-item__body")
  body.append(el("div", "dt-item__name", food.name + (food.favorite ? " ⭐すき" : "")))
  body.append(el("div", "dt-item__effect", `げんき+${food.genki} ごきげん+${foodGokigen(food)}`))
  body.append(el("div", "dt-item__sub", sub))
  row.append(icon, body, button)
  return row
}

// 絵文字の アイコンの1行（いえ・かぐ）
function emojiRow(icon, name, desc, sub, button) {
  const row = el("div", "dt-item")
  const body = el("div", "dt-item__body")
  body.append(el("div", "dt-item__name", name))
  body.append(el("div", "dt-item__effect", desc))
  body.append(el("div", "dt-item__sub", sub))
  row.append(el("div", "dt-item__icon dt-item__icon--emoji", icon), body, button)
  return row
}

// ぶき・いしょうの1行
function gearRow(gear, sub, button) {
  const row = el("div", "dt-item")
  const icon = document.createElement("canvas")
  icon.className = "dt-item__icon"
  icon.width = 12
  icon.height = 12
  drawGearIcon(icon.getContext("2d"), gear, 0, 0)
  const body = el("div", "dt-item__body")
  body.append(el("div", "dt-item__name", `${gear.name}（${slotName(gear.slot)}）`))
  const fx = STATS.filter((st) => gear[st.id]).map((st) => `${st.name}+${gear[st.id]}`).join(" ")
  body.append(el("div", "dt-item__effect", fx))
  if (sub) body.append(el("div", "dt-item__sub", sub))
  row.append(icon, body, button)
  return row
}

const px = (g, color, x, y, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(x, y, w, h) }

function hpBar(g, x, y, w, ratio, color) {
  px(g, "rgba(0, 0, 0, 0.45)", x - 1, y - 1, w + 2, 5)
  px(g, color, x, y, Math.round(w * Math.max(0, Math.min(1, ratio))), 3)
}

function drawCoin(g, x, y) {
  px(g, "#b8860b", x - 2, y - 5, 5, 5)
  px(g, "#ffd84d", x - 1, y - 5, 3, 5)
  px(g, "#ffd84d", x - 2, y - 4, 5, 3)
  px(g, "#fff3b0", x - 1, y - 4, 1, 2)
}

function drawHeart(g, x, y) {
  px(g, "#ff5f8f", x - 2, y - 4, 2, 1)
  px(g, "#ff5f8f", x + 1, y - 4, 2, 1)
  px(g, "#ff5f8f", x - 2, y - 3, 5, 1)
  px(g, "#ff5f8f", x - 1, y - 2, 3, 1)
  px(g, "#ff5f8f", x, y - 1, 1, 1)
  px(g, "#ffd0de", x - 2, y - 4, 1, 1)
}

function drawSpark(g, x, y) {
  px(g, "#fffbe0", x, y - 2, 1, 5)
  px(g, "#fffbe0", x - 2, y, 5, 1)
}

function drawDust(g, x, y) {
  px(g, "#8f8a80", x - 2, y - 2, 5, 2)
  px(g, "#b3ada2", x - 1, y - 3, 3, 1)
  px(g, "#6f6a62", x + 2, y - 1, 1, 1)
}

// ♪（4×5）
function drawNote(g, x, y, color) {
  px(g, color, x + 2, y - 5, 2, 1)
  px(g, color, x + 2, y - 4, 1, 3)
  px(g, color, x, y - 2, 3, 2)
}
