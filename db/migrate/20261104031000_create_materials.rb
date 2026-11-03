class CreateMaterials < ActiveRecord::Migration[7.1]
  def change
    create_table :materials do |t|
      t.string  :name, null: false                     # 一覧に出す名前（例：ハート）
      t.string  :kind, null: false, default: "part"    # part（部品）／ background（背景）
      t.string  :source_name                           # 引用元の名前（例：いらすとや）
      t.string  :source_url                            # 引用元のURL
      t.text    :license_note                          # ライセンスのメモ（商用OKか、など。画面には出さない）
      t.boolean :visible, null: false, default: true   # エディタに出すか
      t.integer :position, null: false, default: 0     # 並び順（小さいほど前）

      t.timestamps
    end

    add_index :materials, [:kind, :visible, :position]
  end
end
