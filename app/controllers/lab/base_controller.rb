# 🧪 /lab の 共通の 親（本体とは べつ。docs/lab/README.md）
# ログインが いるのは 本体の ApplicationController を そのまま 受けつぐ。見た目は lab の 枠（layouts/lab.html.erb）
# 各区画は Lab::名前::BaseController < Lab::BaseController を もつ（枠を かえたい 人は そこで layout を 指定）
class Lab::BaseController < ApplicationController
  layout "lab"
end
