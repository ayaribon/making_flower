class CreateUserImages < ActiveRecord::Migration[7.1]
  def change
    create_table :user_images do |t|
      t.references :user, null: false, foreign_key: true
      t.string :kind, null: false        # "part"（部品）か "background"（背景）
      t.string :name                     # 元のファイル名（一覧の表示用）

      t.timestamps
    end

    add_index :user_images, [:user_id, :kind]
  end
end
