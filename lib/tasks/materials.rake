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
    ["pastel-dots", "パステル水玉",   "background", "backgrounds/pastel-dots.svg", "KotoBouquet オリジナル"]
  ].freeze

  desc "最初から入っていた部品・背景を、素材（Material）にキー付きで登録する"
  task import_builtin: :environment do
    BUILTIN.each_with_index do |(key, name, kind, file, source), index|
      if (material = Material.find_by(key: key))
        puts "飛ばした（登録済み）：#{name}"
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
