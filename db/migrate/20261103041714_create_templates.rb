class CreateTemplates < ActiveRecord::Migration[7.1]
  def change
    create_table :templates do |t|
      t.string :name, null: false
      t.text :description
      t.string :category
      t.integer :position, default: 0, null: false
      t.boolean :published, default: false, null: false

      t.timestamps
    end
  end
end
