# 管理画面で作る・直すテンプレ。
# 中身（body）は、もとの templates.json の1件と同じ形の JSON で持つ。
#   background: { color: "#fff" } / { gradient: [色1, 色2, 向き] } / { material: "素材のキー" }
#   items: [{ type: "text" | "part" | "placeholder", x, y, ... }]（位置や大きさはキャンバスに対する割合）
#   filters: [{ key, strength, color }]、frame: "monitor" など
# 素材は「キー」で覚えておくので、素材の画像を差し替えてもテンプレは壊れない。
class DesignTemplate < ApplicationRecord
  RATIOS = {
    "16:9" => [1280, 720],
    "9:16" => [1080, 1920],
    "1:1"  => [1080, 1080]
  }.freeze
  ITEM_TYPES = %w[text part placeholder].freeze
  MAX_ITEMS = 200
  THUMB_TYPES = %w[image/jpeg image/png].freeze
  THUMB_MAX = 2.megabytes
  SEED_PATH = Rails.root.join("public/design_templates/templates.json")

  has_one_attached :thumbnail

  validates :name, presence: true, length: { maximum: 40 }
  validates :icon, length: { maximum: 8 }
  validates :ratio, inclusion: { in: RATIOS.keys }
  validates :position, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validate :body_must_be_valid

  before_validation do
    self.icon = icon.to_s.strip.presence || "📋"
    self.width, self.height = RATIOS[ratio] if RATIOS.key?(ratio)
  end

  scope :ordered, -> { order(:position, :id) }
  scope :visible, -> { where(visible: true) }

  # 中身を Hash で返す（壊れていたら空っぽ）
  def data
    parsed = JSON.parse(body.to_s)
    parsed.is_a?(Hash) ? parsed : {}
  rescue JSON::ParserError
    {}
  end

  def data=(hash)
    self.body = hash.to_json
  end

  # このテンプレで使っている素材のキー
  def material_keys
    d = data
    keys = [d.dig("background", "material")]
    Array(d["items"]).each { |item| keys << item["material"] if item.is_a?(Hash) }
    keys.compact.map(&:to_s).reject(&:blank?).uniq
  end

  # どのキーがどのテンプレに使われているか（{"star" => ["デビュー配信", ...]}）
  def self.material_usage
    usage = Hash.new { |h, k| h[k] = [] }
    find_each { |t| t.material_keys.each { |k| usage[k] << t.name } }
    usage
  end

  # 編集画面に渡す形（もとの templates.json の1件と同じ形＋α）
  def to_editor_hash(thumbnail_url: nil)
    data.merge(
      "id" => id,
      "label" => name,
      "icon" => icon,
      "ratio" => ratio,
      "width" => width,
      "height" => height,
      "visible" => visible,
      "thumb" => thumbnail_url
    )
  end

  # 編集画面から届いた「data:image/jpeg;base64,...」をサムネにする
  def attach_thumbnail_data_url(data_url)
    match = data_url.to_s.match(%r{\Adata:(image/(?:jpeg|png));base64,(.+)\z}m)
    return false unless match

    bytes = Base64.decode64(match[2])
    return false if bytes.bytesize > THUMB_MAX

    ext = match[1] == "image/png" ? "png" : "jpg"
    thumbnail.attach(io: StringIO.new(bytes), filename: "template-#{id || 'new'}.#{ext}", content_type: match[1])
    true
  end

  private

  def body_must_be_valid
    d = data
    if body.blank? || d.empty?
      errors.add(:body, "（テンプレの中身）が読めません")
      return
    end
    items = d["items"]
    unless items.nil? || items.is_a?(Array)
      errors.add(:body, "の items の形がちがいます")
      return
    end
    items = Array(items)
    errors.add(:body, "の文字・部品が多すぎます（#{MAX_ITEMS}個まで）") if items.size > MAX_ITEMS
    unless items.all? { |i| i.is_a?(Hash) && ITEM_TYPES.include?(i["type"]) }
      errors.add(:body, "に知らない種類の部品が入っています")
    end
  end
end
