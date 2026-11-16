# 📎 切り抜きに使っていい素材・画像を送る（リンクか画像。テーブルは作らない。画像は Discord に添付するだけで保存しない）
class ClipMaterial
  include ActiveModel::Model
  include ActiveModel::Attributes

  attribute :links, :string
  attribute :description, :string
  attribute :permission, :boolean, default: false

  validates :links, length: { maximum: 1000 } # リンクか画像のどちらか（画像はコントローラーで見る）
  validate :links_must_be_urls
  validates :description, length: { maximum: 500 }
  validates :permission, acceptance: { accept: [true], message: "にチェックしてね（使ってよい素材だけ受け付けます）" }

  def self.human_attribute_name(attr, options = {})
    { "links" => "素材のリンク", "description" => "どんな素材？", "permission" => "確認" }[attr.to_s] || super
  end

  private

  # 1行に1つ、http(s) のリンク
  def links_must_be_urls
    lines = links.to_s.split(/\R/).map(&:strip).reject(&:blank?)
    return if lines.empty?
    bad = lines.reject do |l|
      uri = URI.parse(l) rescue nil
      uri && %w[http https].include?(uri.scheme) && uri.host.present?
    end
    errors.add(:links, "は1行に1つ、http:// か https:// で始まるリンクにしてね") if bad.any?
  end
end
