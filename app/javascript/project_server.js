// 💾 プロジェクトをアカウントに保存する（K39・11/10）
// 歌ってみたのプロジェクトと、画像編集の下書きを、サーバー（ログインしている本人の場所）に保存する。
// 保存先：開発はパソコンの中（Disk）、本番は今の画像と同じ S3。1プロジェクト 500MB まで（サーバーでも確かめる）
// つながらない・ログインが切れたときは、呼ぶ側が IndexedDB（project_store.js）に一時保存して、あとで送り直す
//
// 音（AudioBuffer）は project_store.js の encodeAudioBuffer の形（16bit）を、次の小さいファイルにして送る：
//   "KBA1"（4バイト）・サンプルレート・長さ・チャンネル数（各 uint32・little endian）・チャンネルごとの Int16 の並び

export const SERVER_MAX_BYTES = 500 * 1024 * 1024

function csrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content
}

// サーバーのエラー。offline＝つながらない、auth＝ログインが切れた、tooLarge＝大きすぎる
export class ServerError extends Error {
  constructor(message, { status = 0, offline = false, auth = false, tooLarge = false } = {}) {
    super(message)
    this.status = status
    this.offline = offline
    this.auth = auth
    this.tooLarge = tooLarge
  }
}

async function request(url, options = {}) {
  let res
  try {
    res = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: { "X-CSRF-Token": csrfToken(), Accept: "application/json", ...(options.headers || {}) }
    })
  } catch (e) {
    throw new ServerError("サーバーにつながりませんでした", { offline: true })
  }
  // ログインが切れていると、ログイン画面（HTML）に飛ばされる
  const type = res.headers.get("content-type") || ""
  if (res.redirected && !type.includes("json")) throw new ServerError("ログインが切れました。ログインし直してね", { status: 401, auth: true })
  if (!res.ok) {
    let message = `サーバーとのやりとりに失敗しました（${res.status}）`
    try { message = (await res.json()).error || message } catch (_) {}
    throw new ServerError(message, { status: res.status, tooLarge: res.status === 413, offline: res.status >= 500, auth: res.status === 401 || res.status === 422 && /CSRF|authenticity/i.test(message) })
  }
  if (res.status === 204) return null
  if (!type.includes("json")) throw new ServerError("ログインが切れました。ログインし直してね", { status: 401, auth: true })
  return res.json()
}

function jsonBody(obj) {
  return { body: JSON.stringify(obj), headers: { "Content-Type": "application/json" } }
}

// ---------- 歌ってみたのプロジェクト ----------

export async function srvListProjects() {
  const r = await request("/singing_projects")
  return (r && r.projects) || []
}

// → { id, name, createdAt, updatedAt, bytes, state, audioKeys, audioSeq, files: { key: url } }
export async function srvGetProject(id) {
  return request(`/singing_projects/${encodeURIComponent(id)}`)
}

// p = { id, kind, name, createdAt, state, audioKeys, audioSeq }。data は文字列で送る（配列の null などが消えないように）
export async function srvPutProject(p) {
  const data = JSON.stringify({ kind: p.kind || "singing", createdAt: p.createdAt, state: p.state, audioKeys: p.audioKeys || [], audioSeq: p.audioSeq || 1 })
  const opts = jsonBody({ name: p.name || "", data })
  return request(`/singing_projects/${encodeURIComponent(p.id)}`, { method: "PUT", ...opts })
}

// 音などのファイルを1つ送る（同じ key は入れ替え）。onProgress(0〜100)
export function srvPutFile(projectId, key, blob, onProgress = null) {
  const body = new FormData()
  body.append("key", key)
  body.append("file", blob, `${key.replace(":", "~")}.bin`)
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", `/singing_projects/${encodeURIComponent(projectId)}/files`)
    xhr.withCredentials = true
    xhr.setRequestHeader("X-CSRF-Token", csrfToken())
    xhr.setRequestHeader("Accept", "application/json")
    xhr.responseType = "json"
    xhr.upload.onprogress = (e) => { if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => {
      const type = xhr.getResponseHeader("content-type") || ""
      if (xhr.status >= 200 && xhr.status < 300 && type.includes("json")) { resolve(xhr.response); return }
      if (xhr.status >= 200 && xhr.status < 400) { reject(new ServerError("ログインが切れました。ログインし直してね", { status: 401, auth: true })); return }
      const message = (xhr.response && xhr.response.error) || `サーバーとのやりとりに失敗しました（${xhr.status}）`
      reject(new ServerError(message, { status: xhr.status, tooLarge: xhr.status === 413, offline: xhr.status >= 500 }))
    }
    xhr.onerror = () => reject(new ServerError("通信が切れました。電波のいいところでもう一度ためしてね", { offline: true }))
    xhr.send(body)
  })
}

