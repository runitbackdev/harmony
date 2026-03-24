module Api
  class RedemptionsController < BaseController
    before_action :authenticate_matrix_user

    def create
      invite = InviteLink.active.find_by!(code: params[:invite_code])

      Current.matrix_client.invite_to_room(invite.space_mxid, Current.mxid, as_user: invite.creator_mxid)
      invite.increment!(:use_count)

      render json: { space_mxid: invite.space_mxid }
    end
  end
end
