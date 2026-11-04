# Be sure to restart your server when you modify this file.

# Define an application-wide content security policy.
# See the Securing Rails Applications Guide for more information:
# https://guides.rubyonrails.org/security.html#content-security-policy-header

# Rails.application.configure do
#   config.content_security_policy do |policy|
#     policy.default_src :self, :https
#     policy.font_src    :self, :https, :data
#     policy.img_src     :self, :https, :data
#     policy.object_src  :none
#     policy.script_src  :self, :https
#     policy.style_src   :self, :https
#     # Specify URI for violation reports
#     # policy.report_uri "/csp-violation-report-endpoint"
#   end
#
#   # Generate session nonces for permitted importmap, inline scripts, and inline styles.
#   config.content_security_policy_nonce_generator = ->(request) { request.session.id.to_s }
#   config.content_security_policy_nonce_directives = %w(script-src style-src)
#
#   # Report violations without enforcing the policy.
#   # config.content_security_policy_report_only = true
# end

# 通信（fetch・XHR など）していい先を、自分のサーバーと AI のファイル置き場だけにする。
# AI のライブラリ（MediaPipe）が Google に送る利用ログ（odml.pa.googleapis.com）を、ブラウザで止めるため。
# 画像・フォント・スタイルなどの読み込みは、今の画面に影響が出ないように決めない。
Rails.application.configure do
  config.content_security_policy do |policy|
    sources = [:self, :blob, :data]

    # 本番は AI のファイルを S3 に置くので、そこからの読み込みを許す
    if (base = ENV["MEDIAPIPE_BASE_URL"]).present?
      uri = URI.parse(base)
      sources << "#{uri.scheme}://#{uri.host}#{":#{uri.port}" unless [80, 443].include?(uri.port)}"
    end

    policy.connect_src(*sources)
  end
end
