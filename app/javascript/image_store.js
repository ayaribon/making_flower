// 画像の保管係
// 自分の画像（立ち絵・背景など）の保存・読み込みは、全部ここを通す。
// 保存先はサーバー（ログイン中の本人のフォルダ users/<番号>/）。
// エディタ側は saveImage / listImages / getImageUrl / deleteImage しか使わないので、
// 保存先を変えるときはこのファイルだけ直せばいい。

const MAX_SIDE = 2000  // 長い辺がこれより大きい画像は、送る前に縮める

function csrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content
}

async function request(url, options = {}) {
  const res = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: { "X-CSRF-Token": csrfToken(), Accept: "application/json", ...(options.headers || {}) }
  })
  if (!res.ok) {
    let message = `サーバーとのやりとりに失敗しました（${res.status}）`
    try { message = (await res.json()).error || message } catch (_) {}
    throw new Error(message)
  }
  return res.status === 204 ? null : res.json()
}

// 大きすぎる画像は縮める（透過はそのまま残すため PNG にする）
async function shrink(file) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  if (scale === 1) return file

  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"))
  const name = file.name.replace(/\.[^.]+$/, "") + ".png"
  return new File([blob], name, { type: "image/png" })
}

const THUMB_SIDE = 256  // 一覧に使う小さい画像の長い辺

// 一覧用の小さい PNG を作る（透過もそのまま残る）。src は File か、読み込み済みの <img>
export async function makeThumb(src) {
  const bitmap = src instanceof Blob ? await createImageBitmap(src) : src
  const w = bitmap.naturalWidth || bitmap.width
  const h = bitmap.naturalHeight || bitmap.height
  const scale = Math.min(1, THUMB_SIDE / Math.max(w, h))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise(resolve => canvas.toBlob(resolve, "image/png"))
}

// kind は "part"（部品） か "background"（背景）。保存した画像のIDを返す
// onProgress(0〜100) を渡すと、アップロードが何％終わったかを教える
// （fetch では送信の進み具合が取れないので、ここだけ XMLHttpRequest を使う）
export async function saveImage(file, kind, onProgress = null) {
  const body = new FormData()
  const shrunk = await shrink(file)
  body.append("file", shrunk)
  try {
    const thumb = await makeThumb(shrunk)
    if (thumb) body.append("thumb", thumb, "thumb.png")
  } catch (_) {}   // サムネが作れなくても、元の画像は保存する
  body.append("kind", kind)

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", "/user_images")
    xhr.withCredentials = true
    xhr.setRequestHeader("X-CSRF-Token", csrfToken())
    xhr.setRequestHeader("Accept", "application/json")
    xhr.responseType = "json"

    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100)
        resolve(xhr.response.id)
      } else {
        const message = xhr.response?.error || `サーバーとのやりとりに失敗しました（${xhr.status}）`
        reject(new Error(message))
      }
    }
    xhr.onerror = () => reject(new Error("通信が切れました。電波のいいところでもう一度ためしてね"))
    xhr.send(body)
  })
}

export async function listImages(kind) {
  return request(`/user_images?kind=${encodeURIComponent(kind)}`)
}

// キャンバスやサムネに使うURL。同じドメインから返すので、PNG書き出しにもそのまま使える
export async function getImageUrl(id) {
  return `/user_images/${id}`
}

export async function deleteImage(id) {
  await request(`/user_images/${id}`, { method: "DELETE" })
}

// 一覧用の小さい画像の URL（サムネがない画像は 404 になる）
export function getThumbUrl(id) {
  return `/user_images/${id}/thumb`
}

// サムネがない画像に、あとからつける
export async function uploadThumb(id, blob) {
  const body = new FormData()
  body.append("thumb", blob, "thumb.png")
  return request(`/user_images/${id}/thumb`, { method: "PUT", body })
}
