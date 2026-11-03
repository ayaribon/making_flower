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

// kind は "part"（部品） か "background"（背景）。保存した画像のIDを返す
export async function saveImage(file, kind) {
  const body = new FormData()
  body.append("file", await shrink(file))
  body.append("kind", kind)
  const record = await request("/user_images", { method: "POST", body })
  return record.id
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
