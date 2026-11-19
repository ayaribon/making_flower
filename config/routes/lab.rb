# 🧪 /lab（メンバーの 練習・試作の 場所。本体とは べつ。docs/lab/README.md）
# - /lab：区画の 一覧（Lab::HomeController。app/controllers/lab/ の 下の フォルダを 見て 自動で 出す）
# - /lab/名前/...：各区画。ルートは config/routes/lab/名前.rb に 書く（ここに 足さなくて いい。下で 全部 読む）
namespace :lab do
  root "home#index"

  Dir[Rails.root.join("config/routes/lab/*.rb")].sort.each do |file|
    draw("lab/#{File.basename(file, '.rb')}")
  end
end
