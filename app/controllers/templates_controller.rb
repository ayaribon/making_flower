class TemplatesController < ApplicationController
  def index
    @templates = Template.order(:position, :id)
  end

  def show
    @template = Template.find(params[:id])
  end

  def edit
    @template = Template.find(params[:id])
  end
end
