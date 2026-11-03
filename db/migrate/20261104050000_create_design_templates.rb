class CreateDesignTemplates < ActiveRecord::Migration[7.1]
  def change
    # 管理画面から作る・直すテンプレ（花束のころの templates テーブルとは別物）
    create_table :design_templates do |t|
      t.string  :name,     null: false
      t.string  :icon,     null: false, default: "📋"
      t.string  :ratio,    null: false, default: "16:9"
      t.integer :width,    null: false, default: 1280
      t.integer :height,   null: false, default: 720
      # 中身（背景・文字・部品・エフェクト）。templates.json の1件と同じ形の JSON
      t.text    :body,     null: false, size: :medium
      t.boolean :visible,  null: false, default: true
      t.integer :position, null: false, default: 0
      # templates.json から移したときの元の id（何回取り込んでも増えないように）
      t.string  :slug
      t.timestamps
    end
    add_index :design_templates, :slug, unique: true
    add_index :design_templates, [:ratio, :position]
  end
end
