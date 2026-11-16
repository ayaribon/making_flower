# 🧑‍💼 Dettyan 育成ゲームのセーブ（1人1つ）。Issue #51 で N2 の例外として OK 済み
# data はゲームの数字だけ（version 入り。形が変わったら dettyan_save.js で移しかえる）
class CreateDettyanSaves < ActiveRecord::Migration[7.1]
  def change
    create_table :dettyan_saves do |t|
      t.references :user, null: false, foreign_key: true, index: { unique: true }
      t.json :data
      t.timestamps
    end
  end
end
