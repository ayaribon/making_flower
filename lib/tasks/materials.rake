namespace :materials do
  # 最初から入っていた素材を、管理画面の「素材」に入れる。
  # すでに登録済みの素材は、キーだけ付け直す（画像はそのまま）。何回打っても大丈夫。
  #
  # ★ public/parts・public/backgrounds を消したあとでも動くように、
  #    すでに全部登録済みなら、ファイルを読まずに終わる。
  BUILTIN = [
    # [キー, 名前, 種類, ファイル, 引用元]
    ["bubble",      "吹き出し",       "part",       "parts/bubble.svg",            "KotoBouquet オリジナル"],
    ["star",        "星",             "part",       "parts/star.svg",              "KotoBouquet オリジナル"],
    ["heart",       "ハート",         "part",       "parts/heart.svg",             "KotoBouquet オリジナル"],
    ["arrow",       "矢印",           "part",       "parts/arrow.svg",             "KotoBouquet オリジナル"],
    ["burst-label", "ギザギザ",       "part",       "parts/burst-label.svg",       "KotoBouquet オリジナル"],
    ["frame",       "枠",             "part",       "parts/frame.svg",             "KotoBouquet オリジナル"],
    ["siva-circle", "SiVA ロゴ（丸）", "part",       "parts/siva-circle.png",       "SiVA"],
    ["siva-banner", "SiVA バナー",     "part",       "parts/siva-banner.png",       "SiVA"],
    ["burst",       "集中線",         "background", "backgrounds/burst.svg",       "KotoBouquet オリジナル"],
    ["neon-grid",   "ネオングリッド", "background", "backgrounds/neon-grid.svg",   "KotoBouquet オリジナル"],
    ["pastel-dots", "パステル水玉",   "background", "backgrounds/pastel-dots.svg", "KotoBouquet オリジナル"],
    ["pixel-heart", "ピクセルハート", "part", "parts/pixel-heart.svg", "KotoBouquet オリジナル"],
    ["pixel-cursor", "ピクセルカーソル", "part", "parts/pixel-cursor.svg", "KotoBouquet オリジナル"],
    ["pixel-hourglass", "ピクセル砂時計", "part", "parts/pixel-hourglass.svg", "KotoBouquet オリジナル"],
    ["sparkle4", "四つ星キラキラ", "part", "parts/sparkle4.svg", "KotoBouquet オリジナル"],
    ["light-dots", "光の粒", "part", "parts/light-dots.svg", "KotoBouquet オリジナル"],
    ["heart-dots", "ハートの粒", "part", "parts/heart-dots.svg", "KotoBouquet オリジナル"],
    ["moko-bubble", "もこもこ吹き出し", "part", "parts/moko-bubble.svg", "KotoBouquet オリジナル"],
    ["telop-band", "テロップの帯", "part", "parts/telop-band.svg", "KotoBouquet オリジナル"],
    ["name-tag", "名前タグ", "part", "parts/name-tag.svg", "KotoBouquet オリジナル"],
    ["cat-ears", "猫耳", "part", "parts/cat-ears.svg", "KotoBouquet オリジナル"],
    ["paw", "肉球", "part", "parts/paw.svg", "KotoBouquet オリジナル"],
    ["crown", "王冠", "part", "parts/crown.svg", "KotoBouquet オリジナル"],
    ["sakura", "桜", "part", "parts/sakura.svg", "KotoBouquet オリジナル"],
    ["sunflower", "ひまわり", "part", "parts/sunflower.svg", "KotoBouquet オリジナル"],
    ["momiji", "もみじ", "part", "parts/momiji.svg", "KotoBouquet オリジナル"],
    ["snowflake", "雪の結晶", "part", "parts/snowflake.svg", "KotoBouquet オリジナル"],
    ["pixel-grid", "ピクセルの格子", "background", "backgrounds/pixel-grid.svg", "KotoBouquet オリジナル"],
    ["monitor-screen", "モニター画面", "background", "backgrounds/monitor-screen.svg", "KotoBouquet オリジナル"],
    ["gingham", "ギンガムチェック", "background", "backgrounds/gingham.svg", "KotoBouquet オリジナル"],
    ["clouds", "雲", "background", "backgrounds/clouds.svg", "KotoBouquet オリジナル"],
    ["bubbles", "泡", "background", "backgrounds/bubbles.svg", "KotoBouquet オリジナル"],
    ["water-ripple", "水面のゆらぎ", "background", "backgrounds/water-ripple.svg", "KotoBouquet オリジナル"],
    ["starry-sky", "星空", "background", "backgrounds/starry-sky.svg", "KotoBouquet オリジナル"],
    ["aurora", "オーロラ", "background", "backgrounds/aurora.svg", "KotoBouquet オリジナル"],
    ["sakura-fubuki", "桜吹雪", "background", "backgrounds/sakura-fubuki.svg", "KotoBouquet オリジナル"],
    ["summer-sky", "夏空と入道雲", "background", "backgrounds/summer-sky.svg", "KotoBouquet オリジナル"],
    ["autumn-leaves", "紅葉", "background", "backgrounds/autumn-leaves.svg", "KotoBouquet オリジナル"],
    ["snow-night", "雪の夜", "background", "backgrounds/snow-night.svg", "KotoBouquet オリジナル"]
  ].freeze


  # 最初から入っていた素材のタグ（キー => タグ）。登録済みでもタグが空なら付ける
  BUILTIN_TAGS = {
    "bubble" => "bubble", "star" => "stamp,sparkle", "heart" => "stamp", "arrow" => "label",
    "burst-label" => "label", "frame" => "frame", "siva-circle" => "icon", "siva-banner" => "frame",
    "burst" => "pop", "neon-grid" => "cyber", "pastel-dots" => "pastel", "pixel-heart" => "pixel,stamp", "pixel-cursor" => "pixel,icon", "pixel-hourglass" => "pixel", "sparkle4" => "sparkle,stamp", "light-dots" => "sparkle", "heart-dots" => "sparkle,stamp", "moko-bubble" => "bubble", "telop-band" => "label", "name-tag" => "label", "cat-ears" => "icon", "paw" => "stamp,icon", "crown" => "stamp,icon", "sakura" => "season,stamp", "sunflower" => "season", "momiji" => "season", "snowflake" => "season,sparkle", "pixel-grid" => "cyber", "monitor-screen" => "cyber", "gingham" => "pastel", "clouds" => "pastel,nature", "bubbles" => "nature", "water-ripple" => "nature", "starry-sky" => "night", "aurora" => "night", "sakura-fubuki" => "season,pastel", "summer-sky" => "season,nature", "autumn-leaves" => "season,nature", "snow-night" => "season,night"
  }.freeze

  desc "最初から入っていた部品・背景を、素材（Material）にキー付きで登録する"
  task import_builtin: :environment do
    BUILTIN.each_with_index do |(key, name, kind, file, source), index|
      if (material = Material.find_by(key: key))
        if material.tags.blank? && BUILTIN_TAGS[key]
          material.update_columns(tags: BUILTIN_TAGS[key], updated_at: Time.current)
          puts "タグを付けた：#{name} → #{BUILTIN_TAGS[key]}"
        else
          puts "飛ばした（登録済み）：#{name}"
        end
        next
      end

      # キーなしで登録済みのもの（前のバージョンで入れたもの）は、キーだけ付ける
      if (material = Material.find_by(name: name, key: nil))
        material.update_columns(key: key, updated_at: Time.current)
        puts "キーを付けた：#{name} → #{key}"
        next
      end

      path = Rails.root.join("public", file)
      unless File.exist?(path)
        puts "見つからない：#{file}（public/ を消したあとなら、この素材は管理画面から入れ直してね）"
        next
      end

      material = Material.new(key: key, name: name, kind: kind, source_name: source, position: index * 10,
                              tags: BUILTIN_TAGS[key].to_s,
                              license_note: "KotoBouquet に同梱していた素材")
      material.image.attach(io: File.open(path), filename: File.basename(path),
                            content_type: Marcel::MimeType.for(Pathname(path)))
      material.save!
      puts "登録した：#{name}（#{key}）"
    end

    # テンプレで使っているのに、素材が見つからないキーを知らせる
    missing = Material.template_usage.keys - Material.where.not(key: nil).pluck(:key)
    if missing.any?
      puts "⚠️ テンプレで使っているのに見つからない素材：#{missing.join(', ')}"
    else
      puts "✅ テンプレで使う素材は全部そろってます"
    end
  end
end
