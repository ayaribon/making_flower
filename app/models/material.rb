require "securerandom"

# デフォルト素材（管理者が入れて、みんなが使える部品・背景）
# ユーザーが自分で入れる画像（UserImage）とは別物。
class Material < ApplicationRecord
  KINDS = { "part" => "部品", "background" => "背景" }.freeze
  CONTENT_TYPES = %w[image/png image/jpeg image/webp image/gif image/svg+xml].freeze
  MAX_SIZE = 10.megabytes
  # 背景は、比率ごとの画像も持てる（なければ 16:9 用の画像を切り抜いて使う）
  RATIO_IMAGES = { "9:16" => :image_portrait, "1:1" => :image_square }.freeze

  # パネルの上に並べるタグ（この順番で出る）。キー => [アイコン, 名前]
  # 管理画面では、このキーを「,」区切りで入れる（例：stamp,sparkle）
  TAGS = {
    "part" => {
      "stamp"   => ["⭐", "スタンプ"],
      "bubble"  => ["💬", "吹き出し"],
      "label"   => ["🏷️", "帯・ラベル"],
      "pixel"   => ["👾", "ピクセル"],
      "icon"    => ["🐱", "アイコン"],
      "frame"   => ["🖼️", "枠"],
      "sparkle" => ["✨", "キラキラ"],
      "season"  => ["🌸", "季節"]
    },
    "background" => {
      "cyber"   => ["🎮", "サイバー"],
      "pastel"  => ["🍬", "パステル"],
      "nature"  => ["🌊", "自然"],
      "night"   => ["🌙", "夜空"],
      "pop"     => ["💥", "ポップ"],
      "season"  => ["🌸", "季節"]
    }
  }.freeze

  def tag_list
    tags.to_s.split(",").map(&:strip).reject(&:blank?)
  end

  def tag_list=(value)
    list = value.is_a?(Array) ? value : value.to_s.split(/[,、\s]+/)
    self.tags = list.map { |t| t.to_s.strip.downcase }.reject(&:blank?).uniq.join(",")
  end

  def tag_labels
    tag_list.map { |t| TAGS.dig(kind, t)&.join(" ") || t }
  end

  has_one_attached :image
  has_one_attached :image_portrait   # 9:16 用（背景だけ）
  has_one_attached :image_square     # 1:1 用（背景だけ）
  has_one_attached :thumb            # 一覧用の小さい画像（長い辺256px・PNG）。保存したとき自動で作る

  # 管理画面の「この比率の画像を外す」
  attr_accessor :remove_image_portrait, :remove_image_square
  before_save :purge_removed_ratio_images
  # 元の画像が変わったら、保存が終わったあとにサムネを作り直す
  before_save { @regenerate_thumb = attachment_changes["image"].present? }
  after_commit :regenerate_thumb_if_needed, on: [:create, :update]

  # その比率で使う画像（比率ごとの画像がなければ、ふつうの画像）
  def image_for(ratio)
    name = RATIO_IMAGES[ratio]
    attachment = name && public_send(name)
    attachment&.attached? ? attachment : image
  end

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

  # どのキーがどのテンプレに使われているか（{"star" => ["デビュー配信", ...]}）
  # テンプレは管理画面の「📋 テンプレ」（DesignTemplate）を見る
  def self.template_usage
    DesignTemplate.material_usage
  end

  # このテンプレで使われているか（使われているテンプレの名前の一覧）
  def used_in_templates
    return [] if key_was.blank?
    self.class.template_usage[key_was] || []
  end

  def used_in_templates?
    used_in_templates.any?
  end

  # 一覧用のサムネを作る。SVGは軽くてキレイなので作らない（一覧でも元の画像を使う）
  def generate_thumb!
    return unless image.attached?
    return if image.blob.content_type == "image/svg+xml"
    image.blob.open do |file|
      out = ImageProcessing::Vips.source(file).resize_to_limit(256, 256).convert("png").call
      thumb.attach(io: File.open(out.path), filename: "thumb.png", content_type: "image/png",
                   key: "materials/#{id}/thumbs/#{SecureRandom.uuid}")
    end
  rescue StandardError => e
    # サムネが作れなくても、素材の保存は失敗させない（一覧は元の画像で出る）
    Rails.logger.warn("[material #{id}] サムネを作れませんでした: #{e.class}: #{e.message}")
  end

  private

  def image_must_be_valid
    unless image.attached?
      errors.add(:image, "を選んでください")
      return
    end
    errors.add(:image, "は PNG・JPEG・WebP・GIF・SVG にしてください") unless CONTENT_TYPES.include?(image.blob.content_type)
    errors.add(:image, "は10MBまでにしてください") if image.blob.byte_size > MAX_SIZE

    RATIO_IMAGES.each do |ratio, name|
      attachment = public_send(name)
      next unless attachment.attached?
      errors.add(:base, "#{ratio}用の画像は、背景だけに付けられます") if kind != "background" && !removing?(name)
      errors.add(:base, "#{ratio}用の画像は PNG・JPEG・WebP・GIF・SVG にしてください") unless CONTENT_TYPES.include?(attachment.blob.content_type)
      errors.add(:base, "#{ratio}用の画像は10MBまでにしてください") if attachment.blob.byte_size > MAX_SIZE
    end
  end

  def removing?(name)
    ActiveModel::Type::Boolean.new.cast(public_send("remove_#{name}"))
  end

  def purge_removed_ratio_images
    RATIO_IMAGES.each_value do |name|
      public_send(name).purge_later if removing?(name) && public_send(name).attached?
    end
  end

  def regenerate_thumb_if_needed
    return unless @regenerate_thumb
    @regenerate_thumb = false   # サムネをつけるときにもう1回保存されるので、くり返さないように
    generate_thumb!
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
