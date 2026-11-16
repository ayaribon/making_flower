# ✂️ 切り抜き動画の依頼。ひとり1回1依頼（作業中のものがあるあいだは、新しく頼めない）
# 動画そのものは受け取らない（N1）。配信のURL か、Googleドライブなどの共有リンクだけ
# 送り先は Discord（DiscordNotifier）。できた・お断りは管理画面で
class ClipRequest < ApplicationRecord
  belongs_to :user

  ORIENTATIONS = { "vertical" => "📱 縦（ショート）", "horizontal" => "🖥 横", "either" => "どちらでも" }.freeze
  LENGTHS = { "60" => "60秒以内", "180" => "3分以内", "free" => "おまかせ" }.freeze
  SUBTITLES = { "yes" => "字幕あり", "no" => "字幕なし", "either" => "おまかせ" }.freeze
  STATUSES = { "working" => "作業中", "done" => "できた", "declined" => "お断り", "canceled" => "キャンセル" }.freeze

  # 送るときだけのチェック（保存はしない）
  attribute :permission, :boolean, default: false

  scope :working, -> { where(status: "working") }
  scope :recent_first, -> { order(created_at: :desc) }

  validates :video_url, presence: { message: "（動画のリンク）を入れてね" }, length: { maximum: 500 }
  validate :video_url_must_be_link
  validates :scenes, presence: { message: "（切り抜きたい所）を入れてね" }, length: { maximum: 1000 }
  validates :orientation, inclusion: { in: ORIENTATIONS.keys }
  validates :length, inclusion: { in: LENGTHS.keys }
  validates :subtitles, inclusion: { in: SUBTITLES.keys }
  validates :status, inclusion: { in: STATUSES.keys }
  validates :title_idea, length: { maximum: 100 }
  validates :mood, length: { maximum: 200 }
  validates :note, length: { maximum: 1000 }
  validates :material_links, length: { maximum: 1000 }
  validates :result_url, length: { maximum: 500 }
  validate :result_url_must_be_link
  validates :permission, acceptance: { accept: [true], message: "にチェックしてね（自分の配信か、切り抜きの許可をもらったものだけ受け付けます。上の注意も読んでね）" }, on: :create
  validate :deadline_not_past, on: :create
  validate :one_working_per_user, on: :create

  def self.human_attribute_name(attr, options = {})
    {
      "video_url" => "動画のリンク", "scenes" => "切り抜きたい所", "orientation" => "形", "length" => "長さ",
      "subtitles" => "字幕", "title_idea" => "タイトル案", "mood" => "ふんいき", "deadline" => "しめきり",
      "note" => "メモ", "permission" => "確認", "material_links" => "使っていい素材・画像", "result_url" => "できた動画のリンク"
    }[attr.to_s] || super
  end

  def working?
    status == "working"
  end

  def status_label
    STATUSES[status]
  end

  # 作業中のものを閉じる（できた・お断り・キャンセル）
  def close!(new_status, result_url: nil)
    raise ArgumentError, "status" unless %w[done declined canceled].include?(new_status)
    update!(status: new_status, result_url: result_url.presence || self.result_url, closed_at: Time.current)
  end

  private

  def link?(value)
    uri = URI.parse(value.to_s.strip)
    %w[http https].include?(uri.scheme) && uri.host.present?
  rescue URI::InvalidURIError
    false
  end

  def video_url_must_be_link
    return if video_url.blank?
    errors.add(:video_url, "は http:// か https:// で始まるリンクにしてね") unless link?(video_url)
  end

  def result_url_must_be_link
    return if result_url.blank?
    errors.add(:result_url, "は http:// か https:// で始まるリンクにしてね") unless link?(result_url)
  end

  def deadline_not_past
    errors.add(:deadline, "は今日より後の日にしてね") if deadline.present? && deadline < Date.current
  end

  def one_working_per_user
    return unless user && ClipRequest.working.where(user_id: user_id).exists?
    errors.add(:base, "いま作業中の依頼があります。できあがるまで待つか、キャンセルしてからたのんでね")
  end
end
