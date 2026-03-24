Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  scope "/_matrix/app/v1", module: :matrix do
    resources :transactions, only: :update, param: :txn_id
    resources :users, only: :show, param: :user_id
    resources :rooms, only: :show, param: :room_alias
    resource :ping, only: :create
  end

  namespace :api do
    resources :invites, only: %i[show create destroy], param: :code do
      resource :redemption, only: :create
    end
  end
end
