require "net/http"
require "json"

# 💬 Discord のチャンネルに、ウェブフックで投稿する
# ウェブフックの URL は秘密なので、コードには書かない。環境変数 DISCORD_CLIP_WEBHOOK_URL か、
# credentials の discord.clip_webhook_url に入れる（.env はコミットしない）
class DiscordNotifier
  class Error < StandardError; end

  TIMEOUT = 10
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

  # ✂️ 切り抜きの依頼を投稿する
  def post_clip_request(request, user:)
    post(self.class.clip_request_payload(request, user: user))
  end

  # Discord に送る中身（埋め込み）。だれかを呼び出す（@everyone など）ことはしない
  def self.clip_request_payload(r, user:)
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
          field.call("メモ", r.note)
        ].compact,
        footer: { text: "KotoBouquet ・ 自分の配信か、許可をもらったもの（たのんだ人が確認済み）" },
        timestamp: Time.current.iso8601
      }]
    }
  end

  private

  def post(payload)
    raise Error, "送り先（Discord）がまだ設定されていません。管理者に知らせてください" unless @url.match?(WEBHOOK_FORMAT)

    uri = URI.parse(@url)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.open_timeout = TIMEOUT
    http.read_timeout = TIMEOUT
    req = Net::HTTP::Post.new(uri.request_uri, "Content-Type" => "application/json", "User-Agent" => USER_AGENT)
    req.body = payload.to_json
    res = http.request(req)
    case res
    when Net::HTTPSuccess then true
    when Net::HTTPTooManyRequests then raise Error, "いま送る数が多すぎるようです。少し待ってからもう一度送ってください"
    else
      Rails.logger.warn("[discord] 投稿できませんでした: #{res.code} #{res.body.to_s.first(200)}")
      raise Error, "送れませんでした（#{res.code}）。少し待ってからもう一度ためしてください"
    end
  rescue Timeout::Error, SocketError, SystemCallError, OpenSSL::SSL::SSLError, Net::HTTPBadResponse => e
    raise Error, "Discord につながりませんでした（#{e.class.name.demodulize}）。少し待ってからもう一度ためしてください"
  end
end
