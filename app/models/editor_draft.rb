# 💾 画像編集の下書き（K39）。1人1つだけ。中身は画像編集の「戻す」用の状態（canvas の JSON と比率）
class EditorDraft < ApplicationRecord
  MAX_BYTES = 30.megabytes

  belongs_to :user
end
