require "securerandom"
require "base64"

# 自分だけが使えるテンプレ（マイテンプレート）。中身は共通テンプレと同じ JSON の形。
# 共通テンプレと違って、マイ素材（自分の画像）もそのまま残す。
class UserTemplate < ApplicationRecord
  MAX_PER_USER = 50

  belongs_to :user
  has_one_attached :thumbnail

  validates :name, presence: true, length: { maximum: 40 }
  validates :ratio, inclusion: { in: DesignTemplate::RATIOS.keys }
  validates :body, presence: true
  validate :within_limit, on: :create

  # 大きさは比率から決める（共通テンプレと同じ）
  before_validation do
    self.width, self.height = DesignTemplate::RATIOS[ratio] if DesignTemplate::RATIOS.key?(ratio)
  end

  def data
    JSON.parse(body.presence || "{}")
  rescue JSON::ParserError
    {}
  end

  def to_editor_hash(thumbnail_url: nil)
    data.merge(
      "id" => id, "mine" => true, "label" => name, "icon" => "⭐",
      "ratio" => ratio, "width" => width, "height" => height, "thumb" => thumbnail_url
    )
  end

  # サムネ（data URL の JPEG か PNG）をつける。本人のフォルダに置く
  def attach_thumbnail_data_url(data_url)
    return if data_url.blank?
    m = data_url.to_s.match(/\Adata:image\/(jpeg|png);base64,(.+)\z/m)
    return unless m
    thumbnail.attach(
      io: StringIO.new(Base64.decode64(m[2])),
      filename: "thumb.#{m[1] == "png" ? "png" : "jpg"}",
      content_type: "image/#{m[1]}",
      key: "users/#{user_id}/templates/#{SecureRandom.uuid}"
    )
  end

  private

  def within_limit
    return unless user
    errors.add(:base, "マイテンプレは#{MAX_PER_USER}個までです") if user.user_templates.count >= MAX_PER_USER
  end
end
