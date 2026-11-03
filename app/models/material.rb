# デフォルト素材（管理者が入れて、みんなが使える部品・背景）
# ユーザーが自分で入れる画像（UserImage）とは別物。
class Material < ApplicationRecord
  KINDS = { "part" => "部品", "background" => "背景" }.freeze
  CONTENT_TYPES = %w[image/png image/jpeg image/webp image/gif image/svg+xml].freeze
  MAX_SIZE = 10.megabytes
  TEMPLATES_PATH = Rails.root.join("public/design_templates/templates.json")

  has_one_attached :image

  validates :name, presence: true, length: { maximum: 40 }
  validates :kind, inclusion: { in: KINDS.keys }
  validates :key, uniqueness: true, allow_blank: true,
                  format: { with: /\A[a-z0-9][a-z0-9-]{0,39}\z/, message: "は英小文字・数字・ハイフンで40文字までにしてください" }
  validates :source_url, format: { with: %r{\Ahttps?://}, message: "は http:// か https:// で始めてください" }, allow_blank: true
  validate :image_must_be_valid
  validate :key_cannot_change_while_used, on: :update

  before_validation { self.key = key.presence&.strip&.downcase }
  before_destroy :prevent_destroy_while_used

  scope :ordered, -> { order(:position, :id) }
  scope :visible, -> { where(visible: true) }

  def kind_label
    KINDS[kind]
  end

  # テンプレのデータで、どのキーがどのテンプレに使われているか（{"star" => ["デビュー配信", ...]}）
  def self.template_usage
    data = JSON.parse(File.read(TEMPLATES_PATH))
    list = data.is_a?(Hash) ? (data["templates"] || []) : data
    usage = Hash.new { |h, k| h[k] = [] }
    list.each do |t|
      label = t["label"] || t["id"].to_s
      keys = []
      keys << t.dig("background", "material")
      (t["items"] || []).each { |item| keys << item["material"] }
      keys.compact.uniq.each { |k| usage[k] << label }
    end
    usage
  rescue Errno::ENOENT, JSON::ParserError
    {}
  end

  # このテンプレで使われているか（使われているテンプレの名前の一覧）
  def used_in_templates
    return [] if key_was.blank?
    self.class.template_usage[key_was] || []
  end

  def used_in_templates?
    used_in_templates.any?
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

  # テンプレで使っている素材は、キーを変えると見つからなくなる
  def key_cannot_change_while_used
    return unless will_save_change_to_key? && used_in_templates?
    errors.add(:key, "はテンプレ（#{used_in_templates.join('・')}）で使っているので変えられません")
  end

  def prevent_destroy_while_used
    return unless used_in_templates?
    errors.add(:base, "テンプレ（#{used_in_templates.join('・')}）で使っているので削除できません")
    throw :abort
  end
end
