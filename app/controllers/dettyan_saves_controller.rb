# 🧑‍💼 Dettyan 育成ゲームのセーブ。1人1つだけ、ログインしている本人のもの
#   GET /dettyan_save   セーブ（なければ save: null）とサーバーの時計
#   PUT /dettyan_save   保存（data は JSON の文字列。あとから保存した方を使う）
# serverNow（ミリ秒）は、放置やモンスター退治の時間をサーバーの時計で数えるために返す
class DettyanSavesController < ApplicationController
  def show
    save = current_user.dettyan_save
    render json: {
      save: save&.data,
      updatedAt: save && (save.updated_at.to_f * 1000).to_i,
      serverNow: server_now
    }
  end

  def update
    raw = params.require(:data).to_s
    if raw.bytesize > DettyanSave::MAX_BYTES
      return render json: { error: "セーブが大きすぎます", code: "too_large" }, status: :payload_too_large
    end

    data = JSON.parse(raw)
    unless data.is_a?(Hash) && data["version"].is_a?(Integer)
      return render json: { error: "セーブの形がちがいます" }, status: :unprocessable_entity
    end

    save = current_user.dettyan_save || current_user.build_dettyan_save
    save.data = data
    save.save!
    save.touch
    render json: { updatedAt: (save.updated_at.to_f * 1000).to_i, serverNow: server_now }
  rescue JSON::ParserError
    render json: { error: "セーブが読めませんでした" }, status: :unprocessable_entity
  end

  private

  def server_now
    (Time.current.to_f * 1000).to_i
  end
end
