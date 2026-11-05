class CreateUserTemplates < ActiveRecord::Migration[7.1]
  def change
    create_table :user_templates do |t|
      t.references :user, null: false, foreign_key: true
      t.string  :name,   null: false
      t.string  :ratio,  null: false, default: "16:9"
      t.integer :width,  null: false, default: 1280
      t.integer :height, null: false, default: 720
      t.text    :body,   size: :medium, null: false
      t.timestamps
    end
    add_index :user_templates, [:user_id, :updated_at]
  end
end
