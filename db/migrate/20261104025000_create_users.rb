class CreateUsers < ActiveRecord::Migration[7.1]
  def change
    create_table :users do |t|
      t.string :name, null: false                 # 呼び名（例：Dettyan）。個人情報は入れない
      t.string :login_digest, null: false         # ログインIDを暗号化したもの。ID本体は保存しない
      t.boolean :admin, null: false, default: false

      t.timestamps
    end

    add_index :users, :name, unique: true
    add_index :users, :login_digest, unique: true
  end
end
