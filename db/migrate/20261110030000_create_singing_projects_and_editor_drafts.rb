# 💾 歌ってみたのプロジェクトと、画像編集の下書きを、アカウントに保存する（K39・11/10）
# - singing_projects：設定・歌詞・部分などは data（JSON）、音（オケ・声・録り直し・ハモリなど）と MV の画像は ActiveStorage の files
# - editor_drafts：画像編集の下書き（1人1つ）
# 開発は Disk、本番は今の画像と同じ S3（config/storage.yml の :amazon）に置く
class CreateSingingProjectsAndEditorDrafts < ActiveRecord::Migration[7.1]
  def change
    create_table :singing_projects do |t|
      t.references :user, null: false, foreign_key: true
      t.string  :uid,  null: false              # ブラウザが作るプロジェクトID（例：p1abc2xyz）
      t.string  :name, null: false, default: ""
      t.json    :data                           # { state, audioKeys, audioSeq, createdAt, kind }（音は files の key で参照するだけ）
      t.bigint  :size_bytes, null: false, default: 0 # 保存しているファイルの合計（1プロジェクト 500MB まで）
      t.timestamps
    end
    add_index :singing_projects, [:user_id, :uid], unique: true
    add_index :singing_projects, [:user_id, :updated_at]

    create_table :editor_drafts do |t|
      t.references :user, null: false, foreign_key: true, index: { unique: true }
      t.json :data                              # 画像編集の「戻す」用の状態（canvas の JSON と比率）
      t.timestamps
    end
  end
end
