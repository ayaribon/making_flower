# 💾 ミックス設定のテンプレート（K42・11/10）。どれも「ログインしている本人のもの」だけを相手にする（ほかの人のものは見つからない扱い）
#   GET    /mix_templates       一覧（新しい順）
#   POST   /mix_templates       保存（name と data。data は JSON の文字列）
#   PATCH  /mix_templates/:id   名前を変える（name）・中身を入れかえる（data）
#   DELETE /mix_templates/:id   消す
class MixTemplatesController < ApplicationController
  def index
    list = current_user.mix_templates.order(updated_at: :desc)
    render json: { templates: list.map(&:to_api_hash) }
  end

  def create
    t = current_user.mix_templates.new(name: params[:name].to_s.strip)
    t.data = parse_data!
    t.save!
    render json: t.to_api_hash, status: :created
  rescue ActiveRecord::RecordInvalid => e
    unprocessable(e.record.errors.full_messages.join("、"))
  rescue DataError => e
    e.too_large ? too_large(e.message) : unprocessable(e.message)
  end

  def update
    t = current_user.mix_templates.find(params[:id])
    t.name = params[:name].to_s.strip if params.key?(:name)
    t.data = parse_data! if params.key?(:data)
    t.save!
    render json: t.to_api_hash
  rescue ActiveRecord::RecordInvalid => e
    unprocessable(e.record.errors.full_messages.join("、"))
  rescue DataError => e
    e.too_large ? too_large(e.message) : unprocessable(e.message)
  end

  def destroy
    current_user.mix_templates.find(params[:id]).destroy!
    head :no_content
  end

  private

  class DataError < StandardError
    attr_reader :too_large

    def initialize(message, too_large: false)
      super(message)
      @too_large = too_large
    end
  end

  def parse_data!
    raw = params.require(:data).to_s
    if raw.bytesize > MixTemplate::MAX_BYTES
      raise DataError.new("テンプレートが大きすぎます（#{MixTemplate::MAX_BYTES / 1.kilobyte}KB まで）", too_large: true)
    end
    data = JSON.parse(raw)
    raise DataError, "テンプレートの中身が読めませんでした" unless data.is_a?(Hash)
    data
  rescue JSON::ParserError
    raise DataError, "テンプレートの中身が読めませんでした"
  end

  def unprocessable(message)
    render json: { error: message }, status: :unprocessable_entity
  end

  def too_large(message)
    render json: { error: message, code: "too_large" }, status: :payload_too_large
  end
end
