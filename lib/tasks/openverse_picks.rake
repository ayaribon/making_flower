namespace :materials do
  # Openverse から、えらんでおいた素材（人が描いた・CC0／パブリックドメイン＝表記なしで再配布OK）をまとめて取り込む。
  # 何回打っても大丈夫（取り込み済みは飛ばす）。管理画面の「🔎 Openverse から取り込む」と同じ仕組みで、
  # ライセンス・作者・出どころは素材の「ライセンスのメモ」に自動で入る。
  #
  # - 大きすぎる画像は、長い辺 MAX_SIDE まで縮める（10MB の上限に入るように）
  # - 部品（part）は、まわりの白い紙を透明にする（端からつながっている白だけ。中の白は残す）
  #
  # [Openverse の ID, キー（テンプレで使う名前）, 名前, 種類, タグ, オプション]
  #   オプション：crop_bottom＝下を切る割合（図鑑の下の小さな説明文を消す）、despeckle＝紙のザラザラを背景にまぜる（色のついた絵だけ）
  PLATE = { crop_bottom: 0.1, despeckle: true }.freeze
  OPENVERSE_PICKS = [
    # 🌿 背景：ウィリアム・モリスの柄（19世紀・パブリックドメイン）
    ["95199168-f4cc-44c8-9bb0-da8d96c248dc", "ov-morris-willow", "モリスの柳の柄", "background", "nature,pastel"],
    ["d9928add-9af5-4a71-a90e-8824acae66ad", "ov-morris-pink", "モリスのピンクの花柄", "background", "nature"],
    ["6e6a0893-5c11-4278-8cb4-8d775b2f1dc7", "ov-morris-violet", "モリスのすみれ柄", "background", "nature,night"],
    ["b7f02a5f-0fe9-428a-90e9-f101a0cce1af", "ov-morris-birds", "モリスの鳥と花の柄", "background", "nature"],
    # 🌊 背景：北斎・和柄
    ["bd95e4ae-da80-4956-93d8-5823d6d97d32", "ov-hokusai-wave", "北斎 神奈川沖浪裏", "background", "nature"],
    ["a6f11ff8-cfb2-42af-a198-8c557424a4b4", "ov-hokusai-feminine", "北斎 女浪", "background", "nature,night"],
    ["eb151b69-f76e-4c59-b270-e97a43c9f5bc", "ov-wa-crests", "和の花紋の柄", "background", "season"],
    ["84f01520-f5e5-45fd-b3cf-ea3db77c9818", "ov-wa-sayagata", "和の紗綾形の柄", "background", "season"],
    # 🌹 部品：ボタニカルアートの花
    ["214f2a36-7389-4e11-91a5-81ce4b04d5f5", "ov-rose-pink", "ピンクのバラ", "part", "season,stamp", PLATE],
    ["bd1470ee-b2c0-436d-a881-fda89bc544de", "ov-rose-red", "赤いバラ", "part", "season,stamp", PLATE],
    ["5a97c2ca-a2c7-49e5-b5c8-e313562cf236", "ov-rose-pale", "うすピンクのバラ", "part", "season,stamp", PLATE],
    ["fdf23e0f-c6bb-4c74-8c23-3b798d127fc6", "ov-coneflower", "赤い花（エキナセア）", "part", "season,stamp", { despeckle: true }],
    # 🦋 部品：ちょうちょ
    ["7072a8a2-d44f-4ea8-ae99-2948d4d6c628", "ov-butterfly-blue", "青いちょうちょ", "part", "stamp,sparkle"],
    ["fdfcb5e2-0bdf-48bb-8b21-a9a1b0e9217f", "ov-butterfly-morpho", "モルフォちょう", "part", "stamp"],
    ["c24409ca-b475-4e76-a17d-f28ee3d6d957", "ov-butterfly-green", "緑のちょうちょ", "part", "stamp"],
    ["d4af092b-f2fb-465f-a89d-2c23c837f99c", "ov-butterfly-mint", "うす緑のちょうちょ", "part", "stamp"],
    ["b91a361e-451c-4337-b1c2-dcd8adab0bab", "ov-butterfly-orange", "オレンジのちょうちょ", "part", "stamp"],
    # 🐧 部品：線画
    ["b54b5dee-7f7c-4767-adcb-659bc0a87f4e", "ov-penguin", "ペンギン（線画）", "part", "icon,stamp"]
  ].freeze

  OPENVERSE_MAX_SIDE = 2400
  OPENVERSE_DOWNLOAD_MAX = 60.megabytes

  desc "えらんでおいた Openverse の素材（CC0・パブリックドメイン）をまとめて取り込む"
  task import_openverse_picks: :environment do
    client = OpenverseClient.new
    imported = OpenverseClient.imported_materials(OPENVERSE_PICKS.map(&:first))

    OPENVERSE_PICKS.each_with_index do |(id, key, name, kind, tags, opts), index|
      if (done = imported[id])
        # 前に取り込んだもので、キーがまだないものは、キーだけ付ける（テンプレから使えるように）
        if done.key.blank? && !Material.exists?(key: key)
          done.update_columns(key: key, updated_at: Time.current)
          puts "キーを付けた：#{name} → #{key}"
        else
          puts "飛ばした（取り込み済み）：#{name}"
        end
        next
      end
      begin
        item = client.fetch(id) # ライセンスはここで確かめ直す（CC0・パブリックドメイン以外は取り込まない）
        unless item[:thumb_ok]
          puts "⚠️ 飛ばした（作者の表記が要るライセンス）：#{name}"
          next
        end
        io, = client.download(item[:url], max_bytes: OPENVERSE_DOWNLOAD_MAX)
        out, type, ext = openverse_prepare(io.read, cutout: kind == "part", **(opts || {}))

        material = Material.new(OpenverseClient.material_attributes(item))
        material.name = name
        material.key = key unless Material.exists?(key: key)
        material.kind = kind
        material.tags = tags
        material.visible = true
        material.position = 1000 + index * 10
        material.image.attach(io: StringIO.new(out), filename: "openverse-#{id[0, 8]}.#{ext}", content_type: type)
        if material.save
          material.generate_thumb!
          puts "取り込んだ：#{name}（#{(out.bytesize / 1024.0).round}KB）"
        else
          puts "⚠️ 取り込めなかった：#{name}（#{material.errors.full_messages.join('／')}）"
        end
      rescue OpenverseClient::Error, Vips::Error => e
        puts "⚠️ 取り込めなかった：#{name}（#{e.message}）"
      end
    end
  end

  # 縮めて、部品ならまわりの白を透明にする。戻り値は [バイト列, content_type, 拡張子]
  def openverse_prepare(bytes, cutout:, crop_bottom: 0, despeckle: false)
    require "vips"
    img = Vips::Image.new_from_buffer(bytes, "")
    img = img.colourspace(:srgb) if img.interpretation != :srgb && img.interpretation != :rgb
    img = img.extract_band(0, n: 3) if img.bands > 3
    img = img.bandjoin([img, img]) if img.bands == 1
    scale = OPENVERSE_MAX_SIDE.to_f / [img.width, img.height].max
    img = img.resize(scale) if scale < 1
    img = img.crop(0, 0, img.width, (img.height * (1 - crop_bottom)).round) if crop_bottom.positive?
    return [img.jpegsave_buffer(Q: 88, strip: true), "image/jpeg", "jpg"] unless cutout

    # 白っぽい所（3色とも明るい）→ 端からつながっている所だけを「背景」にする
    light = (img > 228).bandand.cast(:uchar) # 255＝白っぽい
    # 紙のザラザラ（小さな点）は白にまぜる。線画には使わない（細い線まで消えるので）
    light = light.median(7) if despeckle
    w = light.width
    h = light.height
    seeds = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [w / 2, 0], [w / 2, h - 1], [0, h / 2], [w - 1, h / 2]]
    filled = light
    seeds.each do |x, y|
      next unless filled.getpoint(x, y)[0] == 255
      filled = filled.draw_flood(128, x, y, equal: true) # 始まりの点と同じ値（白っぽい所）だけを塗る
    end
    background = filled.relational_const(:equal, [128]) # 255＝背景
    # 透明度：背景＝0、それ以外＝255。境目を少しぼかして、ギザギザを目立たなくする
    alpha = background.ifthenelse(0, 255).cast(:uchar).gaussblur(0.8).cast(:uchar)
    [img.bandjoin(alpha).pngsave_buffer(compression: 9, strip: true), "image/png", "png"]
  end
end
