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
pin "lyric_align"
pin "project_store" # 💾 プロジェクト保存（K24・IndexedDB）
pin "project_server" # 💾 プロジェクトをアカウントに保存（K39・サーバー）
pin "harmony" # 🎶 ハモリ・ケロケロ風（K29）
