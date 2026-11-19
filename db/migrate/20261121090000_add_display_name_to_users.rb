# 🏷️ 表示名（まち・あいさつ に 出る なまえ）。ログインの 呼び名（name）とは べつ。空なら 呼び名を 出す
class AddDisplayNameToUsers < ActiveRecord::Migration[7.1]
  def change
    add_column :users, :display_name, :string, limit: 40
  end
end
