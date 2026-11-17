// 💾 Dettyan 育成ゲームのセーブ（docs/dettyan/requirements.md の7章）
// - 正しいセーブはサーバー（GET/PUT /dettyan_save）。アカウントにひもづくので、デプロイしても端末を変えても消えない
// - localStorage は控え（すぐ表示する・電波が弱いとき用）。名前にユーザーIDを入れて、アカウントごとに分ける
// - セーブの読み書きはこのファイルだけでする。ほかから localStorage や API を直接さわらない
//
// ⚠️ セーブの形を変えるときの決まり
// - 項目を足すだけなら defaultState() に足す（古いセーブには初めの値が入る）
// - 名前を変える・消す・意味を変えるときは SAVE_VERSION を上げて、MIGRATIONS に移しかえを書く
// - 知らない項目は消さずに残す（新しいコードが書いたセーブを、古い画面が開いても壊さないため）

import { FURNITURE } from "dettyan_home"

export const SAVE_VERSION = 4

export function defaultState() {
  return {
    version: SAVE_VERSION,
    money: 0,
    stats: { genki: 80, gokigen: 70 }, // げんき の上限はレベルで増える（dettyan_care.js の maxGenki）
    // job：職業（dettyan_battle.js の JOBS）、points：まだ ふっていない ポイント、alloc：ふった ポイント
    dettyan: { level: 1, exp: 0, job: "warrior", points: 0, alloc: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0 } },
    items: {},             // { junsai: 2 } のように、持っているごはん・アイテムの数（id は dettyan_foods.js）
    daily: { day: null, careCoins: 0, rewardDay: null }, // その日（日本の日付）の数。おせわのコインの上限・毎日のごほうび
    care: { lastAt: {} },  // おせわごとに、最後にした時間（続けてしても効かないように）
    room: { cleanedAt: null }, // 最後にそうじした時間。ここからの時間で ほこり が増える
    // すまい：type は "tent"（さいしょ・野宿）か "house"（マイホーム）。furniture は 持っている家具（id は dettyan_home.js）
    home: { type: "tent", furniture: {} },
    // おはなし：prologue は はじまりの おはなし を見たか、seen は たっせい した目標（id は dettyan_story.js の GOALS）
    story: { prologue: false, seen: {} },
    adventure: { count: 0, wins: 0 }, // モンスター退治に行った回数・ぜんぶたおした回数
    // 持っている そうび（id は dettyan_gear.js）と、体のパーツごとに そうびしているもの
    // head：あたま・outfit：からだ・weapon：て・back：せなか・feet：あし（outfit と weapon は前からある名前なので変えない）
    gear: { owned: {}, head: null, outfit: null, weapon: null, back: null, feet: null },
    // soundAsked：「音が出ます」を一度見せたか、autoBattle：ぼうけん を オートで たたかう
    settings: { bgm: true, se: true, soundAsked: false, autoBattle: false },
    createdAt: null,       // はじめて遊んだ時間（サーバーの時計・ミリ秒）
    lastSeenAt: null       // 最後に遊んだ時間（サーバーの時計・ミリ秒）。放置の計算に使う
  }
}

// 古い version から1つずつ新しくする。例：2: (s) => { s.foo = s.bar; delete s.bar; return s }
const MIGRATIONS = {
  // 2：ステータスの ふりわけ（レベルが1つ上がるごとに 3ポイント）。前から遊んでいる人には、今のレベルまでの ポイントを まとめて わたす
  2: (s) => {
    const level = Math.max(1, Number(s.dettyan?.level) || 1)
    s.dettyan = { ...(s.dettyan || {}), level }
    if (!Number.isFinite(s.dettyan.points)) s.dettyan.points = (level - 1) * 3
    return s
  },
  // 3：おはなし と すまい。前から遊んでいる人も、みんな テントで 野宿から（レベル・お金・そうび は そのまま）
  3: (s) => {
    if (!s.home) s.home = { type: "tent", furniture: {} }
    if (!s.story) s.story = { prologue: false, seen: {} }
    return s
  },
  // 4：前の 3 では、前から遊んでいる人に マイホーム と ぜんぶの家具を わたしていた（要件とちがった）
  //    その人も テントから やりなおす（はじまりの おはなし も もう一度）。自分で買った人は そのまま
  4: (s) => {
    if (wasGivenHouse(s)) {
      s.home = { type: "tent", furniture: {} }
      s.story = { prologue: false, seen: {} }
    }
    return s
  }
}

// 前の 3 で わたした セーブか（マイホーム と ぜんぶの家具 を持っていて、第1章の目標が ぜんぶ たっせい ずみ）
function wasGivenHouse(s) {
  const f = s.home?.furniture || {}
  const seen = s.story?.seen || {}
  return s.home?.type === "house" && FURNITURE.every((x) => f[x.id]) && seen.adventure && seen.house && seen.pc
}

function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v)
}

// ない項目に初めの値を入れる（ある項目・知らない項目はそのまま）
function fillDefaults(target, defaults) {
  for (const [k, v] of Object.entries(defaults)) {
    if (!(k in target) || target[k] === undefined) target[k] = isObject(v) ? structuredCopy(v) : v
    else if (isObject(v) && isObject(target[k])) fillDefaults(target[k], v)
  }
  return target
}

