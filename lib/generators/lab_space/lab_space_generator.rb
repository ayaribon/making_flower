# 🧪 /lab の 区画を 作る：bin/rails g lab_space 名前（けす ときは bin/rails destroy lab_space 名前。docs/lab/README.md）
# - 名前は 英小文字と 数字だけ（さいしょは 英小文字）。もう ある 区画なら 止める
# - できる もの：コントローラー・モデルの 置き場（テーブルは lab_名前_〇〇）・画面・枠の 置き場・JS・Stimulus・CSS・ルート・テスト・docs
# - 共通の ファイルは かえない（ルートは config/routes/lab/*.rb を 自動で 読む。/lab の 一覧も フォルダを 見て 自動で 出る）
class LabSpaceGenerator < Rails::Generators::Base
  source_root File.expand_path("templates", __dir__)
  argument :space_name, type: :string, banner: "名前（英小文字と数字）"

  NAME_FORMAT = /\A[a-z][a-z0-9]*\z/
  # 共通の ファイル（Lab::HomeController・Lab::BaseController・views/lab/home）と ぶつかる 名前
  RESERVED = %w[home base lab].freeze
  # 区画の フォルダが できる 場所（どの 層も lab/名前/ の 下）
  SPACE_DIRS = %w[app/controllers/lab app/models/lab app/views/lab app/views/layouts/lab app/javascript/lab
                  app/javascript/controllers/lab app/assets/stylesheets/lab test/lab docs/lab].freeze

  def check_name
    unless space_name.match?(NAME_FORMAT)
      raise Thor::Error, "区画の 名前は 英小文字と 数字だけ（さいしょは 英小文字）：#{space_name.inspect}"
    end
    if RESERVED.include?(space_name)
      raise Thor::Error, "「#{space_name}」は lab の 共通で 使って いる 名前なので 使えません"
    end
    return if behavior == :revoke # bin/rails destroy lab_space 名前（区画を けす）の ときは「もう ある」で 止めない
    if File.exist?(File.join(destination_root, "app/controllers/lab", space_name)) || File.exist?(File.join(destination_root, "config/routes/lab/#{space_name}.rb"))
      raise Thor::Error, "区画「#{space_name}」は もう あります"
    end
  end

  def create_space
    n = space_name
    template "base_controller.rb.tt", "app/controllers/lab/#{n}/base_controller.rb"
    template "home_controller.rb.tt", "app/controllers/lab/#{n}/home_controller.rb"
    template "model_namespace.rb.tt", "app/models/lab/#{n}.rb"
    create_file "app/models/lab/#{n}/.keep", ""
    template "index.html.erb.tt", "app/views/lab/#{n}/home/index.html.erb"
    create_file "app/views/layouts/lab/#{n}/.keep", ""
    template "greeting.js.tt", "app/javascript/lab/#{n}/greeting.js"
    template "hello_controller.js.tt", "app/javascript/controllers/lab/#{n}/hello_controller.js"
    template "space.css.tt", "app/assets/stylesheets/lab/#{n}/#{n}.css"
    template "routes.rb.tt", "config/routes/lab/#{n}.rb"
    template "home_controller_test.rb.tt", "test/lab/#{n}/home_controller_test.rb"
    template "README.md.tt", "docs/lab/#{n}/README.md"
  end

  # けす ときは、のこった 空の フォルダも けす（のこると /lab の 一覧に 出て しまう）
  def remove_empty_dirs
    return unless behavior == :revoke
    SPACE_DIRS.each do |dir|
      path = File.join(destination_root, dir, space_name)
      next unless File.directory?(path) && Dir.glob(File.join(path, "**", "*"), File::FNM_DOTMATCH).none? { |f| File.file?(f) }
      FileUtils.rm_r(path)
      say_status :remove, File.join(dir, space_name), :red
    end
  end

  def done
    return if behavior == :revoke
    say "\n🧪 区画「#{space_name}」が できました → /lab/#{space_name}", :green
  end

  private

  # Lab::名前（モジュール名）
  def module_name
    space_name.camelize
  end
end
