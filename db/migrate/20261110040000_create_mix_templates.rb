# 💾 ミックス設定のテンプレート（K42・11/10）。歌ってみたの「④ミックス」の設定を名前を付けてアカウントに保存し、ほかの曲でも使えるようにする
# data（JSON）：{ version, mix（雰囲気・スライダー・詳細モード・🎛エフェクト）, preset, inputGainDb, harmony: [{ interval, gain, pan, enabled }] }
# 曲ごとのもの（部分の位置・ピン・歌詞・ずれ・音のデータ）は入れない
class CreateMixTemplates < ActiveRecord::Migration[7.1]
  def change
    create_table :mix_templates do |t|
      t.references :user, null: false, foreign_key: true
      t.string :name, null: false, default: ""
      t.json   :data
      t.timestamps
    end
    add_index :mix_templates, [:user_id, :updated_at]
  end
end
