namespace :materials do
  # 今まで public/ に置いていた素材を、管理画面の「素材」に移す。
  # すでに同じ名前の素材があれば飛ばすので、何回打っても大丈夫。
  BUILTIN = [
    # [名前, 種類, ファイル, 引用元]
    ["吹き出し",       "part",       "parts/bubble.svg",            "KotoBouquet オリジナル"],
    ["星",             "part",       "parts/star.svg",              "KotoBouquet オリジナル"],
    ["ハート",         "part",       "parts/heart.svg",             "KotoBouquet オリジナル"],
    ["矢印",           "part",       "parts/arrow.svg",             "KotoBouquet オリジナル"],
    ["ギザギザ",       "part",       "parts/burst-label.svg",       "KotoBouquet オリジナル"],
    ["枠",             "part",       "parts/frame.svg",             "KotoBouquet オリジナル"],
    ["SiVA ロゴ（丸）", "part",       "parts/siva-circle.png",       "SiVA"],
    ["SiVA バナー",     "part",       "parts/siva-banner.png",       "SiVA"],
    ["集中線",         "background", "backgrounds/burst.svg",       "KotoBouquet オリジナル"],
    ["ネオングリッド", "background", "backgrounds/neon-grid.svg",   "KotoBouquet オリジナル"],
    ["パステル水玉",   "background", "backgrounds/pastel-dots.svg", "KotoBouquet オリジナル"]
  ].freeze

  desc "public/ にある今までの部品・背景を、素材（Material）に登録する"
  task import_builtin: :environment do
    BUILTIN.each_with_index do |(name, kind, file, source), index|
      if Material.exists?(name: name)
        puts "飛ばした（登録済み）：#{name}"
        next
      end

      path = Rails.root.join("public", file)
      unless File.exist?(path)
        puts "見つからない：#{file}"
        next
      end

      material = Material.new(name: name, kind: kind, source_name: source, position: index * 10,
                              license_note: "KotoBouquet に同梱していた素材")
      material.image.attach(io: File.open(path), filename: File.basename(path),
                            content_type: Marcel::MimeType.for(Pathname(path)))
      material.save!
      puts "登録した：#{name}"
    end
  end
end
