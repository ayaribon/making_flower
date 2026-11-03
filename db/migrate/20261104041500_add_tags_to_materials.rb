class AddTagsToMaterials < ActiveRecord::Migration[7.1]
  def change
    # タグはカンマ区切りで持つ（例："stamp,sparkle"）。素材の数が少ないうちは、これで十分
    add_column :materials, :tags, :string, null: false, default: ""
  end
end
