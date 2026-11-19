require "openssl"
require "securerandom"

# ログインは「ログインID」だけ。パスワードやメールアドレスは持たない。
# ログインIDは「呼び名-ランダム4文字」（例：dettyan-k7qm）。
# データベースには暗号化した値（login_digest）だけを残すので、あとから運営者でも元のIDは見られない。
class User < ApplicationRecord
  # ユーザーを消したら、その人の画像（S3のファイルも）一緒に消す
  has_many :user_images, dependent: :destroy
  has_many :user_templates, dependent: :destroy
  # 💾 歌ってみたのプロジェクト・画像編集の下書き（K39）。ユーザーを消したら一緒に消す（S3 のファイルも）
  has_many :singing_projects, dependent: :destroy
  has_one :editor_draft, dependent: :destroy
  # 🧑‍💼 Dettyan 育成ゲームのセーブ（1人1つ）
  has_one :dettyan_save, dependent: :destroy
  # 💾 ミックス設定のテンプレート（K42）
  has_many :mix_templates, dependent: :destroy
  # ✂️ 切り抜き動画の依頼（ひとり1回1依頼）
  has_many :clip_requests, dependent: :destroy

  # 👤 はじまりのまち の アバター（キャラメイク）。{ "hair" => "bob", "skin" => 1, ... }。まだ作っていないときは nil
  # 中身の形は app/javascript/avatar_sprite.js（えらべる値は そちらで そろえる。ここでは 知らない項目・へんな値を すてるだけ）
  # 💬 "msg" は まちで みんなに 見える ひとこと（20文字まで）。同じ 列の 中に 入れる（列は 増やさない）
  serialize :avatar, coder: JSON
  AVATAR_LOOK_KEYS = %w[v skin hair hairColor eyes top topColor bottom bottomColor shoes acc hs].freeze
  AVATAR_KEYS = (AVATAR_LOOK_KEYS + %w[msg]).freeze
  AVATAR_MSG_MAX = 20
  # 見えない 文字（改行・タブ・ゼロはば・向きを かえる 文字）は すきまに する
  AVATAR_MSG_HIDDEN = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/

  def self.clean_avatar(raw)
    return nil unless raw.respond_to?(:to_h)
    hash = raw.to_h.stringify_keys
    out = hash.slice(*AVATAR_LOOK_KEYS).each_with_object({}) do |(key, value), look|
      case value
      when Integer then look[key] = value if value.between?(0, 99)
      when String
        if value.match?(/\A\d{1,2}\z/) then look[key] = value.to_i
        elsif value.match?(/\A[a-z][a-z_]{0,19}\z/) then look[key] = value
        end
      end
    end
    msg = clean_avatar_msg(hash["msg"])
    out["msg"] = msg if msg
    out.presence
  end

  def self.clean_avatar_msg(value)
    return nil unless value.is_a?(String)
    value.gsub(AVATAR_MSG_HIDDEN, " ").squish.each_char.first(AVATAR_MSG_MAX).join.presence
  end

  # 🏷️ 表示名（まち・あいさつ・キャラメイク に 出る なまえ）。みんな 自分で かえられる（キャラメイク の 画面）
  # ログインの 呼び名（name）は ログインID の 頭に 入るので かえない。表示名が 空なら 呼び名を 出す
  DISPLAY_NAME_MAX = 12
  before_validation { self.display_name = self.class.clean_display_name(display_name) }

  def self.clean_display_name(value)
    return nil unless value.is_a?(String)
    value.gsub(AVATAR_MSG_HIDDEN, " ").squish.each_char.first(DISPLAY_NAME_MAX).join.presence
  end

  def display_label
    display_name.presence || name
  end

  # 🧑‍💼 Dettyan 本人のアカウントか（育成ゲームのドット絵の Dettyan が「俺やん」と言う）
  # 呼び名（name）で決める。ふだんは dettyan。変えたいときは ENV["DETTYAN_OWNER_NAMES"] にカンマ区切りで書く
  DETTYAN_OWNER_NAMES = "dettyan"

  def dettyan_owner?
    names = ENV.fetch("DETTYAN_OWNER_NAMES", DETTYAN_OWNER_NAMES).split(",").map { |n| n.strip.downcase }.reject(&:empty?)
    names.include?(name.to_s.downcase)
  end

  # いま作業中の切り抜きの依頼（なければ nil）
  def working_clip_request
    clip_requests.working.order(:created_at).last
  end

  # 見間違えやすい文字（0 o 1 l i）は使わない
  CODE_CHARS = "abcdefghjkmnpqrstuvwxyz23456789".chars.freeze
  CODE_LENGTH = 4

  validates :name, presence: true, uniqueness: true
  # 呼び名はログインIDの頭にも入るので、英数字だけにする（記号や日本語は入れない）
  validates :name, format: { with: /\A[A-Za-z0-9]{2,20}\z/, message: "は英数字2〜20文字にしてください" }
  validates :login_digest, presence: true, uniqueness: true

  # ログインIDから、そのユーザーを探す
  def self.find_by_login_code(code)
    return nil if code.blank?
    find_by(login_digest: digest(code.to_s.strip.downcase))
  end

  # ログインIDを暗号化する（同じIDからは毎回同じ値になるので、検索に使える）
  def self.digest(code)
    OpenSSL::HMAC.hexdigest("SHA256", Rails.application.secret_key_base, code)
  end

  # 新しいログインIDを作って登録し、ID本体を返す（表示できるのはこのときだけ）
  def issue_login_code!
    loop do
      suffix = Array.new(CODE_LENGTH) { CODE_CHARS[SecureRandom.random_number(CODE_CHARS.size)] }.join
      code = "#{name.downcase}-#{suffix}"
      digest = self.class.digest(code)
      next if self.class.where.not(id: id).exists?(login_digest: digest)

      update!(login_digest: digest)
      return code
    end
  end
end
