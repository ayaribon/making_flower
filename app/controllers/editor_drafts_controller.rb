# 💾 画像編集の下書き（K39・11/10）。1人1つだけ、ログインしている本人のもの
#   GET    /editor_draft   下書き（なければ draft: null）
#   PUT    /editor_draft   保存（data は JSON の文字列）
#   DELETE /editor_draft   消す
class EditorDraftsController < ApplicationController
  def show
    draft = current_user.editor_draft
    return render(json: { draft: nil }) unless draft

    render json: { draft: draft.data, updatedAt: (draft.updated_at.to_f * 1000).to_i }
  end

  def update
    raw = params.require(:data).to_s
    if raw.bytesize > EditorDraft::MAX_BYTES
      return render json: { error: "下書きが大きすぎます（#{EditorDraft::MAX_BYTES / 1.megabyte}MB まで）", code: "too_large" }, status: :payload_too_large
    end

    data = JSON.parse(raw)
    draft = current_user.editor_draft || current_user.build_editor_draft
    draft.data = data
    draft.save!
    draft.touch
    head :no_content
  rescue JSON::ParserError
    render json: { error: "下書きが読めませんでした" }, status: :unprocessable_entity
  end

  def destroy
    current_user.editor_draft&.destroy!
    head :no_content
  end
end