// keep にない key のファイルを消す
export async function srvPruneFiles(projectId, keep) {
  return request(`/singing_projects/${encodeURIComponent(projectId)}/prune`, { method: "POST", ...jsonBody({ keep_json: JSON.stringify(keep || []) }) })
}

export async function srvDeleteProject(id) {
  return request(`/singing_projects/${encodeURIComponent(id)}`, { method: "DELETE" })
}

// ファイルの中身（ArrayBuffer）
export async function srvFetchFile(url) {
  let res
  try {
    res = await fetch(url, { credentials: "same-origin" })
  } catch (e) {
    throw new ServerError("ファイルを読み込めませんでした（つながりません）", { offline: true })
  }
  if (!res.ok) throw new ServerError(`ファイルを読み込めませんでした（${res.status}）`, { status: res.status })
  return res.arrayBuffer()
}

// ---------- 画像編集の下書き ----------

export async function srvGetDraft() {
  return request("/editor_draft")
}

export async function srvPutDraft(data) {
  return request("/editor_draft", { method: "PUT", ...jsonBody({ data: JSON.stringify(data) }) })
}

export async function srvClearDraft() {
  return request("/editor_draft", { method: "DELETE" })
}

// ---------- 💾 ミックス設定のテンプレート（K42） ----------

// → [{ id, name, data, updatedAt }]（新しい順）
export async function srvListMixTemplates() {
  const r = await request("/mix_templates")
  return (r && r.templates) || []
}

export async function srvCreateMixTemplate(name, data) {
  return request("/mix_templates", { method: "POST", ...jsonBody({ name, data: JSON.stringify(data) }) })
}

// changes = { name } か { data } か両方
export async function srvUpdateMixTemplate(id, changes) {
  const body = {}
  if (changes.name !== undefined) body.name = changes.name
  if (changes.data !== undefined) body.data = JSON.stringify(changes.data)
  return request(`/mix_templates/${encodeURIComponent(id)}`, { method: "PATCH", ...jsonBody(body) })
}

export async function srvDeleteMixTemplate(id) {
  return request(`/mix_templates/${encodeURIComponent(id)}`, { method: "DELETE" })
}

// ---------- 音 ⇄ 送るファイル ----------

// encodeAudioBuffer の形 → Blob
export function packAudioRecord(rec) {
  const n = rec.channels.length
  const head = new ArrayBuffer(16)
  const v = new DataView(head)
  v.setUint8(0, 0x4b); v.setUint8(1, 0x42); v.setUint8(2, 0x41); v.setUint8(3, 0x31) // "KBA1"
  v.setUint32(4, rec.sr, true)
  v.setUint32(8, rec.length, true)
  v.setUint32(12, n, true)
  const parts = [head]
  rec.channels.forEach((ch) => {
    // Int16Array はこの端末の並び（ほぼすべて little endian）
    parts.push(ch.buffer.slice(ch.byteOffset, ch.byteOffset + ch.byteLength))
  })
  return new Blob(parts, { type: "application/octet-stream" })
}

// ArrayBuffer → encodeAudioBuffer の形（読めなければ null）
export function unpackAudioRecord(buf) {
  if (!buf || buf.byteLength < 16) return null
  const v = new DataView(buf)
  if (v.getUint8(0) !== 0x4b || v.getUint8(1) !== 0x42 || v.getUint8(2) !== 0x41 || v.getUint8(3) !== 0x31) return null
  const sr = v.getUint32(4, true)
  const length = v.getUint32(8, true)
  const n = v.getUint32(12, true)
  if (!n || n > 8 || buf.byteLength < 16 + n * length * 2) return null
  const channels = []
  for (let ch = 0; ch < n; ch++) channels.push(new Int16Array(buf.slice(16 + ch * length * 2, 16 + (ch + 1) * length * 2)))
  return { sr, length, channels, bytes: n * length * 2 }
}
