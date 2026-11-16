# 🧑‍💼 Dettyan 育成ゲームのセーブ（1人1つ）。中身は JSON（version 入り）。読み書きの決まりは docs/dettyan/requirements.md の7章
class DettyanSave < ApplicationRecord
  MAX_BYTES = 64.kilobytes

  belongs_to :user
end
