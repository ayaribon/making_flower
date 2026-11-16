# ✂️ 切り抜き動画の依頼（フォームの中身）。テーブルは作らない（N2）。送り先は Discord（DiscordNotifier）
# 動画そのものは受け取らない（N1）。配信のURL か、Googleドライブなどの共有リンクだけ
class ClipRequest
  include ActiveModel::Model
  include ActiveModel::Attributes

  ORIENTATIONS = { "vertical" => "📱 縦（ショート）", "horizontal" => "🖥 横", "either" => "どちらでも" }.freeze
  LENGTHS = { "60" => "60秒以内", "180" => "3分以内", "free" => "おまかせ" }.freeze
  SUBTITLES = { "yes" => "字幕あり", "no" => "字幕なし", "either" => "おまかせ" }.freeze

  attribute :video_url, :string
  attribute :scenes, :string
  attribute :orientation, :string, default: "vertical"
  attribute :length, :string, default: "60"
  attribute :subtitles, :string, default: "yes"
  attribute :title_idea, :string
  attribute :mood, :string
  attribute :deadline, :date
  attribute :note, :string
  attribute :permission, :boolean, default: false

  validates :video_url, presence: { message: "（動画のリンク）を入れてね" }, length: { maximum: 500 }
  validate :video_url_must_be_link
  validates :scenes, presence: { message: "（切り抜きたい所）を入れてね" }, length: { maximum: 1000 }
  validates :orientation, inclusion: { in: ORIENTATIONS.keys }
  validates :length, inclusion: { in: LENGTHS.keys }
  validates :subtitles, inclusion: { in: SUBTITLES.keys }
  validates :title_idea, length: { maximum: 100 }
  validates :mood, length: { maximum: 200 }
  validates :note, length: { maximum: 1000 }
  validates :permission, acceptance: { accept: [true], message: "にチェックしてね（自分の配信か、切り抜きの許可をもらったものだけ受け付けます）" }
  validate :deadline_not_past

  def self.human_attribute_name(attr, options = {})
    {
      "video_url" => "動画のリンク", "scenes" => "切り抜きたい所", "orientation" => "形", "length" => "長さ",
      "subtitles" => "字幕", "title_idea" => "タイトル案", "mood" => "ふんいき", "deadline" => "しめきり",
      "note" => "メモ", "permission" => "確認"
    }[attr.to_s] || super
  end

  private

  def video_url_must_be_link
    return if video_url.blank?
    uri = URI.parse(video_url.strip)
    errors.add(:video_url, "は http:// か https:// で始まるリンクにしてね") unless %w[http https].include?(uri.scheme) && uri.host.present?
  rescue URI::InvalidURIError
    errors.add(:video_url, "は http:// か https:// で始まるリンクにしてね")
  end

  def deadline_not_past
    errors.add(:deadline, "は今日より後の日にしてね") if deadline.present? && deadline < Date.current
  end
end
