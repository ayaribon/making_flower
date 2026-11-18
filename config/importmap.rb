# Pin npm packages by running ./bin/importmap

pin "application"
pin "@hotwired/turbo-rails", to: "turbo.min.js"
pin "@hotwired/stimulus", to: "stimulus.min.js"
pin "@hotwired/stimulus-loading", to: "stimulus-loading.js"
pin_all_from "app/javascript/controllers", under: "controllers"
pin "fabric" # @7.4.0
pin "text_styles"
pin "image_store"
pin "color_key_filter"
pin "ai_cutout"
pin "vocal_tools"
pin "mix_chain"
pin "mv_renderer"
pin "mp4-muxer" # @5.2.1（vendor/javascript に置いた）
pin "mv_export"
pin "mv_templates" # 🪄 MV のテンプレート（かんたん作成）
pin "lyric_align"
pin "project_store" # 💾 プロジェクト保存（K24・IndexedDB）
pin "project_server" # 💾 プロジェクトをアカウントに保存（K39・サーバー）
pin "harmony" # 🎶 ハモリ・ケロケロ風（K29）
pin "pixel_buddy" # 🧑‍🎨 ドット絵の子（歌う子・ほめてくれる子の絵）
pin "pixel_singer" # 🎤 試聴中に歌うドット絵の子
pin "dettyan_sprite" # 🧑‍💼 Dettyan のドット絵
pin "dettyan_save" # 💾 Dettyan のセーブ（サーバー＋控え）
pin "dettyan_sound" # 🎵 Dettyan の BGM・SE
pin "dettyan_foods" # 🍽️ Dettyan のごはん（ショップの商品の表）
pin "dettyan_care" # 🤚 おせわ・ショップ・放置の計算
pin "dettyan_adventure" # ⚔️ モンスター退治（行き先・スライム・バトルの計算）
pin "dettyan_gear" # 🗡️ そうび（あたま・からだ・て・せなか・あし）
pin "dettyan_room" # 🏢 Dettyan の事務所の部屋の絵
pin "dettyan_scenes" # 🌳 モンスター退治の けしき
pin "dettyan_battle" # ⚔️ バトル（手動・オート）・ステータス・職業・スキル
pin "dettyan_home" # 🏠 テント → マイホーム・家具
pin "dettyan_camp" # ⛺ テントと おはなしの けしき
pin "dettyan_story" # 📖 おはなし（目標と ページ）
pin "avatar_sprite" # 👤 みんなの アバター（キャラメイクの 部品と 絵）
pin "town_world" # 🏘️ はじまりのまち（トップページの 町）の 絵
