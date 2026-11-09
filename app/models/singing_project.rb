# 💾 歌ってみたのプロジェクト（K39）。どれも「ログインしている本人のもの」だけを扱う（コントローラで current_user から探す）
# 音のファイルは files に、ファイル名＝ key（例：p1abc:a3 → p1abc~a3.bin）で入れる
class SingingProject < ApplicationRecord
  MAX_BYTES = 500.megabytes     # 1プロジェクトで保存できる大きさ（ファイルの合計）
  MAX_DATA_BYTES = 8.megabytes  # 設定・歌詞などの JSON の大きさ
  KEY_FORMAT = /\A[A-Za-z0-9]{1,40}:[A-Za-z0-9]{1,40}\z/
  UID_FORMAT = /\A[A-Za-z0-9]{4,40}\z/

  belongs_to :user
  has_many_attached :files

  validates :uid, presence: true, format: { with: UID_FORMAT }, uniqueness: { scope: :user_id }
  validates :name, length: { maximum: 200 }

  def self.filename_for(key)
    "#{key.to_s.tr(':', '~')}.bin"
  end

  def self.key_for(filename)
    filename.to_s.sub(/\.bin\z/, "").tr("~", ":")
  end

  def self.valid_key?(key)
    KEY_FORMAT.match?(key.to_s)
  end

  # その key のファイル（なければ nil）
  def file_for(key)
    name = self.class.filename_for(key)
    files.find { |f| f.filename.to_s == name }
  end

  # key → ファイル
  def files_by_key
    files.each_with_object({}) { |f, h| h[self.class.key_for(f.filename)] = f }
  end

  def files_bytes(except_key: nil)
    skip = except_key && self.class.filename_for(except_key)
    files.reject { |f| f.filename.to_s == skip }.sum(&:byte_size)
  end

  def recalc_size!
    update_column(:size_bytes, files.reload.sum(&:byte_size))
  end

  # 一覧用の小さい形
  def to_list_hash
    {
      id: uid,
      name: name,
      kind: (data || {})["kind"] || "singing",
      createdAt: ((data || {})["createdAt"] || (created_at.to_f * 1000)).to_i,
      updatedAt: (updated_at.to_f * 1000).to_i,
      bytes: size_bytes
    }
  end
end