function structuredCopy(v) {
  return JSON.parse(JSON.stringify(v))
}

// どんな形のセーブでも、今のコードで使える形にする。読めないときは null
export function migrate(raw) {
  if (!isObject(raw)) return null
  let s = structuredCopy(raw)
  let v = Number.isInteger(s.version) ? s.version : 1
  while (v < SAVE_VERSION) {
    v += 1
    if (MIGRATIONS[v]) s = MIGRATIONS[v](s)
  }
  // 新しいコードが書いたセーブ（version が大きい）は、version を下げずにそのまま使う
  s.version = Math.max(v, SAVE_VERSION)
  return fillDefaults(s, defaultState())
}

const SAVE_DELAY_MS = 1500

export class DettyanStore {
  constructor({ userId, endpoint = "/dettyan_save" }) {
    this.endpoint = endpoint
    this.cacheKey = `dettyan:save:${userId}`
    this.state = null
    this.clockOffset = 0 // サーバーの時計 − この端末の時計
    this.timer = null
    this.saving = null
    this.onSaved = null
  }

  // サーバーの時計（ミリ秒）。放置やモンスター退治の時間はこれで数える
  now() {
    return Date.now() + this.clockOffset
  }

  // 控え → サーバーの順に読む。onCache は控えを読めた時点で呼ぶ（すぐ画面を出すため）
  async load({ onCache } = {}) {
    const cache = this.readCache()
    if (cache?.state) {
      this.state = migrate(cache.state)
      if (this.state && onCache) onCache(this.state)
    }

    let server = null
    try {
      const res = await fetch(this.endpoint, { headers: { Accept: "application/json" }, credentials: "same-origin" })
      if (res.ok) server = await res.json()
    } catch (e) {
      // 電波が弱いときは控えで遊ぶ。次に保存するときにサーバーへ送る
    }

    if (server) {
      this.clockOffset = server.serverNow - Date.now()
      const serverState = migrate(server.save)
      // 送れていない変更が控えにあって、サーバーより新しければ控えを使う（あとから保存した方を使う）
      const useCache = cache?.dirty && cache.state && (!server.updatedAt || cache.changedAt > server.updatedAt)
      if (useCache && this.state) {
        this.scheduleSave(0)
      } else if (serverState) {
        this.state = serverState
        this.writeCache(false)
      }
    } else if (cache?.dirty) {
      this.scheduleSave() // サーバーに届かなかったら、あとでもう一度送る
    }

    if (!this.state) this.state = defaultState()
    if (!this.state.createdAt) this.update((s) => { s.createdAt = this.now() })
    return this.state
  }

  // 状態を変えて、少し待ってからまとめて保存する
  update(fn) {
    fn(this.state)
    this.writeCache(true)
    this.scheduleSave()
    return this.state
  }

  scheduleSave(delay = SAVE_DELAY_MS) {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), delay)
  }

  // すぐ保存する。keepalive：画面を閉じるとき用（閉じたあとも送り切る）
  async flush({ keepalive = false } = {}) {
    clearTimeout(this.timer)
    const cache = this.readCache()
    if (!cache?.dirty) return
    const changedAt = cache.changedAt
    const body = JSON.stringify({ data: JSON.stringify(this.state) })
    const req = fetch(this.endpoint, {
      method: "PUT",
      credentials: "same-origin",
      keepalive,
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-CSRF-Token": csrfToken() },
      body
    }).then(async (res) => {
      if (!res.ok) return false
      const json = await res.json().catch(() => null)
      if (json?.serverNow) this.clockOffset = json.serverNow - Date.now()
      // 送っている間に新しい変更がなければ「送った」にする
      if (this.readCache()?.changedAt === changedAt) this.writeCache(false, changedAt)
      if (this.onSaved) this.onSaved()
      return true
    }).catch(() => false)
    this.saving = req
    return req
  }

  readCache() {
    let raw = null
    try {
      raw = localStorage.getItem(this.cacheKey)
      return raw ? JSON.parse(raw) : null
    } catch (e) {
      // 読めない控えも消さずに、別の名前で取っておく
      try { if (raw) localStorage.setItem(`${this.cacheKey}:broken:${Date.now()}`, raw) } catch (e2) {}
      return null
    }
  }

  writeCache(dirty, changedAt = this.now()) {
    try {
      localStorage.setItem(this.cacheKey, JSON.stringify({ state: this.state, dirty, changedAt }))
    } catch (e) {
      // 保存できない（プライベートモードなど）ときは、サーバーだけに保存する
    }
  }
}

// 控え（localStorage）にあるセーブを読むだけ（メインメニューの Dettyan のアイコンで、そうびを見せるため）
// サーバーには聞かない・書かない。ないときは null
export function peekCachedState(userId) {
  try {
    const raw = localStorage.getItem(`dettyan:save:${userId}`)
    const cache = raw ? JSON.parse(raw) : null
    return cache?.state ? migrate(cache.state) : null
  } catch (e) {
    return null
  }
}

function csrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content || ""
}
