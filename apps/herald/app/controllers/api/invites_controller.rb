module Api
  class InvitesController < BaseController
    before_action :authenticate_matrix_user, only: %i[create destroy]

    def show
      invite = InviteLink.active.find_by!(code: params[:code])
      preview = Current.matrix_client.space_preview(invite.space_mxid, as_user: invite.creator_mxid)

      render json: {
        code: invite.code,
        space_mxid: invite.space_mxid,
        expires_at: invite.expires_at,
        **preview
      }
    end

    def create
      invite = InviteLink.new(invite_params)
      if invite.save
        render json: { code: invite.code, space_mxid: invite.space_mxid, expires_at: invite.expires_at }, status: :created
      else
        render json: { errors: invite.errors.full_messages }, status: :unprocessable_entity
      end
    end

    def destroy
      invite = InviteLink.find_by!(code: params[:code])
      invite.destroy!
      head :no_content
    end

    private

    def invite_params
      params.expect(invite: [ :space_mxid, :code, :max_uses, :expires_at ])
    end
  end
end
