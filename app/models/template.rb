class Template < ApplicationRecord
  has_one_attached :preview_image
  has_one_attached :image
end
