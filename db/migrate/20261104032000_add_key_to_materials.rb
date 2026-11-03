class AddKeyToMaterials < ActiveRecord::Migration[7.1]
  def change
    # テンプレから素材を指定するための決まった名前（例：star）。番号は環境ごとに変わるので使わない
    add_column :materials, :key, :string
    add_index :materials, :key, unique: true
  end
end
