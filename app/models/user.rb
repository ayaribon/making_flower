require "openssl"
require "securerandom"

# ログインは「ログインID」だけ。パスワードやメールアドレスは持たない。
# ログインIDは「呼び名-ランダム4文字」（例：dettyan-k7qm）。
# データベースには暗号化した値（login_digest）だけを残すので、あとから運営者でも元のIDは見られない。
class User < ApplicationRecord
  # ユーザーを消したら、その人の画像（S3のファイルも）一緒に消す
  has_many :user_images, dependent: :destroy

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
