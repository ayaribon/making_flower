require "net/http"
require "json"

# 💬 Discord のチャンネルに、ウェブフックで投稿する
# ウェブフックの URL は秘密なので、コードには書かない。環境変数 DISCORD_CLIP_WEBHOOK_URL か、
# credentials の discord.clip_webhook_url に入れる（.env はコミットしない）
class DiscordNotifier
  class Error < StandardError; end

  TIMEOUT = 10
  # 1回の投稿に入れる画像（Discord の上限より少し小さく）。多いときは分けて投稿する
  BATCH_FILES = 4
  BATCH_BYTES = 9 * 1024 * 1024
  USER_AGENT = "KotoBouquet-clip-request/1.0".freeze
  # 投稿してよい先は Discord のウェブフックだけ（ほかの所に送らないように）
  WEBHOOK_FORMAT = %r{\Ahttps://(?:(?:canary|ptb)\.)?discord(?:app)?\.com/api/webhooks/\d+/[\w-]+\z}

  def self.clip_webhook_url
    ENV["DISCORD_CLIP_WEBHOOK_URL"].presence || Rails.application.credentials.dig(:discord, :clip_webhook_url).presence
  end

  def self.configured?
    clip_webhook_url.to_s.match?(WEBHOOK_FORMAT)
  end

  def initialize(url = self.class.clip_webhook_url)
    @url = url.to_s.strip
  end

  # ✂️ 切り抜きの依頼を投稿する（images：添付する画像 [{ bytes:, filename:, content_type: }]）
  def post_clip_request(request, user:, images: [])
    post_with_images(self.class.clip_request_payload(request, user: user, image_count: images.size), images, label: "#{user.name} さんの依頼")
  end

  # 画像を4枚・9MBずつに分ける（1枚目の投稿に依頼の中身、2回目からは「つづき」）
  def self.batches(files)
    files.each_with_object([[]]) do |f, out|
      cur = out.last
      if cur.any? && (cur.size >= BATCH_FILES || cur.sum { |x| x[:bytes].bytesize } + f[:bytes].bytesize > BATCH_BYTES)
        out << [f]
      else
        cur << f
      end
    end.reject(&:empty?)
  end

  def post_with_images(payload, images, label:)
    groups = self.class.batches(images)
    post(payload, files: groups.first || [])
    groups.drop(1).each_with_index do |g, i|
      post({ username: payload[:username], allowed_mentions: { parse: [] }, content: "🖼 #{label}：画像のつづき（#{i + 2}/#{groups.size}）" }, files: g)
    end
  end

  # 🚫 キャンセル・✅ できた・🙏 お断り を知らせる
  def post_clip_status(request, user:)
    post(self.class.clip_status_payload(request, user: user))
  end

  STATUS_LOOK = {
    "canceled" => ["🚫 切り抜きの依頼がキャンセルされました", 0x8A8A9E],
    "done" => ["✅ 切り抜き動画ができました", 0x2FBF6F],
    "declined" => ["🙏 切り抜きの依頼をお断りしました", 0xE0A030]
  }.freeze

  def self.clip_status_payload(r, user:)
    title, color = STATUS_LOOK.fetch(r.status, ["切り抜きの依頼", 0x2F6FED])
    fields = [
      { name: "たのんだ人", value: "#{user.name}（ID: #{user.id}）", inline: true },
      { name: "依頼の番号", value: "##{r.id}", inline: true },
      { name: "動画のリンク", value: r.video_url.to_s.truncate(1000) }
    ]
    fields << { name: "できた動画", value: r.result_url.to_s.truncate(1000) } if r.result_url.present?
    { username: "KotoBouquet 切り抜き依頼", allowed_mentions: { parse: [] },
      embeds: [{ title: title, color: color, fields: fields, timestamp: Time.current.iso8601 }] }
  end

  # Discord に送る中身（埋め込み）。だれかを呼び出す（@everyone など）ことはしない
  def self.clip_request_payload(r, user:, image_count: 0)
    field = ->(name, value, inline = false) { value.present? ? { name: name, value: value.to_s.truncate(1000), inline: inline } : nil }
    {
      username: "KotoBouquet 切り抜き依頼",
      allowed_mentions: { parse: [] },
      embeds: [{
        title: "✂️ 切り抜き動画の依頼",
        color: 0x2F6FED,
        fields: [
          field.call("たのんだ人", "#{user.name}（ID: #{user.id}）", true),
          field.call("しめきり", r.deadline&.strftime("%Y/%m/%d") || "なし", true),
          field.call("動画のリンク", r.video_url.to_s.strip),
          field.call("切り抜きたい所", r.scenes),
          field.call("形", ClipRequest::ORIENTATIONS[r.orientation], true),
          field.call("長さ", ClipRequest::LENGTHS[r.length], true),
          field.call("字幕", ClipRequest::SUBTITLES[r.subtitles], true),
          field.call("タイトル案", r.title_idea),
          field.call("ふんいき", r.mood),
          field.call("メモ", r.note),
          field.call("📎 使っていい素材・画像", r.material_links),
          field.call("🖼 添付した画像", image_count.positive? ? "#{image_count}枚#{image_count > BATCH_FILES ? "（この投稿と、つづきの投稿についています）" : "（この投稿についています）"}" : nil)
        ].compact,
        footer: { text: "KotoBouquet ・ 自分の配信か、許可をもらったもの（たのんだ人が確認済み）" },
        timestamp: Time.current.iso8601
      }]
    }
  end

  # 📎 使っていい素材・画像を投稿する（あとから送るとき）
  def post_material_share(share, user:, images: [])
    post_with_images(self.class.material_share_payload(share, user: user, image_count: images.size), images, label: "#{user.name} さんの素材")
  end

  def self.material_share_payload(s, user:, image_count: 0)
    field = ->(name, value, inline = false) { value.present? ? { name: name, value: value.to_s.truncate(1000), inline: inline } : nil }
    {
      username: "KotoBouquet 素材",
      allowed_mentions: { parse: [] },
      embeds: [{
        title: "📎 使っていい素材・画像",
        color: 0x2FBF9F,
        fields: [
          field.call("送った人", "#{user.name}（ID: #{user.id}）"),
          field.call("リンク", s.links),
          field.call("どんな素材？", s.description),
          field.call("🖼 添付した画像", image_count.positive? ? "#{image_count}枚#{image_count > BATCH_FILES ? "（この投稿と、つづきの投稿についています）" : "（この投稿についています）"}" : nil)
        ].compact,
        footer: { text: "KotoBouquet ・ 使ってよいもの（送った人が確認済み）" },
        timestamp: Time.current.iso8601
      }]
    }
  end

  private

  # files があるときは、画像を添付して送る（multipart。サーバーには残さない）
  def post(payload, files: [])
    raise Error, "いまは送れません。管理者に知らせてください" unless @url.match?(WEBHOOK_FORMAT)

    uri = URI.parse(@url)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.open_timeout = TIMEOUT
    http.read_timeout = files.any? ? TIMEOUT * 3 : TIMEOUT
    req = Net::HTTP::Post.new(uri.request_uri, "User-Agent" => USER_AGENT)
    if files.any?
      parts = [["payload_json", payload.to_json, { content_type: "application/json" }]]
      files.each_with_index do |f, i|
        parts << ["files[#{i}]", StringIO.new(f[:bytes]), { filename: f[:filename], content_type: f[:content_type] }]
      end
      req.set_form(parts, "multipart/form-data")
    else
      req["Content-Type"] = "application/json"
      req.body = payload.to_json
    end
    res = http.request(req)
    case res
    when Net::HTTPSuccess then true
    when Net::HTTPTooManyRequests then raise Error, "いま送る数が多すぎるようです。少し待ってからもう一度送ってください"
    else
      Rails.logger.warn("[discord] 投稿できませんでした: #{res.code} #{res.body.to_s.first(200)}")
      raise Error, "送れませんでした（#{res.code}）。少し待ってからもう一度ためしてください"
    end
  rescue Timeout::Error, SocketError, SystemCallError, OpenSSL::SSL::SSLError, Net::HTTPBadResponse => e
    raise Error, "送れませんでした（#{e.class.name.demodulize}）。少し待ってからもう一度ためしてください"
  end
end
