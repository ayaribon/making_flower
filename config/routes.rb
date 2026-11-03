Rails.application.routes.draw do
  root "editors#show"
  resources :templates, only: [:index, :show] do
    get :edit, on: :member
  end
  get "editor", to: "editors#show"
  get "up" => "rails/health#show", as: :rails_health_check
end
