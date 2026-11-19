# 🧪 区画「dettyan」の ルート（config/routes/lab.rb が 自動で 読む。ほかの ファイルに 足さなくて いい）
#   /lab/dettyan/... → Lab::Dettyan::〇〇Controller
namespace :dettyan do
  root "home#index"
end
