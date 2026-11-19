# 🏘️ まちの ひろば に 出すか（管理画面で きりかえる。ゲスト用の アカウント などは 出さない）。2026-11-19 に ayaribon
#   テーブルは ふやさない（N2）。users に 1列 だけ
class AddShowInPlazaToUsers < ActiveRecord::Migration[7.1]
  def change
    add_column :users, :show_in_plaza, :boolean, default: true, null: false
  end
end
