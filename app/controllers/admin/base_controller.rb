# 管理画面の共通の親。管理者（admin）だけが通れる
class Admin::BaseController < ApplicationController
  before_action :require_admin
  layout "admin"
end
