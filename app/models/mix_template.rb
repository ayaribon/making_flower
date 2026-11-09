# 💾 ミックス設定のテンプレート（K42）。中身は④ミックスの設定だけ（曲ごとのものは入れない）
class MixTemplate < ApplicationRecord
  MAX_PER_USER = 50
  MAX_BYTES = 200.kilobytes

  belongs_to :user

  validates :name, presence: true, length: { maximum: 40 }
  validate :within_limit, on: :create

  def to_api_hash
    {
      id: id,
      name: name,
      data: data || {},
      updatedAt: (updated_at.to_f * 1000).to_i
    }
  end

  private

  def within_limit
    return unless user
    errors.add(:base, "ミックスのテンプレートは#{MAX_PER_USER}個までです") if user.mix_templates.count >= MAX_PER_USER
  end
end
