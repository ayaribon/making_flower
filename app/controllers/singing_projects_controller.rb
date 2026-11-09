# 💾 歌ってみたのプロジェクト（K39・11/10）。どれも「ログインしている本人のもの」だけを相手にする（ほかの人のものは見つからない扱い）
# ブラウザ（app/javascript/project_server.js）から JSON で呼ぶ。:id はブラウザが作るプロジェクトID（uid）
#   GET    /singing_projects            一覧
#   GET    /singing_projects/:id        中身（設定＋ファイルの URL）
#   PUT    /singing_projects/:id        保存（なければ作る）。data は JSON の文字列
#   POST   /singing_projects/:id/files  音などのファイルを1つ入れる（同じ key は入れ替え）
#   POST   /singing_projects/:id/prune  使っていないファイルを消す（keep_json に残す key の一覧）
#   DELETE /singing_projects/:id        消す
class SingingProjectsController < ApplicationController
  rescue_from ActiveRecord::RecordNotFound do
    render json: { error: "プロジェクトが見つかりません" }, status: :not_found
  end

  def index
    list = current_user.singing_projects.order(updated_at: :desc)
    render json: { projects: list.map(&:to_list_hash) }
  end

  def show
    project = find_project!
    d = project.data || {}
    render json: project.to_list_hash.merge(
      state: d["state"],
      audioKeys: d["audioKeys"] || [],
      audioSeq: d["audioSeq"] || 1,
      files: project.files_by_key.transform_values { |f| rails_storage_proxy_path(f) }
    )
  end

  def update
    raw = params.require(:data).to_s
    return too_large("設定・歌詞などのデータ", SingingProject::MAX_DATA_BYTES) if raw.bytesize > SingingProject::MAX_DATA_BYTES

    data = JSON.parse(raw)
    return unprocessable("保存するデータの形がおかしいです") unless data.is_a?(Hash)

    project = project_for_write
    name = params[:name].to_s.strip
    project.name = name.present? ? name[0, 200] : (project.name.presence || "歌ってみた")
    project.data = data
    project.save!
    project.touch
    render json: project.to_list_hash
  rescue JSON::ParserError
    unprocessable("保存するデータが読めませんでした")
  rescue ActiveRecord::RecordInvalid => e
    unprocessable(e.record.errors.full_messages.join("、"))
  end

  def upload_file
    key = params.require(:key).to_s
    return unprocessable("ファイルの key がおかしいです") unless SingingProject.valid_key?(key)

    upload = params.require(:file)
    size = upload.size.to_i
    project = project_for_write
    project.save! if project.new_record?
    if project.files_bytes(except_key: key) + size > SingingProject::MAX_BYTES
      return too_large("1つのプロジェクト", SingingProject::MAX_BYTES)
    end

    old = project.file_for(key)
    project.files.attach(
      io: upload.respond_to?(:tempfile) ? upload.tempfile : upload,
      filename: SingingProject.filename_for(key),
      content_type: "application/octet-stream"
    )
    old&.purge # 入れ替えた古いファイルを消す（S3 からも）
    project.recalc_size!
    project.touch
    render json: { key: key, bytes: size, total: project.reload.size_bytes }
  rescue ActiveRecord::RecordInvalid => e
    unprocessable(e.record.errors.full_messages.join("、"))
  end

  def prune
    project = find_project!
    keep = JSON.parse(params.require(:keep_json).to_s)
    return unprocessable("残すファイルの一覧がおかしいです") unless keep.is_a?(Array)

    keep = keep.map(&:to_s).to_set
    project.files.each { |f| f.purge unless keep.include?(SingingProject.key_for(f.filename)) }
    project.recalc_size!
    render json: { bytes: project.reload.size_bytes }
  rescue JSON::ParserError
    unprocessable("残すファイルの一覧が読めませんでした")
  end

  def destroy
    find_project!.destroy! # ファイルは has_many_attached が後で消す（S3 からも）
    head :no_content
  end

  private

  def find_project!
    current_user.singing_projects.find_by!(uid: params[:id].to_s)
  end

  def project_for_write
    uid = params[:id].to_s
    raise ActiveRecord::RecordNotFound unless SingingProject::UID_FORMAT.match?(uid)

    current_user.singing_projects.find_or_initialize_by(uid: uid)
  end

  def too_large(what, limit)
    render json: { error: "#{what}で保存できるのは #{limit / 1.megabyte}MB までです", code: "too_large" }, status: :payload_too_large
  end

  def unprocessable(message)
    render json: { error: message }, status: :unprocessable_entity
  end
end
