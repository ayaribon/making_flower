# ✂️ 切り抜き動画の依頼（ひとり1回1依頼にするため、依頼中かどうかを覚える）
# status：working（作業中）→ done（できた）／declined（お断り）／canceled（キャンセル）
class CreateClipRequests < ActiveRecord::Migration[7.1]
  def change
    create_table :clip_requests do |t|
      t.references :user, null: false, foreign_key: true
      t.string :status, null: false, default: "working"
      t.string :video_url, null: false, limit: 500
      t.text :scenes, null: false
      t.string :orientation, null: false, default: "vertical"
      t.string :length, null: false, default: "60"
      t.string :subtitles, null: false, default: "yes"
      t.string :title_idea, limit: 100
      t.string :mood, limit: 200
      t.date :deadline
      t.text :note
      t.text :material_links
      t.string :result_url, limit: 500 # できあがった動画のリンク（管理者が入れる）
      t.datetime :closed_at            # できた・お断り・キャンセルになった時間
      t.timestamps
    end
    add_index :clip_requests, [:user_id, :status]
  end
end
