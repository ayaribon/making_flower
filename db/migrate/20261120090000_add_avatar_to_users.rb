# 👤 はじまりのまち の アバター（キャラメイク）を ユーザーに 1つ
# 中身は JSON の文字列（app/javascript/avatar_sprite.js の形。User の serialize で ハッシュ として読む）
# テーブルは 増やさない（AGENTS.md の N2）。列を 1つ 足すだけ
class AddAvatarToUsers < ActiveRecord::Migration[7.1]
  def change
    add_column :users, :avatar, :text
  end
end
