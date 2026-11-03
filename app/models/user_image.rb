require "securerandom"

# ユーザーが自分で入れた画像（立ち絵・背景など）。
# 保存先は S3（開発中は storage/ フォルダ）で、置き場所は「users/<ユーザー番号>/」にそろえる。
class UserImage < ApplicationRecord
  KINDS = %w[part background].freeze
  CONTENT_TYPES = %w[image/png image/jpeg image/webp image/gif].freeze
  MAX_BYTES = 10.megabytes

  belongs_to :user
  has_one_attached :file

  validates :kind, inclusion: { in: KINDS }
  validate :file_must_be_image

  # アップロードされたファイルを、その人のフォルダに保存して作る
  def self.create_for!(user, kind:, upload:)
    image = new(user: user, kind: kind, name: upload.original_filename.to_s.first(100))
    image.file.attach(
      io: upload,
      filename: upload.original_filename.presence || "image.png",
      content_type: upload.content_type,
      key: "users/#{user.id}/#{SecureRandom.uuid}"
    )
    image.save!
    image
  end

  private

  def file_must_be_image
    unless file.attached?
      errors.add(:file, "がありません")
      return
    end
    errors.add(:file, "は PNG・JPEG・WebP・GIF にしてください") unless CONTENT_TYPES.include?(file.content_type)
    errors.add(:file, "は10MB以下にしてください") if file.byte_size > MAX_BYTES
  end
end
