// 画像の保管係
// 自分の画像（立ち絵・背景など）の保存・読み込みは、全部ここを通す。
// 今はブラウザの中（IndexedDB）にだけ保存して、サーバーには送らない。
// ログインを入れるときは、このファイルの中身をサーバー保存に差し替える。
// （エディタ側は saveImage / listImages / getImageUrl / deleteImage しか使わない）

const DB_NAME = "kotobouquet"
const STORE = "images"
const MAX_SIDE = 2000          // 長い辺がこれより大きい画像は縮めて保存する
const CURRENT_OWNER = "guest"  // ログインを入れたら、ここをアカウントのIDにする

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "id" })
      store.createIndex("owner", "owner")
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore(mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const result = fn(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(result?.result ?? result)
    tx.onerror = () => reject(tx.error)
  })
}

// 大きすぎる画像は縮める（透過はそのまま残すため PNG で保存）
async function shrink(file) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  if (scale === 1) return file

  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise(resolve => canvas.toBlob(resolve, "image/png"))
}

// kind は "part"（部品） か "background"（背景）
export async function saveImage(file, kind) {
  const blob = await shrink(file)
  const record = {
    id: crypto.randomUUID(),
    owner: CURRENT_OWNER,
    kind,
    name: file.name,
    blob,
    createdAt: Date.now()
  }
  await withStore("readwrite", store => store.put(record))
  return record.id
}

export async function listImages(kind) {
  const all = await withStore("readonly", store => store.getAll())
  return all
    .filter(r => r.owner === CURRENT_OWNER && r.kind === kind)
    .sort((a, b) => b.createdAt - a.createdAt)
}

const urlCache = new Map()

// キャンバスやサムネに使うURL（ブラウザの中だけで使える一時的なURL）
export async function getImageUrl(id) {
  if (urlCache.has(id)) return urlCache.get(id)
  const record = await withStore("readonly", store => store.get(id))
  if (!record) return null
  const url = URL.createObjectURL(record.blob)
  urlCache.set(id, url)
  return url
}

export async function deleteImage(id) {
  await withStore("readwrite", store => store.delete(id))
  const url = urlCache.get(id)
  if (url) URL.revokeObjectURL(url)
  urlCache.delete(id)
}
