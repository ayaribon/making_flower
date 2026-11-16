# 🖼 ロゴ・立ち絵などの画像を、保存せずにそのまま Discord の投稿に添付する（切り抜きの依頼・素材を送る）
# サーバーには残さない。12枚まで・1枚8MB・合計30MBまで。画像だけ
# Discord は1回の投稿に入る数・大きさに上限があるので、多いときは何回かに分けて投稿する（DiscordNotifier.batches）
module ClipUploads
  MAX_FILES = 12
  MAX_EACH = 8.megabytes
  MAX_TOTAL = 30.megabytes
  TYPES = { "image/png" => "png", "image/jpeg" => "jpg", "image/webp" => "webp", "image/gif" => "gif" }.freeze

  private

  # 送られてきた画像 → [{ bytes:, filename:, content_type: }]。おかしいときは [nil, "直してほしいこと"]
  def clip_images_from(list)
    files = Array(list).select { |f| f.respond_to?(:read) && f.respond_to?(:original_filename) }
    return [[], nil] if files.empty?
    return [nil, "画像は1回に#{MAX_FILES}枚までにしてね"] if files.size > MAX_FILES

    total = 0
    out = files.each_with_index.map do |f, i|
      bytes = f.read
      total += bytes.bytesize
      return [nil, "画像は1枚#{MAX_EACH / 1.megabyte}MBまでにしてね"] if bytes.bytesize > MAX_EACH
      type = Marcel::MimeType.for(StringIO.new(bytes)) # 名前ではなく、中身で見分ける（名前だけ .png のものは通さない）
      return [nil, "送れるのは画像（PNG・JPEG・WebP・GIF）だけです"] unless TYPES.key?(type)
      { bytes: bytes, filename: "image-#{i + 1}.#{TYPES[type]}", content_type: type }
    end
    return [nil, "画像は合計#{MAX_TOTAL / 1.megabyte}MBまでにしてね"] if total > MAX_TOTAL
    [out, nil]
  end
end
