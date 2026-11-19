# 🧪 /lab の 入口：区画の 一覧。app/controllers/lab/ の 下の フォルダ（＝区画）を 見て 自動で 出す（リンクを 手で 足さない）
class Lab::HomeController < Lab::BaseController
  NAME_FORMAT = /\A[a-z][a-z0-9]*\z/

  def index
    @spaces = self.class.spaces
  end

  # 区画の 名前（英小文字と 数字）。フォルダが ある だけで 出る
  def self.spaces
    Dir[Rails.root.join("app/controllers/lab/*/")].map { |dir| File.basename(dir) }.grep(NAME_FORMAT).sort
  end
end
