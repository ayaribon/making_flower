// 💾 プロジェクト保存（K24）：ブラウザの中（IndexedDB）に保存する。
// 11/10（K39）からは、ふだんはアカウント（project_server.js）に保存し、ここは「サーバーにつながらないときの一時保存」と「前の版の保存」に使う
//   projects … プロジェクトの中身（設定・歌詞・部分・ピンなど。音は audio への参照だけ）
//   audio    … 音のデータ（key＝"プロジェクトID:番号"）。16bit に小さくして保存する
//   drafts   … 画像編集の下書きなど、1つだけ覚えておけばいいもの
// ブラウザのデータを消すと保存も消える・別の端末とは共有できない（画面で案内する）

const DB_NAME = "kotobouquet-projects"
const DB_VERSION = 1

let dbPromise = null

export function storeSupported() {
  return typeof indexedDB !== "undefined"
}

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" })
      if (!db.objectStoreNames.contains("audio")) db.createObjectStore("audio")
      if (!db.objectStoreNames.contains("drafts")) db.createObjectStore("drafts")
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => { dbPromise = null; reject(req.error) }
  })
  return dbPromise
}

// ひとつの store に対して1回だけ読み書きする小さな道具
async function tx(store, mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const s = t.objectStore(store)
    let result
    const r = fn(s)
    if (r && "onsuccess" in r) r.onsuccess = () => { result = r.result }
    t.oncomplete = () => resolve(result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

export function newProjectId() {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export async function putProject(project) {
  return tx("projects", "readwrite", (s) => s.put(project))
}

export async function getProject(id) {
  return tx("projects", "readonly", (s) => s.get(id))
}

// 一覧（新しい順）。中身（state）は重いので外して返す
export async function listProjects(kind = null) {
  const all = (await tx("projects", "readonly", (s) => s.getAll())) || []
  return all
    .filter((p) => !kind || p.kind === kind)
    .map(({ state, ...meta }) => meta)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

export async function deleteProject(id) {
  await tx("projects", "readwrite", (s) => s.delete(id))
  await deleteAudioExcept(id, [])
}

export async function putAudio(key, rec) {
  return tx("audio", "readwrite", (s) => s.put(rec, key))
}

export async function getAudio(key) {
  return tx("audio", "readonly", (s) => s.get(key))
}

// そのプロジェクトの音のうち、keep に入っていないもの（もう使っていない音）を消す
export async function deleteAudioExcept(projectId, keep) {
  const keepSet = new Set(keep)
  const range = IDBKeyRange.bound(`${projectId}:`, `${projectId}:\uffff`)
  const keys = (await tx("audio", "readonly", (s) => s.getAllKeys(range))) || []
  const drop = keys.filter((k) => !keepSet.has(k))
  if (!drop.length) return 0
  await tx("audio", "readwrite", (s) => { drop.forEach((k) => s.delete(k)) })
  return drop.length
}

export async function saveDraft(key, value) {
  return tx("drafts", "readwrite", (s) => s.put(value, key))
}

export async function loadDraft(key) {
  return tx("drafts", "readonly", (s) => s.get(key))
}

export async function clearDraft(key) {
  return tx("drafts", "readwrite", (s) => s.delete(key))
}

// 使っている容量と、使える容量（分からなければ null）
export async function storageEstimate() {
  try {
    if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate()
  } catch (e) {}
  return null
}

// 「ブラウザが勝手に消さないで」とお願いする（iPhone Safari などで効くことがある）
export async function askPersist() {
  try {
    if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) return await navigator.storage.persist()
    return true
  } catch (e) {
    return false
  }
}

// ---------- 音（AudioBuffer）⇄ 保存用のデータ ----------

// 16bit にして半分の大きさにする（歌声・オケには十分）
export function encodeAudioBuffer(buf) {
  const channels = []
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch)
    const out = new Int16Array(d.length)
    for (let i = 0; i < d.length; i++) {
      const v = Math.max(-1, Math.min(1, d[i]))
      out[i] = v < 0 ? v * 0x8000 : v * 0x7fff
    }
    channels.push(out)
  }
  return { sr: buf.sampleRate, length: buf.length, channels, bytes: buf.length * buf.numberOfChannels * 2 }
}

export function decodeAudioRecord(ctx, rec) {
  if (!rec || !rec.channels || !rec.channels.length) return null
  const buf = ctx.createBuffer(rec.channels.length, rec.length, rec.sr)
  rec.channels.forEach((src, ch) => {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < src.length; i++) d[i] = src[i] < 0 ? src[i] / 0x8000 : src[i] / 0x7fff
  })
  return buf
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return "?"
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)}GB`
  if (n >= 1024 * 1024) return `${Math.round(n / 1024 / 1024)}MB`
  return `${Math.max(1, Math.round(n / 1024))}KB`
}
