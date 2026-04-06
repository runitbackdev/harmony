module Matrix
  class BaseController < ApplicationController
    skip_forgery_protection

    before_action :verify_hs_token

    private

    def verify_hs_token
      token = request.authorization&.delete_prefix("Bearer ") || params[:access_token]
      head :unauthorized unless token == Rails.application.config.matrix[:hs_token]
    end

    def ack(status = :ok)
      render json: {}, status: status
    end
  end
end
