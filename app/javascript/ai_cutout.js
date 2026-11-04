// ✨ AI で切り抜く（MediaPipe Interactive Image Segmenter / MagicTouch）。
// ライブラリ・wasm・モデルは自分のサーバー（本番は S3）から読む。最初に使うときだけ読み込む。
const LIB = "tasks-vision-1.2.2"
const MODEL = "models/magic_touch-v2-int8-20261105.task"
const POSITIVE = 1   // 足す（vision.d.ts の BrushMode）
const NEGATIVE = 2   // 外す

let segmenterPromise = null
let currentImage = null

function loadSegmenter(base) {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const { FilesetResolver, InteractiveSegmenter } = await import(`${base}/${LIB}/vision_bundle.mjs`)
      const fileset = await FilesetResolver.forVisionTasks(`${base}/${LIB}/wasm`)
      return InteractiveSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${base}/${MODEL}`, delegate: "CPU" }
      })
    })().catch(e => {
      segmenterPromise = null   // 失敗したら、次に押したときにやり直せるようにする
      throw e
    })
  }
  return segmenterPromise
}

// image：部品の元の画像。points：[{ x, y, plus }]（画像の中の割合 0〜1）
// 戻り値：切り抜いた形の PNG（data URL。透明度＝「選んだものっぽさ」）
export async function segmentPoints(base, image, points) {
  const segmenter = await loadSegmenter(base)
  if (currentImage !== image) {   // 同じ画像なら読み込みは1回だけ
    segmenter.setImage(image)
    currentImage = image
  }
  const strokes = points.map(p => ({
    brushMode: p.plus ? POSITIVE : NEGATIVE,
    point: [{ x: p.x, y: p.y }],
    isCompleted: true
  }))
  const mask = segmenter.segment(strokes)
  try {
    return maskToDataUrl(mask)
  } finally {
    mask.close()
  }
}

// AI の結果（0〜1 の数字）を、長い辺 512px 以下の PNG にする（保存するデータを小さくするため）
function maskToDataUrl(mask, maxSide = 512) {
  const w = mask.width
  const h = mask.height
  const values = mask.getAsFloat32Array()
  const full = document.createElement("canvas")
  full.width = w
  full.height = h
  const ctx = full.getContext("2d")
  const img = ctx.createImageData(w, h)
  for (let i = 0; i < w * h; i++) img.data[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, values[i])) * 255)
  ctx.putImageData(img, 0, 0)

  const s = Math.min(1, maxSide / Math.max(w, h))
  const out = document.createElement("canvas")
  out.width = Math.max(1, Math.round(w * s))
  out.height = Math.max(1, Math.round(h * s))
  out.getContext("2d").drawImage(full, 0, 0, out.width, out.height)
  return out.toDataURL("image/png")
}
