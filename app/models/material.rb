# デフォルト素材（管理者が入れて、みんなが使える部品・背景）
# ユーザーが自分で入れる画像（UserImage）とは別物。
class Material < ApplicationRecord
  KINDS = { "part" => "部品", "background" => "背景" }.freeze
  CONTENT_TYPES = %w[image/png image/jpeg image/webp image/gif image/svg+xml].freeze
  MAX_SIZE = 10.megabytes

  has_one_attached :image

  validates :name, presence: true, length: { maximum: 40 }
  validates :kind, inclusion: { in: KINDS.keys }
  validates :source_url, format: { with: %r{\Ahttps?://}, message: "は http:// か https:// で始めてください" }, allow_blank: true
  validate :image_must_be_valid

  scope :ordered, -> { order(:position, :id) }
  scope :visible, -> { where(visible: true) }

  def kind_label
    KINDS[kind]
  end

  private

  def image_must_be_valid
    unless image.attached?
      errors.add(:image, "を選んでください")
      return
    end
    errors.add(:image, "は PNG・JPEG・WebP・GIF・SVG にしてください") unless CONTENT_TYPES.include?(image.blob.content_type)
    errors.add(:image, "は10MBまでにしてください") if image.blob.byte_size > MAX_SIZE
  end
end
