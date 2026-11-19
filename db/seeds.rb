# 🌱 開発用の 初期データ（bin/rails db:seed）
# - development の ときだけ うごく（本番・テストでは 何もしない）
# - 何回 流しても 同じ（もう あるものは 飛ばす）
# - 入れるもの：開発用の ユーザー（一般 1人・管理者 1人）、最初から ある 素材（materials:import_builtin）、テンプレ（design_templates:import）
# - ログインID は 画面に 出すだけ（ファイルには のこさない）。わすれたら bin/rails 'users:reissue[名前]'
return unless Rails.env.development?

require "rake"
Rails.application.load_tasks unless Rake::Task.task_defined?("materials:import_builtin")

DEV_USERS = [
  { name: "devuser", admin: false },  # 一般の ユーザー
  { name: "devadmin", admin: true }   # 管理者（/admin が 開ける）
].freeze

puts "=== 👤 開発用の ユーザー ==="
codes = []
DEV_USERS.each do |attrs|
  if User.exists?(name: attrs[:name])
    puts "飛ばした（もう いる）：#{attrs[:name]}（ログインID を 作り直すなら bin/rails 'users:reissue[#{attrs[:name]}]'）"
    next
  end

  user = User.create!(name: attrs[:name], admin: attrs[:admin], login_digest: "pending-#{SecureRandom.hex(8)}")
  codes << [user.name, user.admin? ? "管理者" : "一般", user.issue_login_code!]
end

puts "\n=== 🧩 最初から ある 素材 ==="
Rake::Task["materials:import_builtin"].invoke

puts "\n=== 📋 テンプレ ==="
Rake::Task["design_templates:import"].invoke

if codes.any?
  puts "\n=== 🔑 ログインID（この 画面に しか 出ません。ひかえて ください） ==="
  codes.each { |name, role, code| puts "#{name.ljust(9)} #{role.ljust(4)} #{code}" }
  puts "http://localhost:3000/login で 入力して ログイン"
end
