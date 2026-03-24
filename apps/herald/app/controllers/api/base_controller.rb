module Api
  class BaseController < ApplicationController
    skip_forgery_protection

    rescue_from ActiveRecord::RecordNotFound, with: :not_found

    private

    def not_found
      head :not_found
    end

    def authenticate_matrix_user
      token = request.authorization&.delete_prefix("Bearer ")
      return head :unauthorized if token.blank?

      Current.mxid = Current.matrix_client.whoami(token)
    rescue Faraday::ClientError
      head :unauthorized
    rescue Faraday::Error
      head :bad_gateway
    end
  end
end
