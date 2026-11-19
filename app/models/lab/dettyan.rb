# 🧪 区画「dettyan」の モデルの 名前空間。テーブルは かならず lab_dettyan_〇〇（本体の テーブルと まざらない ように）
#   例：app/models/lab/dettyan/memo.rb に class Lab::Dettyan::Memo < ApplicationRecord を 書くと、テーブルは lab_dettyan_memos
module Lab
  module Dettyan
    def self.table_name_prefix
      "lab_dettyan_"
    end
  end
end
