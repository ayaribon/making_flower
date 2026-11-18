# 🙏 クレジット（使っている 素材の 作者）。ライセンスで クレジットが 必要（docs/town/requirements.md の 4.5）
#   GET /credits   ログインしていなくても 見られる
class CreditsController < ApplicationController
  skip_before_action :require_login

  def show
  end
end
